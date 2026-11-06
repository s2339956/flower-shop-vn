import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.js';
const runtime = await import(pathToFileURL(modulePath));
const { chromium } = runtime.default || runtime;
const base = process.argv[2] || 'http://127.0.0.1:4327';
const output = 'dev-notes/seo-original-layout-20261106/browser';
const sentinel = 'SEO_PRIVATE_SENTINEL_20261106';
const measurementId = (await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8')).match(/const ANALYTICS_ID = "(G-[A-Z0-9]+)";/)?.[1];
assert.ok(measurementId, '必須能辨識正式程式的評估ID');
const baseUrl = new URL(base);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const attemptedCollect = [];
let tagLoaded = false;
const findings = [];

const isGoogleHost = hostname => /(^|\.)(?:googletagmanager|google-analytics)\.com$/.test(hostname);
const isApprovedTag = url => (
  url.origin === 'https://www.googletagmanager.com'
  && url.pathname === '/gtag/js'
  && url.searchParams.get('id') === measurementId
  && url.searchParams.getAll('id').length === 1
  && [...url.searchParams.keys()].every(key => key === 'id')
);
const isApprovedCollector = url => (
  /(^|\.)google-analytics\.com$/.test(url.hostname)
  && /\/collect$/.test(url.pathname)
);
const parseEvents = requests => requests.flatMap(request => {
  const common = Object.fromEntries(new URL(request.url).searchParams);
  return (request.body || '').split('\n').map(line => ({
    ...common,
    ...Object.fromEntries(new URLSearchParams(line)),
  }));
}).filter(parameters => parameters.en);

function requestHasEvent(request, name, pageLocation) {
  try {
    if (!isApprovedCollector(new URL(request.url()))) return false;
    return parseEvents([{ url: request.url(), body: request.postData() || '' }]).some(parameters => (
      parameters.en === name
      && parameters.dl === pageLocation
      && parameters.tid === measurementId
    ));
  } catch {
    return false;
  }
}

async function runAndWaitForGAEvent({
  page,
  name,
  pageLocation,
  label,
  action,
  collect,
  tagLoaded,
  errors = [],
}) {
  const pending = page.waitForRequest(
    request => requestHasEvent(request, name, pageLocation),
    { timeout: 15000 },
  );
  try {
    await action();
    const request = await pending;
    const response = await request.response();
    assert.equal(response?.status(), 204, label + '必須由本機collector回204');
    return request;
  } catch (error) {
    const safeLabel = label.replace(/[^A-Za-z0-9_-]+/g, '-');
    let dataLayer = '頁面已無法讀取';
    try {
      dataLayer = await page.evaluate(() => JSON.stringify(window.dataLayer || []));
    } catch {
      // 導航失敗時仍保存其餘網路證據。
    }
    await writeFile(
      output + '/failure-' + safeLabel + '.json',
      JSON.stringify({
        expected_event: name,
        expected_page_location: pageLocation,
        current_url: page.url(),
        tag_loaded: tagLoaded(),
        page_errors: errors,
        observed_events: parseEvents(collect).map(parameters => ({
          name: parameters.en,
          page_location: parameters.dl,
          page_referrer: parameters.dr,
          measurement_id: parameters.tid,
        })),
        data_layer: dataLayer,
        error: error.message,
      }, null, 2) + '\n',
    );
    throw error;
  }
}

async function installNetworkGate(context, {
  collect = [],
  tagRequests = [],
  unexpectedGoogle = [],
  otherExternal = [],
  allowTag = true,
  transformDocument = null,
} = {}) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === baseUrl.origin) {
      if (transformDocument && request.resourceType() === 'document' && url.pathname === '/contact/') {
        const response = await route.fetch();
        const html = await response.text();
        const transformed = transformDocument(html);
        assert.notEqual(transformed, html, 'canonical 測試必須確實改寫文件');
        return route.fulfill({ response, body: transformed });
      }
      return route.continue();
    }
    if (['static.cloudflareinsights.com', 'cloudflareinsights.com'].includes(url.hostname)) return route.abort();
    if (allowTag && isApprovedTag(url) && request.method() === 'GET') {
      tagRequests.push(request.url());
      return route.continue();
    }
    if (isApprovedCollector(url)) {
      collect.push({ url: request.url(), body: request.postData() || '' });
      return route.fulfill({ status: 204, body: '' });
    }
    if (isGoogleHost(url.hostname)) unexpectedGoogle.push(request.url());
    else otherExternal.push(request.url());
    return route.abort();
  });
}

