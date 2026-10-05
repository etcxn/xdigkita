const config = require("../config");
const db = require("./jsondb");
const bq = require("./buatqris");
const tg = require("./telegram");

const locks = new Map();
let monitorRunning = false;

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();

  if (["success", "successful", "paid", "completed", "complete"].includes(status)) {
    return "success";
  }

  if (["expired", "expire", "kadaluarsa", "kadaluwarsa"].includes(status)) {
    return "expired";
  }

  if (["failed", "failure", "gagal", "cancelled", "canceled"].includes(status)) {
    return "failed";
  }

  return status || "pending";
}

function notificationState(trx) {
  if (!trx.notifications || typeof trx.notifications !== "object") {
    trx.notifications = {};
  }
  return trx.notifications;
}

async function sendCreatedNotification(trx, user, list) {
  const notifications = notificationState(trx);
  if (notifications.created) return false;

  try {
    await tg.notifyTransaction("new", trx, user);
    notifications.created = new Date().toISOString();
    await db.saveTransactions(user.id, list);
    return true;
  } catch (error) {
    console.error(`[telegram] transaksi baru ${trx.id}: ${error.message}`);
    return false;
  }
}

async function sendSuccessNotification(trx, user, list) {
  const notifications = notificationState(trx);
  if (notifications.success) return false;

  try {
    await tg.notifyTransaction("success", trx, user);
    notifications.success = new Date().toISOString();
    await db.saveTransactions(user.id, list);
    return true;
  } catch (error) {
    console.error(`[telegram] transaksi selesai ${trx.id}: ${error.message}`);
    return false;
  }
}

async function withTransactionLock(userId, transactionId, task) {
  const key = `${userId}:${transactionId}`;
  const previous = locks.get(key) || Promise.resolve();

  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });

  const chain = previous.then(() => current);
  locks.set(key, chain);

  try {
    await previous;
    return await task();
  } finally {
    release();
    if (locks.get(key) === chain) locks.delete(key);
  }
}

async function notifyCreatedTransaction(userId, transactionId) {
  return withTransactionLock(userId, transactionId, async () => {
    const list = await db.getTransactions(userId);
    const trx = list.find(item => item.id === transactionId);
    if (!trx) return { success: false, message: "Transaksi tidak ditemukan." };

    const user = await db.findUserById(userId);
    if (!user) return { success: false, message: "User tidak ditemukan." };

    const sent = await sendCreatedNotification(trx, user, list);
    return { success: sent || Boolean(trx.notifications?.created), transaction: trx };
  });
}

async function syncTransactionStatus(userId, transactionId) {
  return withTransactionLock(userId, transactionId, async () => {
    const list = await db.getTransactions(userId);
    const trx = list.find(item => item.id === transactionId);

    if (!trx) {
      return { success: false, message: "Transaksi tidak ditemukan." };
    }

    const user = await db.findUserById(userId);
    if (!user) {
      return { success: false, message: "User tidak ditemukan." };
    }

    const result = await bq.checkStatus(trx.id);
    if (!result.success) {
      return {
        success: false,
        message: result.message || "Gagal mengecek status.",
        transaction: trx
      };
    }

    const newStatus = normalizeStatus(result.data?.status);
    const oldStatus = normalizeStatus(trx.status);
    let statusChanged = false;

    if (newStatus === "success" && oldStatus !== "success") {
      trx.status = "success";
      trx.paidAt = new Date().toISOString();
      statusChanged = true;

      user.saldo = (user.saldo || 0) + Number(trx.amount || 0);
      await db.saveUser(user);
      await db.saveTransactions(userId, list);

      const currentUser = await db.findUserById(userId);
      await sendSuccessNotification(trx, currentUser || user, list);
    } else if (newStatus !== oldStatus) {
      trx.status = newStatus;
      statusChanged = true;
      await db.saveTransactions(userId, list);
    } else if (
      newStatus === "success" &&
      trx.notifications &&
      !trx.notifications.success
    ) {
      await sendSuccessNotification(trx, user, list);
    }

    return {
      success: true,
      statusChanged,
      transaction: trx,
      saldo: Number(user.saldo || 0)
    };
  });
}

async function monitorPendingTransactions() {
  if (monitorRunning) return;
  monitorRunning = true;

  try {
    const users = await db.listUsers();

    for (const user of users) {
      const list = await db.getTransactions(user.id);
      const candidates = list.filter(trx => {
        const status = normalizeStatus(trx.status);
        const notifications = trx.notifications;
        if (!notifications) return false;

        return (
          status === "pending" ||
          (status === "success" && !notifications.success) ||
          !notifications.created
        );
      });

      for (const trx of candidates) {
        try {
          const notifications = trx.notifications || {};
          if (!notifications.created) {
            await notifyCreatedTransaction(user.id, trx.id);
          }
          await syncTransactionStatus(user.id, trx.id);
        } catch (error) {
          console.error(`[monitor] ${trx.id}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`[monitor] ${error.message}`);
  } finally {
    monitorRunning = false;
  }
}

function startTransactionMonitor() {
  const interval = Math.max(
    5000,
    Number(config.telegram.transactionPollIntervalMs || 15000)
  );

  setTimeout(() => {
    monitorPendingTransactions().catch(error => {
      console.error(`[monitor] initial run: ${error.message}`);
    });
  }, 2000);

  setInterval(() => {
    monitorPendingTransactions().catch(error => {
      console.error(`[monitor] interval: ${error.message}`);
    });
  }, interval);

  console.log(`Transaction monitor aktif setiap ${interval}ms`);
}

module.exports = {
  normalizeStatus,
  notifyCreatedTransaction,
  syncTransactionStatus,
  monitorPendingTransactions,
  startTransactionMonitor
};
