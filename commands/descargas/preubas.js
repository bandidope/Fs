// ✅ Lista tipo “categorías” (List Message)
global.enviarLista = async (sock, jid, opts) => {
  const {
    title = "Menú",
    text = "Elige una opción:",
    footer = settings.botName || "Bot",
    buttonText = "Ver opciones",
    sections = [],
    quoted,
  } = opts || {};

  return sock.sendMessage(
    jid,
    {
      title,
      text,
      footer,
      buttonText,
      sections,
      // ❌ NO pongas ...global.channelInfo aquí
    },
    quoted
  );
};

// ✅ Botones quick reply
global.enviarBotones = async (sock, jid, opts) => {
  const {
    text = "Elige:",
    footer = settings.botName || "Bot",
    buttons = [],
    quoted,
  } = opts || {};

  return sock.sendMessage(
    jid,
    {
      text,
      footer,
      buttons,
      headerType: 1,
      // ❌ NO pongas ...global.channelInfo aquí
    },
    quoted
  );
};
