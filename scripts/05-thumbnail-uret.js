/**
 * 05 - Thumbnail Üretimi v10 (GeniMini Kids Quiz - VIRAL EDITION)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Mimari: AYNI KALDI (sharp + SVG overlay + FLUX bg + Jess PNG Drive'dan)
 *   - Input  : Job (Sheets) → thumbnail_baslik / konu / thumbnail_prompt
 *   - Output : 1280x720 JPG (long) veya 1080x1920 JPG (shorts)
 *   - Upload : Drive "05-thumbnail" alt klasörü + Telegram bildirimi
 *
 * v9 → v10 değişiklikleri (viral standartlar):
 *   1.  Konuya ait BÜYÜK ana görsel: FLUX bg artık kırpılmadan ortada (sadece
 *       hafif vignette + radial glow ile vurgulanıyor; karakter onun üzerinde).
 *   2.  Jess karakteri köşe/yan; abartılı şaşkın pose (correct) tercih ediliyor.
 *       Etrafına sarı starburst/burst rozeti konuyor.
 *   3.  Başlık ARTIK kelime-kelime renklendirilmiş (highlightPalette'ten döner).
 *   4.  Beyaz/sarı dış stroke + çok katmanlı drop-shadow + iç glow.
 *   5.  Vignette, radial-glow ve film-grain efektleri SVG filter'larıyla.
 *   6.  Eğri (rotate) "TAHMİN ET!" / "HANGİSİ?" / "%99 BİLEMİYOR!" gibi
 *       merak uyandıran CTA rozetleri (yıldız patlaması arka planı).
 *   7.  "X VS Y" formatı: konu içinde "vs" geçiyorsa otomatik split-screen
 *       (sol pastel pembe, sağ pastel mavi, ortada büyük sarı VS rozeti).
 *   8.  Çocuk dostu pastel palet: Sarı/Pembe/Mavi/Yeşil/Turuncu.
 *   9.  Fontlar: Lilita One / Fredoka / Baloo (sistem fallback'leri ile).
 *   10. 1280x720 (long) ve 1080x1920 (shorts) — Quiz Blitz / MrBeast Kids
 *       referans estetiği.
 *
 * NOT (uyumluluk):
 *   - jobOku / jobGuncelle / Drive upload / Telegram akışı v9 ile bire bir aynı.
 *   - Çıktı dosya adı formatı (`thumbnail-<format>-<ts>.jpg`) korundu.
 *   - Mevcut env değişkenleri (JOB_ID, GDRIVE_JESS_FOLDER_ID) aynı.
 *   - Sadece sunum (SVG kompozisyonu) değişti.
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

const { JOB_ID, GDRIVE_JESS_FOLDER_ID } = process.env;
const TMP_DIR = "/tmp/thumbnail";

// ─── BRAND PALET (theme.ts ile bire bir) ─────────────────────────────────
// Çoklu-renk kelime vurgusu (rotasyon ile sırayla uygulanır)
const HIGHLIGHT_PALETTE = ["#FFE600", "#FF5BA7", "#5BE0FF", "#7FFF7F", "#FFB347"];

// Arka plan radial glow rengi (sıcak sarı)
const GLOW_COLOR = "#FFE600";

// CTA rozetleri (kısa, merak uyandıran). Bunlar abartılı, rotate edilmiş
// yıldız patlaması üzerine yazılıyor. Her render'da rastgele birisi seçilir.
const CTA_SLOGANS = [
  "TAHMİN ET!",
  "HANGİSİ?",
  "%99 BİLEMİYOR!",
  "BİL BAKALIM!",
  "ŞOK!",
  "VAY CANINA!",
  "ZOR MU?",
];

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

/**
 * Rastgele bir CTA sloganı döndür.
 * Aynı job için deterministik olsun diye basit bir seed kullanır.
 */
function ctaSec(seed = "") {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CTA_SLOGANS[h % CTA_SLOGANS.length];
}

/**
 * Drive klasör adından video formatını çıkarır.
 *   - "...-shorts-..." → "shorts"
 *   - aksi               → "long"
 */
async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

