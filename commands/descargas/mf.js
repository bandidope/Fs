const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BOT_NAME = "Dvyer";
const API_KEY = "dvyer";
const API_URL = "https://api-adonix.ultraplus.click/download/mediafire";
const MAX_MB = 300; // 🔒 Límite 300MB

module.exports = {
  command: ["mediafire", "mf"],
  categoria: "descarga",
  description: "Descarga archivos de MediaFire y los envía",

  run: async (client, m, args) => {
    let filePath;

    try {
      if (!args.length) {
        return m.reply(
          "❌ Ingresa un enlace de MediaFire.\n\nEjemplo:\n.mediafire https://www.mediafire.com/file/xxxxx/file"
        );
      }

      await m.reply(`📥 Descargando archivo...\n⏳ ${BOT_NAME} está trabajando`);

      const api = `${API_URL}?apikey=${API_KEY}&url=${encodeURIComponent(args[0])}`;
      const res = await axios.get(api, { timeout: 60000 });

      if (!res.data?.status || !res.data?.result?.link) {
        throw new Error("API inválida");
      }

      const file = res.data.result;

      // 📦 Detectar tamaño real
      let sizeMB = 0;

      if (file.size?.includes("MB")) {
        sizeMB = parseFloat(file.size);
      } else if (file.size?.includes("GB")) {
        sizeMB = parseFloat(file.size) * 1024;
      }

      // 🚫 Si supera 300MB → solo link
      if (sizeMB > MAX_MB) {
        return client.sendMessage(m.chat, {
          text:
            `📁 *MediaFire Downloader*\n\n` +
            `📄 *Archivo:* ${file.filename}\n` +
            `📦 *Tamaño:* ${file.size}\n` +
            `📂 *Tipo:* ${file.filetype}\n\n` +
            `⚠️ El archivo supera el límite de 300MB\n\n` +
            `🔗 Descárgalo manualmente:\n${file.link}`
        }, { quoted: m });
      }

      // 📂 Carpeta temporal
      const tmpDir = path.join(__dirname, "../../tmp");
      fs.mkdirSync(tmpDir, { recursive: true });

      const safeName = file.filename.replace(/[\\/:*?"<>|]/g, "");
      filePath = path.join(tmpDir, `${Date.now()}_${safeName}`);

      // ⬇️ Descargar archivo
      const fileRes = await axios.get(file.link, {
        responseType: "arraybuffer",
        timeout: 600000
      });

      fs.writeFileSync(filePath, fileRes.data);

      // 📤 Enviar documento
      await client.sendMessage(
        m.chat,
        {
          document: fs.readFileSync(filePath),
          fileName: safeName,
          mimetype: "application/octet-stream",
          caption:
            `📁 *MediaFire Downloader*\n\n` +
            `📄 *Archivo:* ${file.filename}\n` +
            `📦 *Tamaño:* ${file.size}\n` +
            `📂 *Tipo:* ${file.filetype}\n\n` +
            `🤖 ${BOT_NAME}`
        },
        { quoted: m }
      );

    } catch (err) {
      console.error("MEDIAFIRE ERROR:", err.message);
      await m.reply("❌ Error al descargar el archivo de MediaFire.");
    } finally {
      // 🧹 Eliminar archivo temporal
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
};