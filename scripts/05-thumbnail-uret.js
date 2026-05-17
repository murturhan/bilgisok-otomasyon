/**
 * 05 - Thumbnail Üretimi v9 (GeniMini Kids Quiz)
 * v8'den farkı:
 * - thumbnail_baslik (2-3 kelime kısa) kullanılıyor - sığar, kırpılmaz
 * - Minimal layout: Jess BÜYÜK ortada, başlık üstte küçük banner
 * - "Monkey Quiz / TriviawithIbiza" tarzı temiz tasarım
 * - Format'a göre 9:16 (Shorts) veya 16:9 (Long)
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

async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// SVG - Shorts (1080×1920 dikey)
// Layout:
//   Üst (250px): "QUIZ" rozeti sol, "?" rozeti sağ
//   Banner (250-450): Başlık (kısa, büyük)
//   Orta-Alt (450-1500): Jess + FLUX background
//   Alt (1500-1920): "5 Q's" rozeti sağ alt, GeniMini logosu sol alt
function svgShorts(baslik, format) {
  const W = 1080, H = 1920;
  const t = escapeXml(baslik.toUpperCase());
  
  // Tek satır mı çift satır mı (≤10 char tek, fazla çift)?
  const kelimeler = t.split(" ");
  let satirlar;
  if (t.length <= 14) {
    satirlar = [t];
  } else {
    const mid = Math.ceil(kelimeler.length / 2);
    satirlar = [kelimeler.slice(0, mid).join(" "), kelimeler.slice(mid).join(" ")];
  }
  
  const fontSize = satirlar.length === 1 ? 180 : 150;
  
  // Üst banner Y koordinatları
  const bannerY = 250;
  const bannerH = 320;
  
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Gradient defs
  svg += `<defs>
    <linearGradient id="bannerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7B4CDD"/>
      <stop offset="100%" stop-color="#FF57A6"/>
    </linearGradient>
  </defs>`;
  
  // ÜST BANNER (başlık alanı)
  svg += `<rect x="0" y="${bannerY}" width="${W}" height="${bannerH}" fill="url(#bannerGrad)"/>`;
  // Üst-alt sarı çizgiler
  svg += `<rect x="0" y="${bannerY - 8}" width="${W}" height="16" fill="#FFD700"/>`;
  svg += `<rect x="0" y="${bannerY + bannerH - 8}" width="${W}" height="16" fill="#FFD700"/>`;
  
  // BAŞLIK (1 veya 2 satır)
  const totalH = satirlar.length * (fontSize + 30) - 30;
  const startY = bannerY + (bannerH - totalH) / 2 + fontSize - 20;
  satirlar.forEach((s, i) => {
    const y = startY + i * (fontSize + 30);
    svg += `<text x="${W/2}" y="${y}"
              font-family="Lilita One, Comic Sans MS, Impact, Arial Black, sans-serif"
              font-size="${fontSize}" font-weight="900" fill="#FFD700"
              stroke="#000000" stroke-width="10" paint-order="stroke"
              text-anchor="middle">${s}</text>`;
  });
  
  // SOL ÜST - "?" rozeti
  svg += `<g transform="translate(140, 140)">
    <circle cx="0" cy="0" r="100" fill="#4FC3F7" stroke="#000000" stroke-width="10"/>
    <text x="0" y="40" font-family="Lilita One, sans-serif"
          font-size="130" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="5" paint-order="stroke">?</text>
  </g>`;
  
  // SAĞ ÜST - "QUIZ" rozeti
  svg += `<g transform="translate(${W - 140}, 140)">
    <circle cx="0" cy="0" r="100" fill="#FF5722" stroke="#000000" stroke-width="10"/>
    <text x="0" y="20" font-family="Lilita One, sans-serif"
          font-size="60" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="4" paint-order="stroke">QUIZ!</text>
  </g>`;
  
  // SAĞ ALT - "5 Q's" rozet (soru sayısı vurgusu)
  svg += `<g transform="translate(${W - 130}, ${H - 130})">
    <circle cx="0" cy="0" r="95" fill="#FFD700" stroke="#000000" stroke-width="10"/>
    <text x="0" y="-10" font-family="Lilita One, sans-serif"
          font-size="74" font-weight="900" fill="#1A1A2E" text-anchor="middle">5</text>
    <text x="0" y="40" font-family="Lilita One, sans-serif"
          font-size="34" font-weight="900" fill="#1A1A2E" text-anchor="middle">QUIZ</text>
  </g>`;
  
  svg += `</svg>`;
  return svg;
}

// SVG - Long (1280×720 yatay)
function svgLong(baslik) {
  const W = 1280, H = 720;
  const t = escapeXml(baslik.toUpperCase());
  
  const blokGenislik = 700;
  const blokX = W - blokGenislik;
  
  const kelimeler = t.split(" ");
  let satirlar;
  if (t.length <= 12) {
    satirlar = [t];
  } else {
    const mid = Math.ceil(kelimeler.length / 2);
    satirlar = [kelimeler.slice(0, mid).join(" "), kelimeler.slice(mid).join(" ")];
  }
  const fontSize = satirlar.length === 1 ? 140 : 100;
  
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  
  svg += `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(123, 76, 221, 0.95)"/>
      <stop offset="100%" stop-color="rgba(255, 87, 166, 0.95)"/>
    </linearGradient>
  </defs>`;
  
  // Sağ panel
  svg += `<rect x="${blokX}" y="0" width="${blokGenislik}" height="${H}" fill="url(#bgGrad)"/>`;
  svg += `<rect x="${blokX}" y="0" width="10" height="${H}" fill="#FFD700"/>`;
  
  // Başlık
  const totalH = satirlar.length * (fontSize + 20);
  const startY = (H - totalH) / 2 + fontSize - 10;
  satirlar.forEach((s, i) => {
    const y = startY + i * (fontSize + 20);
    svg += `<text x="${blokX + blokGenislik/2}" y="${y}"
              font-family="Lilita One, Impact, Arial Black, sans-serif"
              font-size="${fontSize}" font-weight="900" fill="#FFD700"
              stroke="#000000" stroke-width="8" paint-order="stroke"
              text-anchor="middle">${s}</text>`;
  });
  
  // Sol üst QUIZ rozeti
  svg += `<g transform="translate(120, 90)">
    <circle cx="0" cy="0" r="65" fill="#FF5722" stroke="#000000" stroke-width="6"/>
    <text x="0" y="16" font-family="Lilita One, sans-serif"
          font-size="38" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke">QUIZ!</text>
  </g>`;
  
  // Sağ alt "5"
  svg += `<g transform="translate(${W - 90}, ${H - 90})">
    <circle cx="0" cy="0" r="55" fill="#FFD700" stroke="#000000" stroke-width="6"/>
    <text x="0" y="22" font-family="Lilita One, sans-serif"
          font-size="68" font-weight="900" fill="#1A1A2E" text-anchor="middle">5</text>
  </g>`;
  
  svg += `</svg>`;
  return svg;
}

// FLUX bg üret
async function fluxBgUret(prompt, hesap, format) {
  // FLUX desteklediği boyutlar
  const dim = format === "shorts" 
    ? { width: 1024, height: 1792 }
    : { width: 1280, height: 720 };
  
  const promptIyilestirilmis = `Empty scenic background only depicting ${prompt}, EMPTY LANDSCAPE, ABSOLUTELY NO LIVING CREATURES, NO ANIMALS WHATSOEVER, NO HUMANS, NO CARTOON CHARACTERS, NO MASCOTS, just empty natural environment with terrain, plants, sky, water, or man-made structures. Pixar 3D animation style background environment, kid-friendly, bright cheerful colors, daylight. ${format === "shorts" ? "9:16 vertical aspect ratio, vertical composition" : "16:9 cinematic widescreen"}. NO TEXT, NO WORDS, NO LETTERS, NO LOGOS. Style: like an empty Pixar scene before characters enter.`;
  
  const buffer = await fluxCagri(promptIyilestirilmis, hesap, dim);
  console.log(`  ✓ FLUX bg: ${(buffer.length / 1024).toFixed(0)}KB (${dim.width}x${dim.height})`);
  return buffer;
}

// Jess intro/correct PNG'sini indir
async function jessIntroIndir(auth, hedefYol) {
  if (!GDRIVE_JESS_FOLDER_ID) return null;
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${GDRIVE_JESS_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
    pageSize: 50,
  });
  if (!res.data.files) return null;
  
  // Önce "correct" pose (eller havada coşkulu, thumbnail için en uygun)
  let target = res.data.files.find(f => f.name.toLowerCase().includes("correct") && f.name.toLowerCase().endsWith(".png"));
  if (!target) target = res.data.files.find(f => f.name.toLowerCase().includes("intro") && f.name.toLowerCase().endsWith(".png"));
  if (!target) target = res.data.files.find(f => f.name.toLowerCase().endsWith(".png"));
  if (!target) return null;
  
  const stream = await drive.files.get(
    { fileId: target.id, alt: "media" },
    { responseType: "stream" }
  );
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(hedefYol);
    stream.data.on("end", () => resolve()).on("error", reject).pipe(ws);
  });
  return hedefYol;
}

// Ana üretim
async function thumbnailUret(prompt, jessYol, baslikKisa, format, hesap) {
  const isShorts = format === "shorts";
  const finalW = isShorts ? 1080 : 1280;
  const finalH = isShorts ? 1920 : 720;
  
  // 1. FLUX bg
  const fluxBuffer = await fluxBgUret(prompt, hesap, format);
  
  // 2. BG'yi hedef boyuta resize
  const bgResized = await sharp(fluxBuffer)
    .resize(finalW, finalH, { fit: "cover" })
    .toBuffer();
  
  // 3. SVG overlay
  const svg = isShorts ? svgShorts(baslikKisa, format) : svgLong(baslikKisa);
  const svgBuffer = Buffer.from(svg);
  
  const layers = [
    { input: svgBuffer, top: 0, left: 0 },
  ];
  
  // 4. Jess overlay - format'a göre konum/boyut
  if (jessYol && fs.existsSync(jessYol)) {
    let jessW, jessTop, jessLeft;
    
    if (isShorts) {
      // SHORTS: Jess BÜYÜK orta-alt (banner altında, alt rozetlerin üstünde)
      jessW = 900;
      const jessMeta = await sharp(jessYol).resize(jessW, jessW, { fit: "inside" }).metadata();
      // Banner: 250-570, Alt rozetler: 1700+, Jess: 600-1700 arası
      jessLeft = (finalW - jessMeta.width) / 2;
      jessTop = 580; // Banner'ın hemen altında başlasın
      // Eğer Jess banner'ın altına sığmıyorsa, biraz aşağı kaydır
      if (jessTop + jessMeta.height > finalH - 100) {
        jessTop = finalH - jessMeta.height - 80;
      }
    } else {
      // LONG: Jess sol alt köşede (sağ panel metin olduğu için sol kısımda)
      jessW = 480;
      const jessMeta = await sharp(jessYol).resize(jessW, jessW, { fit: "inside" }).metadata();
      jessLeft = 60;
      jessTop = finalH - jessMeta.height - 30;
    }
    
    const jessResized = await sharp(jessYol)
      .resize(jessW, jessW, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    
    layers.push({
      input: jessResized,
      top: Math.round(jessTop),
      left: Math.round(jessLeft),
    });
  }
  
  // Compose final
  const final = await sharp(bgResized)
    .composite(layers)
    .jpeg({ quality: 92 })
    .toBuffer();
  
  return final;
}

// MAIN
async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    
    const job = await jobOku(JOB_ID);
    if (!job) throw new Error("Job bulunamadı");
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    const saAuth = getServiceAccountAuth();
    
    const format = await formatTespit(job.drive_folder_id, saAuth);
    console.log(`📺 Format: ${format}`);
    
    // Kısa başlık - Sheets'teki thumbnail_baslik kolonundan al
    // Yoksa konu'dan otomatik üret
    let baslikKisa = job.thumbnail_baslik;
    if (!baslikKisa || baslikKisa.length < 3) {
      // Fallback: konu'dan üret
      const konuTemiz = (job.konu || "").replace(/[:!?].*$/g, "").trim();
      const kelimeler = konuTemiz.split(/\s+/).slice(0, 2);
      baslikKisa = (kelimeler.join(" ") + " QUIZ").toUpperCase();
    }
    console.log(`📝 Thumbnail başlığı: "${baslikKisa}"`);
    
    await jobGuncelle(JOB_ID, { thumb_status: "running" });
    
    const hesaplar = getCfAccounts();
    if (hesaplar.length === 0) throw new Error("Cloudflare hesap yok");
    
    // Jess PNG indir (correct pose tercih)
    const jessYol = path.join(TMP_DIR, "jess.png");
    const jessIndirildi = await jessIntroIndir(saAuth, jessYol);
    if (jessIndirildi) {
      console.log("✓ Jess karakteri indirildi");
    } else {
      console.log("⚠ Jess karakteri yok");
    }
    
    const prompt = job.thumbnail_prompt || job.konu;
    console.log(`🎨 BG prompt: "${prompt.substring(0, 80)}..."`);
    
    let buffer;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buffer = await thumbnailUret(prompt, jessIndirildi, baslikKisa, format, hesaplar[attempt % hesaplar.length]);
        break;
      } catch (e) {
        console.error(`Deneme ${attempt + 1}: ${e.message}`);
        if (attempt === 2) throw e;
        await delay(5000);
      }
    }
    
    // Drive'a yükle
    const filename = `thumbnail-${format}-${Date.now()}.jpg`;
    const filepath = path.join(TMP_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    
    let thumbKlasor = await driveAltKlasorBul("05-thumbnail", job.drive_folder_id);
    let thumbKlasorId;
    if (thumbKlasor.length === 0) {
      const { driveKlasorAc } = await import("./lib/google.js");
      const yeni = await driveKlasorAc("05-thumbnail", job.drive_folder_id);
      thumbKlasorId = yeni.id;
    } else {
      thumbKlasorId = thumbKlasor[0].id;
    }
    
    const yuklenen = await driveDosyaYukle(
      { filename, filepath },
      thumbKlasorId,
      "image/jpeg"
    );
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    
    await jobGuncelle(JOB_ID, { thumb_status: `completed:${(buffer.length / 1024).toFixed(0)}KB` });
    
    await telegram(
      job.chat_id,
      `🖼 *Thumbnail ready!* (${format})\n` +
      `📝 "${baslikKisa}"\n` +
      `📦 ${(buffer.length / 1024).toFixed(0)}KB\n` +
      `📂 [View](${yuklenen.link})`
    );
    
    console.log("✅ Thumbnail tamam");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { thumb_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *05-Thumbnail error:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