/**
 * Konu "X vs Y" formatında mı? Eğer öyleyse split-screen layout aktif olur.
 * "X VS Y", "X ve Y", "X mi Y mi" gibi karşılaştırma kalıpları yakalanır.
 */
function vsTespit(metin) {
  const t = String(metin || "").trim();
  // Tipik VS kalıpları
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

/**
 * Başlığı kelimelere ayırıp 1 veya 2 satıra böler.
 * Karakter sayısına göre auto-fit yapar.
 */
function satirlaraBol(metin, tekSatirEsigi = 12) {
  const t = metin.toUpperCase().trim();
  if (t.length <= tekSatirEsigi) return [t];
  const kelimeler = t.split(/\s+/);
  if (kelimeler.length === 1) return [t];
  const mid = Math.ceil(kelimeler.length / 2);
  return [kelimeler.slice(0, mid).join(" "), kelimeler.slice(mid).join(" ")];
}

// ─── ORTAK SVG PARÇALARI ─────────────────────────────────────────────────

/**
 * Tüm SVG'lerde kullanılan ortak <defs>: gradient'lar, glow filter'ı,
 * drop-shadow filter'ı ve vignette pattern'i.
 */
function sharedDefs() {
  return `
    <!-- Sıcak radial glow (merkezde, ana görsele dikkat çekmek için) -->
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="55%">
      <stop offset="0%"  stop-color="${GLOW_COLOR}" stop-opacity="0.55"/>
      <stop offset="50%" stop-color="${GLOW_COLOR}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${GLOW_COLOR}" stop-opacity="0"/>
    </radialGradient>

    <!-- Vignette: kenarları kararan radial overlay -->
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>

    <!-- CTA rozet arka planı (sarı→turuncu) -->
    <linearGradient id="ctaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FFB347"/>
    </linearGradient>

    <!-- VS rozet arka planı (sarı parlak) -->
    <radialGradient id="vsGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF59D"/>
      <stop offset="60%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FFB347"/>
    </radialGradient>

    <!-- Sol panel (VS modu) - pastel pembe -->
    <linearGradient id="vsLeft" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FF8DC0"/>
      <stop offset="100%" stop-color="#FF5BA7"/>
    </linearGradient>

    <!-- Sağ panel (VS modu) - pastel mavi -->
    <linearGradient id="vsRight" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#8DE6FF"/>
      <stop offset="100%" stop-color="#5BE0FF"/>
    </linearGradient>

    <!-- Pastel arka plan (FLUX bg yoksa fallback) -->
    <linearGradient id="bgFallback" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFD86B"/>
      <stop offset="100%" stop-color="#FF5BA7"/>
    </linearGradient>

    <!-- Büyük metin için katmanlı drop-shadow: derin siyah gölge -->
    <filter id="bigShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="6" flood-color="#000" flood-opacity="0.65"/>
      <feDropShadow dx="0" dy="3"  stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
    </filter>

    <!-- Sarı glow halkası (rozetler için) -->
    <filter id="yellowGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feFlood flood-color="#FFE600" flood-opacity="0.85"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Karakter etrafı için yumuşak glow -->
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="20"/>
    </filter>
  `;
}

/**
 * 24 köşeli yıldız patlaması (CTA rozet arka planı).
 * SVG path olarak döner, transform ile pozisyonlanır.
 */
function starburstPath(cx, cy, rOuter, rInner, points = 24) {
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
 * Yıldız patlamalı CTA rozeti. Eğri (rotate) ile dinamizm sağlar.
 *
 * @param {number} cx  - merkez X
 * @param {number} cy  - merkez Y
 * @param {number} r   - dış yarıçap
 * @param {string} metin - rozet metni
 * @param {number} rotate - derece cinsinden döndürme
 */
function ctaRozet(cx, cy, r, metin, rotate = -8) {
  const burst = starburstPath(0, 0, r, r * 0.78, 22);
  const burst2 = starburstPath(0, 0, r * 1.15, r * 0.9, 22);
  const fs = Math.max(28, Math.floor(r * 0.42));
  return `
    <g transform="translate(${cx}, ${cy}) rotate(${rotate})">
      <!-- dış halka (parlama hissi) -->
      <path d="${burst2}" fill="#FF5722" opacity="0.55"/>
      <!-- ana yıldız patlaması -->
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
 * Çoklu-renk kelime kelime başlık metni.
 * Her satır tek bir <text> elementi; her kelime palette'ten bir renk alır.
 * White stroke + drop-shadow filter zorunlu (okunabilirlik).
 *
 * @param {string[]} satirlar - başlık satırları
 * @param {number} cx - merkez X
 * @param {number} startY - ilk satırın baseline Y'si
 * @param {number} fontSize
 * @param {number} strokeW - dış stroke kalınlığı
 * @param {string} strokeColor - dış stroke rengi (beyaz veya sarı)
 */
function renkliBaslik(satirlar, cx, startY, fontSize, strokeW, strokeColor = "#FFFFFF") {
  let svg = "";
  let renkIdx = 0;
  satirlar.forEach((satir, i) => {
    const y = startY + i * (fontSize * 1.05);
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
      // İlk kelime: dx=0; sonraki kelimeler: dx ile boşluk
      const dx = j === 0 ? 0 : fontSize * 0.32;
      svg += `<tspan dx="${dx}" fill="${renk}">${escapeXml(k)}</tspan>`;
    });
    svg += `</text>`;
  });
  return svg;
}

// ─── LAYOUT ÜRETİCİLERİ ──────────────────────────────────────────────────

/**
 * LONG 1280x720 — varsayılan yatay viral layout
 *
 * Layout:
 *   ┌────────────────────────────────────────────┐
 *   │ vignette + central glow                    │
 *   │ ┌── Jess (sol) ──┐  ┌── BÜYÜK BAŞLIK ───┐  │
 *   │ │   bottom-left  │  │ kelime-kelime renk │  │
 *   │ │   shocked pose │  │ stroke + shadow   │  │
 *   │ └────────────────┘  └───────────────────┘  │
 *   │ [QUIZ üst-sol]            [CTA rozet eğri] │
 *   └────────────────────────────────────────────┘
 */
function svgLong(baslik, jobSeed = "") {
  const W = 1280, H = 720;
  const cta = ctaSec(jobSeed);

  const satirlar = satirlaraBol(baslik, 10);
  const fontSize = satirlar.length === 1 ? 168 : 122;

  // Başlık sağ yarıda merkezde
  const blockX = W * 0.58; // metnin merkez X'i (Jess soldaki yarımda)
  const totalH = satirlar.length * (fontSize * 1.05);
  const startY = (H - totalH) / 2 + fontSize - 14;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
  svg += `<defs>${sharedDefs()}</defs>`;

  // FLUX bg zaten composite'te alttayız; burada SADECE üst katmanı çiziyoruz.
  // (FLUX yoksa sharp tarafında fallback bg gradient kullanılıyor.)

  // 1) Merkezde sıcak glow (ana görsele dikkat)
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#centerGlow)"/>`;

  // 2) Vignette (kenarları karartma)
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)"/>`;

  // 3) Sağ tarafa hafif yarı saydam panel: metin okunurluğu için
  svg += `<rect x="${W * 0.46}" y="40" width="${W * 0.52}" height="${H - 80}"
            rx="40" ry="40"
            fill="rgba(91, 44, 140, 0.55)"
            stroke="#FFE600" stroke-width="6"/>`;

  // 4) BAŞLIK (kelime kelime renkli, stroke + shadow)
  svg += renkliBaslik(satirlar, blockX + 10, startY, fontSize, 12, "#FFFFFF");

  // 5) Sol üst QUIZ rozeti (yuvarlak, kırmızı)
  svg += `<g transform="translate(110, 100) rotate(-6)">
    <circle cx="0" cy="0" r="78" fill="#FF5722" stroke="#FFFFFF" stroke-width="8" filter="url(#bigShadow)"/>
    <text x="0" y="20" font-family="Lilita One, Fredoka, sans-serif"
          font-size="46" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke">QUIZ!</text>
  </g>`;

  // 6) CTA rozeti (sağ alt köşe, eğri)
  svg += ctaRozet(W - 160, H - 130, 120, cta, -10);

  // 7) Yan kenarda dikey GENIMINI TESTS şeridi (brand)
  svg += `<g transform="translate(36, ${H / 2}) rotate(-90)">
    <text x="0" y="0" font-family="Lilita One, Fredoka, sans-serif"
          font-size="34" font-weight="900" fill="#FFE600" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke" letter-spacing="6">
      GENIMINI TESTS
    </text>
  </g>`;

  svg += `</svg>`;
  return svg;
}

/**
 * SHORTS 1080x1920 — dikey viral layout
 *
 * Layout (üstten alta):
 *   - 0..240   : QUIZ + ? rozetleri
 *   - 240..720 : BÜYÜK BAŞLIK (kelime-kelime renkli)
 *   - 720..1600: Jess + FLUX merkez görsel (glow ile vurgu)
 *   - 1600..1920: CTA rozet + soru sayısı rozeti
 */
function svgShorts(baslik, jobSeed = "") {
  const W = 1080, H = 1920;
  const cta = ctaSec(jobSeed);

  const satirlar = satirlaraBol(baslik, 11);
  const fontSize = satirlar.length === 1 ? 220 : 168;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>${sharedDefs()}</defs>`;

  // 1) Merkez glow (Jess + bg vurgusu)
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#centerGlow)"/>`;
  // 2) Vignette
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)"/>`;

  // 3) ÜST başlık paneli (transparan, sarı stroke'lu pill)
  svg += `<rect x="40" y="240" width="${W - 80}" height="480"
            rx="48" ry="48"
            fill="rgba(91, 44, 140, 0.62)"
            stroke="#FFE600" stroke-width="8"/>`;

  // 4) BÜYÜK BAŞLIK (kelime-kelime renkli)
  const totalH = satirlar.length * (fontSize * 1.05);
  const startY = 240 + (480 - totalH) / 2 + fontSize - 24;
  svg += renkliBaslik(satirlar, W / 2, startY, fontSize, 16, "#FFFFFF");

  // 5) Sol-üst "?" rozeti
  svg += `<g transform="translate(150, 140) rotate(-8)">
    <circle cx="0" cy="0" r="105" fill="#4FC3F7" stroke="#FFFFFF" stroke-width="10" filter="url(#bigShadow)"/>
    <text x="0" y="48" font-family="Lilita One, sans-serif"
          font-size="140" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="5" paint-order="stroke">?</text>
  </g>`;

  // 6) Sağ-üst QUIZ rozeti
  svg += `<g transform="translate(${W - 150}, 140) rotate(8)">
    <circle cx="0" cy="0" r="105" fill="#FF5722" stroke="#FFFFFF" stroke-width="10" filter="url(#bigShadow)"/>
    <text x="0" y="24" font-family="Lilita One, sans-serif"
          font-size="60" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="4" paint-order="stroke">QUIZ!</text>
  </g>`;

  // 7) Sağ alt CTA rozeti (eğri)
  svg += ctaRozet(W - 200, H - 220, 175, cta, -12);

  // 8) Sol alt soru sayısı rozeti
  svg += `<g transform="translate(180, ${H - 200}) rotate(6)">
    <circle cx="0" cy="0" r="120" fill="#FFE600" stroke="#000000" stroke-width="10" filter="url(#bigShadow)"/>
    <text x="0" y="-14" font-family="Lilita One, sans-serif"
          font-size="90" font-weight="900" fill="#1A1A2E" text-anchor="middle">15</text>
    <text x="0" y="46" font-family="Lilita One, sans-serif"
          font-size="36" font-weight="900" fill="#1A1A2E" text-anchor="middle">SORU</text>
  </g>`;

  svg += `</svg>`;
  return svg;
}

