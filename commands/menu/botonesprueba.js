import { sendButtons } from "../../lib/interactive-helper.js";

export default {
  name: "botonesprueba",
  command: ["botonesprueba", "buttonstest", "btnprueba"],
  category: "menu",
  description: "Prueba de botones clasicos",

  run: async ({ sock, msg, from, usedPrefix = "." }) => {
    try {
      if (typeof sendButtons !== "function") {
        throw new Error("baileys_helper no esta disponible.");
      }

      console.log(`BOTONES PRUEBA SEND chat=${from}`);

      await sendButtons(
        sock,
        from,
        {
          text:
            "Prueba de botones\n\n" +
            "Toca uno de los botones para comprobar si tu WhatsApp los muestra bien.",
          footer: "Fsociety bot",
          buttons: [
            {
              id: `${usedPrefix}ping`,
              text: "Ping",
            },
            {
              id: `${usedPrefix}status`,
              text: "Status",
            },
            {
              id: `${usedPrefix}menu`,
              text: "Menu",
            },
          ],
        },
        {
          quoted: msg,
        }
      );

      console.log(`BOTONES PRUEBA OK chat=${from}`);
    } catch (error) {
      console.error("BOTONES PRUEBA ERROR:", error);
      await sock.sendMessage(
        from,
        {
          text: `No pude enviar la prueba de botones.\n\n${error?.message || error}`,
        },
        { quoted: msg }
      );
    }
  },
};
