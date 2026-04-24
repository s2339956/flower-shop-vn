import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_URL = "https://flower-shop-vn.pages.dev";
const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "blog");

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
  "/contact/",
];

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
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
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

function layout({ title, description, canonical, ogImage, ogType = "article", navCurrent = "blog", schema, body }) {
  const nav = [
    ["/", "首頁", "home"],
    ["/services/", "服務", "services"],
    ["/cities/", "城市", "cities"],
    ["/gallery/", "花束展示", "gallery"],
    ["/pricing/", "價格", "pricing"],
    ["/faq/", "FAQ", "faq"],
    ["/blog/", "Blog", "blog"],
  ];

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <meta name="author" content="Flower Shop VN">
  <link rel="canonical" href="${escapeHtml(canonical)}">
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
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/main.css"><script src="/assets/js/main.js" defer></script>
  <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>
</head>
<body>
  <header class="site-header"><div class="container header-inner"><a class="brand" href="/"><span class="brand-mark">花</span><span class="brand-text"><strong>越南花禮代訂所</strong><span>Flower Shop VN</span></span></a><button class="nav-toggle" type="button" aria-label="切換導覽" aria-expanded="false" data-nav-toggle><span></span><span></span><span></span></button><nav class="site-nav" aria-label="主選單" data-nav>${nav.map(([href, label, key]) => `<a href="${href}"${key === navCurrent ? ' aria-current="page"' : ""}>${label}</a>`).join("")}<a href="/contact/" class="nav-cta">立即諮詢</a></nav></div></header>
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
  const title = "越南送花 Blog | 節日、流程與城市指南 | Flower Shop VN";
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
    return `<article class="article-card">${image}<h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.description)}</p><a href="${post.url}">閱讀文章</a></article>`;
  }).join("");

  return layout({
    title,
    description,
    canonical: absoluteUrl("/blog/"),
    ogImage: "/images/IMG_5019.JPG",
    ogType: "website",
    schema,
    body: `  <main>
    <section class="page-hero"><div class="container"><div class="page-hero-panel"><div class="breadcrumbs"><a href="/">首頁</a><span>/</span><span>Blog</span></div><div class="page-hero-copy"><span class="eyebrow">Content Hub</span><h1>在這裡可以先了解常見送花流程與注意事項</h1><p>如果你還在確認怎麼下單、需要準備哪些資訊，或想先了解不同情境的送花安排，可以先從這裡閱讀相關說明。</p></div></div></div></section>
    <section class="section-tight"><h2 class="sr-only">越南送花文章列表</h2><div class="container article-grid">${cards}</div></section>
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
        author: {
          "@type": "Organization",
          name: "Flower Shop VN",
        },
        publisher: {
          "@type": "Organization",
          name: "Flower Shop VN",
          logo: {
            "@type": "ImageObject",
            url: absoluteUrl("/images/favicon_io/android-chrome-512x512.png"),
          },
        },
        mainEntityOfPage: post.canonical,
        image: absoluteUrl(post.heroImage),
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
    ...staticRoutes.map((route) => ({ loc: absoluteUrl(route), lastmod: "2026-04-24" })),
    ...posts.map((post) => ({ loc: post.canonical, lastmod: post.updated })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url.loc}</loc><lastmod>${url.lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;
}

async function main() {
  const posts = await loadPosts();

  await writeFile(path.join(ROOT, "blog", "index.html"), renderBlogIndex(posts), "utf8");

  for (const post of posts) {
    const dir = path.join(ROOT, "blog", post.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), renderPost(post), "utf8");
  }

  await writeFile(path.join(ROOT, "sitemap.xml"), renderSitemap(posts), "utf8");
  console.log(`Generated ${posts.length} blog posts, blog index, and sitemap.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
