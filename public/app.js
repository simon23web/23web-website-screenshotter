const $ = id => document.getElementById(id);
let mode = 'single', pages = [], selected = new Set(), busy = false, job;
const message = text => { $('message').textContent = text; $('message').hidden = !text; };
async function api(url, body) {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
}
function normalize(value) { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(`Invalid URL: ${value}`); return url.href; }
function updateCount() { $('selected-count').textContent = `${selected.size} selected`; $('capture').disabled = busy || !selected.size || selected.size > 200; const visible = filtered(); $('select-all').checked = visible.length > 0 && visible.every(url => selected.has(url)); $('select-all').indeterminate = visible.some(url => selected.has(url)) && !visible.every(url => selected.has(url)); }
function filtered() { return pages.filter(url => url.toLowerCase().includes($('filter').value.toLowerCase())); }
function renderPages() {
  $('page-picker').hidden = !pages.length; $('page-count').textContent = pages.length; $('pages').replaceChildren();
  for (const url of filtered()) { const label = document.createElement('label'); label.className = 'page-row'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(url); check.addEventListener('change', () => { check.checked ? selected.add(url) : selected.delete(url); updateCount(); }); const text = document.createElement('span'); text.textContent = url; label.append(check, text); $('pages').append(label); }
  updateCount();
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach(tab => { tab.classList.toggle('selected', tab === button); tab.setAttribute('aria-selected', String(tab === button)); }); for (const name of ['single', 'sitemap', 'list']) $(`${name}-input`).hidden = name !== mode; message(''); }));
$('sitemap-file').addEventListener('change', () => { $('sitemap-file-name').textContent = $('sitemap-file').files[0]?.name || ''; if ($('sitemap-file').files.length) $('sitemap-url').value = ''; });
$('sitemap-url').addEventListener('input', () => { $('sitemap-file').value = ''; $('sitemap-file-name').textContent = ''; });
$('list-file').addEventListener('change', async () => { const file = $('list-file').files[0]; if (file) { if (file.size > 10 * 1024 * 1024) return message('Text file exceeds 10 MB.'); $('url-list').value = await file.text(); } });
$('source-form').addEventListener('submit', async event => {
  event.preventDefault(); message(''); $('load-pages').disabled = true;
  try {
    let urls;
    if (mode === 'single') urls = [normalize($('single-url').value.trim())];
    if (mode === 'list') { const lines = $('url-list').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean); if (!lines.length) throw new Error('Enter at least one URL.'); urls = lines.map(normalize); }
    if (mode === 'sitemap') { const file = $('sitemap-file').files[0]; if (file?.size > 10 * 1024 * 1024) throw new Error('Sitemap exceeds 10 MB.'); const data = await api('/api/sitemap', file ? { xml: await file.text() } : { url: $('sitemap-url').value.trim() }); urls = data.urls; }
    if (!urls.length) throw new Error('No page URLs found.');
    pages = [...new Set([...pages, ...urls])]; for (const url of urls) if (selected.size < 200) selected.add(url); renderPages();
    if (pages.length > 200) message('Pages loaded. Select up to 200 pages for each capture batch.');
  } catch (error) { message(error.message); } finally { $('load-pages').disabled = false; }
});
$('filter').addEventListener('input', renderPages);
$('select-all').addEventListener('change', () => { for (const url of filtered()) $('select-all').checked ? selected.add(url) : selected.delete(url); renderPages(); });
$('clear-pages').addEventListener('click', () => { pages = []; selected.clear(); renderPages(); });
$('preset').addEventListener('change', () => { if ($('preset').value !== 'custom') { const [width, height] = $('preset').value.split(','); $('width').value = width; $('height').value = height; } });
for (const name of ['width', 'height']) $(name).addEventListener('input', () => { $('preset').value = 'custom'; });
function renderJob() {
  const complete = job.items.filter(item => item.status === 'complete').length;
  const done = job.items.filter(item => ['complete', 'failed'].includes(item.status)).length;
  $('result-count').textContent = complete; $('progress').hidden = false; $('progress-text').textContent = job.status === 'running' ? 'Rendering your pages…' : `Capture finished · ${complete} saved, ${done - complete} failed`; $('progress-count').textContent = `${done} / ${job.items.length}`; $('progress-fill').style.width = `${done / job.items.length * 100}%`;
  $('download-all').hidden = !complete; $('download-all').href = `/api/jobs/${job.id}/download`;
  $('results').replaceChildren();
  for (const item of job.items) {
    const card = document.createElement('article'); card.className = 'card';
    if (item.image) { const link = document.createElement('a'); link.className = 'thumbnail'; link.href = item.image; link.target = '_blank'; link.rel = 'noopener'; const image = document.createElement('img'); image.src = item.image; image.alt = `Screenshot of ${item.url}`; image.loading = 'lazy'; link.append(image); card.append(link); }
    else { const status = document.createElement('div'); status.className = `status ${item.status === 'failed' ? 'failed' : ''}`; status.textContent = item.status === 'rendering' ? 'Rendering…' : item.status === 'failed' ? 'Capture failed' : 'In the queue'; card.append(status); }
    const info = document.createElement('div'); info.className = 'card-info'; const title = document.createElement('strong'); title.textContent = item.title || new URL(item.url).hostname; const description = document.createElement('p'); description.textContent = item.error || item.url; info.append(title, description);
    if (item.image) { const link = document.createElement('a'); link.href = item.image; link.download = item.filename; link.textContent = '↓ Download image'; info.append(link); } card.append(info); $('results').append(card);
  }
}
$('capture').addEventListener('click', async () => {
  busy = true; updateCount(); message('');
  try {
    job = await api('/api/jobs', { urls: [...selected], width: Number($('width').value), height: Number($('height').value), format: $('format').value, delay: Number($('delay').value) }); renderJob();
    while (job.status === 'running') { await new Promise(resolve => setTimeout(resolve, 1200)); job = await api(`/api/jobs/${job.id}`); renderJob(); }
    if (job.error) message(job.error);
  } catch (error) { message(error.message); } finally { busy = false; updateCount(); }
});
