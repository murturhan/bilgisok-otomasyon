/**
 * 05 - Thumbnail Üretimi v11 (GeniMini Kids Quiz - HERO-CENTRIC EDITION)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Mimari: AYNI KALDI (sharp + SVG overlay + FLUX bg + Jess opsiyonel)
 *   - Input  : Job (Sheets) → thumbnail_baslik / konu / thumbnail_prompt
 *   - Output : 1280x720 JPG (long) veya 1080x1920 JPG (shorts)
 *   - Upload : Drive "05-thumbnail" alt klasörü + Telegram bildirimi
 *
 * v10 → v11 DEĞİŞİKLİKLERİ (kullanıcı feedback'i — "viral değildi, konuyu merkeze al"):
 *   1.  KONU GÖRSELİ ARTIK HERO. FLUX bg üzerine örtük büyük panel/yan kapatma YOK.
 *       FLUX bg'in saturasyonu artırılıyor ama BLUR uygulanmıyor — net görünmesi için.
 *   2.  Per-topic WARM-CONTRAST tema (Brain Time / Mind Warehouse tarzı).
 *       Keyword'e göre seçim: jurassic (yeşil/sarı), cosmic (mor/pembe), wild
 *       (kırmızı/turuncu), juicy (kırmızı/sarı), tasty (bordo/sarı), ocean
 *       (lacivert/cyan). Default: kraliyet moru + sarı.
 *   3.  Opsiyonel `topicImagePath` parametresi: FLUX bg yoksa veya ek olarak
 *       konu görseli (Twemoji/PNG) merkeze BÜYÜK olarak yerleştiriliyor (görsel
 *       kullanılabilir alanın ~%60'ı).
 *   4.  Ucuz badge'ler (QUIZ! daire, ? daire) KALDIRILDI. Sadece eğri CTA
 *       starburst rozeti köşede.
 *   5.  Başlık konuya EŞLİK ediyor — sahneyi kaplamıyor:
 *       - LONG: BOTTOM band (~140px yükseklik) içinde tek satır
 *       - SHORTS: TOP band içinde tek satır
 *       - VS: her yarının üstünde isim
 *   6.  STRONG VIGNETTE (kenar-merkez %75 koyu) — konu görseline odak.
 *   7.  Kelime kelime renkli metin korundu (highlightPalette rotasyonu) ama
 *       beyaz stroke 14-18px ve 3 katmanlı drop-shadow ile daha vurucu.
 *   8.  VS layout: pembe/mavi yerine warm contrast (kırmızı / lacivert vb.)
 *       + her tarafa konu emoji/icon yerleştirmek için yer ayrıldı.
 *   9.  Jess karakteri opsiyonel — varsayılan KAPATILDI. Konu görseli zaten
 *       hero. Jess istenirse `useJess=true` ile etkinleştirilir, küçük köşe
 *       maskotu olarak yerleşir.
 *
 * GERIYE UYUMLULUK:
 *   - jobOku / jobGuncelle / Drive upload / Telegram akışı v9/v10 ile bire bir aynı.
 *   - Çıktı dosya adı formatı (`thumbnail-<format>-<ts>.jpg`) korundu.
 *   - Env değişkenleri aynı.
 *   - YENİ env (opsiyonel): `THUMB_USE_JESS=1` → Jess'i geri etkinleştir.
 *   - YENİ Sheets kolonu (opsiyonel): `thumbnail_subject_image` → Drive file ID
 *     (verilirse FLUX bg yerine/yanında merkez hero olarak kullanılır).
 * ──────────────────────────────────────────────────────────────────────────
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

const { JOB_ID, GDRIVE_JESS_FOLDER_ID, THUMB_USE_JESS } = process.env;
const TMP_DIR = "/tmp/thumbnail";
const USE_JESS = THUMB_USE_JESS === "1";

// ─── BRAND PALET (theme.ts ile uyumlu) ────────────────────────────────────
const HIGHLIGHT_PALETTE = ["#FFE600", "#FF5BA7", "#5BE0FF", "#7FFF7F", "#FFB347"];

// CTA rozetleri (kısa, merak uyandıran; deterministik seçim)
const CTA_SLOGANS = [
  "TAHMİN ET!",
  "HANGİSİ?",
  "%99 BİLEMİYOR!",
  "BİL BAKALIM!",
  "ŞOK!",
  "VAY CANINA!",
  "ZOR MU?",
];

// ─── PER-TOPIC WARM CONTRAST TEMA ─────────────────────────────────────────
// Konu keyword'ünden uygun warm-contrast palet seçer. Brain Time / Mind
// Warehouse / Bright Side referans estetiği.
const TEMALAR = {
  jurassic: {
    keywords: ["dinozor", "tarih öncesi", "jurassic", "fosil"],
    // Volkanik gün batımı: koyu kırmızı → amber. Yeşil dinozor üzerine TAM kontrast.
    bg1: "#7C1D1D", bg2: "#F59E0B",
    titleColor: "#FFE600", accent: "#FFE600",
  },
  cosmic: {
    keywords: ["uzay", "gezegen", "yıldız", "galaksi", "ay", "güneş", "astronot"],
    bg1: "#1E0A5C", bg2: "#EC4899",      // derin mor → pembe
    titleColor: "#FFE600", accent: "#5BE0FF",
  },
  wild: {
    keywords: ["hayvan", "kaplan", "aslan", "fil", "zürafa", "köpek", "kedi",
               "kurt", "ayı", "panda", "maymun", "zebra"],
    bg1: "#7F1D1D", bg2: "#FB923C",      // koyu kırmızı → turuncu
    titleColor: "#FFE600", accent: "#FFE600",
  },
  juicy: {
    keywords: ["meyve", "çilek", "muz", "elma", "portakal", "üzüm", "karpuz",
               "kavun"],
    bg1: "#9F1239", bg2: "#FBBF24",      // bordo → sarı
    titleColor: "#FFFFFF", accent: "#FFE600",
  },
  tasty: {
    keywords: ["yemek", "pizza", "hamburger", "tatlı", "dondurma", "pasta",
               "kek", "çikolata"],
    bg1: "#7C2D12", bg2: "#F59E0B",      // koyu turuncu → amber
    titleColor: "#FFE600", accent: "#FFFFFF",
  },
  ocean: {
    keywords: ["deniz", "balık", "köpekbalığı", "okyanus", "ahtapot", "yunus"],
    bg1: "#0C4A6E", bg2: "#22D3EE",      // lacivert → cyan
    titleColor: "#FFE600", accent: "#FFE600",
  },
  royal: {
    // Default: kraliyet moru → altın sarı (klasik viral kombo)
    keywords: [],
    bg1: "#3B0764", bg2: "#FBBF24",
    titleColor: "#FFE600", accent: "#FFE600",
  },
};

function temaSec(metin) {
  // Türkçe "İ".toLowerCase() → "i" + U+0307 combining dot. Normalize edip
  // birleşik dot'u kaldırıyoruz ki "DİNOZOR" → "dinozor" match etsin.
  const m = String(metin || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // Kelime karakterleri (Türkçe dahil) — kelime başlangıcını yakalamak için
  // negate edilen char class içinde kullanılır.
  const WORD_CHARS = "a-zA-Z0-9çğıöşüâî";
  for (const [ad, tema] of Object.entries(TEMALAR)) {
    if (ad === "royal") continue;
    const matched = tema.keywords.some((k) => {
      const re = new RegExp(`(^|[^${WORD_CHARS}])${k}`, "i");
      return re.test(m);
    });
    if (matched) return { ad, ...tema };
  }
  return { ad: "royal", ...TEMALAR.royal };
}

// ─── UTILS ────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ctaSec(seed = "") {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CTA_SLOGANS[h % CTA_SLOGANS.length];
}

async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

function vsTespit(metin) {
  const t = String(metin || "").trim();
  const patterns = [
    /^(.+?)\s+vs\.?\s+(.+)$/i,
    /^(.+?)\s+vs\s+(.+)$/i,
    /^(.+?)\s+mi\s+(.+?)\s+mi\??$/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      return {
        sol: m[1].trim().toUpperCase(),
        sag: m[2].trim().toUpperCase().replace(/\?$/, ""),
      };
    }
  }
  return null;
}

function satirlaraBol(metin, tekSatirEsigi = 14) {
  const t = metin.toUpperCase().trim();
  if (t.length <= tekSatirEsigi) return [t];
  const kelimeler = t.split(/\s+/);
  if (kelimeler.length === 1) return [t];
  const mid = Math.ceil(kelimeler.length / 2);
  return [kelimeler.slice(0, mid).join(" "), kelimeler.slice(mid).join(" ")];
}

// ─── ORTAK SVG PARÇALARI ─────────────────────────────────────────────────

function sharedDefs(tema) {
  return `
    <!-- Per-topic warm contrast radial bg (FLUX bg yoksa fallback) -->
    <radialGradient id="topicBg" cx="50%" cy="50%" r="80%">
      <stop offset="0%" stop-color="${tema.bg2}"/>
      <stop offset="100%" stop-color="${tema.bg1}"/>
    </radialGradient>

    <!-- STRONG VIGNETTE - konu görseline odaklama -->
    <radialGradient id="strongVignette" cx="50%" cy="50%" r="75%">
      <stop offset="40%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.78"/>
    </radialGradient>

    <!-- Hafif merkez glow (konuyu öne çıkarmak için sıcak ışık) -->
    <radialGradient id="centerWarm" cx="50%" cy="50%" r="45%">
      <stop offset="0%" stop-color="${tema.bg2}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${tema.bg2}" stop-opacity="0"/>
    </radialGradient>

    <!-- Başlık bandı gradient (alt veya üst strip) -->
    <linearGradient id="titleBand" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.0"/>
      <stop offset="15%" stop-color="#000000" stop-opacity="0.85"/>
      <stop offset="85%" stop-color="#000000" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.0"/>
    </linearGradient>

    <!-- CTA starburst gradient -->
    <linearGradient id="ctaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FB923C"/>
    </linearGradient>

    <!-- VS rozet gradient -->
    <radialGradient id="vsGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF59D"/>
      <stop offset="60%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FB923C"/>
    </radialGradient>

    <!-- VS sol/sağ panel (per-tema warm contrast) -->
    <linearGradient id="vsLeft" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${tema.bg2}"/>
      <stop offset="100%" stop-color="${tema.bg1}"/>
    </linearGradient>
    <linearGradient id="vsRight" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1E40AF"/>
      <stop offset="100%" stop-color="#0C4A6E"/>
    </linearGradient>

    <!-- Pastel fallback gradient -->
    <linearGradient id="bgFallback" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${tema.bg2}"/>
      <stop offset="100%" stop-color="${tema.bg1}"/>
    </linearGradient>

    <!-- Büyük metin için 3 katmanlı agresif drop-shadow -->
    <filter id="bigShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="8" flood-color="#000" flood-opacity="0.85"/>
      <feDropShadow dx="0" dy="4"  stdDeviation="3" flood-color="#000" flood-opacity="0.65"/>
      <feDropShadow dx="0" dy="1"  stdDeviation="1" flood-color="#000" flood-opacity="0.5"/>
    </filter>

    <!-- Konu görseli arkası sarı glow halkası -->
    <radialGradient id="subjectGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="${tema.accent}" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="${tema.accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${tema.accent}" stop-opacity="0"/>
    </radialGradient>
  `;
}

/**
 * 22 köşeli yıldız patlaması (CTA rozet arka planı).
 */
