
# Compliance News Radar

A zero-backend, GitHub Pages site that auto-grabs major **compliance / AML** news from regulator RSS feeds.
Summaries are generated with OpenAI (optional). Data refresh runs via GitHub Actions (hourly by default).

## What you get
- **Static site**: `index.html`, `styles.css`, `script.js` (no build step).
- **Auto data updates**: `.github/workflows/fetch-news.yml` runs `scripts/fetch.mjs`.
- **Feeds**: curated in `scripts/feeds.json` for Canada, UK, Hong Kong, EU, Australia.
- **Output**: `news.json` committed to the repo, read by the site.

## Quick start

1) Create a new GitHub repo (Public is fine for GitHub Pages Free).
2) Download this folder and upload all files into your repo root.
3) Enable **Pages**: Repo → Settings → Pages → Source = `Deploy from a branch`, Branch = `main` (root).
4) (Optional) Add secret for summaries: Repo → Settings → Secrets → Actions → `OPENAI_API_KEY`.
5) Trigger the workflow manually: **Actions** → **Fetch Compliance News** → **Run workflow**. Or wait for the next hourly run.
6) Visit your site: `https://<your-username>.github.io/<repo-name>/`.

### Local test (optional)
You can open `index.html` directly in a browser. The page loads `news.json` stored alongside it.

## Customize feeds
Edit `scripts/feeds.json` to add or remove RSS feeds (one per line). Re-run the workflow.

## Costs
If you set `OPENAI_API_KEY`, short summaries are generated using a cost-effective model by default (`gpt-4o-mini`).
You can change the model via the `OPENAI_MODEL` env in the workflow.

