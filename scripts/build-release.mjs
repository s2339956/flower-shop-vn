import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// 只複製正式 HTML 及其直接引用；備份、原始內容、帳本與維護腳本不進入發布產物。
const root = process.cwd();
const output = path.join(root, 'dist');
const staging = path.join(root, `.dist-stage-${process.pid}`);
const lock = path.join(root, '.build-release.lock');
// 拒絕兩個 writer 同時更新發布資料夾；臨時產物完成後才替換可預覽版本。
await mkdir(lock).catch(() => { throw new Error('已有發布建置執行中；請等完成後再建置。'); });
try {
const sitemap = await readFile('sitemap.xml', 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
const pages = routes.map(route => route === '/' ? 'index.html' : `${route.slice(1)}index.html`);
pages.push('404.html');
const files = new Set([...pages, 'robots.txt', 'sitemap.xml', '_headers', 'google999895523f425ec1.html', 'images/favicon_io/favicon.ico']);
for (const page of pages) {
  const html = await readFile(page, 'utf8');
  for (const match of html.matchAll(/(?:https:\/\/flower-shop-vn\.com)?\/(?:assets|images|videos)\/[^\s"<>]+/g)) {
    const url = new URL(match[0].replace(/,$/, ''), 'https://flower-shop-vn.com');
    const name = url.pathname.slice(1);
    if (!name.startsWith('assets/') && !name.startsWith('images/') && !name.startsWith('videos/')) throw new Error('不合法資產路徑');
    files.add(name);
  }
}
// 先讀完並驗證來源，缺檔時保留上一份可用 dist；只清理由本腳本固定管理的 dist。
const contents = new Map(await Promise.all([...files].map(async file => [file, await readFile(path.join(root, file))])));
const manifest = {};
await Promise.all([...new Set([...contents.keys()].map(file => path.dirname(path.join(staging, file))))].map(dir => mkdir(dir, { recursive: true })));
const entries = [...contents];
// 有界並行寫入，避免大量圖片逐檔複製阻塞；使用先前讀取的同一份 bytes 計算雜湊。
for (let i = 0; i < entries.length; i += 32) await Promise.all(entries.slice(i, i + 32).map(async ([file, bytes]) => {
  await writeFile(path.join(staging, file), bytes);
  manifest[file] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}));
await rm(output, { recursive: true, force: true });
await rename(staging, output);
await mkdir('dev-notes', { recursive: true });
await writeFile('dev-notes/release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`發布產物完成：${routes.length} 個內容頁，${files.size} 個檔案；目錄 dist/。`);
} finally {
  await rm(staging, { recursive: true, force: true });
  await rm(lock, { recursive: true, force: true });
}
