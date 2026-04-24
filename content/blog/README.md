# Blog Content Workflow

## 建議新增方式

使用建稿腳本：

```bash
node scripts/new-blog-post.mjs
```

它會協助建立：

- `content/blog/<slug>.md`
- `images/blog/<year>/<slug>/`

你也可以用非互動方式建立：

```bash
node scripts/new-blog-post.mjs --title="越南情人節送花指南" --slug="vietnam-valentine-flower-guide" --category="節日送花"
```

## 手動新增方式

也可以複製 `_template.md` 成新的檔案，例如：

```text
content/blog/vietnam-valentine-flower-guide.md
```

填完 front matter 與正文後執行：

```bash
node scripts/build-site.mjs
```

產生器會更新：

- `blog/index.html`
- `blog/<slug>/index.html`
- `sitemap.xml`

圖片建議放在：

```text
images/blog/2026/<slug>/hero.jpg
```

文章中可以使用一般 Markdown 圖片語法：

```md
![圖片說明](/images/blog/2026/<slug>/hero.jpg)
```

注意事項：

- `slug` 會變成網址 `/blog/<slug>/`。
- `heroImage` 會用在 Blog 列表、OG 圖與 Twitter 圖。
- `draft: true` 的文章不會被產生。
- 檔名以英文小寫、數字與連字號為主。

## 可以請 ChatGPT 幫忙寫嗎？

可以。建議你把 `_template.md` 的 front matter 和以下需求貼給 ChatGPT：

```text
請幫我依照這個 Markdown 格式寫一篇越南送花文章。
語氣要像商業網站文章，不要提 SEO、AI、搜尋排名。
文章要包含：適用情境、下單資料、配送注意事項、付款方式、下一步 CTA。
```

拿到內容後，把正文貼回 `content/blog/<slug>.md`，確認 `draft: false`，再執行：

```bash
node scripts/build-site.mjs
```
