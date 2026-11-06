import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { siteHeader, normalizeCatalog, responsiveImages, normalizeMetadata, workCodes, catalog, renderCatalog } from "./site-components.mjs";

const SITE_URL = "https://flower-shop-vn.com";
const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "blog");
const SHOPEE_GUIDE_URL = "https://shopee.tw/product/3151001/29700986020/";
// 日期由逐頁維護清單記錄，建置時間不會自動變成內容更新時間。
const PAGE_DATES = JSON.parse(readFileSync(path.join(ROOT, "content/page-dates.json"), "utf8"));
const WORK_SOCIAL_IMAGES = JSON.parse(readFileSync(path.join(ROOT, "content/work-social-images.json"), "utf8"));
const workRoutes = workCodes.map(code => `/gallery/${code}/`);

const staticRoutes = [
  "/",
  "/services/",
  "/services/birthday-flowers-vietnam/",
  "/services/wedding-flowers-vietnam/",
  "/services/funeral-flowers-vietnam/",
  "/services/opening-stand-vietnam/",
  "/cities/",
  "/cities/ho-chi-minh/",
  "/cities/hanoi/",
  "/cities/da-nang/",
  "/gallery/",
  "/pricing/",
  "/faq/",
  "/blog/",
  "/ordering-policy/",
  "/contact/",
];

// 共用頁尾由建置器統一寫回所有頁面，避免靜態頁面各自維護而再次漏頁。
function siteFooter() {
  return `  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <a class="brand" href="/"><span class="brand-mark">花</span><span class="brand-text"><strong>越南花禮代訂所</strong><span>Flower Shop VN</span></span></a>
        <p>為台灣客戶提供中文溝通、跨境下單的越南送花服務。</p>
      </div>
      <div>
        <h3>服務</h3>
        <a href="/services/birthday-flowers-vietnam/">生日花束</a>
        <a href="/services/wedding-flowers-vietnam/">婚禮花禮</a>
        <a href="/services/funeral-flowers-vietnam/">喪禮花圈</a>
        <a href="/gallery/">作品參考</a>
      </div>
      <div>
        <h3>城市</h3>
        <a href="/cities/ho-chi-minh/">胡志明市</a>
        <a href="/cities/hanoi/">河內</a>
        <a href="/cities/da-nang/">峴港</a>
        <a href="/ordering-policy/">訂購與個資說明</a>
      </div>
      <div>
        <h3>聯絡與下單</h3>
        <a class="footer-contact-link" href="tel:+886916316950"><span class="footer-icon" aria-hidden="true">Tel</span>+886 916-316-950</a>
        <a class="footer-contact-link" href="mailto:s2339956@gmail.com"><span class="footer-icon" aria-hidden="true">@</span>s2339956@gmail.com</a>
        <a class="footer-contact-link" href="https://line.me/ti/p/s2339956" target="_blank" rel="noopener noreferrer"><span class="footer-icon" aria-hidden="true">L</span>LINE</a>
        <a class="footer-contact-link" href="https://zalo.me/0836058119" target="_blank" rel="noopener noreferrer"><span class="footer-icon" aria-hidden="true">Z</span>Zalo 0836058119</a>
        <a class="footer-contact-link" href="${SHOPEE_GUIDE_URL}" target="_blank" rel="noopener noreferrer"><span class="footer-icon" aria-hidden="true">S</span>Shopee 訂購指引</a>
        <a class="footer-contact-link" href="https://www.threads.com/@s2339956" target="_blank" rel="noopener noreferrer"><span class="footer-icon" aria-hidden="true">Th</span>Threads</a>
      </div>
    </div>
  </footer>`;
}

function floatingContact() {
  return `  <nav class="floating-contact" aria-label="快速聯絡">
    <a class="floating-line" href="https://line.me/ti/p/s2339956" target="_blank" rel="noopener noreferrer">LINE</a>
    <a class="floating-zalo" href="https://zalo.me/0836058119" target="_blank" rel="noopener noreferrer">Zalo</a>
  </nav>`;
}

