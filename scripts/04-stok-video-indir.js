/**
 * 04 - Pexels Stok Video İndirme
 */

import fs from "fs";
import axios from "axios";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID, PEXELS_API_KEY } = process.env;

async function pexelsVideoAra(query) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape&size=medium`;
  
  const response = await axios.get(url, {
    headers: { Authorization: PEXELS_API_KEY },
    timeout: 30000,
  });
  
  const videos = response.data.videos || [];
  if (videos.length === 0) return null;
  
  const video = videos[0];
  const videoFile = video.video_files.find((f) => f.quality === "hd" && f.width <= 1920)
    || video.video_files.find((f) => f.quality === "sd")
    || video.video_files[0];
  
  return {
    url: videoFile.link,
    width: videoFile.width,
    height: videoFile.height,
    duration: video.duration,
    pexels_id: video.id,
  };
}

async function pexelsVideoIndir(videoBilgi, index) {
  const response = await axios({
    method: "GET",
    url: videoBilgi.url,
    responseType: "arraybuffer",
    timeout: 120000,
  });
  
  const filename = `pexels-${String(index + 1).padStart(2, "0")}-${videoBilgi.pexels_id}.mp4`;
  const filepath = `/tmp/${filename}`;
  fs.writeFileSync(filepath, Buffer.from(response.data));
  
  const stats = fs.statSync(filepath);
  return { filename, filepath, size: stats.size };
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    const keywords = job.pexels_anahtar_kelimeler || [];
    if (keywords.length === 0) throw new Error("Pexels anahtar kelime yok!");
    
    await jobGuncelle(JOB_ID, { stok_status: "running" });
    
    const altKlasorler = await driveAltKlasorBul("03-pexels-stok-video", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("03-pexels-stok-video klasörü bulunamadı.");
    const stokKlasorId = altKlasorler[0].id;
    
    let basariliSayisi = 0;
    
    for (let i = 0; i < keywords.length; i++) {
      try {
        console.log(`Pexels ${i + 1}/${keywords.length}: "${keywords[i]}"`);
        const videoBilgi = await pexelsVideoAra(keywords[i]);
        if (!videoBilgi) {
          console.log(`  ⚠ Sonuç yok.`);
          continue;
        }
        
        const indirilen = await pexelsVideoIndir(videoBilgi, i);
        console.log(`  ✓ İndirildi (${(indirilen.size / 1024 / 1024).toFixed(1)}MB)`);
        
        await driveDosyaYukle(indirilen, stokKlasorId, "video/mp4");
        try { fs.unlinkSync(indirilen.filepath); } catch (e) {}
        
        basariliSayisi++;
      } catch (e) {
        console.error(`  ✗ ${keywords[i]}: ${e.message}`);
      }
    }
    
    const status = basariliSayisi === keywords.length ? "completed" : "partial";
    await jobGuncelle(JOB_ID, { stok_status: `${status}:${basariliSayisi}/${keywords.length}` });
    
    await telegram(job.chat_id, `🎬 *Stok video hazır:* ${basariliSayisi}/${keywords.length}`);
    
    console.log("✅ Pexels tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { stok_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *04-Stok video hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
