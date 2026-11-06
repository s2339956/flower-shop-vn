import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { workCodes } from "./site-components.mjs";

const source = await readFile(new URL("../assets/js/main.js", import.meta.url), "utf8");
const workCodeList = workCodes.join(",");

class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.document = document;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.hidden = false;
    this.style = {};
  }

  set innerHTML(value) {
    this.html = value;
    this.allowButton = new FakeElement("button", this.document);
    this.denyButton = new FakeElement("button", this.document);
  }

  querySelector(selector) {
    if (selector === "[data-analytics-allow]") return this.allowButton;
    if (selector === "[data-analytics-deny]") return this.denyButton;
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  append(...children) {
    this.children.push(...children);
  }

  async click() {
    return this.listeners.click?.();
  }

  focus() {
    this.document.activeElement = this;
  }

  select() {}

  closest(selector) {
    return selector === "a[href]" && this.tagName === "A" ? this : null;
  }
}

function createEnvironment({
  canonical = "https://flower-shop-vn.com/contact/",
  pathname = "/contact/",
  search = "",
  hash = "",
  referrer = "",
  consent = null,
  responseStatus = 200,
  bodyWorkCodes = workCodeList,
  bodyWorkCount = String(workCodes.length),
  inquiry = false,
  clipboard = "success",
  fallbackCopy = true,
  historyThrows = false,
} = {}) {
  const document = {
    activeElement: null,
    listeners: {},
    referrer,
    canonical: null,
    body: null,
    head: null,
    footer: null,
    inquiryTemplate: null,
    copyInquiry: null,
    copyStatus: null,
    selectedWork: null,
    createElement(tagName) {
      return new FakeElement(tagName, this);
    },
    querySelector(selector) {
      if (selector === 'link[rel="canonical"]') return this.canonical;
      if (selector === ".footer-grid > div:last-child") return this.footer;
      if (selector.startsWith("[data-ga4-id=")) {
        return this.head.children.find((child) => child.dataset.ga4Id) || null;
      }
      if (selector === "[data-inquiry-template]") return this.inquiryTemplate;
      if (selector === "[data-copy-inquiry]") return this.copyInquiry;
      if (selector === "[data-copy-status]") return this.copyStatus;
      if (selector === "[data-selected-work]") return this.selectedWork;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, listener) {
      (this.listeners[type] ||= []).push(listener);
    },
    execCommand(command) {
      return command === "copy" && fallbackCopy;
    },
  };
  document.body = new FakeElement("body", document);
  document.body.dataset.workCodes = bodyWorkCodes;
  if (bodyWorkCount !== null) document.body.dataset.workCount = bodyWorkCount;
  document.head = new FakeElement("head", document);
  document.footer = new FakeElement("footer", document);
  if (canonical !== null) {
    document.canonical = new FakeElement("link", document);
    document.canonical.setAttribute("href", canonical);
  }
  if (inquiry) {
    document.inquiryTemplate = new FakeElement("textarea", document);
    document.inquiryTemplate.dataset.workCodes = workCodeList;
    document.inquiryTemplate.value = "作品編號或參考連結：\n收件人姓名：";
    document.copyInquiry = new FakeElement("button", document);
    document.copyStatus = new FakeElement("p", document);
    document.selectedWork = new FakeElement("p", document);
  }

  const values = new Map();
  if (consent) values.set("flower-shop-vn.analytics-consent", consent);
  const localStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  const location = { pathname, search, hash };
  const replacedUrls = [];
  const window = {
    location,
    isSecureContext: clipboard !== "fallback",
    history: {
      state: { preserved: true },
      replaceState(_state, _title, url) {
        if (historyThrows) throw new Error("history unavailable");
        replacedUrls.push(url);
        location.search = "";
      },
    },
  };
  const navigator = {};
  if (clipboard !== "fallback") {
    navigator.clipboard = {
      async writeText() {
        if (clipboard === "failure") throw new Error("clipboard denied");
      },
    };
  }
  const performance = { getEntriesByType: () => [{ responseStatus }] };
  const context = vm.createContext({
    document, localStorage, window, navigator, performance, URL, URLSearchParams, Date, console,
  });
  vm.runInContext(`${source}\nthis.__sendAnalyticsEvent = sendAnalyticsEvent;`, context);

  return {
    document,
    localStorage: values,
    window,
    replacedUrls,
    async start() {
      await document.listeners.DOMContentLoaded[0]();
    },
    sendRaw(name, parameters) {
      context.__sendAnalyticsEvent(name, parameters);
    },
    clickHref(href) {
      const anchor = new FakeElement("a", document);
      anchor.setAttribute("href", href);
      document.listeners.click[0]({
        target: anchor,
        preventDefault() {
          throw new Error("量測不得攔截原生導航");
        },
      });
    },
  };
}

