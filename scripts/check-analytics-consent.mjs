import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const mainScript = await readFile(new URL("../assets/js/main.js", import.meta.url), "utf8");
const consentScript = mainScript.slice(0, mainScript.indexOf('document.addEventListener("DOMContentLoaded"'));

// 最小 DOM 僅模擬同意流程需要的行為，不引入測試框架或瀏覽器套件。
class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.hidden = false;
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
    this[name] = value;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  append(child) {
    this.children.push(child);
  }

  click() {
    this.listeners.click?.();
  }

  focus() {
    this.document.activeElement = this;
  }
}

const document = {
  activeElement: null,
  body: null,
  head: null,
  footer: null,
  createElement(tagName) {
    return new FakeElement(tagName, this);
  },
  querySelector(selector) {
    if (selector === ".footer-grid > div:last-child") return this.footer;
    if (selector.startsWith("[data-ga4-id=")) {
      return this.head.children.find((child) => child.dataset.ga4Id) || null;
    }
    return null;
  },
};
document.body = new FakeElement("body", document);
document.head = new FakeElement("head", document);
document.footer = new FakeElement("footer", document);

const values = new Map();
const localStorage = {
  getItem(key) {
    return values.get(key) ?? null;
  },
  setItem(key, value) {
    values.set(key, value);
  },
};

const window = {};
const context = vm.createContext({ document, localStorage, window, Date });
vm.runInContext(`${consentScript}\nthis.runConsentCheck = initAnalyticsConsent;`, context);
context.runConsentCheck();

const banner = document.body.children[0];
const settingsButton = document.footer.children[0];
assert.equal(banner.hidden, false, "首次造訪必須顯示分析偏好");
assert.equal(document.head.children.length, 0, "未同意前不得載入 Google 標籤");

banner.denyButton.click();
assert.equal(values.get("flower-shop-vn.analytics-consent"), "denied", "拒絕選擇必須保存");
assert.equal(window["ga-disable-G-NFGV86CR3K"], true, "拒絕後必須停用 GA4 資料傳送");
assert.equal(document.head.children.length, 0, "拒絕後不得載入 Google 標籤");

settingsButton.click();
assert.equal(document.activeElement, banner.allowButton, "由頁尾開啟時焦點必須進入偏好介面");
banner.allowButton.click();
assert.equal(window["ga-disable-G-NFGV86CR3K"], false, "允許後必須啟用 GA4");
assert.equal(document.head.children.length, 1, "允許後必須載入一份 Google 標籤");
assert.equal(document.activeElement, settingsButton, "關閉偏好介面後焦點必須回到頁尾按鈕");

settingsButton.click();
banner.denyButton.click();
assert.equal(window["ga-disable-G-NFGV86CR3K"], true, "撤回後必須停止 GA4 資料傳送");

settingsButton.click();
banner.allowButton.click();
assert.equal(window["ga-disable-G-NFGV86CR3K"], false, "再次允許後必須恢復 GA4");
assert.equal(document.head.children.length, 1, "反覆變更選擇不得重複插入 Google 標籤");
assert.equal(window.dataLayer.at(-1)[0], "consent", "再次允許必須送出 consent 更新");
assert.equal(window.dataLayer.at(-1)[2].analytics_storage, "granted", "再次允許必須恢復分析同意");

console.log("GA4 同意流程檢查通過：未同意零載入、撤回停用、再次允許與焦點恢復均正確。");
