import { buildDvyerUrl } from "../../lib/api-manager.js";

const RESULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 20000;

function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }
  return String(settings?.prefix || ".").trim() || ".";
}

function clipText(value = "", max = 72) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 3))}...`;
}

function buildApiUrl(endpoint, params = {}) {
  const url = new URL(buildDvyerUrl(endpoint));
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
    if (!res.ok) {
      const detail = data?.detail || data?.error || text || res.statusText;
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo descargar imagen.");
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function onlyLatino(items = []) {
  return items.filter((item) => String(item?.language || "").toLowerCase().includes("lat"));
}

function buildSearchRows(results, prefix) {
  return results.map((item, idx) => ({
    header: `${idx + 1}`,
    title: clipText(item.title || "Sin titulo", 72),
    description: clipText(
      `${String(item.type || "contenido").toUpperCase()} | ${item.slug || "sin slug"}`,
      72
    ),
    id: `${prefix}cuevanadl ${item.slug} ${item.type || "auto"}`,
  }));
}

function buildEpisodeRows(detail, prefix, maxRows = 40) {
  const rows = [];
  const seasons = Array.isArray(detail?.seasons) ? detail.seasons : [];
  for (const season of seasons) {
    const seasonNumber = season?.number || "?";
    const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
    for (const episode of episodes) {
      const episodeSlug = String(episode?.episode_path || "").trim().split("/").pop();
      if (!episodeSlug) continue;
      const episodeNumber = episode?.episode || "?";
      rows.push({
        header: `T${seasonNumber}E${episodeNumber}`,
        title: clipText(episode?.title || `Episodio ${episodeNumber}`, 72),
        description: clipText(`Serie | Temporada ${seasonNumber}`, 72),
        id: `${prefix}cuevanadl ${episodeSlug} episode`,
      });
      if (rows.length >= maxRows) return rows;
    }
  }
  return rows;
}

function buildServerRows(downloadsAll, directUrl, prefix) {
  const rows = [];
  if (directUrl) {
    rows.push({
      header: "FAST",
      title: "Descarga rapida (Latino)",
      description: "Servidor mas rapido",
      id: `${prefix}cuevanalink ${directUrl}`,
    });
  }

  const latino = onlyLatino(downloadsAll);
  const list = latino.length ? latino : downloadsAll;
  list.forEach((item) => {
    rows.push({
      header: `#${item.index || rows.length + 1}`,
      title: clipText(item.server || "Servidor", 72),
      description: clipText(`${item.language || "Idioma"} | ${item.quality || "Calidad"}`, 72),
      id: `${prefix}cuevanalink ${item.url}`,
    });
  });
  return rows;
}

