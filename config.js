module.exports = {
  port: process.env.PORT || process.env.SERVER_PORT || 3000,
  baseUrl: process.env.BASE_URL || "https://xdigitalkita.my.id",
  sessionSecret: process.env.SESSION_SECRET || "XDK_SESSION_9f8e7d6c5b4a3210",
  jwtSecret: process.env.JWT_SECRET || "XDK_JWT_1a2b3c4d5e6f7a8b9c0d",
  buatqris: {
    baseUrl: process.env.BUATQRIS_BASE_URL || "https://api.buatqris.site",
    accountId: process.env.BUATQRIS_ACCOUNT_ID || "user_6abe3b822c34e8.84351712",
    secretToken: process.env.BUATQRIS_SECRET_TOKEN || "sk_live_1b01c299108cdc9d4cde7bfac0970edfb5157c5e7e118d7ec8820c59fbe2e480",
    adminFee: Number(process.env.BUATQRIS_ADMIN_FEE || 100)
  },

  github: {
    token: process.env.GITHUB_TOKEN || "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",
    owner: process.env.GITHUB_OWNER || "alwaysxell",
    repo: process.env.GITHUB_REPO || "db",
    branch: process.env.GITHUB_BRANCH || "main"
  },

  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "893041852839-vopmi92ap7r7b81tstu4t72mahju8r1f.apps.googleusercontent.com",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "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",
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || "https://xdigitalkita.my.id/auth/google/callback"
    },
    github: {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID || "Ov23lix0a11lGemDtpOo",
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || "fd2054012d3357810d63d9e848e02c299f085705",
      callbackUrl: process.env.GITHUB_CALLBACK_URL || "https://xdigitalkita.my.id/auth/github/callback"
    }
  },

  admin: {
    emails: process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS.split(",").map(e => e.trim())
      : ["ellxyznulll@gmail.com"]
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "8731350704:AAGouLwmm7QmgaIUOpKpWDokgfzcvd5k2bc",
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || "8669203702",
    transactionChannelId: process.env.TELEGRAM_TRANSACTION_CHANNEL_ID || "@xdigitalkita",
    transactionBannerNewUrl: process.env.TELEGRAM_BANNER_NEW_URL || "https://xdigitalkita.my.id/assets/transaction-new.png",
    transactionBannerSuccessUrl: process.env.TELEGRAM_BANNER_SUCCESS_URL || "https://xdigitalkita.my.id/assets/transaction-success.png",
    transactionPollIntervalMs: Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 15000),
    requiredChannel: process.env.TELEGRAM_REQUIRED_CHANNEL || "@xdigitalkita",
    requiredChannelUrl: process.env.TELEGRAM_REQUIRED_CHANNEL_URL || "https://t.me/xdigitalkita",
    requiredChannelTitle: process.env.TELEGRAM_REQUIRED_CHANNEL_TITLE || "Channel Information"
  },

  withdraw: {
    minAmount: Number(process.env.WITHDRAW_MIN_AMOUNT || 12500),
    maxAmount: Number(process.env.WITHDRAW_MAX_AMOUNT || 5000000),
    maxProofSizeBytes: 10 * 1024 * 1024,
    allowedProofMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "application/pdf"
    ]
  }
};
