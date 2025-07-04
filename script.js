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
    const navButtons = document.querySelector(".nav-buttons");
    const navLinks = document.querySelectorAll(".nav-buttons a"); // 取得所有選單按鈕

    // 點擊 ☰ 漢堡選單時，開啟/關閉選單
    menuToggle.addEventListener("click", function () {
        navButtons.classList.toggle("active");
    });

    // 點擊選單內的任何按鈕後，自動關閉選單
    navLinks.forEach(link => {
        link.addEventListener("click", function () {
            navButtons.classList.remove("active"); // 移除 active，隱藏選單
        });
    });
});