function pagePath(route) {
  return route === "/"
    ? path.join(ROOT, "index.html")
    : path.join(ROOT, route.replace(/^\/+|\/+$/g, ""), "index.html");
}

function normalizeSiteShell(html, route) {
  // 中文內容改用系統字型，移除會阻塞首屏的外部字型連線與樣式表。
  const withoutFonts = html
    .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/g, "")
    .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/g, "")
    .replace(/\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^\"]+" rel="stylesheet">/g, "");

  // 先移除舊共用區塊再寫入一次，讓重複執行建置仍保持冪等。
  const withoutShell = withoutFonts
    .replace(/<footer class="site-footer">[\s\S]*?<\/footer>/g, "")
    .replace(/<nav class="floating-contact"[\s\S]*?<\/nav>/g, "");

  const shared = withoutShell
    .replace(/<header class="site-header">[\s\S]*?<\/header>/, siteHeader(route))
    .replace(/<main(?: id="main-content")?>/, '<main id="main-content">')
    .replace(/\s*<a class="skip-link"[^>]*>[\s\S]*?<\/a>\s*/g, '\n')
    .replace(/<body>\s*/, '<body>\n  <a class="skip-link" href="#main-content">跳至主要內容</a>\n  ');
  return shared.replace(
    /\s*<\/body>\s*<\/html>\s*$/,
    `\n\n${siteFooter()}\n\n${floatingContact()}\n</body>\n</html>\n`,
  );
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripHtml(value = "") {
  return String(value).replace(/<[^>]*>/g, "");
}

function absoluteUrl(url = "") {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function getLocalImagePath(src = "") {
  if (!src.startsWith("/") || src.startsWith("//")) return "";
  const [pathname] = src.split(/[?#]/);
  return path.join(ROOT, pathname.replace(/^\/+/, ""));
}

function readPngDimensions(buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame = [
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf,
    ].includes(marker);

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    if (!length) break;
    offset += 2 + length;
  }

  return null;
}

function getImageDimensions(src = "") {
  const filePath = getLocalImagePath(src);
  if (!filePath) return null;

  try {
    const buffer = readFileSync(filePath);
    return readPngDimensions(buffer) || readJpegDimensions(buffer);
  } catch {
    // 本機找不到圖檔時仍保留原輸出，避免單篇文章阻斷整站 build。
    return null;
  }
}

function parseFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Missing front matter block.");
  }

  const data = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "true") data[key] = true;
    else if (value === "false") data[key] = false;
    else data[key] = value;
  }

  return { data, body: match[2].trim() };
}

