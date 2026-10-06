import { readFileSync } from 'node:fs';

export const siteUrl = 'https://flower-shop-vn.com';
export const catalog = JSON.parse(readFileSync(new URL('../content/gallery.json', import.meta.url), 'utf8'));
const images = JSON.parse(readFileSync(new URL('../content/image-manifest.json', import.meta.url), 'utf8'));
const social = JSON.parse(readFileSync(new URL('../content/social-image.json', import.meta.url), 'utf8'));
const pageDates = JSON.parse(readFileSync(new URL('../content/page-dates.json', import.meta.url), 'utf8'));
export const workCodes = catalog.flatMap(group => group.works.map(work => work.id));
export const escape = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const navItems = [['/', '首頁'], ['/services/', '服務'], ['/cities/', '城市'], ['/gallery/', '作品參考'], ['/pricing/', '價格'], ['/faq/', '常見問題'], ['/blog/', '送花指南']];
export function siteHeader(route) {
  return `<header class="site-header"><div class="container header-inner"><a class="brand" href="/"><span class="brand-mark">花</span><span class="brand-text"><strong>越南花禮代訂所</strong><span>Flower Shop VN</span></span></a><button class="nav-toggle" type="button" aria-label="切換導覽" aria-expanded="false" aria-controls="site-navigation" data-nav-toggle><span></span><span></span><span></span></button><nav class="site-nav" id="site-navigation" aria-label="主選單" data-nav>${navItems.map(([url, label]) => `<a href="${url}"${route === url ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="/contact/" class="nav-cta"${route === '/contact/' ? ' aria-current="page"' : ''}>立即諮詢</a></nav></div></header>`;
}

// 原始 URL 留在 data-image-source；重跑建置仍從原圖取得候選圖，不連續壓縮。
export function responsiveImages(html, route) {
  return html.replace(/<picture>\s*<source[^>]+>\s*(<img[^>]+>)\s*<\/picture>/g, '$1').replace(/<img\b([^>]+)>/g, (tag, attrs) => {
    const fields = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    let source = fields['data-image-source'] || fields.src;
    if (fields.fetchpriority === 'high' && source === '/images/gallery/2026/b001.webp' && !route.startsWith('/gallery/')) {
      // 大型主視覺改用既有高解析實拍；作品 B001 本身保留原圖與原編號。
      source = '/images/gallery/2026/r039.webp';
      fields.alt = '奶油色玫瑰・淡色網紗';
    }
    const info = images[source?.split('?')[0]];
    if (!info) return tag;
    const fallback = info.variants.find(v => v.width >= 640) || info.variants.at(-1);
    fields.src = fallback.src;
    fields['data-image-source'] = source;
    // 大量作品卡僅輸出會用到的候選寬度，避免每張卡重複七組 URL 膨脹 HTML。
    const candidates = route === '/gallery/' ? info.variants.filter(v => [360, 640, 960, 1280].includes(v.width) || v === info.variants.at(-1)) : info.variants;
    fields.srcset = candidates.map(v => `${v.src} ${v.width}w`).join(', ');
    fields.sizes = route === '/gallery/'
      ? '(max-width: 374px) calc(100vw - 32px), (max-width: 640px) calc((100vw - 44px) / 2), (max-width: 980px) calc((100vw - 56px) / 2), 380px'
      : route === '/' ? '(max-width: 640px) 70vw, (max-width: 980px) 45vw, 380px' : '(max-width: 640px) calc(100vw - 32px), (max-width: 980px) 60vw, 560px';
    fields.width = info.width;
    fields.height = info.height;
    // src 放第一個，兼容原有素材稽核；保留 lazy、alt 與讀取優先順序。
    return `<img ${Object.entries(fields).map(([k, v]) => `${k}="${v}"`).join(' ')}>`;
  });
}

export function renderCatalog(groups = catalog, detail = false) {
  return groups.map(group => `<section class="section-tight portfolio-section" id="${group.id}" aria-labelledby="${group.id}-title"><div class="container">${detail ? `<h2 class="sr-only" id="${group.id}-title">作品照片</h2>` : `<div class="section-heading"><h2 id="${group.id}-title">${escape(group.name)}</h2><p>${escape(group.description)}</p></div>`}<div class="case-gallery-grid">${group.works.map((work, index) => {
    const photo = (image, first) => `<a href="${escape(image.full)}" target="_blank" rel="noopener" aria-label="放大作品 ${work.id}：${escape(image.alt)}"><img src="${escape(image.src)}" alt="${escape(image.alt)}" width="${image.width}" height="${image.height}" loading="${first && (detail || (group.id === 'roses' && index === 0)) ? 'eager' : 'lazy'}" decoding="async"${first && (detail || (group.id === 'roses' && index === 0)) ? ' fetchpriority="high"' : ''}></a>`;
    return `<article class="case-card portfolio-work" id="work-${work.id}">${photo(work.photos[0], true)}<div class="case-card-body"><span class="case-category">${escape(work.kind)}</span><p class="work-code">作品 ${work.id}</p><h3>${escape(work.title)}</h3><p>${escape(work.description)}</p>${work.photos.length > 1 ? `<details class="work-angles"><summary>查看另一角度照片</summary>${work.photos.slice(1).map(p => photo(p, false)).join('')}</details>` : ''}<div class="button-row"><a class="button button-secondary" href="/contact/?work=${work.id}#inquiry">用這款詢價</a><a class="work-permalink" href="/gallery/${work.id}/">作品連結</a></div></div></article>`;
  }).join('\n')}</div></div></section>`).join('\n');
}

export function normalizeCatalog(html) {
  // 作品唯一來源同步所有卡片、照片、分類數量及結構化資料。
  const blocks = [...html.matchAll(/<section class="section-tight portfolio-section"[\s\S]*?<\/section>/g)];
  if (blocks.length !== catalog.length) throw new Error('作品區塊數量不符，停止覆寫。');
  let result = html.slice(0, blocks[0].index) + renderCatalog() + html.slice(blocks.at(-1).index + blocks.at(-1)[0].length);
  result = result.replace(/<div class="container" data-gallery-controls(?: hidden)?>[\s\S]*?<p data-gallery-status[^>]*>[\s\S]*?<\/p><\/div>/, galleryControls());
  result = result.replace(/<nav class="button-row" aria-label="作品分類">[\s\S]*?<\/nav>/, '');
  return result.replace(/[ \t]+\n/g, '\n').replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (_, json) => {
    const schema = JSON.parse(json);
    const gallery = schema['@graph'].find(node => node['@type'] === 'ImageGallery');
    gallery.associatedMedia = catalog.flatMap(group => group.works.flatMap(work => work.photos.map(photo => ({ '@type': 'ImageObject', contentUrl: siteUrl + photo.full, caption: `${work.id} ${photo.alt}（${work.kind}）`, width: photo.width, height: photo.height }))));
    return `<script type="application/ld+json">\n${JSON.stringify(schema)}\n</script>`;
  });
}

export function galleryControls() {
  return `<div class="container" data-gallery-controls><nav class="gallery-filters" aria-label="作品分類"><a href="/gallery/" role="button" data-gallery-filter="all" aria-pressed="true">全部作品 · ${workCodes.length}</a>${catalog.map(g => `<a href="#${g.id}" role="button" data-gallery-filter="${g.id}" aria-pressed="false">${escape(g.name)} · ${g.works.length}</a>`).join('')}</nav><div data-gallery-search hidden><label for="work-search">搜尋作品編號、花色或名稱</label><input id="work-search" type="search" data-work-search placeholder="例如 R040、粉色、玫瑰" autocomplete="off"></div><p data-gallery-status role="status" aria-live="polite">目前顯示 ${workCodes.length} 款作品。</p></div>`;
}

export function normalizeMetadata(html, route) {
  if (route === '/404.html') return html;
  html = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")https:\/\/flower-shop-vn\.com\/(?:images\/gallery\/2026\/b001\.webp|images\/social\/flowers-[a-f0-9]+\.jpg)(">)/g, `$1${siteUrl}${social.src}$2`);
  const title = html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1].replace(/<[^>]*>/g, '') || '';
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (_, json) => {
    const data = JSON.parse(json);
    const graph = data['@graph'] || [Object.fromEntries(Object.entries(data).filter(([key]) => key !== '@context'))];
    for (const node of graph) {
      if (pageDates[route] && ['WebPage', 'CollectionPage', 'Article', 'BlogPosting', 'ImageGallery'].includes(node['@type'])) node.dateModified = pageDates[route];
      if (['Article', 'BlogPosting'].includes(node['@type']) && String(node.image || '').includes('/favicon_io/')) delete node.image;
    }
    if (!graph.some(n => n['@type'] === 'BreadcrumbList')) {
      const pieces = route.split('/').filter(Boolean);
      const items = [{ '@type': 'ListItem', position: 1, name: '首頁', item: siteUrl + '/' }];
      if (pieces.length > 1) items.push({ '@type': 'ListItem', position: 2, name: navItems.find(([url]) => url === `/${pieces[0]}/`)?.[1] || pieces[0], item: `${siteUrl}/${pieces[0]}/` });
      if (pieces.length) items.push({ '@type': 'ListItem', position: items.length + 1, name: title, item: siteUrl + route });
      graph.push({ '@type': 'BreadcrumbList', itemListElement: items });
    }
    if (!graph.some(n => n['@type'] === 'Organization')) graph.push({ '@type': 'Organization', '@id': siteUrl + '/#organization', name: '越南花禮代訂所 Flower Shop VN', url: siteUrl + '/', logo: siteUrl + '/images/favicon_io/android-chrome-512x512.png' });
    return `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}\n</script>`;
  });
}
