const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../services/jsondb");

function authRequired(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: "Token invalid" });
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const list = Array.isArray(config.admin?.emails) ? config.admin.emails : [];
  return list.map(normalizeEmail).includes(normalized);
}

function adminRequired(req, res, next) {
  const email = req.user?.email;
  if (!isAdminEmail(email)) {
    const wantsJson = req.baseUrl === "/api" ||
      String(req.headers.accept || "").includes("application/json");
    if (wantsJson) {
      return res.status(403).json({ success: false, message: "Akses admin diperlukan" });
    }
    return res.redirect("/dashboard");
  }
  req.isAdmin = true;
  next();
}

function apiKeyAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"] || req.body.api_key || req.query.api_key;
  if (!apiKey) return res.status(401).json({ success: false, message: "API key required" });
  db.findUserByApiKey(apiKey).then(user => {
    if (!user) return res.status(401).json({ success: false, message: "API key invalid" });
    req.user = user;
    next();
  }).catch(() => res.status(500).json({ success: false, message: "Server error" }));
}

module.exports = { authRequired, adminRequired, apiKeyAuth, isAdminEmail, normalizeEmail };
