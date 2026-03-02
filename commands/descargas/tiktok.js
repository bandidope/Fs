import axios from "axios";

// ================= CONFIG =================
const COOLDOWN_TIME = 10 * 1000;
const cooldowns = new Map();

const BORDER = "⭐════════════════════════⭐";
const LINE = "❒════════════════════════";
const SMALL = "•────────────────────────•";

// API NEXEVO
const NEXEVO_API = "https://nexevo.onrender.com/download/tiktok?url=";

// ================= HELPERS =================
function normalizeText(str = "") {
  // Limpia saltos raros / exceso de espacios
  return String(str)
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function clip(str = "", max = 80) {
  const s = normalizeText(str);
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function isTikTokUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    // Acepta dominios comunes de TikTok
    return (
      host.includes("tiktok.com") ||
      host.includes("vm.tiktok.com") ||
      host.includes("vt.tiktok.com")
    );
  } catch {
    return false;
  }
}

function unixToDate(unixSeconds) {
  try {
    if (!unixSeconds) return "—";
    const d = new Date(Number(unixSeconds) * 1000);
    return d.toLocaleString("es-ES", { hour12: false });
  } catch {
    return "—";
  }
}

function formatNum(n) {
  const num = Number(n || 0);
  return num.toLocaleString("es-ES");
}

// ================= COMANDO =================
export default {
  command: ["tiktok", "tt", "tk"],
  category: "descarga",

  run: async ({ sock, from, args, settings, m, msg }) => {
    const quoted = (m?.key || msg?.key) ? { quoted: (m || msg) } : undefined;
    const userId = from;

    const BOT_NAME = settings?.botName || "⺪Artoria Bot - SonGoku Bot 乂​";
    const channelContext = global.channelInfo || {};

    // 🔒 COOLDOWN
    const now = Date.now();
    const endsAt = cooldowns.get(userId) || 0;
    const wait = endsAt - now;

    if (wait > 0) {
      return sock.sendMessage(
        from,
        {
          text:
            `⚠️ *¡DESPACIO!* ⏳\n` +
            `Espera *${Math.ceil(wait / 1000)}s* para volver a usar este comando.`,
          ...channelContext,
        },
        quoted
      );
    }
    cooldowns.set(userId, now + COOLDOWN_TIME);

    // URL del video (soporta que peguen con espacios)
    const videoUrl = args.join(" ").trim();

    // 🛑 VALIDACIÓN
    if (!videoUrl || !isTikTokUrl(videoUrl)) {
      cooldowns.delete(userId);
      return sock.sendMessage(
        from,
        {
          text:
            `*┏━━━〔 📥 TIKTOK DOWNLOADER 〕━━━┓*\n\n` +
            `❌ *ERROR:* Enlace inválido.\n\n` +
            `📌 *USO:* .tiktok <link>\n\n` +
            `Ejemplo:\n.tiktok https://www.tiktok.com/@user/video/123...\n\n` +
            `*┗━━━━━━━━━━━━━━━━━━━━┛*`,
          ...channelContext,
        },
        quoted
      );
    }

    // 📡 PROCESANDO
    const processingMsg =
      `⚡ *PROCESANDO...*\n` +
      `${SMALL}\n` +
      `🔎 Analizando enlace y obteniendo HD\n` +
      `⏳ Esto puede tardar unos segundos...\n` +
      `${SMALL}`;

    await sock.sendMessage(
      from,
      { text: processingMsg, ...channelContext },
      { quoted: m || msg }
    );

    try {
      // 🌐 LLAMADA A API NEXEVO
      const apiUrl = NEXEVO_API + encodeURIComponent(videoUrl);
      const { data } = await axios.get(apiUrl, {
        timeout: 30000,
        headers: { Accept: "application/json" },
      });

      if (!data?.status || data?.result?.code !== 0 || !data?.result?.data) {
        const apiMsg = data?.result?.msg || "Respuesta inválida de la API.";
        throw new Error(apiMsg);
      }

      const info = data.result.data;

      // ✅ Prioridad de video
      const videoFile = info.hdplay || info.play || info.wmplay;
      if (!videoFile) throw new Error("No se encontró un enlace de video disponible.");

      // 🎵 Audio opcional
      const audioFile = info?.music_info?.play || info?.music || null;

      // 🧾 Datos
      const title = clip(info.title || "Sin descripción", 90);
      const authorName =
        info?.author?.nickname ||
        info?.author?.unique_id ||
        info?.music_info?.author ||
        "TikTok User";

      const duration = Number(info.duration || 0);
      const region = info.region || "—";
      const created = unixToDate(info.create_time);

      const likes = formatNum(info.digg_count);
      const comments = formatNum(info.comment_count);
      const shares = formatNum(info.share_count);
      const plays = formatNum(info.play_count);
      const collects = formatNum(info.collect_count);

      // ✨ CAPTION PRO (más limpio y pro)
      const caption = `
${BORDER}
🎬 *TIKTOK DOWNLOADER (HD)*
${BORDER}

📝 *Título:* ${title}
👤 *Autor:* ${authorName}
🕒 *Duración:* ${duration}s
🌎 *Región:* ${region}
📅 *Publicado:* ${created}

${LINE}
📊 *Estadísticas:*
▶️ ${plays}  |  ❤️ ${likes}
💬 ${comments} | 🔁 ${shares}
📌 Guardados: ${collects}

${LINE}
🤖 *Bot:* ${BOT_NAME}
${BORDER}`.trim();

      // 🎬 ENVÍO VIDEO
      await sock.sendMessage(
        from,
        {
          video: { url: videoFile },
          caption,
          mimetype: "video/mp4",
          fileName: `tiktok_${info.id || Date.now()}.mp4`,
          ...channelContext,
        },
        quoted
      );

      // 🎵 ENVÍO AUDIO (opcional)
      if (audioFile) {
        await sock.sendMessage(
          from,
          {
            audio: { url: audioFile },
            mimetype: "audio/mpeg",
            ptt: false,
            caption:
              `🎵 *Audio extraído*\n${SMALL}\n` +
              `• *Sound:* ${clip(info?.music_info?.title || "Original sound", 80)}\n` +
              `• *Autor:* ${clip(info?.music_info?.author || authorName, 60)}\n` +
              `${SMALL}`,
            ...channelContext,
          },
          quoted
        );
      }
    } catch (err) {
      console.error("❌ ERROR TIKTOK (NEXEVO):", err?.message || err);
      cooldowns.delete(userId);

      const reason = clip(err?.message || "Error desconocido", 120);

      await sock.sendMessage(
        from,
        {
          text:
            `❌ *ERROR AL DESCARGAR*\n` +
            `${LINE}\n` +
            `No pude obtener el video.\n` +
            `🧩 *Motivo:* ${reason}\n` +
            `${LINE}\n` +
            `✅ Tips:\n` +
            `• Verifica que el link sea público\n` +
            `• Prueba con otro enlace (vm/vt también sirven)\n` +
            `• Si falla seguido, puede estar saturada la API`,
          ...channelContext,
        },
        quoted
      );
    }
  },
};
