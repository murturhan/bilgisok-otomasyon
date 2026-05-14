/**
 * 05 - Thumbnail Üretimi (MrBeast tarzı, neon, drop shadow)
 */

import fs from "fs";
import sharp from "sharp";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
} from "./lib/google.js";
import { fluxCagri, getCfAccounts, delay } from "./lib/cloudflare.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID } = process.env;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// MrBeast tarzı: Sağ taraf dikey blok, sarı ana başlık + kırmızı alt başlık
function svgOverlayUret(baslik, altBaslik) {
  const baslikSafe = escapeXml(baslik || "");
  const altBaslikSafe = escapeXml(altBaslik || "");
  
  // Font boyutu başlık uzunluğuna göre
  const baslikLen = baslik.length;
  let fontSize = 130;
  if (baslikLen > 12) fontSize = 95;
  else if (baslikLen > 8) fontSize = 115;
  else if (baslikLen > 5) fontSize = 130;
  else fontSize = 145;
  
  const altFontSize = Math.floor(fontSize * 0.55);
  
  // Konum: sağ tarafta, dikey ortalanmış
  // Görselin sağ 40%'ı için
  const blockCenterX = 1280 - 280;  // sağdan 280px içeride
  const blockCenterY = 360;
  
  return `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Sol taraf hafif karartma (görseli vurgulama) -->
      <linearGradient id="leftFade" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.0)"/>
        <stop offset="100%" style="stop-color:rgba(0,0,0,0.0)"/>
      </linearGradient>
      
      <!-- Sağ taraf yarı saydam koyu blok (metnin arkası) -->
      <linearGradient id="rightBlock" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.0)"/>
        <stop offset="20%" style="stop-color:rgba(0,0,0,0.6)"/>
        <stop offset="100%" style="stop-color:rgba(0,0,0,0.85)"/>
      </linearGradient>
      
      <!-- Sarı metin için drop shadow filtresi -->
      <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
        <feOffset dx="6" dy="8" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.9"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      
      <!-- Glow filtresi -->
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    <!-- Sağ tarafta yarı saydam koyu blok -->
    <rect x="700" y="0" width="580" height="720" fill="url(#rightBlock)"/>
    
    <!-- Üst kırmızı şerit (alt başlık varsa) -->
    ${altBaslikSafe ? `
    <rect x="${blockCenterX - 240}" y="${blockCenterY - fontSize - 40}" width="480" height="${altFontSize + 30}" 
          fill="#E50914" rx="6"/>
    <text x="${blockCenterX}" y="${blockCenterY - fontSize - 8}" 
          font-family="Impact, 'Arial Black', sans-serif" 
          font-size="${altFontSize}" 
          font-weight="900" 
          fill="#FFFFFF" 
          text-anchor="middle"
          letter-spacing="3">${altBaslikSafe}</text>
    ` : ''}
    
    <!-- Ana başlık: SARI, büyük, drop shadow + glow -->
    <text x="${blockCenterX}" y="${blockCenterY + 20}" 
          font-family="Impact, 'Arial Black', sans-serif" 
          font-size="${fontSize}" 
          font-weight="900" 
          fill="#FFD700" 
          stroke="#000000" 
          stroke-width="8" 
          paint-order="stroke fill"
          text-anchor="middle"
          letter-spacing="3"
          filter="url(#dropShadow)">${baslikSafe}</text>
    
    <!-- Sarı glow tekrar -->
    <text x="${blockCenterX}" y="${blockCenterY + 20}" 
          font-family="Impact, 'Arial Black', sans-serif" 
          font-size="${fontSize}" 
          font-weight="900" 
          fill="#FFD700" 
          text-anchor="middle"
          letter-spacing="3"
          opacity="0.8"
          filter="url(#glow)">${baslikSafe}</text>
    
    <!-- Alt aksan kırmızı çizgi -->
    <rect x="${blockCenterX - 100}" y="${blockCenterY + 50}" width="200" height="6" fill="#E50914"/>
  </svg>`;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.thumbnail_prompt || !job.thumbnail_baslik) {
      throw new Error("thumbnail_prompt veya thumbnail_baslik boş!");
    }
    
    await jobGuncelle(JOB_ID, { thumbnail_status: "running" });
    
    const altKlasorler = await driveAltKlasorBul("05-thumbnail", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("05-thumbnail klasörü bulunamadı.");
    const thumbnailKlasorId = altKlasorler[0].id;
    
    const accounts = getCfAccounts();
    const aktifHesap = accounts[0];
    const altBaslik = job.thumbnail_alt_baslik || "";
    const svg = svgOverlayUret(job.thumbnail_baslik, altBaslik);
    
    console.log(`Thumbnail: "${job.thumbnail_baslik}" | "${altBaslik}"`);
    
    let basariliSayisi = 0;
    
    for (let v = 0; v < 2; v++) {
      try {
        console.log(`Thumbnail varyantı ${v + 1}/2...`);
        const imageBuffer = await fluxCagri(job.thumbnail_prompt, aktifHesap, {
          width: 1280,
          height: 720,
        });
        
        const filename = `thumbnail-${String(v + 1).padStart(2, "0")}-${Date.now()}.jpg`;
        const filepath = `/tmp/${filename}`;
        
        await sharp(imageBuffer)
          .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
          .jpeg({ quality: 92 })
          .toFile(filepath);
        
        const stats = fs.statSync(filepath);
        console.log(`  ✓ ${v + 1}: ${(stats.size / 1024).toFixed(0)}KB`);
        
        await driveDosyaYukle({ filename, filepath }, thumbnailKlasorId, "image/jpeg");
        try { fs.unlinkSync(filepath); } catch (e) {}
        
        basariliSayisi++;
        
        if (v < 1) await delay(7000);
      } catch (e) {
        console.error(`  ✗ Thumbnail ${v + 1}: ${e.message}`);
      }
    }
    
    const status = basariliSayisi === 2 ? "completed" : "partial";
    await jobGuncelle(JOB_ID, { thumbnail_status: `${status}:${basariliSayisi}/2` });
    
    await telegram(job.chat_id, `🎯 *Thumbnail hazır:* ${basariliSayisi}/2`);
    
    console.log("✅ Thumbnail tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { thumbnail_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *05-Thumbnail hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
