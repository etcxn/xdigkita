const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const { nanoid } = require("nanoid");
const config = require("../config");
const db = require("../services/jsondb");

const router = express.Router();

const googleClient = new OAuth2Client({
  clientId: config.oauth.google.clientId,
  clientSecret: config.oauth.google.clientSecret,
  redirectUri: config.oauth.google.callbackUrl
});

const OAUTH_STATE_TTL = 10 * 60 * 1000;

function createOAuthState() {
  return crypto.randomBytes(32).toString("hex");
}

function createCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function createCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function getOAuthMode(value) {
  return value === "register" ? "register" : "login";
}

function isSecureRequest(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  return req.secure === true || forwarded === "https";
}

function oauthCookieOptions(req, maxAge = OAUTH_STATE_TTL) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/auth",
    maxAge
  };
}

function oauthCookieName(provider) {
  return `oauth_${provider}`;
}

function saveOAuthState(req, provider, mode, state, extra = {}) {
  const payload = {
    provider,
    mode,
    state,
    createdAt: Date.now(),
    ...extra
  };

  const signed = jwt.sign(payload, config.jwtSecret, {
    expiresIn: "10m"
  });

  req.res.cookie(
    oauthCookieName(provider),
    signed,
    oauthCookieOptions(req)
  );
}

function consumeOAuthState(req, provider, state) {
  const cookieName = oauthCookieName(provider);
  const raw = req.cookies?.[cookieName];

  req.res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/auth"
  });

  if (!raw) {
    throw new Error("Sesi OAuth tidak ditemukan atau sudah kedaluwarsa.");
  }

  let pending;
  try {
    pending = jwt.verify(raw, config.jwtSecret);
  } catch (error) {
    throw new Error("Sesi OAuth tidak valid atau sudah kedaluwarsa.");
  }

  if (pending.provider !== provider) {
    throw new Error("Provider OAuth tidak sesuai.");
  }

  if (!state || state !== pending.state) {
    throw new Error("State OAuth tidak valid.");
  }

  if (
    Date.now() - Number(pending.createdAt || 0) > OAUTH_STATE_TTL
  ) {
    throw new Error("Sesi OAuth sudah kedaluwarsa.");
  }

  return pending;
}

function setAuthCookie(req, res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

async function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const users = await db.listUsers();
  return users.find(
    user => String(user.email || "").trim().toLowerCase() === normalized
  ) || null;
}

async function upsertOAuthUser({
  email,
  name,
  avatar,
  provider,
  providerId,
  mode
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email akun tidak tersedia.");

  let user = await findUserByEmail(normalizedEmail);

  if (!user && mode === "login") {
    throw new Error("Akun belum terdaftar. Pilih Daftar untuk membuat akun.");
  }

  if (user && mode === "register") {
    throw new Error("Email tersebut sudah terdaftar. Pilih Masuk untuk login.");
  }

  if (!user) {
    user = {
      id: nanoid(12),
      email: normalizedEmail,
      name: String(name || normalizedEmail.split("@")[0]).trim(),
      avatar: avatar || null,
      provider,
      providerId: providerId || null,
      password: null,
      apiKey: nanoid(32),
      saldo: 0,
      createdAt: new Date().toISOString()
    };
    await db.saveUser(user);
    return user;
  }

  if (!user.name && name) user.name = String(name).trim();
  if (!user.avatar && avatar) user.avatar = avatar;
  if (!user[`${provider}Id`] && providerId) {
    user[`${provider}Id`] = providerId;
  }
  if (!user.providerId && providerId) user.providerId = providerId;
  await db.saveUser(user);
  return user;
}

async function getGoogleUser(code, pending) {
  const { tokens } = await googleClient.getToken({
    code,
    redirect_uri: config.oauth.google.callbackUrl
  });

  if (!tokens.id_token) throw new Error("Google tidak mengembalikan ID token.");

  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.oauth.google.clientId
  });

  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error("Identitas Google tidak valid.");
  if (pending.nonce && payload.nonce !== pending.nonce) {
    throw new Error("Nonce Google tidak valid.");
  }
  if (payload.email_verified !== true) {
    throw new Error("Email Google belum terverifikasi.");
  }
  if (!payload.email) throw new Error("Google tidak mengembalikan email.");

  return {
    email: payload.email,
    name: payload.name,
    avatar: payload.picture,
    providerId: payload.sub
  };
}

