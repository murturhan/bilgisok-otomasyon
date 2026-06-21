// REV 013/21JUN26 - Quiz Blitz layout: soru üstte bant + ABC seçenek görselleri altta yan yana
/**
 * 05 - Thumbnail Üretimi v13 (Quiz Blitz Layout)
 *
 * Layout (1280x720 long):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │   SARI/KIRMIZI BANT  │  "Whose Bite Is Strongest?"     │  ~28%
 *   ├──────────────────────┼──────────────────────────────────┤
 *   │   [A]  SHARK         │  [B]  ALLIGATOR                 │  ~72%
 *   │   FLUX per-seçenek   │  FLUX per-seçenek               │
 *   └──────────────────────┴──────────────────────────────────┘
 *
 * Input:  job.thumbnail_baslik (soru metni), job.thumbnail_optionlar (JSON dizi)
 * Output: 1280x720 JPG (long) — Shorts format şimdilik devre dışı (CLAUDE.md)
 * Upload: Drive "05-thumbnail" alt klasörü + Telegram bildirimi
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

const { JOB_ID } = process.env;
const TMP_DIR = "/tmp/thumbnail";

const BADGE_LETTERS = ["A", "B", "C"];
// Band rengi seed'e göre seçilir
const BAND_COLORS = ["#FFD600", "#E63946"];
// Arka plan rengi (seçenek görsellerin arkasında görünen)
const BG_COLORS = ["#5BE0FF", "#7FFF7F", "#FFB347"];

// ─── UTILS ────────────────────────────────────────────────────────────────────

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function seedHash(str) {
  let h = 0;
  for (const c of String(str || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

// ─── FLUX PER-OPTİON ─────────────────────────────────────────────────────────

async function fluxOptionUret(option, hesap) {
  const prompt =
    `${option}, dramatic hero pose, isolated subject on plain light background, ` +
    `vivid saturated colors, bright studio lighting, sharp focus, photorealistic, ` +
    `no text, no watermarks, no logos, kid-friendly`;
  const buffer = await fluxCagri(prompt, hesap, { width: 512, height: 512 });
  console.log(`  ✓ FLUX "${option}": ${(buffer.length / 1024).toFixed(0)}KB`);
  return buffer;
}

// ─── SVG HELPERS ──────────────────────────────────────────────────────────────

/**
 * Soru metnini bant yüksekliğine göre 1 veya 2 satıra böler.
 * fontSize hesaplar: tek satır ≥70px tutabiliyorsa 1 satır, değilse 2.
 */
function calcBaslikLayout(text, W, bandH) {
  const upper = String(text).toUpperCase().trim();
  const words = upper.split(/\s+/);

  const fsSingle = Math.min(88, Math.floor((W * 0.88) / (upper.length * 0.56)));
  if (fsSingle >= 68 || words.length <= 3) {
    return { lines: [upper], fontSize: Math.max(56, fsSingle) };
  }

  // 2 satır
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(" ");
  const line2 = words.slice(mid).join(" ");
  const maxLen = Math.max(line1.length, line2.length);
  const fs2 = Math.min(72, Math.floor((W * 0.88) / (maxLen * 0.56)));
  return { lines: [line1, line2], fontSize: Math.max(44, fs2) };
}

/**
 * Üst bant SVG (W×H tam boyut, sadece üst bant alanı dolu — alt kısım şeffaf).
 */
