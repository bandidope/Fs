export default {
  name: "subbot",
  category: "admin",
  ownerOnly: true,
  desc: "Gestiona subbots (multi-sesión): add/list/del",

  async run({ sock, from, args }) {
    const sub = (args[0] || "").toLowerCase();

    if (!global.subBots) {
      return sock.sendMessage(from, { text: "❌ Subbots no disponibles (reinicia el bot)." });
    }

    if (!sub || sub === "help") {
      return sock.sendMessage(from, {
        text:
          "👥 *SubBots (multi-sesión)*\n\n" +
          "• *.subbot add 519XXXXXXXX*  → crea subbot y devuelve código\n" +
          "• *.subbot list*            → lista subbots\n" +
          "• *.subbot del <id|numero>* → elimina subbot\n",
      });
    }

    if (sub === "list" || sub === "ls") {
      const list = global.subBots.list();
      if (!list.length) return sock.sendMessage(from, { text: "✅ No hay subbots registrados." });
      const lines = list.map((x, i) => `${i + 1}. *${x.id}* → ${x.numero}`);
      return sock.sendMessage(from, { text: "📌 *Subbots registrados:*\n\n" + lines.join("\n") });
    }

    if (sub === "add" || sub === "new" || sub === "crear") {
      const numero = args[1];
      if (!numero) return sock.sendMessage(from, { text: "⚠️ Uso: *.subbot add 519XXXXXXXX*" });

      try {
        const res = await global.subBots.add(numero);
        if (res.pairingCode) {
          return sock.sendMessage(from, {
            text:
              `✅ Subbot creado: *${res.id}*\n` +
              `📲 Número: *${res.numero}*\n\n` +
              `🔐 *CÓDIGO DE VINCULACIÓN*\n` +
              `*${res.pairingCode}*\n\n` +
              `WhatsApp > Dispositivos vinculados > Vincular con código`,
          });
        }
        return sock.sendMessage(from, { text: `✅ Subbot listo: *${res.id}* (ya estaba vinculado).` });
      } catch (e) {
        return sock.sendMessage(from, { text: `❌ Error creando subbot: ${e.message}` });
      }
    }

    if (sub === "del" || sub === "rm" || sub === "remove" || sub === "borrar") {
      const idOrNumero = args[1];
      if (!idOrNumero) return sock.sendMessage(from, { text: "⚠️ Uso: *.subbot del <id|numero>*" });

      const ok = await global.subBots.remove(idOrNumero);
      if (!ok) return sock.sendMessage(from, { text: "❌ No encontré ese subbot." });
      return sock.sendMessage(from, { text: "✅ Subbot eliminado." });
    }

    return sock.sendMessage(from, { text: "⚠️ Subcomando no válido. Usa *.subbot help*" });
  },
};
