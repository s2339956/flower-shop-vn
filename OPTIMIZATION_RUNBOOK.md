# 網站優化、驗證與退版

本輪識別碼：`FV-OPT-20261006`。網站已在本機優化，正式站尚未發布。原始照片不覆蓋，既有網址、93 個作品編號與 96 張作品照片保持一致。

## 退回優化前版本

先在專案根目錄執行檢查；預設不會寫入檔案：

```bash
python3 backups/pre-optimization-20261006-012638/restore.py --baseline backups/pre-optimization-20261006-012638
```

確認檢查通過後，執行本機退版：

```bash
python3 backups/pre-optimization-20261006-012638/restore.py --baseline backups/pre-optimization-20261006-012638 --apply
node scripts/check-seo.mjs
node scripts/check-gallery-inquiry.mjs
node scripts/check-analytics-consent.mjs
```

還原工具以 `changes.json` 限定本次修改的檔案集合，先核對全部目前檔案及備份的 SHA-256，再開始還原。它會還原本次修改／刪除的舊檔、移除本次新增的檔案；不使用 `git reset` 或 `git clean`，不處理其他檔案、工作帳本及驗證紀錄。

若某個檔案在優化後又被修改，工具會在寫入任何檔案前停止並列出該檔。請先另外保存及比對後續編輯，不要強制跳過檢查。已完成的退版可以重跑。`dist/` 是產物，退版後原有預覽應改指向專案根目錄或原版快照；不要把舊 `dist/` 當成已還原版本。

原版備份包含：

- `backups/pre-optimization-20261006-012638/site/`：155 個原始檔案的快照，包含網站、圖片及當時的未追蹤文件。
- `baseline.json`：起始 Git SHA、檔案大小與 SHA-256、原先工作目錄狀態。
- `history.bundle`：可攜 Git 歷史，已用 `git bundle verify` 核對。
- `live-asset-proof.json`：正式自訂網域 CSS 與原版快照的 SHA 相同。
- `github-deployments.json`：既有部署紀錄；最新紀錄對應 `f689dc55dbde2e90d63962f884c6da0f963f0f4d`。
- `changes.json`、`restore.py`：本次可退版修改清單及獨立還原入口。

既有 `backups/` 與歷史工作紀錄原地保留，不重複包入快照。`dev-notes/rollback-verification.json` 記錄隔離副本的退版演練及後續編輯保護測試。

## 建置與驗證

使用現有 Node.js、Python 3、Pillow；本次沒有新增套件依賴。修改圖片或加入作品後，依序執行：

```bash
python3 scripts/optimize-images.py
node scripts/build-site.mjs
node scripts/check-seo.mjs
node scripts/check-gallery-inquiry.mjs
node scripts/check-analytics-consent.mjs
node scripts/check-content-integrity.mjs
node scripts/build-release.mjs
```

`build-release.mjs` 只將正式頁面及其引用資產放入 `dist/`，不包含帳本、備份、原始內容資料、測試腳本與報告。它使用獨立暫存目錄與單一 writer 鎖，完整產物建立後才替換 `dist/`。來源缺檔會中止，不發布半套網站。若程序被強制中止，確認沒有建置仍在執行後才移除 `.build-release.lock/`。

`assets/versioned/` 與 `images/responsive/` 採內容版本檔名，HTML 每次重新驗證；`_headers` 內長快取規則只有在支援該設定的發布平台才會生效，不能用本機檔案宣稱正式 CDN 快取已更新。

## 維護來源

| 內容 | 修改來源 |
|---|---|
| 作品名稱、說明、分類、不同角度及原圖 | `content/gallery.json` |
| 分類數量、作品卡片、詢價白名單、圖片 JSON-LD | 由上述作品資料自動產生，不分別手改 |
| 部落格正文、發表／更新日期 | `content/blog/*.md` |
| 一般頁面的實質更新日期 | `content/page-dates.json`；不以每次建置時間刷新 |
| 共用導覽、圖片選圖、作品與結構化資料 | `scripts/site-components.mjs` |
| 部落格版型、頁尾與建置整合 | `scripts/build-site.mjs` |
| 一般頁面主要內容 | 各頁 `index.html`；建置會同步共用版型及圖片屬性 |
| 圖片尺寸、檔案來源與編碼資訊 | `content/image-manifest.json`，由圖片腳本產生 |
| 原圖與已發布作品的保留基準 | `content/optimization-baseline.json` |

保留原始圖片才能重新輸出高品質版本。衍生圖不會超過原圖尺寸；低解析度作品仍保留原始身分，不使用插值放大或生成細節冒充高清。首頁主視覺改用既有 R041，河內／價格頁的大型展示改用 R039；B001 作品本身及連結保留。

現金付款、NT$1,500 起、一般五個工作天前預訂、急件至少前一天確認、越南時間 09:00–22:00 等條件保留；幣別與實際付款交付方式未自行補寫。

## 本機預覽與瀏覽器驗證

```bash
python3 -m http.server 4318 --bind 127.0.0.1 --directory dist
```

另開終端執行：

```bash
node scripts/check-browser.mjs http://127.0.0.1:4318
node scripts/measure-performance.mjs http://127.0.0.1:4318 dev-notes/performance/after
```

瀏覽器腳本使用本機既有 Playwright 與 Chrome，不自動安裝。其他電腦可設定 `PLAYWRIGHT_MODULE` 指向既有 `playwright-core/index.js`。測試包含分類、搜尋、返回、不同角度、dialog 焦點回復、詢價白名單、剪貼簿拒絕、無 JavaScript 及 375／390／768／1440px 排版。

效能基準使用 390 × 844、DPR 2、Chrome、4 倍 CPU 節流、下載 1.6Mbps／上傳 750Kbps／150ms 延遲，每頁三次新 context／停用快取、10 秒資源觀測窗，取中位數。原版使用同一台機器及設定。這是本機未壓縮的實驗室比較，不代表正式 CDN、真實使用者 INP 或搜尋排名。

## 正式發布邊界

本輪沒有提交、推送、修改託管設定或正式部署。讀到的 GitHub Pages 設定為 `main` 分支根目錄、legacy build，另有自訂網域的 Cloudflare 回應；尚未把新 `dist/` 接到正式發布流程。發布前必須確認自訂網域實際來源、平台的產物目錄與 `_headers` 支援，不直接假設舊設定會使用 `dist/`。

正式發布經確認後，應保存當次平台部署 ID／Git SHA、發布 `dist/` 的完整檔案清單，並讀回首頁、作品、詢價、404、canonical、圖片雜湊與快取標頭。若需要線上退版，使用已記錄的良好部署或將精確舊產物重新發布，完成相同公開讀回；本機還原指令本身不會改動正式站。
