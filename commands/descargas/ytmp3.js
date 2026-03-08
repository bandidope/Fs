import axios from "axios"
import yts from "yt-search"

const API = "https://nexevo.onrender.com/ytmp3"
const channelInfo = global.channelInfo || {}

function safeFileName(name){
return String(name || "audio")
.replace(/[\\/:*?"<>|]/g,"")
.slice(0,80)
}

export default {

command:["play","ytmp3"],
category:"descarga",

run: async (ctx)=>{

const {sock, from, args} = ctx
const msg = ctx.m || ctx.msg

if(!args.length){
return sock.sendMessage(from,{
text:"❌ Uso: .play canción\nEjemplo:\n.play ozuna",
...channelInfo
})
}

try{

const query = args.join(" ")
const search = await yts(query)
const video = search.videos[0]

if(!video){
return sock.sendMessage(from,{
text:"❌ No encontré resultados",
...channelInfo
})
}

await sock.sendMessage(from,{
image:{url:video.thumbnail},
caption:`🎵 *${video.title}*\n⏱️ ${video.timestamp}\n\n⬇️ Descargando audio...`,
...channelInfo
},{quoted:msg})

const {data} = await axios.get(`${API}?url=${encodeURIComponent(video.url)}`)

if(!data || !data.url){
throw new Error("API sin audio")
}

await sock.sendMessage(from,{
audio:{ url: data.url },
mimetype:"audio/ogg; codecs=opus",
fileName: safeFileName(video.title)+".ogg",
...channelInfo
},{quoted:msg})

}catch(err){

console.log("[PLAY ERROR]", err)

await sock.sendMessage(from,{
text:"❌ Error descargando música",
...channelInfo
})

}

}

}
