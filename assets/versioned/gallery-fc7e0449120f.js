document.addEventListener("DOMContentLoaded", () => {
  const cards = [...document.querySelectorAll(".portfolio-work[id^='work-']")];
  if (!cards.length) return;

  const sections = [...document.querySelectorAll(".portfolio-section[id]")];
  const controls = document.querySelector("[data-gallery-controls]");
  const searchInput = document.querySelector("[data-work-search]");
  const filterButtons = [...document.querySelectorAll("[data-gallery-filter]")];
  const status = document.querySelector("[data-gallery-status]");
  const sectionIds = new Set(sections.map((section) => section.id));

  // 篩選是 JavaScript 增強功能；只有腳本完成初始化後才顯示控制列，無 JS 時仍可用原生分類錨點。
  const enhancementReady = Boolean(controls && searchInput && filterButtons.length);
  if (enhancementReady) {
    controls.removeAttribute("hidden");
    document.querySelector('[data-gallery-search]')?.removeAttribute('hidden');
    // 控制列可用時收起原本的分類錨點，避免同一組操作重複出現；初始化失敗時不會執行這段。
    const legacyCategoryNav = document.querySelector('nav.button-row[aria-label="作品分類"]');
    if (legacyCategoryNav) legacyCategoryNav.hidden = true;
  }

  const cardItems = cards.map((card) => {
    const section = card.closest(".portfolio-section");
    const work = card.id.replace(/^work-/, "");
    const title = card.querySelector("h3")?.textContent?.trim() || `作品 ${work}`;
    const searchText = `${work} ${title} ${card.textContent || ""}`.toLocaleLowerCase();
    const imageLinks = [...card.querySelectorAll("a")]
      .map((anchor) => ({ anchor, image: anchor.querySelector("img") }))
      .filter(({ image }) => image)
      .map(({ anchor, image }) => ({
        anchor,
        card,
        work,
        title,
        src: anchor.getAttribute("href") || image.currentSrc || image.src,
        alt: image.alt || title,
      }));

    return {
      card,
      work,
      sectionId: section?.id || "",
      title,
      searchText,
      imageLinks,
    };
  });

  let activeFilter = "all";
  let activeSearch = "";
  let activeWorkId = "";
  let clearButton = controls?.querySelector("[data-gallery-clear]") || null;

  // 控制列由頁面模板提供；清除按鈕則在需要時以 DOM 建立，避免把使用者輸入拼進 HTML。
  if (searchInput && controls && !clearButton) {
    clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "gallery-clear button button-secondary";
    clearButton.dataset.galleryClear = "";
    clearButton.textContent = "清除篩選";
    controls.append(clearButton);
  }

  const setStatus = (visibleCount) => {
    if (!status) return;
    status.textContent = visibleCount
      ? `目前顯示 ${visibleCount} 款作品。`
      : "找不到符合條件的作品，請清除搜尋或改選分類。";
    if (activeWorkId && visibleCount) {
      const item = cardItems.find(item => item.card.id === activeWorkId);
      status.textContent = `正在查看作品 ${item.work}：${item.title}。`;
    }
  };

  const updateFilterButtons = () => {
    filterButtons.forEach((button) => {
      const isActive = (button.dataset.galleryFilter || "all") === activeFilter;
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const applyFilter = () => {
    activeSearch = (searchInput?.value || "").trim().toLocaleLowerCase();
    let visibleCount = 0;

    sections.forEach((section) => {
      const sectionCards = cardItems.filter((item) => item.sectionId === section.id);
      const matchesSection = activeFilter === "all" || activeFilter === section.id;
      let sectionVisibleCount = 0;

      sectionCards.forEach((item) => {
        const matchesSearch = !activeSearch || item.searchText.includes(activeSearch);
        // 舊作品錨點只呈現精確編號，避免同分類的其他作品混在畫面中。
        const visible = matchesSection && matchesSearch && (!activeWorkId || item.card.id === activeWorkId);
        item.card.hidden = !visible;
        item.card.classList.toggle("is-selected-work", item.card.id === activeWorkId);
        if (visible) sectionVisibleCount += 1;
      });

      // 搜尋結果為空時收起整個分類，避免只留下空白標題與網格。
      section.hidden = sectionVisibleCount === 0;
      section.classList.toggle("is-work-focus", Boolean(activeWorkId));
      visibleCount += sectionVisibleCount;
    });

    if (clearButton) {
      clearButton.hidden = !activeWorkId && !activeSearch && activeFilter === "all";
      clearButton.textContent = activeWorkId ? "查看全部作品" : "清除篩選";
    }
    updateFilterButtons();
    setStatus(visibleCount);
  };

  const changeFilterHash = (filter) => {
    if (!window.history?.pushState || typeof URL !== "function") return;
    const url = new URL(window.location.href);
    url.hash = filter === "all" ? "" : filter;
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  };

  const readHashState = () => {
    let hash = window.location.hash.replace(/^#/, "");
    try {
      hash = decodeURIComponent(hash);
    } catch {
      // 畸形 hash 不影響作品瀏覽，直接回到全部分類。
      hash = "";
    }

    if (sectionIds.has(hash)) return { filter: hash, workId: "" };

    const workMatch = hash.match(/^work-([A-Z]\d{3})$/i);
    if (workMatch) {
      const workId = `work-${workMatch[1].toUpperCase()}`;
      const item = cardItems.find((candidate) => candidate.card.id === workId);
      return { filter: item?.sectionId || "all", workId: item ? workId : "" };
    }

    return { filter: "all", workId: "" };
  };

  const syncFromLocation = (scrollToWork = false) => {
    const { filter, workId } = readHashState();
    activeFilter = filter;
    activeWorkId = workId;
    // 分類錨點與作品深連結代表新的瀏覽狀態；清除舊搜尋，避免 deep link 被搜尋條件隱藏。
    if (searchInput) searchInput.value = "";
    applyFilter();

    if (scrollToWork && workId) {
      window.requestAnimationFrame?.(() => {
        document.getElementById(workId)?.scrollIntoView({ block: "start" });
      });
    }
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const filter = button.dataset.galleryFilter || "all";
      if (filter !== "all" && !sectionIds.has(filter)) return;
      activeFilter = filter;
      activeWorkId = "";
      if (searchInput) searchInput.value = "";
      changeFilterHash(filter);
      applyFilter();
    });
    button.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); button.click(); }
    });
  });

  searchInput?.addEventListener("input", () => {
    activeWorkId = "";
    applyFilter();
  });

  clearButton?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    activeFilter = "all";
    activeWorkId = "";
    changeFilterHash("all");
    applyFilter();
    searchInput?.focus();
  });

  window.addEventListener("hashchange", () => syncFromLocation(true));
  window.addEventListener("popstate", () => syncFromLocation(true));
  syncFromLocation(true);

  // 沒有原生 dialog 時保留原本的圖片連結，讓漸進增強不影響基本瀏覽。
  const dialog = document.createElement("dialog");
  if (typeof dialog.showModal !== "function") return;

  dialog.className = "gallery-lightbox";
  dialog.setAttribute("aria-label", "作品照片預覽");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "gallery-lightbox-close";
  closeButton.textContent = "關閉";

  const figure = document.createElement("figure");
  figure.className = "gallery-lightbox-figure";
  const dialogImage = document.createElement("img");
  dialogImage.decoding = "async";
  dialogImage.alt = "";
  const caption = document.createElement("figcaption");
  figure.append(dialogImage, caption);

  const navigation = document.createElement("div");
  navigation.className = "gallery-lightbox-navigation";
  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "button button-secondary";
  previousButton.textContent = "上一張";
  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "button button-secondary";
  nextButton.textContent = "下一張";
  navigation.append(previousButton, nextButton);

  const actions = document.createElement("div");
  actions.className = "gallery-lightbox-actions";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary";
  copyButton.textContent = "複製作品連結";
  const originalLink = document.createElement("a");
  originalLink.className = "button button-secondary gallery-lightbox-original";
  originalLink.target = "_blank";
  originalLink.rel = "noopener";
  originalLink.textContent = "開啟原圖";
  originalLink.hidden = true;
  const inquiryLink = document.createElement("a");
  inquiryLink.className = "button button-primary";
  inquiryLink.textContent = "用這款詢價";
  actions.append(copyButton, originalLink, inquiryLink);

  const copyStatus = document.createElement("p");
  copyStatus.className = "gallery-lightbox-status";
  copyStatus.setAttribute("role", "status");
  copyStatus.setAttribute("aria-live", "polite");

  dialog.append(closeButton, figure, navigation, actions, copyStatus);
  document.body.append(dialog);

  let visibleImages = [];
  let currentIndex = 0;
  let restoreFocusElement = null;
  let imageRequestId = 0;

  const getVisibleImages = () => cardItems
    .filter((item) => !item.card.hidden && !item.card.closest(".portfolio-section")?.hidden)
    .flatMap((item) => item.imageLinks);

  // 靜態獨立頁的分享資訊由伺服器直接回傳，通訊工具能取得對應作品縮圖。
  const getCanonicalWorkUrl = (work) => `https://flower-shop-vn.com/gallery/${work}/`;

  const renderImage = () => {
    const item = visibleImages[currentIndex];
    if (!item) return;
    const requestId = ++imageRequestId;
    // 只有使用者開啟預覽時才設定大圖 src，避免首屏預載全部原圖。
    dialogImage.hidden = true;
    dialogImage.classList.remove("is-error");
    figure.classList.remove("is-error");
    figure.classList.add("is-loading");
    originalLink.hidden = true;
    originalLink.href = item.src;
    dialogImage.alt = item.alt;
    caption.textContent = `${item.work} · ${item.title}`;
    inquiryLink.href = `/contact/?work=${item.work}#inquiry`;
    previousButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex === visibleImages.length - 1;
    copyStatus.textContent = "";

    dialogImage.onload = () => {
      if (requestId !== imageRequestId) return;
      dialogImage.hidden = false;
      figure.classList.remove("is-loading", "is-error");
    };
    dialogImage.onerror = () => {
      if (requestId !== imageRequestId) return;
      dialogImage.hidden = true;
      figure.classList.remove("is-loading");
      figure.classList.add("is-error");
      originalLink.hidden = false;
      copyStatus.textContent = "圖片預覽載入失敗，請開啟原圖。";
    };
    dialogImage.src = item.src;
    if (dialogImage.complete && dialogImage.naturalWidth > 0) dialogImage.onload();
  };

  const openImage = (index, trigger) => {
    visibleImages = getVisibleImages();
    if (!visibleImages.length) return false;
    currentIndex = Math.max(0, Math.min(index, visibleImages.length - 1));
    restoreFocusElement = trigger || document.activeElement;
    renderImage();
    document.body.classList.add("gallery-dialog-open");
    try {
      dialog.showModal();
      closeButton.focus();
      return true;
    } catch {
      document.body.classList.remove("gallery-dialog-open");
      restoreFocusElement = null;
      return false;
    }
  };

  const closeDialog = () => {
    if (dialog.open) dialog.close();
  };

  cardItems.flatMap((item) => item.imageLinks).forEach((item) => {
    item.anchor.addEventListener("click", (event) => {
      // 保留 Ctrl/Cmd/Shift/Alt、中鍵與鍵盤原生開新分頁／新視窗行為。
      if ((typeof event.button === "number" && event.button !== 0)
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const currentImages = getVisibleImages();
      const index = currentImages.indexOf(item);
      if (index < 0) return;
      if (openImage(index, item.anchor)) event.preventDefault();
    });
  });

  closeButton.addEventListener("click", closeDialog);
  previousButton.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderImage();
    }
  });
  nextButton.addEventListener("click", () => {
    if (currentIndex < visibleImages.length - 1) {
      currentIndex += 1;
      renderImage();
    }
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("gallery-dialog-open");
    if (restoreFocusElement?.isConnected) restoreFocusElement.focus();
    restoreFocusElement = null;
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" && currentIndex > 0) {
      event.preventDefault();
      currentIndex -= 1;
      renderImage();
    }
    if (event.key === "ArrowRight" && currentIndex < visibleImages.length - 1) {
      event.preventDefault();
      currentIndex += 1;
      renderImage();
    }
  });

  copyButton.addEventListener("click", async () => {
    const item = visibleImages[currentIndex];
    if (!item) return;
    const link = getCanonicalWorkUrl(item.work);
    try {
      if (window.isSecureContext && window.navigator?.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(link);
      } else if (document.execCommand) {
        const textarea = document.createElement("textarea");
        textarea.className = "sr-only";
        textarea.value = link;
        textarea.setAttribute("readonly", "");
        textarea.setAttribute("aria-hidden", "true");
        // dialog 顯示時 body 會被 inert，暫存文字必須放在 dialog 內才可選取。
        dialog.append(textarea);
        try {
          textarea.focus();
          textarea.select();
          if (!document.execCommand("copy")) throw new Error("瀏覽器拒絕複製");
        } finally {
          textarea.remove();
        }
      } else {
        throw new Error("瀏覽器不支援複製");
      }
      copyStatus.textContent = "已複製作品連結，可貼到訊息中。";
    } catch {
      copyStatus.textContent = `無法自動複製，請手動複製此網址：${link}`;
    }
  });
});