async function assertCanonicalFailsClosed(label, transformDocument) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const google = [];
  const collect = [];
  await context.addInitScript(() => localStorage.setItem('flower-shop-vn.analytics-consent', 'granted'));
  await installNetworkGate(context, {
    collect,
    unexpectedGoogle: google,
    allowTag: false,
    transformDocument,
  });
  const page = await context.newPage();
  await page.goto(base + '/contact/');
  await page.waitForTimeout(300);
  assert.deepEqual(google, [], label + '不得下載標籤或發出其他Google請求');
  assert.deepEqual(collect, [], label + '不得傳送collector');
  assert.equal(await page.locator('[data-ga4-id]').count(), 0, label + '必須維持GA停用');
  await context.close();
}

try {
  for (const [label, replacement] of [
    ['canonical缺失', ''],
    ['canonical格式錯誤', '<link rel="canonical" href="not a url">'],
    ['canonical跨來源', '<link rel="canonical" href="https://evil.example/contact/">'],
  ]) {
    await assertCanonicalFailsClosed(label, html => (
      html.replace(/<link rel="canonical" href="[^"]+">/, replacement)
    ));
  }
  findings.push('瀏覽器網路層：canonical缺失、格式錯誤與跨來源時均為零Google請求');

  // 已保存拒絕狀態時，頁面可正常開啟，但不得下載標籤或傳送Google分析請求。
  const deniedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const deniedGoogleRequests = [];
  const deniedCollect = [];
  const deniedExternal = [];
  await deniedContext.addInitScript(() => localStorage.setItem('flower-shop-vn.analytics-consent', 'denied'));
  await installNetworkGate(deniedContext, {
    collect: deniedCollect,
    unexpectedGoogle: deniedGoogleRequests,
    otherExternal: deniedExternal,
    allowTag: false,
  });
  const deniedPage = await deniedContext.newPage();
  await deniedPage.goto(`${base}/contact/?work=R045&utm_campaign=${sentinel}#inquiry`);
  assert.equal(new URL(deniedPage.url()).search, '', '拒絕狀態仍須清除query並保留作品預填');
  assert.ok((await deniedPage.locator('[data-inquiry-template]').inputValue()).includes('R045'));
  await deniedPage.evaluate(() => document.addEventListener('click', event => {
    if (event.target.closest('a')) event.preventDefault();
  }, { capture: true }));
  for (const href of [
    'https://line.me/ti/p/s2339956',
    'https://zalo.me/0836058119',
    'mailto:s2339956@gmail.com',
    'tel:+886916316950',
    'https://shopee.tw/product/3151001/29700986020/',
  ]) await deniedPage.locator('a[href="' + href + '"]').first().click();
  await deniedPage.evaluate(value => {
    const links = [
      '/contact/?work=R045#inquiry',
      '/contact/?work=M999&private=' + value + '#inquiry',
      'https://line.me/ti/p/s2339956?private=' + value,
      'https://unknown.example/contact?private=' + value,
    ];
    for (const href of links) {
      const link = document.createElement('a');
      link.href = href;
      document.body.append(link);
      link.click();
    }
    navigator.clipboard.writeText = async () => {};
  }, sentinel);
  await deniedPage.locator('[data-copy-inquiry]').click();
  await deniedPage.waitForTimeout(300);
  assert.deepEqual(deniedGoogleRequests, [], '已拒絕狀態不得發出Google請求');
  assert.deepEqual(deniedCollect, [], '已拒絕狀態多種互動後仍不得發出collector');
  assert.deepEqual(deniedExternal, [], '已拒絕狀態不得連線到聯絡平台或未知外部網站');
  await deniedContext.close();
  findings.push('瀏覽器網路層：保存拒絕狀態的五渠道、作品、惡意href與複製互動均為零Google請求');

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const unexpectedGoogleRequests = [];
  const otherExternalRequests = [];
  const approvedTagRequests = [];
  // 真實標籤可下載；分析請求只在本機回204，既不外送，也避免abort觸發重試而誤判重複事件。
  await installNetworkGate(context, {
    collect: attemptedCollect,
    tagRequests: approvedTagRequests,
    unexpectedGoogle: unexpectedGoogleRequests,
    otherExternal: otherExternalRequests,
  });
  await context.addInitScript(value => {
    Object.defineProperty(document, 'referrer', { get: () => `https://www.google.com/search?q=${value}` });
  }, sentinel);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith('https://www.googletagmanager.com/gtag/js') && response.ok()) tagLoaded = true;
  });
  await page.goto(`${base}/contact/?work=R045&utm_campaign=${sentinel}&phone=${sentinel}#inquiry`);
  assert.ok((await page.locator('[data-inquiry-template]').inputValue()).includes('R045'));
  assert.equal(new URL(page.url()).search, '', '清理網址不得破壞已驗證作品預填');
  assert.equal(new URL(page.url()).hash, '#inquiry');
  assert.deepEqual(unexpectedGoogleRequests, [], '未同意不得連線至未核准Google端點');
  assert.deepEqual(otherExternalRequests, [], '未同意不得連線至其他未核准服務');
  assert.deepEqual(approvedTagRequests, [], '未同意不得下載核准的Google標籤');
  await runAndWaitForGAEvent({
    page,
    name: 'page_view',
    pageLocation: 'https://flower-shop-vn.com/contact/',
    label: 'main-contact-page-view',
    action: () => page.locator('[data-analytics-allow]').click(),
    collect: attemptedCollect,
    tagLoaded: () => tagLoaded,
    errors,
  });

  // 測試只阻止測試頁的原生導頁，仍會經過正式事件監聽；不開啟聯絡平台或傳訊。
  await page.evaluate(() => document.addEventListener('click', event => {
    if (event.target.closest('a')) event.preventDefault();
  }, { capture: true }));
  const contactLinks = [
    'https://line.me/ti/p/s2339956',
    'https://zalo.me/0836058119',
    'mailto:s2339956@gmail.com',
    'tel:+886916316950',
    'https://shopee.tw/product/3151001/29700986020/',
  ];
  for (const href of contactLinks) await page.locator(`a[href="${href}"]`).first().click();
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/contact/?work=R045#inquiry';
    link.textContent = '測試作品詢價';
    document.body.append(link);
    link.click();
    const rejected = document.createElement('a');
    rejected.href = '/contact/?work=M999&private=SEO_PRIVATE_SENTINEL_20261106#inquiry';
    rejected.textContent = '無效測試詢價';
    document.body.append(rejected);
    rejected.click();
    for (const href of [
      'https://line.me/ti/p/s2339956?private=SEO_PRIVATE_SENTINEL_20261106',
      'https://unknown.example/contact?channel=unknown&private=SEO_PRIVATE_SENTINEL_20261106',
    ]) {
      const rejectedContact = document.createElement('a');
      rejectedContact.href = href;
      rejectedContact.textContent = '無效聯絡測試';
      document.body.append(rejectedContact);
      rejectedContact.click();
    }
  });
  await page.evaluate(value => {
    document.querySelector('[data-inquiry-template]').value += `\n測試地址與卡片：${value}`;
    navigator.clipboard.writeText = async () => {};
  }, sentinel);
  const copyCollect = page.waitForRequest(request => /(?:[?&\n]|^)en=inquiry_copy(?:[&\s]|$)/.test(`${request.url()}&${request.postData() || ''}`), { timeout: 6000 }).catch(() => null);
  await page.locator('[data-copy-inquiry]').click();
  const events = () => page.evaluate(() => window.dataLayer.filter(item => item[0] === 'event').map(item => [item[1], item[2]]));
  let recorded = await events();
  assert.equal(recorded.filter(([name]) => name === 'contact_click').length, 5);
  assert.equal(recorded.filter(([name]) => name === 'work_inquiry').length, 1);
  assert.equal(recorded.filter(([name]) => name === 'inquiry_copy').length, 1);
  for (const [, parameters] of recorded) {
    assert.equal(parameters.page_location, 'https://flower-shop-vn.com/contact/');
    assert.equal(parameters.page_referrer, 'https://www.google.com');
  }
  assert.ok(!JSON.stringify(recorded).includes(sentinel), '頁面、來源或詢價內容不可進入dataLayer');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await page.locator('[data-copy-inquiry]').click();
  assert.equal((await events()).filter(([name]) => name === 'inquiry_copy').length, 1, '失敗複製不可算成功');
  await page.evaluate(value => history.pushState({}, '', `${location.pathname}#${value}`), sentinel);
  assert.ok(await copyCollect, '真實SDK必須送出成功複製事件');
  await page.getByRole('button', { name: '分析偏好設定', exact: true }).click();
  await page.locator('[data-analytics-deny]').click();
  const collectCountAtWithdrawal = attemptedCollect.length;
  await page.locator('a[href="https://line.me/ti/p/s2339956"]').first().click();
  assert.equal((await events()).length, recorded.length, '撤回後不可追加自訂事件');
  await page.waitForTimeout(1200);
  assert.equal(attemptedCollect.length, collectCountAtWithdrawal, '撤回同意後不得新增collector請求');
  await page.getByRole('button', { name: '分析偏好設定', exact: true }).click();
  await page.locator('[data-analytics-allow]').click();
  await page.waitForTimeout(1200);
  const eventsAfterReallow = await events();
  assert.equal(eventsAfterReallow.filter(([name]) => name === 'page_view').length, 1, '同頁重新允許不得重複page_view');
  assert.equal(eventsAfterReallow.length, recorded.length, '同頁重新允許不得重送既有互動事件');
  assert.deepEqual(unexpectedGoogleRequests, [], '允許後只可使用核准SDK與collector端點');
  assert.deepEqual(otherExternalRequests, [], '測試互動不得連線到聯絡平台或未知外部網站');
  assert.deepEqual(
    approvedTagRequests,
    ['https://www.googletagmanager.com/gtag/js?id=' + measurementId],
    '允許後只能下載一次新ID的核准SDK',
  );
  const decodedCollect = decodeURIComponent(JSON.stringify(attemptedCollect));
  assert.ok(!decodedCollect.includes(sentinel), '攔截的真實GA請求不可含私密測試值');
  assert.doesNotMatch(
    decodedCollect,
    /s2339956|0836058119|916316950|gmail\.com|line\.me|zalo\.me|shopee\.tw/,
    '真實GA請求不得包含聯絡網址、帳號、電話或Email',
  );
  const attemptedEvents = parseEvents(attemptedCollect);
  for (const parameters of attemptedEvents) {
    assert.equal(parameters.tid, measurementId, '真實事件只能送到本站評估ID');
    assert.equal(parameters.dl, 'https://flower-shop-vn.com/contact/', '真實GA請求須使用固定canonical');
    assert.equal(parameters.dr, 'https://www.google.com', '真實GA請求須使用固定來源origin');
  }
  assert.equal(tagLoaded, true, '未下載真實gtag.js，候選驗收不得視為通過');
  assert.ok(attemptedEvents.length > 0, '真實SDK沒有collector事件，候選驗收不得視為通過');
  assert.equal(attemptedEvents.filter(parameters => parameters.en === 'page_view').length, 1, 'page_view 必須恰好一筆');
  assert.equal(attemptedEvents.filter(parameters => parameters.en === 'contact_click').length, 5, '五種聯絡渠道必須各一筆');
  assert.equal(attemptedEvents.filter(parameters => parameters.en === 'work_inquiry').length, 1, '合法作品詢價必須恰好一筆');
  assert.equal(attemptedEvents.filter(parameters => parameters.en === 'inquiry_copy').length, 1, '成功複製必須恰好一筆');
  const channels = [];
  for (const parameters of attemptedEvents) {
    const customKeys = Object.keys(parameters).filter(key => /^epn?\./.test(key)).sort();
    if (parameters.en === 'contact_click') {
      assert.deepEqual(customKeys, ['ep.channel'], '聯絡事件只能有channel自訂欄位');
      channels.push(parameters['ep.channel']);
    } else if (parameters.en === 'work_inquiry') {
      assert.deepEqual(customKeys, ['ep.work_code'], '作品事件只能有work_code自訂欄位');
      assert.equal(parameters['ep.work_code'], 'R045', '真實作品事件只可傳合法作品編號');
    } else {
      assert.deepEqual(customKeys, [], parameters.en + '不得帶自訂欄位');
    }
  }
  assert.deepEqual(channels.sort(), ['email', 'line', 'phone', 'shopee', 'zalo'], '五種渠道值必須各出現一次');
  assert.deepEqual(errors, []);
  findings.push('真實頁面：作品預填、query清理、同意前零Google連線、固定事件、複製失敗與撤回停送通過');

  await context.close();

  // 真正換頁會重新初始化頁面；每個文件只可各送一筆canonical page_view。
  const navigationContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const navigationCollect = [];
  const navigationUnexpectedGoogle = [];
  const navigationExternal = [];
  let navigationTagLoaded = false;
  await navigationContext.addInitScript(() => localStorage.setItem('flower-shop-vn.analytics-consent', 'granted'));
  await installNetworkGate(navigationContext, {
    collect: navigationCollect,
    unexpectedGoogle: navigationUnexpectedGoogle,
    otherExternal: navigationExternal,
  });
  const navigationPage = await navigationContext.newPage();
  const navigationErrors = [];
  navigationPage.on('pageerror', error => navigationErrors.push(error.message));
  navigationPage.on('response', response => {
    if (response.url().startsWith('https://www.googletagmanager.com/gtag/js') && response.ok()) navigationTagLoaded = true;
  });
  await runAndWaitForGAEvent({
    page: navigationPage,
    name: 'page_view',
    pageLocation: 'https://flower-shop-vn.com/',
    label: 'navigation-home-page-view',
    action: () => navigationPage.goto(base + '/'),
    collect: navigationCollect,
    tagLoaded: () => navigationTagLoaded,
    errors: navigationErrors,
  });
  await runAndWaitForGAEvent({
    page: navigationPage,
    name: 'page_view',
    pageLocation: 'https://flower-shop-vn.com/faq/',
    label: 'navigation-faq-page-view',
    action: () => navigationPage.goto(base + '/faq/'),
    collect: navigationCollect,
    tagLoaded: () => navigationTagLoaded,
    errors: navigationErrors,
  });
  const navigationEvents = parseEvents(navigationCollect);
  assert.equal(navigationTagLoaded, true, '跨頁測試必須取得真實gtag.js');
  assert.deepEqual(navigationUnexpectedGoogle, [], '跨頁只可使用核准SDK與collector端點');
  assert.deepEqual(navigationExternal, [], '跨頁不得連線到其他未核准外部服務');
  assert.deepEqual(navigationErrors, [], '跨頁不得有未處理JavaScript錯誤');
  assert.ok(navigationEvents.every(parameters => parameters.tid === measurementId), '跨頁事件只能送到新ID');
  assert.deepEqual(
    navigationEvents.filter(parameters => parameters.en === 'page_view').map(parameters => parameters.dl),
    ['https://flower-shop-vn.com/', 'https://flower-shop-vn.com/faq/'],
    '每次完整換頁必須只送一筆對應canonical page_view',
  );
  assert.deepEqual(
    navigationEvents.filter(parameters => parameters.en !== 'page_view').map(parameters => parameters.en),
    [],
    '未互動跨頁不得產生其他自動事件',
  );
  await navigationContext.close();
  findings.push('真實SDK跨頁：首頁與FAQ各一筆page_view，沒有其他自動事件');

  // GA4 的自動收集與Enhanced Measurement是不同層；實際停留後換頁，觀察是否產生額外en。
  const engagementContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const engagementCollect = [];
  const engagementUnexpectedGoogle = [];
  const engagementExternal = [];
  let engagementTagLoaded = false;
  await engagementContext.addInitScript(value => {
    localStorage.setItem('flower-shop-vn.analytics-consent', 'granted');
    Object.defineProperty(document, 'referrer', { get: () => 'https://www.google.com/search?q=' + value });
  }, sentinel);
  await installNetworkGate(engagementContext, {
    collect: engagementCollect,
    unexpectedGoogle: engagementUnexpectedGoogle,
    otherExternal: engagementExternal,
  });
  const engagementPage = await engagementContext.newPage();
  const engagementErrors = [];
  engagementPage.on('pageerror', error => engagementErrors.push(error.message));
  engagementPage.on('response', response => {
    if (response.url().startsWith('https://www.googletagmanager.com/gtag/js') && response.ok()) engagementTagLoaded = true;
  });
  await runAndWaitForGAEvent({
    page: engagementPage,
    name: 'page_view',
    pageLocation: 'https://flower-shop-vn.com/',
    label: 'engagement-home-page-view',
    action: () => engagementPage.goto(base + '/'),
    collect: engagementCollect,
    tagLoaded: () => engagementTagLoaded,
    errors: engagementErrors,
  });
  await engagementPage.waitForTimeout(12500);
  // 使用真正的完整換頁觸發pagehide，不把人工visibilityState覆寫當成正式瀏覽器證據。
  await runAndWaitForGAEvent({
    page: engagementPage,
    name: 'page_view',
    pageLocation: 'https://flower-shop-vn.com/faq/',
    label: 'engagement-faq-page-view',
    action: () => engagementPage.goto(base + '/faq/'),
    collect: engagementCollect,
    tagLoaded: () => engagementTagLoaded,
    errors: engagementErrors,
  });
  const engagementEvents = parseEvents(engagementCollect);
  const engagementAutomaticEvents = engagementEvents
    .filter(parameters => parameters.en !== 'page_view')
    .map(parameters => parameters.en);
  assert.equal(engagementTagLoaded, true, '長停留情境必須取得真實gtag.js');
  assert.deepEqual(engagementUnexpectedGoogle, [], '長停留情境只可使用核准SDK與collector端點');
  assert.deepEqual(engagementExternal, [], '長停留情境不得連線到其他未核准外部服務');
  assert.deepEqual(engagementErrors, [], '長停留情境不得有未處理JavaScript錯誤');
  assert.ok(engagementEvents.every(parameters => parameters.tid === measurementId), '長停留事件只能送到新ID');
  assert.ok(
    engagementEvents.every(parameters => [
      'https://flower-shop-vn.com/',
      'https://flower-shop-vn.com/faq/',
    ].includes(parameters.dl)),
    '長停留事件必須固定為兩個測試頁的canonical',
  );
  assert.ok(
    engagementEvents.every(parameters => parameters.dr === 'https://www.google.com'),
    '長停留事件必須使用清理後來源origin',
  );
  assert.doesNotMatch(
    decodeURIComponent(JSON.stringify(engagementCollect)),
    new RegExp(sentinel),
    '長停留與換頁的collector不得含query或referrer sentinel',
  );
  await engagementContext.close();
  findings.push(
    engagementAutomaticEvents.length
      ? '真實SDK長停留後觀察到自動事件：' + [...new Set(engagementAutomaticEvents)].join('、')
      : '真實SDK長停留12秒後換頁，未觀察到額外自動事件',
  );

  // 內容增加後仍需直接驗證手機與桌面可閱讀；此context始終拒絕分析。
  const visual = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await visual.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await visual.addInitScript(() => localStorage.setItem('flower-shop-vn.analytics-consent', 'denied'));
  const view = await visual.newPage();
  for (const width of [375, 390, 768, 1440]) {
    await view.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const route of ['/services/opening-stand-vietnam/', '/gallery/R045/', '/blog/ho-chi-minh-same-day-flower-rules/', '/ordering-policy/']) {
      await view.goto(base + route);
      assert.equal(await view.locator('h1').count(), 1);
      assert.ok(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width}px 橫向溢出`);
      assert.equal(await view.locator('#main-content').count(), 1);
      if (width === 390 || width === 1440) {
        await view.screenshot({ path: `${output}/${route.split('/').filter(Boolean).join('-')}-${width}.png`, fullPage: true });
      }
    }
  }
  findings.push('新增內容代表頁375/390/768/1440px無橫向溢出、單一H1與有效略過導覽目標');
  await visual.close();
  const automaticEvents = attemptedEvents
    .map(parameters => parameters.en)
    .filter(name => !['page_view', 'contact_click', 'work_inquiry', 'inquiry_copy'].includes(name));
  assert.deepEqual(automaticEvents, [], '不得觀察到核准事件以外的自動事件');
  const report = {
    status: 'LOCAL_BROWSER_PASSED', base, browser: browser.version(), findings,
    real_tag_downloaded: tagLoaded, attempted_collect_count: attemptedCollect.length,
    attempted_events: attemptedEvents.map(parameters => ({ name: parameters.en, sequence: parameters._s, page_location: parameters.dl, page_referrer: parameters.dr })),
    extra_history_pageviews: Math.max(0, attemptedEvents.filter(parameters => parameters.en === 'page_view').length - 1),
    observed_automatic_events: automaticEvents,
    consent_matrix: ['unselected', 'stored_denied', 'granted', 'withdrawn', 'regranted'],
    rejected_canonical_cases: ['missing', 'malformed', 'cross_origin'],
    navigation_pageviews: navigationEvents.filter(parameters => parameters.en === 'page_view').map(parameters => parameters.dl),
    engagement_observation: engagementEvents.map(parameters => ({
      name: parameters.en,
      page_location: parameters.dl,
      page_referrer: parameters.dr,
    })),
    engagement_automatic_events: engagementAutomaticEvents,
    external_ga_stream_status: 'NOT_CHECKED_BY_THIS_SCRIPT',
    release_gate: engagementAutomaticEvents.length
      ? 'REVIEW_REQUIRED_AUTOMATIC_EVENTS：長停留後觀察到GA4自動收集事件，未修訂事件契約前不得發布'
      : 'LOCAL_REQUEST_CONTRACT_PASSED：GA後台設定及正式站收件須另行驗證',
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (engagementAutomaticEvents.length) {
    console.error('長停留後出現未核准自動事件，已保存報告並阻擋候選發布。');
    process.exitCode = 2;
  }
} finally {
  await browser.close();
}
