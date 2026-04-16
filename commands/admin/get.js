import vm from "vm";

function cleanText(value = "") {
  return String(value || "").trim();
}

async function react(sock, msg, emoji) {
  try {
    if (!msg?.key) return;
    await sock.sendMessage(msg.key.remoteJid, {
      react: {
        text: emoji,
        key: msg.key,
      },
    });
  } catch {}
}

export default {
  command: ["get"],
  categoria: "owner",
  description: "Valida código JS sin ejecutarlo",
  isOwner: true,

  run: async ({ sock, msg, from, args }) => {
    try {
      const code = cleanText(Array.isArray(args) ? args.join(" ") : "");

      if (!code) {
        return await sock.sendMessage(
          from,
          {
            text: [
              "Usa:",
              ".get const x = 2 + 2;",
              ".get export default { command: ['ping'] }",
            ].join("\n"),
          },
          { quoted: msg }
        );
      }

      await react(sock, msg, "🧪");

      let script = null;
      let mode = "script";

      try {
        script = new vm.Script(code, { filename: "user-code.js" });
      } catch {
        const wrapped = `(async () => { ${code} })()`;
        script = new vm.Script(wrapped, { filename: "user-code.js" });
        mode = "wrapped";
      }

      const lines = code.split("\n").length;
      const chars = code.length;

      await react(sock, msg, "✅");
      return await sock.sendMessage(
        from,
        {
          text: [
            "✅ Código válido",
            `Modo: ${mode}`,
            `Líneas: ${lines}`,
            `Caracteres: ${chars}`,
            "",
            "No se ejecutó, solo se validó la sintaxis.",
          ].join("\n"),
        },
        { quoted: msg }
      );
    } catch (error) {
      await react(sock, msg, "❌");
      return await sock.sendMessage(
        from,
        {
          text: `❌ Error de sintaxis:\n${error?.message || String(error)}`,
        },
        { quoted: msg }
      );
    }
  },
};