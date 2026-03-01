
import fs from "fs";
import path from "path";
import axios from "axios";
import yts from "yt-search";
import { spawn } from "child_process";

const API_URL = "https://nexevo-api.vercel.app/download/y2";
const COOLDOWN_TIME = 15 * 1000;
const cooldowns = new Map();

const TMP_DIR = path.join(process.cwd(), "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_BYTES = 150 * 1024 * 1024; // 150 MB

const RAM_TMP = "/dev/shm";
const CAN_USE_RAM = (() => {
  try {
    return fs.existsSync(RAM_TMP) && fs.statSync(RAM_TMP).isDirectory();
  } catch {
    return false;
  }
})();

function safeFileName(name) {
  return String(name || "video")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

async function headSize(url) {
  try {
    const res = await axios.head(url, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" },
      maxRedirects: 5,
      validateStatus: () => true,
    });
    const len = Number(res.headers["content-length"] || 0);
    return Number.isFinite(len) ? len : 0;
  } catch {
    return 0;
  }
}

async function remuxFromUrlToMp4({ inputUrl, outPath }) {
  const args = [
    "-y",
    "-loglevel", "error",
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", inputUrl,
    "-map", "0:v",
    "-map", "0:a?",
    "-movflags", "+faststart",
    "-c", "copy",
    outPath,
  ];

  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr += d.toString()));

  await new Promise((resolve, reject) => {
    ff.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(ffErr || `ffmpeg failed (code ${code})`));
    });
    ff.on("error", reject);
  });

  const size = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
  if (!size || size < 300000) throw new Error("Salida MP4 incompleta");
  return size;
}

export default {
  command: ["ytmp4", "mp4", "ytvideo", "playvideo"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;

    const reply = (text) =>
      sock.sendMessage(
        from,
        { text, ...global.channelInfo },
        msg ? { quoted: msg } : undefined
      );

    const userId = from;
    if (cooldowns.has(userId)) {
      const wait = cooldowns.get(userId) - Date.now();
      if (wait > 0) return reply(`⏳ Espera ${Math.ceil(wait / 1000)}s`);
    }
    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    let finalMp4 = null;

    try {
      if (!args?.length) {
        cooldowns.delete(userId);
        return reply("❌ Uso: .ytmp4 <nombre o link de YouTube>");
      }

      const query = args.join(" ").trim();

      let ytUrl = query;
      let title = "YouTube Video";

      if (!/^https?:\/\//i.test(query)) {
        const search = await yts(query);
        if (!search.videos?.length) {
          cooldowns.delete(userId);
          return reply("❌ No se encontró el video");
        }
        const v = search.videos[0];
        ytUrl = v.url;
        title = safeFileName(v.title);
      }

      await reply(`🎬 *VIDEO*\n📹 ${title}\n⏳ Buscando link…`);

      const api = `${API_URL}?url=${encodeURIComponent(ytUrl)}`;
      const { data } = await axios.get(api, { timeout: 20000 });

      if (!data?.status || !data?.result?.url) throw new Error("API inválida");

      const mp4Remote = data.result.url;

      const remoteSize = await headSize(mp4Remote);
      if (remoteSize && remoteSize > MAX_BYTES) {
        cooldowns.delete(userId);
        return reply(`❌ El video pesa ${(remoteSize / 1048576).toFixed(1)} MB y supera 150 MB.`);
      }

      await reply(
        `⏳ Descargando y optimizando…\n📦 Límite: 150 MB\n` +
        (remoteSize ? `📏 Tamaño: ${(remoteSize / 1048576).toFixed(1)} MB` : `📏 Tamaño: desconocido`)
      );

      // ✅ salida: RAM si existe /dev/shm, si no disco tmp
      finalMp4 = CAN_USE_RAM
        ? path.join(RAM_TMP, `${Date.now()}_${title}.mp4`)
        : path.join(TMP_DIR, `${Date.now()}_${title}.mp4`);

      let ok = false;
      let lastErr = null;

      for (let i = 0; i < 2; i++) {
        try {
          await remuxFromUrlToMp4({ inputUrl: mp4Remote, outPath: finalMp4 });
          const localSize = fs.statSync(finalMp4).size;
          if (localSize > MAX_BYTES) throw new Error("Archivo final supera 150MB");
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
          try { if (finalMp4 && fs.existsSync(finalMp4)) fs.unlinkSync(finalMp4); } catch {}
          await sleep(1200);
        }
      }

      if (!ok) throw lastErr || new Error("Fallo ffmpeg");

      const localSize = fs.statSync(finalMp4).size;
      await sock.sendMessage(
        from,
        {
          video: { url: finalMp4 },
          mimetype: "video/mp4",
          fileName: `${title}.mp4`,
          caption: `🎬 ${title}\n📦 ${(localSize / 1048576).toFixed(1)} MB`,
          ...global.channelInfo,
        },
        msg ? { quoted: msg } : undefined
      );
    } catch (err) {
      console.error("YTMP4 150MB ERROR:", err?.message || err);

      if (String(err?.code) === "ENOSPC" || /no space/i.test(String(err?.message))) {
        return reply("❌ Sin espacio (disco o /tmp). Limpia tmp/ o reduce el tamaño.");
      }

      await reply("❌ Error al procesar el video (Nexevo/ffmpeg).");
    } finally {
      cooldowns.delete(userId);
      try { if (finalMp4 && fs.existsSync(finalMp4)) fs.unlinkSync(finalMp4); } catch {}
    }
  },
};
