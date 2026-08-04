import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SITE_URL = "https://flower-shop-vn.com";
const SEO_RELEASE_DATE = "2026-08-04";

// 只檢查實際部署的 index.html；備份與驗證檔不屬於內容頁。
async function findPages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    if ([".git", "backups", "node_modules"].includes(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...await findPages(filePath));
    else if (entry.name === "index.html") pages.push(filePath);
  }

  return pages.sort();
}

function one(html, pattern, label, filePath) {
  const matches = [...html.matchAll(pattern)];
  assert.equal(matches.length, 1, `${filePath} 必須恰好有一個 ${label}`);
  return matches[0][1].trim();
}

function routeFor(filePath) {
  const directory = path.dirname(path.relative(ROOT, filePath));
  return directory === "." ? "/" : `/${directory}/`;
}

const pages = await findPages(ROOT);
const titles = new Set();
const descriptions = new Set();
const canonicals = new Set();

for (const filePath of pages) {
  const html = await readFile(filePath, "utf8");
  const relativePath = path.relative(ROOT, filePath);
  const expectedUrl = `${SITE_URL}${routeFor(filePath)}`;

  assert.doesNotMatch(html, /flower-shop-vn\.pages\.dev/, `${relativePath} 不得殘留舊 pages.dev 網域`);
  assert.match(html, /<html lang="zh-Hant">/, `${relativePath} 的語系必須是 zh-Hant`);
  const title = one(html, /<title>([^<]+)<\/title>/g, "title", relativePath);
  const description = one(html, /<meta name="description" content="([^"]+)">/g, "description", relativePath);
  const canonical = one(html, /<link rel="canonical" href="([^"]+)">/g, "canonical", relativePath);
  const ogSiteName = one(html, /<meta property="og:site_name" content="([^"]+)">/g, "og:site_name", relativePath);
  one(html, /<meta property="og:title" content="([^"]+)">/g, "og:title", relativePath);
  one(html, /<meta property="og:description" content="([^"]+)">/g, "og:description", relativePath);
  const ogUrl = one(html, /<meta property="og:url" content="([^"]+)">/g, "og:url", relativePath);
  const ogImage = one(html, /<meta property="og:image" content="([^"]+)">/g, "og:image", relativePath);
  one(html, /<meta property="og:type" content="([^"]+)">/g, "og:type", relativePath);
  one(html, /<meta name="twitter:title" content="([^"]+)">/g, "twitter:title", relativePath);
  one(html, /<meta name="twitter:description" content="([^"]+)">/g, "twitter:description", relativePath);
  const twitterImage = one(html, /<meta name="twitter:image" content="([^"]+)">/g, "twitter:image", relativePath);
  const twitterCard = one(html, /<meta name="twitter:card" content="([^"]+)">/g, "twitter:card", relativePath);

  assert.equal(canonical, expectedUrl, `${relativePath} 的 canonical 路徑不正確`);
  assert.equal(ogSiteName, "越南花禮代訂所", `${relativePath} 的網站名稱不一致`);
  assert.equal(ogUrl, canonical, `${relativePath} 的 og:url 必須等於 canonical`);
  for (const imageUrl of new Set([ogImage, twitterImage])) {
    assert.ok(imageUrl.startsWith(`${SITE_URL}/`), `${relativePath} 的社群圖片必須使用主網域`);
    await access(path.join(ROOT, new URL(imageUrl).pathname.slice(1)));
  }
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${relativePath} 必須恰好有一個 H1`);
  assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large">/, `${relativePath} 缺少索引設定`);
  assert.equal(twitterCard, "summary_large_image", `${relativePath} 的 Twitter Card 類型不正確`);

  const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
  assert.ok(schemas.length > 0, `${relativePath} 缺少 JSON-LD`);
  for (const schema of schemas) JSON.parse(schema[1]);

  assert.ok(!titles.has(title), `${relativePath} 的 title 與其他頁重複`);
  assert.ok(!descriptions.has(description), `${relativePath} 的 description 與其他頁重複`);
  titles.add(title);
  descriptions.add(description);
  canonicals.add(canonical);
}

// sitemap 必須完整覆蓋所有可索引頁，不能混入舊網域或不存在的頁面。
const sitemap = await readFile(path.join(ROOT, "sitemap.xml"), "utf8");
const sitemapEntries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapUrls = new Set(sitemapEntries);
assert.equal(sitemapUrls.size, sitemapEntries.length, "sitemap 不得有重複 URL");
assert.deepEqual(sitemapUrls, canonicals, "sitemap URL 必須與所有頁面的 canonical 完全一致");
const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)];
assert.equal(lastmods.length, sitemapEntries.length, "sitemap 每個 URL 都必須有一個 lastmod");
for (const lastmod of lastmods) {
  assert.match(lastmod[1], /^\d{4}-\d{2}-\d{2}$/, `sitemap lastmod 格式錯誤：${lastmod[1]}`);
  assert.ok(lastmod[1] >= SEO_RELEASE_DATE, `sitemap lastmod 早於網域 SEO 發布日：${lastmod[1]}`);
}

const robots = await readFile(path.join(ROOT, "robots.txt"), "utf8");
assert.match(robots, new RegExp(`Sitemap: ${SITE_URL.replaceAll(".", "\\.")}\\/sitemap\\.xml`), "robots.txt 必須指向主網域 sitemap");
assert.doesNotMatch(`${[...canonicals].join("\n")}\n${sitemap}\n${robots}`, /flower-shop-vn\.pages\.dev/, "正式 SEO 輸出不得殘留舊 pages.dev 網域");

console.log(`SEO 檢查通過：${pages.length} 個頁面，canonical、metadata、JSON-LD、robots 與 sitemap 一致。`);
