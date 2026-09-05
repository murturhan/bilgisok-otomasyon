// REV 022/05SEP26 - fluxCagri width/height kaldirildi (model desteklemiyor, boyut sharp ile ayarlaniyor)
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

/** ISO kodu → Flagpedia PNG URL (guncel bayraklar, 320px) */
function flagSvgUrl(isoCode) {
  return `https://flagcdn.com/w320/${isoCode.toLowerCase()}.png`;
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
    const pngBuf = await downloadImage(url);
    return await sharp(pngBuf).png().toBuffer();
  }

  if (opt.type === "flux" && opt.prompt) {
    const fullPrompt =
      `${opt.prompt}, isolated subject, NO white background, transparent or dark background, ` +
      `vivid saturated colors, sharp focus, photorealistic, no text, no watermarks`;
    console.log(`  🎨 FLUX: ${opt.label}`);
    // flux-1-schnell width/height KABUL ETMIYOR; boyutlandirma asagida sharp ile yapiliyor
    return await fluxCagri(fullPrompt, hesap, {});
  }

  // Fallback: beyaz boş resim
  console.warn(`  ⚠ Görsel kaynağı belirsiz (${opt.label}), boş kullanılıyor`);
  return await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 240, g: 240, b: 240 } },
  }).png().toBuffer();
}

// ─── SVG HELPERS ──────────────────────────────────────────────────────────────

const NEON_COLORS      = ["#FFFF00", "#39FF14", "#00FFFF"]; // fosforlu sarı / yeşil / cyan
const BADGE_COLORS     = ["#FF5722", "#5BE0FF", "#7FFF7F"];
const LABEL_BAR_COLORS = ["#1A1A1A", "#1A1A1A", "#1A1A1A"]; // koyu gri/siyah
const SLOT_BG = [
  { start: "#FFB347", end: "#FF5722" }, // turuncu→kırmızı
  { start: "#5BE0FF", end: "#0066FF" }, // mavi gradient
  { start: "#7FFF7F", end: "#00C853" }, // yeşil gradient
];
const FONT_STACK = "'Luckiest Guy', Bangers, 'Bowlby One', 'Lilita One', Fredoka, Impact, 'Arial Black', sans-serif";
const HIGHLIGHT_STOPWORDS = new Set(["the","a","an","is","are","was","were","did","do","does","this","that","these","those","in","on","at","of","to","from","by","with","and","or","but","has","have","had","its","it","not","no","came","come","which","what","who","where","when","how","why"]);

/**
 * Başlık için font boyutu + satır bölmesi + bant yüksekliği hesapla.
 * bandH içeriğe göre dinamik büyür — başlık asla kesilmez.
 * INNER_PAD_TOP + INNER_PAD_BOT = 25px + 25px iç boşluk.
 */
function calcLayout(question, W) {
  const text = cleanMarkdown(question).toUpperCase();
  const INNER_PAD = 25; // üst ve alt iç padding (px)
  const LINE_RATIO = 1.15;

  // Font boyutu: tek satıra sığmayacak kadar uzunsa küçült
  const fsSingle = Math.min(96, Math.floor((W * 0.86) / Math.max(text.length * 0.56, 1)));
  let lines, fontSize;

  if (fsSingle >= 72 || text.split(/\s+/).length <= 3) {
    lines = [text];
    fontSize = Math.max(60, fsSingle);
  } else {
    const words = text.split(/\s+/);
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    const maxLen = Math.max(lines[0].length, lines[1].length);
    fontSize = Math.max(46, Math.min(80, Math.floor((W * 0.86) / Math.max(maxLen * 0.56, 1))));
  }

  const lineH = Math.round(fontSize * LINE_RATIO);
  const textH = lines.length * lineH;
  // Bant yüksekliği: metin bloğu + iç padding + alt çizgi payı
  const bandH = textH + INNER_PAD * 2 + 14;

  return { lines, fontSize, lineH, bandH };
}

/**
 * thumbnail_question'dan heuristic highlights hesapla (Gemini vermezse fallback)
 */
function pickHighlights(question) {
  const words = question.toUpperCase().split(/\s+/).map(w => w.replace(/[^A-Z]/g, ""));
  const candidates = words.filter(w => w.length >= 4 && !HIGHLIGHT_STOPWORDS.has(w.toLowerCase()));
  return candidates.sort((a, b) => b.length - a.length).slice(0, 2);
}

/**
 * Üst bant SVG — siyah zemin + beyaz yazı + fosforlu highlight kelimeleri.
 * bandH, lines, fontSize, lineH → calcLayout'tan gelir (thumbnailUret tarafından hesaplanır).
 * xml:space="preserve" + space-prefix tspan (librsvg whitespace fix).
 */
