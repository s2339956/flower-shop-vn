import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "content", "blog");

function getArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

function todayInTaipei() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeSlug(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function frontMatterValue(value = "") {
  return String(value).replaceAll('"', '\\"');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ask(question, fallback = "") {
  const rl = readline.createInterface({ input, output });
  const suffix = fallback ? ` (${fallback})` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  rl.close();
  return answer.trim() || fallback;
}

async function main() {
  const title = getArg("title") || await ask("文章標題");
  const suggestedSlug = normalizeSlug(getArg("slug") || title);
  const slug = normalizeSlug(getArg("slug") || await ask("網址 slug，請用英文小寫與連字號", suggestedSlug));
  const date = getArg("date") || todayInTaipei();
  const description = getArg("description") || await ask("文章摘要", `${title}的重點整理。`);
  const category = getArg("category") || await ask("分類", "越南送花");
  const year = date.slice(0, 4);
  const heroImage = getArg("heroImage") || `/images/blog/${year}/${slug}/hero.jpg`;
  const heroAlt = getArg("heroAlt") || await ask("主圖 alt 文字", title);

  if (!title || !slug || !description) {
    throw new Error("title, slug, and description are required.");
  }

  const mdPath = path.join(BLOG_DIR, `${slug}.md`);
  const imageDir = path.join(ROOT, "images", "blog", year, slug);

  if (await exists(mdPath)) {
    throw new Error(`Article already exists: ${path.relative(ROOT, mdPath)}`);
  }

  await mkdir(BLOG_DIR, { recursive: true });
  await mkdir(imageDir, { recursive: true });

  const markdown = `---
title: ${frontMatterValue(title)}
description: ${frontMatterValue(description)}
slug: ${slug}
date: ${date}
updated: ${date}
category: ${frontMatterValue(category)}
heroImage: ${heroImage}
heroAlt: ${frontMatterValue(heroAlt)}
imageWidth: 1200
imageHeight: 630
draft: true
---

## 文章重點

這裡寫文章開頭，先用 2 到 4 句說明這篇文章要解決什麼問題。

## 需要準備的資訊

- 收件城市與地址
- 預計送達日期與時段
- 預算範圍
- 收件人姓名與電話

## 注意事項

這裡寫配送限制、付款方式、急件規則或其他需要先確認的事項。

## 下一步

若需求已經明確，可以到[聯絡頁](/contact/)提供城市、日期、用途與預算。
`;

  await writeFile(mdPath, markdown, { flag: "wx" });

  console.log(`Created ${path.relative(ROOT, mdPath)}`);
  console.log(`Created ${path.relative(ROOT, imageDir)}/`);
  console.log("Next steps:");
  console.log(`1. Put hero image at ${heroImage}`);
  console.log("2. Edit the Markdown body and set draft: false");
  console.log("3. Run: node scripts/build-site.mjs");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
