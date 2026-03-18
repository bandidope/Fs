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

    if (!categories[category]) {
      categories[category] = new Set();
    }

    categories[category].add(String(commandName || "").trim().toLowerCase());
  }

  return categories;
}

export default {
  name: "catalogook",
  command: ["catalogook"],
  category: "menu",
  description: "Respuesta de prueba del catalogo interactivo",

  run: async ({ sock, msg, from, args = [], settings, comandos }) => {
    const prefix = getPrimaryPrefix(settings);
    const category = String(args[0] || "").trim().toLowerCase();
    const categories = buildCategoryMap(comandos);

    if (!category || !categories[category]) {
      return sock.sendMessage(
        from,
        {
          text:
            `Catalogo funcionando correctamente.\n\n` +
            `Usa ${prefix}catalogoprueba y elige una categoria para probar.`,
        },
        { quoted: msg }
      );
    }

    const commands = Array.from(categories[category]).sort();
    return sock.sendMessage(
      from,
      {
        text:
          `Categoria: ${category}\n\n` +
          commands.map((name) => `• ${prefix}${name}`).join("\n"),
      },
      { quoted: msg }
    );
  },
};
