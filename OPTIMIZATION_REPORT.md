# 網站優化結果（2026-10-06）

本機實作及瀏覽器驗證完成；正式站未發布。完整退版方式見 [OPTIMIZATION_RUNBOOK.md](OPTIMIZATION_RUNBOOK.md)。

## 已完成

- 全站文案修正：移除城市頁內部規劃語言，首頁清楚交代中文代訂與詢價條件；既有營運限制、聯絡方式及網址保留。
- SEO：21 頁 metadata／canonical／JSON-LD／站內目標檢查通過；補共用導覽階層資料，更新日期由來源清單管理，可見日期與 schema 同步。沒有相關主圖的文章不使用 favicon 冒充文章照片。
- 作品：93 款、96 張照片由同一份 catalog 生成；分類、編號搜尋、空結果、深連結、返回、頁內放大、不同角度、作品連結複製及詢價入口完成。
- 圖片：原始檔 SHA 未變，多尺寸 WebP 不放大；首頁改用 R041 高清照片，大型 B001 展示改用 R039，原 B001 作品保留；分享預覽使用實拍拼接圖。
- UX：手機首屏精簡、選單鍵盤操作、流內分析偏好提示、安全區留白；FAQ 使用原生 details，無 JS 仍可閱讀。
- 結構：共用導覽／頁尾／版型與作品資料集中；停用舊根目錄 CSS／JS；發布產物只包含 21 個內容頁、404 及引用資產，共 491 檔。
- 快取：產生內容版本檔名與長快取規則；正式 CDN 效果須發布後另外驗證。

## 固定條件效能比較

四頁各三次冷載入中位數，390×844、DPR 2、4 倍 CPU 節流、下載 1.6Mbps、上傳 750Kbps、150ms 延遲、10 秒觀測窗；同一台機器及 Chrome。容量為本機未壓縮傳輸量，包含 HTML、CSS、JS、圖片及協定估算，不能直接當作正式 CDN 的壓縮流量。

| 頁面 | 修改前 | 修改後 | 減少 | 圖片減少 | LCP 前→後 |
|---|---:|---:|---:|---:|---:|
| 首頁 | 295.8 KiB | 192.6 KiB | 34.9% | 49.1% | 0.808→0.904s |
| 作品頁 | 401.2 KiB | 371.2 KiB | 7.5% | 33.7% | 0.820→1.128s |
| 聯絡頁 | 256.5 KiB | 174.1 KiB | 32.1% | 45.1% | 0.816→1.208s |
| 河內頁 | 143.4 KiB | 113.3 KiB | 21.0% | 42.7% | 1.060→0.920s |

四頁合計圖片傳輸量減少 **42.37%**；本次觀測 CLS 均為 0。四頁總傳輸量皆低於原版；作品頁因初始載入更多縮圖及獨立互動腳本，請求數從 6 增至 11，未達原訂請求數門檻，不列為通過。三頁 LCP 小幅上升，仍低於 1.3 秒，不能宣稱所有速度指標都變快。實際 INP、CrUX／Search Console 收錄、排名及轉換率尚未測得。

## 驗證證據

- `scripts/check-seo.mjs`：21 頁、119 個站內目標。
- `scripts/check-gallery-inquiry.mjs`：93 款作品與合法／未知／惡意 query 處理。
- `scripts/check-analytics-consent.mjs`：未同意零載入、撤回停用與焦點恢復。
- `scripts/check-content-integrity.mjs`：93 款／96 圖、原始圖 SHA 未變、衍生圖不放大。
- `scripts/check-browser.mjs`：實際 Chrome 操作、四個螢幕寬度無橫向溢出、無 JS 備援；測試不傳送詢價或改寫使用者剪貼簿。
- 建置冪等：連續建置後 21 頁、404 及 sitemap SHA 無差異。
- `dev-notes/browser/report.json`、`dev-notes/performance/{before,after}/report.json`、`dev-notes/performance/comparison.json`：機器可讀結果與畫面。
- `dev-notes/optimization-copy-changes.json`：本輪文案原句、理由與新句。
- `dev-notes/rollback-verification.json`：隔離副本退版、原版三項檢查與後續修改衝突保護結果。

## 發布與回復

原版恢復點為 `f689dc55dbde2e90d63962f884c6da0f963f0f4d`，完整快照位於 `backups/pre-optimization-20261006-012638/`。還原指令先以 SHA 核對，遇到後續編輯會停止，不使用破壞性的 Git 重設。

本輪未 commit、push 或修改正式託管設定。GitHub Pages 的既有來源為 main 根目錄；新 `dist/` 尚未接到正式發布。正式部署前需確認自訂網域實際來源及產物入口，發布後再驗證公開網址、圖片版本及快取。
