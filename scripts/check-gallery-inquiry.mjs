import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../assets/js/main.js", import.meta.url), "utf8");
const gallery = await readFile(new URL("../gallery/index.html", import.meta.url), "utf8");
const codes = [...gallery.matchAll(/id="work-([A-Z]\d{3})"/g)].map((match) => match[1]);
const contact = await readFile(new URL("../contact/index.html", import.meta.url), "utf8");
const workCodes = contact.match(/data-work-codes="([^"]+)"/)[1];
assert.deepEqual(new Set(workCodes.split(",")), new Set(codes), "詢價清單必須涵蓋全部作品");

// 執行真正的頁面初始化；只略過與作品帶入無關的分析同意介面。
for (const work of [...codes, "", "M999", "<script>alert(1)</script>"]) {
  const template = { dataset: { workCodes }, value: "花色、款式或參考照片：\n作品編號或參考連結：\n收件人姓名：" };
  const original = template.value;
  let initialize;
  const document = {
    addEventListener(_event, callback) { initialize = callback; },
    querySelector(selector) { return selector === "[data-inquiry-template]" ? template : null; },
    querySelectorAll() { return []; },
  };
  vm.runInNewContext(`${source}\ninitAnalyticsConsent = () => {};`, {
    document, URLSearchParams, window: { location: { search: `?work=${encodeURIComponent(work)}` } },
  });
  initialize();
  if (codes.includes(work)) {
    assert.ok(template.value.includes(`${work}（https://flower-shop-vn.com/gallery/${work}/）`), `${work} 未帶入作品連結`);
    assert.ok(template.value.endsWith("收件人姓名："), "帶入作品不得覆寫其他詢價欄位");
  } else {
    assert.equal(template.value, original, "未知或惡意作品參數應忽略");
  }
}
console.log(`作品詢價檢查通過：${codes.length} 款編號與連結正確帶入，空白、未知及惡意參數均忽略。`);
