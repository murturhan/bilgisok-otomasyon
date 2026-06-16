/**
 * 05-thumbnail-test.js
 *
 * STANDALONE test: 6 farklı konu için viral thumbnail örnekleri üretir.
 * Her konu kendi tema paletini (jurassic/cosmic/wild/juicy/tasty/wild-vs)
 * kullanır, Twemoji SVG'leri hero olarak yerleştirilir.
 *
 * Bu test FLUX/Drive/Cloudflare BYPASS eder; sadece SVG + sharp + topic image
 * pipeline'ını mock'lar. Production'da topic visual rolünü FLUX bg üstlenir.
 *
 * Çalıştırma:
 *   node scripts/05-thumbnail-test.js
 *
 * Çıktı: ./test-output/ — 6 thumbnail
 */

import fs from "fs";
import path from "path";
import https from "https";
import sharp from "sharp";
import {
  svgLong,
  svgShorts,
  svgVS,
  svgVSBackground,
  vsTespit,
  temaSec,
} from "./05-thumbnail-uret.js";

const OUT_DIR = path.resolve("./test-output");
const TWEMOJI_CACHE = path.resolve("/tmp/twemoji-cache");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TWEMOJI_CACHE, { recursive: true });

/**
 * Twemoji SVG'sini indir (cache'li). Birden fazla unicode kombinasyonu için
 * - tek emoji  : "1f996" → t-rex
 * - kompozit   : "1f335-1f33c" gibi (ZWJ veya ayrı code point)
 */
