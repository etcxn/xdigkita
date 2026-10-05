const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "../data");

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Initialise core directory structure
ensureDirectoryExists(DATA_DIR);
ensureDirectoryExists(path.join(DATA_DIR, "transactions"));
ensureDirectoryExists(path.join(DATA_DIR, "withdrawals"));
ensureDirectoryExists(path.join(DATA_DIR, "activity"));

// Per-file write queue to prevent concurrent file corruption
const writeQueues = new Map();

function resolveDataPath(relPath) {
  // Normalize and prevent path traversal
  const safeRel = String(relPath).replace(/^[/\\]+/, "").replace(/\.\./g, "");
  return path.join(DATA_DIR, safeRel);
}

async function safeWriteFile(filePath, data) {
  const previous = writeQueues.get(filePath) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const chain = previous.then(() => current);
  writeQueues.set(filePath, chain);

  try {
    await previous;
    const dir = path.dirname(filePath);
    ensureDirectoryExists(dir);
    const tempFile = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const serialized = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tempFile, serialized, "utf8");
    await fs.promises.rename(tempFile, filePath);
  } finally {
    release();
    if (writeQueues.get(filePath) === chain) {
      writeQueues.delete(filePath);
    }
  }
}

async function safeReadFile(filePath, defaultContent = null) {
  try {
    if (!fs.existsSync(filePath)) {
      if (defaultContent !== null) {
        await safeWriteFile(filePath, defaultContent);
        return defaultContent;
      }
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.warn(`[jsondb] Error reading ${filePath}: ${err.message}, using fallback.`);
    return defaultContent;
  }
}

function cleanTransaction(transaction) {
  if (!transaction || typeof transaction !== "object") return transaction;
  const removedKey = ["payment", "url"].join("");
  return Object.fromEntries(Object.entries(transaction).filter(([key]) => key.toLowerCase() !== removedKey));
}

async function ensureFile(relPath, defaultContent = []) {
  const filePath = resolveDataPath(relPath);
  return safeReadFile(filePath, defaultContent);
}

async function read(relPath) {
  const filePath = resolveDataPath(relPath);
  return safeReadFile(filePath, null);
}

async function write(relPath, data) {
  const filePath = resolveDataPath(relPath);
  return safeWriteFile(filePath, data);
}

async function listUsers() {
  const users = await safeReadFile(resolveDataPath("users.json"), []);
  return Array.isArray(users) ? users : [];
}

async function saveUsers(users) {
  await safeWriteFile(resolveDataPath("users.json"), users);
}

async function findUserById(id) {
  const users = await listUsers();
  return users.find(u => u.id === id) || null;
}

async function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const users = await listUsers();
  return users.find(u => String(u.email || "").trim().toLowerCase() === normalized) || null;
}

async function findUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const users = await listUsers();
  return users.find(u => u.apiKey === apiKey) || null;
}

async function saveUser(user) {
  const users = await listUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  await saveUsers(users);
}

async function getTransactions(userId) {
  if (!userId) return [];
  const list = await safeReadFile(resolveDataPath(`transactions/${userId}.json`), []);
  return Array.isArray(list) ? list.map(cleanTransaction) : [];
}

async function saveTransactions(userId, list) {
  if (!userId) return;
  const cleaned = Array.isArray(list) ? list.map(cleanTransaction) : [];
  await safeWriteFile(resolveDataPath(`transactions/${userId}.json`), cleaned);
}

async function getWithdrawals(userId) {
  if (!userId) return [];
  const list = await safeReadFile(resolveDataPath(`withdrawals/${userId}.json`), []);
  return Array.isArray(list) ? list : [];
}

async function saveWithdrawals(userId, list) {
  if (!userId) return;
  await safeWriteFile(resolveDataPath(`withdrawals/${userId}.json`), list);
}

async function getActivity(userId) {
  if (!userId) return [];
  const list = await safeReadFile(resolveDataPath(`activity/${userId}.json`), []);
  return Array.isArray(list) ? list : [];
}

async function saveActivity(userId, list) {
  if (!userId) return;
  await safeWriteFile(resolveDataPath(`activity/${userId}.json`), list);
}

async function getAllWithdrawals() {
  const users = await listUsers();
  const results = await Promise.all(
    users.map(async user => {
      const withdrawals = await getWithdrawals(user.id);
      return withdrawals.map(withdrawal => ({
        ...withdrawal,
        userName: withdrawal.userName || user.name || "-",
        userEmail: withdrawal.userEmail || user.email || "-",
        userSaldo: Number(user.saldo || 0)
      }));
    })
  );
  return results.flat().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function findWithdrawalById(withdrawalId) {
  const users = await listUsers();
  for (const user of users) {
    const list = await getWithdrawals(user.id);
    const index = list.findIndex(item => item.id === withdrawalId);
    if (index >= 0) {
      return { user, list, withdrawal: list[index], index };
    }
  }
  return null;
}

async function getGlobalStats() {
  const users = await listUsers();
  const txLists = await Promise.all(users.map(u => getTransactions(u.id)));
  const totalTx = txLists.reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const withdrawals = await getAllWithdrawals();
  return {
    realUsers: users.length,
    realTransactions: totalTx,
    realWithdrawals: withdrawals.length
  };
}

module.exports = {
  DATA_DIR,
  ensureFile,
  read,
  write,
  listUsers,
  saveUsers,
  findUserById,
  findUserByEmail,
  findUserByApiKey,
  saveUser,
  getTransactions,
  saveTransactions,
  getWithdrawals,
  saveWithdrawals,
  getAllWithdrawals,
  findWithdrawalById,
  getActivity,
  saveActivity,
  getGlobalStats
};
