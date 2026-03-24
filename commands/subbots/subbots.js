import {
  buildSubbotMediaMessage,
  formatDuration,
  buildSubbotCard,
  formatDateTime,
  getCurrentChatStatus,
  getPrefix,
  getSubbotQuoted,
  hasSubbotRuntime,
} from "./_shared.js";

export default {
  name: "subbots",
  command: ["bots", "codigosubbots", "estadosubbots", "subbotsactivos"],
  category: "subbots",
  description: "Muestra el panel de subbots",

  run: async ({ sock, msg, from, settings, isGroup, botId, botLabel }) => {
    const quoted = getSubbotQuoted(msg);
    const prefix = getPrefix(settings);
    const runtime = global.botRuntime;
    const chatStatus = getCurrentChatStatus({ isGroup, botId, botLabel });

    if (!hasSubbotRuntime(runtime)) {
      return sock.sendMessage(
        from,
        {
          text: "No pude acceder al control interno del subbot.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    const subbotAccess = runtime.getSubbotRequestState();
    const bots = runtime
      .listBots()
      .slice()
      .sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0));
    const publicLabel = subbotAccess.publicRequests ? "ENCENDIDO" : "APAGADO";
    const activeCount = bots.filter((bot) => bot.connected).length;
    const linkedCount = bots.filter((bot) => bot.registered).length;
    const enabledCount = bots.filter((bot) => bot.enabled).length;
    const waitingCount = bots.filter((bot) => bot.pairingPending || bot.connecting).length;
    const activeBots = bots.filter((bot) => bot.connected);
    const lines = bots.length
      ? bots.map((bot) => buildSubbotCard(bot, { compact: true }))
      : ["No hay slots de subbot disponibles."];
    const activeBotLines = activeBots.length
      ? activeBots.map(
          (bot) =>
            `- ${bot.label || `SUBBOT${bot.slot}`} | ${bot.displayName} | ${formatDuration(bot.connectedForMs || 0)}`
        )
      : ["- Ninguno activo ahora"];

    return sock.sendMessage(
      from,
      buildSubbotMediaMessage(
        "subbotsactivos.png",
        `*PANEL SUBBOTS*\n\n` +
          `General\n` +
          `Modo publico: *${publicLabel}*\n` +
          `Capacidad: *${subbotAccess.maxSlots}*\n` +
          `Libres: *${subbotAccess.availableSlots}*\n` +
          `Activos: *${activeCount}*\n` +
          `Espera: *${waitingCount}*\n` +
          `Vinculados: *${linkedCount}*\n` +
          `Slots encendidos: *${enabledCount}*\n` +
          `Vista: ${chatStatus}\n` +
          `Hora: ${formatDateTime(Date.now())}\n\n` +
          `Bots activos ahora\n` +
          `${activeBotLines.join("\n")}\n\n` +
          `Slots\n\n` +
          `${lines.join("\n\n")}\n\n` +
          `Atajos\n` +
          `- ${prefix}subbot 519xxxxxxxxx\n` +
          `- ${prefix}subbot 3 519xxxxxxxxx\n` +
          `- ${prefix}subbot info 3\n` +
          `- ${prefix}subbot liberar 3\n` +
          `- ${prefix}subbot reset 3\n` +
          `- ${prefix}subbot slots 20\n` +
          `- ${prefix}subbots\n` +
          `- ${prefix}subboton\n` +
          `- ${prefix}subbotoff`
      ),
      quoted
    );
  },
};
