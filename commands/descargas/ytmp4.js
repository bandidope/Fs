import fs from "fs";
import path from "path";
import axios from "axios";
import yts from "yt-search";

const API_URL = "https://mayapi.ooguy.com/ytdl";

const API_KEYS = [
  "may-1285f1e9",
  "may-5793b618",
  "may-72e941fc",
  "may-5d597e52"
];

let apiIndex = 0;

function getNextApiKey() {
  const key = API_KEYS[apiIndex];
  apiIndex = (apiIndex + 1) % API_KEYS.length;
  return key;
}

const COOLDOWN_TIME = 15 * 1000;
const DEFAULT_QUALITY = "360p";

const TMP_DIR = path.join(process.cwd(), "tmp");

const MAX_VIDEO_BYTES = 70 * 1024 * 1024;
const MAX_DOC_BYTES = 2 * 1024 * 1024 * 1024;
const MIN_VALID_BYTES = 300000;
const CLEANUP_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const cooldowns = new Map();
const locks = new Set();

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const channelInfo = global.channelInfo || {};

function safeFileName(name) {
  return String(name || "video")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ""));
}

function parseQuality(args) {
  const q = args.find((a) => /^\d{3,4}p$/i.test(a));
  return (q || DEFAULT_QUALITY).toLowerCase();
}

function withoutQuality(args) {
  return args.filter((a) => !/^\d{3,4}p$/i.test(a));
}

function cleanupTmp() {
  try {
    const now = Date.now();
    for (const file of fs.readdirSync(TMP_DIR)) {
      const p = path.join(TMP_DIR, file);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && now - st.mtimeMs > CLEANUP_MAX_AGE_MS) {
          fs.unlinkSync(p);
        }
      } catch {}
    }
  } catch {}
}

async function fetchDirectMediaUrl({ videoUrl, quality }) {

  let lastError;

  for (let i = 0; i < API_KEYS.length; i++) {

    const key = getNextApiKey();

    try {

      const { data } = await axios.get(API_URL, {
        timeout: 25000,
        params: {
          url: videoUrl,
          quality,
          apikey: key
        },
        validateStatus: s => s >= 200 && s < 500
      });

      if (data?.status && data?.result?.url) {

        return {
          title: data.result.title || "video",
          directUrl: data.result.url
        };

      }

      lastError = new Error("API sin URL");

    } catch (err) {
      lastError = err;
    }

  }

  throw new Error(lastError?.message || "Todas las API fallaron");
}

async function resolveVideoInfo(query) {

  if (!isHttpUrl(query)) {

    const search = await yts(query);
    const first = search?.videos?.[0];

    if (!first) return null;

    return {
      videoUrl: first.url,
      title: safeFileName(first.title),
      thumbnail: first.thumbnail
    };

  }

  const search = await yts(query);
  const first = search?.videos?.[0];

  return {
    videoUrl: query,
    title: safeFileName(first?.title || "video"),
    thumbnail: first?.thumbnail || null
  };

}

async function trySendByUrl(sock, from, quoted, directUrl, title) {

  try {

    await sock.sendMessage(from,{
      video:{ url: directUrl },
      mimetype:"video/mp4",
      caption:`🎬 ${title}`,
      ...channelInfo
    },quoted);

    return true;

  } catch {}

  return false;
}

async function downloadToFile(url, outPath, maxBytes){

  const res = await axios.get(url,{
    responseType:"stream",
    timeout:120000,
    maxRedirects:5,
    headers:{
      "User-Agent":"Mozilla/5.0",
      "Referer":"https://www.youtube.com/",
      "Origin":"https://www.youtube.com"
    }
  });

  let downloaded = 0;

  const writer = fs.createWriteStream(outPath);

  return new Promise((resolve,reject)=>{

    res.data.on("data",(chunk)=>{

      downloaded += chunk.length;

      if(downloaded > maxBytes){
        res.data.destroy();
        reject(new Error("Archivo demasiado grande"));
      }

    });

    res.data.on("error",reject);

    writer.on("finish",()=>{

      const size = fs.statSync(outPath).size;

      if(size < MIN_VALID_BYTES)
        return reject(new Error("Archivo incompleto"));

      resolve(size);

    });

    writer.on("error",reject);

    res.data.pipe(writer);

  });

}

export default {

  command:["ytmp4","yt2","ytmp4doc"],
  category:"descarga",

  run: async (ctx)=>{

    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg;

    const userId = from;

    if(locks.has(from)){
      return sock.sendMessage(from,{
        text:"⏳ Ya estoy procesando otro video.",
        ...channelInfo
      });
    }

    const until = cooldowns.get(userId);

    if(until && until > Date.now()){
      return sock.sendMessage(from,{
        text:`⏳ Espera ${Math.ceil((until-Date.now())/1000)}s`,
        ...channelInfo
      });
    }

    cooldowns.set(userId,Date.now()+COOLDOWN_TIME);

    let outFile;

    const quoted = msg?.key ? { quoted: msg } : undefined;

    try{

      locks.add(from);

      cleanupTmp();

      if(!args?.length){

        cooldowns.delete(userId);

        return sock.sendMessage(from,{
          text:"❌ Uso: .ytmp4 <nombre o link>",
          ...channelInfo
        });

      }

      const quality = parseQuality(args);
      const query = withoutQuality(args).join(" ");

      const meta = await resolveVideoInfo(query);

      if(!meta){

        cooldowns.delete(userId);

        return sock.sendMessage(from,{
          text:"❌ No se encontró el video",
          ...channelInfo
        });

      }

      let { videoUrl, title } = meta;

      await sock.sendMessage(from,{
        text:`⬇️ Descargando...\n\n🎬 ${title}\n🎚️ ${quality}`,
        ...channelInfo
      },quoted);

      const info = await fetchDirectMediaUrl({ videoUrl, quality });

      title = safeFileName(info.title || title);

      /* 🔥 SOLUCIÓN AL ERROR 403 */
      if(info.directUrl.includes("googlevideo.com")){

        const sent = await trySendByUrl(sock,from,quoted,info.directUrl,title);

        if(sent) return;

      }

      outFile = path.join(TMP_DIR,`${Date.now()}.mp4`);

      const size = await downloadToFile(info.directUrl,outFile,MAX_DOC_BYTES);

      await sock.sendMessage(from,{
        document:{ url: outFile },
        mimetype:"video/mp4",
        fileName:`${title}.mp4`,
        caption:`📄 ${title}`,
        ...channelInfo
      },quoted);

    }catch(err){

      console.error("YTMP4 ERROR:",err);

      cooldowns.delete(userId);

      await sock.sendMessage(from,{
        text:`❌ ${err.message || "Error al descargar el video"}`,
        ...channelInfo
      });

    }finally{

      locks.delete(from);

      try{
        if(outFile && fs.existsSync(outFile))
          fs.unlinkSync(outFile);
      }catch{}

    }

  }

};
