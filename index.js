// =========================
// DVYER BOT - INDEX (STABLE)
// Baileys recomendado: 6.7.21
// =========================

import * as baileys from "@whiskeysockets/baileys";
import pino from "pino";
import chalk from "chalk";
import readline from "readline";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// ================= BAILEYS SAFE IMPORT =================

const makeWASocket =
  (typeof baileys.makeWASocket === "function" && baileys.makeWASocket) ||
  (typeof baileys.default === "function" && baileys.default) ||
  (baileys.default &&
    typeof baileys.default.makeWASocket === "function" &&
    baileys.default.makeWASocket);

if (typeof makeWASocket !== "function") {
  throw new Error("makeWASocket no compatible con esta version/hosting");
}

const {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = baileys;

// ================= CONFIG =================

const CARPETA_AUTH = "dvyer-session";
const logger = pino({ level: "silent" });

const settings = JSON.parse(
  fs.readFileSync("./settings/settings.json", "utf-8")
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= INFO CHANNEL =================

global.channelInfo = settings?.newsletter?.enabled
  ? {
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: settings.newsletter.jid,
          newsletterName: settings.newsletter.name,
          serverMessageId: -1,
        },
      },
    }
  : {};

// ================= TMP / STORE =================

const TMP_DIR = path.join(process.cwd(), "tmp");
const STORE_FILE = path.join(TMP_DIR, "baileys-store.json");

try {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
} catch {}

process.env.TMPDIR = TMP_DIR;
process.env.TMP = TMP_DIR;
process.env.TEMP = TMP_DIR;

const store =
  typeof makeInMemoryStore === "function"
    ? makeInMemoryStore({ logger })
    : null;

try {
  if (store?.readFromFile && fs.existsSync(STORE_FILE)) {
    store.readFromFile(STORE_FILE);
  }
} catch {}

if (store?.writeToFile) {
  setInterval(() => {
    try {
      store.writeToFile(STORE_FILE);
    } catch {}
  }, 10000).unref();
}

// ================= VARIABLES =================

let sockGlobal = null;
let conectando = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const preguntar = (q) => new Promise((r) => rl.question(q, r));

const comandos = new Map();
const groupCache = new Map();

let totalMensajes = 0;
let totalComandos = 0;

const mensajesPorTipo = {
  Grupo: 0,
  Privado: 0,
  Desconocido: 0,
};

// ================= CONSOLA =================

global.consoleBuffer = [];
global.MAX_CONSOLE_LINES = 120;

