/**
 * 05-thumbnail-test.js
 *
 * STANDALONE test/demo: tüm Google/Drive/Cloudflare/Telegram bağımlılıkları
 * BYPASS edilir; sadece SVG üretici + sharp composite test edilir.
 *
 * Çalıştırma:
 *   node scripts/05-thumbnail-test.js
 *
 * Çıktı: ./test-output/ klasöründe 6 örnek thumbnail.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  svgLong,
  svgShorts,
  svgVS,
  vsTespit,
} from "./05-thumbnail-uret.js";

const OUT_DIR = path.resolve("./test-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * SVG'yi pastel arka plan üzerine compose edip PNG'ye dönüştür.
 */
async function render(svg, w, h, isim) {
  const bgSvg =
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
    `<stop offset="0%" stop-color="#7FFF7F"/>` +
    `<stop offset="50%" stop-color="#5BE0FF"/>` +
    `<stop offset="100%" stop-color="#FF5BA7"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    // Demo "ana görsel" — gerçek pipeline'da FLUX bg buraya gelir.
    `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.28}" ` +
    `fill="#FFE600" opacity="0.55"/>` +
    `</svg>`;

  const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  const out = await sharp(bgBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
  const dosya = path.join(OUT_DIR, isim);
  fs.writeFileSync(dosya, out);
  console.log(`✓ ${isim}  (${(out.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  // 1) LONG — kısa başlık
  await render(svgLong("DİNOZORLAR", "seed-1"), 1280, 720, "long-1-kisa.jpg");

  // 2) LONG — uzun başlık (otomatik 2 satıra bölünmeli)
  await render(
    svgLong("UZAY GEZEGENLERİ QUIZ", "seed-2"),
    1280,
    720,
    "long-2-uzun.jpg"
  );

  // 3) SHORTS — kısa
  await render(svgShorts("HAYVANLAR", "seed-3"), 1080, 1920, "shorts-1-kisa.jpg");

  // 4) SHORTS — uzun
  await render(
    svgShorts("RENKLİ MEYVELER", "seed-4"),
    1080,
    1920,
    "shorts-2-uzun.jpg"
  );

  // 5) VS LONG — kaplan vs aslan
  const vsL = vsTespit("KAPLAN VS ASLAN");
  console.log("VS tespit (long):", vsL);
  await render(svgVS(vsL, "long", "seed-5"), 1280, 720, "long-3-vs.jpg");

  // 6) VS SHORTS — pizza vs hamburger
  const vsS = vsTespit("PIZZA vs HAMBURGER");
  await render(svgVS(vsS, "shorts", "seed-6"), 1080, 1920, "shorts-3-vs.jpg");

  console.log(`\n✅ Tüm thumbnail'ler ${OUT_DIR} klasörüne yazıldı.`);
}

main().catch((e) => {
  console.error("HATA:", e);
  process.exit(1);
});
