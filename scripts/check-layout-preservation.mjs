import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// 以核准前的原站逐項比對；文案可改高度，樣式與固定元件不得隨 SEO 改版。
const [before = 'http://127.0.0.1:4328', after = 'http://127.0.0.1:4329'] = process.argv.slice(2);
const evidence = 'dev-notes/seo-original-layout-20261106';
const output = `${evidence}/review`;
const baseline = JSON.parse(await readFile(`${evidence}/baseline-manifest.json`, 'utf8'));
const digest = data => createHash('sha256').update(data).digest('hex');
const fixed = Object.keys(baseline.files).filter(file =>
  /^(?:assets\/css\/|images\/|\.github\/workflows\/)/.test(file) ||
  ['scripts/site-components.mjs', 'wrangler.jsonc', '_headers', 'robots.txt'].includes(file));
for (const file of fixed) assert.equal(digest(await readFile(file)), baseline.files[file].sha256, `${file} 不得改動`);

const sitemap = await readFile('sitemap.xml', 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
assert.equal(routes.length, 119);
const normalize = text => text.replace(/\s+(?:id="site-navigation"|aria-controls="site-navigation")/g, '').replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
const shell = html => [
  html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0],
  html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0],
  html.match(/<nav class="floating-contact"[\s\S]*?<\/nav>/)?.[0],
].map(value => { assert.ok(value, '共用版型不可缺少'); return normalize(value); });
for (const route of [...routes, '/404.html']) {
  const file = route === '/' ? 'index.html' : route.endsWith('.html') ? route.slice(1) : `${route.slice(1)}index.html`;
  const old = await readFile(`${evidence}/baseline/${file}`, 'utf8');
  const current = await readFile(file, 'utf8');
  assert.deepEqual(shell(current), shell(old), `${route} 導覽、頁尾與浮動聯絡結構必須相同`);
  assert.deepEqual([...current.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]),
    [...old.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]), `${route} 必須使用原 CSS`);
}

await mkdir(output, { recursive: true });
const runtime = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.js'));
const browser = await (runtime.default || runtime).chromium.launch({ channel: 'chrome', headless: true });
const report = { baseline_commit: baseline.commit, fixed_files: fixed.length, shell_pages: routes.length + 1, checks: [], screenshots: [], external_requests_blocked: true };
const sampleRoutes = ['/', '/gallery/', '/gallery/R045/', '/services/birthday-flowers-vietnam/', '/cities/ho-chi-minh/', '/pricing/', '/ordering-policy/', '/blog/ho-chi-minh-same-day-flower-rules/'];
try {
  for (const width of [375, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    // 比較圖不載入任何外部分析服務，也不把檢查動作當訪客成效。
    await context.addInitScript(() => localStorage.setItem('flower-shop-vn.analytics-consent', 'denied'));
    await context.route('**/*', route => [new URL(before).origin, new URL(after).origin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    for (const route of sampleRoutes) {
      const readings = [];
      for (const [label, base] of [['before', before], ['after', after]]) {
        await page.goto(new URL(route, base).href, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        if (route !== '/gallery/') {
          // 截圖前確實解碼實拍圖，避免剛載入的lazy圖片被拍成空白；不修改來源或樣式。
          await page.locator('main img').evaluateAll(images => Promise.all(images.map(async image => {
            image.loading = 'eager';
            await image.decode();
          })));
        }
        readings.push(await page.evaluate(() => {
          const measure = selector => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, position: style.position, font: style.fontFamily, color: style.color, background: style.backgroundColor };
          };
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            header: measure('.site-header'), floating: measure('.floating-contact'),
            footer: measure('.site-footer'),
            hero: ['.hero-panel', '.hero-grid', '.hero-visual', '.hero-photo-main', '.hero-photo-side', '.hero-photo-small', '.hero-copy h1'].map(measure),
            mainSections: [...document.querySelector('main').children].filter(element => element.tagName === 'SECTION').map(element => element.className),
            images: [...document.querySelectorAll('main img')].map(image => ({ source: image.getAttribute('data-image-source') || image.getAttribute('src'), width: image.getAttribute('width'), height: image.getAttribute('height') })),
          };
        }));
        if (width === 390 || width === 1440) {
          const size = width === 390 ? 'mobile' : 'desktop';
          const name = route === '/' ? 'home' : route === '/gallery/R045/' ? 'work-r045' : route === '/ordering-policy/' ? 'policy' : null;
          if (name) {
            const filename = `${label}-${name}-${size}.png`;
            await page.screenshot({ path: `${output}/${filename}`, fullPage: name !== 'home' });
            report.screenshots.push(filename);
          }
          if (route === '/' && label === 'after') await page.screenshot({ path: `${output}/after-home-${size}-full.png`, fullPage: true });
        }
      }
      const [old, current] = readings;
      assert.equal(current.overflow, false, `${route} ${width}px 不可橫向溢出`);
      assert.deepEqual(current.header, old.header, `${route} ${width}px 導覽幾何/樣式不得變`);
      assert.deepEqual(current.floating, old.floating, `${route} ${width}px 聯絡按鈕位置/樣式不得變`);
      // 內文長度會改變頁尾的 y，其他幾何與樣式仍應維持。
      assert.deepEqual({ ...current.footer, y: 0 }, { ...old.footer, y: 0 }, `${route} ${width}px 頁尾樣式不得變`);
      assert.deepEqual(current.mainSections, old.mainSections, `${route} 區塊順序與class不得變`);
      assert.deepEqual(current.images, old.images, `${route} 圖片來源與原始尺寸不得變`);
      if (route === '/') assert.deepEqual(current.hero, old.hero, `${width}px 首頁主視覺幾何不得變`);
      report.checks.push({ route, width, preserved: true });
    }
    await context.close();
  }
  report.status = 'PASS';
  await writeFile(`${evidence}/layout-report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`原版型保留驗收通過：${fixed.length}固定檔案、${routes.length + 1}頁shell、${report.checks.length}組瀏覽器比較。`);
} finally { await browser.close(); }
