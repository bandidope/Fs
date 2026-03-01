import fs from "fs";
import path from "path";

const DB_DIR = path.join(process.cwd(), "database");
const WORDS_FILE = path.join(DB_DIR, "adulto18_words.json");
const GROUPS_FILE = path.join(DB_DIR, "anti18_groups.json");
const WARNS_FILE = path.join(DB_DIR, "anti18_warns.json");

const MAX_WARNS = 3;

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ---------- JSON helpers ----------
function safeJsonParse(raw, fallback) {
  try {
    const a = JSON.parse(raw);
    if (typeof a === "string") return JSON.parse(a);
    return a;
  } catch {
    return fallback;
  }
}
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf-8");
    return safeJsonParse(raw, fallback);
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// crea archivos si no existen
if (!fs.existsSync(WORDS_FILE)) writeJson(WORDS_FILE, []);
if (!fs.existsSync(GROUPS_FILE)) writeJson(GROUPS_FILE, []);
if (!fs.existsSync(WARNS_FILE)) writeJson(WARNS_FILE, {});

// ---------- cache en memoria ----------
let gruposActivos = new Set(Array.isArray(readJson(GROUPS_FILE, [])) ? readJson(GROUPS_FILE, []) : []);
let warnsCache = (() => {
  const obj = readJson(WARNS_FILE, {});
  return obj && typeof obj === "object" ? obj : {};
})();

function saveGroups() {
  writeJson(GROUPS_FILE, [...gruposActivos]);
}
function saveWarns() {
  writeJson(WARNS_FILE, warnsCache);
}

// ---------- texto ----------
function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin tildes
    .replace(/[^a-z0-9\s]/g, " ")   // sin signos
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    null
  );
}

function loadWords() {
  const arr = readJson(WORDS_FILE, []);
  return Array.isArray(arr) ? arr : [];
}

function findBadWord(normalizedText, words) {
  const tokens = new Set(normalizedText.split(" ").filter(Boolean));

  // token exacto
  for (const w of words) {
    const ww = normalizeText(w);
    if (!ww) continue;
    if (tokens.has(ww)) return w;
  }

  // frase compuesta
  for (const w of words) {
    const ww = normalizeText(w);
    if (!ww) continue;
    if (ww.includes(" ") && normalizedText.includes(ww)) return w;
  }
  return null;
}

function onOff(v) {
  return v ? "ON ✅" : "OFF ❌";
}

export default {
  command: ["anti18", "antiadultos", "antiporno"],
  category: "grupo",
  description: "Anti +18: 3 advertencias y expulsión (solo admins)",
  groupOnly: true,
  adminOnly: true,

  run: async ({ sock, msg, from, args }) => {
    const sub = (args[0] || "").toLowerCase();

    if (!sub) {
      const st = gruposActivos.has(from);
      return sock.sendMessage(
        from,
        {
          text:
            `🔞 *ANTI +18*\n` +
            `• Estado: *${onOff(st)}*\n\n` +
            `⚙️ Uso:\n` +
            `• .anti18 on\n` +
            `• .anti18 off\n\n` +
            `📌 3 advertencias = expulsión`,
          ...global.channelInfo
        },
        { quoted: msg }
      );
    }

    if (sub === "on") {
      gruposActivos.add(from);
      saveGroups();
      return sock.sendMessage(from, { text: "✅ Anti +18 activado.", ...global.channelInfo }, { quoted: msg });
    }

    if (sub === "off") {
      gruposActivos.delete(from);
      saveGroups();
      return sock.sendMessage(from, { text: "✅ Anti +18 desactivado.", ...global.channelInfo }, { quoted: msg });
    }

    return sock.sendMessage(from, { text: "❌ Usa: .anti18 on / .anti18 off", ...global.channelInfo }, { quoted: msg });
  },

  onMessage: async ({ sock, msg, from, esGrupo, esAdmin, esOwner }) => {
    if (!esGrupo) return;
    if (!gruposActivos.has(from)) return;

    // no castigar admins/owner
    if (esAdmin || esOwner) return;

    const sender = msg.key?.participant || msg.participant;
    if (!sender) return;

    const textRaw = extractText(msg.message);
    if (!textRaw) return;

    const normalized = normalizeText(textRaw);
    if (!normalized) return;

    const words = loadWords();
    if (!words.length) return;

    const bad = findBadWord(normalized, words);
    if (!bad) return;

    // borrar mensaje si se puede
    try {
      await sock.sendMessage(from, { delete: msg.key, ...global.channelInfo });
    } catch {}

    // WARN persistente
    if (!warnsCache[from]) warnsCache[from] = {};
    const prev = Number(warnsCache[from][sender] || 0);
    const current = prev + 1;

    warnsCache[from][sender] = current;
    saveWarns();

    if (current >= MAX_WARNS) {
      let kicked = false;
      try {
        await sock.groupParticipantsUpdate(from, [sender], "remove");
        kicked = true;
      } catch {
        kicked = false;
      }

      if (kicked) {
        // solo resetea si expulsó
        warnsCache[from][sender] = 0;
        saveWarns();

        return sock.sendMessage(from, {
          text:
            `🚫 *ANTI +18*\n` +
            `@${sender.split("@")[0]} llegó a *${current}/${MAX_WARNS}* advertencias.\n` +
            `✅ Fue expulsado del grupo.`,
          mentions: [sender],
          ...global.channelInfo
        });
      }

      // si no pudo expulsar, NO resetea (queda en 3/3)
      return sock.sendMessage(from, {
        text:
          `🚫 *ANTI +18*\n` +
          `@${sender.split("@")[0]} llegó a *${current}/${MAX_WARNS}* advertencias.\n` +
          `⚠️ No pude expulsar (¿bot sin admin?).`,
        mentions: [sender],
        ...global.channelInfo
      });
    }

    return sock.sendMessage(from, {
      text:
        `⚠️ *ANTI +18*\n` +
        `@${sender.split("@")[0]} contenido no permitido.\n` +
        `📌 Advertencia: *${current}/${MAX_WARNS}*`,
      mentions: [sender],
      ...global.channelInfo
    });
  }
};
