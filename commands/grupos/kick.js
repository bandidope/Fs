export default {
  command: ["kick"],
  groupOnly: true,
  adminOnly: true,
  category: "grupo",

  async run({ sock, from, msg, args, m }) {
    const quotedMsg = msg?.message?.extendedTextMessage?.contextInfo;
    const quotedParticipant = quotedMsg?.participant;

    // También permite mención: .kick @usuario
    const mentioned =
      quotedMsg?.mentionedJid?.[0] ||
      msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
      null;

    const target = quotedParticipant || mentioned;

    if (!target) {
      return await sock.sendMessage(
        from,
        {
          text:
`⚠️ *¿A quién expulso?*

✅ *Formas de usarlo:*
• Responde al mensaje del usuario y escribe: *.kick*
• Menciona al usuario: *.kick @usuario*`,
          ...global.channelInfo
        }
      );
    }

    try {
      const metadata = await sock.groupMetadata(from);
      const botId = sock?.user?.id?.split(":")[0] + "@s.whatsapp.net";

      // Evitar expulsar al bot
      if (target === botId) {
        return await sock.sendMessage(from, {
          text: "🤖 *No puedo expulsarme a mí mismo.*",
          ...global.channelInfo
        });
      }

      const participante = metadata.participants.find((p) => p.id === target);

      if (!participante) {
        return await sock.sendMessage(from, {
          text: "❌ *Usuario no encontrado en este grupo.*",
          ...global.channelInfo
        });
      }

      // 🚫 No expulsar al creador (superadmin)
      if (participante.admin === "superadmin") {
        return await sock.sendMessage(from, {
          text: "👑 *No puedes expulsar al creador del grupo.*",
          ...global.channelInfo
        });
      }

      // 🚫 No expulsar a otro admin
      if (participante.admin === "admin") {
        return await sock.sendMessage(from, {
          text: "🛡️ *No puedes expulsar a otro administrador.*",
          ...global.channelInfo
        });
      }

      await sock.groupParticipantsUpdate(from, [target], "remove");

      await sock.sendMessage(from, {
        text:
`✅ *Expulsado correctamente.*

👤 Usuario: @${target.split("@")[0]}`,
        mentions: [target],
        ...global.channelInfo
      });

    } catch (e) {
      await sock.sendMessage(from, {
        text:
`❌ *No pude expulsarlo.*

✅ Verifica:
• Que el bot sea *administrador*
• Que yo tenga permisos suficientes`,
        ...global.channelInfo
      });
    }
  }
};
