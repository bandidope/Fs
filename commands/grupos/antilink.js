import fs from "fs";
import path from "path";
import {
  getParticipantDisplayTag,
  getParticipantMentionJid,
  runGroupParticipantAction,
} from "../../lib/group-compat.js";

const DB_DIR = path.join(process.cwd(), "database");
const FILE = path.join(DB_DIR, "antilink.json");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function normalizeDomain(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    return null;
  }
}

function normalizeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const hasTypedFlags =
    Object.prototype.hasOwnProperty.call(source, "blockWhatsappGroups") ||
    Object.prototype.hasOwnProperty.call(source, "blockWhatsappChannels") ||
    Object.prototype.hasOwnProperty.call(source, "blockOtherLinks");
  const allowWhatsappLegacy = source.allowWhatsapp !== false;

  return {
    enabled: source.enabled === true,
    mode: String(source.mode || "kick").trim().toLowerCase() === "delete" ? "delete" : "kick",
    allowWhatsapp: allowWhatsappLegacy,
    blockWhatsappGroups: hasTypedFlags
      ? source.blockWhatsappGroups !== false
      : !allowWhatsappLegacy,
    blockWhatsappChannels: hasTypedFlags
      ? source.blockWhatsappChannels !== false
      : !allowWhatsappLegacy,
    blockOtherLinks: source.blockOtherLinks !== false,
    whitelist: Array.isArray(source.whitelist)
      ? source.whitelist.map((item) => normalizeDomain(item)).filter(Boolean)
      : [],
  };
}

function loadStore() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = safeParse(raw);

    if (Array.isArray(data)) {
      return Object.fromEntries(
        data.map((groupId) => [String(groupId), normalizeConfig({ enabled: true })])
      );
    }

    if (!data || typeof data !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(data).map(([groupId, config]) => [groupId, normalizeConfig(config)])
    );
  } catch {
    return {};
  }
}

function saveStore() {
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

function getGroupConfig(groupId) {
  const key = String(groupId || "").trim();
  if (!store[key]) {
    store[key] = normalizeConfig();
  } else {
    store[key] = normalizeConfig(store[key]);
  }
  return store[key];
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

function extractLinks(text = "") {
  const matches = String(text || "").match(
    /((?:https?:\/\/|www\.)[^\s]+|chat\.whatsapp\.com\/[^\s]+|whatsapp\.com\/channel\/[^\s]+|wa\.me\/[^\s]+)/gi
  );

  return (matches || []).map((value) => {
    const raw = String(value || "").trim();
    const normalized = normalizeDomain(raw);
    const lowerRaw = raw.toLowerCase();
    const isWhatsappGroup =
      lowerRaw.includes("chat.whatsapp.com/") || normalized.includes("chat.whatsapp.com");
    const isWhatsappChannel = lowerRaw.includes("whatsapp.com/channel/");
    const linkType = isWhatsappGroup
      ? "wa_group"
      : isWhatsappChannel
        ? "wa_channel"
        : "other";

    return {
      raw,
      domain: normalized,
      type: linkType,
    };
  });
}

function isTypeBlocked(link, config) {
  if (link?.type === "wa_group") return config.blockWhatsappGroups === true;
  if (link?.type === "wa_channel") return config.blockWhatsappChannels === true;
  return config.blockOtherLinks === true;
}

function isAllowedLink(link, config = {}) {
  if (!link?.domain) return true;
  if (!isTypeBlocked(link, config)) return true;
  return config.whitelist.some(
    (domain) => link.domain === domain || link.domain.endsWith(`.${domain}`)
  );
}

function formatToggle(value) {
  return value ? "BLOQUEADO 🚫" : "PERMITIDO ✅";
}

function parseToggle(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["on", "activar", "bloquear", "1", "si"].includes(normalized)) return true;
  if (["off", "desactivar", "permitir", "0", "no"].includes(normalized)) return false;
  if (["toggle", "cambiar", "switch"].includes(normalized)) return null;
  return undefined;
}

function resolveFilterTarget(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["grupo", "grupos", "group", "groups", "wa", "whatsapp"].includes(normalized)) {
    return "groups";
  }
  if (["canal", "canales", "channel", "channels", "wachannel", "wacanal"].includes(normalized)) {
    return "channels";
  }
  if (["otros", "other", "others", "externos", "links", "enlaces"].includes(normalized)) {
    return "others";
  }
  return "";
}