function svgTopBand(question, W, H, bandH, highlights, layout) {
  const { lines, fontSize, lineH } = layout;
  const hlSet = new Set((highlights || []).map(h => h.toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean));

  const INNER_PAD = 25;
  // İlk satır baseline: top padding + fontSize (ascender dahil)
  const startY = INNER_PAD + fontSize;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Siyah bant
  svg += `<rect x="0" y="0" width="${W}" height="${bandH}" fill="#000000"/>`;
  svg += `<rect x="0" y="0" width="${W}" height="4" fill="#FFFF00"/>`;
  svg += `<rect x="0" y="${bandH - 12}" width="${W}" height="12" fill="#111111"/>`;
  svg += `<rect x="0" y="${bandH - 14}" width="${W}" height="3" fill="#FFFF00"/>`;

  let hlIdx = 0;
  lines.forEach((line, i) => {
    const y = Math.round(startY + i * lineH);
    const words = line.split(/\s+/);

    svg += `<text x="${W / 2}" y="${y}"
      font-family="${FONT_STACK}"
      font-size="${fontSize}" font-weight="900"
      text-anchor="middle"
      xml:space="preserve">`;

    words.forEach((word, wi) => {
      const clean  = word.replace(/[^A-Z]/g, "");
      const isHl   = clean && hlSet.has(clean);
      const fill   = isHl ? NEON_COLORS[hlIdx % NEON_COLORS.length] : "#FFFFFF";
      const sw     = isHl ? 5 : 4;
      if (isHl) hlIdx++;
      const prefix = wi === 0 ? "" : " ";
      svg += `<tspan fill="${fill}" stroke="#000000" stroke-width="${sw}" paint-order="stroke">${escapeXml(prefix + word)}</tspan>`;
    });

    svg += `</text>`;
  });

  svg += `</svg>`;
  return svg;
}

/**
 * Seçenek overlay SVG — renkli rozetler, renkli şık çubukları, kalın ayraç + glow.
 * Şeffaf arka plan — compositing'de option görselleri üstüne bindirilir.
 */
