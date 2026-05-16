/**
 * 05 - Thumbnail Üretimi v5 (GeniMini Kids Quiz)
 * - fluxCagri kullanıyor (fluxUret yok artık)
 * - Jess the Fox + tema görseli + büyük renkli text
 * - Çocuk dostu canlı renkler (sarı/kırmızı yerine pembe/mavi/sarı/turuncu)
 * - Bilgisok logosu kaldırıldı
 * - Format: 1280x720 (16:9)
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fluxCagri, getCfAccounts } from "./lib/cloudflare.js";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID } = process.env;
const TMP_DIR = "/tmp/thumbnail";

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function basligiBol(baslik) {
  // Önce ":" sonra "?" sonra "!" ile böl
  const seperators = [":", "?", "!"];
  for (const sep of seperators) {
    if (baslik.includes(sep)) {
      const idx = baslik.indexOf(sep);
      const ana = baslik.substring(0, idx).trim();
      const alt = baslik.substring(idx + 1).trim();
      if (ana && alt) return { ana, alt };
    }
  }
  // Bölünmezse, kelime sayısına göre
  const kelimeler = baslik.trim().split(/\s+/);
  if (kelimeler.length >= 6) {
    const yari = Math.ceil(kelimeler.length / 2);
    return {
      ana: kelimeler.slice(0, yari).join(" "),
      alt: kelimeler.slice(yari).join(" "),
    };
  }
  return { ana: baslik.trim(), alt: "" };
}

function metniSatirlaraBol(metin, maksKarakter) {
  const kelimeler = metin.split(/\s+/);
  const satirlar = [];
  let mevcut = "";
  for (const kelime of kelimeler) {
    if ((mevcut + " " + kelime).trim().length <= maksKarakter) {
      mevcut = (mevcut + " " + kelime).trim();
    } else {
      if (mevcut) satirlar.push(mevcut);
      mevcut = kelime;
    }
  }
  if (mevcut) satirlar.push(mevcut);
  return satirlar;
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Kids quiz tarzı renkli, eğlenceli thumbnail
function metinSvg(baslikTam, width = 1280, height = 720) {
  const { ana, alt } = basligiBol(baslikTam);
  
  // Sağ blok, sol blok değil. Sağ üçte birde dramatik metin alanı.
  const blokGenislik = 540;
  const blokX = width - blokGenislik;
  const padding = 30;
  
  // Ana başlık font size (uzunluğa göre)
  let anaFontSize;
  const anaLen = ana.length;
  if (anaLen <= 10) anaFontSize = 92;
  else if (anaLen <= 16) anaFontSize = 76;
  else if (anaLen <= 24) anaFontSize = 60;
  else if (anaLen <= 34) anaFontSize = 48;
  else anaFontSize = 40;
  
  let altFontSize = 0;
  if (alt) {
    if (alt.length <= 16) altFontSize = 44;
    else if (alt.length <= 30) altFontSize = 34;
    else if (alt.length <= 50) altFontSize = 26;
    else altFontSize = 22;
  }
  
  const anaSatirKarakter = Math.floor((blokGenislik - padding * 2) / (anaFontSize * 0.5));
  const altSatirKarakter = altFontSize > 0 ? Math.floor((blokGenislik - padding * 2) / (altFontSize * 0.5)) : 0;
  
  const anaSatirlar = metniSatirlaraBol(ana.toUpperCase(), anaSatirKarakter);
  const altSatirlar = alt ? metniSatirlaraBol(alt, altSatirKarakter) : [];
  
  const anaSatirYukseklik = anaFontSize * 1.1;
  const altSatirYukseklik = altFontSize * 1.15;
  const totalAnaYukseklik = anaSatirlar.length * anaSatirYukseklik;
  const totalAltYukseklik = altSatirlar.length * altSatirYukseklik;
  const aradaki = 30;
  const totalYukseklik = totalAnaYukseklik + (altSatirlar.length > 0 ? aradaki + totalAltYukseklik : 0);
  
  const startY = (height - totalYukseklik) / 2;
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Sağ blok GRADIENT arka plan (pembe → mor)
  svg += `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(255,87,166,0.85);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgba(123,76,221,0.85);stop-opacity:1" />
    </linearGradient>
  </defs>`;
  svg += `<rect x="${blokX}" y="0" width="${blokGenislik}" height="${height}" fill="url(#bgGrad)"/>`;
  
  // Sol kenar canlı sarı vurgu
  svg += `<rect x="${blokX}" y="0" width="8" height="${height}" fill="#FFD700"/>`;
  
  // Ana başlık (PARLAK SARI, büyük, kalın, siyah stroke)
  let currentY = startY + anaFontSize;
  for (const satir of anaSatirlar) {
    svg += `<text x="${blokX + blokGenislik / 2}" y="${currentY}"
              font-family="'Fredoka One', 'Comic Sans MS', 'Arial Black', sans-serif"
              font-size="${anaFontSize}"
              font-weight="900"
              fill="#FFEB3B"
              text-anchor="middle"
              stroke="#000000"
              stroke-width="7"
              paint-order="stroke">${escapeXml(satir)}</text>`;
    currentY += anaSatirYukseklik;
  }
  
  // Alt başlık (beyaz, daha küçük)
  if (altSatirlar.length > 0) {
    currentY += aradaki;
    for (const satir of altSatirlar) {
      svg += `<text x="${blokX + blokGenislik / 2}" y="${currentY}"
                font-family="'Comic Sans MS', Arial, sans-serif"
                font-size="${altFontSize}"
                font-weight="800"
                fill="#FFFFFF"
                text-anchor="middle"
                stroke="#000000"
                stroke-width="3"
                paint-order="stroke">${escapeXml(satir)}</text>`;
      currentY += altSatirYukseklik;
    }
  }
  
  // Sol üst köşede büyük "QUIZ!" rozeti
  svg += `<g transform="translate(80, 80)">
    <circle cx="0" cy="0" r="65" fill="#FF5722" stroke="#000000" stroke-width="5"/>
    <text x="0" y="15" font-family="'Fredoka One', 'Comic Sans MS', sans-serif" 
          font-size="36" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="2" paint-order="stroke">QUIZ!</text>
  </g>`;
  
  // Sol alt köşede soru işareti rozeti
  svg += `<g transform="translate(80, ${height - 80})">
    <circle cx="0" cy="0" r="55" fill="#4FC3F7" stroke="#000000" stroke-width="5"/>
    <text x="0" y="20" font-family="'Fredoka One', 'Comic Sans MS', sans-serif" 
          font-size="68" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke">?</text>
  </g>`;
  
  svg += `</svg>`;
  return Buffer.from(svg);
}

async function thumbnailUret(prompt, baslikTam, deneme, hesap) {
  console.log(`Thumbnail ${deneme} - FLUX (${hesap.name})...`);
  
  const promptIyilestirilmis = `${prompt}, RIGHT THIRD of image EMPTY for text overlay, vibrant colors, Pixar 3D animation style, kid-friendly, cheerful, bright daylight, professional thumbnail, 16:9 widescreen, NO TEXT IN IMAGE, NO WORDS, NO LETTERS`;
  
  const buffer = await fluxCagri(promptIyilestirilmis, hesap, { width: 1280, height: 720 });
  console.log(`  ✓ FLUX görsel: ${(buffer.length / 1024).toFixed(0)}KB`);
  
  const svgBuffer = metinSvg(baslikTam);
  
  const withText = await sharp(buffer)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  
  return withText;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.thumbnail_prompt) throw new Error("Thumbnail prompt yok!");
    if (!job.baslik) throw new Error("Başlık yok!");
    
    const { ana, alt } = basligiBol(job.baslik);
    console.log(`Ana: "${ana}" | Alt: "${alt}"`);
    
    await jobGuncelle(JOB_ID, { thumbnail_status: "running" });
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    const accounts = getCfAccounts();
    console.log(`${accounts.length} Cloudflare hesabı mevcut`);
    
    const thumbnailler = [];
    
    for (let i = 1; i <= 2; i++) {
      const hesap = accounts[(i - 1) % accounts.length];
      try {
        const buffer = await thumbnailUret(job.thumbnail_prompt, job.baslik, i, hesap);
        
        const filename = `thumbnail-${i}-${Date.now()}.jpg`;
        const filepath = path.join(TMP_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        thumbnailler.push({ filename, filepath });
        
        console.log(`  ✓ Thumbnail ${i} kaydedildi: ${filename}`);
        
        if (i < 2) await delay(3000);
      } catch (e) {
        console.error(`Thumbnail ${i} hatası: ${e.message}`);
      }
    }
    
    if (thumbnailler.length === 0) throw new Error("Hiç thumbnail üretilemedi!");
    
    const altKlasorler = await driveAltKlasorBul("05-thumbnail", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("05-thumbnail klasörü yok");
    
    for (const t of thumbnailler) {
      await driveDosyaYukle(t, altKlasorler[0].id, "image/jpeg");
    }
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    
    await jobGuncelle(JOB_ID, { thumbnail_status: `completed:${thumbnailler.length}` });
    await telegram(job.chat_id, `🖼️ *Thumbnail ready!* (${thumbnailler.length} variants)`);
    
    console.log("✅ Thumbnail tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { thumbnail_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *05-Thumbnail error:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
