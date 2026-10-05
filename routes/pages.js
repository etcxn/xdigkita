const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../services/githubdb");
const { isAdminEmail } = require("../middleware/auth");

const router = express.Router();

async function getUser(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return await db.findUserById(payload.id);
  } catch (e) {
    return null;
  }
}

function getDashboardStats(transactions) {
  const today = new Date().toLocaleDateString("id-ID");
  const todayTransactions = transactions.filter(t => new Date(t.createdAt).toLocaleDateString("id-ID") === today);
  const successful = transactions.filter(t => t.status === "success");
  const pending = transactions.filter(t => t.status === "pending");
  const failed = transactions.filter(t => ["failed", "expired"].includes(t.status));
  const todaySuccessful = todayTransactions.filter(t => t.status === "success");
  const todayIncome = todaySuccessful.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const todayAverage = todaySuccessful.length ? Math.round(todayIncome / todaySuccessful.length) : 0;
  const totalIncome = successful.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalFee = transactions.reduce((sum, t) => sum + Number(t.adminFee || 0), 0);

  return {
    total: transactions.length,
    successful: successful.length,
    pending: pending.length,
    failed: failed.length,
    todayIncome,
    todayTransactions: todaySuccessful.length,
    todayAverage,
    totalIncome,
    totalFee
  };
}

router.use((req, res, next) => {
  res.locals.telegramChannelUrl = config.telegram.requiredChannelUrl;
  res.locals.telegramChannelTitle = config.telegram.requiredChannelTitle;
  res.locals.isAdmin = false;
  next();
});

// Landing / Home Page
router.get("/", async (req, res) => {
  const user = await getUser(req);
  const globalStats = await db.getGlobalStats();
  const stats = {
    realUsers: globalStats.realUsers,
    totalUsers: 1000 + globalStats.realUsers,
    realTransactions: globalStats.realTransactions,
    totalTransactions: 3400 + globalStats.realTransactions,
    realWithdrawals: globalStats.realWithdrawals,
    totalWithdrawals: 342 + globalStats.realWithdrawals
  };

  res.render("landing", {
    user,
    isAdmin: user ? isAdminEmail(user.email) : false,
    stats,
    adminFee: config.buatqris.adminFee
  });
});

// Dedicated Login Page (https://url/login)
router.get("/login", async (req, res) => {
  const user = await getUser(req);
  if (user) return res.redirect("/dashboard");
  res.render("login");
});

router.get("/dashboard", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect("/login");
  const transactions = await db.getTransactions(user.id);
  const activity = await db.getActivity(user.id);
  res.render("dashboard", {
    user,
    isAdmin: isAdminEmail(user.email),
    transactions: transactions.slice(0, 10),
    activity: activity.slice(0, 8),
    stats: getDashboardStats(transactions)
  });
});

router.get("/qris", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect("/login");
  res.render("qris", { user, adminFee: config.buatqris.adminFee, isAdmin: isAdminEmail(user.email) });
});

router.get("/withdraw", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect("/login");
  const withdrawals = await db.getWithdrawals(user.id);
  res.render("withdraw", { user, withdrawals, isAdmin: isAdminEmail(user.email) });
});

router.get("/admin", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect("/login");
  if (!isAdminEmail(user.email)) return res.redirect("/dashboard");

  const withdrawals = await db.getAllWithdrawals();
  const stats = {
    users: (await db.listUsers()).length,
    total: withdrawals.length,
    pending: withdrawals.filter(w => w.status === "pending").length,
    approved: withdrawals.filter(w => w.status === "approved").length,
    rejected: withdrawals.filter(w => w.status === "rejected").length,
    amountPending: withdrawals
      .filter(w => w.status === "pending")
      .reduce((sum, w) => sum + Number(w.amount || 0), 0)
  };

  res.render("admin", {
    user,
    isAdmin: true,
    withdrawals,
    stats
  });
});

router.get("/docs", async (req, res) => {
  const user = await getUser(req);
  res.render("docs", { user, adminFee: config.buatqris.adminFee, isAdmin: user ? isAdminEmail(user.email) : false });
});

router.get("/profile", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect("/login");
  res.render("profile", { user, isAdmin: isAdminEmail(user.email) });
});

module.exports = router;
