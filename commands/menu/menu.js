import fs from "fs";
import path from "path";

// ⏱️ uptime bonito
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const CAT_ICON = {
  menu: "📜",
  music: "🎵",
  descarga: "📥",
  grupos: "👥",
  admin: "🛡️",
  juegos: "🎮",
  tools: "🧰",
  fun: "😄",
  default: "✨",
};

function norm(s) {
  return String(s || "").trim().toLowerCase();
}
function icon(cat) {
  return CAT_ICON[cat] || CAT_ICON.default;
}
function cut(str, max) {
  const s = String(str || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function buildCategories(comandos) {
  const categorias = new Map();
  for (const cmd of new Set(comandos.values())) {
    if (!cmd?.category || !cmd?.command) continue;

    const cat = norm(cmd.category) || "otros";
    const names = Array.isArray(cmd.command) ? cmd.command : [cmd.command];

    if (!categorias.has(cat)) categorias.set(cat, new Set());
    const set = categorias.get(cat);

    for (const n of names) {
      const name = norm(n);
      if (!name) continue;
      set.add(name);
    }
  }
  return categorias;
}

function buildTextMenu({ botName, prefix, uptime, categorias }) {
  const cats = [...categorias.keys()].sort();
  let totalCmds = 0;
  for (const set of categorias.values()) totalCmds += set.size;

  let out =
    `╭══════════════════════╮\n` +
    `│ ✦ *${botName}* ✦\n` +
    `╰══════════════════════╯\n\n` +
    `▸ _prefijo_ : *${prefix}*\n` +
    `▸ _estado_  : *online*\n` +
    `▸ _uptime_  : *${uptime}*\n` +
    `▸ _categorías_ : *${cats.length}*\n` +
    `▸ _comandos_   : *${totalCmds}*\n\n`;

  const MAX_PER_CAT = 6;
  for (const c of cats) {
    const cmds = [...categorias.get(c)].sort();
    out += `\n╭─ ${icon(c)} *${c.toUpperCase()}* _(${cmds.length})_\n│`;
    cmds.slice(0, MAX_PER_CAT).forEach(x => (out += `\n│  • \`${prefix}${x}\``));
    if (cmds.length > MAX_PER_CAT) out += `\n│  • … y *${cmds.length - MAX_PER_CAT}* más`;
    out += `\n╰──────────────────────`;
  }

  out += `\n\n💡 Usa: *${prefix}menu* (lista) o *${prefix}menu texto*\n`;
  return out;
}

// ✅ Enviar ListMessage clásico
async function sendClassicList(sock, from, { title, text, footer, buttonText, sections }, msg) {
  return sock.sendMessage(
    from,
    {
      listMessage: {
        title,
        description: text,      // 👈 algunos usan description
        footerText: footer,     // 👈 nombre clásico
        buttonText,
        sections,
      },
    },
    msg ? { quoted: msg } : undefined
  );
}

export default {
  command: ["menu"],
  category: "menu",
  description: "Menú interactivo premium (listas)",

  run: async ({ sock, msg, from, settings, comandos, args = [] }) => {
    try {
      if (!sock || !from) return;
      if (!comandos) {
        return sock.sendMessage(from, { text: "❌ error interno" }, { quoted: msg });
      }

      const botName = settings?.botName || "DVYER BOT";
      const prefix = settings?.prefix || ".";
      const uptime = formatUptime(process.uptime());

      const categorias = buildCategories(comandos);
      const catsSorted = [...categorias.keys()].sort();

      const firstArg = norm(args[0]);

      // ✅ Texto completo si lo piden
      if (firstArg === "texto" || firstArg === "text" || firstArg === "all") {
        const menuTxt = buildTextMenu({ botName, prefix, uptime, categorias });
        return sock.sendMessage(from, { text: menuTxt }, { quoted: msg });
      }

      // ✅ Si piden categoría => lista de comandos
      if (firstArg) {
        const cat = firstArg;
        if (!categorias.has(cat)) {
          return sock.sendMessage(
            from,
            {
              text:
                `⚠️ Categoría no encontrada: *${cat}*\n\n` +
                `Ejemplo: *${prefix}menu music*\n` +
                `O usa *${prefix}menu* para ver categorías.`,
            },
            { quoted: msg }
          );
        }

        const cmds = [...categorias.get(cat)].sort();

        const rows = cmds.slice(0, 40).map((c) => ({
          title: cut(`${prefix}${c}`, 24),
          description: cut(`Ejecutar ${prefix}${c}`, 72),
          rowId: `${prefix}${c}`, // al tocar, manda el comando al chat
        }));

        rows.push({
          title: cut("⬅️ Volver", 24),
          description: cut("Regresar al menú", 72),
          rowId: `${prefix}menu`,
        });

        rows.push({
          title: cut("📄 Menú texto", 24),
          description: cut("Ver menú en texto", 72),
          rowId: `${prefix}menu texto`,
        });

        const sections = [
          {
            title: `Comandos (${cmds.length})`,
            rows,
          },
        ];

        try {
          await sendClassicList(
            sock,
            from,
            {
              title: `${botName} — ${icon(cat)} ${cat.toUpperCase()}`,
              text: `⏱ Uptime: ${uptime}\nSelecciona un comando:`,
              footer: `Prefijo: ${prefix}`,
              buttonText: "Ver comandos",
              sections,
            },
            msg
          );
          return;
        } catch (e) {
          // fallback texto
          const fallback =
            `📂 *${cat.toUpperCase()}* (${cmds.length})\n\n` +
            cmds.map((x) => `• ${prefix}${x}`).join("\n") +
            `\n\n💡 Volver: ${prefix}menu`;
          return sock.sendMessage(from, { text: fallback }, { quoted: msg });
        }
      }

      // ✅ Menú principal por categorías
      const rows = catsSorted.slice(0, 45).map((c) => {
        const total = categorias.get(c)?.size || 0;
        return {
          title: cut(`${icon(c)} ${c.toUpperCase()}`, 24),
          description: cut(`Ver ${total} comandos`, 72),
          rowId: `${prefix}menu ${c}`, // manda ".menu music"
        };
      });

      rows.push({
        title: cut("📄 Menú texto", 24),
        description: cut("Ver menú completo en texto", 72),
        rowId: `${prefix}menu texto`,
      });

      const sections = [
        {
          title: "Categorías",
          rows,
        },
      ];

      try {
        await sendClassicList(
          sock,
          from,
          {
            title: `${botName} — Menú`,
            text: `⏱ Uptime: ${uptime}\nToca una categoría 👇`,
            footer: `Prefijo: ${prefix}`,
            buttonText: "Abrir categorías",
            sections,
          },
          msg
        );
      } catch (e) {
        // fallback texto
        const menuTxt = buildTextMenu({ botName, prefix, uptime, categorias });
        await sock.sendMessage(from, { text: menuTxt }, { quoted: msg });
      }
    } catch (err) {
      console.error("MENU ERROR:", err);
      await sock.sendMessage(from, { text: "❌ error al mostrar el menú" }, { quoted: msg });
    }
  },
};