function svgTopBand(baslik, W, H, bandH, bandColor) {
  const { lines, fontSize } = calcBaslikLayout(baslik, W, bandH);
  const lineH = fontSize * 1.05;
  const totalTextH = lines.length * lineH;
  const startY = (bandH - totalTextH) / 2 + fontSize * 0.82;

  // Bant metin rengi: sarı bantta koyu, kırmızı bantta beyaz
  const textFill = bandColor === "#FFD600" ? "#1A1A1A" : "#FFFFFF";
  const strokeColor = bandColor === "#FFD600" ? "#FFFFFF" : "#000000";

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  // Bant arka planı
  svg += `<rect x="0" y="0" width="${W}" height="${bandH}" fill="${bandColor}"/>`;
  // Alt kenarda siyah şerit (ayrıcı)
  svg += `<rect x="0" y="${bandH - 8}" width="${W}" height="8" fill="#1A1A1A"/>`;

  // Soru metni
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    svg += `<text
      x="${W / 2}" y="${y}"
      font-family="Lilita One, Fredoka, Impact, Arial Black, sans-serif"
      font-size="${fontSize}" font-weight="900" fill="${textFill}"
      text-anchor="middle"
      stroke="${strokeColor}" stroke-width="5" paint-order="stroke"
    >${escapeXml(line)}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

/**
 * Seçenek overlay SVG: A/B/C rozetleri + alt etiket + dikey ayraçlar.
 * Tam boyut (W×H), şeffaf arka plan.
 */
function svgOptionLabels(optionlar, W, H, bandH) {
  const n = optionlar.length;
  const colW = Math.floor(W / n);
  const bottomH = H - bandH;
  const BADGE_R = 42;
  const LABEL_H = 72;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  optionlar.forEach((opt, i) => {
    const colX = i * colW;
    const thisColW = i === n - 1 ? W - colX : colW;

    // Dikey ayraç (ilk sütundan sonra)
    if (i > 0) {
      svg += `<rect x="${colX - 4}" y="${bandH}" width="8" height="${bottomH}" fill="#1A1A1A"/>`;
    }

    // A/B/C rozeti — sütunun sol üst köşesinde
    const bCX = colX + BADGE_R + 18;
    const bCY = bandH + BADGE_R + 18;
    // Siyah çember (kontur)
    svg += `<circle cx="${bCX}" cy="${bCY}" r="${BADGE_R + 7}" fill="#1A1A1A"/>`;
    // Sarı iç
    svg += `<circle cx="${bCX}" cy="${bCY}" r="${BADGE_R}" fill="#FFD600"/>`;
    // Harf
    svg += `<text
      x="${bCX}" y="${bCY + 18}"
      font-family="Lilita One, Fredoka, Impact, Arial Black, sans-serif"
      font-size="50" font-weight="900" fill="#1A1A1A"
      text-anchor="middle"
    >${BADGE_LETTERS[i]}</text>`;

    // Alt etiket bandı (yarı saydam siyah)
    svg += `<rect
      x="${colX}" y="${H - LABEL_H}"
      width="${thisColW}" height="${LABEL_H}"
      fill="#000000" fill-opacity="0.68"
    />`;

    // Seçenek ismi
    const name = String(opt).toUpperCase();
    const nameFontSize = Math.min(50, Math.max(28, Math.floor((thisColW * 0.78) / (name.length * 0.6))));
    svg += `<text
      x="${colX + thisColW / 2}" y="${H - LABEL_H * 0.28}"
      font-family="Lilita One, Fredoka, Impact, Arial Black, sans-serif"
      font-size="${nameFontSize}" font-weight="900" fill="#FFD600"
      text-anchor="middle"
      stroke="#000000" stroke-width="3" paint-order="stroke"
    >${escapeXml(name)}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// ─── ANA ÜRETIM ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 *   baslik     - soru metni (üst bantta)
 *   optionlar  - string[] 2-3 seçenek adı
 *   format     - "long" | "shorts"
 *   hesaplar   - Cloudflare hesap listesi
 *   jobSeed    - renk seçimi için seed string
 */
async function thumbnailUret({ baslik, optionlar, format, hesaplar, jobSeed }) {
  // Shorts devre dışı (CLAUDE.md) — aynı layout long olarak işle
  const W = 1280;
  const H = 720;
  const bandH = Math.floor(H * 0.28); // ~202px
  const bottomH = H - bandH;           // ~518px

  // Renk seçimi
  const h = seedHash(jobSeed);
  const bandColor = BAND_COLORS[h % BAND_COLORS.length];
  const bgColor = BG_COLORS[h % BG_COLORS.length];

  const n = Math.min(3, Math.max(1, optionlar.length));
  const opts = optionlar.slice(0, n);

  // 1) Per-seçenek FLUX görselleri (paralel)
  console.log(`  🎨 ${n} FLUX seçenek görseli paralel üretiliyor...`);
  const optionBuffers = await Promise.all(
    opts.map((opt, i) =>
      fluxOptionUret(opt, hesaplar[i % hesaplar.length]).catch((e) => {
        console.warn(`  ⚠ FLUX "${opt}" hata: ${e.message}`);
        return null;
      })
    )
  );

  // 2) Arka plan (düz renk)
  const bgBuf = await sharp(
    Buffer.from(
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${W}" height="${H}" fill="${bgColor}"/>` +
        `</svg>`
    )
  )
    .png()
    .toBuffer();

  const layers = [];

  // 3) Seçenek görselleri yan yana (alt bölüm)
  if (n >= 2) {
    const colW = Math.floor(W / n);
    for (let i = 0; i < n; i++) {
      if (!optionBuffers[i]) continue;
      const thisColW = i === n - 1 ? W - i * colW : colW;
      const resized = await sharp(optionBuffers[i])
        .resize(thisColW, bottomH, { fit: "cover", position: "centre" })
        .toBuffer();
      layers.push({ input: resized, left: i * colW, top: bandH });
    }
  } else if (optionBuffers[0]) {
    // Tek seçenek — tüm alt alanı kapla
    const resized = await sharp(optionBuffers[0])
      .resize(W, bottomH, { fit: "cover" })
      .toBuffer();
    layers.push({ input: resized, left: 0, top: bandH });
  }

  // 4) Üst bant SVG (soru metni)
  const bandSvg = svgTopBand(baslik, W, H, bandH, bandColor);
  layers.push({ input: Buffer.from(bandSvg), left: 0, top: 0 });

  // 5) Seçenek etiketleri SVG (rozetler + isimler + ayraçlar)
  if (n >= 1) {
    const labelSvg = svgOptionLabels(opts, W, H, bandH);
    layers.push({ input: Buffer.from(labelSvg), left: 0, top: 0 });
  }

  return await sharp(bgBuf)
    .composite(layers)
    .jpeg({ quality: 92 })
    .toBuffer();
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

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

    // Başlık
    let baslik = String(job.thumbnail_baslik || "").trim();
    if (!baslik || baslik.length < 3) {
      baslik = `Which ${(job.konu || "").split(/\s+/).slice(0, 2).join(" ")}?`;
    }
    console.log(`📝 Başlık: "${baslik}"`);

    // Seçenekler: thumbnail_optionlar (JSON) → obje_1/obje_2 fallback
    let optionlar = [];
    if (job.thumbnail_optionlar) {
      try {
        optionlar = JSON.parse(job.thumbnail_optionlar);
      } catch (_) {
        optionlar = [];
      }
    }
    if (!Array.isArray(optionlar) || optionlar.length < 2) {
      const o1 = job.thumbnail_obje_1 || "";
      const o2 = job.thumbnail_obje_2 || "";
      if (o1 || o2) {
        optionlar = [o1, o2].filter(Boolean);
      }
    }
    if (optionlar.length < 2) {
      // Son fallback: konudan 2 kelime
      const words = (job.konu || "Quiz").split(/\s+/);
      optionlar = words.length >= 2 ? [words[0], words[1]] : [words[0], "Mystery"];
    }
    console.log(`🔠 Seçenekler: ${JSON.stringify(optionlar)}`);

    await jobGuncelle(JOB_ID, { thumb_status: "running" });

    const hesaplar = getCfAccounts();
    if (hesaplar.length === 0) throw new Error("Cloudflare hesap yok");

    let buffer;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buffer = await thumbnailUret({
          baslik,
          optionlar,
          format,
          hesaplar,
          jobSeed: String(JOB_ID || baslik),
        });
        break;
      } catch (e) {
        console.error(`Deneme ${attempt + 1}: ${e.message}`);
        if (attempt === 2) throw e;
        await delay(5000);
      }
    }

    const filename = `thumbnail-${format}-${Date.now()}.jpg`;
    const filepath = path.join(TMP_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    console.log(`📁 Kaydedildi: ${filepath} (${(buffer.length / 1024).toFixed(0)}KB)`);

    // Drive'a yükle
    let thumbKlasor = await driveAltKlasorBul("05-thumbnail", job.drive_folder_id);
    let thumbKlasorId;
    if (thumbKlasor.length === 0) {
      const { driveKlasorAc } = await import("./lib/google.js");
      const yeni = await driveKlasorAc("05-thumbnail", job.drive_folder_id);
      thumbKlasorId = yeni.id;
    } else {
      thumbKlasorId = thumbKlasor[0].id;
    }

    const yuklenen = await driveDosyaYukle({ filename, filepath }, thumbKlasorId, "image/jpeg");
    fs.rmSync(TMP_DIR, { recursive: true, force: true });

    await jobGuncelle(JOB_ID, {
      thumb_status: `completed:${(buffer.length / 1024).toFixed(0)}KB`,
    });

    await telegram(
      job.chat_id,
      `🖼 *Thumbnail ready!* (${format})\n` +
        `📝 "${baslik}"\n` +
        `🔠 ${optionlar.join(" | ")}\n` +
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
      await jobGuncelle(JOB_ID, {
        thumb_status: `error: ${error.message.substring(0, 100)}`,
      });
      await telegram(
        job.chat_id,
        `❌ *05-Thumbnail error:* ${error.message.substring(0, 300)}`
      );
    } catch (_) {}
    process.exit(1);
  }
}

const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) main();

export { thumbnailUret, svgTopBand, svgOptionLabels, calcBaslikLayout };
