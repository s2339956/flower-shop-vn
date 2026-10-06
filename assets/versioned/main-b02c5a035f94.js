const ANALYTICS_ID = "G-NFGV86CR3K";
const ANALYTICS_CONSENT_KEY = "flower-shop-vn.analytics-consent";
const ANALYTICS_DISABLE_KEY = `ga-disable-${ANALYTICS_ID}`;

// GA4 採基本同意模式：訪客允許前不下載 Google 標籤，也不送出分析請求。
function initAnalyticsConsent() {
  const readConsent = () => {
    try {
      return localStorage.getItem(ANALYTICS_CONSENT_KEY);
    } catch {
      return null;
    }
  };

  const saveConsent = (value) => {
    try {
      localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    } catch {
      // 隱私模式可能禁止儲存；本頁選擇仍會生效，下次造訪再詢問。
    }
  };

  const prepareGoogleTag = () => {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
  };

  const denyGoogleConsent = () => {
    // Google 官方停用旗標會阻止既有標籤繼續設定 Cookie 或傳送資料。
    window[ANALYTICS_DISABLE_KEY] = true;
    if (!window.gtag) return;
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  };

  const loadAnalytics = () => {
    window[ANALYTICS_DISABLE_KEY] = false;
    prepareGoogleTag();
    const existingTag = document.querySelector(`[data-ga4-id="${ANALYTICS_ID}"]`);
    if (!existingTag) {
      window.gtag("consent", "default", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    }
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    if (existingTag) return;

    window.gtag("js", new Date());
    window.gtag("config", ANALYTICS_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
    script.dataset.ga4Id = ANALYTICS_ID;
    document.head.append(script);
  };

  const banner = document.createElement("aside");
  banner.className = "analytics-consent";
  banner.hidden = true;
  banner.setAttribute("aria-labelledby", "analytics-consent-title");
  banner.innerHTML = `
    <div>
      <h2 id="analytics-consent-title">網站分析偏好</h2>
      <p>允許後才會載入 Google Analytics 4，協助了解頁面使用情形；廣告追蹤維持關閉。詳見<a href="/ordering-policy/">訂購與個資說明</a>。</p>
    </div>
    <div class="analytics-consent-actions">
      <button type="button" data-analytics-deny>暫不允許</button>
      <button type="button" class="analytics-consent-allow" data-analytics-allow>允許分析</button>
    </div>`;
  document.body.append(banner);

  const allowButton = banner.querySelector("[data-analytics-allow]");
  const denyButton = banner.querySelector("[data-analytics-deny]");
  const settingsButton = document.createElement("button");
  settingsButton.className = "analytics-settings-button";
  settingsButton.type = "button";
  settingsButton.textContent = "分析偏好設定";
  document.querySelector(".footer-grid > div:last-child")?.append(settingsButton);

  let restoreSettingsFocus = false;
  const showBanner = (moveFocus = false) => {
    restoreSettingsFocus = moveFocus;
    banner.hidden = false;
    if (moveFocus) allowButton.focus();
  };

  const hideBanner = () => {
    banner.hidden = true;
    if (restoreSettingsFocus) settingsButton.focus();
    restoreSettingsFocus = false;
  };

  allowButton.addEventListener("click", () => {
    saveConsent("granted");
    loadAnalytics();
    hideBanner();
  });

  denyButton.addEventListener("click", () => {
    saveConsent("denied");
    denyGoogleConsent();
    hideBanner();
  });

  settingsButton.addEventListener("click", () => showBanner(true));

  window[ANALYTICS_DISABLE_KEY] = true;
  const consent = readConsent();
  if (consent === "granted") loadAnalytics();
  else if (consent !== "denied") showBanner();
}

document.addEventListener("DOMContentLoaded", () => {
  initAnalyticsConsent();

  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");

  // 行動版導覽：只切換 class 與 aria 狀態，避免改動既有連結結構。
  if (navToggle && nav) {
    // aria-controls 讓螢幕閱讀器知道按鈕控制哪一個導覽區塊；root 頁面會提供固定 id，
    // 這裡保留缺少 id 時的退路，避免舊頁面因增強腳本而失去導覽功能。
    const navId = nav.id || "site-navigation";
    nav.id = navId;
    navToggle.setAttribute("aria-controls", navId);

    let lastFocusedElement = navToggle;
    const closeNav = (restoreFocus = false) => {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "切換導覽");
      if (restoreFocus && typeof lastFocusedElement?.focus === "function") {
        lastFocusedElement.focus();
      }
    };

    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.contains("is-open");
      if (isOpen) {
        closeNav();
        return;
      }

      lastFocusedElement = document.activeElement || navToggle;
      nav.classList.add("is-open");
      navToggle.setAttribute("aria-expanded", "true");
      navToggle.setAttribute("aria-label", "關閉導覽");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        closeNav();
      });
    });

    // Escape 與導覽外點擊都能關閉手機選單；Escape 將焦點送回觸發按鈕。
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        event.preventDefault();
        closeNav(true);
      }
    });
    document.addEventListener("click", (event) => {
      if (!nav.classList.contains("is-open")) return;
      if (navToggle.contains(event.target) || nav.contains(event.target)) return;
      closeNav();
    });
  }

  // FAQ 展開：沿用 hidden 屬性，讓輔助工具與無樣式狀態都能正確理解內容。
  document.querySelectorAll(".faq-item").forEach((item) => {
    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");

    if (!button || !answer || button.tagName !== "BUTTON") return;

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      answer.hidden = expanded;
      const icon = button.querySelector(".faq-icon");
      if (icon) {
        icon.textContent = expanded ? "+" : "−";
      }
    });
  });

  const inquiryTemplate = document.querySelector("[data-inquiry-template]");
  const copyInquiry = document.querySelector("[data-copy-inquiry]");
  const copyStatus = document.querySelector("[data-copy-status]");
  const selectedWork = document.querySelector("[data-selected-work]");

  // 只帶入作品清單中的編號；內容留在詢價欄位，由客戶自行複製給客服。
  if (inquiryTemplate) {
    const work = new URLSearchParams(window.location.search).get("work");
    const workCodes = (inquiryTemplate.dataset.workCodes || "").split(",").filter(Boolean);
    if (work && workCodes.includes(work)) {
      inquiryTemplate.value = inquiryTemplate.value.replace(
        "作品編號或參考連結：",
        `作品編號或參考連結：${work}（https://flower-shop-vn.com/gallery/#work-${work}）`,
      );

      if (selectedWork) {
        selectedWork.hidden = false;
        selectedWork.textContent = `已選作品 ${work}：`;
        const workLink = document.createElement("a");
        workLink.href = `/gallery/#work-${work}`;
        workLink.textContent = `查看作品 ${work}`;
        selectedWork.append(" ", workLink);
      }
    } else if (work && copyStatus && workCodes.length) {
      // 不回顯未驗證的 query 字串，只提供可理解的錯誤與回到作品頁的方向。
      copyStatus.textContent = "找不到此作品編號，請回到作品頁重新選擇。";
    }
  }

  // 詢價內容只在瀏覽器內複製，不會由網站收集或傳送。
  if (inquiryTemplate && copyInquiry && copyStatus) {
    copyInquiry.addEventListener("click", async () => {
      try {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(inquiryTemplate.value);
        } else {
          inquiryTemplate.focus();
          inquiryTemplate.select();
          if (!document.execCommand("copy")) throw new Error("瀏覽器拒絕複製");
        }
        copyStatus.textContent = "已複製詢價內容，可直接貼到 LINE 或 Zalo。";
      } catch {
        copyStatus.textContent = "無法自動複製，請選取上方文字後手動複製。";
      }
    });
  }

  // 進場動畫：使用 IntersectionObserver，只操作 opacity 與 transform，避免捲動時持續 reflow。
  const revealTargets = [...document.querySelectorAll(
    [
      ".section-heading",
      ".trust-item",
      ".card",
      ".process-step",
      ".city-card",
      ".gallery-card",
      ".testimonial",
      ".faq-item",
      ".cta-band",
      ".page-hero-copy",
      ".image-card",
      ".info-panel",
      ".content-block",
      ".contact-card",
      ".article-card",
      ".price-card",
      ".case-card"
    ].join(",")
  )].filter((target) => !target.closest?.(".hero, .page-hero"));

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    revealTargets.forEach((target, index) => {
      // 作品深連結直接顯示，避免動畫位移改變瀏覽器已計算的錨點位置。
      if (target.id && window.location.hash === `#${target.id}`) {
        target.classList.add("is-revealed");
        return;
      }
      target.classList.add("reveal-item");
      target.style.transitionDelay = `${Math.min(index % 4, 3) * 90}ms`;
      revealObserver.observe(target);
    });
  } else {
    revealTargets.forEach((target) => target.classList.add("is-revealed"));
  }
});