function renderInline(markdown = "") {
  let html = escapeHtml(markdown);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const dimensions = getImageDimensions(src);
    const sizeAttributes = dimensions
      ? ` width="${dimensions.width}" height="${dimensions.height}"`
      : "";
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${sizeAttributes} loading="lazy" decoding="async">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
    return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function renderMarkdown(markdown = "") {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html.push(`<ul class="check-list">${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
    list = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      flushList();
      html.push(`<h3>${renderInline(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      flushList();
      html.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph();
      list.push(trimmed.slice(2));
      continue;
    }

    if (trimmed.startsWith("![")) {
      flushParagraph();
      flushList();
      html.push(`<figure>${renderInline(trimmed)}</figure>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return html.join("");
}

function layout({ title, description, canonical, ogImage, ogType = "article", schema, body, gallery = false }) {


  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="author" content="Flower Shop VN">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="越南花禮代訂所">
  <meta property="og:title" content="${escapeHtml(title.replace(" | Flower Shop VN", ""))}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(absoluteUrl(ogImage))}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title.replace(" | Flower Shop VN", ""))}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(absoluteUrl(ogImage))}">
  <link rel="icon" type="image/x-icon" href="/images/favicon_io/favicon.ico">
  <link rel="stylesheet" href="/assets/css/main.css"><script src="/assets/js/main.js" defer></script>
${gallery ? '  <script src="/assets/js/gallery.js" defer></script>\n' : ''}  <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>
</head>
<body>
${siteHeader(new URL(canonical).pathname)}
${body}
</body>
</html>
`;
}

function breadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

async function loadPosts() {
  const files = await readdir(CONTENT_DIR);
  const posts = [];

  for (const file of files) {
    if (!file.endsWith(".md") || file.startsWith("_") || file === "README.md") continue;
    const fullPath = path.join(CONTENT_DIR, file);
    const source = await readFile(fullPath, "utf8");
    const { data, body } = parseFrontMatter(source);
    if (data.draft) continue;
    if (!data.slug || !data.title || !data.description) {
      throw new Error(`${file} requires slug, title, and description.`);
    }

    posts.push({
      ...data,
      body,
      bodyHtml: renderMarkdown(body),
      url: `/blog/${data.slug}/`,
      canonical: absoluteUrl(`/blog/${data.slug}/`),
      updated: data.updated || data.date,
    });
  }

  return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function renderBlogIndex(posts) {
  const title = "越南送花指南 | 預訂流程、配送條件與花禮選擇 | Flower Shop VN";
  const description = "閱讀越南送花流程、喪禮花圈代訂與胡志明市配送等實用指南。";
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "越南送花 Blog",
        url: absoluteUrl("/blog/"),
        description: "收錄越南送花流程、城市規則與喪禮花圈代訂指南的內容中心。",
      },
      breadcrumb([
        { name: "首頁", url: "/" },
        { name: "Blog", url: "/blog/" },
      ]),
    ],
  };

  const cards = posts.map((post) => {
    const imageSrc = post.cardImage || post.heroImage;
    const imageAlt = post.cardAlt || post.heroAlt || post.title;
    const imageWidth = post.cardImageWidth || post.imageWidth || 1200;
    const imageHeight = post.cardImageHeight || post.imageHeight || 630;
    const image = post.hideCardImage
      ? ""
      : `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}" width="${escapeHtml(imageWidth)}" height="${escapeHtml(imageHeight)}" loading="lazy" decoding="async">`;
    return `<article class="article-card">${image}<p class="article-meta">${escapeHtml(post.category || "送花指南")} · ${escapeHtml(post.updated)}</p><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.description)}</p><a href="${post.url}">閱讀：${escapeHtml(post.title)}</a></article>`;
  }).join("");

  return layout({
    title,
    description,
    canonical: absoluteUrl("/blog/"),
    ogImage: "/images/gallery/2026/b001.webp",
    ogType: "website",
    schema,
    body: `  <main>
    <section class="page-hero"><div class="container"><div class="page-hero-panel"><div class="breadcrumbs"><a href="/">首頁</a><span>/</span><span>Blog</span></div><div class="page-hero-copy"><span class="eyebrow">送花指南</span><h1>越南送花指南：預訂流程、配送條件與花禮選擇</h1><p>從預訂流程、城市配送到不同場合的花禮，先了解需要準備的資料，再提供城市、日期與預算向客服詢問。</p></div></div></div></section>
    <section class="section-tight"><h2 class="sr-only">越南送花文章列表</h2><div class="container article-grid">${cards}</div></section>
    <section class="section-tight"><div class="container"><div class="cta-band"><h2>準備好城市、日期與預算，就能開始詢價</h2><p>如果你已經知道用途，可先看<a href="/services/">越南送花服務總覽</a>；若收件地點在胡志明市，建議查看<a href="/cities/ho-chi-minh/">胡志明市送花指南</a>；需求已經明確時，直接到<a href="/contact/">聯絡頁</a>提供城市、日期與預算。</p></div></div></section>
  </main>`,
  });
}

function renderPost(post) {
  const title = `${post.title} | Flower Shop VN`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        dateModified: post.updated,
        datePublished: post.date,
        inLanguage: "zh-Hant",
        author: { "@id": `${SITE_URL}/#organization` },
        publisher: { "@id": `${SITE_URL}/#organization` },
        mainEntityOfPage: post.canonical,
        image: absoluteUrl(post.heroImage),
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "越南花禮代訂所 Flower Shop VN",
        url: `${SITE_URL}/`,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/images/favicon_io/android-chrome-512x512.png"),
        },
      },
      breadcrumb([
        { name: "首頁", url: "/" },
        { name: "Blog", url: "/blog/" },
        { name: post.title, url: post.url },
      ]),
    ],
  };

  return layout({
    title,
    description: post.description,
    canonical: post.canonical,
    ogImage: post.heroImage,
    schema,
    body: `  <main>
    <section class="page-hero"><div class="container"><div class="page-hero-panel"><div class="breadcrumbs"><a href="/">首頁</a><span>/</span><a href="/blog/">Blog</a><span>/</span><span>${escapeHtml(post.title)}</span></div><div class="page-hero-copy"><span class="eyebrow">${escapeHtml(post.category || "Article")}</span><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.description)}</p><p class="updated-at">最後更新：${escapeHtml(post.updated)}</p></div></div></div></section>
    <section class="section-tight"><article class="container content-block article-content">${post.bodyHtml}</article></section>
    <section class="section-tight"><div class="container"><div class="cta-band"><h2>需要安排越南送花嗎？</h2><p>如果城市、日期、用途與預算已經明確，可以直接到<a href="/contact/">聯絡頁</a>提供資料。</p><div class="button-row"><a class="button button-primary" href="/contact/">前往聯絡頁</a></div></div></div></section>
  </main>`,
  });
}

