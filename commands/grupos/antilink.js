import fs from "fs";
import path from "path";

const DB_DIR = path.join(process.cwd(), "database");
const archivo = path.join(DB_DIR, "antilink.json");

let gruposProtegidos = new Set();

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

if (fs.existsSync(archivo)) {
  try {
    const raw = fs.readFileSync(archivo, "utf-8");
    const parsed = JSON.parse(raw);
    const data = typeof parsed === "string" ? JSON.parse(parsed) : parsed; // por si quedó "[]"
    gruposProtegidos = new Set(Array.isArray(data) ? data : []);
  } catch {
    gruposProtegidos = new Set();
  }
}

const guardar = () => fs.writeFileSync(archivo, JSON.stringify([...gruposProtegidos], null, 2));

export default {
  name: "antilink",
  command: ["antilink"],
  groupOnly: true,
  adminOnly: true,
  category: "grupo",

  async run({ sock, from, args, msg }) {
    const quoted = msg?.key ? { quoted: msg } : undefined;

    if (!args[0]) {
      return sock.sendMessage(
        from,
        { text: "⚙️ Uso:\n\n• .antilink on\n• .antilink off", ...global.channelInfo },
        quoted
      );
    }

    const opcion = args[0].toLowerCase();

    if (opcion === "on") {
      gruposProtegidos.add(from);
      guardar();
      return sock.sendMessage(
        from,
        { text: "🛡 Anti-link activado.\nLinks serán eliminados y el usuario expulsado.", ...global.channelInfo },
        quoted
      );
    }

    if (opcion === "off") {
      gruposProtegidos.delete(from);
      guardar();
      return sock.sendMessage(
        from,
        { text: "✅ Anti-link desactivado.", ...global.channelInfo },
        quoted
      );
    }

    return sock.sendMessage(from, { text: "❌ Opción inválida. Usa on/off.", ...global.channelInfo }, quoted);
  },

  async onMessage({ sock, msg, from, esGrupo, esAdmin, esOwner }) {
    if (!esGrupo) return;
    if (!gruposProtegidos.has(from)) return;

    const texto =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption;

    if (!texto) return;

    const contieneLink = /(https?:\/\/|www\.|chat\.whatsapp\.com)/gi.test(texto);
    if (!contieneLink) return;

    const sender = msg.key.participant;
    if (!sender) return;

    if (esAdmin || esOwner) return;

    try {
      await sock.sendMessage(from, { delete: msg.key, ...global.channelInfo });
      await sock.groupParticipantsUpdate(from, [sender], "remove");
      await sock.sendMessage(from, { text: "🚫 Enlace eliminado.\nUsuario expulsado automáticamente.", ...global.channelInfo });
    } catch (e) {
      console.log("Error antilink:", e?.message || e);
    }
  }
};