function starburstPath(cx, cy, rOuter, rInner, points = 22) {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
  }
  return d + "Z";
}

/**
 * Yıldız patlamalı CTA rozeti — küçük, köşeye sığar.
 */
function ctaRozet(cx, cy, r, metin, rotate = -8) {
  const burst = starburstPath(0, 0, r, r * 0.78, 22);
  const fs = Math.max(20, Math.floor(r * 0.36));
  return `
    <g transform="translate(${cx}, ${cy}) rotate(${rotate})">
      <path d="${burst}" fill="url(#ctaGrad)" stroke="#000" stroke-width="${Math.max(3, r * 0.05)}"/>
      <text x="0" y="${fs * 0.35}"
            font-family="Lilita One, Fredoka, Baloo, Impact, Arial Black, sans-serif"
            font-size="${fs}" font-weight="900" fill="#1A1A2E"
            text-anchor="middle"
            stroke="#FFFFFF" stroke-width="${Math.max(2, fs * 0.06)}" paint-order="stroke">
        ${escapeXml(metin)}
      </text>
    </g>
  `;
}

/**
 * Çoklu-renk kelime kelime başlık metni — sahneye eşlik eder, kaplamaz.
 */
function renkliBaslik(satirlar, cx, startY, fontSize, strokeW, strokeColor = "#FFFFFF") {
  let svg = "";
  let renkIdx = 0;
  satirlar.forEach((satir, i) => {
    const y = startY + i * (fontSize * 1.02);
    const kelimeler = String(satir).split(/\s+/).filter(Boolean);
    svg += `<text x="${cx}" y="${y}"
              font-family="Lilita One, Fredoka, Baloo, Luckiest Guy, Impact, Arial Black, sans-serif"
              font-size="${fontSize}" font-weight="900"
              text-anchor="middle"
              stroke="${strokeColor}" stroke-width="${strokeW}" paint-order="stroke"
              filter="url(#bigShadow)"
              xml:space="preserve">`;
    kelimeler.forEach((k, j) => {
      const renk = HIGHLIGHT_PALETTE[renkIdx % HIGHLIGHT_PALETTE.length];
      renkIdx++;
      const dx = j === 0 ? 0 : fontSize * 0.34;
      svg += `<tspan dx="${dx}" fill="${renk}">${escapeXml(k)}</tspan>`;
    });
    svg += `</text>`;
  });
  return svg;
}

