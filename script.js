
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const filters = document.getElementById('filters');
const searchEl = document.getElementById('search');
const meta = document.getElementById('meta');

let DATA = { generatedAt: null, items: [] };
let state = { region: 'All', query: '' };

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

function render() {
  const q = state.query.trim().toLowerCase();
  const items = DATA.items.filter(it => {
    const regionOk = state.region === 'All' || it.region === state.region;
    const qOk = !q || (it.title.toLowerCase().includes(q) || (it.summary||'').toLowerCase().includes(q));
    return regionOk && qOk;
  });

  grid.innerHTML = items.map(it => {
    return `
      <article class="card">
        <div class="badge"><span class="dot"></span> ${it.region} • ${it.source || ''}</div>
        <h2 class="title"><a href="${it.link}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></h2>
        <div class="summary">${escapeHtml(it.summary || '')}</div>
        <div class="meta"><span>${new Date(it.publishedAt).toLocaleDateString()}</span><span>${fmtDate(it.publishedAt)}</span></div>
      </article>
    `;
  }).join('');

  empty.classList.toggle('hidden', items.length > 0);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[m]));
}

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
  render();
}

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-region]');
  if (!btn) return;
  document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.region = btn.dataset.region;
  render();
});

searchEl.addEventListener('input', (e) => {
  state.query = e.target.value || '';
  render();
});

init();
