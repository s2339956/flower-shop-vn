import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { catalog, workCodes } from './site-components.mjs';

const baseline = JSON.parse(await readFile('content/optimization-baseline.json', 'utf8'));
const oldCodes = baseline.workCodes;
// 保留已發布的所有編號，同時允許正常新增作品；唯一性與圖片逐項對照由下方檢查把關。
assert.ok(oldCodes.every(code => workCodes.includes(code)), '既有作品編號必須完整保留');
const photoCount = catalog.flatMap(g => g.works.flatMap(w => w.photos)).length;
assert.ok(photoCount >= baseline.photoCount, '作品照片數量不得低於保留基準');
assert.equal(new Set(workCodes).size, workCodes.length, '作品編號不得重複');
for (const [name, info] of Object.entries(baseline.originalImages)) {
  if (!name.startsWith('images/')) continue;
  const bytes = await readFile(name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), info, `原始圖片不得被覆蓋：${name}`);
}
const manifest = JSON.parse(await readFile('content/image-manifest.json', 'utf8'));
for (const [source, info] of Object.entries(manifest)) {
  assert.equal(createHash('sha256').update(await readFile(source.slice(1))).digest('hex'), info.sourceSha256, `${source} 衍生圖來源版本不一致`);
  for (const image of info.variants) {
    assert.ok(image.width <= info.width && image.height <= info.height, `${source} 不得放大假冒高清`);
    const bytes = await readFile(image.src.slice(1));
    assert.equal(bytes.length, image.bytes, `${image.src} 容量與清單不符`);
  }
}
const gallery = await readFile('gallery/index.html', 'utf8');
const rendered = [...gallery.matchAll(/data-image-source="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(rendered.sort(), catalog.flatMap(g => g.works.flatMap(w => w.photos.map(p => p.src))).sort(), '列表圖片必須與單一資料來源一致');
assert.ok(!/河內頁負責|城市頁負責|交易請回服務頁/.test((await Promise.all(['cities/hanoi/index.html', 'cities/da-nang/index.html', 'cities/ho-chi-minh/index.html'].map(p => readFile(p, 'utf8')))).join('')), '不得保留內部規劃文案');
console.log(`內容與圖片驗證通過：${workCodes.length} 款作品、${photoCount} 張作品圖、所有原始圖片 SHA 未變，衍生圖未放大。`);
