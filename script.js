const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const filters = document.getElementById('filters');
const searchEl = document.getElementById('search');
const meta = document.getElementById('meta');
const tagFilters = document.getElementById('tagFilters');

const TAGS_BY_REGION = {
  Canada: ["All", "OSFI", "PIPEDA", "AMF", "RCMP", "CRA", "CDIC", "CASL", "FCAC"],
  // Add other region-specific tags if needed (e.g., UK: ["All","FCA","OFSI"])
};

let DATA = { generatedAt: null, items: [] };
let state = { region: 'All', query: '', tag: 'All' };

/* ------------ Utilities ------------ */
function fmtDate(iso) {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleString();
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[m]));
}
/* ----------------------------------- */

/* -------- Tag pill helpers --------- */
function collectTagsForRegion(region) {
  const pool = DATA.items.filter(it => region === 'All' || it.region === region);
  const tags = new Set();
  for (const it of pool) (it.tags || []).forEach(t => tags.add(t));
  return Array.from(tags).sort();
}

function renderTagPills() {
  if (!tagFilters) return;
  const preferred = TAGS_BY_REGION[state.region];
  // If we have a preferred list (e.g., Canada regulators), use it; otherwise derive from DATA
  const tags = (preferred && preferred.length) ? preferred : ['All', ...collectTagsForRegion(state.region)];

  tagFilters.innerHTML = tags.map(t =>
    `<button data-tag="${t}" class="pill ${state.tag === t ? 'active' : ''}">${t}</button>`
  ).join('');
}
/* ----------------------------------- */

/* --------------- Render --------------- */
function render() {
  const q = state.query.trim().toLowerCase();

  const items = DATA.items.filter(it => {
    const regionOk = state.region === 'All' || it.region === state.region;

    // When using a fixed list (e.g., Canada regulators), allow source-text fallback too
    const usingFixed = !!TAGS_BY_REGION[state.region];
    const tagOk = state.tag === 'All' || (
      usingFixed
        ? ((it.tags || []).includes(state.tag) ||
           (it.source || '').toLowerCase().includes(state.tag.toLowerCase()))
        : (it.tags || []).includes(state.tag)
    );

    const qOk = !q || (it.title.toLowerCase().includes(q) || (it.summary || '').toLowerCase().includes(q));
    return regionOk && tagOk && qOk;
  });

  grid.innerHTML = items.map(it => `
      <article class="card">
        <div class="badge"><span class="dot"></span> ${it.region} • ${escapeHtml(it.source || '')}</div>
        <h2 class="title"><a href="${it.link}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></h2>
        <div class="summary">${escapeHtml(it.summary || '')}</div>
        <div class="meta"><span>${new Date(it.publishedAt).toLocaleDateString()}</span><span>${fmtDate(it.publishedAt)}</span></div>
      </article>
  `).join('');

  empty.classList.toggle('hidden', items.length > 0);
}
/* -------------------------------------- */

/* ---------------- Init ---------------- */
async function init() {
  try {
    const res = await fetch('news.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load news.json');
    DATA = await res.json();
    meta.innerHTML = `<small>Last updated: ${new Date(DATA.generatedAt).toLocaleString()}</small>`;
  } catch (e) {
    console.error(e);
    meta.innerHTML = `<small>Could not load news. Make sure GitHub Action has run.</small>`;
  }
  renderTagPills(); // build tag row for initial region
  render();
}
/* -------------------------------------- */

/* --------------- Events --------------- */
filters.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-region]');
  if (!btn) return;

  document.querySelectorAll('#filters .pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  state.region = btn.dataset.region;
  state.tag = 'All';      // reset tag when region changes
  renderTagPills();       // rebuild tags for the selected region
  render();
});

if (tagFilters) {
  tagFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tag]');
    if (!btn) return;

    document.querySelectorAll('#tagFilters .pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    state.tag = btn.dataset.tag;
    render();
  });
}

searchEl.addEventListener('input', (e) => {
  state.query = e.target.value || '';
  render();
});
/* -------------------------------------- */

init();
