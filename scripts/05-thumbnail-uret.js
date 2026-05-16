/**
 * 05 - Thumbnail Üretimi v4
 * - Videonun ANA BAŞLIĞINI (baslik) kullan, ":" ile ikiye böl
 * - Ana kısım: büyük punto, sarı
 * - Alt kısım: orta punto, beyaz
 * - Sağ blokta yarı saydam arka plan
 * - Sol altta BilgiSok logosu
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import axios from "axios";
import { fluxUret } from "./lib/cloudflare.js";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID } = process.env;
const TMP_DIR = "/tmp/thumbnail";
const LOGO_URL = "https://raw.githubusercontent.com/murturhan/bilgisok-otomasyon/main/bilgisok-logo.png.png";

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Başlığı ":" ile böl
function basligiBol(baslik) {
  if (baslik.includes(":")) {
    const [ana, ...rest] = baslik.split(":");
    return {
      ana: ana.trim(),
      alt: rest.join(":").trim()
    };
  }
  return {
    ana: baslik.trim(),
    alt: ""
  };
}

// Kelimeleri satır karakter limitine göre satırlara böl
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// SVG metin overlay
function metinSvg(baslikTam, width = 1280, height = 720) {
  const { ana, alt } = basligiBol(baslikTam);
  
  // Sağ blok: 520 px genişlik
  const blokGenislik = 520;
  const blokX = width - blokGenislik;
  const padding = 30;
  
  // Ana başlık font size - uzunluğa göre dinamik
  let anaFontSize;
  const anaLen = ana.length;
  if (anaLen <= 12) anaFontSize = 78;
  else if (anaLen <= 18) anaFontSize = 64;
  else if (anaLen <= 25) anaFontSize = 54;
  else if (anaLen <= 35) anaFontSize = 44;
  else anaFontSize = 36;
  
  // Alt başlık font size
  let altFontSize = 0;
  if (alt) {
    if (alt.length <= 20) altFontSize = 36;
    else if (alt.length <= 35) altFontSize = 28;
    else if (alt.length <= 50) altFontSize = 22;
    else altFontSize = 18;
  }
  
  // Satır başına karakter
  const anaSatirKarakter = Math.floor((blokGenislik - padding * 2) / (anaFontSize * 0.55));
  const altSatirKarakter = altFontSize > 0 ? Math.floor((blokGenislik - padding * 2) / (altFontSize * 0.5)) : 0;
  
  const anaSatirlar = metniSatirlaraBol(ana.toUpperCase(), anaSatirKarakter);
  const altSatirlar = alt ? metniSatirlaraBol(alt, altSatirKarakter) : [];
  
  // Toplam yükseklik
  const anaSatirYukseklik = anaFontSize * 1.1;
  const altSatirYukseklik = altFontSize * 1.15;
  const totalAnaYukseklik = anaSatirlar.length * anaSatirYukseklik;
  const totalAltYukseklik = altSatirlar.length * altSatirYukseklik;
  const aradaki = 25;
  const totalYukseklik = totalAnaYukseklik + (altSatirlar.length > 0 ? aradaki + totalAltYukseklik : 0);
  
  // Dikey ortala
  const startY = (height - totalYukseklik) / 2;
  
  // SVG
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Sağ blok yarı saydam arka plan
  svg += `<rect x="${blokX}" y="0" width="${blokGenislik}" height="${height}" fill="rgba(0,0,0,0.6)"/>`;
  
  // Sol kenar kırmızı vurgu
  svg += `<rect x="${blokX}" y="0" width="6" height="${height}" fill="#FF0000"/>`;
  
  // Ana başlık (sarı, büyük, Impact font)
  let currentY = startY + anaFontSize;
  for (const satir of anaSatirlar) {
    svg += `<text x="${blokX + blokGenislik / 2}" y="${currentY}" 
              font-family="Impact, 'Arial Black', sans-serif" 
              font-size="${anaFontSize}" 
              font-weight="900" 
              fill="#FFEB3B" 
              text-anchor="middle"
              stroke="#000000"
              stroke-width="6"
              paint-order="stroke">${escapeXml(satir)}</text>`;
    currentY += anaSatirYukseklik;
  }
  
  // Alt başlık (beyaz, orta, normal case)
  if (altSatirlar.length > 0) {
    currentY += aradaki;
    for (const satir of altSatirlar) {
      svg += `<text x="${blokX + blokGenislik / 2}" y="${currentY}" 
                font-family="Arial, sans-serif" 
                font-size="${altFontSize}" 
                font-weight="700" 
                fill="#FFFFFF" 
                text-anchor="middle"
                stroke="#000000"
                stroke-width="3"
                paint-order="stroke">${escapeXml(satir)}</text>`;
      currentY += altSatirYukseklik;
    }
  }
  
  svg += `</svg>`;
  return Buffer.from(svg);
}

async function logoEkle(thumbBuffer) {
  try {
    const logoResponse = await axios.get(LOGO_URL, { responseType: "arraybuffer", timeout: 10000 });
    const logoBuffer = Buffer.from(logoResponse.data);
    
    const logoResized = await sharp(logoBuffer)
      .resize(140, 140, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    
    return await sharp(thumbBuffer)
      .composite([{ input: logoResized, top: 720 - 140 - 20, left: 20 }])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch (e) {
    console.log(`⚠ Logo eklenemedi: ${e.message}`);
    return thumbBuffer;
  }
}

async function thumbnailUret(prompt, baslikTam, deneme) {
  console.log(`Thumbnail ${deneme} - FLUX'a istek atılıyor...`);
  
  const promptIyilestirilmis = `${prompt}, RIGHT THIRD of image EMPTY for text overlay, dramatic lighting, hyperrealistic, cinematic, professional thumbnail photography, 16:9 widescreen, high detail, NO TEXT IN IMAGE`;
  
  const buffer = await fluxUret(promptIyilestirilmis, { width: 1280, height: 720 });
  console.log(`  ✓ FLUX görsel: ${(buffer.length / 1024).toFixed(0)}KB`);
  
  const svgBuffer = metinSvg(baslikTam);
  
  let withText = await sharp(buffer)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  
  withText = await logoEkle(withText);
  
  return withText;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.thumbnail_prompt) throw new Error("Thumbnail prompt yok!");
    if (!job.baslik) throw new Error("Başlık yok!");
    
    const { ana, alt } = basligiBol(job.baslik);
    console.log(`Ana başlık: "${ana}"`);
    console.log(`Alt başlık: "${alt}"`);
    
    await jobGuncelle(JOB_ID, { thumbnail_status: "running" });
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    const thumbnailler = [];
    
    for (let i = 1; i <= 2; i++) {
      try {
        const buffer = await thumbnailUret(job.thumbnail_prompt, job.baslik, i);
        
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
    await telegram(job.chat_id, `🖼️ *Thumbnail hazır* (${thumbnailler.length} varyant)`);
    
    console.log("✅ Thumbnail tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { thumbnail_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *05-Thumbnail hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
