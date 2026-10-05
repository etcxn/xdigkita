const axios = require("axios");
const config = require("../config");

const client = axios.create({
  baseURL: config.buatqris.baseUrl,
  headers: { "Content-Type": "application/x-www-form-urlencoded" }
});

async function createQris(amount, description, qrisMethod, feeBy) {
  const body = new URLSearchParams({
    action: "api_create_qris",
    account_id: config.buatqris.accountId,
    secret_token: config.buatqris.secretToken,
    amount: String(amount),
    description: description || "Pembayaran",
    qris_method: qrisMethod || "qris_two",
    fee_by: feeBy || "buyer"
  });
  const res = await client.post("", body);
  return res.data;
}

async function checkStatus(transactionId) {
  const body = new URLSearchParams({
    action: "api_check_status",
    account_id: config.buatqris.accountId,
    secret_token: config.buatqris.secretToken,
    transaction_id: transactionId
  });
  const res = await client.post("", body);
  return res.data;
}


module.exports = {
  createQris,
  checkStatus
};