// ─── LAYOUT ÜRETİCİLERİ ──────────────────────────────────────────────────

/**
 * LONG 1280x720 — Konu hero, başlık ALT bant'ta
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │ center warm glow + strong vignette               │
 *   │                                                  │
 *   │     [ KONU GÖRSELİ - HERO - merkez 60% ]         │
 *   │     (FLUX bg veya topicImage)                    │
 *   │                                                  │
 *   │   GENIMINI TESTS · küçük üst-sol           [CTA] │
 *   │ ┌──────────────────────────────────────────────┐ │
 *   │ │   BAŞLIK · alt strip (kelime kelime renk)    │ │
 *   │ └──────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────┘
 */
function svgLong(baslik, tema, jobSeed = "") {
  const W = 1280, H = 720;
  const cta = ctaSec(jobSeed);

  const satirlar = satirlaraBol(baslik, 18);
  const fontSize = satirlar.length === 1 ? 110 : 80;
  const bandH = satirlar.length === 1 ? 150 : 200;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>${sharedDefs(tema)}</defs>`;

  // 1) Hafif merkez sıcak glow (konuya altın ışık)
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#centerWarm)"/>`;

  // 2) STRONG VIGNETTE (kenarları koyu — konuya odak)
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#strongVignette)"/>`;

  // 3) ALT BANT (başlık için, gradient'li koyu bant)
  const bandY = H - bandH;
  svg += `<rect x="0" y="${bandY}" width="${W}" height="${bandH}" fill="url(#titleBand)"/>`;
  // Üst kenar sarı çizgi (premium hissi)
  svg += `<rect x="0" y="${bandY - 4}" width="${W}" height="6" fill="${tema.accent}"/>`;

  // 4) BAŞLIK (alt band içinde, hafif rotate)
  const startY = bandY + (bandH / 2) + fontSize * 0.35;
  svg += `<g transform="rotate(-1.5, ${W / 2}, ${bandY + bandH / 2})">`;
  svg += renkliBaslik(satirlar, W / 2, startY - (satirlar.length - 1) * fontSize * 0.5, fontSize, 14, "#FFFFFF");
  svg += `</g>`;

  // 5) CTA rozeti (sağ üst köşe — küçük)
  svg += ctaRozet(W - 110, 110, 95, cta, -10);

  // 6) GENIMINI TESTS micro-watermark (sol üst)
  svg += `<text x="36" y="56" font-family="Lilita One, Fredoka, sans-serif"
            font-size="26" font-weight="900" fill="${tema.accent}"
            stroke="#000000" stroke-width="3" paint-order="stroke"
            letter-spacing="4">GENIMINI TESTS</text>`;

  svg += `</svg>`;
  return svg;
}

