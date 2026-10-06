import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { catalog, workCodes } from './site-components.mjs';
const photoCount = catalog.flatMap(group => group.works.flatMap(work => work.photos)).length;
const runtime = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.js'));
const { chromium } = runtime.default || runtime;
const base = process.argv[2] || 'http://127.0.0.1:4318';
const output = 'dev-notes/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const findings = [];
const errors = [];
const requests = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    requests.push(route.request().url());
    return new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const go = async route => { await page.goto(new URL(route, base).href); await page.waitForTimeout(150); };
  await go('/');
  assert.equal(await page.locator('h1').innerText(), '越南送花，用中文就能安排。');
  assert.equal(await page.locator('.analytics-consent').evaluate(e => getComputedStyle(e).position), 'relative');
  assert.ok(!requests.some(url => /googletagmanager|google-analytics/.test(url)), '未同意不得發出 GA4 請求');
  await page.locator('[data-nav-toggle] span').first().click();
  assert.equal(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: `${output}/home-mobile.png` });
  findings.push('首頁、同意前零 GA4 請求、漢堡子元素點擊及 Escape 正常');

  await go('/gallery/');
  assert.equal(await page.locator('.portfolio-work').count(), workCodes.length);
  assert.equal(await page.locator('.portfolio-work img').count(), photoCount);
  await page.screenshot({ path: `${output}/gallery-mobile.png` });
  await page.locator('[data-gallery-filter="money-bouquets"]').click();
  assert.equal(await page.locator('.portfolio-work:visible').count(), 12);
  await page.locator('[data-gallery-filter="vase-arrangements"]').click();
  assert.equal(await page.locator('.portfolio-work:visible').count(), 1);
  await page.goBack();
  assert.equal(await page.locator('.portfolio-work:visible').count(), 12);
  await page.locator('[data-gallery-filter="all"]').click();
  await page.locator('[data-work-search]').fill('R040');
  assert.equal(await page.locator('.portfolio-work:visible').count(), 1);
  const imageLink = page.locator('#work-R040 > a').first();
  await imageLink.click();
  const dialog = page.locator('dialog');
  assert.equal(await dialog.evaluate(e => e.open), true);
  await page.waitForFunction(() => document.querySelector('dialog img')?.naturalWidth > 0);
  assert.ok((await dialog.locator('figcaption').innerText()).includes('R040'));
  assert.equal(await dialog.locator('a[href*="/contact/"]').getAttribute('href'), '/contact/?work=R040#inquiry');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await dialog.getByRole('button', { name: /複製作品連結/ }).click();
  assert.ok((await dialog.locator('[role="status"]').innerText()).includes('https://flower-shop-vn.com/gallery/R040/'));
  await page.screenshot({ path: `${output}/lightbox-mobile.png` });
  await page.keyboard.press('Escape');
  assert.equal(await dialog.evaluate(e => e.open), false);
  assert.equal(await imageLink.evaluate(e => e === document.activeElement), true);
  await page.locator('[data-work-search]').fill('no-such-work');
  assert.equal(await page.locator('.portfolio-work:visible').count(), 0);
  await page.evaluate(() => { location.hash = 'work-B006'; });
  await page.waitForFunction(() => document.querySelector('[data-work-search]').value === '');
  assert.equal(await page.locator('#work-B006').isVisible(), true);
  await page.locator('#work-B006 > a').click();
  await dialog.getByRole('button', { name: /下一張/ }).click();
  assert.ok((await dialog.locator('img').getAttribute('src')).includes('b006-angle-2'));
  await page.keyboard.press('Escape');
  findings.push('作品分類、返回、搜尋、空結果、深連結、放大、另一角度、關閉焦點回復正常');

  // 只攔截放大原圖，縮圖照常載入，驗證網路失敗時仍有明確備援。
  await page.route('**/images/gallery/2026/r040.webp', route => route.abort());
  await go('/gallery/');
  await page.locator('#work-R040 > a').click();
  await page.locator('.gallery-lightbox-original').waitFor({ state: 'visible' });
  assert.ok((await page.locator('.gallery-lightbox-status').innerText()).includes('載入失敗'));
  await page.keyboard.press('Escape');
  await page.unroute('**/images/gallery/2026/r040.webp');
  findings.push('放大圖片失敗提供原圖備援，複製拒絕提供正式作品網址');

  await go('/contact/?work=R040#inquiry');
  assert.ok((await page.locator('[data-inquiry-template]').inputValue()).includes('R040（https://flower-shop-vn.com/gallery/R040/）'));
  assert.ok((await page.locator('[data-selected-work]').innerText()).includes('R040'));
  // 模擬瀏覽器拒絕剪貼簿，不寫入使用者剪貼簿或傳送詢價。
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await page.locator('[data-copy-inquiry]').click();
  assert.ok((await page.locator('[data-copy-status]').innerText()).includes('手動複製'));
  await go('/contact/?work=M999#inquiry');
  assert.ok(!(await page.locator('[data-inquiry-template]').inputValue()).includes('M999'));
  assert.ok((await page.locator('[data-copy-status]').innerText()).includes('找不到'));
  findings.push('作品預填、未知編號拒絕、剪貼簿拒絕備援正常');

  for (const width of [375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const route of ['/', '/gallery/', '/contact/', '/cities/hanoi/']) {
      await go(route);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width}px 橫向溢出`);
    }
    if (width === 1440) { await go('/'); await page.screenshot({ path: `${output}/home-desktop.png` }); }
  }
  findings.push('375、390、768、1440px 四種寬度，四個主要頁面無橫向溢出');
  const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallback = await noJS.newPage();
  await fallback.goto(base + '/gallery/');
  assert.equal(await fallback.locator('.portfolio-work').count(), workCodes.length);
  assert.equal(await fallback.locator('[data-work-search]').isVisible(), false);
  assert.equal(await fallback.locator('nav[aria-label="作品分類"]').isVisible(), true);
  assert.equal(await fallback.locator('#work-R040 a[href*="/contact/"]').getAttribute('href'), '/contact/?work=R040#inquiry');
  await fallback.goto(base + '/faq/');
  await fallback.locator('details.faq-item summary').first().click();
  assert.equal(await fallback.locator('details.faq-item').first().evaluate(e => e.open), true);
  await noJS.close();
  findings.push('無 JavaScript 時作品、分類與詢價連結仍可用');
  assert.deepEqual(errors, [], '瀏覽器不得有未處理 JavaScript 錯誤');
  await writeFile(`${output}/report.json`, JSON.stringify({ browser: browser.version(), base, findings, errors }, null, 2) + '\n');
  console.log(findings.join('\n'));
} finally { await browser.close(); }
