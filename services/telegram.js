const axios = require("axios");
const FormData = require("form-data");
const config = require("../config");

const api = axios.create({
  baseURL: `https://api.telegram.org/bot${config.telegram.botToken}`,
  timeout: 20000
});

function formatIDR(value) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function richText(value) {
  return String(value ?? "");
}

function tableCell(text, options = {}) {
  return {
    text: richText(text),
    ...options
  };
}

async function callApi(method, payload) {
  return api.post(`/${method}`, payload);
}

async function sendRichMessage(chatId, blocks, extra = {}) {
  if (!chatId) throw new Error("Telegram target belum dikonfigurasi.");

  return callApi("sendRichMessage", {
    chat_id: chatId,
    rich_message: {
      blocks
    },
    ...extra
  });
}

async function sendMessage(chatId, text) {
  return api.post("/sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Setujui", callback_data: "approve" },
          { text: "Tolak", callback_data: "reject" }
        ]
      ]
    }
  });
}

function transactionTarget() {
  return config.telegram.transactionChannelId || config.telegram.requiredChannel || config.telegram.adminChatId;
}

function transactionBanner(type) {
  return type === "success"
    ? config.telegram.transactionBannerSuccessUrl
    : config.telegram.transactionBannerNewUrl;
}

function transactionBlocks(type, trx, user) {
  const success = type === "success";
  const title = success ? "TRANSAKSI SELESAI" : "TRANSAKSI BARU";
  const description = success
    ? "Pembayaran telah berhasil diterima dan transaksi dinyatakan selesai."
    : "Sebuah transaksi baru telah dibuat dan sedang menunggu pembayaran.";

  const createdAt = trx.createdAt
    ? new Date(trx.createdAt).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "medium"
      })
    : "-";

  const paidAt = trx.paidAt
    ? new Date(trx.paidAt).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "medium"
      })
    : "-";

  return [
    {
      type: "photo",
      photo: {
        type: "photo",
        media: transactionBanner(type)
      },
      caption: {
        text: `${title} • XDigitalKita`
      }
    },
    {
      type: "heading",
      text: title,
      size: 2
    },
    {
      type: "paragraph",
      text: description
    },
    {
      type: "divider"
    },
    {
      type: "table",
      is_bordered: true,
      is_striped: true,
      is_compact: true,
      cells: [
        [
          tableCell("INFORMASI", { is_header: true }),
          tableCell("DETAIL", { is_header: true })
        ],
        [
          tableCell("ID Transaksi"),
          tableCell(trx.id || "-")
        ],
        [
          tableCell("User"),
          tableCell(user?.name || user?.email || user?.id || "-")
        ],
        [
          tableCell("Keterangan"),
          tableCell(trx.description || "Pembayaran")
        ],
        [
          tableCell("Nominal"),
          tableCell(formatIDR(trx.amount))
        ],
        [
          tableCell("Biaya Admin"),
          tableCell(formatIDR(trx.adminFee))
        ],
        [
          tableCell("Total Bayar"),
          tableCell(formatIDR(trx.totalAmount))
        ],
        [
          tableCell("Status"),
          tableCell(success ? "SUCCESS" : "PENDING")
        ],
        [
          tableCell(success ? "Selesai" : "Dibuat"),
          tableCell(success ? paidAt : createdAt)
        ]
      ]
    },
    {
      type: "paragraph",
      text: success
        ? "✅ Dana sudah diproses ke saldo pengguna."
        : "⏳ Menunggu pembayaran dari pelanggan."
    },
    {
      type: "buttons",
      align: "center",
      buttons: [
        {
          text: "Buka Dashboard",
          style: "primary",
          url: `${config.baseUrl}/dashboard`
        },
        {
          text: "Salin ID",
          copy_text: {
            text: String(trx.id || "-")
          }
        }
      ]
    },
    {
      type: "footer",
      text: "XDigitalKita • QRIS H2H"
    }
  ];
}

async function notifyTransaction(type, trx, user) {
  return sendRichMessage(
    transactionTarget(),
    transactionBlocks(type, trx, user)
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function withdrawalText(data, user, status) {
  const title = status === "approved" ? "PENARIKAN DISETUJUI" :
    status === "rejected" ? "PENARIKAN DITOLAK" : "PENARIKAN BARU";
  const statusLabel = status.toUpperCase();
  const userName = user?.name || data.userName || "-";
  const userEmail = user?.email || data.userEmail || "-";
  const reason = data.rejectionReason ? `\nAlasan: ${escapeHtml(data.rejectionReason)}` : "";

  return `<b>${title}</b>\n` +
    `ID: <code>${escapeHtml(data.id)}</code>\n` +
    `User: ${escapeHtml(userName)}\n` +
    `Email: ${escapeHtml(userEmail)}\n` +
    `Jumlah: <b>${formatIDR(data.amount)}</b>\n` +
    `Bank: ${escapeHtml(data.bank)}\n` +
    `Rekening: <code>${escapeHtml(data.account)}</code>\n` +
    `Atas Nama: ${escapeHtml(data.holder)}\n` +
    `Status: <b>${statusLabel}</b>` +
    reason;
}

async function notifyAdminWithdraw(data, user) {
  return callApi("sendMessage", {
    chat_id: config.telegram.adminChatId,
    text: withdrawalText(data, user, "pending"),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        {
          text: "Buka Panel Admin",
          url: `${config.baseUrl}/admin`
        }
      ]]
    }
  });
}

function getProofMethod(mimetype) {
  if (String(mimetype || "").startsWith("image/")) return "sendPhoto";
  if (String(mimetype || "").startsWith("video/")) return "sendVideo";
  return "sendDocument";
}

async function sendWithdrawalProofToChannel(data, user, file) {
  if (!file?.buffer) throw new Error("Bukti transfer wajib diunggah.");
  const chatId = config.telegram.transactionChannelId || config.telegram.requiredChannel;
  if (!chatId) throw new Error("Channel Telegram belum dikonfigurasi.");

  const method = getProofMethod(file.mimetype);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(method === "sendPhoto" ? "photo" : method === "sendVideo" ? "video" : "document", file.buffer, {
    filename: file.originalname || `bukti-${data.id}`,
    contentType: file.mimetype || "application/octet-stream"
  });
  form.append("caption", withdrawalText(data, user, "approved"));
  form.append("parse_mode", "HTML");

  const response = await api.post(`/${method}`, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  const message = response.data?.result || {};
  return {
    messageId: message.message_id || null,
    channelId: chatId,
    method,
    mimeType: file.mimetype || null,
    fileName: file.originalname || null,
    fileSize: file.size || file.buffer.length
  };
}

async function notifyWithdrawalRejected(data, user) {
  const chatId = config.telegram.transactionChannelId || config.telegram.requiredChannel;
  if (!chatId) return null;
  return callApi("sendMessage", {
    chat_id: chatId,
    text: withdrawalText(data, user, "rejected"),
    parse_mode: "HTML"
  });
}

async function sendUserMessage(userId, text) {
  return sendMessage(userId, text);
}

module.exports = {
  callApi,
  sendMessage,
  sendRichMessage,
  notifyTransaction,
  notifyAdminWithdraw,
  sendWithdrawalProofToChannel,
  notifyWithdrawalRejected,
  sendUserMessage
};
