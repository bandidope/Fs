import fs from "fs";
import path from "path";
import { writeJsonAtomic } from "../../lib/json-store.js";
import { recordWeeklyCoins, recordWeeklyGame } from "../../lib/weekly.js";

const DB_DIR = path.join(process.cwd(), "database");
const FILE = path.join(DB_DIR, "economy.json");
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_REWARD = 250;
const DEFAULT_DAILY_DOWNLOAD_REQUESTS = 50;
const DEFAULT_REQUEST_PRICE = 25;

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    return fallback;
  }
}

function readStore() {
  try {
    if (!fs.existsSync(FILE)) {
      return {
        trackedSince: new Date().toISOString(),
        users: {},
        aliases: {},
      };
    }

    const parsed = safeJsonParse(fs.readFileSync(FILE, "utf-8"), {});
    return {
      trackedSince:
        String(parsed?.trackedSince || "").trim() || new Date().toISOString(),
      users:
        parsed?.users && typeof parsed.users === "object" && !Array.isArray(parsed.users)
          ? parsed.users
          : {},
      aliases:
        parsed?.aliases && typeof parsed.aliases === "object" && !Array.isArray(parsed.aliases)
          ? parsed.aliases
          : {},
    };
  } catch {
    return {
      trackedSince: new Date().toISOString(),
      users: {},
      aliases: {},
    };
  }
}

const state = readStore();
let saveTimer = null;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeJsonAtomic(FILE, state);
  }, 800);
  saveTimer.unref?.();
}

function clampInteger(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeJidUser(value = "") {
  const jid = String(value || "").trim();
  if (!jid) return "";
  const [user] = jid.split("@");
  return user.split(":")[0];
}

function extractDigits(value = "") {
  return String(value || "").replace(/[^\d]/g, "");
}

function extractPhoneFromUserId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const lowered = raw.toLowerCase();
  if (/@s\.whatsapp\.net$/.test(lowered) || /@c\.us$/.test(lowered) || /^\+?\d{7,20}$/.test(raw)) {
    const digits = extractDigits(raw);
    return digits.length >= 7 ? digits : "";
  }

  return "";
}

function extractPhoneCandidate(...values) {
  for (const value of values) {
    const digits = extractPhoneFromUserId(value);
    if (digits.length >= 7) {
      return digits;
    }
  }

  return "";
}

function extractLidFromUserId(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return raw.endsWith("@lid") ? normalizeJidUser(raw) : "";
}

function resolveAliasKey(value = "") {
  let current = normalizeJidUser(value);
  const visited = new Set();

  while (current && state.aliases?.[current] && !visited.has(current)) {
    visited.add(current);
    current = normalizeJidUser(state.aliases[current]);
  }

  return current;
}

function pickText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
}

function pickLatestIso(...values) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || "";
}

function pickEarliestIso(...values) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || "";
}