/**
 * SHORTS 1080x1920 — Konu hero, başlık ÜST bant'ta
 */
function svgShorts(baslik, tema, jobSeed = "") {
  const W = 1080, H = 1920;
  const cta = ctaSec(jobSeed);

  const satirlar = satirlaraBol(baslik, 14);
  const fontSize = satirlar.length === 1 ? 170 : 130;
  const bandH = satirlar.length === 1 ? 280 : 380;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>${sharedDefs(tema)}</defs>`;

  // 1) Merkez warm glow
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#centerWarm)"/>`;
  // 2) STRONG VIGNETTE
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#strongVignette)"/>`;

  // 3) ÜST BANT (başlık)
  svg += `<rect x="0" y="0" width="${W}" height="${bandH}" fill="url(#titleBand)"/>`;
  svg += `<rect x="0" y="${bandH - 6}" width="${W}" height="8" fill="${tema.accent}"/>`;

  // 4) BAŞLIK
  const startY = (bandH / 2) + fontSize * 0.35 - (satirlar.length - 1) * fontSize * 0.5;
  svg += `<g transform="rotate(-1.5, ${W / 2}, ${bandH / 2})">`;
  svg += renkliBaslik(satirlar, W / 2, startY, fontSize, 18, "#FFFFFF");
  svg += `</g>`;

  // 5) CTA rozeti (sağ alt)
  svg += ctaRozet(W - 200, H - 220, 175, cta, -12);

  // 6) GENIMINI TESTS micro-watermark (sol alt)
  svg += `<text x="60" y="${H - 60}" font-family="Lilita One, Fredoka, sans-serif"
            font-size="38" font-weight="900" fill="${tema.accent}"
            stroke="#000000" stroke-width="4" paint-order="stroke"
            letter-spacing="5">GENIMINI TESTS</text>`;

  svg += `</svg>`;
  return svg;
}