function svgOptionOverlay(optionlar, W, H, bandH) {
  const n = optionlar.length;
  const colW = Math.floor(W / n);
  const bottomH = H - bandH;
  const BADGE_R = 46;
  const LABEL_H = 82;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>
    <filter id="bGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="imgGlow" x="-5%" y="-5%" width="110%" height="110%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="tShadow2" x="-5%" y="-10%" width="110%" height="130%">
      <feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000000" flood-opacity="0.85"/>
    </filter>
  </defs>`;

  optionlar.forEach((opt, i) => {
    const colX = i * colW;
    const thisColW = i === n - 1 ? W - colX : colW;
    const badgeColor = BADGE_COLORS[i % BADGE_COLORS.length];
    const labelColor = LABEL_BAR_COLORS[i % LABEL_BAR_COLORS.length];

    // Dikey ayraç: kalın siyah 5px + glow yıldızları üst/alt
    if (i > 0) {
      svg += `<rect x="${colX - 3}" y="${bandH}" width="6" height="${bottomH}" fill="#1A1A1A"/>`;
      // Üst glow nokta
      svg += `<circle cx="${colX}" cy="${bandH + 24}" r="10" fill="#FFE600" fill-opacity="0.7" filter="url(#imgGlow)"/>`;
      // Alt glow nokta
      svg += `<circle cx="${colX}" cy="${H - LABEL_H - 24}" r="10" fill="#FFE600" fill-opacity="0.7" filter="url(#imgGlow)"/>`;
    }

    // Görsel etrafı beyaz çerçeve (85% bölge, 6px border)
    const imgScale = 0.85;
    const iW = Math.round(thisColW * imgScale);
    const iH = Math.round(bottomH  * imgScale);
    const iX = colX + Math.round((thisColW - iW) / 2);
    const iY = bandH + Math.round((bottomH  - iH) / 2);
    svg += `<rect x="${iX - 3}" y="${iY - 3}" width="${iW + 6}" height="${iH + 6}"
      fill="none" stroke="#FFFFFF" stroke-width="6" rx="6" filter="url(#imgGlow)"/>`;

    // Rozet: beyaz dış → siyah ring → renkli → harf
    const bCX = colX + BADGE_R + 16;
    const bCY = bandH + BADGE_R + 16;
    svg += `<circle cx="${bCX}" cy="${bCY}" r="${BADGE_R + 12}" fill="#FFFFFF" filter="url(#bGlow)"/>`;
    svg += `<circle cx="${bCX}" cy="${bCY}" r="${BADGE_R + 7}"  fill="#1A1A1A"/>`;
    svg += `<circle cx="${bCX}" cy="${bCY}" r="${BADGE_R}"      fill="${badgeColor}" filter="url(#bGlow)"/>`;
    svg += `<text x="${bCX}" y="${bCY + 20}"
      font-family="${FONT_STACK}"
      font-size="56" font-weight="900" fill="#FFFFFF"
      text-anchor="middle"
      stroke="#000000" stroke-width="6" paint-order="stroke"
      filter="url(#tShadow2)"
    >${BADGE_LETTERS[i]}</text>`;

    // Alt şık çubuğu — koyu gri/siyah
    svg += `<rect x="${colX}" y="${H - LABEL_H}" width="${thisColW}" height="${LABEL_H}" fill="#111111" fill-opacity="0.93"/>`;
    // Üst ince aksan çizgisi (rozet rengiyle)
    svg += `<rect x="${colX}" y="${H - LABEL_H}" width="${thisColW}" height="5" fill="${badgeColor}"/>`;

    // Şık ismi: beyaz + koyu strok
    const name = cleanMarkdown(opt.label).toUpperCase();
    const nfs = Math.min(54, Math.max(28, Math.floor((thisColW * 0.76) / Math.max(name.length * 0.6, 1))));
    svg += `<text
      x="${colX + thisColW / 2}" y="${H - LABEL_H * 0.22}"
      font-family="${FONT_STACK}"
      font-size="${nfs}" font-weight="900" fill="#FFFFFF"
      text-anchor="middle"
      stroke="#111111" stroke-width="4" paint-order="stroke"
      filter="url(#tShadow2)"
    >${escapeXml(name)}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// ─── ANA ÜRETIM ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 *   question      — üst banttaki jenerik soru
 *   highlights    — ["WORD1","WORD2"] fosforlu kelimeler (opsiyonel)
 *   optionsVisual — [{label, type, code?|prompt?}, ...]
 *   format        — "long" | "shorts"
 *   hesaplar      — CF hesap listesi
 *   jobSeed       — renk/davranış seed
 */
async function thumbnailUret({ question, highlights, optionsVisual, format, hesaplar, jobSeed }) {
  // Shorts şimdilik devre dışı (CLAUDE.md) — long olarak üret
  const W = 1280;
  const H = 720;

  // Bant yüksekliği içeriğe göre dinamik — başlık kesilmesin
  const layout   = calcLayout(question, W);
  const bandH    = Math.min(layout.bandH, Math.floor(H * 0.50)); // max %50
  const bottomH  = H - bandH;

  const n = Math.min(3, Math.max(1, optionsVisual.length));
  const opts = optionsVisual.slice(0, n);
  const colW = Math.floor(W / n);

  // highlights fallback
  const hl = Array.isArray(highlights) && highlights.length > 0
    ? highlights
    : pickHighlights(question);

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

  // 2) Arka plan: siyah (bant ile uyumlu)
  const bgBuf = await sharp(
    Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#0A0A0A"/>
    </svg>`)
  ).png().toBuffer();

  const layers = [];

  // 2.5) Slot gradient arka planları (option görsellerinin altında)
  let slotBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>`;
  for (let i = 0; i < n; i++) {
    const sg = SLOT_BG[i % SLOT_BG.length];
    slotBgSvg += `<linearGradient id="sg${i}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="${sg.start}"/>
      <stop offset="100%" stop-color="${sg.end}"/>
    </linearGradient>`;
  }
  slotBgSvg += `</defs>`;
  for (let i = 0; i < n; i++) {
    const cx = i * colW;
    const cw = i === n - 1 ? W - cx : colW;
    slotBgSvg += `<rect x="${cx}" y="${bandH}" width="${cw}" height="${bottomH}" fill="url(#sg${i})"/>`;
  }
  slotBgSvg += `</svg>`;
  layers.push({ input: Buffer.from(slotBgSvg), left: 0, top: 0 });

  // 3) Seçenek görselleri %85 boyutta ortalanmış (kenarlar renkli gradient görünür)
  const IMG_SCALE = 0.85;
  for (let i = 0; i < n; i++) {
    if (!optionBuffers[i]) continue;
    const thisColW = i === n - 1 ? W - i * colW : colW;
    const targetW  = Math.round(thisColW * IMG_SCALE);
    const targetH  = Math.round(bottomH  * IMG_SCALE);
    const padLeft  = Math.round((thisColW - targetW) / 2);
    const padTop   = Math.round((bottomH  - targetH) / 2);
    const resized = await sharp(optionBuffers[i])
      .resize(targetW, targetH, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    layers.push({ input: resized, left: i * colW + padLeft, top: bandH + padTop });
  }

  // 4) Üst bant (siyah zemin + beyaz + fosforlu highlights)
  const bandSvg = svgTopBand(question, W, H, bandH, hl, layout);
  layers.push({ input: Buffer.from(bandSvg), left: 0, top: 0 });

  // 5) Overlay: renkli rozetler + şık çubukları + ayraçlar
  const overlaySvg = svgOptionOverlay(opts, W, H, bandH);
  layers.push({ input: Buffer.from(overlaySvg), left: 0, top: 0 });

  // 6) Vignette: kenarlar koyulaşır
  const vignetteSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="vig" cx="50%" cy="50%" r="70%">
        <stop offset="0%"   stop-color="black" stop-opacity="0"/>
        <stop offset="60%"  stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.48"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
  </svg>`;
  layers.push({ input: Buffer.from(vignetteSvg), left: 0, top: 0 });

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
    ).replace(/\bTurkey\b/gi, "Turkiye");
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
        const highlights = Array.isArray(qJson?.thumbnail_highlights) && qJson.thumbnail_highlights.length > 0
          ? qJson.thumbnail_highlights
          : [];
        buffer = await thumbnailUret({
          question,
          highlights,
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