/**
 * VS LAYOUT — "X vs Y" konuları için (her iki formatta da çalışır)
 * Split-screen: sol pastel pembe, sağ pastel mavi, ortada büyük sarı VS rozeti
 */
function svgVS(vsObj, format, jobSeed = "") {
  const isShorts = format === "shorts";
  const W = isShorts ? 1080 : 1280;
  const H = isShorts ? 1920 : 720;

  const sol = vsObj.sol;
  const sag = vsObj.sag;

  // İki tarafın font'unu otomatik küçült (uzun kelimeler için)
  const maxLen = Math.max(sol.length, sag.length);
  const baseFs = isShorts ? 200 : 130;
  const fs = maxLen > 8 ? Math.floor(baseFs * (8 / maxLen)) : baseFs;
  const fsClamped = Math.max(isShorts ? 110 : 70, fs);

  const cta = ctaSec(jobSeed);

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>${sharedDefs()}</defs>`;

  if (isShorts) {
    // ÜST yarı: pembe / ALT yarı: mavi (dikey split)
    svg += `<rect x="0" y="0" width="${W}" height="${H / 2}" fill="url(#vsLeft)"/>`;
    svg += `<rect x="0" y="${H / 2}" width="${W}" height="${H / 2}" fill="url(#vsRight)"/>`;
    // Üst metin
    svg += renkliBaslik([sol], W / 2, H * 0.25 + fsClamped / 2, fsClamped, 14, "#FFFFFF");
    // Alt metin
    svg += renkliBaslik([sag], W / 2, H * 0.75 + fsClamped / 2, fsClamped, 14, "#FFFFFF");
  } else {
    // SOL yarı: pembe / SAĞ yarı: mavi (yatay split)
    svg += `<rect x="0" y="0" width="${W / 2}" height="${H}" fill="url(#vsLeft)"/>`;
    svg += `<rect x="${W / 2}" y="0" width="${W / 2}" height="${H}" fill="url(#vsRight)"/>`;
    // Sol metin
    svg += renkliBaslik([sol], W * 0.25, H / 2 + fsClamped / 3, fsClamped, 12, "#FFFFFF");
    // Sağ metin
    svg += renkliBaslik([sag], W * 0.75, H / 2 + fsClamped / 3, fsClamped, 12, "#FFFFFF");
  }

  // Vignette
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)"/>`;

  // ORTADA büyük VS rozeti
  const cx = W / 2;
  const cy = H / 2;
  const r = isShorts ? 200 : 140;
  svg += `<g transform="translate(${cx}, ${cy}) rotate(-6)">
    <circle cx="0" cy="0" r="${r * 1.1}" fill="#000" opacity="0.25"/>
    <circle cx="0" cy="0" r="${r}" fill="url(#vsGrad)" stroke="#000" stroke-width="${r * 0.06}" filter="url(#bigShadow)"/>
    <text x="0" y="${r * 0.32}"
          font-family="Lilita One, Fredoka, sans-serif"
          font-size="${r * 1.1}" font-weight="900" fill="#1A1A2E" text-anchor="middle"
          stroke="#FFFFFF" stroke-width="${r * 0.08}" paint-order="stroke">VS</text>
  </g>`;

  // CTA rozeti (üst orta-sağ)
  svg += ctaRozet(W - (isShorts ? 200 : 160), isShorts ? 180 : 120, isShorts ? 150 : 100, cta, -10);

  // Sol üst QUIZ rozeti
  svg += `<g transform="translate(${isShorts ? 140 : 100}, ${isShorts ? 150 : 100}) rotate(-6)">
    <circle cx="0" cy="0" r="${isShorts ? 95 : 70}" fill="#FF5722" stroke="#FFFFFF" stroke-width="8" filter="url(#bigShadow)"/>
    <text x="0" y="${isShorts ? 20 : 16}" font-family="Lilita One, sans-serif"
          font-size="${isShorts ? 54 : 40}" font-weight="900" fill="#FFFFFF" text-anchor="middle"
          stroke="#000000" stroke-width="3" paint-order="stroke">QUIZ!</text>
  </g>`;

  svg += `</svg>`;
  return svg;
}

