import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 使用本機既有 Playwright；不自動下載瀏覽器或套件。可用環境變數指定其他安裝位置。
const modulePath = process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.js';
const playwright = await import(pathToFileURL(modulePath));
const { chromium } = playwright.default || playwright;
const [base = 'http://127.0.0.1:4317', destination = 'dev-notes/performance/before'] = process.argv.slice(2);
const out = path.resolve(destination);
await mkdir(out, { recursive: true });
const settings = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, cpuRate: 4, windowMs: 10000, runs: 3 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const route of ['/', '/gallery/', '/contact/', '/cities/hanoi/']) {
    const samples = [];
    for (let run = 0; run < settings.runs; run++) {
      // 每次使用新 context、關閉快取；資料只保留本機，不允許分析請求。
      const context = await browser.newContext({ viewport: settings.viewport, deviceScaleFactor: settings.deviceScaleFactor });
      await context.addInitScript(() => {
        localStorage.setItem('flower-shop-vn.analytics-consent', 'denied');
        window.__vitals = { lcp: 0, cls: 0 };
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.__vitals.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: settings.latency, downloadThroughput: settings.downloadThroughput, uploadThroughput: settings.uploadThroughput, connectionType: 'cellular4g' });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: settings.cpuRate });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(new URL(route, base).href, { waitUntil: 'commit' });
      await page.waitForTimeout(settings.windowMs);
      samples.push(await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource').filter(r => r.startTime < 10000);
        const nav = performance.getEntriesByType('navigation')[0];
        return { ...window.__vitals, bytes: resources.reduce((n, r) => n + r.transferSize, nav.transferSize), imageBytes: resources.filter(r => r.initiatorType === 'img').reduce((n, r) => n + r.transferSize, 0), requests: resources.length + 1, overflow: document.documentElement.scrollWidth > innerWidth, resources: resources.map(r => ({ url: new URL(r.name).pathname, type: r.initiatorType, bytes: r.transferSize })), images: [...document.images].filter(i => i.getBoundingClientRect().width).map(i => ({ src: i.currentSrc, natural: [i.naturalWidth, i.naturalHeight], display: [i.clientWidth, i.clientHeight], y: Math.round(i.getBoundingClientRect().y) })) };
      }));
      samples.at(-1).errors = errors;
      if (run === 0) await page.screenshot({ path: path.join(out, `${route.replaceAll('/', '_') || 'home'}.png`) });
      await context.close();
    }
    const median = key => samples.map(s => s[key]).sort((a, b) => a - b)[1];
    const item = { route, median: Object.fromEntries(['lcp', 'cls', 'bytes', 'imageBytes', 'requests'].map(k => [k, median(k)])), samples };
    results.push(item);
    console.log(JSON.stringify({ route, ...item.median }));
  }
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ browser: browser.version(), base, settings, note: '本機固定條件實驗室比較；未包含正式站 CDN 壓縮或真實使用者 INP。', results }, null, 2) + '\n');
} finally { await browser.close(); }