function twemojiUrl(unicode) {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${unicode}.svg`;
}

async function downloadTwemoji(unicode) {
  const cachePath = path.join(TWEMOJI_CACHE, `${unicode}.svg`);
  if (fs.existsSync(cachePath)) return cachePath;
  const url = twemojiUrl(unicode);
  await new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = fs.createWriteStream(cachePath);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
  return cachePath;
}

/**
 * Twemoji SVG'lerini birleştirip tek bir buffer döndür.
 *
 * @param {string[]} unicodes - twemoji code points
 * @param {number} cellSize - her hücrenin boyutu (height/width)
 * @param {"horizontal"|"vertical"|"diamond"} layout - dizilim
 */
async function composeSubjects(unicodes, cellSize = 600, layout = "horizontal") {
  if (unicodes.length === 1) {
    const svgPath = await downloadTwemoji(unicodes[0]);
    return await sharp(svgPath, { density: 600 })
      .resize(null, cellSize, { fit: "inside" })
      .png()
      .toBuffer();
  }

  const bufs = await Promise.all(
    unicodes.map(async (u) => {
      const p = await downloadTwemoji(u);
      return sharp(p, { density: 600 })
        .resize(null, cellSize, { fit: "inside" })
        .png()
        .toBuffer();
    })
  );
  const metas = await Promise.all(bufs.map((b) => sharp(b).metadata()));

  if (layout === "vertical") {
    // Dikey yığma — shorts için çoklu subject
    const maxW = Math.max(...metas.map((m) => m.width));
    const overlap = 60;
    const totalH = metas.reduce((s, m) => s + m.height, 0) - (bufs.length - 1) * overlap;
    const canvas = sharp({
      create: { width: maxW, height: totalH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    });
    const composites = [];
    let y = 0;
    for (let i = 0; i < bufs.length; i++) {
      composites.push({
        input: bufs[i],
        left: Math.round((maxW - metas[i].width) / 2),
        top: y,
      });
      y += metas[i].height - overlap;
    }
    return canvas.composite(composites).png().toBuffer();
  }

  if (layout === "diamond" && unicodes.length === 3) {
    // Üçgen düzen: 1 üstte, 2 altta (eşkenar üçgen)
    const W = metas[0].width * 2.2;
    const H = metas[0].height * 1.7;
    const canvas = sharp({
      create: { width: Math.round(W), height: Math.round(H), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    });
    return canvas
      .composite([
        { input: bufs[0], left: Math.round((W - metas[0].width) / 2), top: 0 },
        { input: bufs[1], left: Math.round(W * 0.05), top: Math.round(H - metas[1].height) },
        { input: bufs[2], left: Math.round(W - metas[2].width - W * 0.05), top: Math.round(H - metas[2].height) },
      ])
      .png()
      .toBuffer();
  }

  // Horizontal (default)
  const totalW = metas.reduce((s, m) => s + m.width, 0) - (bufs.length - 1) * 60;
  const maxH = Math.max(...metas.map((m) => m.height));
  const canvas = sharp({
    create: { width: totalW, height: maxH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  const composites = [];
  let x = 0;
  for (let i = 0; i < bufs.length; i++) {
    composites.push({ input: bufs[i], left: x, top: Math.round((maxH - metas[i].height) / 2) });
    x += metas[i].width - 60;
  }
  return canvas.composite(composites).png().toBuffer();
}

/**
 * SVG + bg + subject hero birleşimi (production thumbnailUret() mock'u)
 */
async function renderTopic({ title, konu, subjectUnicodes, format, isim, layout = "auto" }) {
  const W = format === "shorts" ? 1080 : 1280;
  const H = format === "shorts" ? 1920 : 720;

  const tema = temaSec(`${title} ${konu}`);
  console.log(`  🎨 ${title} → ${tema.ad} tema`);

  // 1) BG: tema radial gradient (production'da FLUX bg gelir)
  const bgSvg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<radialGradient id="bg" cx="50%" cy="50%" r="80%">` +
    `<stop offset="0%" stop-color="${tema.bg2}"/>` +
    `<stop offset="100%" stop-color="${tema.bg1}"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="100%" height="100%" fill="url(#bg)"/>` +
    `</svg>`;
  let canvas = sharp(Buffer.from(bgSvg)).png();

  // 2) Subject hero (Twemoji) — merkez ~%70 (DRAMATİK BÜYÜK)
  // Çoklu subject + shorts → diamond/vertical düzen otomatik
  let pickedLayout = layout;
  if (pickedLayout === "auto") {
    if (subjectUnicodes.length === 1) pickedLayout = "horizontal";
    else if (subjectUnicodes.length === 3 && format === "shorts") pickedLayout = "diamond";
    else if (format === "shorts") pickedLayout = "vertical";
    else pickedLayout = "horizontal";
  }
  const cellSize = Math.floor(H * (format === "shorts" ? 0.40 : 0.66));
  let subjectBuf = await composeSubjects(subjectUnicodes, cellSize, pickedLayout);
  let sMeta = await sharp(subjectBuf).metadata();
  // Eğer subject canvas genişliğinden taşıyorsa küçült
  const maxW = Math.floor(W * 0.88);
  if (sMeta.width > maxW) {
    subjectBuf = await sharp(subjectBuf)
      .resize(maxW, null, { fit: "inside" })
      .png()
      .toBuffer();
    sMeta = await sharp(subjectBuf).metadata();
  }
  // Yüksekliği canvas'ın 80%'ini aşmasın
  const maxH = Math.floor(H * (format === "shorts" ? 0.62 : 0.72));
  if (sMeta.height > maxH) {
    subjectBuf = await sharp(subjectBuf)
      .resize(null, maxH, { fit: "inside" })
      .png()
      .toBuffer();
    sMeta = await sharp(subjectBuf).metadata();
  }

  // 2.5) Subject'e dramatik siyah drop-shadow ekle (Brain Time stili "pop")
  const shadowOffset = 10;
  const shadowBuf = await sharp(subjectBuf)
    .modulate({ saturation: 0, brightness: 0 })  // siyahlaştır
    .blur(8)
    .toBuffer();

  const sX = Math.round((W - sMeta.width) / 2);
  const sY = Math.round(
    format === "shorts"
      ? (H - sMeta.height) / 2 + 60
      : (H - sMeta.height) / 2 - 60
  );

  // 3) Subject arkası sıcak glow halkası (canvas'a sığacak şekilde clamp)
  const glowD = Math.min(
    Math.floor(Math.max(sMeta.width, sMeta.height) * 1.4),
    Math.min(W, H) - 20
  );
  const glowSvg =
    `<svg width="${glowD}" height="${glowD}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<radialGradient id="g" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="${tema.accent}" stop-opacity="0.95"/>` +
    `<stop offset="55%" stop-color="${tema.accent}" stop-opacity="0.35"/>` +
    `<stop offset="100%" stop-color="${tema.accent}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<circle cx="${glowD / 2}" cy="${glowD / 2}" r="${glowD / 2}" fill="url(#g)"/>` +
    `</svg>`;
  const glowBuf = await sharp(Buffer.from(glowSvg)).png().toBuffer();

  // 4) Overlay SVG (vignette + bant + başlık + CTA)
  const overlaySvg =
    format === "shorts"
      ? svgShorts(title, tema, isim)
      : svgLong(title, tema, isim);

  const layers = [
    {
      input: glowBuf,
      top: Math.round(sY + sMeta.height / 2 - glowD / 2),
      left: Math.round(sX + sMeta.width / 2 - glowD / 2),
    },
    // Subject siyah drop-shadow (sağ-alt offset)
    { input: shadowBuf, top: sY + shadowOffset, left: sX + shadowOffset, blend: "multiply" },
    { input: subjectBuf, top: sY, left: sX },
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
  ];

  const out = await canvas
    .composite(layers)
    .jpeg({ quality: 92 })
    .toBuffer();

  const dosya = path.join(OUT_DIR, isim);
  fs.writeFileSync(dosya, out);
  console.log(`  ✓ ${isim}  (${(out.length / 1024).toFixed(0)} KB)`);
}

