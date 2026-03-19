import { sendInteractiveMessage } from "../../lib/interactive-helper.js";

function formatUptime(seconds) {
  seconds = Math.floor(Number(seconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function getPrimaryPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }

  return String(settings?.prefix || ".").trim() || ".";
}

function buildCategoryMap(comandos) {
  const categories = {};

  for (const cmd of new Set(comandos?.values?.() || [])) {
    if (!cmd?.category || !cmd?.command) continue;

    const category = String(cmd.category || "").trim().toLowerCase();
    const commandName = cmd.name || (Array.isArray(cmd.command) ? cmd.command[0] : cmd.command);
    if (!category || !commandName) continue;

    if (!categories[category]) categories[category] = new Set();
    categories[category].add(String(commandName || "").trim().toLowerCase());
  }

  return categories;
}

function buildRows(categories, prefix) {
  const rows = [
    {
      title: "Menu completo",
      description: "Mostrar todo el menu del bot",
      id: `${prefix}menu`,
    },
    {
      title: "Estado del bot",
      description: "Ver uptime y estado general",
      id: `${prefix}status`,
    },
    {
      title: "Ping",
      description: "Probar respuesta del bot",
      id: `${prefix}ping`,
    },
  ];

  for (const category of Object.keys(categories).sort()) {
    rows.push({
      title: `Categoria: ${category}`,
      description: `Ver comandos de ${category}`,
      id: `${prefix}menu ${category}`,
    });
  }

  return rows;
}

export default {
  name: "catalogoprueba",
  command: ["catalogoprueba", "catalogotest", "menulista"],
  category: "menu",
  description: "Prueba de catalogo native flow",

  run: async ({ sock, msg, from, settings, comandos }) => {
    try {
      if (typeof sendInteractiveMessage !== "function") {
        throw new Error("baileys_helper no esta disponible.");
      }

      const prefix = getPrimaryPrefix(settings);
      const uptime = formatUptime(process.uptime());
      const categories = buildCategoryMap(comandos);
      const rows = buildRows(categories, prefix);

      console.log(`CATALOGO PRUEBA SEND chat=${from} filas=${rows.length} media=false`);

      await sendInteractiveMessage(
        sock,
        from,
        {
          title: "MENU PRINCIPAL",
          text:
            "MENU PRINCIPAL\n" +
            "[ MENU ]\n" +
            "LABORATORIO DE COMANDOS\n" +
            `Bot: ${settings?.botName || "Fsociety bot"}\n` +
            `Hora: ${new Date().toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}\n` +
            `Uptime: ${uptime}\n\n` +
            "Elige una categoria",
          footer: "Fsociety bot",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Categorias",
                sections: [
                  {
                    title: "Comandos",
                    rows,
                  },
                ],
              }),
            },
          ],
        },
        {
          quoted: msg,
        }
      );

      console.log(`CATALOGO PRUEBA OK chat=${from}`);
    } catch (error) {
      console.error("CATALOGO PRUEBA ERROR:", error);
      await sock.sendMessage(
        from,
        {
          text: `No pude abrir el catalogo de prueba.\n\n${error?.message || error}`,
        },
        { quoted: msg }
      );
    }
  },
};
