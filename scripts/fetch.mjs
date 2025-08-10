
import fs from "fs/promises";
import path from "path";
import Parser from "rss-parser";
import OpenAI from "openai";

const FEEDS_PATH = new URL("./feeds.json", import.meta.url);
const OUTPUT_PATH = path.resolve(process.cwd(), "news.json");
const DAYS_BACK = parseInt(process.env.DAYS_BACK || "14", 10);
const MAX_ITEMS_PER_FEED = parseInt(process.env.MAX_ITEMS_PER_FEED || "30", 10);
const SUMMARIZE_LIMIT = parseInt(process.env.SUMMARIZE_LIMIT || "60", 10); // Max items to summarize to control cost
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // small + cheap by default

const parser = new Parser({
  customFields: {
    item: ["summary", "contentSnippet", "isoDate"]
  }
});

// Map hostnames to tags for secondary filters (Visa/Mastercard, regulators, etc.)
const SOURCE_TAGS = [
  // Canada
  // Canada regulators
  { host: "osfi-bsif.gc.ca",         tags: ["Canada","OSFI","Regulator"] },
  { host: "priv.gc.ca",              tags: ["Canada","PIPEDA","OPC","Regulator"] },
  { host: "lautorite.qc.ca",         tags: ["Canada","AMF","Regulator"] },
  { host: "rcmp-grc.gc.ca",          tags: ["Canada","RCMP"] },
  { host: "cdic.ca",                 tags: ["Canada","CDIC","Regulator"] },
  { host: "canada.ca",               tags: ["Canada","CRA","FCAC"] }, // generic host used by CRA/FCAC
  { host: "ised-isde.canada.ca",     tags: ["Canada","CASL"] },
  // (keep your existing FINTRAC, etc.)

  // UK / HK / EU / AU / SG / US
  { host: "fca.org.uk",               tags: ["UK","FCA","Regulator"] },
  { host: "hkma.gov.hk",              tags: ["Hong Kong","HKMA","Regulator"] },
  { host: "eba.europa.eu",            tags: ["EU","EBA","Regulator"] },
  { host: "austrac.gov.au",           tags: ["Australia","AUSTRAC","Regulator"] },
  { host: "rba.gov.au",               tags: ["Australia","RBA","Central Bank"] },
  { host: "mas.gov.sg",               tags: ["Singapore","MAS","Regulator"] },
  { host: "sec.gov",                  tags: ["US","SEC","Regulator"] },
  { host: "fincen.gov",               tags: ["US","FinCEN","Regulator"] },
  { host: "federalreserve.gov",       tags: ["US","Federal Reserve","Central Bank"] },
  // Card networks
  { host: "visa.com",                 tags: ["Visa"] },
  { host: "mastercard.com",           tags: ["Mastercard"] },
];

function hostname(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function applyTags(items) {
  return items.map(it => {
    const h = hostname(it.link);
    let tags = [];

    // 1) Host-based tagging (what you already had)
    for (const rule of SOURCE_TAGS) {
      if (h.endsWith(rule.host)) tags = tags.concat(rule.tags);
    }

    // 2) Title-based tagging for card networks on wires
    const t = (it.title || "").toLowerCase();
    if (t.includes("mastercard")) tags.push("Mastercard");
    if (t.includes("visa "))       tags.push("Visa");

    // 3) NEW: Source-name fallback (helps when host is generic like canada.ca)
    const s = (it.source || "").toLowerCase();
    if (s.includes("financial consumer agency")) tags.push("FCAC", "Canada");
    if (s.includes("canada revenue"))            tags.push("CRA", "Canada");
    if (s.includes("office of the privacy"))     tags.push("PIPEDA", "OPC", "Canada");
    if (s.includes("office of the superintendent of financial institutions")) tags.push("OSFI", "Canada");
    if (s.includes("autorité des marchés financiers") || s.includes("autorite des marches financiers")) tags.push("AMF", "Canada");
    if (s.includes("royal canadian mounted police") || s.includes("rcmp")) tags.push("RCMP", "Canada");
    if (s.includes("canada deposit insurance"))  tags.push("CDIC", "Canada");
    if (s.includes("canadian anti-spam legislation") || s.includes("casl")) tags.push("CASL", "Canada");

    // 4) De-dup and attach
    it.tags = Array.from(new Set(tags));
    return it;
  });
}



function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = it.link || it.guid || it.title;
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toISO(dateStr) {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return null;
}

function withinDays(dateISO, days) {
  if (!dateISO) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(dateISO).getTime() >= cutoff;
}

async function fetchFeed(region, url) {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).slice(0, MAX_ITEMS_PER_FEED).map(item => ({
      title: item.title?.trim() || "(no title)",
      link: item.link,
      source: feed.title || new URL(url).hostname,
      publishedAt: toISO(item.isoDate || item.pubDate) || null,
      region,
      rawSnippet: (item.contentSnippet || item.summary || "").replace(/\s+/g, " ").trim()
    }));
  } catch (err) {
    console.error("Feed error", region, url, err.message);
    return [];
  }
}

async function summarizeIfPossible(items) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No API key; produce a light fallback summary
    return items.map(x => ({
      ...x,
      summary: x.rawSnippet ? x.rawSnippet.slice(0, 220) : "Summary unavailable. Open article for details."
    }));
  }
  const openai = new OpenAI({ apiKey });

  const itemsToSummarize = items.slice(0, SUMMARIZE_LIMIT);
  const rest = items.slice(SUMMARIZE_LIMIT);

  const summarized = await Promise.all(itemsToSummarize.map(async (it) => {
    const prompt = `You are a compliance analyst. Summarize the following headline and snippet in 2 concise bullets for an AML/compliance audience. 
Keep it neutral, plain English, max 45 words total. No emojis. Provide regulatory names and actions if present.
Headline: ${it.title}
Snippet: ${it.rawSnippet || "(no snippet)"} 
Output format:
- bullet 1
- bullet 2`;

    try {
      const resp = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 120
      });
      const text = resp.choices?.[0]?.message?.content?.trim() || "";
      return { ...it, summary: text };
    } catch (e) {
      console.error("OpenAI error for", it.link, e.message);
      return { ...it, summary: it.rawSnippet?.slice(0, 220) || "Summary unavailable." };
    }
  }));

  // For the remaining items, just attach raw snippet
  const passthrough = rest.map(it => ({
    ...it,
    summary: it.rawSnippet?.slice(0, 220) || "Summary unavailable."
  }));

  return summarized.concat(passthrough);
}

async function main() {
  const feeds = JSON.parse(await fs.readFile(FEEDS_PATH, "utf-8"));
  let all = [];
  for (const [region, urls] of Object.entries(feeds)) {
    for (const url of urls) {
      const items = await fetchFeed(region, url);
      all = all.concat(items);
    }
  }

  // Filter, dedupe, sort
  all = dedupe(all)
    .filter(x => x.publishedAt && withinDays(x.publishedAt, DAYS_BACK))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // Summarize (optional)
  all = await summarizeIfPossible(all);
  
  // Tag items for secondary filters (Visa/Mastercard, regulators, etc.)
  all = applyTags(all);
  
  // Clean and save
  const cleaned = all.map(({rawSnippet, ...rest}) => rest);


  const payload = {
    generatedAt: new Date().toISOString(),
    items: cleaned
  };
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`Wrote ${cleaned.length} items to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
