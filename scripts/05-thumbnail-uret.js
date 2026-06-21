// REV 015/22JUN26 - Drive questions.json'dan thumbnail_question+options_visual oku (Sheets sütun yok fallback)
/**
 * 05 - Thumbnail Üretimi v14 (Soru Kapağı Layout)
 *
 * Layout (1280x720 long):
 *   ┌────────────────────────────────────────────────────────┐
 *   │  SARI BANT │ "Where did this food come from?"         │  ~20%
 *   ├────────────┬───────────────────┬────────────────────── ┤
 *   │ [A] Italy  │  [B] France       │  [C] USA             │  ~80%
 *   │  🇮🇹 flag  │   🇫🇷 flag       │   🇺🇸 flag           │
 *   │   ITALY    │    FRANCE         │    USA               │
 *   └────────────┴───────────────────┴──────────────────────┘
 *
 * Input:
 *   job.thumbnail_question      — jenerik soru metni (** temizlenmiş)
 *   job.thumbnail_options_visual — JSON: [{label, type:"flag"|"flux", code|prompt}, ...]
 * Fallback: thumbnail_baslik + thumbnail_optionlar (önceki format)
 *
 * Upload: Drive "05-thumbnail" + Telegram bildirimi
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

/** ** ve * markdown işaretlerini temizle */
function cleanMarkdown(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  return (res.data.name || "").toLowerCase().includes("-shorts-") ? "shorts" : "long";
}

/**
 * Drive'daki questions.json'u oku (02-ses veya ana klasörden).
 * thumbnail_question ve thumbnail_options_visual alanlarını döndürür.
 */
async function questionsJsonOku(driveFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const aramaYerleri = [];

  // 1. 02-ses alt klasörü
  const sesRes = await drive.files.list({
    q: `'${driveFolderId}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
  });
  if (sesRes.data.files?.length) {
    aramaYerleri.push(sesRes.data.files[0].id);
  }
  // 2. Ana klasör
  aramaYerleri.push(driveFolderId);

  for (const klasorId of aramaYerleri) {
    const jsonRes = await drive.files.list({
      q: `'${klasorId}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id)",
      pageSize: 1,
    });
    if (!jsonRes.data.files?.length) continue;
    const fileId = jsonRes.data.files[0].id;
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    console.log("  ✓ questions.json Drive'dan okundu");
    return data;
  }
  return null;
}

// ─── GÖRSEL KAYNAK ────────────────────────────────────────────────────────────

