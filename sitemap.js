import { XMLParser, XMLValidator } from 'fast-xml-parser';
const parser = new XMLParser({ removeNSPrefix: true, trimValues: true });
export function webUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP or HTTPS URL without credentials.');
  return url.href;
}
export function parseSitemap(xml) {
  if (XMLValidator.validate(xml) !== true) throw new Error('The file is not valid XML.');
  const data = parser.parse(xml);
  const list = value => value ? (Array.isArray(value) ? value : [value]) : [];
  if (data.urlset) return { type: 'pages', urls: list(data.urlset.url).map(item => webUrl(item.loc)) };
  if (data.sitemapindex) return { type: 'index', urls: list(data.sitemapindex.sitemap).map(item => webUrl(item.loc)) };
  throw new Error('Expected a sitemap containing urlset or sitemapindex.');
}
export async function collectSitemap({ url, xml }, fetchXml, limits = { maps: 50, pages: 5000 }) {
  const visited = new Set(), pages = new Set();
  async function visit(source, content) {
    if (source && visited.has(source)) return;
    if (visited.size >= limits.maps) throw new Error(`Sitemap exceeds ${limits.maps} files.`);
    visited.add(source || 'uploaded');
    const parsed = parseSitemap(content ?? await fetchXml(source));
    if (parsed.type === 'pages') for (const page of parsed.urls) { pages.add(page); if (pages.size > limits.pages) throw new Error(`Sitemap exceeds ${limits.pages} pages.`); }
    else for (const child of parsed.urls) await visit(child);
  }
  await visit(url ? webUrl(url) : undefined, xml);
  return [...pages];
}
