import pino from "pino";
import { downloadMediaMessage } from "@dvyer/baileys";
import { buildDvyerUrl } from "../../lib/api-manager.js";

const logger = pino({ level: "silent" });
const API_IMGBB_UPLOAD_URL = buildDvyerUrl("/imgbb/upload");
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMGBB_API_KEY_OVERRIDE = cleanText(
  process.env.TOURL_IMGBB_API_KEY ||
    process.env.IMGBB_API_KEY ||
    process.env.DVYER_IMGBB_API_KEY ||
    ""
);

function getQuoted(msg) {
  return msg?.key ? { quoted: msg } : undefined;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeFileName(name = "imagen") {
  const cleaned = String(name || "imagen")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return cleaned || "imagen";
}

function unwrapMessage(message = {}) {
  let current = message;

  while (current?.ephemeralMessage?.message) {
    current = current.ephemeralMessage.message;
  }
  while (current?.viewOnceMessage?.message) {
    current = current.viewOnceMessage.message;
  }
  while (current?.viewOnceMessageV2?.message) {
    current = current.viewOnceMessageV2.message;
  }
  while (current?.viewOnceMessageV2Extension?.message) {
    current = current.viewOnceMessageV2Extension.message;
  }

  return current || {};
}

function buildQuotedWAMessage(msg) {
  const ctx = msg?.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return null;

  return {
    key: {
      remoteJid: msg?.key?.remoteJid,
      fromMe: false,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
    message: quoted,
  };
}

function extractTextFromMessage(message) {
  return (
    message?.text ||
    message?.caption ||
    message?.body ||
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    ""
  );
}

function resolveDirectUrl(args = [], msg) {
  const argsText = Array.isArray(args) ? args.join(" ").trim() : "";
  const quotedText = extractTextFromMessage(msg?.quoted?.message || {});
  const source = argsText || quotedText || "";
  const match = String(source).match(/https?:\/\/[^\s]+/i);
  return match ? match[0].trim() : "";
}

function extensionFromMime(mimeType = "image/jpeg") {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}

function normalizeImageName(name = "imagen", mimeType = "image/jpeg") {
  const ext = extensionFromMime(mimeType);
  const parsed = String(name || "").trim().replace(/\.[^.]+$/i, "");
  return `${safeFileName(parsed || "imagen")}.${ext}`;
}

async function readResponseError(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw);
    return cleanText(parsed?.detail || parsed?.message || raw);
  } catch {
    return cleanText(raw);
  }
}

async function downloadImageFromUrl(imageUrl) {
  const response = await fetch(imageUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`No pude descargar esa URL (${response.status}).`);
  }

  const mimeType = String(response.headers.get("content-type") || "image/jpeg")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!mimeType.startsWith("image/")) {
    throw new Error("La URL enviada no es una imagen directa.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("La imagen esta vacia.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("La imagen supera 20 MB.");

  return {
    buffer,
    mimeType,
    fileName: normalizeImageName("imagen-url", mimeType),
  };
}

async function resolveImageFromMessage(msg, sock) {
  const quotedMsg = buildQuotedWAMessage(msg);
  const targetMsg = quotedMsg || msg;
  const rawMessage = unwrapMessage(targetMsg?.message || {});

  const media =
    rawMessage?.imageMessage ||
    rawMessage?.stickerMessage ||
    rawMessage?.documentMessage ||
    null;

  if (!media) return null;

  const mimeType = String(media?.mimetype || (rawMessage?.stickerMessage ? "image/webp" : "image/jpeg"))
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!mimeType.startsWith("image/")) {
    throw new Error("El archivo citado no es una imagen.");
  }

  const buffer = await downloadMediaMessage(
    targetMsg,
    "buffer",
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );

  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("No pude leer la imagen citada.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera 20 MB.");
  }

  const originalName =
    String(media?.fileName || media?.caption || media?.fileSha256?.toString?.("hex") || "imagen").trim() ||
    "imagen";

  return {
    buffer,
    mimeType,
    fileName: normalizeImageName(originalName, mimeType),
  };
}

async function uploadViaDvyerApi(image) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([image.buffer], { type: image.mimeType || "image/jpeg" }),
    String(image.fileName || "imagen.jpg")
  );
  if (IMGBB_API_KEY_OVERRIDE) {
    form.append("key", IMGBB_API_KEY_OVERRIDE);
  }

  const response = await fetch(API_IMGBB_UPLOAD_URL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await readResponseError(response);
    const normalized = cleanText(detail).toLowerCase();
    if (normalized.includes("imgbb_api_key") || normalized.includes("api key")) {
      throw new Error(
        "Falta configurar IMGBB_API_KEY para .tourl permanente. Agrega esa variable en Render (API) o TOURL_IMGBB_API_KEY en el bot."
      );
    }
    throw new Error(detail);
  }

  const data = await response.json();
  const directUrl = cleanText(data?.direct_url || data?.url || "");
  if (!/^https?:\/\//i.test(directUrl)) {
    throw new Error("La API no devolvio una URL valida.");
  }

  return {
    provider: "imgbb_api",
    directUrl,
    viewerUrl: cleanText(data?.viewer_url || ""),
    deleteUrl: cleanText(data?.delete_url || ""),
  };
}

export default {
  name: "tourl",
  command: ["tourl", "imgurl", "urlimg", "urlimagen"],
  category: "media",
  description: "Sube una imagen y devuelve URL directa",

  run: async ({ sock, msg, from, args = [] }) => {
    const quoted = getQuoted(msg);

    try {
      const directUrl = resolveDirectUrl(args, msg);
      const image = directUrl
        ? await downloadImageFromUrl(directUrl)
        : await resolveImageFromMessage(msg, sock);

      if (!image) {
        return sock.sendMessage(
          from,
          {
            text:
              "Uso: .tourl (responde a una imagen) o .tourl <url-imagen>\n" +
              "Devuelve una URL directa lista para copiar.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      await sock.sendMessage(
        from,
        {
          text: "Subiendo imagen, espera un momento...",
          ...global.channelInfo,
        },
        quoted
      );

      const uploaded = await uploadViaDvyerApi(image);
      const lines = [
        "╭─〔 *DVYER • TOURL* 〕",
        `┃ ✅ URL directa: ${uploaded.directUrl}`,
        "┃ ⚡ Hosting: ImgBB (sin expiracion)",
        uploaded.viewerUrl ? `┃ 👁 Vista: ${uploaded.viewerUrl}` : "",
        uploaded.deleteUrl ? `┃ 🗑 Delete: ${uploaded.deleteUrl}` : "",
        "╰─⟡ Listo.",
      ].filter(Boolean);

      return sock.sendMessage(
        from,
        {
          text: lines.join("\n"),
          ...global.channelInfo,
        },
        quoted
      );
    } catch (error) {
      return sock.sendMessage(
        from,
        {
          text: `❌ ${cleanText(error?.message || "No se pudo generar la URL de imagen.")}`,
          ...global.channelInfo,
        },
        quoted
      );
    }
  },
};
