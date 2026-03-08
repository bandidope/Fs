import axios from "axios"
import yts from "yt-search"

const API = "https://0f66da8bd81e5d32-201-230-121-168.serveousercontent.com/ytmp3"

const channelInfo = global.channelInfo || {}

function safeFileName(name){
return String(name||"audio")
.replace(/[\\/:*?"<>|]/g,"")
.slice(0,80)
}

export default {

command:["ytmp3yer"],
category:"descarga",

run: async(ctx)=>{

const {sock,from,args} = ctx
const msg = ctx.m || ctx.msg

if(!args.length){
return sock.sendMessage(from,{
text:"❌ Uso: .ytmp3yer canción",
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
caption:`🎵 Descargando MP3...\n\n${video.title}`,
...channelInfo
},{quoted:msg})

const {data} = await axios.get(API,{
params:{url:video.url},
timeout:20000
})

if(!data?.download) throw "sin mp3"

const audio = await axios.get(data.download,{
responseType:"arraybuffer",
headers:{
"User-Agent":"Mozilla/5.0"
}
})

await sock.sendMessage(from,{
audio:audio.data,
mimetype:"audio/mpeg",
fileName:safeFileName(video.title)+".mp3",
...channelInfo
},{quoted:msg})

}catch(e){

console.log("MP3 ERROR:",e)

sock.sendMessage(from,{
text:"❌ Error descargando mp3",
...channelInfo
})

}

}

}
