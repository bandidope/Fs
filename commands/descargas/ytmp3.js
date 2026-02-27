import axios from "axios";
import yts from "yt-search";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const API_URL = "https://nexevo-api.vercel.app/download/y";
const COOLDOWN = 8000;
const cooldowns = new Map();

const MAX_BYTES = 25 * 1024 * 1024; // 25MB
let busy = false;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withGlobalLock(fn) {
  while (busy) await wait(400);
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

const TMP_DIR = path.join(process.cwd(), "tmp");

async function cleanTmp(dir, maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  let files = [];
  try {
    files = await fsp.readdir(dir);
  } catch {
    return;
  }
  for (const name of files) {
    const p = path.join(dir, name);
    try {
      const st = await fsp.stat(p);
      if (st.isFile() && now - st.mtimeMs > maxAgeMs) {
        await fsp.unlink(p);
      }
    } catch {}
  }
}

setInterval(() => cleanTmp(TMP_DIR).catch(() => {}), 10 * 60 * 1000);

function safeFileName(name) {
  return String(name || "audio")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export default {
  command: ["ytmp3", "play"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const messageKey = msg?.key || null;

    const now = Date.now();
    const userCooldown = cooldowns.get(from);

    if (userCooldown && now < userCooldown) {
      return sock.sendMessage(
        from,
        { text: `⏳ Espera ${Math.ceil((userCooldown - now) / 1000)}s`, ...global.channelInfo },
        msg ? { quoted: msg } : undefined
      );
    }

    cooldowns.set(from, now + COOLDOWN);

    try {
      if (!args?.length) {
        cooldowns.delete(from);
        return sock.sendMessage(
          from,
          { text: "🎧 Uso: .ytmp3 <nombre o link>", ...global.channelInfo },
          msg ? { quoted: msg } : undefined
        );
      }

      // React inicio
      if (messageKey) {
        await sock.sendMessage(from, { react: { text: "⏳", key: messageKey } });
      }

      await cleanTmp(TMP_DIR).catch(() => {});

      let query = args.join(" ").trim();
      let videoUrl = query;
      let title = "YouTube Audio";
      let thumbnail = "";
      let duration = "??";

      if (!/^https?:\/\//i.test(query)) {
        const { videos } = await yts(query);
        if (!videos?.length) throw new Error("Sin resultados");

        const v = videos.find((x) => x.seconds && x.seconds < 1800) || videos[0];

        videoUrl = v.url;
        title = v.title;
        thumbnail = v.thumbnail;
        duration = v.timestamp;
      }

      // 🔔 MENSAJE DE DESCARGA
      await sock.sendMessage(
        from,
        {
          text: `🎧 *Descargando Audio...*\n\n🎵 ${title}\n⏱ ${duration}`,
          ...global.channelInfo
        },
        msg ? { quoted: msg } : undefined
      );

      const apiRes = await axios.get(
        `${API_URL}?url=${encodeURIComponent(videoUrl)}`,
        { timeout: 25000 }
      );

      const directUrl = apiRes?.data?.result?.url;

      if (!directUrl || !directUrl.startsWith("http")) {
        throw new Error("API inválida");
      }

      await withGlobalLock(async () => {
        await sock.sendMessage(
          from,
          {
            audio: { url: directUrl },
            mimetype: "audio/mpeg",
            fileName: `${safeFileName(title)}.mp3`,
            contextInfo: thumbnail
              ? {
                  externalAdReply: {
                    title,
                    body: `⏱ ${duration}`,
                    thumbnailUrl: thumbnail,
                    sourceUrl: videoUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                  },
                }
              : undefined,
            ...global.channelInfo
          },
          msg ? { quoted: msg } : undefined
        );
      });

      if (messageKey) {
        await sock.sendMessage(from, { react: { text: "✅", key: messageKey } });
      }

    } catch (err) {
      cooldowns.delete(from);
      console.error("❌ YTMP3 ERROR:", err?.message || err);

      if (messageKey) {
        try {
          await sock.sendMessage(from, { react: { text: "❌", key: messageKey } });
        } catch {}
      }

      await sock.sendMessage(
        from,
        { text: "❌ No se pudo descargar el audio", ...global.channelInfo },
        msg ? { quoted: msg } : undefined
      );
    }
  },
};
