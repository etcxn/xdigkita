module.exports = {
  port: 3000,
  baseUrl: "https://xdigitalkita.my.id",
  sessionSecret: "XDK_SESSION_9f8e7d6c5b4a3210",
  jwtSecret: "XDK_JWT_1a2b3c4d5e6f7a8b9c0d",

  buatqris: {
    baseUrl: "https://api.buatqris.site",
    accountId: "user_6abe3b822c34e8.84351712",
    secretToken: "sk_live_1b01c299108cdc9d4cde7bfac0970edfb5157c5e7e118d7ec8820c59fbe2e480",
    adminFee: 100
  },

  db: {
    type: "json",
    path: "./data"
  },

  oauth: {
    google: {
      clientId: "893041852839-vopmi92ap7r7b81tstu4t72mahju8r1f.apps.googleusercontent.com",
      clientSecret: "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",
      callbackUrl: "https://xdigitalkita.my.id/auth/google/callback"
    },
    github: {
      clientId: "Ov23lix0a11lGemDtpOo",
      clientSecret: "fd2054012d3357810d63d9e848e02c299f085705",
      callbackUrl: "https://xdigitalkita.my.id/auth/github/callback"
    }
  },

  admin: {
    emails: [
      "ellxyznulll@gmail.com"
    ]
  },

  telegram: {
    botToken: "8731350704:AAGouLwmm7QmgaIUOpKpWDokgfzcvd5k2bc",
    adminChatId: "8669203702",
    transactionChannelId: "@xdigitalkita",
    transactionBannerNewUrl: "https://xdigitalkita.my.id/assets/transaction-new.png",
    transactionBannerSuccessUrl: "https://xdigitalkita.my.id/assets/transaction-success.png",
    transactionPollIntervalMs: 15000,
    requiredChannel: "@xdigitalkita",
    requiredChannelUrl: "https://t.me/xdigitalkita",
    requiredChannelTitle: "Channel Information"
  },

  withdraw: {
    minAmount: 12500,
    maxAmount: 5000000,
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
