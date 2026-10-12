(function () {
  if (document.querySelector(".xdk-splash")) return;
  const startedAt = Date.now();
  const splash = document.createElement("div");
  splash.className = "xdk-splash";
  splash.setAttribute("aria-label", "Memuat XDigitalKita");
  splash.innerHTML = '<div class="xdk-splash-orb"><img src="/icon.svg" alt=""></div><div class="xdk-splash-title">XDigitalKita</div><div class="xdk-splash-subtitle">Sistem pembayaran digital</div><div class="xdk-splash-track"><span></span></div>';
  document.body.appendChild(splash);
  requestAnimationFrame(() => splash.classList.add("is-visible"));
  let closed = false;
  const hide = () => {
    if (closed) return;
    closed = true;
    const wait = Math.max(0, 720 - (Date.now() - startedAt));
    window.setTimeout(() => {
      splash.classList.add("is-hidden");
      window.setTimeout(() => splash.remove(), 520);
    }, wait);
  };
  if (document.readyState === "complete") window.setTimeout(hide, 720);
  else window.addEventListener("load", hide, { once: true });
  window.setTimeout(hide, 1500);
})();