function mergeUserRecords(sourceId, targetId) {
  const sourceKey = normalizeJidUser(sourceId);
  const targetKey = normalizeJidUser(targetId);
  if (!sourceKey || !targetKey || sourceKey === targetKey) return;

  const sourceUser = state.users[sourceKey];
  if (!sourceUser) return;

  if (!state.users[targetKey]) {
    state.users[targetKey] = sourceUser;
    state.users[targetKey].id = targetKey;
    delete state.users[sourceKey];
    return;
  }

  const targetUser = state.users[targetKey];
  targetUser.id = targetKey;
  targetUser.coins = Number(targetUser.coins || 0) + Number(sourceUser.coins || 0);
  targetUser.totalEarned = Number(targetUser.totalEarned || 0) + Number(sourceUser.totalEarned || 0);
  targetUser.totalSpent = Number(targetUser.totalSpent || 0) + Number(sourceUser.totalSpent || 0);
  targetUser.bank = Number(targetUser.bank || 0) + Number(sourceUser.bank || 0);
  targetUser.totalBanked =
    Number(targetUser.totalBanked || 0) + Number(sourceUser.totalBanked || 0);
  targetUser.lastDailyAt = Math.max(
    Number(targetUser.lastDailyAt || 0),
    Number(sourceUser.lastDailyAt || 0)
  );
  targetUser.lastGameRewardAt = Math.max(
    Number(targetUser.lastGameRewardAt || 0),
    Number(sourceUser.lastGameRewardAt || 0)
  );
  targetUser.lastWorkAt = Math.max(
    Number(targetUser.lastWorkAt || 0),
    Number(sourceUser.lastWorkAt || 0)
  );
  targetUser.commandCount =
    Number(targetUser.commandCount || 0) + Number(sourceUser.commandCount || 0);
  targetUser.registeredAt = pickEarliestIso(
    targetUser.registeredAt,
    sourceUser.registeredAt,
    new Date().toISOString()
  );
  targetUser.lastSeenAt = pickLatestIso(targetUser.lastSeenAt, sourceUser.lastSeenAt);
  targetUser.lastKnownName = pickText(targetUser.lastKnownName, sourceUser.lastKnownName);
  targetUser.lastChatId = pickText(targetUser.lastChatId, sourceUser.lastChatId);
  targetUser.lastBotId = pickText(targetUser.lastBotId, sourceUser.lastBotId);
  targetUser.lastCommand = pickText(targetUser.lastCommand, sourceUser.lastCommand);
  targetUser.phone = pickText(targetUser.phone, sourceUser.phone);
  targetUser.jid = pickText(targetUser.jid, sourceUser.jid);
  targetUser.lid = pickText(targetUser.lid, sourceUser.lid);

  const mergedInventory = { ...(targetUser.inventory || {}) };
  for (const [itemId, count] of Object.entries(sourceUser.inventory || {})) {
    mergedInventory[itemId] =
      Number(mergedInventory[itemId] || 0) + Number(count || 0);
  }
  targetUser.inventory = mergedInventory;

  targetUser.history = [...(targetUser.history || []), ...(sourceUser.history || [])]
    .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0))
    .slice(0, 20);

  const targetRequests = targetUser.requests || {};
  const sourceRequests = sourceUser.requests || {};
  const targetDayKey = String(targetRequests.dayKey || "").trim();
  const sourceDayKey = String(sourceRequests.dayKey || "").trim();
  const sharedDayKey =
    targetDayKey && sourceDayKey && targetDayKey === sourceDayKey ? targetDayKey : targetDayKey || sourceDayKey;
  const mergedDailyLimit = Math.max(
    clampInteger(targetRequests.dailyLimitSnapshot, DEFAULT_DAILY_DOWNLOAD_REQUESTS, 0, 5000),
    clampInteger(sourceRequests.dailyLimitSnapshot, DEFAULT_DAILY_DOWNLOAD_REQUESTS, 0, 5000)
  );

  targetUser.requests = {
    dayKey: sharedDayKey,
    dailyUsed:
      sharedDayKey && targetDayKey === sourceDayKey
        ? Math.min(
            mergedDailyLimit,
            clampInteger(targetRequests.dailyUsed, 0, 0, 500000) +
              clampInteger(sourceRequests.dailyUsed, 0, 0, 500000)
          )
        : clampInteger(targetRequests.dailyUsed, 0, 0, 500000),
    dailyLimitSnapshot: mergedDailyLimit,
    extra:
      clampInteger(targetRequests.extra, 0, 0, 500000) +
      clampInteger(sourceRequests.extra, 0, 0, 500000),
    totalPurchased:
      clampInteger(targetRequests.totalPurchased, 0, 0, 5000000) +
      clampInteger(sourceRequests.totalPurchased, 0, 0, 5000000),
    totalConsumed:
      clampInteger(targetRequests.totalConsumed, 0, 0, 5000000) +
      clampInteger(sourceRequests.totalConsumed, 0, 0, 5000000),
    totalRefunded:
      clampInteger(targetRequests.totalRefunded, 0, 0, 5000000) +
      clampInteger(sourceRequests.totalRefunded, 0, 0, 5000000),
  };

  delete state.users[sourceKey];
}

function linkAlias(aliasId, canonicalId) {
  const aliasKey = resolveAliasKey(aliasId) || normalizeJidUser(aliasId);
  const canonicalKey = resolveAliasKey(canonicalId) || normalizeJidUser(canonicalId);
  if (!aliasKey || !canonicalKey || aliasKey === canonicalKey) {
    return canonicalKey || aliasKey;
  }

  mergeUserRecords(aliasKey, canonicalKey);
  state.aliases[normalizeJidUser(aliasId)] = canonicalKey;
  scheduleSave();
  return canonicalKey;
}

