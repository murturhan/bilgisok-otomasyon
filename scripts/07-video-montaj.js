/**
 * 07 - Video Montaj v12 (GeniMini Kids Quiz)
 *
 * Format akışı:
 *   ┌─ INTRO (Jess greets, 5s)
 *   ├─ Question 1 (28s):
 *   │     • 0.0-3.0s: question_text görseli + soru metni + Jess (question pose)
 *   │     • 3.0-8.0s: 4 cevap kutusu + 5sn geri sayım (Jess thinking) + tick SFX
 *   │     • 8.0-10.0s: drum roll + suspense
 *   │     • 10.0-13.0s: doğru cevap reveal (yeşil vurgu, Jess correct) + correct SFX + applause
 *   │     • 13.0-22.0s: fun fact metni + Jess
 *   │     • 22.0-25.0s: whoosh + sonraki soruya geçiş
 *   │     • 25.0-28.0s: nefes (transition)
 *   ├─ ... (her soru aynı format)
 *   └─ OUTRO (Jess goodbye + outro müziği, 5s)
 *
 * Çözünürlük:
 *   • Shorts (klasörde -shorts-) → 1080x1920 dikey, 5 soru, ~70s
 *   • Long (klasörde -long-)    → 1920x1080 yatay, 25 soru, ~12 dk
 *
 * Materyaller:
 *   • Job klasörü/01-gorseller/  → FLUX'tan soru görselleri
 *   • Job klasörü/02-ses/        → 03-seslendirme'den tek MP3 (Jess konuşması)
 *   • GDRIVE_JESS_FOLDER_ID      → 5 Jess pose PNG (sabit)
 *   • GDRIVE_SFX_FOLDER_ID       → 6 SFX MP3 (sabit)
 *   • GDRIVE_MUZIK_FOLDER_ID/kids-happy/ → arka plan müziği (rastgele)
 *
 * Çıktı:
 *   • Job klasörü/07-video/final-{timestamp}.mp4
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { google } from "googleapis";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveKlasorAc,
  driveDosyaYukle,
  getOAuthClient,
  getServiceAccountAuth,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);

const {
  JOB_ID,
  GDRIVE_MUZIK_FOLDER_ID,
  GDRIVE_JESS_FOLDER_ID,
  GDRIVE_SFX_FOLDER_ID,
} = process.env;

const TMP_DIR = "/tmp/video-montaj";
const FPS = 30;
const INTRO_SURE = 5.0;
const OUTRO_SURE = 5.0;
const SORU_GORSEL_FAZ = 3.0;
const GERI_SAYIM_FAZ = 5.0;
const DRUM_ROLL_FAZ = 2.0;
const REVEAL_FAZ = 3.0;
const FUN_FACT_FAZ = 9.0;
const TRANSITION_FAZ = 3.0;
const NEFES_FAZ = 3.0;
const SORU_TOPLAM_SURE =
  SORU_GORSEL_FAZ + GERI_SAYIM_FAZ + DRUM_ROLL_FAZ +
  REVEAL_FAZ + FUN_FACT_FAZ + TRANSITION_FAZ + NEFES_FAZ; // 28s

// ─── Drive yardımcı ────────────────────────────────────────────────
async function driveKlasorIcerigi(klasorId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${klasorId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, size)",
    pageSize: 200,
    orderBy: "name",
  });
  return res.data.files || [];
}

async function driveAltKlasorAraSA(adKismi, parentId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const q = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and name contains '${adKismi.replace(/'/g, "\\'")}' and trashed=false`;
  const res = await drive.files.list({ q, fields: "files(id, name)", pageSize: 10 });
  return res.data.files || [];
}

async function driveIndir(fileId, hedefYol, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(hedefYol);
    res.data.on("end", () => resolve()).on("error", reject).pipe(writeStream);
  });
}

// ─── FFmpeg yardımcı ───────────────────────────────────────────────
async function ffmpegCalistir(args, etiket = "ffmpeg") {
  const cmd = `ffmpeg -y -hide_banner -loglevel error ${args}`;
  const baslangic = Date.now();
  try {
    const { stderr } = await execAsync(cmd, {
      maxBuffer: 100 * 1024 * 1024,
      timeout: 25 * 60 * 1000,
    });
    const sure = ((Date.now() - baslangic) / 1000).toFixed(1);
    console.log(`[${etiket}] ✓ ${sure}s`);
    if (stderr && stderr.length > 0 && !stderr.includes("deprecated")) {
      console.log(`  stderr: ${stderr.substring(0, 200)}`);
    }
  } catch (e) {
    console.error(`[${etiket}] HATA: ${e.message.substring(0, 800)}`);
    throw e;
  }
}

async function mp3Suresi(yol) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${yol}"`
  );
  return parseFloat(stdout.trim());
}

// ─── Metin temizleme (FFmpeg drawtext için) ────────────────────────
function escapeFfmpegText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019") // apostrof yerine smart quote
    .replace(/"/g, "")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// ─── Job klasör adından format tespit ──────────────────────────────
async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({
    fileId: jobFolderId,
    fields: "name",
  });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

// ─── Soru sayısı: questions.json'dan ya da görsel sayısından ───────
async function questionsJsonOku(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${jobFolderId}' in parents and name='questions.json' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  if (!res.data.files || res.data.files.length === 0) return null;

  const tmpYol = path.join(TMP_DIR, "questions.json");
  await driveIndir(res.data.files[0].id, tmpYol, auth);
  return JSON.parse(fs.readFileSync(tmpYol, "utf8"));
}

// ─── Jess pose dosyalarını topla ───────────────────────────────────
async function jessPoseDosyalari(auth) {
  if (!GDRIVE_JESS_FOLDER_ID) {
    console.log("⚠ GDRIVE_JESS_FOLDER_ID yok, Jess overlay atlanıyor");
    return null;
  }
  const dosyalar = await driveKlasorIcerigi(GDRIVE_JESS_FOLDER_ID, auth);
  const pngler = dosyalar.filter(d => d.name.toLowerCase().endsWith(".png"));
  const pozMap = {};
  for (const d of pngler) {
    const ad = d.name.toLowerCase().replace(".png", "");
    if (ad.includes("intro")) pozMap.intro = d;
    else if (ad.includes("question")) pozMap.question = d;
    else if (ad.includes("thinking")) pozMap.thinking = d;
    else if (ad.includes("correct")) pozMap.correct = d;
    else if (ad.includes("outro")) pozMap.outro = d;
  }
  console.log(`✓ Jess pozları: ${Object.keys(pozMap).join(", ")}`);
  return pozMap;
}

// ─── SFX dosyalarını topla ─────────────────────────────────────────
async function sfxDosyalari(auth) {
  if (!GDRIVE_SFX_FOLDER_ID) {
    console.log("⚠ GDRIVE_SFX_FOLDER_ID yok, SFX atlanıyor");
    return {};
  }
  const dosyalar = await driveKlasorIcerigi(GDRIVE_SFX_FOLDER_ID, auth);
  const mp3ler = dosyalar.filter(d => d.name.toLowerCase().endsWith(".mp3"));
  const sfxMap = {};
  for (const d of mp3ler) {
    const ad = d.name.toLowerCase().replace(".mp3", "");
    sfxMap[ad] = d;
  }
  console.log(`✓ SFX: ${Object.keys(sfxMap).join(", ")}`);
  return sfxMap;
}

// ─── Müzik seç (kids-happy) ────────────────────────────────────────
async function muzikSec(auth) {
  if (!GDRIVE_MUZIK_FOLDER_ID) return null;

  const moodKlasorler = await driveAltKlasorAraSA("kids-happy", GDRIVE_MUZIK_FOLDER_ID, auth);
  let kaynakId = moodKlasorler.length > 0 ? moodKlasorler[0].id : GDRIVE_MUZIK_FOLDER_ID;

  const dosyalar = await driveKlasorIcerigi(kaynakId, auth);
  const muzikler = dosyalar.filter(d =>
    d.name.match(/\.(mp3|wav|m4a|ogg)$/i) &&
    !d.name.toLowerCase().includes("intro-outro") // intro/outro ayrı kullanılır
  );

  if (muzikler.length === 0) return null;
  return muzikler[Math.floor(Math.random() * muzikler.length)];
}

async function introOutroMuzigiSec(auth) {
  if (!GDRIVE_MUZIK_FOLDER_ID) return null;
  const moodKlasorler = await driveAltKlasorAraSA("kids-happy", GDRIVE_MUZIK_FOLDER_ID, auth);
  const kaynakId = moodKlasorler.length > 0 ? moodKlasorler[0].id : GDRIVE_MUZIK_FOLDER_ID;
  const dosyalar = await driveKlasorIcerigi(kaynakId, auth);
  const vokalli = dosyalar.find(d =>
    d.name.toLowerCase().includes("intro-outro") &&
    d.name.match(/\.(mp3|wav|m4a|ogg)$/i)
  );
  return vokalli || null;
}

// ─── PNG'i bir görselin üstüne yerleştir (Jess overlay) ────────────
function jessOverlayFilter(jessIndex, videoW, videoH, jessGenislik = null) {
  // Jess sağ-alt köşede, video genişliğinin ~25%'i
  const w = jessGenislik || Math.floor(videoW * 0.28);
  // Sağ alt
  const xPos = videoW - w - 30;
  const yPos = videoH - w - 30; // kare assume
  return `[${jessIndex}:v]scale=${w}:-1[jess${jessIndex}];[outv][jess${jessIndex}]overlay=${xPos}:${yPos}[outv]`;
}

// ─── INTRO video segmenti ──────────────────────────────────────────
async function introSegmentUret(introYol, jessIntroYol, videoW, videoH) {
  // Solid gradient arka plan + Jess intro + "GeniMini Tests" başlık
  // Süre: INTRO_SURE
  const filterParts = [];
  let inputs = "";

  // Renkli gradient arka plan (color filter)
  // Mavi → mor → pembe gradient
  inputs += `-f lavfi -t ${INTRO_SURE} -i "color=c=0x7B4CDD:s=${videoW}x${videoH}:r=${FPS}" `;
  
  // Üst banner: "GENİMİNİ TESTS"
  let vf = `[0:v]drawtext=text='GeniMini Tests':` +
    `fontsize=${Math.floor(videoH * 0.08)}:` +
    `fontcolor=yellow:` +
    `borderw=6:bordercolor=black:` +
    `x=(w-text_w)/2:y=h*0.15:` +
    `font='DejaVu Sans:style=Bold'[bg1];` +
    `[bg1]drawtext=text='Quiz Time with Jess\\!':` +
    `fontsize=${Math.floor(videoH * 0.05)}:` +
    `fontcolor=white:` +
    `borderw=4:bordercolor=black:` +
    `x=(w-text_w)/2:y=h*0.28:` +
    `font='DejaVu Sans'[outv]`;

  if (jessIntroYol && fs.existsSync(jessIntroYol)) {
    inputs += `-loop 1 -t ${INTRO_SURE} -i "${jessIntroYol}" `;
    // Jess ortada büyük
    const jessW = Math.floor(videoW * 0.5);
    const jessX = `(W-w)/2`;
    const jessY = `H*0.4`;
    vf += `;[1:v]scale=${jessW}:-1[jess];[outv][jess]overlay=${jessX}:${jessY}[outv]`;
  }

  const args = `${inputs} -filter_complex "${vf}" -map "[outv]" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -r ${FPS} -t ${INTRO_SURE} "${introYol}"`;
  await ffmpegCalistir(args, "intro");
}

// ─── OUTRO video segmenti ──────────────────────────────────────────
async function outroSegmentUret(outroYol, jessOutroYol, videoW, videoH) {
  let inputs = `-f lavfi -t ${OUTRO_SURE} -i "color=c=0xFF57A6:s=${videoW}x${videoH}:r=${FPS}" `;

  let vf = `[0:v]drawtext=text='Thanks for playing\\!':` +
    `fontsize=${Math.floor(videoH * 0.07)}:` +
    `fontcolor=yellow:` +
    `borderw=6:bordercolor=black:` +
    `x=(w-text_w)/2:y=h*0.12:` +
    `font='DejaVu Sans:style=Bold'[bg1];` +
    `[bg1]drawtext=text='Subscribe for more\\!':` +
    `fontsize=${Math.floor(videoH * 0.05)}:` +
    `fontcolor=white:` +
    `borderw=4:bordercolor=black:` +
    `x=(w-text_w)/2:y=h*0.85:` +
    `font='DejaVu Sans'[outv]`;

  if (jessOutroYol && fs.existsSync(jessOutroYol)) {
    inputs += `-loop 1 -t ${OUTRO_SURE} -i "${jessOutroYol}" `;
    const jessW = Math.floor(videoW * 0.5);
    vf += `;[1:v]scale=${jessW}:-1[jess];[outv][jess]overlay=(W-w)/2:H*0.25[outv]`;
  }

  const args = `${inputs} -filter_complex "${vf}" -map "[outv]" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -r ${FPS} -t ${OUTRO_SURE} "${outroYol}"`;
  await ffmpegCalistir(args, "outro");
}

// ─── SORU video segmenti (28 saniye, tek soru için tüm fazlar) ─────
async function soruSegmentUret({
  ciktiYol,
  gorselYol,
  jessQuestionYol,
  jessThinkingYol,
  jessCorrectYol,
  question,
  videoW,
  videoH,
  soruNo,
  toplamSoru,
}) {
  // Faz başlangıç zamanları
  const t0 = 0;
  const t1 = t0 + SORU_GORSEL_FAZ;           // 3.0 - countdown başlar
  const t2 = t1 + GERI_SAYIM_FAZ;            // 8.0 - drum roll başlar
  const t3 = t2 + DRUM_ROLL_FAZ;             // 10.0 - reveal başlar
  const t4 = t3 + REVEAL_FAZ;                // 13.0 - fun fact başlar
  const t5 = t4 + FUN_FACT_FAZ;              // 22.0 - transition başlar
  // toplam: 25.0 + nefes 3.0 = 28.0

  const correctIdx = question.correct_answer;
  const correctLetter = ["A", "B", "C", "D"][correctIdx];

  // Metinleri temizle
  const questionText = escapeFfmpegText(question.question_text);
  const opt0 = escapeFfmpegText(`A: ${question.options[0]}`);
  const opt1 = escapeFfmpegText(`B: ${question.options[1]}`);
  const opt2 = escapeFfmpegText(`C: ${question.options[2]}`);
  const opt3 = escapeFfmpegText(`D: ${question.options[3]}`);
  const correctAnswerText = escapeFfmpegText(`Correct: ${correctLetter}: ${question.options[correctIdx]}`);
  const funFactText = escapeFfmpegText(question.fun_fact || "");
  const soruEtiketi = escapeFfmpegText(`Question ${soruNo}/${toplamSoru}`);

  // Font boyutları (videoH oranı)
  const titleSize = Math.floor(videoH * 0.05);
  const optionSize = Math.floor(videoH * 0.04);
  const counterSize = Math.floor(videoH * 0.13);
  const revealSize = Math.floor(videoH * 0.06);
  const funFactSize = Math.floor(videoH * 0.035);
  const labelSize = Math.floor(videoH * 0.03);

  // Input listesi:
  //   [0] solid gradient bg (28s)
  //   [1] question gorseli (28s loop)
  //   [2] jess-question (faz 0-1)
  //   [3] jess-thinking (faz 1-3)
  //   [4] jess-correct (faz 3-5)
  let inputs = "";
  inputs += `-f lavfi -t ${SORU_TOPLAM_SURE} -i "color=c=0x1A1A2E:s=${videoW}x${videoH}:r=${FPS}" `;
  inputs += `-loop 1 -t ${SORU_TOPLAM_SURE} -i "${gorselYol}" `;
  
  const hasJess = jessQuestionYol && fs.existsSync(jessQuestionYol);
  if (hasJess) {
    inputs += `-loop 1 -t ${SORU_TOPLAM_SURE} -i "${jessQuestionYol}" `;
    inputs += `-loop 1 -t ${SORU_TOPLAM_SURE} -i "${jessThinkingYol || jessQuestionYol}" `;
    inputs += `-loop 1 -t ${SORU_TOPLAM_SURE} -i "${jessCorrectYol || jessQuestionYol}" `;
  }

  // Görsel pozisyonu: üst-orta (yatay) veya üst (dikey)
  const isVertical = videoH > videoW;
  const gorselGenislik = isVertical ? Math.floor(videoW * 0.85) : Math.floor(videoW * 0.45);
  const gorselY = isVertical ? Math.floor(videoH * 0.08) : Math.floor(videoH * 0.12);
  const gorselX = isVertical ? `(W-w)/2` : `40`;

  // Jess pose pozisyonu (sağ alt, küçük)
  const jessW = Math.floor(videoW * 0.22);
  const jessX = `W-w-20`;
  const jessY = `H-h-20`;

  // Filter complex inşa
  let filter = "";

  // Question gorseli scale + position
  filter += `[1:v]scale=${gorselGenislik}:-1[qimg];`;
  filter += `[0:v][qimg]overlay=${gorselX}:${gorselY}[bg];`;

  // Soru etiketi (üst köşe)
  filter += `[bg]drawtext=text='${soruEtiketi}':` +
    `fontsize=${labelSize}:fontcolor=yellow:` +
    `borderw=3:bordercolor=black:` +
    `x=30:y=30:` +
    `font='DejaVu Sans:style=Bold'[bg];`;

  // Question text (görselin altında)
  const qTextY = isVertical
    ? `H*0.50`
    : `H*0.18`;
  filter += `[bg]drawtext=text='${questionText}':` +
    `fontsize=${titleSize}:fontcolor=white:` +
    `borderw=4:bordercolor=black:` +
    `x=(w-text_w)/2:y=${qTextY}:` +
    `font='DejaVu Sans:style=Bold'[bg];`;

  // Options (4 kutu) - countdown başlayınca görünür
  // Yatay layout: 2x2 grid
  // Dikey layout: dikey sıralı
  const optY = isVertical
    ? [0.58, 0.65, 0.72, 0.79]
    : [0.40, 0.50, 0.60, 0.70];
  const optX = isVertical
    ? [0.10, 0.10, 0.10, 0.10]
    : [0.52, 0.52, 0.52, 0.52];

  const opts = [opt0, opt1, opt2, opt3];
  for (let i = 0; i < 4; i++) {
    const isCorrect = i === correctIdx;
    // Reveal'dan sonra doğru cevap yeşil, diğerleri normal
    const beforeRevealColor = "white";
    const correctRevealColor = "lime";
    const wrongRevealColor = "gray";

    // İki overlay: t0-t3 normal, t3-t5 yeşil/gri
    filter += `[bg]drawtext=text='${opts[i]}':` +
      `fontsize=${optionSize}:` +
      `fontcolor='if(lt(t\\,${t3})\\,white\\,${isCorrect ? correctRevealColor : wrongRevealColor})':` +
      `borderw=3:bordercolor=black:` +
      `box=1:boxcolor='if(lt(t\\,${t3})\\,0x000000AA\\,${isCorrect ? "0x00CC00CC" : "0x44444499"})':boxborderw=8:` +
      `x=W*${optX[i]}:y=H*${optY[i]}:` +
      `enable='gte(t,${t1})':` +
      `font='DejaVu Sans:style=Bold'[bg];`;
  }

  // Geri sayım: 5,4,3,2,1 (t1'den t2'ye, her saniye)
  for (let n = 5; n >= 1; n--) {
    const showStart = t1 + (5 - n);
    const showEnd = showStart + 1.0;
    filter += `[bg]drawtext=text='${n}':` +
      `fontsize=${counterSize}:fontcolor=yellow:` +
      `borderw=8:bordercolor=red:` +
      `x=(w-text_w)/2:y=h*0.85:` +
      `enable='between(t,${showStart.toFixed(2)},${showEnd.toFixed(2)})':` +
      `font='DejaVu Sans:style=Bold'[bg];`;
  }

  // Drum roll fazı (t2-t3): "..."
  filter += `[bg]drawtext=text='Drumroll\\!':` +
    `fontsize=${revealSize}:fontcolor=orange:` +
    `borderw=5:bordercolor=black:` +
    `x=(w-text_w)/2:y=h*0.85:` +
    `enable='between(t,${t2.toFixed(2)},${t3.toFixed(2)})':` +
    `font='DejaVu Sans:style=Bold'[bg];`;

  // Reveal banner (t3-t4): "Correct: C: Eagle"
  filter += `[bg]drawtext=text='${correctAnswerText}':` +
    `fontsize=${revealSize}:fontcolor=lime:` +
    `borderw=5:bordercolor=black:` +
    `box=1:boxcolor=0x000000CC:boxborderw=12:` +
    `x=(w-text_w)/2:y=h*0.85:` +
    `enable='between(t,${t3.toFixed(2)},${t4.toFixed(2)})':` +
    `font='DejaVu Sans:style=Bold'[bg];`;

  // Fun fact (t4-t5)
  if (question.fun_fact) {
    // Wrap long fun fact
    filter += `[bg]drawtext=text='Did you know?':` +
      `fontsize=${labelSize}:fontcolor=cyan:` +
      `borderw=3:bordercolor=black:` +
      `x=(w-text_w)/2:y=h*0.80:` +
      `enable='between(t,${t4.toFixed(2)},${t5.toFixed(2)})':` +
      `font='DejaVu Sans:style=Bold'[bg];`;
    filter += `[bg]drawtext=text='${funFactText}':` +
      `fontsize=${funFactSize}:fontcolor=white:` +
      `borderw=3:bordercolor=black:` +
      `box=1:boxcolor=0x000000AA:boxborderw=10:` +
      `x=(w-text_w)/2:y=h*0.86:` +
      `enable='between(t,${t4.toFixed(2)},${t5.toFixed(2)})':` +
      `font='DejaVu Sans'[bg];`;
  }

  // Jess overlay'leri (faz bazlı)
  if (hasJess) {
    // t0-t1: question pose
    filter += `[2:v]scale=${jessW}:-1[jess_q];`;
    filter += `[bg][jess_q]overlay=${jessX}:${jessY}:enable='between(t,${t0.toFixed(2)},${t1.toFixed(2)})'[bg];`;
    // t1-t3: thinking pose
    filter += `[3:v]scale=${jessW}:-1[jess_t];`;
    filter += `[bg][jess_t]overlay=${jessX}:${jessY}:enable='between(t,${t1.toFixed(2)},${t3.toFixed(2)})'[bg];`;
    // t3-t5: correct pose
    filter += `[4:v]scale=${jessW}:-1[jess_c];`;
    filter += `[bg][jess_c]overlay=${jessX}:${jessY}:enable='between(t,${t3.toFixed(2)},${t5.toFixed(2)})'[bg];`;
  }

  filter += `[bg]format=yuv420p[outv]`;

  const args = `${inputs} -filter_complex "${filter}" -map "[outv]" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -r ${FPS} -t ${SORU_TOPLAM_SURE} "${ciktiYol}"`;
  await ffmpegCalistir(args, `soru-${soruNo}`);
}

// ─── Video segmentlerini birleştir ─────────────────────────────────
async function videolariBirlestir(segmentYollar, ciktiYol) {
  const listPath = path.join(TMP_DIR, "concat-list.txt");
  const lines = segmentYollar
    .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, lines);

  // Tüm segmentler aynı kodek ile üretildi, copy yeterli
  const args = `-f concat -safe 0 -i "${listPath}" -c copy "${ciktiYol}"`;
  await ffmpegCalistir(args, "concat-segments");
}

// ─── Quiz ses parça ses parça SFX karıştırma ───────────────────────
async function quizSesUret({
  jessSesYol,
  introMuzikYol,
  bgMuzikYol,
  sfxMap,
  sfxYollar,
  toplamSure,
  ciktiYol,
  introBitisT,
  outroBaslangicT,
  soruSayisi,
}) {
  // Inputs:
  //   [0] jess seslendirme (tüm video boyunca)
  //   [1] arka plan muziği (varsa, loop)
  //   [2] intro/outro vokalli muziği (varsa)
  //   [3+] SFX'ler: countdown-tick, correct-answer, applause-short, magic-sparkle, drum-roll, whoosh-transition
  
  let inputs = `-i "${jessSesYol}" `;
  let bgIdx = -1, introMzkIdx = -1;
  let nextIdx = 1;
  
  if (bgMuzikYol && fs.existsSync(bgMuzikYol)) {
    inputs += `-stream_loop -1 -i "${bgMuzikYol}" `;
    bgIdx = nextIdx++;
  }
  if (introMuzikYol && fs.existsSync(introMuzikYol)) {
    inputs += `-i "${introMuzikYol}" `;
    introMzkIdx = nextIdx++;
  }
  
  // SFX'ler için index map
  const sfxIdxMap = {};
  for (const [ad, yol] of Object.entries(sfxYollar)) {
    if (fs.existsSync(yol)) {
      inputs += `-i "${yol}" `;
      sfxIdxMap[ad] = nextIdx++;
    }
  }

  // Filter complex
  let filter = "";
  const mixInputs = [];

  // Jess konuşması (yüksek voice processing)
  filter += `[0:a]volume=1.2,highpass=f=85,lowpass=f=14000[voice];`;
  mixInputs.push("[voice]");

  // Arka plan müziği (düşük seviye, intro+outro hariç ortada)
  if (bgIdx > -1) {
    filter += `[${bgIdx}:a]volume=0.15,afade=t=in:ss=${introBitisT}:d=2[bgmusic];`;
    mixInputs.push("[bgmusic]");
  }

  // Intro/outro vokalli müzik
  if (introMzkIdx > -1) {
    filter += `[${introMzkIdx}:a]volume=0.35,atrim=duration=${INTRO_SURE},afade=t=out:st=${INTRO_SURE - 1}:d=1[introM];`;
    mixInputs.push("[introM]");
  }

  // SFX'leri belirli zamanlara yerleştir (adelay ile)
  // Her soru için: tick'ler (geri sayım sırasında), drum roll, correct, applause
  let sfxCount = 0;
  for (let s = 0; s < soruSayisi; s++) {
    const soruBaslangic = introBitisT + s * SORU_TOPLAM_SURE;
    
    // Tick sesi (geri sayım, 5 saniye boyunca, her saniye)
    if (sfxIdxMap["countdown-tick"] !== undefined) {
      const tickT0 = soruBaslangic + SORU_GORSEL_FAZ;
      for (let tick = 0; tick < 5; tick++) {
        const delayMs = Math.floor((tickT0 + tick) * 1000);
        const label = `tick${s}_${tick}`;
        filter += `[${sfxIdxMap["countdown-tick"]}:a]adelay=${delayMs}|${delayMs},volume=0.6[${label}];`;
        mixInputs.push(`[${label}]`);
        sfxCount++;
      }
    }
    
    // Drum roll (reveal öncesi)
    if (sfxIdxMap["drum-roll"] !== undefined) {
      const drumT = soruBaslangic + SORU_GORSEL_FAZ + GERI_SAYIM_FAZ;
      const delayMs = Math.floor(drumT * 1000);
      const label = `drum${s}`;
      filter += `[${sfxIdxMap["drum-roll"]}:a]adelay=${delayMs}|${delayMs},volume=0.45[${label}];`;
      mixInputs.push(`[${label}]`);
      sfxCount++;
    }
    
    // Correct answer (reveal anında)
    if (sfxIdxMap["correct-answer"] !== undefined) {
      const correctT = soruBaslangic + SORU_GORSEL_FAZ + GERI_SAYIM_FAZ + DRUM_ROLL_FAZ;
      const delayMs = Math.floor(correctT * 1000);
      const label = `correct${s}`;
      filter += `[${sfxIdxMap["correct-answer"]}:a]adelay=${delayMs}|${delayMs},volume=0.55[${label}];`;
      mixInputs.push(`[${label}]`);
      sfxCount++;
    }
    
    // Applause (reveal sonrası kısa)
    if (sfxIdxMap["applause-short"] !== undefined) {
      const applT = soruBaslangic + SORU_GORSEL_FAZ + GERI_SAYIM_FAZ + DRUM_ROLL_FAZ + 0.5;
      const delayMs = Math.floor(applT * 1000);
      const label = `appl${s}`;
      filter += `[${sfxIdxMap["applause-short"]}:a]adelay=${delayMs}|${delayMs},volume=0.30[${label}];`;
      mixInputs.push(`[${label}]`);
      sfxCount++;
    }
    
    // Whoosh (soru sonu transition)
    if (sfxIdxMap["whoosh-transition"] !== undefined && s < soruSayisi - 1) {
      const wooshT = soruBaslangic + SORU_TOPLAM_SURE - NEFES_FAZ - 0.5;
      const delayMs = Math.floor(wooshT * 1000);
      const label = `wsh${s}`;
      filter += `[${sfxIdxMap["whoosh-transition"]}:a]adelay=${delayMs}|${delayMs},volume=0.5[${label}];`;
      mixInputs.push(`[${label}]`);
      sfxCount++;
    }
  }
  
  // Magic sparkle intro/outro başında
  if (sfxIdxMap["magic-sparkle"] !== undefined) {
    filter += `[${sfxIdxMap["magic-sparkle"]}:a]adelay=500|500,volume=0.4[sparkle];`;
    mixInputs.push("[sparkle]");
    sfxCount++;
  }

  console.log(`🔊 ${sfxCount} SFX zaman zaman çalacak`);

  // Tüm sesleri karıştır
  filter += `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0:normalize=0[aout]`;

  const args = `${inputs} -filter_complex "${filter}" -map "[aout]" -c:a aac -b:a 192k -t ${toplamSure.toFixed(3)} "${ciktiYol}"`;
  await ffmpegCalistir(args, "quiz-audio-mix");
}

// ─── Final birleştir: video + ses ──────────────────────────────────
async function finalBirlestir(videoYol, sesYol, ciktiYol, sure) {
  const args = `-i "${videoYol}" -i "${sesYol}" ` +
    `-map 0:v -map 1:a ` +
    `-c:v copy -c:a copy ` +
    `-t ${sure.toFixed(3)} ` +
    `-shortest ` +
    `"${ciktiYol}"`;
  await ffmpegCalistir(args, "final-mux");
}

// ─── MAIN ──────────────────────────────────────────────────────────
async function main() {
  const toplamBaslangic = Date.now();

  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);

    try {
      await execAsync("which ffmpeg");
      const { stdout: nproc } = await execAsync("nproc");
      console.log(`💻 CPU çekirdek: ${nproc.trim()}`);
    } catch (e) {
      throw new Error("FFmpeg yok!");
    }

    await jobGuncelle(JOB_ID, { video_status: "running" });

    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });

    const oauthAuth = getOAuthClient();
    const saAuth = getServiceAccountAuth();

    // Format tespit
    const format = await formatTespit(job.drive_folder_id, oauthAuth);
    const videoW = format === "shorts" ? 1080 : 1920;
    const videoH = format === "shorts" ? 1920 : 1080;
    console.log(`📺 Format: ${format} (${videoW}x${videoH})`);

    // Questions JSON
    const questionsData = await questionsJsonOku(job.drive_folder_id, oauthAuth);
    if (!questionsData) throw new Error("questions.json yok!");
    const questions = questionsData.questions;
    const soruSayisi = questions.length;
    console.log(`❓ ${soruSayisi} soru`);

    // Görseller
    const gorselKlasor = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (gorselKlasor.length === 0) throw new Error("01-gorseller yok");
    const gorseller = await driveKlasorIcerigi(gorselKlasor[0].id, oauthAuth);
    const gorselDosyalar = gorseller.filter(d => d.name.match(/\.(jpg|jpeg|png|webp)$/i));
    if (gorselDosyalar.length < soruSayisi) {
      throw new Error(`${gorselDosyalar.length} görsel var, ${soruSayisi} gerekli`);
    }

    // Ses (03-seslendirme'den tek MP3)
    const sesKlasor = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasor.length === 0) throw new Error("02-ses yok");
    const sesler = await driveKlasorIcerigi(sesKlasor[0].id, oauthAuth);
    const mp3ler = sesler.filter(d => d.name.toLowerCase().endsWith(".mp3"));
    if (mp3ler.length === 0) throw new Error("MP3 yok");
    const enYeniMp3 = mp3ler[mp3ler.length - 1];

    // İndirme paralel
    console.log("⬇️ Materyaller indiriliyor...");
    
    const gorselYollar = [];
    const indirmePromises = [];
    
    for (let i = 0; i < soruSayisi; i++) {
      const yol = path.join(TMP_DIR, `gorsel-${String(i + 1).padStart(2, "0")}.jpg`);
      gorselYollar.push(yol);
      indirmePromises.push(driveIndir(gorselDosyalar[i].id, yol, oauthAuth));
    }
    
    const jessSesYol = path.join(TMP_DIR, "jess-voice.mp3");
    indirmePromises.push(driveIndir(enYeniMp3.id, jessSesYol, oauthAuth));

    // Jess pozları
    const jessPozlar = await jessPoseDosyalari(saAuth);
    const jessYollar = {};
    if (jessPozlar) {
      for (const [poz, dosya] of Object.entries(jessPozlar)) {
        const yol = path.join(TMP_DIR, `jess-${poz}.png`);
        jessYollar[poz] = yol;
        indirmePromises.push(driveIndir(dosya.id, yol, saAuth));
      }
    }

    // SFX'ler
    const sfxMap = await sfxDosyalari(saAuth);
    const sfxYollar = {};
    for (const [ad, dosya] of Object.entries(sfxMap)) {
      const yol = path.join(TMP_DIR, `sfx-${ad}.mp3`);
      sfxYollar[ad] = yol;
      indirmePromises.push(driveIndir(dosya.id, yol, saAuth));
    }

    // Müzik
    const introMuzigi = await introOutroMuzigiSec(saAuth);
    let introMuzikYol = null;
    if (introMuzigi) {
      introMuzikYol = path.join(TMP_DIR, "intro-music.mp3");
      indirmePromises.push(driveIndir(introMuzigi.id, introMuzikYol, saAuth));
    }
    
    const bgMuzigi = await muzikSec(saAuth);
    let bgMuzikYol = null;
    if (bgMuzigi) {
      bgMuzikYol = path.join(TMP_DIR, "bg-music.mp3");
      indirmePromises.push(driveIndir(bgMuzigi.id, bgMuzikYol, saAuth));
    }

    await Promise.all(indirmePromises);
    console.log(`✓ ${indirmePromises.length} dosya indirildi`);

    // Süre hesabı
    const jessSesSuresi = await mp3Suresi(jessSesYol);
    const toplamVideoSuresi = INTRO_SURE + (soruSayisi * SORU_TOPLAM_SURE) + OUTRO_SURE;
    console.log(`📏 Jess sesi: ${jessSesSuresi.toFixed(1)}s`);
    console.log(`📏 Toplam video: ${toplamVideoSuresi.toFixed(1)}s (${(toplamVideoSuresi / 60).toFixed(1)} dk)`);

    // ─── Video segmentleri üret ──────────────────────────────
    console.log("🎬 Intro segment...");
    const introYol = path.join(TMP_DIR, "seg-intro.mp4");
    await introSegmentUret(introYol, jessYollar.intro, videoW, videoH);

    console.log(`🎬 ${soruSayisi} soru segmenti...`);
    const soruSegmentYollar = [];
    for (let i = 0; i < soruSayisi; i++) {
      const segYol = path.join(TMP_DIR, `seg-soru-${String(i + 1).padStart(2, "0")}.mp4`);
      soruSegmentYollar.push(segYol);
      console.log(`  Soru ${i + 1}/${soruSayisi}...`);
      await soruSegmentUret({
        ciktiYol: segYol,
        gorselYol: gorselYollar[i],
        jessQuestionYol: jessYollar.question,
        jessThinkingYol: jessYollar.thinking,
        jessCorrectYol: jessYollar.correct,
        question: questions[i],
        videoW,
        videoH,
        soruNo: i + 1,
        toplamSoru: soruSayisi,
      });
    }

    console.log("🎬 Outro segment...");
    const outroYol = path.join(TMP_DIR, "seg-outro.mp4");
    await outroSegmentUret(outroYol, jessYollar.outro, videoW, videoH);

    // ─── Birleştir ───────────────────────────────────────────
    console.log("🔗 Segmentler birleştiriliyor...");
    const sessizVideoYol = path.join(TMP_DIR, "video-sessiz.mp4");
    const allSegments = [introYol, ...soruSegmentYollar, outroYol];
    await videolariBirlestir(allSegments, sessizVideoYol);

    // ─── Ses karışımı ────────────────────────────────────────
    console.log("🔊 Ses karışımı (Jess + müzik + SFX)...");
    const finalSesYol = path.join(TMP_DIR, "ses-mix.m4a");
    await quizSesUret({
      jessSesYol,
      introMuzikYol,
      bgMuzikYol,
      sfxMap,
      sfxYollar,
      toplamSure: toplamVideoSuresi,
      ciktiYol: finalSesYol,
      introBitisT: INTRO_SURE,
      outroBaslangicT: INTRO_SURE + soruSayisi * SORU_TOPLAM_SURE,
      soruSayisi,
    });

    // ─── Final mux ───────────────────────────────────────────
    console.log("🎬 Final mux (video + ses)...");
    const finalYol = path.join(TMP_DIR, "final.mp4");
    await finalBirlestir(sessizVideoYol, finalSesYol, finalYol, toplamVideoSuresi);

    const finalStats = fs.statSync(finalYol);

    // ─── Drive'a yükle ───────────────────────────────────────
    let videoKlasor = await driveAltKlasorBul("07-video", job.drive_folder_id);
    let videoKlasorId;
    if (videoKlasor.length === 0) {
      const yeni = await driveKlasorAc("07-video", job.drive_folder_id);
      videoKlasorId = yeni.id;
    } else {
      videoKlasorId = videoKlasor[0].id;
    }

    const filename = `kids-quiz-${format}-${Date.now()}.mp4`;
    const filepath = path.join(TMP_DIR, filename);
    fs.renameSync(finalYol, filepath);

    const yuklenen = await driveDosyaYukle({ filename, filepath }, videoKlasorId, "video/mp4");

    fs.rmSync(TMP_DIR, { recursive: true, force: true });

    const toplamSureSec = ((Date.now() - toplamBaslangic) / 1000).toFixed(0);

    await jobGuncelle(JOB_ID, {
      video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB`,
    });

    await telegram(
      job.chat_id,
      `🎬 *Kids Quiz video ready!* 🦊\n\n` +
        `📌 ${job.baslik}\n` +
        `📺 ${format} (${videoW}x${videoH})\n` +
        `❓ ${soruSayisi} questions\n` +
        `📦 ${(finalStats.size / 1024 / 1024).toFixed(1)} MB\n` +
        `⏱ ${Math.floor(toplamVideoSuresi / 60)}:${String(Math.floor(toplamVideoSuresi % 60)).padStart(2, "0")}\n` +
        `⚡ Render: ${toplamSureSec}s\n\n` +
        `📂 [Watch on Drive](${yuklenen.link})\n\n` +
        `━━━━━━━━━━━━━━━\n\n` +
        `▶️ *Upload to YouTube:*\n\n` +
        `\`/yukle ${JOB_ID}\` _(private)_\n` +
        `\`/yukle ${JOB_ID} unlisted\` _(unlisted)_\n` +
        `\`/yukle ${JOB_ID} public\` _(public)_`
    );

    console.log(`✅ TOPLAM: ${toplamSureSec}s`);
    process.exit(0);

  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, {
        video_status: `error: ${error.message.substring(0, 100)}`,
      });
      await telegram(
        job.chat_id,
        `❌ *07-Video error:* ${error.message.substring(0, 300)}`
      );
    } catch (e) {}
    process.exit(1);
  }
}

main();
