import * as baileys from "@whiskeysockets/baileys";
import { getPrefix } from "../sistema/_shared.js";

const generateWAMessageFromContent = baileys.generateWAMessageFromContent;
const proto = baileys.proto;

async function sendNativeCatalog({
  sock,
  from,
  msg,
  title,
  text,
  footer,
  buttonTitle,
  sections,
}) {
  if (!proto?.Message?.InteractiveMessage || typeof generateWAMessageFromContent !== "function") {
    throw new Error("InteractiveMessage no disponible");
  }

  const content = proto.Message.fromObject({
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.create({
            title,
            hasMediaAttachment: false,
          }),
          body: proto.Message.InteractiveMessage.Body.create({
            text,
          }),
          footer: proto.Message.InteractiveMessage.Footer.create({
            text: footer,
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                  title: buttonTitle,
                  sections,
                }),
              },
            ],
          }),
        }),
      },
    },
  });

  const waMessage = generateWAMessageFromContent(from, content, {
    quoted: msg,
    userJid: sock.user?.id,
  });

  await sock.relayMessage(from, waMessage.message, { messageId: waMessage.key.id });
}

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
      await sendNativeCatalog({
        sock,
        from,
        msg,
        title: "Menu principal",
        text,
        footer: "Categorias",
        buttonTitle: "Abrir catalogo",
        sections,
      });
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
