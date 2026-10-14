import express from 'express';
import { chromium } from 'playwright';
import archiver from 'archiver';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSitemap, webUrl } from './sitemap.js';
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.env.CAPTURE_DIR || path.join(root, 'captures'));
await mkdir(output, { recursive: true });
const app = express(), jobs = new Map();
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(root, 'public')));
app.use('/captures', express.static(output));
app.post('/api/sitemap', async (req, res) => {
  try {
    if (!req.body.url && !req.body.xml) throw new Error('Provide a sitemap URL or XML file.');
    const urls = await collectSitemap(req.body, async url => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Sitemap returned HTTP ${response.status}.`);
      const reader = response.body.getReader(); let size = 0; const chunks = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new Error('Sitemap exceeds 10 MB.'); } chunks.push(Buffer.from(value)); }
      return Buffer.concat(chunks).toString('utf8');
    });
    res.json({ urls });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
let active = false;
app.post('/api/jobs', async (req, res) => {
  try {
    if (active) return res.status(409).json({ error: 'A capture is already running. Wait for it to finish.' });
    const { urls, width = 1440, height = 900, delay = 1500, format = 'png' } = req.body;
    if (!Array.isArray(urls) || !urls.length || urls.length > 200) throw new Error('Select between 1 and 200 pages.');
    if (!Number.isInteger(width) || width < 320 || width > 3840 || !Number.isInteger(height) || height < 320 || height > 2160) throw new Error('Invalid viewport dimensions.');
    if (!Number.isInteger(delay) || delay < 0 || delay > 10000 || !['png', 'jpeg'].includes(format)) throw new Error('Invalid capture settings.');
    const pages = [...new Set(urls.map(webUrl))];
    const job = { id: randomUUID(), status: 'running', items: pages.map(url => ({ url, status: 'queued' })), createdAt: new Date().toISOString() };
    jobs.set(job.id, job); active = true;
    res.json(job);
    run(job, { width, height, delay, format }).finally(() => { active = false; });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
async function run(job, settings) {
  let browser;
  try {
    await mkdir(path.join(output, job.id));
    browser = await chromium.launch({ headless: true });
    for (const [index, item] of job.items.entries()) {
      item.status = 'rendering'; let context;
      try {
        context = await browser.newContext({ viewport: { width: settings.width, height: settings.height }, deviceScaleFactor: 1 });
        const page = await context.newPage(); page.setDefaultTimeout(30000);
        const response = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (response && response.status() >= 400) throw new Error(`Page returned HTTP ${response.status()}.`);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.evaluate(async () => {
          for (let step = 0; step < 60; step++) { window.scrollBy(0, window.innerHeight); await new Promise(r => setTimeout(r, 100)); if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight) break; }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(settings.delay);
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]));
        const url = new URL(item.url);
        const slug = `${url.hostname}${url.pathname}`.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 100);
        item.filename = `${String(index + 1).padStart(3, '0')}-${slug}.${settings.format === 'jpeg' ? 'jpg' : 'png'}`;
        await page.screenshot({ path: path.join(output, job.id, item.filename), fullPage: true, type: settings.format, animations: 'disabled', ...(settings.format === 'jpeg' ? { quality: 90 } : {}) });
        item.image = `/captures/${job.id}/${item.filename}`; item.title = await page.title(); item.status = 'complete';
      } catch (error) { item.status = 'failed'; item.error = error.message; }
      finally { await context?.close(); }
    }
    job.status = 'complete';
  } catch (error) { job.status = 'failed'; job.error = error.message; for (const item of job.items) if (item.status === 'queued' || item.status === 'rendering') { item.status = 'failed'; item.error = error.message; } }
  finally { await browser?.close(); }
}
app.get('/api/jobs/:id', (req, res) => { const job = jobs.get(req.params.id); job ? res.json(job) : res.status(404).json({ error: 'Capture not found.' }); });
app.get('/api/jobs/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Capture not found.' });
  const files = job.items.filter(item => item.status === 'complete');
  if (!files.length) return res.status(400).json({ error: 'No screenshots available.' });
  res.attachment(`screenshots-${job.id.slice(0, 8)}.zip`);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', () => res.destroy()); archive.pipe(res);
  for (const item of files) archive.file(path.join(output, job.id, item.filename), { name: item.filename });
  archive.append(JSON.stringify(job, null, 2), { name: 'manifest.json' }); archive.finalize();
});
app.use((error, req, res, next) => res.status(400).json({ error: error.message }));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log(`23Web Screenshotter listening on ${host}:${port}`));
server.on('error', error => { console.error(error.message); process.exit(1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
});