/**
 * VS LAYOUT — Per-tema warm contrast split, isimler subject'in yanında
 *
 * NOT: Split bg rectangles ARTIK BU FONKSIYONDA YOK — çağıran kod (thumbnailUret
 * veya test) split bg'yi ayrı bir layer olarak render etmeli. Bu SVG sadece
 * vignette + VS rozet + isimler + CTA overlay'i. Aksi halde subject icon'larını
 * kapatırdı.
 */
function svgVS(vsObj, tema, format, jobSeed = "") {
  const isShorts = format === "shorts";
  const W = isShorts ? 1080 : 1280;
  const H = isShorts ? 1920 : 720;

  const sol = vsObj.sol;
  const sag = vsObj.sag;

  const maxLen = Math.max(sol.length, sag.length);
  const baseFs = isShorts ? 170 : 110;
  const fs = maxLen > 8 ? Math.floor(baseFs * (8 / maxLen)) : baseFs;
  const fsClamped = Math.max(isShorts ? 90 : 60, fs);

  const cta = ctaSec(jobSeed);

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>${sharedDefs(tema)}</defs>`;

  // Vignette (subject'leri merkeze çekmek için)
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#strongVignette)"/>`;

  if (isShorts) {
    // Üst yarı isim
    svg += renkliBaslik([sol], W / 2, H * 0.16 + fsClamped / 2, fsClamped, 16, "#FFFFFF");
    // Alt yarı isim
    svg += renkliBaslik([sag], W / 2, H * 0.92, fsClamped, 16, "#FFFFFF");
  } else {
    // Sol isim üstte
    svg += renkliBaslik([sol], W * 0.25, H * 0.14 + fsClamped / 2, fsClamped, 14, "#FFFFFF");
    // Sağ isim üstte
    svg += renkliBaslik([sag], W * 0.75, H * 0.14 + fsClamped / 2, fsClamped, 14, "#FFFFFF");
  }

  // VS rozeti — merkezde
  const cx = W / 2;
  const cy = H / 2;
  const r = isShorts ? 180 : 120;
  svg += `<g transform="translate(${cx}, ${cy}) rotate(-6)">
    <circle cx="0" cy="0" r="${r * 1.12}" fill="#000" opacity="0.5"/>
    <circle cx="0" cy="0" r="${r}" fill="url(#vsGrad)" stroke="#000" stroke-width="${r * 0.06}" filter="url(#bigShadow)"/>
    <text x="0" y="${r * 0.32}"
          font-family="Lilita One, Fredoka, sans-serif"
          font-size="${r * 1.05}" font-weight="900" fill="#1A1A2E" text-anchor="middle"
          stroke="#FFFFFF" stroke-width="${r * 0.08}" paint-order="stroke">VS</text>
  </g>`;

  // CTA — alt sağ köşe (VS modunda üst köşeler title metnine ait)
  svg += ctaRozet(
    W - (isShorts ? 180 : 130),
    H - (isShorts ? 200 : 110),
    isShorts ? 130 : 90,
    cta,
    -10
  );

  svg += `</svg>`;
  return svg;
}