function renderSitemap(posts) {
  const urls = [
    ...staticRoutes.map((route) => ({
      loc: absoluteUrl(route),
      // 每頁實質內容異動時才更新 content/page-dates.json。
      lastmod: PAGE_DATES[route],
    })),
    ...posts.map((post) => ({
      loc: post.canonical,
      lastmod: PAGE_DATES[post.url] || post.updated,
    })),
    ...workRoutes.map(route => ({ loc: absoluteUrl(route), lastmod: PAGE_DATES[route] || PAGE_DATES['/gallery/'] })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url.loc}</loc><lastmod>${url.lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;
}

// 沿用作品唯一來源及既有照片預覽；每件作品的 HTML 自帶分享資料，不靠 JS 改 meta。
function renderWorkPage(group, work) {
  const route = `/gallery/${work.id}/`;
  const image = WORK_SOCIAL_IMAGES[work.id];
  if (!image) throw new Error(`${work.id} 缺少分享圖片；請先執行圖片建置。`);
  const title = `${work.id} ${work.title} | Flower Shop VN`;
  const description = `作品 ${work.id}：${work.description}`;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: title, url: absoluteUrl(route), description, dateModified: PAGE_DATES['/gallery/'] },
      { '@type': 'ImageGallery', name: `${work.id} ${work.title}`, url: absoluteUrl(route), associatedMedia: work.photos.map(photo => ({ '@type': 'ImageObject', contentUrl: absoluteUrl(photo.full), caption: photo.alt, width: photo.width, height: photo.height })) },
      breadcrumb([{ name: '首頁', url: '/' }, { name: '作品參考', url: '/gallery/' }, { name: `${work.id} ${work.title}`, url: route }]),
    ],
  };
  return layout({ title, description, canonical: absoluteUrl(route), ogImage: image.src, ogType: 'website', gallery: true, schema,
    body: `<main class="work-detail">
      <div class="container work-detail-heading"><div class="breadcrumbs"><a href="/">首頁</a><span>/</span><a href="/gallery/">作品參考</a><span>/</span><span>${work.id}</span></div><h1>${escapeHtml(work.id)} ${escapeHtml(work.title)}</h1><p>作品照片供款式參考，實際花材、花量、尺寸與包裝依城市、日期及預算確認。</p><div class="button-row"><a class="button button-primary" href="/contact/?work=${work.id}#inquiry">用這款詢價</a><a class="button button-secondary" href="/gallery/">查看全部作品</a></div></div>
      ${renderCatalog([{ ...group, works: [work] }], true)}
    </main>`
  }).replace(/(<meta property="og:image"[^>]+>)/, `$1\n  <meta property="og:image:type" content="image/jpeg">\n  <meta property="og:image:width" content="${image.width}">\n  <meta property="og:image:height" content="${image.height}">\n  <meta property="og:image:alt" content="${escapeHtml(work.title)}">`);
}

