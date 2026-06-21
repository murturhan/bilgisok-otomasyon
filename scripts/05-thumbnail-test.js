// REV 002/21JUN26 - Quiz Blitz layout ile 5 test ornegi (gercek FLUX cagrisı)
/**
 * Kullanım: node scripts/05-thumbnail-test.js
 * 5 farklı konuda Quiz Blitz thumbnail üretir, /tmp/thumb-test/ altına kaydeder.
 * Gerçek FLUX çağrısı yapar — CF hesap bilgileri env'den okunur.
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
    baslik: "Whose Bite Is Strongest?",
    optionlar: ["Shark", "Alligator"],
    seed: "bite-test",
  },
  {
    baslik: "Which Is Faster?",
    optionlar: ["Turtle", "Bicycle", "Car"],
    seed: "speed-test",
  },
  {
    baslik: "The Most Dangerous?",
    optionlar: ["Lion", "Hornet"],
    seed: "danger-test",
  },
  {
    baslik: "Which Country Wins?",
    optionlar: ["Brazil", "Germany"],
    seed: "country-test",
  },
  {
    baslik: "Which Planet Is Bigger?",
    optionlar: ["Jupiter", "Earth"],
    seed: "planet-test",
  },
];

const hesaplar = getCfAccounts();
if (hesaplar.length === 0) {
  console.error("❌ Cloudflare hesap bulunamadı — CF env değişkenleri eksik");
  process.exit(1);
}

console.log(`✓ ${hesaplar.length} CF hesap yüklendi`);
console.log(`📁 Çıktı: ${OUT_DIR}\n`);

for (const test of TESTS) {
  console.log(`━━━ ${test.baslik} (${test.optionlar.join(", ")}) ━━━`);
  try {
    const buf = await thumbnailUret({
      baslik: test.baslik,
      optionlar: test.optionlar,
      format: "long",
      hesaplar,
      jobSeed: test.seed,
    });
    const fname = `thumb-${test.seed}.jpg`;
    const fpath = path.join(OUT_DIR, fname);
    fs.writeFileSync(fpath, buf);
    console.log(`  ✅ ${fpath} (${(buf.length / 1024).toFixed(0)}KB)\n`);
  } catch (e) {
    console.error(`  ❌ HATA: ${e.message}\n`);
  }
}

console.log("━━━ TAMAMLANDI ━━━");
console.log(`Çıktı: ${OUT_DIR}`);
fs.readdirSync(OUT_DIR).forEach((f) => {
  const stat = fs.statSync(path.join(OUT_DIR, f));
  console.log(`  ${f}  (${(stat.size / 1024).toFixed(0)}KB)`);
});