const eventCalls = (environment, name) => (environment.window.dataLayer || [])
  .filter((entry) => entry[0] === "event" && entry[1] === name);
const normalize = (value) => JSON.parse(JSON.stringify(value));

assert.equal(workCodes.length, 97, "測試必須覆蓋固定 97 件作品");

const main = createEnvironment({
  search: "?work=R040&utm_campaign=TOP_SECRET_SENTINEL",
  hash: "#inquiry",
  inquiry: true,
});
await main.start();
const banner = main.document.body.children[0];
const settingsButton = main.document.footer.children[0];
assert.equal(banner.hidden, false, "首次造訪必須顯示分析偏好");
assert.equal(main.document.head.children.length, 0, "未同意前不得載入 Google 標籤");
assert.equal(main.window.dataLayer, undefined, "未同意前不得建立或排入任何 Google 命令");
assert.deepEqual(main.replacedUrls, ["/contact/#inquiry"], "詢價作品讀取後必須移除全部 query 並保留 hash");
assert.match(main.document.inquiryTemplate.value, /R040（https:\/\/flower-shop-vn\.com\/gallery\/R040\/）/, "清除 query 前必須完成合法作品預填");

main.clickHref("https://line.me/ti/p/s2339956");
assert.equal(eventCalls(main, "contact_click").length, 0, "未同意不得暫存自訂事件");
await banner.denyButton.click();
assert.equal(main.localStorage.get("flower-shop-vn.analytics-consent"), "denied", "拒絕選擇必須保存");
assert.equal(main.window["ga-disable-G-W2RMKRVMKJ"], true, "拒絕後必須停用 GA4");

await settingsButton.click();
assert.equal(main.document.activeElement, banner.allowButton, "由頁尾開啟時焦點必須進入偏好介面");
await banner.allowButton.click();
assert.equal(main.document.head.children.length, 1, "允許後必須載入一份 Google 標籤");
assert.equal(main.document.activeElement, settingsButton, "關閉偏好介面後焦點必須回到頁尾按鈕");
const globalSet = main.window.dataLayer.find((entry) => entry[0] === "set");
assert.deepEqual(normalize(globalSet[1]), {
  send_page_view: false,
  page_location: "https://flower-shop-vn.com/contact/",
  page_referrer: "",
  ignore_referrer: true,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
}, "全域 set 必須在 SDK 初始化前固定 canonical、清理後 referrer 與隱私設定");
const globalSetIndex = main.window.dataLayer.indexOf(globalSet);
assert.equal(globalSetIndex, 0, "允許分析後的第一個 Google 命令必須是全域 set");
for (const command of ["js", "config", "event"]) {
  assert.ok(globalSetIndex < main.window.dataLayer.findIndex((entry) => entry[0] === command), `全域 set 必須排在第一個 ${command} 命令之前`);
}
const config = main.window.dataLayer.find((entry) => entry[0] === "config");
assert.equal(config[2].send_page_view, false, "GA 設定必須關閉自動 page_view");
assert.equal(config[2].page_location, "https://flower-shop-vn.com/contact/", "config 必須固定 canonical page_location");
assert.equal(config[2].page_referrer, "", "未知來源的 config 必須清空 referrer");
assert.equal(config[2].ignore_referrer, true, "未知來源的 config 必須忽略原始 referrer");
assert.equal(config[2].page_location, "https://flower-shop-vn.com/contact/", "GA config 必須固定 canonical page_location");
assert.equal(config[2].page_referrer, "", "GA config 不得回退原始 referrer");
assert.equal(config[2].ignore_referrer, true, "未知來源的 GA config 必須忽略原始 referrer");
const pageView = eventCalls(main, "page_view")[0];
assert.deepEqual(normalize(pageView[2]), {
  page_location: "https://flower-shop-vn.com/contact/",
  page_referrer: "",
  ignore_referrer: true,
}, "手動 page_view 只能使用 canonical 與清理後 referrer");
const unknownSourceContext = {
  send_to: "G-W2RMKRVMKJ",
  page_location: "https://flower-shop-vn.com/contact/",
  page_referrer: "",
  ignore_referrer: true,
};

