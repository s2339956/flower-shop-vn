import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalog, workCodes, siteUrl } from './site-components.mjs';

// 針對本輪確認的營運規則與選款資料做語意檢查，補足只驗證meta格式的既有稽核。
const sitemap = await readFile('sitemap.xml', 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
const works = catalog.flatMap(group => group.works);
const guides = works.filter(work => work.selectionGuide);
assert.ok(guides.length >= 12, '已補齊的代表作品選款內容不可遺失');
assert.equal(new Set(guides.map(work => work.selectionGuide.intro)).size, guides.length, '選款建議不得整段複製');

for (const work of guides) {
  const { intro, focus, confirm, related } = work.selectionGuide;
  assert.ok(intro && focus && confirm.length >= 3, `${work.id} 缺少可用選款資訊`);
  assert.ok(related.length >= 2 && new Set(related).size === related.length, `${work.id} 相關作品須有差異`);
  assert.ok(related.every(code => code !== work.id && workCodes.includes(code)), `${work.id} 的相關作品無效`);
  const html = await readFile(`gallery/${work.id}/index.html`, 'utf8');
  assert.ok(html.includes('data-selection-guide'), `${work.id} 選款資訊必須由伺服器HTML輸出`);
  assert.ok(related.every(code => html.includes(`href="/gallery/${code}/"`)), `${work.id} 缺少相關作品連結`);
  assert.ok(html.includes('不代表本款的售價'), `${work.id} 不得把總體起價當成本款固定價格`);
}

for (const route of routes) {
  const file = route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
  const html = await readFile(file, 'utf8');
  assert.ok(!/僅接受現金付款|只接受現金|上午或中午前完成確認與付款|當日件屬於例外安排/.test(html), `${route} 殘留舊營運規則`);
  assert.match(html, /<body data-work-codes="[^"]+" data-work-count="\d+">/, `${route} 缺少建置作品白名單與數量`);
  assert.match(html, /<main id="main-content"(?:\s|>)/, `${route} 的略過導覽連結須有有效目標`);
  const bodyCodes = html.match(/<body data-work-codes="([^"]+)"/)[1].split(',');
  assert.deepEqual(bodyCodes, workCodes, `${route} 分析事件白名單須與catalog完全一致`);
  assert.equal(Number(html.match(/data-work-count="(\d+)"/)[1]), workCodes.length, `${route} 作品數量須由catalog取得`);
  if (route.startsWith('/gallery/') && route !== '/gallery/') {
    assert.match(html, /不接當天下單當天送達/, `${route} 必須明示訂購限制`);
    assert.match(html, /轉帳付款/, `${route} 必須明示付款方式`);
  }
  const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g)];
  for (const block of schemaBlocks) {
    // 作品為詢價參考，本輪不能為通過豐富結果測試捏造商品價格、庫存或評論。
    const schema = JSON.parse(block[1]);
    const types = JSON.stringify(schema).match(/"@type":"(Product|Offer|AggregateRating|Review)"/g) || [];
    assert.deepEqual(types, [], `${route} 不應新增未經核實的商品或評論標記`);
  }
}

for (const route of ['/blog/ho-chi-minh-same-day-flower-rules/', '/blog/vietnam-birthday-flower-guide/', '/blog/vietnam-funeral-flower-ordering/']) {
  const html = await readFile(`${route.slice(1)}index.html`, 'utf8');
  assert.match(html, /轉帳/, `${route} 指南必須交代付款方式`);
  assert.match(html, /提前一天|前一天/, `${route} 指南必須交代訂購時間`);
  assert.match(html, /href="\/services\/[^\"]+\/"/, `${route} 必須導向相關服務`);
  assert.match(html, /href="\/cities\/(?:ho-chi-minh|hanoi|da-nang)\/"/, `${route} 必須導向相關城市`);
  assert.match(html, /href="\/ordering-policy\/"/, `${route} 必須連結完整訂購規則`);
  assert.match(html, /<pre class="inquiry-example">[\s\S]*\n[\s\S]*<\/pre>/, `${route} 詢價模板須保留換行`);
  assert.doesNotMatch(html, /```/, `${route} 不得把Markdown圍欄顯示給顧客`);
}

const policy = await readFile('ordering-policy/index.html', 'utf8');
assert.match(policy, /依法|法定/, '退款說明不可排除法定權利');
assert.ok(/不接受[^。<]*(?:替換|更換)/.test(policy), '須清楚說明不替換花材');
const timingGuide = await readFile('blog/ho-chi-minh-same-day-flower-rules/index.html', 'utf8');
assert.match(timingGuide, /<ol class="check-list">(?:<li>[\s\S]*?<\/li>){4}<\/ol>/, '依序準備的四項資料須呈現為有序清單');
assert.ok(routes.every(route => sitemap.includes(`${siteUrl}${route}`)));
console.log(`SEO改善檢查通過：${routes.length}頁、${workCodes.length}作品、${works.flatMap(work => work.photos).length}圖、${guides.length}件選款內容、規則與建置白名單一致。`);