/**
 * VS bg üretici: Production ve test'in ortak kullandığı split-screen bg.
 * Sol yarı tema bg2→bg1, sağ yarı complementary blue bg2→bg1.
 * Shorts'ta yatay yerine dikey split.
 */
function svgVSBackground(tema, format) {
  const isShorts = format === "shorts";
  const W = isShorts ? 1080 : 1280;
  const H = isShorts ? 1920 : 720;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>${sharedDefs(tema)}</defs>`;

  if (isShorts) {
    svg += `<rect x="0" y="0" width="${W}" height="${H / 2}" fill="url(#vsLeft)"/>`;
    svg += `<rect x="0" y="${H / 2}" width="${W}" height="${H / 2}" fill="url(#vsRight)"/>`;
    // Orta yatay ayırıcı sarı çizgi
    svg += `<rect x="0" y="${H / 2 - 6}" width="${W}" height="12" fill="${tema.accent}"/>`;
  } else {
    svg += `<rect x="0" y="0" width="${W / 2}" height="${H}" fill="url(#vsLeft)"/>`;
    svg += `<rect x="${W / 2}" y="0" width="${W / 2}" height="${H}" fill="url(#vsRight)"/>`;
    // Orta dikey ayırıcı sarı çizgi
    svg += `<rect x="${W / 2 - 6}" y="0" width="12" height="${H}" fill="${tema.accent}"/>`;
  }
  svg += `</svg>`;
  return svg;
}

// ─── FLUX BG ──────────────────────────────────────────────────────────────

async function fluxBgUret(prompt, hesap, format) {
  const dim = format === "shorts"
    ? { width: 1024, height: 1792 }
    : { width: 1280, height: 720 };

  // v11: prompt artık "subject hero" odaklı — FLUX bg konu görseli olarak
  // kullanılacak, sahne değil. Subject merkeze gelecek, dramatik açı.
  const promptIyilestirilmis =
    `${prompt}, EPIC HERO SHOT, dramatic close-up composition, ` +
    `subject fills 60-70% of frame, centered, vibrant saturated colors, ` +
    `strong rim light, Pixar 3D animation style, kid-friendly cartoon, ` +
    `cinematic depth of field, slight low-angle wow shot, ` +
    `high contrast warm palette, glowing background, ` +
    `${format === "shorts" ? "9:16 vertical poster composition" : "16:9 cinematic widescreen"}. ` +
    `NO TEXT, NO WORDS, NO LETTERS, NO LOGOS, NO WATERMARKS. ` +
    `Style: like a movie poster centerpiece for a children's quiz video.`;

  const buffer = await fluxCagri(promptIyilestirilmis, hesap, dim);
  console.log(`  ✓ FLUX bg: ${(buffer.length / 1024).toFixed(0)}KB (${dim.width}x${dim.height})`);
  return buffer;
}

// ─── JESS PNG (OPSİYONEL) ─────────────────────────────────────────────────

