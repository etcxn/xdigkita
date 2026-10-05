const express = require("express");
const multer = require("multer");
const { nanoid } = require("nanoid");
const config = require("../config");
const db = require("../services/jsondb");
const bq = require("../services/buatqris");
const tg = require("../services/telegram");
const transactionMonitor = require("../services/transaction-monitor");
const { authRequired, adminRequired, apiKeyAuth } = require("../middleware/auth");

const router = express.Router();

function logActivity(userId, type, detail) {
  return db.getActivity(userId).then(list => {
    list.unshift({ id: nanoid(10), type, detail, at: new Date().toISOString() });
    if (list.length > 200) list.length = 200;
    return db.saveActivity(userId, list);
  });
}

function normalizedAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function createTransaction(data, userId, fallbackDescription) {
  const amount = normalizedAmount(data.amount);
  return {
    id: data.id,
    userId,
    amount,
    adminFee: config.buatqris.adminFee,
    totalAmount: normalizedAmount(data.totalAmount),
    qrUrl: data.qrUrl || null,
    qrImage: data.qrImage || null,
    status: "pending",
    description: data.description || fallbackDescription,
    createdAt: new Date().toISOString(),
    notifications: {
      created: false,
      success: false
    }
  };
}

router.post("/create-qris", authRequired, async (req, res) => {
  try {
    const amount = normalizedAmount(req.body.amount);
    const description = String(req.body.description || "Pembayaran").trim().slice(0, 180);
    const qrisMethod = req.body.qrisMethod;
    if (!amount || amount < 1000) return res.status(400).json({ success: false, message: "Minimal 1000" });

    const totalAmount = amount + config.buatqris.adminFee;
    const result = await bq.createQris(totalAmount, description, qrisMethod, "buyer");
    if (!result.success) return res.status(400).json({ success: false, message: result.message || "Gagal" });

    const trx = createTransaction({
      id: result.data.transaction_id,
      amount,
      totalAmount: result.data.total_amount || totalAmount,
      qrUrl: result.data.qr_url,
      qrImage: result.data.qris_image,
      description
    }, req.user.id, "Pembayaran");

    const list = await db.getTransactions(req.user.id);
    list.unshift(trx);
    await db.saveTransactions(req.user.id, list);
    await logActivity(req.user.id, "create_qris", `QRIS ${amount} dibuat`);
    transactionMonitor.notifyCreatedTransaction(req.user.id, trx.id).catch(error => {
      console.error(`[telegram] transaksi baru ${trx.id}: ${error.message}`);
    });

    res.json({ success: true, data: trx });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/check-status/:id", authRequired, async (req, res) => {
  try {
    const result = await transactionMonitor.syncTransactionStatus(
      req.user.id,
      req.params.id
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || "Gagal mengecek status"
      });
    }

    const user = await db.findUserById(req.user.id);

    res.json({
      success: true,
      data: {
        id: result.transaction.id,
        status: result.transaction.status,
        saldo: Number(user?.saldo || result.saldo || 0),
        amount: result.transaction.amount,
        adminFee: result.transaction.adminFee,
        totalAmount: result.transaction.totalAmount
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/transactions", authRequired, async (req, res) => {
  const list = await db.getTransactions(req.user.id);
  res.json({ success: true, data: list });
});

router.get("/saldo", authRequired, async (req, res) => {
  const user = await db.findUserById(req.user.id);
  res.json({ success: true, saldo: user.saldo || 0 });
});

router.post("/withdraw", authRequired, async (req, res) => {
  try {
    const amount = normalizedAmount(req.body.amount);
    const bank = String(req.body.bank || "").trim().slice(0, 80);
    const account = String(req.body.account || "").trim().slice(0, 60);
    const holder = String(req.body.holder || "").trim().slice(0, 120);
    const user = await db.findUserById(req.user.id);

    if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    if (!amount || Number(user.saldo || 0) < amount) return res.status(400).json({ success: false, message: "Saldo tidak cukup" });
    if (amount < config.withdraw.minAmount) return res.status(400).json({ success: false, message: `Minimal ${config.withdraw.minAmount}` });
    if (amount > config.withdraw.maxAmount) return res.status(400).json({ success: false, message: `Maksimal ${config.withdraw.maxAmount}` });
    if (!bank || !account || !holder) {
      return res.status(400).json({ success: false, message: "Data withdraw tidak lengkap" });
    }

    const wd = {
      id: `WD-${nanoid(10).toUpperCase()}`,
      userId: user.id,
      userName: user.name || "-",
      userEmail: user.email || "-",
      amount,
      bank,
      account,
      holder,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    user.saldo = Number(user.saldo || 0) - amount;
    await db.saveUser(user);

    const list = await db.getWithdrawals(user.id);
    list.unshift(wd);
    await db.saveWithdrawals(user.id, list);
    await logActivity(user.id, "withdraw_request", `Penarikan ${amount}`);

    await tg.notifyAdminWithdraw(wd, user);

    res.json({ success: true, data: { ...wd, saldo: user.saldo } });
  } catch (e) {
    console.error(`[withdraw] ${e.message}`);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/withdrawals", authRequired, async (req, res) => {
  const list = await db.getWithdrawals(req.user.id);
  res.json({ success: true, data: list });
});

router.get("/activity", authRequired, async (req, res) => {
  const list = await db.getActivity(req.user.id);
  res.json({ success: true, data: list });
});

router.post("/regenerate-key", authRequired, async (req, res) => {
  const user = await db.findUserById(req.user.id);
  user.apiKey = nanoid(32);
  await db.saveUser(user);
  res.json({ success: true, apiKey: user.apiKey });
});

router.post("/h2h/create", apiKeyAuth, async (req, res) => {
  try {
    const amount = normalizedAmount(req.body.amount);
    const description = String(req.body.description || "H2H").trim().slice(0, 180);
    if (!amount || amount < 1000) return res.status(400).json({ success: false, message: "Minimal 1000" });

    const totalAmount = amount + config.buatqris.adminFee;
    const result = await bq.createQris(totalAmount, description, "qris_two", "buyer");
    if (!result.success) return res.status(400).json({ success: false, message: result.message });

    const trx = createTransaction({
      id: result.data.transaction_id,
      amount,
      totalAmount: result.data.total_amount || totalAmount,
      qrUrl: result.data.qr_url,
      description
    }, req.user.id, "H2H");

    const list = await db.getTransactions(req.user.id);
    list.unshift(trx);
    await db.saveTransactions(req.user.id, list);
    transactionMonitor.notifyCreatedTransaction(req.user.id, trx.id).catch(error => {
      console.error(`[telegram] transaksi baru ${trx.id}: ${error.message}`);
    });

    res.json({
      success: true,
      data: {
        transaction_id: trx.id,
        qr_url: trx.qrUrl,
        amount: trx.amount,
        admin_fee: trx.adminFee,
        total_amount: trx.totalAmount,
        status: trx.status
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/h2h/status/:id", apiKeyAuth, async (req, res) => {
  try {
    const result = await transactionMonitor.syncTransactionStatus(
      req.user.id,
      req.params.id
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || "Gagal mengecek status"
      });
    }

    res.json({
      success: true,
      data: {
        transaction_id: result.transaction.id,
        status: result.transaction.status,
        amount: result.transaction.amount,
        admin_fee: result.transaction.adminFee,
        total_amount: result.transaction.totalAmount
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/h2h/saldo", apiKeyAuth, async (req, res) => {
  const user = await db.findUserById(req.user.id);
  res.json({ success: true, saldo: user.saldo || 0 });
});

router.get("/h2h/user-info", apiKeyAuth, async (req, res) => {
  const user = await db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
  res.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      provider: user.provider || "local",
      saldo: Number(user.saldo || 0),
      api_key: user.apiKey,
      created_at: user.createdAt || null
    }
  });
});

router.get("/h2h/transactions", apiKeyAuth, async (req, res) => {
  try {
    const requested = Number(req.query.limit || 10);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 10;
    const list = await db.getTransactions(req.user.id);
    res.json({ success: true, data: list.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/h2h/withdrawals", apiKeyAuth, async (req, res) => {
  try {
    const requested = Number(req.query.limit || 10);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 10;
    const list = await db.getWithdrawals(req.user.id);
    res.json({ success: true, data: list.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/h2h/activity", apiKeyAuth, async (req, res) => {
  try {
    const requested = Number(req.query.limit || 10);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 10;
    const list = await db.getActivity(req.user.id);
    res.json({ success: true, data: list.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/h2h/withdraw", apiKeyAuth, async (req, res) => {
  try {
    const amount = normalizedAmount(req.body.amount);
    const bank = String(req.body.bank || "").trim().slice(0, 80);
    const account = String(req.body.account || "").trim().slice(0, 60);
    const holder = String(req.body.holder || "").trim().slice(0, 120);
    const user = await db.findUserById(req.user.id);

    if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    if (!amount || Number(user.saldo || 0) < amount) return res.status(400).json({ success: false, message: "Saldo tidak cukup" });
    if (amount < config.withdraw.minAmount) return res.status(400).json({ success: false, message: `Minimal ${config.withdraw.minAmount}` });
    if (amount > config.withdraw.maxAmount) return res.status(400).json({ success: false, message: `Maksimal ${config.withdraw.maxAmount}` });
    if (!bank || !account || !holder) {
      return res.status(400).json({ success: false, message: "Data withdraw tidak lengkap" });
    }

    const wd = {
      id: `WD-${nanoid(10).toUpperCase()}`,
      userId: user.id,
      userName: user.name || "-",
      userEmail: user.email || "-",
      amount,
      bank,
      account,
      holder,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    user.saldo = Number(user.saldo || 0) - amount;
    await db.saveUser(user);

    const list = await db.getWithdrawals(user.id);
    list.unshift(wd);
    await db.saveWithdrawals(user.id, list);
    await logActivity(user.id, "withdraw_request", `Penarikan ${amount}`);
    await tg.notifyAdminWithdraw(wd, user);

    res.json({ success: true, data: { ...wd, saldo: user.saldo } });
  } catch (e) {
    console.error(`[h2h/withdraw] ${e.message}`);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/h2h/regenerate-key", apiKeyAuth, async (req, res) => {
  try {
    const user = await db.findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    user.apiKey = nanoid(32);
    await db.saveUser(user);
    await logActivity(user.id, "regenerate_api_key", "API key diregenerasi via H2H");
    res.json({ success: true, api_key: user.apiKey });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


const withdrawalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.withdraw.maxProofSizeBytes },
  fileFilter: (req, file, cb) => {
    if (!config.withdraw.allowedProofMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Format bukti transfer tidak didukung"));
    }
    cb(null, true);
  }
});

const withdrawalActionLock = new Set();

function runUpload(req, res, next) {
  withdrawalUpload.single("proof")(req, res, error => {
    if (!error) return next();
    return res.status(400).json({
      success: false,
      message: error.code === "LIMIT_FILE_SIZE"
        ? "Ukuran bukti transfer maksimal 10 MB"
        : error.message || "Upload bukti transfer gagal"
    });
  });
}

router.get("/admin/withdrawals", authRequired, adminRequired, async (req, res) => {
  try {
    const list = await db.getAllWithdrawals();
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, message: "Gagal mengambil data withdrawal" });
  }
});

router.post("/admin/withdrawals/:id/approve", authRequired, adminRequired, runUpload, async (req, res) => {
  const withdrawalId = String(req.params.id || "");
  if (withdrawalActionLock.has(withdrawalId)) {
    return res.status(409).json({ success: false, message: "Withdrawal sedang diproses" });
  }
  withdrawalActionLock.add(withdrawalId);

  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Bukti transfer wajib diunggah" });

    const found = await db.findWithdrawalById(withdrawalId);
    if (!found) return res.status(404).json({ success: false, message: "Withdrawal tidak ditemukan" });
    if (found.withdrawal.status !== "pending") {
      return res.status(409).json({ success: false, message: `Withdrawal sudah ${found.withdrawal.status}` });
    }

    const user = await db.findUserById(found.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User pemilik withdrawal tidak ditemukan" });

    const proof = await tg.sendWithdrawalProofToChannel(found.withdrawal, user, req.file);
    const updated = {
      ...found.withdrawal,
      status: "approved",
      approvedAt: new Date().toISOString(),
      processedByEmail: req.user.email,
      proof
    };

    found.list[found.index] = updated;
    await db.saveWithdrawals(found.user.id, found.list);
    await logActivity(found.user.id, "withdraw_approved", `Penarikan ${found.withdrawal.amount} disetujui admin`);

    res.json({ success: true, data: { ...updated, saldo: Number(user.saldo || 0) } });
  } catch (e) {
    console.error(`[admin/withdraw/approve] ${withdrawalId}: ${e.message}`);
    res.status(500).json({ success: false, message: e.message || "Gagal menyetujui withdrawal" });
  } finally {
    withdrawalActionLock.delete(withdrawalId);
  }
});

router.post("/admin/withdrawals/:id/reject", authRequired, adminRequired, async (req, res) => {
  const withdrawalId = String(req.params.id || "");
  if (withdrawalActionLock.has(withdrawalId)) {
    return res.status(409).json({ success: false, message: "Withdrawal sedang diproses" });
  }
  withdrawalActionLock.add(withdrawalId);

  try {
    const reason = String(req.body.reason || "").trim().slice(0, 240);
    const found = await db.findWithdrawalById(withdrawalId);
    if (!found) return res.status(404).json({ success: false, message: "Withdrawal tidak ditemukan" });
    if (found.withdrawal.status !== "pending") {
      return res.status(409).json({ success: false, message: `Withdrawal sudah ${found.withdrawal.status}` });
    }

    const user = await db.findUserById(found.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User pemilik withdrawal tidak ditemukan" });

    user.saldo = Number(user.saldo || 0) + Number(found.withdrawal.amount || 0);
    await db.saveUser(user);

    const updated = {
      ...found.withdrawal,
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      processedByEmail: req.user.email,
      rejectionReason: reason || "Tidak memenuhi ketentuan penarikan"
    };

    found.list[found.index] = updated;
    await db.saveWithdrawals(found.user.id, found.list);
    await logActivity(found.user.id, "withdraw_rejected", `Penarikan ${found.withdrawal.amount} ditolak dan saldo dikembalikan`);
    await tg.notifyWithdrawalRejected(updated, user);

    res.json({ success: true, data: { ...updated, saldo: user.saldo } });
  } catch (e) {
    console.error(`[admin/withdraw/reject] ${withdrawalId}: ${e.message}`);
    res.status(500).json({ success: false, message: e.message || "Gagal menolak withdrawal" });
  } finally {
    withdrawalActionLock.delete(withdrawalId);
  }
});

module.exports = router;
