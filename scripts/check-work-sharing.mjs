import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { catalog } from './site-components.mjs';

const base = process.argv.find(arg => /^https?:/.test(arg)) || 'http://127.0.0.1:4318';
// 分享機器人不執行 JavaScript：直接核對每件作品的原始 HTML 與縮圖。
if (!process.argv.includes('--browser-only')) {
  assert.doesNotMatch(await readFile('index.html', 'utf8'), /href="\/gallery\/#work-[A-Z]\d{3}"/, '首頁作品入口也必須使用獨立作品網址');
  for (const work of catalog.flatMap(group => group.works)) {
    const html = await readFile(`gallery/${work.id}/index.html`, 'utf8');
    assert.equal((html.match(/class="[^"]*portfolio-work/g) || []).length, 1, `${work.id} 應只顯示一件作品`);
    assert.ok(html.includes(`href="https://flower-shop-vn.com/gallery/${work.id}/"`), `${work.id} 缺少獨立 canonical`);
    const image = html.match(/property="og:image" content="([^"]+)"/)[1];
    assert.ok(image.includes(`/images/social/work-${work.id.toLowerCase()}-`), `${work.id} 分享圖應對應該作品`);
    assert.ok(html.includes(`name="twitter:image" content="${image}"`));
    assert.ok(html.includes(`data-image-source="${work.photos[0].src}"`), `${work.id} 主圖必須保留自己的作品身分`);
    await readFile(new URL(image).pathname.slice(1));
  }
}

const runtime = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.js'));
const { chromium } = runtime.default || runtime;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  // 直接在網址列貼舊作品錨點，必須只出現目標作品，並仍可回到全部作品。
  await page.goto(`${base}/gallery/#work-B013`);
  await page.waitForFunction(() => document.querySelector('[data-gallery-search]')?.hidden === false);
  assert.equal(await page.locator('.portfolio-work:visible').count(), 1, '舊作品連結不能同時顯示整個分類');
  assert.equal(await page.locator('.portfolio-work:visible').getAttribute('id'), 'work-B013');
  if (process.argv.includes('--browser-only')) process.exitCode = 0;
  else {
    await page.locator('[data-gallery-filter="all"]').click();
    assert.equal(await page.locator('.portfolio-work:visible').count(), 93);
    await page.goBack();
    assert.equal(await page.locator('.portfolio-work:visible').count(), 1);
    await page.goto(`${base}/gallery/B013/`);
    assert.match(await page.locator('h1').innerText(), /B013/);
    assert.equal(await page.locator('.portfolio-work:visible').count(), 1);
    await page.locator('details.work-angles summary').click();
    const alternate = page.locator('details.work-angles img');
    await alternate.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('details.work-angles img')?.naturalWidth > 0);
    assert.match(await alternate.getAttribute('data-image-source'), /b013-angle-2-clean/);
    await page.locator('details.work-angles > a').click();
    await page.waitForFunction(() => document.querySelector('dialog img')?.naturalWidth > 0);
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
    await page.getByRole('button', { name: '複製作品連結' }).click();
    assert.match(await page.locator('.gallery-lightbox-status').innerText(), /https:\/\/flower-shop-vn\.com\/gallery\/B013\//);
    await page.keyboard.press('Escape');
    await mkdir('dev-notes/work-sharing', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'dev-notes/work-sharing/B013-mobile.png', fullPage: true });
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/gallery/B013/`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 不得橫向溢出`);
    }
    await page.screenshot({ path: 'dev-notes/work-sharing/B013-desktop.png', fullPage: true });
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const plain = await noJS.newPage();
    await plain.goto(`${base}/gallery/B013/`);
    assert.equal(await plain.locator('.portfolio-work:visible').count(), 1);
    await noJS.close();
    await writeFile('dev-notes/work-sharing/browser-result.json', JSON.stringify({ base, status: 'passed', works: 93, checks: ['舊錨點單作品', '返回全部與瀏覽器返回', 'B013 修圖', '獨立頁分享連結', '375/390/768/1440 排版', '無 JavaScript'] }, null, 2));
  }
  console.log('作品連結與分享檢查通過。');
} finally { await browser.close(); }