async function getGitHubUser(code, pending) {
  const tokenResponse = await axios.post(
    "https://github.com/login/oauth/access_token",
    new URLSearchParams({
      client_id: config.oauth.github.clientId,
      client_secret: config.oauth.github.clientSecret,
      code,
      redirect_uri: config.oauth.github.callbackUrl,
      code_verifier: pending.codeVerifier
    }),
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    }
  );

  const accessToken = tokenResponse.data?.access_token;
  if (!accessToken) {
    throw new Error(
      tokenResponse.data?.error_description ||
      "GitHub tidak mengembalikan access token."
    );
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": "2026-03-10"
  };

  const [userResponse, emailResponse] = await Promise.all([
    axios.get("https://api.github.com/user", { headers, timeout: 15000 }),
    axios.get("https://api.github.com/user/emails", { headers, timeout: 15000 })
  ]);

  const githubUser = userResponse.data || {};
  const emails = Array.isArray(emailResponse.data) ? emailResponse.data : [];
  const verifiedPrimary = emails.find(item => item.primary && item.verified);
  const verifiedEmail = verifiedPrimary || emails.find(item => item.verified);

  if (!verifiedEmail?.email) {
    throw new Error(
      "GitHub tidak memiliki email terverifikasi yang dapat digunakan."
    );
  }

  return {
    email: verifiedEmail.email,
    name: githubUser.name || githubUser.login,
    avatar: githubUser.avatar_url || null,
    providerId: String(githubUser.id || githubUser.login || "")
  };
}

function oauthError(res, message) {
  const safeMessage = encodeURIComponent(
    String(message || "Autentikasi OAuth gagal.")
  );
  return res.redirect(`/?oauth_error=${safeMessage}`);
}

router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email dan password wajib"
    });
  }

  const existing = await db.findUserByEmail(email);
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Email sudah terdaftar"
    });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: nanoid(12),
    email: String(email).trim().toLowerCase(),
    name: name || String(email).split("@")[0],
    avatar: null,
    provider: "local",
    password: hash,
    apiKey: nanoid(32),
    saldo: 0,
    createdAt: new Date().toISOString()
  };

  await db.saveUser(user);
  setAuthCookie(req, res, user);

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      apiKey: user.apiKey,
      saldo: 0
    }
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.findUserByEmail(email);

  if (!user || !user.password) {
    return res.status(400).json({
      success: false,
      message: "Akun tidak ditemukan"
    });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(400).json({
      success: false,
      message: "Password salah"
    });
  }

  setAuthCookie(req, res, user);

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      apiKey: user.apiKey,
      saldo: user.saldo
    }
  });
});

router.get("/google", (req, res) => {
  const mode = getOAuthMode(req.query.mode);
  const state = createOAuthState();
  const nonce = createOAuthState();

  saveOAuthState(req, "google", mode, state, { nonce });

  const authUrl = googleClient.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    response_type: "code",
    scope: ["openid", "email", "profile"],
    state,
    nonce
  });

  res.redirect(authUrl);
});

router.get("/google/callback", async (req, res) => {
  try {
    if (req.query.error) {
      throw new Error(
        req.query.error_description ||
        `Google OAuth error: ${req.query.error}`
      );
    }

    const pending = consumeOAuthState(req, "google", req.query.state);
    if (!req.query.code) {
      throw new Error("Google tidak mengirim authorization code.");
    }

    const identity = await getGoogleUser(req.query.code, pending);
    const user = await upsertOAuthUser({
      ...identity,
      provider: "google",
      mode: pending.mode
    });

    setAuthCookie(req, res, user);
    res.redirect("/dashboard");
  } catch (e) {
    oauthError(res, e.message);
  }
});

router.get("/github", (req, res) => {
  const mode = getOAuthMode(req.query.mode);
  const state = createOAuthState();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);

  saveOAuthState(req, "github", mode, state, { codeVerifier });

  const params = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    redirect_uri: config.oauth.github.callbackUrl,
    scope: "user:email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    allow_signup: "true"
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get("/github/callback", async (req, res) => {
  try {
    if (req.query.error) {
      throw new Error(
        req.query.error_description ||
        `GitHub OAuth error: ${req.query.error}`
      );
    }

    const pending = consumeOAuthState(req, "github", req.query.state);
    if (!req.query.code) {
      throw new Error("GitHub tidak mengirim authorization code.");
    }

    const identity = await getGitHubUser(req.query.code, pending);
    const user = await upsertOAuthUser({
      ...identity,
      provider: "github",
      mode: pending.mode
    });

    setAuthCookie(req, res, user);
    res.redirect("/dashboard");
  } catch (e) {
    oauthError(res, e.message);
  }
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ success: false });

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await db.findUserById(payload.id);

    if (!user) return res.status(401).json({ success: false });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        apiKey: user.apiKey,
        saldo: user.saldo
      }
    });
  } catch (e) {
    res.status(401).json({ success: false });
  }
});

router.post("/logout", (req, res) => {
  req.session.oauth = null;
  res.clearCookie("token", { path: "/" });
  res.clearCookie("oauth_google", { path: "/auth" });
  res.clearCookie("oauth_github", { path: "/auth" });
  res.json({ success: true });
});

module.exports = router;