function resolveCanonicalUserId(userId = "", meta = {}) {
  const normalizedId = normalizeJidUser(userId);
  if (!normalizedId) return "";

  const explicitPhone = extractPhoneCandidate(
    meta?.phone,
    meta?.phoneJid,
    meta?.senderPhone,
    meta?.participantPn,
    meta?.senderPn,
    meta?.jid,
    userId
  );

  if (explicitPhone) {
    const canonicalPhone = resolveAliasKey(explicitPhone) || explicitPhone;
    if (normalizedId !== canonicalPhone) {
      linkAlias(normalizedId, canonicalPhone);
    }
    return canonicalPhone;
  }

  return resolveAliasKey(normalizedId) || normalizedId;
}

export function formatUserPhone(value = "") {
  const normalizedId = resolveAliasKey(value) || normalizeJidUser(value);
  const storedUser = normalizedId ? state.users[normalizedId] : null;
  const digits = extractPhoneCandidate(storedUser?.phone, value);
  return digits ? `+${digits}` : "";
}

export function formatUserLabel(value = "") {
  const normalizedId = resolveAliasKey(value) || normalizeJidUser(value);
  const storedUser = normalizedId ? state.users[normalizedId] : null;
  const phoneLabel = formatUserPhone(value);
  const nameLabel = String(storedUser?.lastKnownName || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (nameLabel && phoneLabel) {
    return `${nameLabel} (${phoneLabel})`;
  }

  return nameLabel || phoneLabel || "Desconocido";
}

export function formatCoins(value = 0) {
  return `US$ ${Number(value || 0).toLocaleString("es-PE")}`;
}

export function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }
  return String(settings?.prefix || ".").trim() || ".";
}

export function getEconomyConfig(settings = {}) {
  const source =
    settings?.system?.economy &&
    typeof settings.system.economy === "object" &&
    !Array.isArray(settings.system.economy)
      ? settings.system.economy
      : {};

  return {
    downloadBillingEnabled: source.downloadBillingEnabled === true,
    dailyDownloadRequests: clampInteger(
      source.dailyDownloadRequests,
      DEFAULT_DAILY_DOWNLOAD_REQUESTS,
      0,
      5000
    ),
    requestPrice: clampInteger(source.requestPrice, DEFAULT_REQUEST_PRICE, 1, 100000),
  };
}

function ensureUser(userId, meta = {}) {
  const normalizedId = resolveCanonicalUserId(userId, meta);
  if (!normalizedId) return null;

  if (!state.users[normalizedId]) {
    state.users[normalizedId] = {
      id: normalizedId,
      registeredAt: new Date().toISOString(),
      coins: 0,
      totalEarned: 0,
      totalSpent: 0,
      bank: 0,
      totalBanked: 0,
      inventory: {},
      lastDailyAt: 0,
      lastGameRewardAt: 0,
      lastWorkAt: 0,
      history: [],
      requests: {
        dayKey: "",
        dailyUsed: 0,
        dailyLimitSnapshot: DEFAULT_DAILY_DOWNLOAD_REQUESTS,
        extra: 0,
        totalPurchased: 0,
        totalConsumed: 0,
        totalRefunded: 0,
      },
    };
  }

  const user = state.users[normalizedId];
  if (!user.inventory || typeof user.inventory !== "object" || Array.isArray(user.inventory)) {
    user.inventory = {};
  }
  if (!Array.isArray(user.history)) {
    user.history = [];
  }
  if (!Number.isFinite(Number(user.bank))) {
    user.bank = 0;
  }
  if (!Number.isFinite(Number(user.totalBanked))) {
    user.totalBanked = 0;
  }
  if (!Number.isFinite(Number(user.lastWorkAt))) {
    user.lastWorkAt = 0;
  }
  if (!String(user.registeredAt || "").trim()) {
    user.registeredAt = new Date().toISOString();
  }
  if (!String(user.phone || "").trim()) {
    user.phone = extractPhoneCandidate(meta?.phone, meta?.jid, userId);
  }
  if (!String(user.jid || "").trim()) {
    user.jid = pickText(
      meta?.jid,
      user.phone ? `${user.phone}@s.whatsapp.net` : "",
      String(userId || "").includes("@") ? String(userId || "").trim() : ""
    );
  }
  if (!String(user.lid || "").trim()) {
    user.lid = pickText(meta?.lid, extractLidFromUserId(userId));
  }
  if (!String(user.lastKnownName || "").trim()) {
    user.lastKnownName = "";
  }
  if (!String(user.lastChatId || "").trim()) {
    user.lastChatId = "";
  }
  if (!String(user.lastBotId || "").trim()) {
    user.lastBotId = "";
  }
  if (!String(user.lastCommand || "").trim()) {
    user.lastCommand = "";
  }
  if (!String(user.lastSeenAt || "").trim()) {
    user.lastSeenAt = "";
  }
  user.commandCount = clampInteger(user.commandCount, 0, 0, 10_000_000);
  if (!user.requests || typeof user.requests !== "object" || Array.isArray(user.requests)) {
    user.requests = {};
  }

  user.requests.dayKey = String(user.requests.dayKey || "").trim();
  user.requests.dailyUsed = clampInteger(user.requests.dailyUsed, 0, 0, 500000);
  user.requests.dailyLimitSnapshot = clampInteger(
    user.requests.dailyLimitSnapshot,
    DEFAULT_DAILY_DOWNLOAD_REQUESTS,
    0,
    5000
  );
  user.requests.extra = clampInteger(user.requests.extra, 0, 0, 500000);
  user.requests.totalPurchased = clampInteger(user.requests.totalPurchased, 0, 0, 5000000);
  user.requests.totalConsumed = clampInteger(user.requests.totalConsumed, 0, 0, 5000000);
  user.requests.totalRefunded = clampInteger(user.requests.totalRefunded, 0, 0, 5000000);

  return user;
}

