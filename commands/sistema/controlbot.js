import fs from "fs";
import path from "path";

const DB_DIR = path.join(process.cwd(), "database");
const BOT_OFF_FILE = path.join(DB_DIR, "botoff_groups.json");
const ANTI_PRIVATE_FILE = path.join(DB_DIR, "antiprivado.json");

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    return fallback;
  }
}

function loadSet(filePath) {
  try {
    if (!fs.existsSync(filePath)) return new Set();
    const parsed = safeParse(fs.readFileSync(filePath, "utf-8"), []);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function loadObject(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return safeParse(fs.readFileSync(filePath, "utf-8"), {});
  } catch {
    return {};
  }
}

function getPrefixes(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
  }

  const single = String(settings?.prefix || ".").trim();
  return single ? [single] : ["."];
}

function getPrimaryPrefix(settings) {
  return getPrefixes(settings)[0] || ".";
}

function buildSections({ prefix, isGroup, canManageGroup, isOwner }) {
  const sections = [];

  if (isGroup) {
    sections.push({
      title: "Control Bot en Grupo",
      rows: [
        {
          header: "ESTADO",
          title: "Ver estado del bot en grupo",
          description: "Muestra si el bot esta ON/OFF en este grupo.",
          id: `${prefix}botgrupo estado`,
        },
        ...(canManageGroup
          ? [
              {
                header: "ON",
                title: "Prender bot en este grupo",
                description: "Permite respuestas en este grupo.",
                id: `${prefix}botgrupo on`,
              },
              {
                header: "OFF",
                title: "Apagar bot en este grupo",
                description: "Bloquea respuestas en este grupo.",
                id: `${prefix}botgrupo off`,
              },
            ]
          : []),
      ],
    });
  }

  sections.push({
    title: "Control Privado",
    rows: [
      {
        header: "ESTADO",
        title: "Ver estado antiprivado",
        description: "Muestra si el modo antiprivado esta activo.",
        id: `${prefix}antiprivado estado`,
      },
      ...(isOwner
        ? [
            {
              header: "ON",
              title: "Activar antiprivado",
              description: "Solo owner recibe respuestas por privado.",
              id: `${prefix}antiprivado on`,
            },
            {
              header: "OFF",
              title: "Desactivar antiprivado",
              description: "Permite privados para todos.",
              id: `${prefix}antiprivado off`,
            },
          ]
        : []),
    ],
  });

  return sections;
}

export default {
  name: "controlbot",
  command: ["controlbot", "panelbot", "botpanel"],
  category: "sistema",
  description: "Panel central para botgrupo y antiprivado.",

  run: async ({ sock, msg, from, isGroup, esAdmin, esOwner, settings }) => {
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const prefix = getPrimaryPrefix(settings);
    const botOffGroups = loadSet(BOT_OFF_FILE);
    const antiPrivate = loadObject(ANTI_PRIVATE_FILE);
    const botOff = isGroup ? botOffGroups.has(from) : false;
    const antiPrivateOn = Boolean(antiPrivate?.enabled);
    const canManageGroup = Boolean(isGroup && (esAdmin || esOwner));

    const statusText =
      `🧭 *PANEL DE CONTROL BOT*\n\n` +
      `• BotGrupo: *${isGroup ? (botOff ? "OFF 🔴" : "ON 🟢") : "N/A (chat privado)"}*\n` +
      `• Antiprivado: *${antiPrivateOn ? "ON ✅" : "OFF ❌"}*\n\n` +
      `Accesos directos:\n` +
      `• *${prefix}botgrupo*\n` +
      `• *${prefix}antiprivado*\n\n` +
      `${isGroup ? (canManageGroup ? "Puedes gestionar el bot de este grupo desde la lista." : "Solo admin/owner puede cambiar el estado del bot en grupo.") : "En privado puedes gestionar antiprivado (owner)."}`;

    const sections = buildSections({
      prefix,
      isGroup: Boolean(isGroup),
      canManageGroup,
      isOwner: Boolean(esOwner),
    });

    return sock.sendMessage(
      from,
      {
        text: statusText,
        title: "FSOCIETY BOT",
        subtitle: "Panel de control",
        footer: "Selecciona una accion",
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Abrir opciones",
              sections,
            }),
          },
        ],
        ...global.channelInfo,
      },
      quoted
    );
  },
};