async function main() {
  const posts = await loadPosts();

  await writeFile(path.join(ROOT, "blog", "index.html"), renderBlogIndex(posts), "utf8");

  for (const post of posts) {
    const dir = path.join(ROOT, "blog", post.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), renderPost(post), "utf8");
  }

  for (const group of catalog) {
    for (const work of group.works) {
      const dir = path.join(ROOT, 'gallery', work.id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), renderWorkPage(group, work), 'utf8');
    }
  }

  await writeFile(path.join(ROOT, "sitemap.xml"), renderSitemap(posts), "utf8");

  const routes = [...staticRoutes, ...posts.map((post) => post.url), ...workRoutes];
  // 404 不列入 Sitemap，但沿用同一份頁尾與快速聯絡導覽。
  const shellFiles = [...routes.map(pagePath), path.join(ROOT, "404.html")];
  for (const filePath of shellFiles) {
    const html = await readFile(filePath, "utf8");
    const route = routes.find(candidate => pagePath(candidate) === filePath) || "/404.html";
    let content = route === "/gallery/" ? normalizeCatalog(html) : html;
    // 首頁等既有作品入口也使用獨立頁；舊網址本身仍由作品列表提供相容瀏覽。
    content = content.replace(/href="\/gallery\/#work-([A-Z]\d{3})"/g, 'href="/gallery/$1/"');
    // 原生 details 讓常見問題在無 JavaScript 或腳本失敗時仍可閱讀。
    content = content.replace(/<article class="faq-item">\s*<button class="faq-question"[^>]*>([\s\S]*?)<\/button>\s*<div class="faq-answer" hidden>([\s\S]*?)<\/div>\s*<\/article>/g,
      (_match, question, answer) => `<details class="faq-item"><summary class="faq-question">${question.replace('class="faq-icon"', 'class="faq-icon" aria-hidden="true"')}</summary><div class="faq-answer">${answer}</div></details>`);
    if (PAGE_DATES[route]) content = content.replace(/(<p class="updated-at">)最後更新：[^<]+/, `$1最後更新：${PAGE_DATES[route]}`);
    if (route === "/contact/") content = content.replace(/data-work-codes="[^"]*"/, `data-work-codes="${workCodes.join(",")}"`);
    content = normalizeMetadata(responsiveImages(content, route), route);
    const normalized = normalizeSiteShell(content, route);
    if (
      normalizeSiteShell(normalized, route) !== normalized
      || !normalized.includes('<footer class="site-footer">')
      || !normalized.includes('<nav class="floating-contact"')
    ) {
      throw new Error(`${path.relative(ROOT, filePath)} 的共用版面正規化不是冪等操作。`);
    }
    await writeFile(filePath, normalized, "utf8");
  }

  // 指紋資產只由內容決定，HTML 持續重新驗證，避免同名圖片/CSS更新後吃到舊快取。
  const versionDir = path.join(ROOT, "assets", "versioned");
  await mkdir(versionDir, { recursive: true });
  for (const source of ["assets/css/main.css", "assets/js/main.js", "assets/js/gallery.js"]) {
    const contents = await readFile(path.join(ROOT, source));
    const hash = createHash("sha256").update(contents).digest("hex").slice(0, 12);
    const ext = path.extname(source);
    const name = `${path.basename(source, ext)}-${hash}${ext}`;
    await writeFile(path.join(versionDir, name), contents);
    const matcher = new RegExp(`/assets/(?:${ext === ".css" ? "css" : "js"}/${path.basename(source).replace(".", "\\.")}|versioned/${path.basename(source, ext)}-[a-f0-9]+\\${ext})`, "g");
    for (const file of shellFiles) {
      const html = await readFile(file, "utf8");
      await writeFile(file, html.replace(matcher, `/assets/versioned/${name}`));
    }
  }
  console.log(`Generated ${posts.length} blog posts, sitemap, and normalized ${shellFiles.length} pages.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