function ensureRequestState(user, settings = {}) {
  if (!user) return null;

  const config = getEconomyConfig(settings);
  const todayKey = getTodayKey();

  if (String(user.requests.dayKey || "") !== todayKey) {
    user.requests.dayKey = todayKey;
    user.requests.dailyUsed = 0;
    user.requests.dailyLimitSnapshot = config.dailyDownloadRequests;
  }

  if (!Number.isFinite(Number(user.requests.dailyLimitSnapshot))) {
    user.requests.dailyLimitSnapshot = config.dailyDownloadRequests;
  }

  return config;
}

function buildRequestSnapshot(user, settings = {}) {
  const config = ensureRequestState(user, settings) || getEconomyConfig(settings);
  const dailyLimit = clampInteger(
    user?.requests?.dailyLimitSnapshot,
    config.dailyDownloadRequests,
    0,
    5000
  );
  const dailyUsed = clampInteger(user?.requests?.dailyUsed, 0, 0, 500000);
  const extraRemaining = clampInteger(user?.requests?.extra, 0, 0, 500000);
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

  return {
    enabled: config.downloadBillingEnabled,
    dayKey: String(user?.requests?.dayKey || getTodayKey()),
    dailyLimit,
    dailyUsed,
    dailyRemaining,
    extraRemaining,
    available: dailyRemaining + extraRemaining,
    requestPrice: config.requestPrice,
    totalPurchased: clampInteger(user?.requests?.totalPurchased, 0, 0, 5000000),
    totalConsumed: clampInteger(user?.requests?.totalConsumed, 0, 0, 5000000),
    totalRefunded: clampInteger(user?.requests?.totalRefunded, 0, 0, 5000000),
  };
}

function pushHistory(user, entry) {
  user.history.unshift({
    at: Date.now(),
    ...entry,
  });
  user.history = user.history.slice(0, 20);
}

