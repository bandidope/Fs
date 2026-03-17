import baileysHelper from "baileys_helper";
import { getPrefix } from "../sistema/_shared.js";

const { sendInteractiveMessage } = baileysHelper;

export default {
  name: "catalogoprueba",
  command: ["catalogoprueba", "catalogotest", "menulista"],
  category: "menu",
  description: "Envia un menu tipo catalogo para probar listas de WhatsApp",

  run: async ({ sock, msg, from, settings }) => {
    const prefix = getPrefix(settings);
    const now = new Date().toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const text =
      "MENU PRINCIPAL\n" +
      "[ MENU ]\n" +
      "LABORATORIO DE COMANDOS\n" +
      `Bot: ${settings?.botName || "DVYER"}\n` +
      `Hora: ${now}\n\n` +
      "Elige una categoria";

    const sections = [
      {
        title: "Comandos",
        rows: [
          {
            title: "Menu completo",
            description: "Muestra todos los comandos",
            id: `${prefix}menu`,
          },
          {
            title: "Categoria: sistema",
            description: "Ver prueba de categoria sistema",
            id: `${prefix}catprueba sistema`,
          },
          {
            title: "Categoria: descargas",
            description: "Ver prueba de categoria descargas",
            id: `${prefix}catprueba descargas`,
          },
          {
            title: "Categoria: juegos",
            description: "Ver prueba de categoria juegos",
            id: `${prefix}catprueba juegos`,
          },
        ],
      },
      {
        title: "Accesos rapidos",
        rows: [
          {
            title: "Ping",
            description: "Prueba rapida del bot",
            id: `${prefix}ping`,
          },
          {
            title: "Prueba de catalogo",
            description: "Confirma que la lista funciona",
            id: `${prefix}catalogook`,
          },
        ],
      },
    ];

    try {
      await sendInteractiveMessage(
        sock,
        from,
        {
          title: "Menu principal",
          text,
          footer: "Categorias",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Abrir catalogo",
                sections: sections.map((section) => ({
                  title: section.title,
                  rows: section.rows.map((row) => ({
                    header: "DVYER BOT",
                    title: row.title,
                    description: row.description,
                    id: row.id,
                  })),
                })),
              }),
            },
          ],
        },
        { quoted: msg }
      );
    } catch (error) {
      console.warn("CATALOGO fallback:", error?.message || error);

      await sock.sendMessage(
        from,
        {
          text,
        },
        { quoted: msg }
      );
    }
  },
};