async function renderVS({ vsTitle, konu, leftUnicodes, rightUnicodes, format, isim }) {
  const W = format === "shorts" ? 1080 : 1280;
  const H = format === "shorts" ? 1920 : 720;

  const vs = vsTespit(vsTitle);
  const tema = temaSec(`${vsTitle} ${konu}`);
  console.log(`  🆚 ${vsTitle} → ${tema.ad}`);

  // 1) Split-screen warm-contrast BG (yarı tema bg2→bg1, yarı blue)
  const bgSvg = svgVSBackground(tema, format);
  const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  const canvas = sharp(bgBuf);

  // 2) Subject icon'larını her yarıya BÜYÜK yerleştir
  const subH = Math.floor(H * (format === "shorts" ? 0.42 : 0.65));
  let leftBuf = await composeSubjects(leftUnicodes, subH);
  let rightBuf = await composeSubjects(rightUnicodes, subH);

  // Yarı genişliğe sığacak şekilde clamp (max %40 canvas genişliği)
  const halfMaxW = Math.floor(W * (format === "shorts" ? 0.78 : 0.42));
  const lmRaw = await sharp(leftBuf).metadata();
  if (lmRaw.width > halfMaxW) {
    leftBuf = await sharp(leftBuf).resize(halfMaxW, null, { fit: "inside" }).png().toBuffer();
  }
  const rmRaw = await sharp(rightBuf).metadata();
  if (rmRaw.width > halfMaxW) {
    rightBuf = await sharp(rightBuf).resize(halfMaxW, null, { fit: "inside" }).png().toBuffer();
  }
  const lm = await sharp(leftBuf).metadata();
  const rm = await sharp(rightBuf).metadata();

  let leftX, leftY, rightX, rightY;
  if (format === "shorts") {
    // Üst yarı (sol icon) - alt yarı (sağ icon)
    leftX = Math.round((W - lm.width) / 2);
    leftY = Math.round(H * 0.28 - lm.height / 2 + 60);   // üst yarının merkezi
    rightX = Math.round((W - rm.width) / 2);
    rightY = Math.round(H * 0.72 - rm.height / 2);        // alt yarının merkezi
  } else {
    // Sol yarı - sağ yarı
    leftX = Math.round((W / 2 - lm.width) / 2);
    leftY = Math.round((H - lm.height) / 2 + 30);
    rightX = Math.round(W / 2 + (W / 2 - rm.width) / 2);
    rightY = Math.round((H - rm.height) / 2 + 30);
  }

  // 3) Subject'ler için drop shadow
  const lShadow = await sharp(leftBuf).modulate({ saturation: 0, brightness: 0 }).blur(8).toBuffer();
  const rShadow = await sharp(rightBuf).modulate({ saturation: 0, brightness: 0 }).blur(8).toBuffer();

  // 4) Overlay SVG (vignette + isimler + VS rozet + CTA)
  const svgOverlay = svgVS(vs, tema, format, isim);

  const out = await canvas
    .composite([
      { input: lShadow, top: leftY + 10, left: leftX + 10, blend: "multiply" },
      { input: rShadow, top: rightY + 10, left: rightX + 10, blend: "multiply" },
      { input: leftBuf, top: leftY, left: leftX },
      { input: rightBuf, top: rightY, left: rightX },
      { input: Buffer.from(svgOverlay), top: 0, left: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  const dosya = path.join(OUT_DIR, isim);
  fs.writeFileSync(dosya, out);
  console.log(`  ✓ ${isim}  (${(out.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  console.log("📦 Twemoji indiriliyor (cache'li)...");

  // 6 farklı tema gösterimi
  // 1) DİNOZORLAR — jurassic tema (yeşil/lime), T-rex hero
  await renderTopic({
    title: "DİNOZORLAR",
    konu: "dinozor çağı",
    subjectUnicodes: ["1f996"], // 🦖
    format: "long",
    isim: "1-long-dinozor.jpg",
  });

  // 2) UZAY GEZEGENLERİ — cosmic tema (mor/pembe), gezegen + roket
  await renderTopic({
    title: "UZAY MACERA",
    konu: "uzay gezegenleri",
    subjectUnicodes: ["1fa90", "1f680"], // 🪐 🚀
    format: "long",
    isim: "2-long-uzay.jpg",
  });

  // 3) HAYVANLAR — wild tema (kırmızı/turuncu), aslan + fil shorts
  await renderTopic({
    title: "VAHŞİ HAYVANLAR",
    konu: "hayvan dünyası",
    subjectUnicodes: ["1f981", "1f418"], // 🦁 🐘
    format: "shorts",
    isim: "3-shorts-hayvan.jpg",
  });

  // 4) MEYVELER — juicy tema (bordo/sarı), çilek + muz + üzüm shorts
  await renderTopic({
    title: "RENKLİ MEYVELER",
    konu: "meyveler",
    subjectUnicodes: ["1f353", "1f34c", "1f347"], // 🍓 🍌 🍇
    format: "shorts",
    isim: "4-shorts-meyve.jpg",
  });

  // 5) PIZZA VS HAMBURGER — tasty tema, VS long
  await renderVS({
    vsTitle: "PIZZA VS HAMBURGER",
    konu: "yemek",
    leftUnicodes: ["1f355"],   // 🍕
    rightUnicodes: ["1f354"],  // 🍔
    format: "long",
    isim: "5-long-vs-yemek.jpg",
  });

  // 6) KAPLAN VS ASLAN — wild tema, VS shorts
  await renderVS({
    vsTitle: "KAPLAN VS ASLAN",
    konu: "vahşi hayvan",
    leftUnicodes: ["1f405"],   // 🐅
    rightUnicodes: ["1f981"],  // 🦁
    format: "shorts",
    isim: "6-shorts-vs-hayvan.jpg",
  });

  console.log(`\n✅ Tüm thumbnail'ler: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("HATA:", e);
  process.exit(1);
});