function pushConsole(level, args) {
  const line =
    `[${new Date().toLocaleString()}] [${level}] ` +
    args
      .map((a) => {
        try {
          if (a instanceof Error) return a.stack;
          if (typeof a === "string") return a;
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");

  global.consoleBuffer.push(line);

  if (global.consoleBuffer.length > global.MAX_CONSOLE_LINES) {
    global.consoleBuffer.shift();
  }
}

function shouldIgnoreErrorText(value) {
  const txt = String(value || "");
  return (
    txt.includes("Bad MAC") ||
    txt.includes("SessionCipher") ||
    txt.includes("Failed to decrypt message with any known session") ||
    txt.includes("No session record") ||
    txt.includes("Closing open session in favor of incoming prekey bundle")
  );
}

const log = console.log;
const warn = console.warn;
const error = console.error;

console.log = (...a) => {
  pushConsole("LOG", a);
  log(chalk.cyan("[LOG]"), ...a);
};

console.warn = (...a) => {
  pushConsole("WARN", a);
  warn(chalk.yellow("[WARN]"), ...a);
};

console.error = (...a) => {
  const txt = String(a[0] || "");
  if (shouldIgnoreErrorText(txt)) return;

  pushConsole("ERROR", a);
  error(chalk.red("[ERROR]"), ...a);
};

// ================= ANTI CRASH =================

process.on("unhandledRejection", (reason) => {
  if (shouldIgnoreErrorText(reason)) return;
  console.error(reason);
});

process.on("uncaughtException", (err) => {
  if (shouldIgnoreErrorText(err?.message || err)) return;
  console.error(err);
});

// ================= UTIL =================

function tipoChat(jid = "") {
  if (jid.endsWith("@g.us")) return "Grupo";
  if (jid.endsWith("@s.whatsapp.net")) return "Privado";
  return "Desconocido";
}

function shouldIgnoreJid(jid = "") {
  return (
    !jid ||
    jid === "status@broadcast" ||
    jid.endsWith("@newsletter") ||
    jid.endsWith("@broadcast")
  );
}

function normalizeMessageContent(message = {}) {
  let content = message;

  while (true) {
    if (content?.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
      continue;
    }
    if (content?.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
      continue;
    }
    if (content?.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
      continue;
    }
    if (content?.viewOnceMessageV2Extension?.message) {
      content = content.viewOnceMessageV2Extension.message;
      continue;
    }
    if (content?.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
      continue;
    }
    if (content?.editedMessage?.message) {
      content = content.editedMessage.message;
      continue;
    }
    break;
  }

  return content || {};
}

function obtenerTexto(message) {
  const msg = normalizeMessageContent(message);

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.templateButtonReplyMessage?.selectedDisplayText ||
    msg.templateButtonReplyMessage?.selectedId ||
    msg.listResponseMessage?.title ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.interactiveResponseMessage?.body?.text ||
    ""
  );
}

function getContextInfo(message = {}) {
  const normalized = normalizeMessageContent(message);
  const type = Object.keys(normalized)[0];

  if (!type) return {};
  const node = normalized[type];

  if (node && typeof node === "object" && node.contextInfo) {
    return node.contextInfo;
  }

  return {};
}

function serializeMessage(raw, depth = 0) {
  if (!raw) return null;

  const from = raw.key?.remoteJid || "";
  const sender = raw.key?.participant || raw.key?.remoteJid || "";
  const isGroup = from.endsWith("@g.us");
  const normalizedMessage = normalizeMessageContent(raw.message || {});
  const text = String(obtenerTexto(normalizedMessage) || "").trim();
  const contextInfo = getContextInfo(raw.message || {});

  let quoted = null;

  if (depth < 1 && contextInfo?.quotedMessage) {
    quoted = serializeMessage(
      {
        key: {
          remoteJid: from,
          fromMe: false,
          id: contextInfo.stanzaId || "",
          participant: contextInfo.participant || sender,
        },
        message: contextInfo.quotedMessage,
      },
      depth + 1
    );
  }

  return {
    ...raw,
    m: raw,
    chat: from,
    from,
    sender,
    isGroup,
    text,
    body: text,
    pushName: raw.pushName || "",
    message: normalizedMessage,
    quoted,
  };
}

async function getBaileysVersionSafe() {
  try {
    if (typeof fetchLatestBaileysVersion !== "function") {
      return undefined;
    }
    const result = await fetchLatestBaileysVersion();
    return result?.version;
  } catch {
    return undefined;
  }
}

function browserConfig() {
  try {
    if (Browsers?.ubuntu) return Browsers.ubuntu("DVYER BOT");
  } catch {}
  return undefined;
}

async function cachedGroupMetadata(jid) {
  return groupCache.get(jid) || undefined;
}

// ================= BANNER =================

function banner() {
  console.clear();

  console.log(
    chalk.magentaBright(`
╔══════════════════════════════╗
║        DVYER BOT v2          ║
╚══════════════════════════════╝
`)
  );

  console.log(
    chalk.green("Owner :"),
    settings.ownerName,
    chalk.blue("\nPrefijo :"),
    settings.prefix,
    chalk.yellow("\nComandos cargados :"),
    comandos.size
  );

  console.log(chalk.gray("──────────────────────────────"));
}

// ================= CARGAR COMANDOS =================

async function cargarComandos() {
  const base = path.join(__dirname, "commands");

  async function leer(dir) {
    const archivos = fs.readdirSync(dir, { withFileTypes: true });

    for (const a of archivos) {
      const ruta = path.join(dir, a.name);

      if (a.isDirectory()) {
        await leer(ruta);
        continue;
      }

      if (!a.name.endsWith(".js")) continue;

      try {
        const fileUrl = pathToFileURL(ruta).href;
        const mod = await import(fileUrl);
        const cmd = mod.default;

        if (!cmd || typeof cmd.run !== "function") continue;

        const nombres = [];

        if (cmd.name) nombres.push(cmd.name);

        if (cmd.command) {
          if (Array.isArray(cmd.command)) nombres.push(...cmd.command);
          else nombres.push(cmd.command);
        }

        for (const n of nombres) {
          comandos.set(String(n).toLowerCase(), cmd);
        }

        console.log("✓ Comando cargado:", nombres.join(", "));
      } catch (e) {
        console.error("Error cargando comando:", ruta, e);
      }
    }
  }

  await leer(base);
}

// ================= BOT =================

async function iniciarBot() {
  if (conectando) return;
  conectando = true;

  try {
    banner();

    const { state, saveCreds } = await useMultiFileAuthState(CARPETA_AUTH);
    const version = await getBaileysVersionSafe();

    const config = {
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      browser: browserConfig(),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      getMessage: async (key) => {
        try {
          if (!store?.loadMessage) return undefined;
          const msg = await store.loadMessage(key.remoteJid, key.id);
          return msg?.message || undefined;
        } catch {
          return undefined;
        }
      },
      cachedGroupMetadata,
    };

    if (version) {
      config.version = version;
    }

    sockGlobal = makeWASocket(config);
    const sock = sockGlobal;

    if (store?.bind) {
      store.bind(sock.ev);
    }

    if (!state.creds.registered) {
      console.log("📲 Bot no vinculado");

      let numero = await preguntar("Numero: ");
      numero = String(numero || "").replace(/\D/g, "");

      if (!numero) {
        throw new Error("Numero invalido para pairing code");
      }

      const codigo = await sock.requestPairingCode(numero);

      console.log("\nCODIGO DE VINCULACION:\n");
      console.log(chalk.greenBright(codigo));
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("groups.update", async (updates) => {
      for (const update of updates || []) {
        try {
          if (!update?.id) continue;
          const meta = await sock.groupMetadata(update.id);
          groupCache.set(update.id, meta);
        } catch {}
      }
    });

    sock.ev.on("group-participants.update", async (update) => {
      try {
        if (!update?.id) return;
        const meta = await sock.groupMetadata(update.id);
        groupCache.set(update.id, meta);
      } catch {}
    });

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log(chalk.green("✅ DVYER BOT CONECTADO"));
      }

      if (connection === "close") {
        const code =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.data?.statusCode ||
          0;

        console.log("Conexion cerrada:", code);

        const loggedOut =
          code === DisconnectReason.loggedOut || code === 401;

        if (loggedOut) {
          try {
            fs.rmSync(CARPETA_AUTH, { recursive: true, force: true });
          } catch {}
        }

        sockGlobal = null;

        setTimeout(() => {
          iniciarBot();
        }, loggedOut ? 2500 : 2000);
      }
    });

    // ================= MENSAJES =================

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages || []) {
        try {
          if (!msg?.message) continue;
          if (msg.key?.fromMe) continue;

          const from = msg.key?.remoteJid || "";
          if (shouldIgnoreJid(from)) continue;

          const m = serializeMessage(msg);
          const texto = m?.text || "";

          if (!texto) continue;

          totalMensajes++;

          const tipo = tipoChat(from);
          mensajesPorTipo[tipo] = (mensajesPorTipo[tipo] || 0) + 1;

          const prefijo = settings.prefix || ".";
          if (!texto.startsWith(prefijo)) continue;

          const body = texto.slice(prefijo.length).trim();
          if (!body) continue;

          const parts = body.split(/\s+/);
          const comando = String(parts.shift() || "").toLowerCase();
          const args = parts;

          const cmd = comandos.get(comando);
          if (!cmd) continue;

          totalComandos++;

          await cmd.run({
            sock,
            m,
            msg,
            from,
            chat: from,
            sender: m.sender,
            isGroup: m.isGroup,
            text: m.text,
            body: m.body,
            quoted: m.quoted,
            args,
            command: comando,
            settings,
            comandos,
            stats: {
              totalMensajes,
              totalComandos,
              mensajesPorTipo,
            },
          });
        } catch (e) {
          console.error("Error comando:", e);
        }
      }
    });
  } catch (e) {
    console.error(e);
  } finally {
    conectando = false;
  }
}

async function start() {
  await cargarComandos();
  await iniciarBot();
}

start();

process.on("SIGINT", async () => {
  try {
    rl.close();
  } catch {}

  try {
    if (sockGlobal?.end) {
      sockGlobal.end(undefined);
    }
  } catch {}

  console.log("Bot apagado");
  process.exit(0);
});
