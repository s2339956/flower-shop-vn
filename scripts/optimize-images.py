"""產生不放大的 WebP 衍生圖；保留原圖，使用來源雜湊確保快取版本正確。"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'images/responsive'
OUTPUT.mkdir(parents=True, exist_ok=True)
manifest = {}
for source in sorted((ROOT / 'images').rglob('*')):
    if not source.is_file() or source.suffix.lower() not in {'.jpg', '.jpeg', '.webp', '.png'}:
        continue
    if any(part in {'responsive', 'social', 'favicon_io'} for part in source.relative_to(ROOT).parts):
        continue
    original = source.read_bytes()
    # 編碼參數納入 key；日後調整畫質不會覆用舊快取。
    digest = hashlib.sha256(original + b'webp-q84-lanczos-v1').hexdigest()[:12]
    with Image.open(source) as raw:
        image = ImageOps.exif_transpose(raw).convert('RGB')
        width, height = image.size
        variants = []
        for size in sorted({w for w in [320, 360, 480, 640, 960, 1280, 1600, min(width, 1600)] if w <= width}):
            target = OUTPUT / f'{source.stem}-{digest}-{size}w.webp'
            resized = image.resize((size, round(height * size / width)), Image.Resampling.LANCZOS)
            if not target.exists():
                resized.save(target, 'WEBP', quality=84, method=6, icc_profile=raw.info.get('icc_profile', b''))
            variants.append({'src': '/' + str(target.relative_to(ROOT)), 'width': size, 'height': resized.height, 'bytes': target.stat().st_size})
        manifest['/' + str(source.relative_to(ROOT))] = {'width': width, 'height': height, 'originalBytes': len(original), 'sourceSha256': hashlib.sha256(original).hexdigest(), 'variants': variants}

(ROOT / 'content/image-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'sources': len(manifest), 'variants': sum(len(v['variants']) for v in manifest.values()), 'note': '原圖未修改；衍生圖按需下載，不代表單頁傳輸量。'}, ensure_ascii=False))

# 通訊工具取得獨立作品頁的 JPEG 分享圖；只轉檔及縮小，不裁切花束或放大低解析照片。
social_output = ROOT / 'images/social'
social_output.mkdir(parents=True, exist_ok=True)
work_social = {}
for group in json.loads((ROOT / 'content/gallery.json').read_text()):
    for work in group['works']:
        source = ROOT / work['photos'][0]['src'].split('?')[0].lstrip('/')
        digest = hashlib.sha256(source.read_bytes() + b'jpeg-q88-max1200-v1').hexdigest()[:12]
        target = social_output / f"work-{work['id'].lower()}-{digest}.jpg"
        with Image.open(source) as raw:
            image = ImageOps.exif_transpose(raw).convert('RGB')
            image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
            if not target.exists():
                image.save(target, 'JPEG', quality=88, optimize=True)
            work_social[work['id']] = {'src': '/' + str(target.relative_to(ROOT)), 'width': image.width, 'height': image.height, 'source': work['photos'][0]['src']}
(ROOT / 'content/work-social-images.json').write_text(json.dumps(work_social, ensure_ascii=False, indent=2) + '\n')
print(f'作品分享 JPEG 完成：{len(work_social)} 件。')