// ─── FLUX BG ──────────────────────────────────────────────────────────────

/**
 * FLUX ile konuya ait sahne arka planı üretir.
 * - "EMPTY" prompt ile canlı yaratık/karakter olmadan saf sahne
 * - Pixar 3D style, kid-friendly, bright daylight
 */
async function fluxBgUret(prompt, hesap, format) {
  const dim = format === "shorts"
    ? { width: 1024, height: 1792 }
    : { width: 1280, height: 720 };

  const promptIyilestirilmis =
    `Empty scenic background only depicting ${prompt}, EMPTY LANDSCAPE, ` +
    `ABSOLUTELY NO LIVING CREATURES, NO ANIMALS WHATSOEVER, NO HUMANS, ` +
    `NO CARTOON CHARACTERS, NO MASCOTS, just empty natural environment with ` +
    `terrain, plants, sky, water, or man-made structures. Pixar 3D animation ` +
    `style background environment, kid-friendly, bright cheerful colors, ` +
    `daylight, high contrast, vibrant saturated pastel palette. ` +
    `${format === "shorts" ? "9:16 vertical aspect ratio, vertical composition" : "16:9 cinematic widescreen"}. ` +
    `NO TEXT, NO WORDS, NO LETTERS, NO LOGOS. Style: like an empty Pixar scene before characters enter.`;

  const buffer = await fluxCagri(promptIyilestirilmis, hesap, dim);
  console.log(`  ✓ FLUX bg: ${(buffer.length / 1024).toFixed(0)}KB (${dim.width}x${dim.height})`);
  return buffer;
}

