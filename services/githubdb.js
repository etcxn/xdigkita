const { Octokit } = require("@octokit/rest");
const config = require("../config");

let octokit = null;
if (config.github && config.github.token) {
  try {
    octokit = new Octokit({ auth: config.github.token });
  } catch (err) {
    console.warn("[githubdb] Could not initialize Octokit:", err.message);
  }
}

const memoryStore = new Map();

function cleanTransaction(transaction) {
  if (!transaction || typeof transaction !== "object") return transaction;
  const removedKey = ["payment", "url"].join("");
  return Object.fromEntries(Object.entries(transaction).filter(([key]) => key.toLowerCase() !== removedKey));
}

async function ensureFile(path, defaultContent) {
  if (!memoryStore.has(path)) {
    memoryStore.set(path, defaultContent);
  }
  if (!octokit || !config.github.owner || !config.github.repo) return;
  try {
    await octokit.repos.getContent({
      owner: config.github.owner,
      repo: config.github.repo,
      path,
      ref: config.github.branch
    });
  } catch (e) {
    if (e.status === 404) {
      try {
        await octokit.repos.createOrUpdateFileContents({
          owner: config.github.owner,
          repo: config.github.repo,
          path,
          message: `init ${path}`,
          content: Buffer.from(JSON.stringify(defaultContent, null, 2)).toString("base64"),
          branch: config.github.branch
        });
      } catch (err) {
        console.warn(`[githubdb] Failed to init file on GitHub ${path}:`, err.message);
      }
    }
  }
}

async function read(path) {
  if (octokit && config.github.owner && config.github.repo) {
    try {
      const res = await octokit.repos.getContent({
        owner: config.github.owner,
        repo: config.github.repo,
        path,
        ref: config.github.branch
      });
      const content = Buffer.from(res.data.content, "base64").toString("utf8");
      const parsed = JSON.parse(content);
      memoryStore.set(path, parsed);
      return parsed;
    } catch (e) {
      if (e.status === 404) {
        return memoryStore.get(path) ?? null;
      }
      console.warn(`[githubdb] Remote read failed for ${path}, using in-memory store:`, e.message);
    }
  }
  return memoryStore.get(path) ?? null;
}

async function write(path, data) {
  memoryStore.set(path, data);
  if (!octokit || !config.github.owner || !config.github.repo) return;

  let sha;
  try {
    const res = await octokit.repos.getContent({
      owner: config.github.owner,
      repo: config.github.repo,
      path,
      ref: config.github.branch
    });
    sha = res.data.sha;
  } catch (e) {}

  try {
    await octokit.repos.createOrUpdateFileContents({
      owner: config.github.owner,
      repo: config.github.repo,
      path,
      message: `update ${path}`,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
      sha,
      branch: config.github.branch
    });
  } catch (err) {
    console.warn(`[githubdb] Remote write failed for ${path}, kept in memory:`, err.message);
  }
}

async function listUsers() {
  const data = await read("users.json");
  return data || [];
}

async function saveUsers(users) {
  await write("users.json", users);
}

async function findUserById(id) {
  const users = await listUsers();
  return users.find(u => u.id === id);
}

async function findUserByEmail(email) {
  const users = await listUsers();
  return users.find(u => u.email === email);
}

async function findUserByApiKey(apiKey) {
  const users = await listUsers();
  return users.find(u => u.apiKey === apiKey);
}

async function saveUser(user) {
  const users = await listUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  await saveUsers(users);
}

async function getTransactions(userId) {
  const data = await read(`transactions/${userId}.json`);
  return Array.isArray(data) ? data.map(cleanTransaction) : [];
}

async function saveTransactions(userId, list) {
  const cleaned = Array.isArray(list) ? list.map(cleanTransaction) : [];
  await write(`transactions/${userId}.json`, cleaned);
}

async function getWithdrawals(userId) {
  const data = await read(`withdrawals/${userId}.json`);
  return data || [];
}

async function saveWithdrawals(userId, list) {
  await write(`withdrawals/${userId}.json`, list);
}

async function getActivity(userId) {
  const data = await read(`activity/${userId}.json`);
  return data || [];
}

async function saveActivity(userId, list) {
  await write(`activity/${userId}.json`, list);
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