let store = loadStore();

export default {
  name: "antilink",
  command: ["antilink"],
  groupOnly: true,
  adminOnly: true,
  category: "grupo",
  description: "Protege grupos contra links con whitelist y modos configurables",

  async run({ sock, from, args = [], msg, settings }) {
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const config = getGroupConfig(from);
    const prefix = getPrimaryPrefix(settings);
    const action = String(args[0] || "status").trim().toLowerCase();
    const value = String(args.slice(1).join(" ") || "").trim();

    if (!args.length || ["status", "estado"].includes(action)) {
      return sock.sendMessage(
        from,
        {
          text:
            `*ANTILINK*\n\n` +
            `Estado: *${config.enabled ? "ON" : "OFF"}*\n` +
            `Modo: *${config.mode.toUpperCase()}*\n` +
            `Grupos WhatsApp: *${formatToggle(config.blockWhatsappGroups)}*\n` +
            `Canales WhatsApp: *${formatToggle(config.blockWhatsappChannels)}*\n` +
            `Otros enlaces: *${formatToggle(config.blockOtherLinks)}*\n` +
            `Whitelist: ${config.whitelist.length ? config.whitelist.join(", ") : "vacia"}\n\n` +
            `Uso:\n` +
            `${prefix}antilink on\n` +
            `${prefix}antilink off\n` +
            `${prefix}antilink mode delete\n` +
            `${prefix}antilink mode kick\n` +
            `${prefix}antilink tipo grupos on|off\n` +
            `${prefix}antilink tipo canales on|off\n` +
            `${prefix}antilink tipo otros on|off\n` +
            `${prefix}antilink allow youtube.com\n` +
            `${prefix}antilink remove youtube.com\n` +
            `${prefix}antilink list`,
          footer: "Selecciona desde el panel para cambiar rapido",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Panel AntiLink",
                sections: [
                  {
                    title: "Estado general",
                    rows: [
                      {
                        header: "ON",
                        title: "Activar AntiLink",
                        description: "Enciende proteccion de enlaces.",
                        id: `${prefix}antilink on`,
                      },
                      {
                        header: "OFF",
                        title: "Desactivar AntiLink",
                        description: "Apaga proteccion de enlaces.",
                        id: `${prefix}antilink off`,
                      },
                    ],
                  },
                  {
                    title: "Sancion",
                    rows: [
                      {
                        header: "DELETE",
                        title: "Modo borrar mensaje",
                        description: "Borra el mensaje con enlace.",
                        id: `${prefix}antilink mode delete`,
                      },
                      {
                        header: "KICK",
                        title: "Modo expulsar usuario",
                        description: "Expulsa si bot es admin.",
                        id: `${prefix}antilink mode kick`,
                      },
                    ],
                  },
                  {
                    title: "Tipos de enlace",
                    rows: [
                      {
                        header: "WA GRUPOS",
                        title: config.blockWhatsappGroups
                          ? "Permitir enlaces de grupos WhatsApp"
                          : "Bloquear enlaces de grupos WhatsApp",
                        description: config.blockWhatsappGroups
                          ? "Actualmente: bloqueado"
                          : "Actualmente: permitido",
                        id: `${prefix}antilink tipo grupos ${config.blockWhatsappGroups ? "off" : "on"}`,
                      },
                      {
                        header: "WA CANALES",
                        title: config.blockWhatsappChannels
                          ? "Permitir enlaces de canales WhatsApp"
                          : "Bloquear enlaces de canales WhatsApp",
                        description: config.blockWhatsappChannels
                          ? "Actualmente: bloqueado"
                          : "Actualmente: permitido",
                        id: `${prefix}antilink tipo canales ${config.blockWhatsappChannels ? "off" : "on"}`,
                      },
                      {
                        header: "OTROS LINKS",
                        title: config.blockOtherLinks
                          ? "Permitir otros enlaces"
                          : "Bloquear otros enlaces",
                        description: config.blockOtherLinks
                          ? "Actualmente: bloqueado"
                          : "Actualmente: permitido",
                        id: `${prefix}antilink tipo otros ${config.blockOtherLinks ? "off" : "on"}`,
                      },
                    ],
                  },
                ],
              }),
            },
          ],
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "on") {
      config.enabled = true;
      saveStore();
      return sock.sendMessage(
        from,
        {
          text: "Anti-link activado para este grupo.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "off") {
      config.enabled = false;
      saveStore();
      return sock.sendMessage(
        from,
        {
          text: "Anti-link desactivado para este grupo.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "mode") {
      const mode = String(args[1] || "").trim().toLowerCase();
      if (!["delete", "kick"].includes(mode)) {
        return sock.sendMessage(
          from,
          {
            text: "Usa: .antilink mode delete o .antilink mode kick",
            ...global.channelInfo,
          },
          quoted
        );
      }

      config.mode = mode;
      saveStore();
      return sock.sendMessage(
        from,
        {
          text: `Modo anti-link actualizado a *${mode.toUpperCase()}*.`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "allow") {
      const target = String(args[1] || "").trim().toLowerCase();
      if (target === "whatsapp" || target === "wa") {
        config.allowWhatsapp = true;
        config.blockWhatsappGroups = false;
        config.blockWhatsappChannels = false;
        saveStore();
        return sock.sendMessage(
          from,
          {
            text: "Los enlaces de WhatsApp (grupos y canales) quedaron permitidos.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      const domain = normalizeDomain(value);
      if (!domain) {
        return sock.sendMessage(
          from,
          {
            text: "Usa: .antilink allow dominio.com",
            ...global.channelInfo,
          },
          quoted
        );
      }

      if (!config.whitelist.includes(domain)) {
        config.whitelist.push(domain);
        config.whitelist.sort();
        saveStore();
      }

      return sock.sendMessage(
        from,
        {
          text: `Dominio permitido: *${domain}*`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "deny") {
      const target = String(args[1] || "").trim().toLowerCase();
      if (target === "whatsapp" || target === "wa") {
        config.allowWhatsapp = false;
        config.blockWhatsappGroups = true;
        config.blockWhatsappChannels = true;
        saveStore();
        return sock.sendMessage(
          from,
          {
            text: "Los enlaces de WhatsApp (grupos y canales) quedaron bloqueados.",
            ...global.channelInfo,
          },
          quoted
        );
      }
    }

    if (action === "tipo" || action === "filtro" || action === "filtros") {
      const target = resolveFilterTarget(args[1]);
      const toggle = parseToggle(args[2]);

      if (!target) {
        return sock.sendMessage(
          from,
          {
            text:
              `Usa:\n` +
              `${prefix}antilink tipo grupos on|off\n` +
              `${prefix}antilink tipo canales on|off\n` +
              `${prefix}antilink tipo otros on|off`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      if (toggle === undefined) {
        return sock.sendMessage(
          from,
          {
            text: "Usa: on o off",
            ...global.channelInfo,
          },
          quoted
        );
      }

      if (target === "groups") {
        config.blockWhatsappGroups = toggle === null ? !config.blockWhatsappGroups : toggle;
        config.allowWhatsapp = !(config.blockWhatsappGroups || config.blockWhatsappChannels);
        saveStore();
        return sock.sendMessage(
          from,
          {
            text: `Grupos de WhatsApp: *${formatToggle(config.blockWhatsappGroups)}*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      if (target === "channels") {
        config.blockWhatsappChannels = toggle === null ? !config.blockWhatsappChannels : toggle;
        config.allowWhatsapp = !(config.blockWhatsappGroups || config.blockWhatsappChannels);
        saveStore();
        return sock.sendMessage(
          from,
          {
            text: `Canales de WhatsApp: *${formatToggle(config.blockWhatsappChannels)}*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      config.blockOtherLinks = toggle === null ? !config.blockOtherLinks : toggle;
      saveStore();
      return sock.sendMessage(
        from,
        {
          text: `Otros enlaces: *${formatToggle(config.blockOtherLinks)}*`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    // Alias cortos para filtros:
    if (["grupos", "grupo", "canales", "canal", "otros", "other"].includes(action)) {
      const target =
        action.startsWith("grupo") ? "groups" : action.startsWith("canal") ? "channels" : "others";
      const toggle = parseToggle(args[1]);

      if (toggle === undefined) {
        return sock.sendMessage(
          from,
          {
            text: "Usa: on o off",
            ...global.channelInfo,
          },
          quoted
        );
      }

      if (target === "groups") {
        config.blockWhatsappGroups = toggle === null ? !config.blockWhatsappGroups : toggle;
        config.allowWhatsapp = !(config.blockWhatsappGroups || config.blockWhatsappChannels);
        saveStore();
        return sock.sendMessage(
          from,
          {
            text: `Grupos de WhatsApp: *${formatToggle(config.blockWhatsappGroups)}*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      if (target === "channels") {
        config.blockWhatsappChannels = toggle === null ? !config.blockWhatsappChannels : toggle;
        config.allowWhatsapp = !(config.blockWhatsappGroups || config.blockWhatsappChannels);
        saveStore();
        return sock.sendMessage(
          from,
          {
            text: `Canales de WhatsApp: *${formatToggle(config.blockWhatsappChannels)}*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      config.blockOtherLinks = toggle === null ? !config.blockOtherLinks : toggle;
      saveStore();
      return sock.sendMessage(
        from,
        {
          text: `Otros enlaces: *${formatToggle(config.blockOtherLinks)}*`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "remove" || action === "del") {
      const domain = normalizeDomain(value);
      if (!domain) {
        return sock.sendMessage(
          from,
          {
            text: "Usa: .antilink remove dominio.com",
            ...global.channelInfo,
          },
          quoted
        );
      }

      config.whitelist = config.whitelist.filter((item) => item !== domain);
      saveStore();
      return sock.sendMessage(
        from,
        {
          text: `Dominio removido de la whitelist: *${domain}*`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "list") {
      return sock.sendMessage(
        from,
        {
          text:
            `*WHITELIST ANTILINK*\n\n` +
            `${config.whitelist.length ? config.whitelist.map((item) => `• ${item}`).join("\n") : "Sin dominios permitidos."}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    return sock.sendMessage(
      from,
      {
        text: "Opcion invalida. Usa .antilink status para ver la ayuda.",
        ...global.channelInfo,
      },
      quoted
    );
  },

  async onMessage({ sock, msg, from, esGrupo, esAdmin, esOwner, esBotAdmin, groupMetadata }) {
    if (!esGrupo) return;

    const config = getGroupConfig(from);
    if (!config.enabled) return;

    const texto =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption;

    if (!texto) return;
    if (esAdmin || esOwner) return;

    const links = extractLinks(texto);
    const blockedLink = links.find((link) => !isAllowedLink(link, config));

    if (!blockedLink) return;

    const sender = msg.sender || msg.key?.participant;
    if (!sender) return;
    const mentionJid = getParticipantMentionJid(groupMetadata || {}, null, sender);

    try {
      await sock.sendMessage(from, { delete: msg.key, ...global.channelInfo });
    } catch {}

    if (config.mode === "kick" && esBotAdmin) {
      try {
        const removeResult = await runGroupParticipantAction(
          sock,
          from,
          groupMetadata || {},
          null,
          [sender],
          "remove"
        );
        if (!removeResult.ok) {
          throw removeResult.error || new Error("No pude expulsar al usuario.");
        }

        await sock.sendMessage(from, {
          text:
            `Enlace bloqueado: *${blockedLink.domain || blockedLink.raw}*\n` +
            `${getParticipantDisplayTag(null, sender)} expulsado automaticamente.`,
          mentions: mentionJid ? [mentionJid] : [],
          ...global.channelInfo,
        });
        return;
      } catch {}
    }

    await sock.sendMessage(from, {
      text:
        `Enlace bloqueado: *${blockedLink.domain || blockedLink.raw}*.\n` +
        (config.mode === "kick"
          ? "No pude expulsar al usuario, asi que solo borre el mensaje."
          : "El mensaje fue eliminado por anti-link."),
      ...global.channelInfo,
    });
  },
};
