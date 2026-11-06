import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.js';
const runtime = await import(pathToFileURL(modulePath));
const { chromium } = runtime.default || runtime;
const base = process.argv[2] || 'http://127.0.0.1:4327';
const output = 'dev-notes/seo-20261106/browser';
const sentinel = 'SEO_PRIVATE_SENTINEL_20261106';
const measurementId = (await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8')).match(/const ANALYTICS_ID = "(G-[A-Z0-9]+)";/)?.[1];
assert.ok(measurementId, '必須能辨識正式程式的評估ID');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const attemptedCollect = [];
let tagLoaded = false;
const findings = [];

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const restrictedRequests = [];
  // 真實標籤可下載；分析請求只在本機回204，既不外送，也避免abort觸發重試而誤判重複事件。
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(base).origin) return route.continue();
    // 正式站的Cloudflare RUM與選用GA分開揭露，不把它誤判為未同意的Google請求。
    if (!['static.cloudflareinsights.com', 'cloudflareinsights.com'].includes(url.hostname)) restrictedRequests.push(request.url());
    if (url.origin === 'https://www.googletagmanager.com' && url.pathname === '/gtag/js') return route.continue();
    if (/google-analytics\.com$/.test(url.hostname) || url.pathname.includes('/collect')) {
      attemptedCollect.push({ url: request.url(), body: request.postData() || '' });
      return route.fulfill({ status: 204, body: '' });
    }
    return route.abort();
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
  assert.deepEqual(restrictedRequests, [], '未同意不得連線至Google或其他未核准服務');
  await page.locator('[data-analytics-allow]').click();
  await page.waitForTimeout(1200);

  // 測試只阻止測試頁的原生導頁，仍會經過正式事件監聽；不開啟聯絡平台或傳訊。
  await page.evaluate(() => document.addEventListener('click', event => {
    if (event.target.closest('a')) event.preventDefault();
  }, { capture: true }));
  await page.locator('a[href="https://line.me/ti/p/s2339956"]').first().click();
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/contact/?work=R045#inquiry';
    link.textContent = '測試作品詢價';
    document.body.append(link);
    link.click();
  });
  await page.evaluate(value => {
    document.querySelector('[data-inquiry-template]').value += `\n測試地址與卡片：${value}`;
    navigator.clipboard.writeText = async () => {};
  }, sentinel);
  const copyCollect = page.waitForRequest(request => /(?:[?&\n]|^)en=inquiry_copy(?:[&\s]|$)/.test(`${request.url()}&${request.postData() || ''}`), { timeout: 6000 }).catch(() => null);
  await page.locator('[data-copy-inquiry]').click();
  const events = () => page.evaluate(() => window.dataLayer.filter(item => item[0] === 'event').map(item => [item[1], item[2]]));
  let recorded = await events();
  assert.equal(recorded.filter(([name]) => name === 'contact_click').length, 1);
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
  await copyCollect;
  await page.getByRole('button', { name: '分析偏好設定', exact: true }).click();
  await page.locator('[data-analytics-deny]').click();
  const collectCountAtWithdrawal = attemptedCollect.length;
  await page.locator('a[href="https://line.me/ti/p/s2339956"]').first().click();
  assert.equal((await events()).length, recorded.length, '撤回後不可追加自訂事件');
  await page.waitForTimeout(1200);
  assert.equal(attemptedCollect.length, collectCountAtWithdrawal, '撤回同意後不得新增collector請求');
  assert.ok(!decodeURIComponent(JSON.stringify(attemptedCollect)).includes(sentinel), '攔截的真實GA請求不可含私密測試值');
  const attemptedEvents = attemptedCollect.flatMap(request => {
    const common = Object.fromEntries(new URL(request.url).searchParams);
    return (request.body || '').split('\n').map(line => ({ ...common, ...Object.fromEntries(new URLSearchParams(line)) }));
  }).filter(parameters => parameters.en);
  for (const parameters of attemptedEvents) {
    assert.equal(parameters.tid, measurementId, '真實事件只能送到本站評估ID');
    assert.equal(parameters.dl, 'https://flower-shop-vn.com/contact/', '真實GA請求須使用固定canonical');
    assert.equal(parameters.dr, 'https://www.google.com', '真實GA請求須使用固定來源origin');
  }
  if (tagLoaded && attemptedEvents.length) {
    for (const name of ['page_view', 'contact_click', 'work_inquiry', 'inquiry_copy']) {
      assert.equal(attemptedEvents.filter(parameters => parameters.en === name).length, 1, `${name} 必須恰好一筆`);
    }
  }
  assert.deepEqual(errors, []);
  findings.push('真實頁面：作品預填、query清理、同意前零Google連線、固定事件、複製失敗與撤回停送通過');

  // 內容增加後仍需直接驗證手機與桌面可閱讀；此context始終拒絕分析。
  await context.close();
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
  const automaticEvents = attemptedCollect.flatMap(request => {
    const raw = `${request.url}&${request.body}`;
    return [...raw.matchAll(/(?:[?&]|^)en=([^&\s]+)/g)].map(match => decodeURIComponent(match[1]));
  }).filter(name => !['page_view', 'contact_click', 'work_inquiry', 'inquiry_copy', 'user_engagement'].includes(name));
  const report = {
    status: 'LOCAL_BROWSER_PASSED', base, browser: browser.version(), findings,
    real_tag_downloaded: tagLoaded, attempted_collect_count: attemptedCollect.length,
    attempted_events: attemptedEvents.map(parameters => ({ name: parameters.en, sequence: parameters._s, page_location: parameters.dl, page_referrer: parameters.dr })),
    extra_history_pageviews: Math.max(0, attemptedEvents.filter(parameters => parameters.en === 'page_view').length - 1),
    observed_automatic_events: automaticEvents,
    external_ga_stream_status: 'NOT_CHECKED_BY_THIS_SCRIPT',
    release_gate: automaticEvents.length || attemptedEvents.filter(parameters => parameters.en === 'page_view').length > 1
      ? 'REFUTED_FIXED_GA_CONTRACT：觀察到自動事件或額外pageview，須核對並關閉Enhanced Measurement；本機互動通過不代表可發布量測'
      : tagLoaded && attemptedEvents.length
        ? 'LOCAL_REQUEST_CONTRACT_PASSED：GA後台設定及正式站收件須另行驗證'
        : 'INCONCLUSIVE：未取得真實標籤或collector請求，不能宣稱量測通過',
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
