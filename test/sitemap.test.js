import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSitemap, collectSitemap, webUrl } from '../sitemap.js';
test('parses namespaced urlsets and deduplicates nested indexes', async () => {
 const maps = { 'https://example.com/a.xml': '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a?x=1&amp;y=2</loc></url></urlset>', 'https://example.com/b.xml': '<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap></sitemapindex>' };
 const result = await collectSitemap({ xml: '<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap><sitemap><loc>https://example.com/b.xml</loc></sitemap></sitemapindex>' }, async url => maps[url]);
 assert.deepEqual(result, ['https://example.com/a?x=1&y=2']);
 assert.equal(parseSitemap('<sm:urlset xmlns:sm="urn:test"><sm:url><sm:loc>https://example.com</sm:loc></sm:url></sm:urlset>').urls[0], 'https://example.com/');
});
test('rejects malformed XML, unsupported documents, and non-web URLs', () => {
 assert.throws(() => parseSitemap('<urlset>'));
 assert.throws(() => parseSitemap('<html/>'));
 assert.throws(() => webUrl('file:///etc/passwd'));
 assert.throws(() => webUrl('https://user:password@example.com'));
});
test('enforces page limits', async () => {
 await assert.rejects(collectSitemap({ xml: '<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>' }, () => {}, { maps: 5, pages: 1 }), /exceeds 1 pages/);
});
