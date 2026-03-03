import axios from "axios";

export default {
  name: "tiktokusuario",
  command: ["tiktokusuario", "ttuser", "ttperfil"],
  category: "descarga",
  desc: "Busca un usuario de TikTok y envía sus 3 primeros videos",

  run: async ({ sock, msg, from, args, settings }) => {

    const username = args.join(" ").replace("@", "").trim();

    if (!username) {
      return sock.sendMessage(
        from,
        {
          text: `╭─❍ *USO INCORRECTO* ❍\n│\n│ ✘ Ejemplo:\n│ ${settings.prefix}tiktokusuario goku\n│ ${settings.prefix}tiktokusuario @goku\n╰───────────────`,
          ...global.channelInfo
        },
        { quoted: msg }
      );
    }

    try {

      // API ejemplo (debes usar una que devuelva info de perfil + videos)
      const api = `https://nexevo.onrender.com/stalk/tiktok?username=${encodeURIComponent(username)}`;

      const { data } = await axios.get(api);

      if (!data?.status || !data?.result) {
        return sock.sendMessage(
          from,
          {
            text: "❌ No encontré ese usuario en TikTok.",
            ...global.channelInfo
          },
          { quoted: msg }
        );
      }

      const user = data.result.user;
      const videos = data.result.videos?.slice(0, 3);

      // 📌 Enviar info del perfil
      await sock.sendMessage(
        from,
        {
          image: { url: user.avatar },
          caption:
`╭━━〔 👤 PERFIL TIKTOK 〕━━⬣
┃ 🏷 Usuario: @${user.unique_id}
┃ 📛 Nombre: ${user.nickname}
┃ 👥 Seguidores: ${user.follower_count}
┃ 👤 Siguiendo: ${user.following_count}
┃ ❤️ Likes: ${user.total_favorited}
┃ 🎬 Videos: ${user.aweme_count}
╰━━━━━━━━━━━━━━━━━━⬣`,
          ...global.channelInfo
        },
        { quoted: msg }
      );

      if (!videos?.length) {
        return sock.sendMessage(
          from,
          {
            text: "⚠️ El usuario no tiene videos públicos.",
            ...global.channelInfo
          },
          { quoted: msg }
        );
      }

      // 🎬 Enviar 3 primeros videos
      for (let i = 0; i < videos.length; i++) {

        const v = videos[i];

        await sock.sendMessage(
          from,
          {
            video: { url: v.play },
            caption:
`╭─❍ *VIDEO ${i + 1}* ❍
│ 📝 ${v.title || "Sin descripción"}
│ ❤️ ${v.digg_count}  💬 ${v.comment_count}
│ 🔁 ${v.share_count} 👁 ${v.play_count}
╰───────────────`,
            ...global.channelInfo
          },
          { quoted: msg }
        );
      }

    } catch (e) {

      console.error("Error ejecutando tiktokusuario:", e);

      await sock.sendMessage(
        from,
        {
          text: "❌ Ocurrió un error al obtener el perfil.",
          ...global.channelInfo
        },
        { quoted: msg }
      );
    }
  }
};