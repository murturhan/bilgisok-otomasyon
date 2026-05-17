/**
 * 05 - Thumbnail Üretimi v8 (GeniMini Kids Quiz)
 * v7'den farkı:
 * - Format'a göre boyut dinamik:
 *   - Shorts (dikey): 1080×1920 (9:16)
 *   - Long (yatay): 1280×720 (16:9)
 * - Tasarım her iki formata uyarlandı (dikeyde alt-üst, yatayda sol-sağ)
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

// Format tespit
async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

// Başlık 2 satıra böl
function basligiBol(baslikTam) {
  // Emoji'yi temizle
  const temiz = baslikTam.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}]/gu, "").trim();
  
  // : varsa ondan böl
  if (temiz.includes(":")) {
    const [ana, alt] = temiz.split(":", 2);
    return { ana: ana.trim().toUpperCase(), alt: alt.trim() };
  }
  
  // Yoksa kelime başı uzun cümleyi ortadan böl
  const words = temiz.split(" ");
  if (words.length <= 4) {
    return { ana: temiz.toUpperCase(), alt: "" };
  }
  
  const mid = Math.ceil(words.length / 2);
  return {
    ana: words.slice(0, mid).join(" ").toUpperCase(),
    alt: words.slice(mid).join(" "),
  };
}

// SVG metin overlay - Shorts (dikey 1080x1920)
function metinSvgShorts(baslikTam) {
  const { ana, alt } = basligiBol(baslikTam);
  const width = 1080;
  const height = 1920;
  
  // Üst yarıda mavi şerit, alt yarıda Jess olacak
  // Metin: üst kısımda büyük
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Üst yarıda yarı şeffaf yatay şerit (metin bloğu)
  svg += `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(123, 76, 221, 0.92)"/>
      <stop offset="100%" stop-color="rgba(255, 87, 166, 0.92)"/>
    </linearGradient>
  </defs>`;
  
  // Üst banner
  const bannerY = 200;
  const bannerH = 600;
  svg += `<rect x="0" y="${bannerY}" width="${width}" height="${bannerH}" fill="url(#bgGrad)"/>`;
  svg += `<rect x="0" y="${bannerY}" width="${width}" height="12" fill="#FFD700"/>`;
  svg += `<rect x="0" y="${bannerY + bannerH - 12}" width="${width}" height="12" fill="#FFD700"/>`;
  
  // Ana başlık (büyük sarı)
  const anaFontSize = ana.length > 16 ? 110 : 140;
  const anaWords = ana.split(" ");
  
  let anaSatirlar = [];
  if (anaWords.length <= 3 && ana.length <= 18) {
    anaSatirlar = [ana];
  } else {
    // 2 satıra böl
    const mid = Math.ceil(anaWords.length / 2);
    anaSatirlar = [
      anaWords.slice(0, mid).join(" "),
      anaWords.slice(mid).join(" "),
    ];
  }
  
  const anaY = bannerY + 150;
  anaSatirlar.forEach((satir, i) => {
    svg += `<text x="${width/2}" y="${anaY + i * (anaFontSize + 20)}"
              font-family="Lilita One, Comic Sans MS, Arial Black, sans-serif"
              font-size="${anaFontSize}" font-weight="900" fill="#FFD700"
              stroke="#000000" stroke-width="8" paint-order="stroke"
              text-anchor="middle">${escapeXml(satir)}</text>`;
  });
  
  // Alt başlık (beyaz, küçük)
  if (alt) {
    const altY = bannerY + bannerH - 80;
    svg += `<text x="${width/2}" y="${altY}"
              font-family="Lilita One, Comic Sans MS, Arial, sans-serif"
              font-size="56" font-weight="700" fill="#FFFFFF"
              stroke="#000000" stroke-width="4" paint-order="stroke"
              text-anchor="middle">${escapeXml(alt)}</text>`;
  }
  
  // QUIZ! rozeti - sağ üst
  svg += `<g transform="translate(${width - 140}, 130)">
    <circle cx="0" cy="0" r="90" fill="#FF5722" stroke="#000000" stroke-width="8"/>
    <text x="0" y="20" font-family="Lilita One, Comic Sans MS, sans-serif"
          font-size="54" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke">QUIZ!</text>
  </g>`;
  
  // Soru işareti - sol üst
  svg += `<g transform="translate(120, 130)">
    <circle cx="0" cy="0" r="80" fill="#4FC3F7" stroke="#000000" stroke-width="8"/>
    <text x="0" y="30" font-family="Lilita One, Comic Sans MS, sans-serif"
          font-size="100" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="4" paint-order="stroke">?</text>
  </g>`;
  
  svg += `</svg>`;
  return svg;
}

// SVG metin overlay - Long (yatay 1280x720)
function metinSvgLong(baslikTam) {
  const { ana, alt } = basligiBol(baslikTam);
  const width = 1280;
  const height = 720;
  
  // Sağ yarıda metin bloğu
  const blokGenislik = 640;
  const blokX = width - blokGenislik;
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  svg += `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(123, 76, 221, 0.92)"/>
      <stop offset="100%" stop-color="rgba(255, 87, 166, 0.92)"/>
    </linearGradient>
  </defs>`;
  
  // Sağ panel
  svg += `<rect x="${blokX}" y="0" width="${blokGenislik}" height="${height}" fill="url(#bgGrad)"/>`;
  svg += `<rect x="${blokX}" y="0" width="8" height="${height}" fill="#FFD700"/>`;
  
  // Ana metin - sağ panelin ortasında
  const anaFontSize = ana.length > 16 ? 70 : 90;
  const anaWords = ana.split(" ");
  let anaSatirlar = [];
  if (ana.length <= 14) {
    anaSatirlar = [ana];
  } else {
    const mid = Math.ceil(anaWords.length / 2);
    anaSatirlar = [
      anaWords.slice(0, mid).join(" "),
      anaWords.slice(mid).join(" "),
    ];
  }
  
  const anaY = height/2 - (alt ? 30 : 0);
  anaSatirlar.forEach((satir, i) => {
    svg += `<text x="${blokX + blokGenislik/2}" y="${anaY + i * (anaFontSize + 15)}"
              font-family="Lilita One, Comic Sans MS, Arial Black, sans-serif"
              font-size="${anaFontSize}" font-weight="900" fill="#FFD700"
              stroke="#000000" stroke-width="6" paint-order="stroke"
              text-anchor="middle">${escapeXml(satir)}</text>`;
  });
  
  if (alt) {
    const altY = height/2 + anaSatirlar.length * (anaFontSize + 15) + 30;
    svg += `<text x="${blokX + blokGenislik/2}" y="${altY}"
              font-family="Lilita One, Comic Sans MS, Arial, sans-serif"
              font-size="38" font-weight="700" fill="#FFFFFF"
              stroke="#000000" stroke-width="3" paint-order="stroke"
              text-anchor="middle">${escapeXml(alt)}</text>`;
  }
  
  // QUIZ! rozeti sol üst (Jess'in üzerinde değil, FLUX bg kısmında)
  svg += `<g transform="translate(120, 80)">
    <circle cx="0" cy="0" r="55" fill="#FF5722" stroke="#000000" stroke-width="5"/>
    <text x="0" y="13" font-family="Lilita One, Comic Sans MS, sans-serif"
          font-size="32" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="2" paint-order="stroke">QUIZ!</text>
  </g>`;
  
  // ? rozet sağ alt - metnin alt köşesi
  svg += `<g transform="translate(${width - 80}, ${height - 80})">
    <circle cx="0" cy="0" r="45" fill="#4FC3F7" stroke="#000000" stroke-width="5"/>
    <text x="0" y="16" font-family="Lilita One, Comic Sans MS, sans-serif"
          font-size="54" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke">?</text>
  </g>`;
  
  svg += `</svg>`;
  return svg;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// FLUX bg üret
async function fluxBgUret(prompt, hesap, format) {
  const dim = format === "shorts" 
    ? { width: 1024, height: 1792 }  // 9:16 yaklaşık (FLUX desteklediği boyut)
    : { width: 1280, height: 720 };
  
  const promptIyilestirilmis = `Empty scenic background only depicting ${prompt}, EMPTY LANDSCAPE, ABSOLUTELY NO LIVING CREATURES, NO ANIMALS WHATSOEVER, NO HUMANS, NO CARTOON CHARACTERS, NO MASCOTS, NO CREATURE FACES, just empty natural environment with terrain, plants, sky, water, or man-made structures. Pixar 3D animation style background environment, kid-friendly, bright cheerful colors, daylight. ${format === "shorts" ? "9:16 vertical aspect ratio" : "16:9 cinematic widescreen"}. NO TEXT, NO WORDS, NO LETTERS, NO LOGOS. Style: like an empty Pixar scene before characters enter.`;
  
  const buffer = await fluxCagri(promptIyilestirilmis, hesap, dim);
  console.log(`  ✓ FLUX bg: ${(buffer.length / 1024).toFixed(0)}KB (${dim.width}x${dim.height})`);
  return buffer;
}

// Jess intro PNG'sini Drive'dan indir
async function jessIntroIndir(auth, hedefYol) {
  if (!GDRIVE_JESS_FOLDER_ID) return null;
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${GDRIVE_JESS_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
    pageSize: 50,
  });
  if (!res.data.files) return null;
  
  // Önce jess-intro, yoksa ilk png
  let target = res.data.files.find(f => f.name.toLowerCase().includes("intro") && f.name.toLowerCase().endsWith(".png"));
  if (!target) {
    target = res.data.files.find(f => f.name.toLowerCase().endsWith(".png"));
  }
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
async function thumbnailUret(prompt, jessThumbYol, baslik, format, hesap) {
  const isShorts = format === "shorts";
  const finalW = isShorts ? 1080 : 1280;
  const finalH = isShorts ? 1920 : 720;
  
  // 1. FLUX bg
  const fluxBuffer = await fluxBgUret(prompt, hesap, format);
  
  // 2. BG'yi hedef boyuta resize
  const bgResized = await sharp(fluxBuffer)
    .resize(finalW, finalH, { fit: "cover" })
    .toBuffer();
  
  // 3. SVG metin overlay
  const svg = isShorts ? metinSvgShorts(baslik) : metinSvgLong(baslik);
  const svgBuffer = Buffer.from(svg);
  
  // 4. Compose
  const layers = [
    { input: svgBuffer, top: 0, left: 0 },
  ];
  
  // 5. Jess overlay (boyut + konum format'a göre)
  if (jessThumbYol && fs.existsSync(jessThumbYol)) {
    let jessW, jessTop, jessLeft;
    
    if (isShorts) {
      // Dikey: Jess alt yarıda, ortalı, büyük (~600px)
      jessW = 700;
      const jessMeta = await sharp(jessThumbYol).resize(jessW, jessW, { fit: "inside" }).metadata();
      jessTop = finalH - jessMeta.height - 80; // alt boşluk
      jessLeft = (finalW - jessMeta.width) / 2;
    } else {
      // Yatay: sol alt köşede (320px)
      jessW = 320;
      const jessMeta = await sharp(jessThumbYol).resize(jessW, jessW, { fit: "inside" }).metadata();
      jessTop = finalH - jessMeta.height - 30;
      jessLeft = 40;
    }
    
    const jessResized = await sharp(jessThumbYol)
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
    
    // Format tespit
    const format = await formatTespit(job.drive_folder_id, saAuth);
    console.log(`📺 Format: ${format}`);
    
    await jobGuncelle(JOB_ID, { thumb_status: "running" });
    
    // Cloudflare hesapları
    const hesaplar = getCfAccounts();
    if (hesaplar.length === 0) throw new Error("Cloudflare hesap yok");
    
    // Jess intro PNG'sini indir
    const jessYol = path.join(TMP_DIR, "jess.png");
    const jessIndirildi = await jessIntroIndir(saAuth, jessYol);
    if (jessIndirildi) {
      console.log("✓ Jess thumbnail karakteri indirildi");
    } else {
      console.log("⚠ Jess karakteri yok, sadece bg + metin");
    }
    
    // Thumbnail üret
    const prompt = job.thumbnail_prompt || job.konu;
    console.log(`🎨 Üretiliyor: "${prompt.substring(0, 80)}..."`);
    
    let buffer;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buffer = await thumbnailUret(prompt, jessIndirildi, job.baslik, format, hesaplar[attempt % hesaplar.length]);
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
