// REV 003/21JUN26 - Soru kapağı layout test: bayrak, hayvan FLUX, gezegen FLUX
/**
 * Kullanım: node scripts/05-thumbnail-test.js
 * 3 örnek thumbnail üretir — /tmp/thumb-test/ altına kaydeder.
 * FLUX çağrısı gerçektir; bayraklar Twemoji CDN'den indirilir.
 */

import fs from "fs";
import path from "path";
import { thumbnailUret } from "./05-thumbnail-uret.js";
import { getCfAccounts } from "./lib/cloudflare.js";

const OUT_DIR = "/tmp/thumb-test";
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const TESTS = [
  {
    name: "pizza-ulkeler",
    question: "Where did this food come from?",
    optionsVisual: [
      { label: "Italy",  type: "flag", code: "IT" },
      { label: "France", type: "flag", code: "FR" },
      { label: "USA",    type: "flag", code: "US" },
    ],
  },
  {
    name: "hayvanlar-flux",
    question: "Which animal lives in the ocean?",
    optionsVisual: [
      { label: "Octopus",  type: "flux", prompt: "octopus isolated on plain white background, vivid colors, no text" },
      { label: "Starfish", type: "flux", prompt: "starfish isolated on plain white background, vivid colors, no text" },
      { label: "Jellyfish",type: "flux", prompt: "jellyfish isolated on plain white background, vivid colors, no text" },
    ],
  },
  {
    name: "gezegenler-flux",
    question: "Which planet is the biggest?",
    optionsVisual: [
      { label: "Jupiter", type: "flux", prompt: "planet Jupiter with bands and Great Red Spot, isolated on plain black space background, photorealistic, no text" },
      { label: "Earth",   type: "flux", prompt: "planet Earth with continents visible, isolated on plain black space background, photorealistic, no text" },
      { label: "Saturn",  type: "flux", prompt: "planet Saturn with rings, isolated on plain black space background, photorealistic, no text" },
    ],
  },
];

const hesaplar = getCfAccounts();
if (hesaplar.length === 0) {
  console.error("❌ Cloudflare hesap bulunamadı");
  process.exit(1);
}

console.log(`✓ ${hesaplar.length} CF hesap\n📁 Çıktı: ${OUT_DIR}\n`);

for (const test of TESTS) {
  console.log(`━━━ ${test.name} ━━━`);
  console.log(`❓ "${test.question}"`);
  try {
    const buf = await thumbnailUret({
      question: test.question,
      optionsVisual: test.optionsVisual,
      format: "long",
      hesaplar,
      jobSeed: test.name,
    });
    const fpath = path.join(OUT_DIR, `${test.name}.jpg`);
    fs.writeFileSync(fpath, buf);
    console.log(`  ✅ ${fpath} (${(buf.length / 1024).toFixed(0)}KB)\n`);
  } catch (e) {
    console.error(`  ❌ ${e.message}\n`);
  }
}

console.log("━━━ TAMAMLANDI ━━━");
fs.readdirSync(OUT_DIR).forEach((f) => {
  const s = fs.statSync(path.join(OUT_DIR, f));
  console.log(`  ${f}  (${(s.size / 1024).toFixed(0)}KB)`);
});