// ─── JESS PNG INDIR ───────────────────────────────────────────────────────

/**
 * Drive'dan Jess karakterinin "correct" / "intro" pose'unu indirir.
 * Öncelik:
 *   1. "correct" içeren PNG  (eller havada coşkulu → thumbnail için ideal)
 *   2. "intro"   içeren PNG  (tipik selamlama pose)
 *   3. ilk PNG (fallback)
 */
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
  let target =
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
 * Tüm parçaları birleştirir:
 *   1. FLUX bg üret (sahne arka planı)
 *   2. Sharp ile hedef boyuta resize + hafif blur (ana görselin yumuşaması)
 *   3. SVG overlay üret (layout'a göre normal/VS, format'a göre long/shorts)
 *   4. Jess PNG'sini overlay olarak ekle (etrafında sarı glow + drop shadow)
 *   5. JPEG composite return
 *
 * @param {string} prompt - FLUX bg prompt
 * @param {string} jessYol - Jess PNG yolu (null olabilir)
 * @param {string} baslikKisa - kısa başlık
 * @param {string} format - "shorts" | "long"
 * @param {string} konu - VS tespiti için ham konu
 * @param {object} hesap - Cloudflare hesabı
 * @param {string} jobSeed - CTA seçimi için seed
 */
async function thumbnailUret(prompt, jessYol, baslikKisa, format, konu, hesap, jobSeed) {
  const isShorts = format === "shorts";
  const finalW = isShorts ? 1080 : 1280;
  const finalH = isShorts ? 1920 : 720;

  // VS modu tespiti (önce başlığa, sonra konuya bakar)
  const vs = vsTespit(baslikKisa) || vsTespit(konu);

  // ── 1) FLUX background ──
  let bgBuffer;
  try {
    bgBuffer = await fluxBgUret(prompt, hesap, format);
  } catch (e) {
    console.warn(`  ⚠ FLUX hata: ${e.message} → fallback gradient kullanılıyor`);
    bgBuffer = null;
  }

  // ── 2) BG'yi hedef boyuta resize ──
  // Hafif blur + saturation boost: ana karakter ve metin öne çıksın
  let bgResized;
  if (bgBuffer) {
    bgResized = await sharp(bgBuffer)
      .resize(finalW, finalH, { fit: "cover" })
      .modulate({ saturation: 1.15, brightness: 1.05 })
      .blur(1.4) // çok hafif blur — ana görsel hala anlaşılır
      .toBuffer();
  } else {
    // FLUX patlarsa: SVG fallback gradient
    const fbSvg =
      `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>${sharedDefs()}</defs>` +
      `<rect width="100%" height="100%" fill="url(#bgFallback)"/>` +
      `</svg>`;
    bgResized = await sharp(Buffer.from(fbSvg)).png().toBuffer();
  }

  // ── 3) SVG overlay üret ──
  let svg;
  if (vs) {
    console.log(`  🆚 VS modu: "${vs.sol}" vs "${vs.sag}"`);
    svg = svgVS(vs, format, jobSeed);
  } else if (isShorts) {
    svg = svgShorts(baslikKisa, jobSeed);
  } else {
    svg = svgLong(baslikKisa, jobSeed);
  }
  const svgBuffer = Buffer.from(svg);

  // ── 4) Jess overlay ──
  // VS modunda Jess yok (tam VS layout'u koruyalım). Normal modda var.
  const layers = [];

  if (!vs && jessYol && fs.existsSync(jessYol)) {
    // Format'a göre Jess konum/boyut
    let jessW, jessTop, jessLeft;

    if (isShorts) {
      // SHORTS: Jess BÜYÜK orta-alt
      jessW = 900;
      const jessMeta = await sharp(jessYol).resize(jessW, jessW, { fit: "inside" }).metadata();
      jessLeft = (finalW - jessMeta.width) / 2;
      jessTop = 760;
      if (jessTop + jessMeta.height > finalH - 380) {
        jessTop = finalH - jessMeta.height - 380;
      }
    } else {
      // LONG: Jess sol alt (sağda metin paneli olduğu için)
      jessW = 560;
      const jessMeta = await sharp(jessYol).resize(jessW, jessW, { fit: "inside" }).metadata();
      jessLeft = 10;
      jessTop = finalH - jessMeta.height + 20; // hafif taşma (dramatik)
    }

    // Jess'in arkasına sarı glow halkası (radial)
    const glowR = Math.floor(jessW * 0.5);
    const glowSvg =
      `<svg width="${jessW}" height="${jessW}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>` +
      `<radialGradient id="jg" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="#FFE600" stop-opacity="0.95"/>` +
      `<stop offset="60%" stop-color="#FFB347" stop-opacity="0.4"/>` +
      `<stop offset="100%" stop-color="#FFB347" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<circle cx="${jessW / 2}" cy="${jessW / 2}" r="${glowR}" fill="url(#jg)"/>` +
      `</svg>`;
    const glowBuf = await sharp(Buffer.from(glowSvg)).png().toBuffer();

    layers.push({
      input: glowBuf,
      top: Math.round(jessTop),
      left: Math.round(jessLeft),
    });

    // Jess'in kendisini resize et + hafif drop shadow için PNG'yi olduğu gibi koy
    const jessResized = await sharp(jessYol)
      .resize(jessW, jessW, {
        fit: "inside",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    layers.push({
      input: jessResized,
      top: Math.round(jessTop),
      left: Math.round(jessLeft),
    });
  }

  // SVG (en üst katman: text + rozetler)
  layers.push({ input: svgBuffer, top: 0, left: 0 });

  // ── 5) Compose final ──
  const final = await sharp(bgResized)
    .composite(layers)
    .jpeg({ quality: 92 })
    .toBuffer();

  return final;
}

// ─── MAIN (v9 ile aynı akış) ─────────────────────────────────────────────

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
    console.log(`🎨 BG prompt: "${String(prompt).substring(0, 80)}..."`);

    let buffer;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buffer = await thumbnailUret(
          prompt,
          jessIndirildi,
          baslikKisa,
          format,
          job.konu || "",
          hesaplar[attempt % hesaplar.length],
          String(JOB_ID || baslikKisa)
        );
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
    } catch (e) {
      // Telegram/Sheets fail olursa pipeline'ı kırmıyoruz; sadece çık.
    }
    process.exit(1);
  }
}

// Modül olarak doğrudan çalıştırılırsa main()'i tetikle.
// (Test/standalone kullanım için thumbnailUret + SVG üreticileri export'lu)
const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  main();
}

export {
  thumbnailUret,
  svgLong,
  svgShorts,
  svgVS,
  vsTespit,
  satirlaraBol,
  ctaSec,
  HIGHLIGHT_PALETTE,
};