const channels = new Map([
  ["https://line.me/ti/p/s2339956", "line"],
  ["https://zalo.me/0836058119", "zalo"],
  ["mailto:s2339956@gmail.com", "email"],
  ["tel:+886916316950", "phone"],
  ["https://shopee.tw/product/3151001/29700986020/", "shopee"],
]);
for (const [href, channel] of channels) {
  main.clickHref(href);
  assert.deepEqual(normalize(eventCalls(main, "contact_click").at(-1)[2]), {
    channel,
    ...unknownSourceContext,
  }, `${channel} 僅能傳固定渠道值與清理後頁面脈絡`);
}

for (const work of workCodes) main.clickHref(`/contact/?work=${work}#inquiry`);
assert.deepEqual(
  normalize(eventCalls(main, "work_inquiry").map((entry) => entry[2].work_code)),
  workCodes,
  "97 件合法作品都必須只傳 work_code",
);
assert.deepEqual(normalize(eventCalls(main, "work_inquiry")[0][2]), {
  work_code: workCodes[0],
  ...unknownSourceContext,
}, "作品事件只能傳合法 work_code 與固定 GA 頁面脈絡");
assert.ok(eventCalls(main, "work_inquiry").every((entry) => normalize(entry[2]).page_location === unknownSourceContext.page_location), "所有作品事件都必須固定 canonical page_location");
for (const href of [
  "/contact/?work=M999#inquiry",
  "/contact/?work=%3Cscript%3Ealert(1)%3C/script%3E#inquiry",
  "https://evil.example/contact/?work=R040#inquiry",
  "/contact/?work=R040#other",
]) main.clickHref(href);
assert.equal(eventCalls(main, "work_inquiry").length, 97, "未知、惡意、跨來源或錯誤 hash 不得產生作品事件");

await main.document.copyInquiry.click();
assert.equal(eventCalls(main, "inquiry_copy").length, 1, "聯絡頁成功複製後才送 inquiry_copy");
assert.deepEqual(normalize(eventCalls(main, "inquiry_copy")[0][2]), unknownSourceContext, "複製事件只能包含固定 GA 頁面脈絡");

const eventCountBeforeInjection = (main.window.dataLayer || []).length;
main.sendRaw("contact_click", { channel: "line", href: "CONTACT_INJECTION_SENTINEL" });
const hiddenInjection = { channel: "line" };
Object.defineProperty(hiddenInjection, "hidden", { value: "HIDDEN_INJECTION_SENTINEL" });
main.sendRaw("contact_click", hiddenInjection);
main.sendRaw("contact_click", { channel: "unknown" });
main.sendRaw("work_inquiry", { work_code: "R040", title: "WORK_INJECTION_SENTINEL" });
main.sendRaw("work_inquiry", { work_code: "M999" });
main.sendRaw("inquiry_copy", { text: "COPY_INJECTION_SENTINEL" });
main.sendRaw("unknown_event", {});
assert.equal(main.window.dataLayer.length, eventCountBeforeInjection, "sender 必須整筆拒絕額外欄位、非法值與未知事件");
assert.doesNotMatch(JSON.stringify(main.window.dataLayer), /INJECTION_SENTINEL/, "注入欄位不得進入 dataLayer");
assert.doesNotMatch(
  JSON.stringify(main.window.dataLayer),
  /s2339956|0836058119|916316950|gmail\.com|line\.me|zalo\.me|shopee\.tw/,
  "事件 payload 不得包含聯絡網址、帳號、電話或 Email",
);

await settingsButton.click();
await banner.denyButton.click();
main.clickHref("https://line.me/ti/p/s2339956");
await main.document.copyInquiry.click();
assert.equal(eventCalls(main, "contact_click").length, 5, "撤回後不得再送聯絡事件");
assert.equal(eventCalls(main, "inquiry_copy").length, 1, "撤回後不得再送複製事件");
await settingsButton.click();
await banner.allowButton.click();
assert.equal(main.document.head.children.length, 1, "再次允許不得重複載入標籤");
assert.equal(eventCalls(main, "page_view").length, 1, "再次允許不得重複送 page_view");
assert.doesNotMatch(JSON.stringify(main.window.dataLayer), /TOP_SECRET_SENTINEL|utm_campaign/, "query sentinel 不得進入 GA payload");