export default {
  name: "cuevana",
  command: ["cuevana", "cuevanadl", "cuevanalink", "cv"],
  category: "descarga",
  description: "Busca en Cuevana y muestra botones para descargar",

  async run(ctx) {
    const { sock: conn, m, msg, from, args, settings, commandName } = ctx;
    const quoted = (m || msg)?.key ? { quoted: m || msg } : undefined;
    const prefix = getPrefix(settings);
    const cmd = String(commandName || "").toLowerCase();

    if (cmd === "cuevanalink") {
      const rawUrl = String(args.join(" ") || "").trim();
      if (!rawUrl) {
        return conn.sendMessage(
          from,
          { text: `Uso: ${prefix}cuevanalink <url>` },
          quoted
        );
      }
      const apiLink = buildApiUrl("/cuevana/download", { url: rawUrl, lang: "lat" });
      return conn.sendMessage(
        from,
        {
          text:
            `*FSOCIETY BOT*\n\n` +
            `Enlace directo de descarga:\n${apiLink}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (cmd === "cuevanadl") {
      const target = String(args[0] || "").trim();
      const type = String(args[1] || "auto").trim().toLowerCase();
      if (!target) {
        return conn.sendMessage(
          from,
          { text: `Uso: ${prefix}cuevanadl <slug> <movie|series|episode>` },
          quoted
        );
      }

      const params = { mode: "detail", lang: "lat", pick: "fast", type };
      if (/^https?:\/\//i.test(target)) params.url = target;
      else params.slug = target;

      const apiUrl = buildApiUrl("/cuevana", params);
      const data = await fetchJson(apiUrl);

      if (!data?.ok) {
        return conn.sendMessage(
          from,
          { text: "No pude obtener el detalle de Cuevana.", ...global.channelInfo },
          quoted
        );
      }

      const contentType = String(data.content_type || data.detail?.type || "").toLowerCase();
      if (contentType === "series") {
        const rows = buildEpisodeRows(data.detail, prefix);
        if (!rows.length) {
          return conn.sendMessage(
            from,
            {
              text: "No encontre episodios para esta serie.",
              ...global.channelInfo,
            },
            quoted
          );
        }

        return conn.sendMessage(
          from,
          {
            text: `Episodios disponibles: ${clipText(data.title || "Serie", 80)}`,
            title: "FSOCIETY BOT",
            subtitle: "Selecciona episodio",
            footer: "Cuevana",
            interactiveButtons: [
              {
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                  title: "Ver episodios",
                  sections: [{ title: "Episodios", rows }],
                }),
              },
            ],
            ...global.channelInfo,
          },
          quoted
        );
      }

      const downloadsAll = Array.isArray(data.downloads_all) ? data.downloads_all : [];
      const rows = buildServerRows(downloadsAll, data.direct_url, prefix);
      if (!rows.length) {
        return conn.sendMessage(
          from,
          {
            text: "No encontre enlaces de descarga.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      return conn.sendMessage(
        from,
        {
          text: `Descargas para: ${clipText(data.title || "Contenido", 80)}`,
          title: "FSOCIETY BOT",
          subtitle: "Selecciona servidor",
          footer: "Cuevana",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Ver servidores",
                sections: [{ title: "Servidores (Latino)", rows }],
              }),
            },
          ],
          ...global.channelInfo,
        },
        quoted
      );
    }

    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    if (!query) {
      return conn.sendMessage(
        from,
        {
          text: `Uso:\n${prefix}cuevana <titulo>\nEj: ${prefix}cuevana mr robot`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    const apiUrl = buildApiUrl("/cuevana", { mode: "search", q: query, limit: RESULT_LIMIT });
    const data = await fetchJson(apiUrl);
    const results = Array.isArray(data?.results) ? data.results : [];

    if (!results.length) {
      return conn.sendMessage(
        from,
        { text: "No encontre resultados en Cuevana.", ...global.channelInfo },
        quoted
      );
    }

    let thumbBuffer = null;
    try {
      const thumbUrl = results[0]?.poster || results[0]?.backdrop;
      if (thumbUrl) {
        thumbBuffer = await downloadImageBuffer(thumbUrl);
      }
    } catch (error) {
      console.error("Cuevana thumb error:", error?.message || error);
    }

    const rows = buildSearchRows(results, prefix);
    const introPayload = thumbBuffer
      ? {
          image: thumbBuffer,
          caption:
            `*FSOCIETY BOT*\n\n` +
            `Resultado para: *${clipText(query, 80)}*\n` +
            `Primer resultado: *${clipText(results[0]?.title || "Sin titulo", 80)}*\n\n` +
            `Selecciona el contenido que quieres.`,
        }
      : {
        text:
          `*FSOCIETY BOT*\n\n` +
          `Resultado para: *${clipText(query, 80)}*\n\n` +
          `Selecciona el contenido que quieres.`,
      };

    await conn.sendMessage(
      from,
      {
        ...introPayload,
        ...global.channelInfo,
      },
      quoted
    );

    return conn.sendMessage(
      from,
      {
        text: `Resultados para: ${clipText(query, 80)}`,
        title: "FSOCIETY BOT",
        subtitle: "Selecciona contenido",
        footer: "Cuevana",
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Ver resultados",
              sections: [{ title: "Resultados", rows }],
            }),
          },
        ],
        ...global.channelInfo,
      },
      quoted
    );
  },
};
