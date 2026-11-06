import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { catalog, siteUrl, workCodes } from "./site-components.mjs";

// 這份檢查只驗證本輪 SEO／GA4 產物，不把測試資料或後台收據放入網站。
const sitemap = await readFile("sitemap.xml", "utf8");
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
const works = catalog.flatMap((group) => group.works);
const guides = works.filter((work) => work.selectionGuide);
const photos = works.flatMap((work) => work.photos);

assert.equal(routes.length, 119, "Sitemap 應維持 119 個公開網址");
assert.equal(works.length, 97, "作品 catalog 應維持 97 件作品");
assert.equal(photos.length, 100, "作品照片數量應維持 100 張");
assert.equal(guides.length, 12, "代表作品應有 12 件選款內容");
assert.equal(new Set(guides.map((work) => work.selectionGuide.intro)).size, guides.length, "選款說明不可整段複製");

function pageFile(route) {
  return route === "/" ? "index.html" : `${route.slice(1)}index.html`;
}

function schemaNodes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(schemaNodes);
  if (Array.isArray(value["@graph"])) return value["@graph"].flatMap(schemaNodes);
  return [value];
}

for (const work of guides) {
  const { intro, focus, confirm, related } = work.selectionGuide;
  assert.ok(intro && focus && confirm.length >= 3, `${work.id} 缺少可用選款資訊`);
  assert.ok(related.length >= 2 && new Set(related).size === related.length, `${work.id} 相關作品須有差異`);
  assert.ok(related.every((code) => code !== work.id && workCodes.includes(code)), `${work.id} 相關作品編號無效`);
}

for (const route of routes) {
  const html = await readFile(pageFile(route), "utf8");
  assert.match(html, /<body data-work-codes="[^"]+" data-work-count="\d+">/, `${route} 缺少作品白名單`);
  const bodyCodes = html.match(/<body data-work-codes="([^"]+)"/)[1].split(",");
  assert.deepEqual(bodyCodes, workCodes, `${route} 作品白名單須與 catalog 一致`);
  assert.equal(Number(html.match(/data-work-count="(\d+)"/)[1]), workCodes.length, `${route} 作品數量標記錯誤`);
  assert.match(html, /<main id="main-content"(?:\s|>)/, `${route} 缺少略過導覽目標`);
  assert.match(html, /class="site-header"/, `${route} 缺少既有頁首`);
  assert.match(html, /class="site-footer"/, `${route} 缺少既有頁尾`);
  assert.match(html, /class="floating-contact"/, `${route} 缺少既有快速聯絡區`);
  assert.match(html, /\/assets\/(?:versioned\/)?main-[a-f0-9]{12}\.css|\/assets\/css\/main\.css/, `${route} 缺少既有樣式資產`);
  assert.doesNotMatch(html, /僅接受現金付款|只接受現金|現金付款/, `${route} 殘留現金付款規則`);
  assert.doesNotMatch(html, /當日件屬於例外安排/, `${route} 殘留當日件舊說法`);
  if (route.startsWith("/gallery/") && route !== "/gallery/") {
    assert.match(html, /至少提前一天/, `${route} 必須明示至少提前一天`);
    assert.match(html, /不接受配送日期當天才提出的新單/, `${route} 必須拒絕當天下單當天送`);
    assert.match(html, /轉帳付款/, `${route} 必須明示付款方式`);
    assert.match(html, /不接受花材替換/, `${route} 必須明示花材規則`);
  }
  if (route.startsWith("/gallery/") && route !== "/gallery/") {
    const workCode = route.split("/")[2];
    if (guides.some((work) => work.id === workCode)) {
      assert.match(html, /data-selection-guide/, `${route} 缺少代表作品選款提示`);
      const guide = guides.find((work) => work.id === workCode).selectionGuide;
      assert.ok(guide.related.every((code) => html.includes(`href="/gallery/${code}/"`)), `${route} 缺少相關作品內鏈`);
      assert.match(html, /不代表本款的售價/, `${route} 不得把總體起價當成本款售價`);
    }
  }

  const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g)];
  for (const block of schemaBlocks) {
    const schema = JSON.parse(block[1]);
    const nodes = schemaNodes(schema);
    assert.equal(nodes.filter((node) => ["Product", "Offer", "AggregateRating", "Review"].includes(node["@type"])).length, 0, `${route} 不可捏造商品、評論或價格 schema`);
  }

  const faqNodes = schemaBlocks.flatMap((block) => schemaNodes(JSON.parse(block[1]))).filter((node) => node["@type"] === "FAQPage");
  if (faqNodes.length) {
    const visibleQuestions = [...html.matchAll(/<summary[^>]*class="faq-question"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/g)].map((match) => match[1].trim());
    const schemaQuestions = faqNodes.flatMap((node) => node.mainEntity || []).map((item) => item.name).filter(Boolean);
    assert.deepEqual(schemaQuestions, visibleQuestions, `${route} 可見 FAQ 與 JSON-LD 題目不一致`);
    // 答案也必須逐項相同，避免爬蟲仍讀到舊付款或舊配送承諾。
    const plain = value => String(value).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const visibleAnswers = [...html.matchAll(/<details class="faq-item">[\s\S]*?<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/details>/g)].map(match => plain(match[1]));
    const schemaAnswers = faqNodes.flatMap(node => node.mainEntity || []).map(item => plain(item.acceptedAnswer?.text || ''));
    assert.deepEqual(schemaAnswers, visibleAnswers, `${route} 可見 FAQ 與 JSON-LD 答案不一致`);
  }
}

for (const route of [
  "/blog/ho-chi-minh-same-day-flower-rules/",
  "/blog/vietnam-birthday-flower-guide/",
  "/blog/vietnam-funeral-flower-ordering/",
]) {
  const html = await readFile(pageFile(route), "utf8");
  assert.match(html, /轉帳/, `${route} 指南必須交代付款方式`);
  assert.match(html, /提前一天|前一天/, `${route} 指南必須交代訂購時間`);
  assert.match(html, /href="\/services\/[^"]+\/"/, `${route} 必須導向相關服務`);
  assert.match(html, /href="\/cities\/(?:ho-chi-minh|hanoi|da-nang)\/"/, `${route} 必須導向相關城市`);
  assert.match(html, /href="\/ordering-policy\/"/, `${route} 必須連結完整訂購規則`);
  assert.doesNotMatch(html, /```/, `${route} 不得把 Markdown 圍欄顯示給顧客`);
}

const policy = await readFile("ordering-policy/index.html", "utf8");
assert.match(policy, /依法|法定/, "退款說明不可排除法定權利");
assert.match(policy, /不接受[^。<]*(?:替換|更換)/, "須清楚說明不替換花材");
assert.ok(routes.every((route) => sitemap.includes(`${siteUrl}${route}`)), "Sitemap 路徑必須完整且使用本站 canonical");
console.log(`SEO改善檢查通過：${routes.length}頁、${works.length}作品、${photos.length}圖、${guides.length}件選款內容、版型shell與作品白名單一致。`);