const copyFailure = createEnvironment({ consent: "granted", inquiry: true, clipboard: "failure" });
await copyFailure.start();
await copyFailure.document.copyInquiry.click();
assert.equal(eventCalls(copyFailure, "inquiry_copy").length, 0, "剪貼簿失敗不得計為成功複製");
assert.match(copyFailure.document.copyStatus.textContent, /手動複製/, "剪貼簿失敗必須保留手動備援訊息");

const unknownWork = createEnvironment({ search: "?work=M999&utm_source=secret", hash: "#inquiry", inquiry: true });
await unknownWork.start();
assert.doesNotMatch(unknownWork.document.inquiryTemplate.value, /M999/, "未知作品不得寫入詢價內容");
assert.match(unknownWork.document.copyStatus.textContent, /找不到此作品編號/, "清除 query 後仍須顯示既有未知作品錯誤");
assert.deepEqual(unknownWork.replacedUrls, ["/contact/#inquiry"], "未知作品 query 也必須清除並保留 hash");

const fallbackSuccess = createEnvironment({ consent: "granted", inquiry: true, clipboard: "fallback", fallbackCopy: true });
await fallbackSuccess.start();
await fallbackSuccess.document.copyInquiry.click();
assert.equal(eventCalls(fallbackSuccess, "inquiry_copy").length, 1, "execCommand fallback 成功後必須計一次複製");
const fallbackFailure = createEnvironment({ consent: "granted", inquiry: true, clipboard: "fallback", fallbackCopy: false });
await fallbackFailure.start();
await fallbackFailure.document.copyInquiry.click();
assert.equal(eventCalls(fallbackFailure, "inquiry_copy").length, 0, "execCommand fallback 失敗不得計為複製");

const nonContactCopy = createEnvironment({ canonical: "https://flower-shop-vn.com/", pathname: "/", consent: "granted", inquiry: true });
await nonContactCopy.start();
await nonContactCopy.document.copyInquiry.click();
assert.equal(eventCalls(nonContactCopy, "inquiry_copy").length, 0, "非聯絡頁成功複製不得產生 inquiry_copy");

const referrers = new Map([
  ["google.com", "https://www.google.com"],
  ["www.google.com", "https://www.google.com"],
  ["google.com.tw", "https://www.google.com"],
  ["www.google.com.tw", "https://www.google.com"],
  ["bing.com", "https://www.bing.com"],
  ["www.bing.com", "https://www.bing.com"],
  ["chatgpt.com", "https://chatgpt.com"],
  ["chat.openai.com", "https://chatgpt.com"],
  ["perplexity.ai", "https://www.perplexity.ai"],
  ["www.perplexity.ai", "https://www.perplexity.ai"],
  ["copilot.com", "https://copilot.com"],
  ["www.copilot.com", "https://copilot.com"],
  ["copilot.microsoft.com", "https://copilot.com"],
  ["gemini.google.com", "https://gemini.google.com"],
]);
for (const [hostname, expected] of referrers) {
  const environment = createEnvironment({ consent: "granted", referrer: `https://${hostname}/private/path?q=REFERRER_SENTINEL` });
  await environment.start();
  const parameters = eventCalls(environment, "page_view")[0][2];
  assert.equal(parameters.page_referrer, expected, `${hostname} 必須映射為固定 origin`);
  assert.equal(Object.hasOwn(parameters, "ignore_referrer"), false, "已知來源必須省略 ignore_referrer");
  const configParameters = environment.window.dataLayer.find((entry) => entry[0] === "config")[2];
  assert.equal(configParameters.page_referrer, expected, `${hostname} 的 config 必須使用固定 origin`);
  assert.equal(Object.hasOwn(configParameters, "ignore_referrer"), false, "已知來源的 config 必須省略 ignore_referrer");
  const setParameters = environment.window.dataLayer.find((entry) => entry[0] === "set")[1];
  assert.equal(setParameters.page_referrer, expected, `${hostname} 的全域 set 必須使用固定 origin`);
  assert.equal(Object.hasOwn(setParameters, "ignore_referrer"), false, "已知來源的全域 set 必須省略 ignore_referrer");
  environment.clickHref("https://line.me/ti/p/s2339956");
  assert.deepEqual(normalize(eventCalls(environment, "contact_click")[0][2]), {
    channel: "line",
    send_to: "G-W2RMKRVMKJ",
    page_location: "https://flower-shop-vn.com/contact/",
    page_referrer: expected,
  }, `${hostname} 的自訂事件必須使用固定 canonical/referrer 且省略 ignore_referrer`);
  assert.doesNotMatch(JSON.stringify(environment.window.dataLayer), /private|REFERRER_SENTINEL/, "referrer path/query 不得進入任何 GA 命令或事件");
}
for (const referrer of [
  "http://www.google.com/search",
  "https://www.google.com:444/search",
  "https://user:pass@www.google.com/search",
  "https://www.google.com.evil.example/search",
  "https://unknown.example/path?q=UNKNOWN_REFERRER_SENTINEL",
  "not a url",
]) {
  const environment = createEnvironment({ consent: "granted", referrer });
  await environment.start();
  assert.deepEqual(normalize(eventCalls(environment, "page_view")[0][2]), {
    page_location: "https://flower-shop-vn.com/contact/",
    page_referrer: "",
    ignore_referrer: true,
  }, `不可信 referrer 必須清空：${referrer}`);
  assert.equal(JSON.stringify(environment.window.dataLayer).includes(referrer), false, `原始 referrer 不得進入任何 Google 命令：${referrer}`);
}

