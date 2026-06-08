document.addEventListener("DOMContentLoaded", () => {
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");

  // 行動版導覽：只切換 class 與 aria 狀態，避免改動既有連結結構。
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute("aria-label", isOpen ? "關閉導覽" : "切換導覽");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "切換導覽");
      });
    });
  }

  // FAQ 展開：沿用 hidden 屬性，讓輔助工具與無樣式狀態都能正確理解內容。
  document.querySelectorAll(".faq-item").forEach((item) => {
    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");

    if (!button || !answer) return;

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

  // 進場動畫：使用 IntersectionObserver，只操作 opacity 與 transform，避免捲動時持續 reflow。
  const revealTargets = document.querySelectorAll(
    [
      ".hero-copy",
      ".hero-visual",
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
  );

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
      target.classList.add("reveal-item");
      target.style.transitionDelay = `${Math.min(index % 4, 3) * 90}ms`;
      revealObserver.observe(target);
    });
  } else {
    revealTargets.forEach((target) => target.classList.add("is-revealed"));
  }
});
