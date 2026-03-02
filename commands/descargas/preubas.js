export default {
  command: ["botones", "buttons"],
  category: "menu",

  run: async (ctx) => {
    const { sock, from, msg } = ctx;
    const quoted = msg?.key ? { quoted: msg } : undefined;

    return global.enviarBotones(sock, from, {
      text: "✅ Botones de prueba:",
      footer: "DVYER BOT",
      buttons: [
        { buttonId: ".menu", buttonText: { displayText: "📂 Menú" }, type: 1 },
        { buttonId: ".ping", buttonText: { displayText: "📌 Ping" }, type: 1 },
        { buttonId: ".consola 30", buttonText: { displayText: "🧾 Consola" }, type: 1 }
      ],
      quoted,
    });
  },
};
