(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const formatIDR = value => "Rp " + Number(value || 0).toLocaleString("id-ID");

  const storedTheme = localStorage.getItem("xdk-theme");
  const shouldDark = storedTheme ? storedTheme === "dark" : true;
  document.body.classList.toggle("dark", shouldDark);
  document.body.classList.toggle("light", !shouldDark);

  function updateThemeIcon() {
    const icon = $("#themeIcon");
    if (!icon) return;
    if (document.body.classList.contains("dark")) {
      icon.innerHTML = "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41\"/>";
    } else {
      icon.innerHTML = "<path d=\"M21 12.7A8.5 8.5 0 1 1 11.3 3 6.6 6.6 0 0 0 21 12.7z\"/>";
    }
  }

  updateThemeIcon();

  function showChannelInfoPopup() {
    if (document.documentElement.dataset.xdkChannelPopupReady === "1") return;
    const metaUrl = document.querySelector('meta[name="telegram-channel-url"]');
    const metaTitle = document.querySelector('meta[name="telegram-channel-title"]');
    const channelUrl = metaUrl?.content?.trim();
    const channelTitle = metaTitle?.content?.trim() || "Channel Information";
    if (!channelUrl) return;

    const key = "xdk-channel-popup-seen";
    const seenAt = Number(localStorage.getItem(key) || 0);
    if (seenAt && Date.now() - seenAt < 24 * 60 * 60 * 1000) return;

    document.documentElement.dataset.xdkChannelPopupReady = "1";
    const backdrop = document.createElement("div");
    backdrop.className = "xdk-channel-backdrop";
    backdrop.innerHTML = `
      <section class="xdk-channel-modal" role="dialog" aria-modal="true" aria-labelledby="xdkChannelTitle">
        <div class="xdk-channel-hero">
          <div class="xdk-channel-icon"><img src="/icon.svg" alt=""></div>
          <div>
            <h2 id="xdkChannelTitle">${channelTitle}</h2>
            <p>Ikuti channel Telegram resmi untuk info update, maintenance, dan pengumuman terbaru.</p>
          </div>
        </div>
        <div class="xdk-channel-actions">
          <a class="glass-btn primary" href="${channelUrl}" target="_blank" rel="noopener">Buka Channel</a>
          <button class="glass-btn outline" type="button" data-close-channel-popup>Nanti</button>
        </div>
      </section>`;

    const close = () => {
      localStorage.setItem(key, String(Date.now()));
      backdrop.remove();
    };

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop || event.target.closest("[data-close-channel-popup]")) close();
    });

    const join = backdrop.querySelector("a");
    join?.addEventListener("click", () => localStorage.setItem(key, String(Date.now())));
    document.body.appendChild(backdrop);
  }

  setTimeout(showChannelInfoPopup, 650);

  const oauthError = new URLSearchParams(location.search).get("oauth_error");
  if (oauthError) {
    const oauthAlert = $("#oauthAlert");
    if (oauthAlert) {
      setTimeout(() => setAlert(oauthAlert, "error", oauthError), 0);
    }
    if (history.replaceState) {
      history.replaceState(null, "", location.pathname);
    }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      return ok;
    }
  }

  function setAlert(element, type, message) {
    if (!element) return;
    element.className = "alert show " + type;
    element.textContent = message;
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.classList.add("loading");
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.classList.remove("loading");
    }
  }

  function updateTheme() {
    const dark = !document.body.classList.contains("dark");
    document.body.classList.toggle("dark", dark);
    document.body.classList.toggle("light", !dark);
    localStorage.setItem("xdk-theme", dark ? "dark" : "light");
    updateThemeIcon();
  }

  function openTransactionModal(item) {
    const modal = $("#txModal");
    if (!modal) return;
    const data = {
      id: item.dataset.id || "-",
      description: item.dataset.description || "Pembayaran",
      amount: Number(item.dataset.amount || 0),
      fee: Number(item.dataset.fee || 100),
      total: Number(item.dataset.total || 0),
      status: item.dataset.status || "pending",
      date: item.dataset.date || "-",
      qr: item.dataset.qr || ""
    };
    modal.dataset.activeId = data.id;
    $("#modalTxId").textContent = data.id;
    $("#modalTxDescription").textContent = data.description;
    $("#modalTxAmount").textContent = formatIDR(data.amount);
    $("#modalTxFee").textContent = formatIDR(data.fee);
    $("#modalTxTotal").textContent = formatIDR(data.total);
    $("#modalTxDate").textContent = data.date;
    const badge = $("#modalTxStatus");
    badge.textContent = data.status;
    badge.className = "badge " + data.status;
    const qrWrap = $("#modalQrWrap");
    const qr = $("#modalQr");
    if (data.qr) {
      qr.src = data.qr;
      qrWrap.style.display = "grid";
    } else {
      qr.removeAttribute("src");
      qrWrap.style.display = "none";
    }
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeTransactionModal() {
    const modal = $("#txModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    modal.dataset.activeId = "";
  }

  function updateTransactionItem(id, status, saldo) {
    const item = $$(".tx-item[data-id]").find(node => node.dataset.id === id);
    if (item) {
      item.dataset.status = status;
      const badge = $(".badge", item);
      if (badge) {
        badge.className = "badge " + status;
        badge.textContent = status;
      }
    }
    const modal = $("#txModal");
    if (modal && modal.dataset.activeId === id) {
      const badge = $("#modalTxStatus");
      if (badge) {
        badge.className = "badge " + status;
        badge.textContent = status;
      }
    }
    if (typeof saldo === "number") {
      const saldoValue = $("#saldoValue");
      if (saldoValue) saldoValue.textContent = formatIDR(saldo);
    }
  }

  async function checkTransaction(id) {
    if (!id) return;
    const response = await fetch("/api/check-status/" + encodeURIComponent(id));
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Gagal mengecek status");
    updateTransactionItem(data.data.id || id, data.data.status, data.data.saldo);
    return data.data;
  }

  document.addEventListener("click", async function (e) {
    const themeBtn = e.target.closest("#themeBtn");
    if (themeBtn) {
      updateTheme();
      return;
    }

    const tab = e.target.closest(".auth-tab");
    if (tab) {
      $$(".auth-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      const mode = isLogin ? "login" : "register";
      const loginPanel = $("#loginPanel");
      const registerPanel = $("#registerPanel");
      const googleBtn = $("#googleOAuthBtn");
      const githubBtn = $("#githubOAuthBtn");
      const oauthSep = $("#oauthSep");
      if (loginPanel) loginPanel.style.display = isLogin ? "block" : "none";
      if (registerPanel) registerPanel.style.display = isLogin ? "none" : "block";
      if (googleBtn) {
        googleBtn.href = "/auth/google?mode=" + mode;
        googleBtn.setAttribute("aria-label", isLogin ? "Masuk dengan Google" : "Daftar dengan Google");
      }
      if (githubBtn) {
        githubBtn.href = "/auth/github?mode=" + mode;
        githubBtn.setAttribute("aria-label", isLogin ? "Masuk dengan GitHub" : "Daftar dengan GitHub");
      }
      if (oauthSep) oauthSep.textContent = isLogin ? "atau masuk dengan" : "atau daftar dengan";
      return;
    }

    const loginBtn = e.target.closest("#loginBtn");
    if (loginBtn) {
      const email = $("#loginEmail")?.value.trim();
      const password = $("#loginPass")?.value;
      const alert = $("#loginAlert");
      if (!email || !password) {
        setAlert(alert, "error", "Email dan password wajib diisi");
        return;
      }
      setButtonLoading(loginBtn, true, "Memproses...");
      try {
        const res = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) location.href = "/dashboard";
        else setAlert(alert, "error", data.message || "Gagal login");
      } catch (err) {
        setAlert(alert, "error", "Gagal login");
      } finally {
        setButtonLoading(loginBtn, false);
      }
      return;
    }

    const regBtn = e.target.closest("#regBtn");
    if (regBtn) {
      const name = $("#regName")?.value.trim();
      const email = $("#regEmail")?.value.trim();
      const password = $("#regPass")?.value;
      const alert = $("#regAlert");
      if (!email || !password) {
        setAlert(alert, "error", "Email dan password wajib diisi");
        return;
      }
      if (password.length < 6) {
        setAlert(alert, "error", "Password minimal 6 karakter");
        return;
      }
      setButtonLoading(regBtn, true, "Membuat akun...");
      try {
        const res = await fetch("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (data.success) location.href = "/dashboard";
        else setAlert(alert, "error", data.message || "Gagal daftar");
      } catch (err) {
        setAlert(alert, "error", "Gagal daftar");
      } finally {
        setButtonLoading(regBtn, false);
      }
      return;
    }

    const copyKey = e.target.closest("#copyKey");
    if (copyKey) {
      const key = $("#apiKey")?.textContent.trim();
      if (!key) return;
      const ok = await copyText(key);
      copyKey.textContent = ok ? "Tersalin" : "Gagal";
      setTimeout(() => { copyKey.textContent = "Salin"; }, 1500);
      return;
    }

    const regenKey = e.target.closest("#regenKey");
    if (regenKey) {
      if (!confirm("Regenerasi API key? Key lama akan berhenti bekerja.")) return;
      setButtonLoading(regenKey, true, "Memproses...");
      try {
        const res = await fetch("/api/regenerate-key", { method: "POST" });
        const data = await res.json();
        if (data.success && $("#apiKey")) $("#apiKey").textContent = data.apiKey;
      } finally {
        setButtonLoading(regenKey, false);
      }
      return;
    }

    const refreshSaldo = e.target.closest("#refreshSaldo");
    if (refreshSaldo) {
      refreshSaldo.disabled = true;
      try {
        const res = await fetch("/api/saldo");
        const data = await res.json();
        if (data.success && $("#saldoValue")) $("#saldoValue").textContent = formatIDR(data.saldo);
      } finally {
        refreshSaldo.disabled = false;
      }
      return;
    }

    const createBtn = e.target.closest("#createBtn");
    if (createBtn) {
      const amount = Number($("#amount")?.value || 0);
      const description = $("#description")?.value.trim() || "Pembayaran";
      const alert = $("#qrisAlert");
      if (!amount || amount < 1000) {
        setAlert(alert, "error", "Minimal nominal Rp 1.000");
        return;
      }
      setButtonLoading(createBtn, true, "Membuat QRIS...");
      try {
        const res = await fetch("/api/create-qris", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, description })
        });
        const data = await res.json();
        if (data.success) {
          const trx = data.data;
          $("#qrisResult").style.display = "block";
          $("#qrImage").src = trx.qrImage || trx.qrUrl || "";
          $("#qrisAmount").textContent = formatIDR(trx.amount);
          $("#qrisFee").textContent = formatIDR(trx.adminFee);
          $("#qrisTotal").textContent = formatIDR(trx.totalAmount);
          $("#qrisId").textContent = trx.id;
          $("#statusBadge").className = "badge pending";
          $("#statusBadge").textContent = "pending";
        } else {
          setAlert(alert, "error", data.message || "Gagal buat QRIS");
        }
      } catch (err) {
        setAlert(alert, "error", "Gagal buat QRIS");
      } finally {
        setButtonLoading(createBtn, false);
      }
      return;
    }

    const checkBtn = e.target.closest("#checkBtn");
    if (checkBtn) {
      const id = $("#qrisId")?.textContent.trim();
      if (!id) return;
      setButtonLoading(checkBtn, true, "Mengecek...");
      try {
        const data = await checkTransaction(id);
        if (data) {
          const badge = $("#statusBadge");
          badge.className = "badge " + data.status;
          badge.textContent = data.status;
        }
      } catch (err) {
        setAlert($("#qrisAlert"), "error", err.message);
      } finally {
        setButtonLoading(checkBtn, false);
      }
      return;
    }

    const txItem = e.target.closest(".tx-item[data-id]");
    if (txItem) {
      openTransactionModal(txItem);
      return;
    }

    const closeTx = e.target.closest("#closeTxModal, #modalDoneBtn");
    if (closeTx) {
      closeTransactionModal();
      return;
    }

    const modalCheckBtn = e.target.closest("#modalCheckBtn");
    if (modalCheckBtn) {
      const modal = $("#txModal");
      const id = modal?.dataset.activeId;
      if (!id) return;
      setButtonLoading(modalCheckBtn, true, "Mengecek...");
      try {
        await checkTransaction(id);
      } catch (err) {
        alert(err.message);
      } finally {
        setButtonLoading(modalCheckBtn, false);
      }
      return;
    }

    const logoutBtn = e.target.closest("#logoutBtn");
    if (logoutBtn) {
      setButtonLoading(logoutBtn, true, "Keluar...");
      try {
        await fetch("/auth/logout", { method: "POST" });
      } finally {
        location.href = "/";
      }
      return;
    }

    const wdBtn = e.target.closest("#wdBtn");
    if (wdBtn) {
      const amount = Number($("#wdAmount")?.value || 0);
      const bank = $("#wdBank")?.value.trim();
      const account = $("#wdAccount")?.value.trim();
      const holder = $("#wdHolder")?.value.trim();
      const alert = $("#wdAlert");
      if (!amount || !bank || !account || !holder) {
        setAlert(alert, "error", "Lengkapi semua data penarikan");
        return;
      }
      setButtonLoading(wdBtn, true, "Mengirim...");
      try {
        const res = await fetch("/api/withdraw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, bank, account, holder })
        });
        const data = await res.json();
        if (data.success) {
          setAlert(alert, "success", "Penarikan diajukan. Saldo ditahan sampai diproses admin.");
          ["#wdAmount", "#wdBank", "#wdAccount", "#wdHolder"].forEach(selector => {
            const field = $(selector);
            if (field) field.value = "";
          });
          setTimeout(() => location.reload(), 450);
        } else {
          setAlert(alert, "error", data.message || "Gagal withdraw");
        }
      } catch (err) {
        setAlert(alert, "error", "Gagal withdraw");
      } finally {
        setButtonLoading(wdBtn, false);
      }
      return;
    }

    const adminRefresh = e.target.closest("#adminRefresh");
    if (adminRefresh) {
      location.reload();
      return;
    }

    const adminReject = e.target.closest("[data-admin-reject]");
    if (adminReject) {
      const id = adminReject.dataset.adminReject;
      const card = adminReject.closest("[data-withdrawal-card]");
      const reason = $("[data-reject-reason]", card)?.value.trim() || "";
      const adminAlert = $("#adminAlert");
      setButtonLoading(adminReject, true, "Menolak...");
      try {
        const res = await fetch("/api/admin/withdrawals/" + encodeURIComponent(id) + "/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Gagal menolak withdrawal");
        if (card) card.remove();
        setAlert(adminAlert, "success", "Withdrawal ditolak dan saldo pengguna dikembalikan.");
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        setAlert(adminAlert, "error", err.message || "Gagal menolak withdrawal");
        setButtonLoading(adminReject, false);
      }
      return;
    }

    const adminApprove = e.target.closest("[data-admin-approve]");
    if (adminApprove) {
      const id = adminApprove.dataset.adminApprove;
      const card = adminApprove.closest("[data-withdrawal-card]");
      const file = $("[data-proof-input]", card)?.files?.[0];
      const adminAlert = $("#adminAlert");
      if (!file) {
        setAlert(adminAlert, "error", "Pilih bukti transfer terlebih dahulu.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setAlert(adminAlert, "error", "Ukuran bukti transfer maksimal 10 MB.");
        return;
      }
      setButtonLoading(adminApprove, true, "Mengirim...");
      try {
        const form = new FormData();
        form.append("proof", file);
        const res = await fetch("/api/admin/withdrawals/" + encodeURIComponent(id) + "/approve", {
          method: "POST",
          body: form
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Gagal menyetujui withdrawal");
        if (card) card.remove();
        setAlert(adminAlert, "success", "Withdrawal disetujui dan bukti transfer sudah dikirim ke channel.");
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        setAlert(adminAlert, "error", err.message || "Gagal menyetujui withdrawal");
        setButtonLoading(adminApprove, false);
      }
      return;
    }
  });

  document.addEventListener("keydown", function (e) {
    const txItem = e.target.closest?.(".tx-item[data-id]");
    if (txItem && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openTransactionModal(txItem);
    }
    if (e.key === "Escape") closeTransactionModal();
  });

  document.addEventListener("click", function (e) {
    const modal = $("#txModal");
    if (modal && e.target === modal) closeTransactionModal();
  });

  const amountInput = $("#amount");
  const previewTotal = $("#previewTotal");
  if (amountInput && previewTotal) {
    const updatePreview = () => {
      const amount = Number(amountInput.value || 0);
      previewTotal.textContent = formatIDR(amount ? amount + 100 : 0);
    };
    amountInput.addEventListener("input", updatePreview);
    updatePreview();
  }

  if (window.userId) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(proto + "://" + location.host);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "subscribe", userId: window.userId })));
    ws.addEventListener("message", event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "payment" || data.type === "status") {
          updateTransactionItem(data.transactionId, data.status, data.saldo);
          const statusBadge = $("#statusBadge");
          const qrisId = $("#qrisId")?.textContent.trim();
          if (statusBadge && qrisId && qrisId === data.transactionId) {
            statusBadge.className = "badge " + data.status;
            statusBadge.textContent = data.status;
          }
        }
      } catch (e) {}
    });
  }
})();
