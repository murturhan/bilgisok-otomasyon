/**
 * 05 - Thumbnail Üretimi v6 (GeniMini Kids Quiz)
 * v5'ten farkı: Drive'dan GERÇEK Jess PNG'sini indirip overlay olarak ekliyor.
 * FLUX sadece arka plan tema görseli için, karakter olarak değil.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { google } from "googleapis";
import { fluxCagri, getCfAccounts } from "./lib/cloudflare.js";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
  getServiceAccountAuth,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID, GDRIVE_JESS_FOLDER_ID } = process.env;
const TMP_DIR = "/tmp/thumbnail";

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function basligiBol(baslik) {
  const seperators = [":", "?", "!"];
  for (const sep of seperators) {
    if (baslik.includes(sep)) {
      const idx = baslik.indexOf(sep);
      const ana = baslik.substring(0, idx).trim();
      const alt = baslik.substring(idx + 1).trim();
      if (ana && alt) return { ana, alt };
    }
  }
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

// Drive'dan Jess pose'unu indir (öncelik: question, sonra intro, sonra correct)
async function jessIntroIndir(auth) {
  if (!GDRIVE_JESS_FOLDER_ID) {
    console.log("⚠ GDRIVE_JESS_FOLDER_ID yok, Jess overlay atlanıyor");
    return null;
  }
  
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${GDRIVE_JESS_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name, mimeType)",
    pageSize: 50,
  });
  
  const files = res.data.files || [];
  const tercih = ["question", "intro", "correct"];
  
  for (const poz of tercih) {
    const bulunan = files.find(f => 
      f.name.toLowerCase().includes(poz) && 
      f.name.toLowerCase().endsWith(".png")
    );
    if (bulunan) {
      const hedef = path.join(TMP_DIR, "jess-thumb.png");
      const stream = await drive.files.get(
        { fileId: bulunan.id, alt: "media" },
        { responseType: "stream" }
      );
      
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(hedef);
        stream.data.on("end", () => resolve())
          .on("error", reject)
          .pipe(ws);
      });
      
      console.log(`✓ Jess overlay: ${bulunan.name}`);
      return hedef;
    }
  }
  
  return null;
}

function metinSvg(baslikTam, width = 1280, height = 720) {
  const { ana, alt } = basligiBol(baslikTam);
  
  const blokGenislik = 540;
  const blokX = width - blokGenislik;
  const padding = 30;
  
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
  
  svg += `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(255,87,166,0.88);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgba(123,76,221,0.88);stop-opacity:1" />
    </linearGradient>
  </defs>`;
  svg += `<rect x="${blokX}" y="0" width="${blokGenislik}" height="${height}" fill="url(#bgGrad)"/>`;
  svg += `<rect x="${blokX}" y="0" width="8" height="${height}" fill="#FFD700"/>`;
  
  let currentY = startY + anaFontSize;
  for (const satir of anaSatirlar) {
    svg += `<text x="${blokX + blokGenislik / 2}" y="${currentY}"
              font-family="'Comic Sans MS', 'Arial Black', sans-serif"
              font-size="${anaFontSize}"
              font-weight="900"
              fill="#FFEB3B"
              text-anchor="middle"
              stroke="#000000"
              stroke-width="7"
              paint-order="stroke">${escapeXml(satir)}</text>`;
    currentY += anaSatirYukseklik;
  }
  
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
  
  // QUIZ! rozeti sol blok-sağ kenara yakın (Jess'le çakışmasın)
  svg += `<g transform="translate(${width - 600}, 70)">
    <circle cx="0" cy="0" r="55" fill="#FF5722" stroke="#000000" stroke-width="5"/>
    <text x="0" y="13" font-family="'Comic Sans MS', sans-serif"
          font-size="32" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="2" paint-order="stroke">QUIZ!</text>
  </g>`;
  
  // Soru işareti rozeti sağ-alt blok kenarında
  svg += `<g transform="translate(${width - 600}, ${height - 70})">
    <circle cx="0" cy="0" r="50" fill="#4FC3F7" stroke="#000000" stroke-width="5"/>
    <text x="0" y="18" font-family="'Comic Sans MS', sans-serif"
          font-size="60" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke">?</text>
  </g>`;
  
  svg += `</svg>`;
  return Buffer.from(svg);
}

async function thumbnailUret(prompt, baslikTam, jessThumbYol, deneme, hesap) {
  console.log(`Thumbnail ${deneme} - FLUX (${hesap.name})...`);
  
  // FLUX SADECE arka plan tema (karakter İÇERMESİN, Jess overlay'i biz koyacağız)
  const promptIyilestirilmis = `${prompt}, vibrant background scene only, NO CHARACTERS, NO ANIMALS, NO PEOPLE, just the theme environment, RIGHT THIRD of image EMPTY for text overlay, Pixar 3D animation style, kid-friendly, cheerful, bright daylight, professional thumbnail, 16:9 widescreen, NO TEXT, NO WORDS, NO LETTERS`;
  
  const buffer = await fluxCagri(promptIyilestirilmis, hesap, { width: 1280, height: 720 });
  console.log(`  ✓ FLUX bg: ${(buffer.length / 1024).toFixed(0)}KB`);
  
  let composite = sharp(buffer);
  const layers = [];
  
  // Text overlay
  const svgBuffer = metinSvg(baslikTam);
  layers.push({ input: svgBuffer, top: 0, left: 0 });
  
  // Jess overlay (sol alt köşe)
  if (jessThumbYol && fs.existsSync(jessThumbYol)) {
    const jessW = 480;
    const jessResized = await sharp(jessThumbYol)
      .resize(jessW, jessW, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    
    const jessMeta = await sharp(jessResized).metadata();
    layers.push({
      input: jessResized,
      top: 720 - jessMeta.height - 20,
      left: 20,
    });
  }
  
  const result = await composite
    .composite(layers)
    .jpeg({ quality: 95 })
    .toBuffer();
  
  return result;
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
    
    // Jess PNG'sini Drive'dan indir
    const saAuth = getServiceAccountAuth();
    const jessThumbYol = await jessIntroIndir(saAuth);
    
    const accounts = getCfAccounts();
    console.log(`${accounts.length} Cloudflare hesabı mevcut`);
    
    const thumbnailler = [];
    
    for (let i = 1; i <= 2; i++) {
      const hesap = accounts[(i - 1) % accounts.length];
      try {
        const buffer = await thumbnailUret(job.thumbnail_prompt, job.baslik, jessThumbYol, i, hesap);
        
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
