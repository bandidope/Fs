import yts from "yt-search";

function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }

  return String(settings?.prefix || ".").trim() || ".";
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clipText(value = "", max = 72) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3))}...`;
}

function buildCommand(prefix, command, url) {
  return `${prefix}${command} ${url}`.trim();
}

async function react(conn, m, emoji) {
  try {
    if (!m?.key) return;
    await conn.sendMessage(m.key.remoteJid, {
      react: {
        text: emoji,
        key: m.key,
      },
    });
  } catch {}
}

function formatVideoRow(prefix, video, index, type) {
  const title = clipText(video?.title || "Sin título", 68);
  const duration = cleanText(video?.timestamp || "??:??");
  const author = clipText(video?.author?.name || video?.author || "Desconocido", 28);
  const url = cleanText(video?.url || "");

  return {
    header: `${index + 1}`,
    title,
    description: `${type} | ${duration} | ${author}`,
    id: buildCommand(prefix, type === "MP3" ? "ytmp3" : "ytmp4", url),
  };
}

export default {
  name: "play",
  command: ["play"],
  categoria: "descarga",

  async run(ctx) {
    const { sock: conn, m, from, args, settings } = ctx;
    const prefix = getPrefix(settings);

    try {
      await react(conn, m, "🔎");

      const query = Array.isArray(args) ? args.join(" ").trim() : "";

      if (!query) {
        await react(conn, m, "❌");
        return await conn.sendMessage(
          from,
          {
            text: [
              "╭━━━〔 🎵 *PLAY SEARCH* 〕━━━⬣",
              "┃",
              "┃ ✦ *USO DEL COMANDO*",
              "┃",
              `┃ 📌 ${prefix}play ozuna odisea`,
              `┃ 📌 ${prefix}play enlace o nombre`,
              "╰━━━━━━━━━━━━━━━━━━━━⬣",
            ].join("\n"),
          },
          { quoted: m }
        );
      }

      const res = await yts(query);
      const videos = Array.isArray(res?.videos)
        ? res.videos.filter((v) => cleanText(v?.url)).slice(0, 6)
        : [];

      if (!videos.length) {
        await react(conn, m, "❌");
        return await conn.sendMessage(
          from,
          {
            text: "No encontré resultados en YouTube.",
          },
          { quoted: m }
        );
      }

      const first = videos[0];
      const mp3Rows = videos.map((video, index) =>
        formatVideoRow(prefix, video, index, "MP3")
      );
      const mp4Rows = videos.map((video, index) =>
        formatVideoRow(prefix, video, index, "MP4")
      );

      await conn.sendMessage(
        from,
        {
          text: [
            "╭━━━〔 🎧 *FSOCIETY PLAY* 〕━━━⬣",
            "┃",
            `┃ 🔎 *Búsqueda:* ${clipText(query, 55)}`,
            `┃ 🎵 *Top:* ${clipText(first?.title || "Sin título", 55)}`,
            `┃ ⏱️ *Duración:* ${cleanText(first?.timestamp || "??:??")}`,
            `┃ 👤 *Canal:* ${clipText(first?.author?.name || first?.author || "Desconocido", 32)}`,
            "┃",
            "┃ ✦ Elige si quieres *MP3* o *MP4*",
            "╰━━━━━━━━━━━━━━━━━━━━⬣",
          ].join("\n"),
          title: "FSOCIETY BOT",
          subtitle: "YouTube MP3 / MP4",
          footer: "Descargas YouTube",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Elegir descarga",
                sections: [
                  {
                    title: "MP3 - Audio rápido",
                    rows: mp3Rows,
                  },
                  {
                    title: "MP4 - Video",
                    rows: mp4Rows,
                  },
                ],
              }),
            },
          ],
        },
        { quoted: m }
      );

      await react(conn, m, "✅");
    } catch (e) {
      console.error("Error en play:", e);
      await react(conn, m, "❌");

      return await conn.sendMessage(
        from,
        { text: `Error en play:\n${e?.message || e}` },
        { quoted: m }
      );
    }
  },
};