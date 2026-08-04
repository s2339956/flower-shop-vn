import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SITE_URL = "https://flower-shop-vn.com";
const SEO_RELEASE_DATE = "2026-08-04";
const SHOPEE_GUIDE_URL = "https://shopee.tw/product/3151001/29700986020/";

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
const internalLinks = new Set();

for (const filePath of pages) {
  const html = await readFile(filePath, "utf8");
  const relativePath = path.relative(ROOT, filePath);
  const expectedUrl = `${SITE_URL}${routeFor(filePath)}`;

  assert.doesNotMatch(html, /flower-shop-vn\.pages\.dev/, `${relativePath} 不得殘留舊 pages.dev 網域`);
  assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/, `${relativePath} 不得載入阻塞首屏的 Google Fonts`);
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
  assert.equal((html.match(/<footer class="site-footer">/g) || []).length, 1, `${relativePath} 必須恰好有一個共用 footer`);
  assert.equal((html.match(/<nav class="floating-contact"/g) || []).length, 1, `${relativePath} 必須恰好有一個快速聯絡導覽`);
  assert.match(html, new RegExp(`href="${SHOPEE_GUIDE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${relativePath} 必須保留可見的 Shopee 指引連結`);

  // 每個站內 href 都必須指向實際存在的頁面或檔案，避免共用版面製造全站死鏈。
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const pathname = new URL(href, SITE_URL).pathname;
    const target = pathname.endsWith("/")
      ? path.join(ROOT, pathname.slice(1), "index.html")
      : path.join(ROOT, pathname.slice(1));
    await access(target);
    internalLinks.add(pathname);
  }

  const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
  assert.ok(schemas.length > 0, `${relativePath} 缺少 JSON-LD`);
  for (const schema of schemas) JSON.parse(schema[1]);

  assert.ok(!titles.has(title), `${relativePath} 的 title 與其他頁重複`);
  assert.ok(!descriptions.has(description), `${relativePath} 的 description 與其他頁重複`);
  titles.add(title);
  descriptions.add(description);
  canonicals.add(canonical);
}

assert.ok(canonicals.has(`${SITE_URL}/ordering-policy/`), "必須發布訂購、變更與個資說明頁");

// 主要內頁的首屏圖片必須優先使用 WebP，同時保留原始 JPG 作為後備格式。
const heroWebpPages = [
  ["services/wedding-flowers-vietnam/index.html", "/images/IMG_4860.webp"],
  ["services/funeral-flowers-vietnam/index.html", "/images/IMG_8931.webp"],
  ["services/birthday-flowers-vietnam/index.html", "/images/IMG_8454.webp"],
  ["services/opening-stand-vietnam/index.html", "/images/IMG_4786.webp"],
  ["cities/ho-chi-minh/index.html", "/images/IMG_7448.webp"],
  ["cities/hanoi/index.html", "/images/IMG_4865.webp"],
  ["cities/da-nang/index.html", "/images/IMG_8387.webp"],
  ["pricing/index.html", "/images/IMG_1006.webp"],
  ["contact/index.html", "/images/IMG_8154.webp"],
];

for (const [relativePath, webpUrl] of heroWebpPages) {
  const html = await readFile(path.join(ROOT, relativePath), "utf8");
  await access(path.join(ROOT, webpUrl.slice(1)));
  assert.match(
    html,
    new RegExp(`<picture>\\s*<source srcset="${webpUrl.replaceAll(".", "\\.")}" type="image/webp">\\s*<img[^>]+fetchpriority="high"[^>]*>\\s*</picture>`),
    `${relativePath} 的首屏圖片必須使用 WebP 並保留 JPG 後備`,
  );
}