async function jessIntroIndir(auth, hedefYol) {
  if (!GDRIVE_JESS_FOLDER_ID) return null;
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${GDRIVE_JESS_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
    pageSize: 50,
  });
  if (!res.data.files) return null;
  const lower = (n) => (n || "").toLowerCase();
  const target =
    res.data.files.find((f) => lower(f.name).includes("correct") && lower(f.name).endsWith(".png")) ||
    res.data.files.find((f) => lower(f.name).includes("intro")   && lower(f.name).endsWith(".png")) ||
    res.data.files.find((f) => lower(f.name).endsWith(".png"));
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

// ─── ANA ÜRETIM ───────────────────────────────────────────────────────────

/**
 * @param {object} opts
 *  - prompt       : FLUX bg prompt
 *  - jessYol      : Jess PNG yolu (opsiyonel, USE_JESS ile aktif)
 *  - baslikKisa   : başlık
 *  - format       : "long" | "shorts"
 *  - konu         : VS + tema tespiti için ham konu
 *  - hesap        : Cloudflare hesabı
 *  - jobSeed      : CTA seed
 *  - topicImagePath : opsiyonel PNG/SVG hero overlay (FLUX bg üstüne)
 */
async function thumbnailUret({
  prompt, jessYol, baslikKisa, format, konu, hesap, jobSeed, topicImagePath,
}) {
  const isShorts = format === "shorts";
  const finalW = isShorts ? 1080 : 1280;
  const finalH = isShorts ? 1920 : 720;

  const vs = vsTespit(baslikKisa) || vsTespit(konu);
  const tema = temaSec(`${baslikKisa} ${konu}`);
  console.log(`  🎨 Tema: ${tema.ad} (bg: ${tema.bg1} → ${tema.bg2})`);

  // ── 1) FLUX background (konu hero) ──
  let bgBuffer;
  try {
    bgBuffer = await fluxBgUret(prompt, hesap, format);
  } catch (e) {
    console.warn(`  ⚠ FLUX hata: ${e.message} → tema gradient fallback`);
    bgBuffer = null;
  }

  // ── 2) BG hedef boyuta — BLUR YOK! Konu net görünmeli ──
  let bgResized;
  if (vs) {
    // VS modunda: FLUX bg değil, split-screen warm contrast bg üretiyoruz.
    // (FLUX bg her iki subject'in bg'sini doğru çizemez; clean split daha güçlü.)
    const vsBgSvg = svgVSBackground(tema, format);
    bgResized = await sharp(Buffer.from(vsBgSvg)).png().toBuffer();
  } else if (bgBuffer) {
    bgResized = await sharp(bgBuffer)
      .resize(finalW, finalH, { fit: "cover" })
      .modulate({ saturation: 1.25, brightness: 1.05 })
      .toBuffer();
  } else {
    // FLUX yoksa per-tema radial gradient
    const fbSvg =
      `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>${sharedDefs(tema)}</defs>` +
      `<rect width="100%" height="100%" fill="url(#topicBg)"/>` +
      `</svg>`;
    bgResized = await sharp(Buffer.from(fbSvg)).png().toBuffer();
  }

  // ── 3) (opsiyonel) Topic hero image overlay ──
  // FLUX bg konuyu zaten gösterdiyse bu adım atlanır.
  // topicImagePath verilirse merkeze BÜYÜK (yüksekliğin %60'ı) yerleştirilir.
  const layers = [];

  if (topicImagePath && fs.existsSync(topicImagePath)) {
    // Hero görseli yükseklikten %60 alacak şekilde resize
    const heroH = Math.floor(finalH * (isShorts ? 0.55 : 0.62));
    const heroBuf = await sharp(topicImagePath)
      .resize(heroH, heroH, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const heroMeta = await sharp(heroBuf).metadata();

    // Merkez (long için y biraz yukarıda — alt başlık bandı için yer bırak)
    const heroX = Math.round((finalW - heroMeta.width) / 2);
    const heroY = Math.round(
      isShorts
        ? (finalH - heroMeta.height) / 2 + 60         // ortada
        : (finalH - heroMeta.height) / 2 - 60          // başlık altı için yukarı kaydır
    );

    // Konu arkasına sarı glow halkası (radial)
    const glowD = Math.floor(Math.max(heroMeta.width, heroMeta.height) * 1.3);
    const glowSvg =
      `<svg width="${glowD}" height="${glowD}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>${sharedDefs(tema)}</defs>` +
      `<circle cx="${glowD / 2}" cy="${glowD / 2}" r="${glowD / 2}" fill="url(#subjectGlow)"/>` +
      `</svg>`;
    const glowBuf = await sharp(Buffer.from(glowSvg)).png().toBuffer();
    layers.push({
      input: glowBuf,
      top: Math.round(heroY + heroMeta.height / 2 - glowD / 2),
      left: Math.round(heroX + heroMeta.width / 2 - glowD / 2),
    });

    layers.push({ input: heroBuf, top: heroY, left: heroX });
  }

  // ── 4) SVG overlay (vignette + bant + başlık + CTA) ──
  let svg;
  if (vs) {
    console.log(`  🆚 VS: "${vs.sol}" vs "${vs.sag}"`);
    svg = svgVS(vs, tema, format, jobSeed);
  } else if (isShorts) {
    svg = svgShorts(baslikKisa, tema, jobSeed);
  } else {
    svg = svgLong(baslikKisa, tema, jobSeed);
  }
  layers.push({ input: Buffer.from(svg), top: 0, left: 0 });

  // ── 5) (opsiyonel) Jess overlay - USE_JESS=1 ile aktif, varsayılan KAPALI ──
  if (USE_JESS && !vs && jessYol && fs.existsSync(jessYol)) {
    const jessW = isShorts ? 380 : 240;
    const jessBuf = await sharp(jessYol)
      .resize(jessW, jessW, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const jessMeta = await sharp(jessBuf).metadata();
    layers.push({
      input: jessBuf,
      top: finalH - jessMeta.height - (isShorts ? 280 : 160),
      left: 30,
    });
  }

  const final = await sharp(bgResized)
    .composite(layers)
    .jpeg({ quality: 92 })
    .toBuffer();

  return final;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

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

    let baslikKisa = job.thumbnail_baslik;
    if (!baslikKisa || baslikKisa.length < 3) {
      const konuTemiz = (job.konu || "").replace(/[:!?].*$/g, "").trim();
      const kelimeler = konuTemiz.split(/\s+/).slice(0, 3);
      baslikKisa = kelimeler.join(" ").toUpperCase();
    }
    console.log(`📝 Başlık: "${baslikKisa}"`);

    await jobGuncelle(JOB_ID, { thumb_status: "running" });

    const hesaplar = getCfAccounts();
    if (hesaplar.length === 0) throw new Error("Cloudflare hesap yok");

    // Jess (opsiyonel, USE_JESS ile)
    let jessIndirildi = null;
    if (USE_JESS) {
      const jessYol = path.join(TMP_DIR, "jess.png");
      jessIndirildi = await jessIntroIndir(saAuth, jessYol);
      console.log(jessIndirildi ? "✓ Jess indirildi (USE_JESS=1)" : "⚠ Jess yok");
    }

    // Topic hero image (opsiyonel): thumbnail_subject_image Sheets kolonu ya
    // Drive file ID ya da public URL içerir. Şimdilik path olarak alıyoruz.
    let topicImagePath = null;
    if (job.thumbnail_subject_image && fs.existsSync(job.thumbnail_subject_image)) {
      topicImagePath = job.thumbnail_subject_image;
      console.log(`✓ Topic hero: ${topicImagePath}`);
    }

    const prompt = job.thumbnail_prompt || job.konu;
    console.log(`🎨 BG prompt: "${String(prompt).substring(0, 80)}..."`);

    let buffer;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buffer = await thumbnailUret({
          prompt,
          jessYol: jessIndirildi,
          baslikKisa,
          format,
          konu: job.konu || "",
          hesap: hesaplar[attempt % hesaplar.length],
          jobSeed: String(JOB_ID || baslikKisa),
          topicImagePath,
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
    } catch (e) {
      // pipeline'ı kırmamak için sessiz geç
    }
    process.exit(1);
  }
}

const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) main();

export {
  thumbnailUret,
  svgLong,
  svgShorts,
  svgVS,
  svgVSBackground,
  vsTespit,
  satirlaraBol,
  temaSec,
  ctaSec,
  HIGHLIGHT_PALETTE,
  TEMALAR,
};