for (const failure of [
  { canonical: null },
  { canonical: "https://evil.example/contact/" },
  { canonical: "https://flower-shop-vn.com/contact/?secret=1" },
  { canonical: "https://flower-shop-vn.com/contact/#inquiry" },
  { canonical: "https://flower-shop-vn.com/", pathname: "/contact/" },
  { canonical: "https://flower-shop-vn.com/contact/", responseStatus: 404 },
]) {
  const environment = createEnvironment({ ...failure, consent: "granted" });
  await environment.start();
  assert.equal(environment.document.head.children.length, 0, "canonical 缺漏、錯誤、跨來源或 404 必須 fail closed");
  assert.equal(environment.window["ga-disable-G-W2RMKRVMKJ"], true, "fail closed 必須維持 GA 停用旗標");
}

const galleryHash = createEnvironment({
  canonical: "https://flower-shop-vn.com/gallery/",
  pathname: "/gallery/",
  search: "?utm_source=TOP_SECRET_GALLERY",
  hash: "#work-R040",
  consent: "granted",
});
await galleryHash.start();
assert.deepEqual(galleryHash.replacedUrls, ["/gallery/#work-R040"], "清除 query 不得破壞 gallery hash");
assert.equal(eventCalls(galleryHash, "page_view")[0][2].page_location, "https://flower-shop-vn.com/gallery/", "gallery page_view 只用 canonical");
assert.doesNotMatch(JSON.stringify(galleryHash.window.dataLayer), /TOP_SECRET_GALLERY|utm_source/, "gallery query 不得洩漏");

const historyFailure = createEnvironment({ search: "?utm_source=secret", consent: "granted", historyThrows: true });
await historyFailure.start();
assert.equal(historyFailure.document.head.children.length, 0, "query 無法清除時不得載入 GA");

const incompleteCatalog = createEnvironment({ consent: "granted", bodyWorkCodes: workCodes.slice(0, -1).join(",") });
await incompleteCatalog.start();
incompleteCatalog.clickHref("/contact/?work=R040#inquiry");
assert.equal(eventCalls(incompleteCatalog, "work_inquiry").length, 0, "作品白名單少於 catalog 宣告數量時必須 fail closed");

for (const bodyWorkCount of [null, "", "0", "1.5", "not-a-number"]) {
  const invalidCount = createEnvironment({ consent: "granted", bodyWorkCount });
  await invalidCount.start();
  invalidCount.clickHref("/contact/?work=R040#inquiry");
  assert.equal(eventCalls(invalidCount, "work_inquiry").length, 0, `作品數量標記無效時必須 fail closed：${bodyWorkCount}`);
}

const futureWorkCodes = [...workCodes, "X001"];
const futureCatalog = createEnvironment({
  consent: "granted",
  bodyWorkCodes: futureWorkCodes.join(","),
  bodyWorkCount: String(futureWorkCodes.length),
});
await futureCatalog.start();
futureCatalog.clickHref("/contact/?work=X001#inquiry");
assert.equal(eventCalls(futureCatalog, "work_inquiry")[0][2].work_code, "X001", "catalog 與數量同步新增作品後不得因舊數量硬編碼而失效");

console.log("SEO-1 量測檢查通過：同意、canonical、query、referrer、5 渠道、現行 97 與模擬 98 件作品、複製成功／失敗及撤回均符合固定事件契約。");
