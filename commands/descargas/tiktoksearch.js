import { searchTikTokVideos } from "./_searchFallbacks.js";
import { chargeDownloadRequest, refundDownloadCharge } from "../economia/download-access.js";

const RESULT_LIMIT = 4;
const DEFAULT_CAROUSEL_COVER = "https://telegra.ph/file/24b24c495b5384b218b2f.jpg";

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

function compactNumber(value = 0) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.floor(n));
}

function formatDurationSeconds(value = 0) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "N/D";
  if (seconds < 60) return `${Math.floor(seconds)} segundos`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.floor(seconds % 60);
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

function normalizeRegion(value = "") {
  const region = String(value || "").trim().toUpperCase();
  return region || "N/D";
}

function buildTikTokPublicUrl(item = {}) {
  const author = String(item?.author || "").replace(/^@/, "").trim();
  const id = String(item?.id || "").trim();
  if (!author || !id) return "";
  return `https://www.tiktok.com/@${author}/video/${id}`;
}

function buildResultRows(results, prefix) {
  return results.map((item, index) => {
    const title = clipText(item?.title || "Video TikTok", 70);
    const author = String(item?.author || "usuario").replace(/^@/, "");
    const views = compactNumber(item?.stats?.views || 0);
    const play = String(item?.play || "").trim();

    return {
      header: `${index + 1}`,
      title,
      description: clipText(`@${author} | 👁️ ${views}`, 72),
      id: `${prefix}tiktok ${play}`,
    };
  });
}

function buildSections(results, prefix) {
  return [
    {
      title: "Resultados TikTok",
      rows: buildResultRows(results, prefix),
    },
  ];
}

function buildCardButtons(item, prefix) {
  const play = String(item?.play || "").trim();
  const publicUrl = buildTikTokPublicUrl(item) || play;
  const copyCode = play ? `${prefix}tiktok ${play}` : publicUrl;

  return [
    {
      name: "cta_copy",
      buttonParamsJson: JSON.stringify({
        display_text: "Copy",
        copy_code: copyCode,
      }),
    },
  ];
}

function buildDetailedCardBody(item, index, query) {
  const title = clipText(item?.title || "Sin titulo", 220);
  const author = String(item?.author || "usuario").replace(/^@/, "");
  const likes = Number(item?.stats?.likes || 0);
  const comments = Number(item?.stats?.comments || 0);
  const shares = Number(item?.stats?.shares || 0);
  const views = Number(item?.stats?.views || 0);
  const duration = formatDurationSeconds(item?.durationSeconds || 0);
  const region = normalizeRegion(item?.region || "");
  const publicUrl = buildTikTokPublicUrl(item) || String(item?.play || "").trim() || "N/D";

  return (
    `Resultados para: ${clipText(query, 60)}\n` +
    `TikTok - Resultado\n` +
    `➠ Video: ${index + 1}\n` +
    `➠ Titulo: ${title}\n` +
    `➠ Duracion: ${duration}\n` +
    `➠ Region: ${region}\n` +
    `➠ Autor: ${author}\n` +
    `➠ Likes: ${likes}\n` +
    `➠ Comentarios: ${comments}\n` +
    `➠ Shares: ${shares}\n` +
    `➠ Reproducciones: ${views}\n` +
    `➠ URL: ${publicUrl}\n\n` +
    `Usa el boton para descargar/ver`
  );
}

function buildCarouselCards(results, prefix, query, mode = "video") {
  return results.map((item, index) => {
    const play = String(item?.play || "").trim();
    const cover = String(item?.cover || "").trim() || DEFAULT_CAROUSEL_COVER;
    const mediaPayload =
      mode === "video" && play
        ? { video: { url: play } }
        : { image: { url: cover } };

    return {
      ...mediaPayload,
      title: "TikTok - Resultado",
      body: buildDetailedCardBody(item, index, query),
      footer: "FSOCIETY BOT",
      buttons: buildCardButtons(item, prefix),
    };
  });
}

async function sendCarouselResults(sock, from, quoted, query, results, prefix) {
  const basePayload = {
    text: "TikTok-Buscador ««┐",
    footer: `Resultados para: ${clipText(query, 80)}`,
    title: "FSOCIETY BOT",
    ...global.channelInfo,
  };

  try {
    const videoCards = buildCarouselCards(results, prefix, query, "video");
    await sock.sendMessage(
      from,
      {
        ...basePayload,
        cards: videoCards,
      },
      quoted
    );
    return;
  } catch (videoError) {
    console.error("ttsearch video carousel fallback:", videoError?.message || videoError);
  }

  const imageCards = buildCarouselCards(results, prefix, query, "image");
  await sock.sendMessage(
    from,
    {
      ...basePayload,
      cards: imageCards,
    },
    quoted
  );
}

async function sendFallbackResults(sock, from, quoted, query, results, prefix) {
  const sections = buildSections(results, prefix);

  await sock.sendMessage(
    from,
    {
      text: `Resultados para: ${clipText(query, 80)}`,
      title: "TikTok Search",
      subtitle: "Selecciona un video",
      footer: "FSOCIETY BOT",
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Ver resultados",
            sections,
          }),
        },
      ],
      ...global.channelInfo,
    },
    quoted
  );
}

export default {
  name: "ttsearch",
  command: ["ttsearch", "ttksearch", "tts", "tiktoksearch"],
  category: "descarga",
  description: "Busca videos de TikTok y envia carrusel de videos",

  run: async (ctx) => {
    const { sock, msg, from, args, settings } = ctx;
    const q = args.join(" ").trim();
    const prefix = getPrefix(settings);

    if (!q) {
      return sock.sendMessage(
        from,
        {
          text: `Uso:\n${prefix}ttksearch <texto>\nEj: ${prefix}ttsearch edit goku`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    let downloadCharge = null;

    try {
      const results = await searchTikTokVideos(q, RESULT_LIMIT);

      if (!results.length) {
        return sock.sendMessage(
          from,
          {
            text: "No encontre resultados de TikTok.",
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      downloadCharge = await chargeDownloadRequest(ctx, {
        commandName: "tiktoksearch",
        query: q,
        totalResults: results.length,
      });

      if (!downloadCharge.ok) {
        return null;
      }

      try {
        await sendCarouselResults(sock, from, { quoted: msg }, q, results, prefix);
      } catch (carouselError) {
        console.error("ttsearch carousel fallback:", carouselError?.message || carouselError);
        await sendFallbackResults(sock, from, { quoted: msg }, q, results, prefix);
      }
    } catch (error) {
      console.error("Error ejecutando ttsearch:", error?.message || error);
      refundDownloadCharge(ctx, downloadCharge, {
        commandName: "tiktoksearch",
        reason: error?.message || "search_error",
      });

      await sock.sendMessage(
        from,
        {
          text: "Error obteniendo videos de TikTok.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }
  },
};
