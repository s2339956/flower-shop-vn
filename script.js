document.addEventListener("DOMContentLoaded", function () {
    // ---------------------- Lightbox ----------------------
    const images = document.querySelectorAll(".zoomable");
    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    const closeBtn = document.querySelector(".close");

    images.forEach(img => {
        img.addEventListener("click", function () {
            lightbox.style.display = "flex";
            lightboxImg.src = this.src;
        });
    });

    closeBtn.addEventListener("click", function () {
        lightbox.style.display = "none";
    });

    // 點擊外部區域也可以關閉
    lightbox.addEventListener("click", function (e) {
        if (e.target !== lightboxImg) {
            lightbox.style.display = "none";
        }
    });

    // ---------------------- Menu Toggle ----------------------
    const menuToggle = document.getElementById("mobile-menu");
    const primaryNav = document.getElementById("primary-nav");
    const navLinks = document.querySelectorAll("#primary-nav a"); // 取得所有選單按鈕

    function setExpanded(isExpanded) {
        if (!menuToggle || !primaryNav) return;
        menuToggle.setAttribute("aria-expanded", String(isExpanded));
        menuToggle.setAttribute("aria-label", isExpanded ? "關閉導覽選單" : "開啟導覽選單");
        primaryNav.classList.toggle("active", isExpanded);
    }

    function closeMenu() {
        setExpanded(false);
    }

    // 點擊 ☰ 漢堡選單時，開啟/關閉選單
    if (menuToggle && primaryNav) {
        menuToggle.addEventListener("click", function () {
            const expanded = menuToggle.getAttribute("aria-expanded") === "true";
            setExpanded(!expanded);
        });
    }

    // 點擊選單內的任何按鈕後，自動關閉選單
    navLinks.forEach(link => {
        link.addEventListener("click", function () {
            closeMenu(); // 移除 active，隱藏選單
        });
    });
});
