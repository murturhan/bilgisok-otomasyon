/**
 * 05 - Thumbnail Üretimi (FLUX + sharp overlay)
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

function svgOverlayUret(thumbnailBaslik) {
  const kelimeler = thumbnailBaslik.split(" ");
  const satirlar = [];
  let mevcutSatir = "";
  for (const kelime of kelimeler) {
    if ((mevcutSatir + " " + kelime).trim().length <= 14) {
      mevcutSatir = (mevcutSatir + " " + kelime).trim();
    } else {
      if (mevcutSatir) satirlar.push(mevcutSatir);
      mevcutSatir = kelime;
    }
  }
  if (mevcutSatir) satirlar.push(mevcutSatir);
  
  const fontSize = satirlar.length === 1 ? 130 : (satirlar.length === 2 ? 110 : 90);
  const lineHeight = fontSize * 1.1;
  const totalHeight = satirlar.length * lineHeight;
  const startY = (720 - totalHeight) / 2 + fontSize;
  
  const textElements = satirlar.map((satir, i) => {
    const y = startY + i * lineHeight;
    return `<text x="640" y="${y}" font-family="Impact, Arial Black, sans-serif" font-size="${fontSize}" font-weight="900" fill="#FFD700" stroke="#000000" stroke-width="10" paint-order="stroke fill" text-anchor="middle" letter-spacing="2">${escapeXml(satir)}</text>`;
  }).join("\n");
  
  return `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.5)"/>
        <stop offset="50%" style="stop-color:rgba(0,0,0,0.2)"/>
        <stop offset="100%" style="stop-color:rgba(0,0,0,0.5)"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#grad)" />
    ${textElements}
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
    const svg = svgOverlayUret(job.thumbnail_baslik);
    
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
