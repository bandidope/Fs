import fs from "fs";
import path from "path";
import axios from "axios";
import yts from "yt-search";
import { exec } from "child_process";

const API_BASE = "https://dv-yer-api.online";
const API_AUDIO_URL = `${API_BASE}/ytmp3`;
const API_SEARCH_URL = `${API_BASE}/ytsearch`;

const COOLDOWN_TIME = 10 * 1000;
const AUDIO_QUALITY = "128k";
const TMP_DIR = path.join(process.cwd(), "tmp");
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const cooldowns = new Map();

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function safeFileName(name) {
  return (
    String(name || "audio")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "audio"
  );
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ""));
}

function getCooldownRemaining(untilMs) {
  return Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
}

function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "").trim();

    const v = u.searchParams.get("v");
    if (v) return v.trim();

    const parts = u.pathname.split("/").filter(Boolean);
    const shortsIndex = parts.indexOf("shorts");
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1].trim();

    const embedIndex = parts.indexOf("embed");
    if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1].trim();

    return null;
  } catch {
    return null;
  }
}

function toAbsoluteUrl(urlLike) {
  if (!urlLike) return "";
  if (/^https?:\/\//i.test(urlLike)) return urlLike;
  return new URL(urlLike, API_BASE).href;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractApiError(data, status) {
  return (
    data?.detail ||
    data?.error?.message ||
    data?.message ||
    (status ? `HTTP ${status}` : "Error de API")
  );
}

function pickBestDownloadUrl(data) {
  return (
    data?.download_url_full ||
    data?.download_url ||
    data?.url ||
    data?.result?.download_url_full ||
    data?.result?.download_url ||
    data?.result?.url ||
    ""
  );
}

async function apiGet(url, params, timeout = 35000) {
  const response = await axios.get(url, {
    timeout,
    params,
    validateStatus: () => true,
  });

  const data = response.data;

  if (response.status >= 400) {
    throw new Error(extractApiError(data, response.status));
  }

  if (data?.ok === false || data?.status === false) {
    throw new Error(extractApiError(data, response.status));
  }

  return data;
}

async function resolveTrackInfo(queryOrUrl) {
  if (!isHttpUrl(queryOrUrl)) {
    try {
      const data = await apiGet(API_SEARCH_URL, { q: queryOrUrl, limit: 1 }, 25000);
      const first = data?.results?.[0];
      if (first?.url) {
        return {
          videoUrl: first.url,
          title: safeFileName(first.title),
          thumbnail: first.thumbnail || null,
        };
      }
    } catch {}

    const search = await yts(queryOrUrl);
    const first = search?.videos?.[0];
    if (!first) return null;

    return {
      videoUrl: first.url,
      title: safeFileName(first.title),
      thumbnail: first.thumbnail || null,
    };
  }

  const videoId = getYoutubeId(queryOrUrl);
  if (videoId) {
    try {
      const info = await yts({ videoId });
      if (info?.url) {
        return {
          videoUrl: info.url,
          title: safeFileName(info.title),
          thumbnail: info.thumbnail || null,
        };
      }
    } catch {}
  }

  return {
    videoUrl: queryOrUrl,
    title: "audio",
    thumbnail: null,
  };
}

async function requestAudioLink(videoUrl) {
  let lastError = "No se pudo obtener el audio.";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await apiGet(API_AUDIO_URL, {
        mode: "link",
        quality: AUDIO_QUALITY,
        url: videoUrl,
      });

      const directUrl = toAbsoluteUrl(pickBestDownloadUrl(data));
      if (!directUrl) {
        throw new Error("La API no devolvió URL de descarga.");
      }

      return {
        title: safeFileName(data?.title || data?.result?.title || "audio"),
        directUrl,
      };
    } catch (error) {
      lastError = error?.message || "Error desconocido";
      await sleep(900 * attempt);
    }
  }

  throw new Error(lastError);
}

async function convertToMp3(inputUrl, outputPath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffmpeg -y -i "${inputUrl}" -vn -c:a libmp3lame -b:a 128k -ar 44100 -threads 2 -loglevel error "${outputPath}"`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export default {
  command: ["ytmp3", "play"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const userId = from;
    const quoted = msg?.key ? { quoted: msg } : undefined;
    let finalMp3;

    const until = cooldowns.get(userId);
    if (until && until > Date.now()) {
      return sock.sendMessage(from, {
        text: `⏳ Espera ${getCooldownRemaining(until)}s`,
        ...global.channelInfo,
      });
    }

    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    try {
      if (!args?.length) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ Uso: .ytmp3 <nombre o link>",
          ...global.channelInfo,
        });
      }

      const query = args.join(" ").trim();
      const meta = await resolveTrackInfo(query);

      if (!meta) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ No se encontró ningún resultado.",
          ...global.channelInfo,
        });
      }

      let { videoUrl, title, thumbnail } = meta;

      await sock.sendMessage(
        from,
        thumbnail
          ? {
              image: { url: thumbnail },
              caption: `🎵 Preparando audio...\n\n🎧 ${title}\n🎚️ Calidad: ${AUDIO_QUALITY}`,
              ...global.channelInfo,
            }
          : {
              text: `🎵 Preparando audio...\n\n🎧 ${title}\n🎚️ Calidad: ${AUDIO_QUALITY}`,
              ...global.channelInfo,
            },
        quoted
      );

      const info = await requestAudioLink(videoUrl);
      title = safeFileName(info.title || title);

      finalMp3 = path.join(TMP_DIR, `${Date.now()}.mp3`);
      await convertToMp3(info.directUrl, finalMp3);

      const size = fs.existsSync(finalMp3) ? fs.statSync(finalMp3).size : 0;

      if (!size || size < 100000) {
        throw new Error("Audio inválido");
      }

      if (size > MAX_AUDIO_BYTES) {
        throw new Error("Audio demasiado grande");
      }

      await sock.sendMessage(
        from,
        {
          audio: { url: finalMp3 },
          mimetype: "audio/mpeg",
          ptt: false,
          fileName: `${title}.mp3`,
          ...global.channelInfo,
        },
        quoted
      );
    } catch (err) {
      console.error("YTMP3 ERROR:", err?.message || err);
      cooldowns.delete(userId);

      await sock.sendMessage(from, {
        text: `❌ ${String(err?.message || "Error al procesar la música.")}`,
        ...global.channelInfo,
      });
    } finally {
      try {
        if (finalMp3 && fs.existsSync(finalMp3)) {
          fs.unlinkSync(finalMp3);
        }
      } catch {}
    }
  },
};