// Cloudflare Pages 會自動使用根目錄 404.html；錯誤頁不得進入搜尋索引。
const notFound = await readFile(path.join(ROOT, "404.html"), "utf8");
assert.match(notFound, /<html lang="zh-Hant">/, "404 頁語系必須是 zh-Hant");
assert.match(notFound, /<meta name="robots" content="noindex,follow">/, "404 頁必須設定 noindex,follow");
assert.doesNotMatch(notFound, /<link rel="canonical"/, "404 頁不得宣告 canonical");
assert.equal((notFound.match(/<h1\b/g) || []).length, 1, "404 頁必須恰好有一個 H1");
assert.match(notFound, /href="\/"/, "404 頁必須能回到首頁");
assert.match(notFound, /href="\/contact\/"/, "404 頁必須能前往聯絡頁");
assert.equal((notFound.match(/<footer class="site-footer">/g) || []).length, 1, "404 頁必須有共用 footer");
assert.equal((notFound.match(/<nav class="floating-contact"/g) || []).length, 1, "404 頁必須有快速聯絡導覽");

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

// Cloudflare Web Analytics 需同時允許載入 beacon 與送出分析請求。
const headers = await readFile(path.join(ROOT, "_headers"), "utf8");
assert.match(headers, /script-src[^\n]*https:\/\/static\.cloudflareinsights\.com/, "CSP script-src 必須允許 Cloudflare Web Analytics");
assert.match(headers, /connect-src[^\n]*https:\/\/cloudflareinsights\.com/, "CSP connect-src 必須允許 Cloudflare Web Analytics");
assert.match(headers, /script-src[^\n]*https:\/\/www\.googletagmanager\.com/, "CSP script-src 必須允許使用者同意後載入 GA4");
assert.match(headers, /connect-src[^\n]*https:\/\/www\.google-analytics\.com/, "CSP connect-src 必須允許 GA4 分析請求");
// Cloudflare 邊緣目前會插入動態 inline challenge script；未停用該功能前必須保留此例外。
assert.match(headers, /script-src[^;\n]*'unsafe-inline'/, "CSP 必須允許 Cloudflare 邊緣插入的 inline challenge script");
const assetsPolicy = headers.match(/\/assets\/\*([\s\S]*?)(?=\n\/|\s*$)/)?.[1] || "";
assert.match(assetsPolicy, /Cache-Control: public, max-age=0, must-revalidate/, "未版本化的 CSS 與 JS 必須每次重新驗證");

// 詢價模板採純前端複製，不收集或傳送顧客資料。
const contact = await readFile(path.join(ROOT, "contact", "index.html"), "utf8");
assert.match(contact, /data-copy-inquiry/, "聯絡頁必須提供一鍵複製詢價模板");
assert.match(contact, /data-inquiry-template/, "聯絡頁必須提供可直接編輯的詢價資料欄位");

// GA4 僅能由共用腳本在使用者同意後載入，並須提供隨時修改選擇的入口。
const mainScript = await readFile(path.join(ROOT, "assets", "js", "main.js"), "utf8");
const orderingPolicy = await readFile(path.join(ROOT, "ordering-policy", "index.html"), "utf8");
assert.match(mainScript, /G-NFGV86CR3K/, "共用腳本必須使用本網站的 GA4 評估 ID");
assert.match(mainScript, /if \(consent === "granted"\) loadAnalytics\(\)/, "GA4 必須只在使用者同意後自動載入");
assert.match(mainScript, /ad_personalization: "denied"/, "GA4 必須停用廣告個人化");
assert.match(mainScript, /ga-disable-/, "撤回同意後必須使用 Google 官方停用旗標阻止資料傳送");
assert.match(mainScript, /分析偏好設定/, "頁尾必須提供分析偏好設定入口");
assert.match(orderingPolicy, /只有在你按下「允許分析」後/, "個資說明必須揭露 GA4 的同意後載入方式");

console.log(`SEO 檢查通過：${pages.length} 個頁面、${internalLinks.size} 個站內連結目標，metadata、JSON-LD、robots 與 sitemap 一致。`);
