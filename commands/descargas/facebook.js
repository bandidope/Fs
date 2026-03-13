import path from "path";
import {
  API_BASE,
  apiGet,
  deleteFileSafe,
  downloadApiFile,
  ensureTmpDir,
  getCooldownRemaining,
  normalizeMp4Name,
  resolveUserInput,
  safeFileName,
  sendVideoOrDocument,
} from "./dvyerShared.js";

const API_FACEBOOK_URL = `${API_BASE}/facebook`;
const VIDEO_QUALITY = "auto";
const COOLDOWN_TIME = 15 * 1000;
const MAX_VIDEO_BYTES = 800 * 1024 * 1024;
const VIDEO_AS_DOCUMENT_THRESHOLD = 45 * 1024 * 1024;
const TMP_DIR = ensureTmpDir("facebook");

const cooldowns = new Map();

function extractFacebookUrl(text) {
  const match = String(text || "").match(
    /https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i
  );
  return match ? match[0].trim() : "";
}

async function requestFacebookMeta(videoUrl) {
  const data = await apiGet(
    API_FACEBOOK_URL,
    {
      mode: "link",
      quality: VIDEO_QUALITY,
      url: videoUrl,
    },
    45000
  );

  return {
    title: safeFileName(data?.title || "Facebook Video"),
    description: String(data?.description || "").trim() || null,
    duration: String(data?.duration || "").trim() || null,
    thumbnail: data?.thumbnail || null,
    fileName: normalizeMp4Name(data?.filename || data?.file_name || "facebook-video.mp4"),
  };
}

export default {
  command: ["facebook", "fb", "fbmp4"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const userId = `${from}:facebook`;

    let tempPath = null;

    const until = cooldowns.get(userId);
    if (until && until > Date.now()) {
      return sock.sendMessage(from, {
        text: `Espera ${getCooldownRemaining(until)}s`,
        ...global.channelInfo,
      });
    }

    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    try {
      const rawInput = resolveUserInput(ctx);
      const videoUrl = extractFacebookUrl(rawInput);

      if (!videoUrl) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "Uso: .facebook <link publico de Facebook> o responde a un mensaje con el link",
          ...global.channelInfo,
        });
      }

      await sock.sendMessage(
        from,
        {
          text: `Preparando Facebook...\n\nAPI: ${API_BASE}`,
          ...global.channelInfo,
        },
        quoted
      );

      const info = await requestFacebookMeta(videoUrl);

      if (info.thumbnail) {
        const previewLines = [`DVYER API`, "", info.title];
        if (info.duration) previewLines.push(`Duracion: ${info.duration}`);
        if (info.description) previewLines.push("", info.description);

        await sock.sendMessage(
          from,
          {
            image: { url: info.thumbnail },
            caption: previewLines.join("\n"),
            ...global.channelInfo,
          },
          quoted
        );
      }

      tempPath = path.join(TMP_DIR, `${Date.now()}-${info.fileName}`);
      const downloaded = await downloadApiFile(API_FACEBOOK_URL, {
        params: {
          mode: "file",
          quality: VIDEO_QUALITY,
          url: videoUrl,
        },
        outputPath: tempPath,
        maxBytes: MAX_VIDEO_BYTES,
        minBytes: 100000,
      });

      const captionLines = [`DVYER API`, "", info.title];
      if (info.duration) captionLines.push(`Duracion: ${info.duration}`);

      await sendVideoOrDocument(sock, from, quoted, {
        filePath: downloaded.tempPath,
        fileName: normalizeMp4Name(downloaded.fileName || info.fileName),
        title: info.title,
        size: downloaded.size,
        documentThreshold: VIDEO_AS_DOCUMENT_THRESHOLD,
        caption: captionLines.join("\n"),
      });
    } catch (error) {
      console.error("FACEBOOK ERROR:", error?.message || error);
      cooldowns.delete(userId);

      await sock.sendMessage(from, {
        text: String(error?.message || "No se pudo procesar el video de Facebook."),
        ...global.channelInfo,
      });
    } finally {
      deleteFileSafe(tempPath);
    }
  },
};
