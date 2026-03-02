import axios from "axios";

// ================= CONFIG =================
const API_URL = "https://nexevo-api.vercel.app/download/tiktok";
const COOLDOWN_TIME = 10 * 1000;
const cooldowns = new Map();

const BORDER = "⭐════════════════════════⭐";
const LINE = "❒════════════════════════";

// ================= COMANDO =================
export default {
  command: ["tiktok", "tt", "tk"],
  category: "descarga",

  run: async ({ sock, from, args, settings, m, msg }) => {
    const quoted = (m?.key || msg?.key) ? { quoted: (m || msg) } : undefined;
    const userId = from;
    const BOT_NAME = settings?.botName || "DVYER";

    // 🔒 SISTEMA DE COOLDOWN
    if (cooldowns.has(userId)) {
      const wait = cooldowns.get(userId) - Date.now();
      if (wait > 0) {
        return sock.sendMessage(from, {
          text: `⚠️ *¡DESPACIO!* ⏳\nEspera *${Math.ceil(wait / 1000)}s* para volver a usar este comando.`
        }, quoted);
      }
    }
    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    try {
      const videoUrl = args[0]?.split("?")[0]?.trim();

      // 🛑 VALIDACIÓN DE ENTRADA
      if (!videoUrl || !/tiktok\.com/i.test(videoUrl)) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: `*┏━━━〔 📥 TIKTOK DOWNLOADER 〕━━━┓*\n\n❌ *ERROR:* Enlace no proporcionado o inválido.\n\n📌 *USO CORRECTO:*\n.tiktok <link>\n\n📝 *EJEMPLO:*\n.tiktok https://vt.tiktok.com/ZSm3Mwydy/\n\n*┗━━━━━━━━━━━━━━━━━━━━┛*`
        }, quoted);
      }

      // 📡 AVISO DE PROCESAMIENTO
      await sock.sendMessage(from, {
        text: `⚡ *PROCESANDO VIDEO...*\n_Espere un momento, ${BOT_NAME} está trabajando._`
      }, { quoted: m });

      // 🌐 LLAMADA A LA API
      const { data } = await axios.get(`${API_URL}?url=${encodeURIComponent(videoUrl)}`, {
        timeout: 30000,
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      // 🔍 VALIDACIÓN DE RESPUESTA
      if (!data?.status || !data.result?.data) {
        throw new Error("No se pudo extraer el video. Verifica el link.");
      }

      const info = data.result.data;
      const videoFile = info.hdplay || info.play || info.wmplay;

      if (!videoFile) throw new Error("No se encontró un archivo de video reproducible.");

      // ✨ DISEÑO DE CAPTION (ESTADÍSTICAS)
      const caption = `
${BORDER}
      🎬 *TIKTOK DOWNLOAD*
${BORDER}

📝 *TÍTULO:* ${info.title ? info.title.slice(0, 100) + "..." : "Sin descripción"}
👤 *AUTOR:* ${info.author?.nickname || "TikTok User"}
⏱️ *DURACIÓN:* ${info.duration || 0} segundos

📈 *ESTADÍSTICAS:*
💬 Comentarios: ${info.comment_count?.toLocaleString() || 0}
❤️ Likes: ${info.digg_count?.toLocaleString() || 0}
🔁 Compartidos: ${info.share_count?.toLocaleString() || 0}
▶️ Vistas: ${info.play_count?.toLocaleString() || 0}

${LINE}
🤖 *Bot:* ${BOT_NAME}
${BORDER}`.trim();

      // 🎬 ENVÍO DEL VIDEO
      await sock.sendMessage(from, {
        video: { url: videoFile },
        caption: caption,
        mimetype: "video/mp4",
        fileName: `tiktok_${info.id}.mp4`
      }, quoted);

    } catch (err) {
      console.error("❌ ERROR EN TIKTOK:", err.message);
      cooldowns.delete(userId);

      const errorMsg = err.response?.status === 404 
        ? "El video no existe o es privado." 
        : "Ocurrió un error al procesar la solicitud. Intenta más tarde.";

      await sock.sendMessage(from, {
        text: `❌ *ERROR GENERAL*\n\n${LINE}\n${errorMsg}\n${LINE}`
      }, quoted);
    }
  }
};