function applyUserSnapshot(user, userId, meta = {}) {
  if (!user) return;

  const normalizedId = resolveCanonicalUserId(userId, meta) || normalizeJidUser(userId);
  const phoneCandidate = extractPhoneCandidate(
    meta?.phone,
    meta?.phoneJid,
    meta?.senderPhone,
    meta?.participantPn,
    meta?.senderPn,
    meta?.jid,
    userId
  );
  const lidCandidate = pickText(meta?.lid, meta?.senderLid, meta?.participantLid, extractLidFromUserId(userId));

  if (phoneCandidate) {
    user.phone = phoneCandidate;
    user.jid = `${phoneCandidate}@s.whatsapp.net`;
    if (lidCandidate && lidCandidate !== phoneCandidate) {
      linkAlias(lidCandidate, phoneCandidate);
    }
  } else if (String(meta?.jid || "").trim()) {
    user.jid = String(meta.jid).trim();
  } else if (!String(user.jid || "").trim() && normalizedId) {
    user.jid = `${normalizedId}@s.whatsapp.net`;
  }

  if (lidCandidate) {
    user.lid = lidCandidate;
  }

  const nameCandidate = String(
    meta?.name ||
      meta?.pushName ||
      meta?.notifyName ||
      meta?.verifiedName ||
      user.lastKnownName ||
      ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (nameCandidate) {
    user.lastKnownName = nameCandidate;
  }

  if (String(meta?.chatId || "").trim()) {
    user.lastChatId = String(meta.chatId).trim();
  }

  if (String(meta?.botId || "").trim()) {
    user.lastBotId = String(meta.botId).trim();
  }

  if (String(meta?.commandName || "").trim()) {
    user.lastCommand = String(meta.commandName).trim().toLowerCase();
    user.commandCount = clampInteger(Number(user.commandCount || 0) + 1, 0, 0, 10_000_000);
  } else if (!Number.isFinite(Number(user.commandCount))) {
    user.commandCount = 0;
  }

  user.lastSeenAt = new Date().toISOString();
}

export function touchEconomyProfile(userId, settings = {}, meta = {}) {
  const normalizedId = resolveCanonicalUserId(userId, meta);
  if (!normalizedId) return null;

  const existed = Boolean(state.users[normalizedId]);
  const user = ensureUser(userId, meta);
  ensureRequestState(user, settings);
  applyUserSnapshot(user, userId, meta);
  scheduleSave();
  return {
    user,
    isNew: !existed,
    requests: buildRequestSnapshot(user, settings),
  };
}

export function getEconomyProfile(userId, settings = {}) {
  const user = ensureUser(userId);
  if (!user) return null;
  ensureRequestState(user, settings);
  scheduleSave();
  return user;
}

export function getDownloadRequestState(userId, settings = {}) {
  const user = ensureUser(userId);
  if (!user) return null;
  const requests = buildRequestSnapshot(user, settings);
  scheduleSave();
  return requests;
}

export function addCoins(userId, amount, reason = "bonus", meta = {}) {
  const user = ensureUser(userId);
  if (!user) return null;

  const normalizedAmount = Math.max(0, Math.floor(Number(amount || 0)));
  user.coins += normalizedAmount;
  user.totalEarned += normalizedAmount;
  pushHistory(user, {
    type: "earn",
    amount: normalizedAmount,
    reason,
    meta,
  });
  if (normalizedAmount > 0) {
    recordWeeklyCoins({ userId, amount: normalizedAmount });
  }
  scheduleSave();
  return user;
}

export function spendCoins(userId, amount, reason = "buy", meta = {}) {
  const user = ensureUser(userId);
  if (!user) return { ok: false, user: null };

  const normalizedAmount = Math.max(0, Math.floor(Number(amount || 0)));
  if (user.coins < normalizedAmount) {
    return {
      ok: false,
      user,
      missing: normalizedAmount - user.coins,
    };
  }

  user.coins -= normalizedAmount;
  user.totalSpent += normalizedAmount;
  pushHistory(user, {
    type: "spend",
    amount: normalizedAmount,
    reason,
    meta,
  });
  scheduleSave();
  return { ok: true, user };
}

export function setCoinsBalance(userId, amount, reason = "owner_set_balance", meta = {}) {
  const user = ensureUser(userId);
  if (!user) return null;

  const normalizedAmount = Math.max(0, Math.floor(Number(amount || 0)));
  user.coins = normalizedAmount;
  pushHistory(user, {
    type: "admin_set_balance",
    amount: normalizedAmount,
    reason,
    meta,
  });
  scheduleSave();
  return user;
}

export function removeCoins(userId, amount, reason = "owner_remove_balance", meta = {}) {
  return spendCoins(userId, amount, reason, meta);
}

export function addDownloadRequests(
  userId,
  amount,
  reason = "manual_request_bonus",
  meta = {},
  settings = {}
) 
