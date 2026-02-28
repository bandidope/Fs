import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⏱️ uptime bonito
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default {
  command: ['menu'],
  category: 'menu',
  description: 'Menú principal con diseño premium',

  run: async ({ sock, msg, from, settings, comandos }) => {
    try {
      if (!comandos) {
        return sock.sendMessage(
          from,
          { text: '❌ error interno', ...global.channelInfo },
          { quoted: msg }
        );
      }

      // 🎥 video menú
      const videoPath = path.join(process.cwd(), 'videos', 'menu-video.mp4');
      if (!fs.existsSync(videoPath)) {
        return sock.sendMessage(
          from,
          { text: '❌ video del menú no encontrado', ...global.channelInfo },
          { quoted: msg }
        );
      }

      const uptime = formatUptime(process.uptime());

      // 📂 agrupar comandos (solo 1 comando por archivo: el primero)
      const categorias = {}; // { cat: Set() }

      for (const cmd of new Set(comandos.values())) {
        if (!cmd?.category || !cmd?.command) continue;

        const cat = String(cmd.category).toLowerCase();

        // ✅ tomar SOLO el primer comando (principal)
        const principal = Array.isArray(cmd.command)
          ? cmd.command[0]
          : cmd.command;

        if (!principal) continue;

        if (!categorias[cat]) categorias[cat] = new Set();
        categorias[cat].add(String(principal).toLowerCase());
      }

      // 🎨 MENÚ ULTRA DISEÑO
      let menu = `
╭══════════════════════╮
│ ✦ *${settings.botName}* ✦
╰══════════════════════╯

▸ _prefijo_ : *${settings.prefix}*
▸ _estado_  : *online*
▸ _uptime_  : *${uptime}*

┌──────────────────────┐
│ ✧ *MENÚ DE COMANDOS* ✧
└──────────────────────┘
`;

      for (const cat of Object.keys(categorias).sort()) {
        const lista = Array.from(categorias[cat]).sort();

        menu += `
╭─ ❖ *${cat.toUpperCase()}*
│`;

        for (const c of lista) {
          menu += `\n│  • \`${settings.prefix}${c}\``;
        }

        menu += `
╰──────────────────────`;
      }

      menu += `

┌──────────────────────┐
│ ✦ _bot premium activo_
└──────────────────────┘
_artoria bot vip_
`;

      // 🚀 enviar como gif
      await sock.sendMessage(
        from,
        {
          video: fs.readFileSync(videoPath),
          mimetype: 'video/mp4',
          gifPlayback: true,
          caption: menu.trim(),
          ...global.channelInfo
        },
        { quoted: msg }
      );

    } catch (err) {
      console.error('MENU ERROR:', err);
      await sock.sendMessage(
        from,
        { text: '❌ error al mostrar el menú', ...global.channelInfo },
        { quoted: msg }
      );
    }
  }
};
