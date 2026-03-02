export default {
  command: ["menu", "ayuda", "help"],
  category: "menu",

  run: async (ctx) => {
    const { sock, from, msg } = ctx;
    const quoted = msg?.key ? { quoted: msg } : undefined;

    // ✅ MENÚ POR CATEGORÍAS (LISTA)
    return global.enviarLista(sock, from, {
      title: "📂 DVYER MENU",
      text: "Elige una categoría:",
      footer: "DVYER BOT",
      buttonText: "Abrir menú",
      sections: [
        {
          title: "⬇️ Descargas",
          rows: [
            {
              title: "🎬 YouTube MP4",
              description: "Descargar video (.ytmp4 360p <nombre/link>)",
              rowId: ".ytmp4 360p despacito"
            },
            {
              title: "🎵 YouTube MP3",
              description: "Descargar audio (.ytmp3 <nombre/link>)",
              rowId: ".ytmp3 despacito"
            }
          ]
        },
        {
          title: "⚙️ Utilidades",
          rows: [
            {
              title: "📌 Ping",
              description: "Ver estado del bot",
              rowId: ".ping"
            },
            {
              title: "🧾 Consola (Owner)",
              description: "Ver logs recientes",
              rowId: ".consola 30"
            }
          ]
        }
      ],
      quoted,
    });
  },
};