/** ISO kodu → Twemoji SVG URL */
function flagSvgUrl(isoCode) {
  const upper = isoCode.toUpperCase();
  const cp1 = (0x1f1e6 + upper.charCodeAt(0) - 65).toString(16);
  const cp2 = (0x1f1e6 + upper.charCodeAt(1) - 65).toString(16);
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${cp1}-${cp2}.svg`;
}

/** URL'den buffer indir (fetch — Node 18+) */
async function downloadImage(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Seçenek için görsel buffer üret.
 * type:"flag" → Twemoji SVG indir + sharp render
 * type:"flux" → FLUX çağrısı
 */
async function renderOptionImage(opt, hesap) {
  if (opt.type === "flag" && opt.code) {
    const url = flagSvgUrl(opt.code);
    console.log(`  🏳 Bayrak indir: ${opt.label} (${opt.code}) → ${url}`);
    const svgBuf = await downloadImage(url);
    // density=1200 → ~600px (36px viewBox * 1200/72)
    return await sharp(svgBuf, { density: 1200 }).png().toBuffer();
  }

  if (opt.type === "flux" && opt.prompt) {
    const fullPrompt =
      `${opt.prompt}, isolated subject, plain white or very light gray background, ` +
      `vivid saturated colors, sharp focus, photorealistic, no text, no watermarks`;
    console.log(`  🎨 FLUX: ${opt.label}`);
    return await fluxCagri(fullPrompt, hesap, { width: 512, height: 512 });
  }

  // Fallback: beyaz boş resim
  console.warn(`  ⚠ Görsel kaynağı belirsiz (${opt.label}), boş kullanılıyor`);
  return await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 240, g: 240, b: 240 } },
  }).png().toBuffer();
}

// ─── SVG HELPERS ──────────────────────────────────────────────────────────────

/**
 * Üst bant SVG (tam kanvas boyutunda, sadece bant alanı dolu — alt şeffaf).
 * bandH ≈ %20 × H
 */
function svgTopBand(question, W, H, bandH) {
  const text = cleanMarkdown(question).toUpperCase();

  // Font boyutu: tek satıra sığdır, max 88px
  const fsSingle = Math.min(88, Math.floor((W * 0.86) / Math.max(text.length * 0.56, 1)));
  let lines, fontSize;
  if (fsSingle >= 62 || text.split(/\s+/).length <= 3) {
    lines = [text];
    fontSize = Math.max(52, fsSingle);
  } else {
    const words = text.split(/\s+/);
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    const maxLen = Math.max(lines[0].length, lines[1].length);
    fontSize = Math.max(40, Math.min(70, Math.floor((W * 0.86) / Math.max(maxLen * 0.56, 1))));
  }

  const lineH = fontSize * 1.05;
  const totalH = lines.length * lineH;
  const startY = (bandH - totalH) / 2 + fontSize * 0.82;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  // Sarı bant
  svg += `<rect x="0" y="0" width="${W}" height="${bandH}" fill="#FFD600"/>`;
  // Kalın siyah alt çerçeve
  svg += `<rect x="0" y="${bandH - 10}" width="${W}" height="10" fill="#1A1A1A"/>`;
  // Soru metni — kalın, siyah, beyaz strok
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    svg += `<text
      x="${W / 2}" y="${y}"
      font-family="Lilita One, Fredoka, Impact, Arial Black, sans-serif"
      font-size="${fontSize}" font-weight="900" fill="#1A1A1A"
      text-anchor="middle"
      stroke="#FFFFFF" stroke-width="5" paint-order="stroke"
    >${escapeXml(line)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

/**
 * Seçenek overlay SVG: A/B/C rozetler + alt sarı etiket + dikey siyah ayraçlar.
 * Şeffaf arka plan — compositing'de option görselleri üstüne bindirilir.
 */
function svgOptionOverlay(optionlar, W, H, bandH) {
  const n = optionlar.length;
  const colW = Math.floor(W / n);
  const bottomH = H - bandH;
  const BADGE_R = 46;
  const LABEL_H = 78;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  optionlar.forEach((opt, i) => {
    const colX = i * colW;
    const thisColW = i === n - 1 ? W - colX : colW;

    // Dikey siyah ayraç
    if (i > 0) {
      svg += `<rect x="${colX - 5}" y="${bandH}" width="10" height="${bottomH}" fill="#1A1A1A"/>`;
    }

    // A/B/C rozeti — sol üst köşe
    const bCX = colX + BADGE_R + 16;
    const bCY = bandH + BADGE_R + 16;
    svg += `<circle cx="${bCX}" cy="${bCY}" r="${BADGE_R + 8}" fill="#1A1A1A"/>`;
    svg += `<circle cx="${bCX}" cy="${bCY}" r="${BADGE_R}" fill="#FFD600"/>`;
    svg += `<text
      x="${bCX}" y="${bCY + 19}"
      font-family="Lilita One, Fredoka, Impact, Arial Black, sans-serif"
      font-size="54" font-weight="900" fill="#1A1A1A"
      text-anchor="middle"
    >${BADGE_LETTERS[i]}</text>`;

    // Alt etiket kutusu (koyu arka plan)
    svg += `<rect x="${colX}" y="${H - LABEL_H}" width="${thisColW}" height="${LABEL_H}" fill="#1A1A1A" fill-opacity="0.80"/>`;

    // Şık ismi
    const name = cleanMarkdown(opt.label).toUpperCase();
    const nfs = Math.min(54, Math.max(28, Math.floor((thisColW * 0.76) / Math.max(name.length * 0.6, 1))));
    svg += `<text
      x="${colX + thisColW / 2}" y="${H - LABEL_H * 0.24}"
      font-family="Lilita One, Fredoka, Impact, Arial Black, sans-serif"
      font-size="${nfs}" font-weight="900" fill="#FFD600"
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
 *   question      — üst banttaki jenerik soru
 *   optionsVisual — [{label, type, code?|prompt?}, ...]
 *   format        — "long" | "shorts"
 *   hesaplar      — CF hesap listesi
 *   jobSeed       — renk/davranış seed
 */
async function thumbnailUret({ question, optionsVisual, format, hesaplar, jobSeed }) {
  // Shorts şimdilik devre dışı (CLAUDE.md) — long olarak üret
  const W = 1280;
  const H = 720;
  const bandH = Math.floor(H * 0.20); // ~144px üst bant
  const bottomH = H - bandH;           // ~576px alt bölüm

  const n = Math.min(3, Math.max(1, optionsVisual.length));
  const opts = optionsVisual.slice(0, n);

  // 1) Her seçenek için görsel (paralel)
  console.log(`  📸 ${n} seçenek görseli üretiliyor...`);
  const optionBuffers = await Promise.all(
    opts.map((opt, i) =>
      renderOptionImage(opt, hesaplar[i % hesaplar.length]).catch((e) => {
        console.warn(`  ⚠ "${opt.label}" görsel hata: ${e.message}`);
        return null;
      })
    )
  );

  // 2) Arka plan: beyaz (flag türünde net görünüm için) veya açık mavi
  const h = seedHash(jobSeed);
  const bgColor = h % 2 === 0 ? "#F0F4FF" : "#FFF8F0";
  const bgBuf = await sharp(
    Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="${bgColor}"/>
    </svg>`)
  ).png().toBuffer();

  const layers = [];

  // 3) Seçenek görselleri yan yana (alt bölümde)
  const colW = Math.floor(W / n);
  for (let i = 0; i < n; i++) {
    if (!optionBuffers[i]) continue;
    const thisColW = i === n - 1 ? W - i * colW : colW;
    // contain: oran korunsun, beyaz padding ile doldur
    const resized = await sharp(optionBuffers[i])
      .resize(thisColW, bottomH, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 255 },
      })
      .toBuffer();
    layers.push({ input: resized, left: i * colW, top: bandH });
  }

  // 4) Üst bant (soru metni)
  const bandSvg = svgTopBand(question, W, H, bandH);
  layers.push({ input: Buffer.from(bandSvg), left: 0, top: 0 });

  // 5) Overlay: rozetler + isimler + ayraçlar
  const overlaySvg = svgOptionOverlay(opts, W, H, bandH);
  layers.push({ input: Buffer.from(overlaySvg), left: 0, top: 0 });

  return await sharp(bgBuf)
    .composite(layers)
    .jpeg({ quality: 93 })
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

    await jobGuncelle(JOB_ID, { thumb_status: "running" });

    const hesaplar = getCfAccounts();
    if (hesaplar.length === 0) throw new Error("Cloudflare hesap yok");

    // Drive'dan questions.json oku (Sheets'te olmayan alanlar buradan gelir)
    let qJson = null;
    try {
      qJson = await questionsJsonOku(job.drive_folder_id, saAuth);
    } catch (e) {
      console.warn(`  ⚠ Drive questions.json okunamadı: ${e.message}`);
    }

    // Soru metni: Drive > Sheets thumbnail_baslik > konu
    const question = cleanMarkdown(
      qJson?.thumbnail_question || job.thumbnail_baslik || job.konu || "Which is the best?"
    );
    console.log(`❓ Soru: "${question}"`);

    // Seçenek görselleri — 4 aşamalı fallback zinciri:
    // 1) Drive questions.json thumbnail_options_visual
    // 2) Sheets job.thumbnail_options_visual (JSON)
    // 3) Drive questions.json thumbnail_optionlar
    // 4) Drive questions.json'daki ilk sorunun options[] dizisinden otomatik türet
    let optionsVisual = [];

    if (Array.isArray(qJson?.thumbnail_options_visual) && qJson.thumbnail_options_visual.length >= 2) {
      optionsVisual = qJson.thumbnail_options_visual;
      console.log("  ✓ Kaynak: Drive questions.json thumbnail_options_visual");
    } else if (job.thumbnail_options_visual) {
      try {
        const parsed = JSON.parse(job.thumbnail_options_visual);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          optionsVisual = parsed;
          console.log("  ✓ Kaynak: Sheets thumbnail_options_visual");
        }
      } catch (_) {}
    }

    if (optionsVisual.length < 2 && Array.isArray(qJson?.thumbnail_optionlar) && qJson.thumbnail_optionlar.length >= 2) {
      optionsVisual = qJson.thumbnail_optionlar.map((opt) => ({
        label: String(opt),
        type: "flux",
        prompt: `${opt} isolated on plain white background, vivid colors, no text`,
      }));
      console.log("  ✓ Kaynak: Drive questions.json thumbnail_optionlar → FLUX fallback");
    }

    if (optionsVisual.length < 2) {
      // Son fallback: ilk sorunun options dizisinden türet
      const firstQ = qJson?.questions?.find((q) => !q.question_type || q.question_type === "multiple_choice");
      const opts = firstQ?.options || [];
      if (opts.length >= 2) {
        optionsVisual = opts.slice(0, 3).map((opt) => ({
          label: String(opt),
          type: "flux",
          prompt: `${opt} isolated on plain white background, vivid colors, no text`,
        }));
        console.log("  ✓ Kaynak: ilk soru options[] → FLUX fallback");
      }
    }

    if (optionsVisual.length < 2) {
      // Absolute fallback: konu kelimelerinden üret, hiç olmasa da çalışsın
      const words = (job.konu || job.baslik || "Option").split(/\s+/).filter(Boolean);
      optionsVisual = [words[0] || "A", words[1] || "B"].map((w) => ({
        label: w,
        type: "flux",
        prompt: `${w} isolated on plain white background, vivid colors, no text`,
      }));
      console.warn("  ⚠ Absolute fallback: konu kelimelerinden seçenek üretildi");
    }

    console.log(`🔠 Seçenekler: ${optionsVisual.map((o) => o.label).join(" | ")}`);

    let buffer;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buffer = await thumbnailUret({
          question,
          optionsVisual,
          format,
          hesaplar,
          jobSeed: String(JOB_ID || question),
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
    console.log(`📁 ${filepath} (${(buffer.length / 1024).toFixed(0)}KB)`);

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
        `❓ "${question}"\n` +
        `🔠 ${optionsVisual.map((o) => o.label).join(" | ")}\n` +
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
    } catch (_) {}
    process.exit(1);
  }
}

const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) main();

export { thumbnailUret, svgTopBand, svgOptionOverlay, cleanMarkdown };
