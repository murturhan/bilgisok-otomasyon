/**
 * 07 - Video Montaj v14 (Remotion + Çoklu ses parçaları - SES-VİDEO SENKRON)
 *
 * v13'ten farkı:
 * - Tek MP3 yerine 03-seslendirme'nin ürettiği N adet MP3 indirilir
 * - audio-segments.json'dan her parçanın süresi okunur
 * - inputProps'a intro, outro ve her sorunun question/answer audio path+duration verilir
 * - Remotion her sahnenin uzunluğunu kendi audio süresine göre dinamik hesaplar
 * - Tam ses-video senkron
 *
 * Akış:
 * 1. questions.json + audio-segments.json indir
 * 2. Tüm ses parçalarını ve görselleri remotion/public/ içine indir
 * 3. inputProps oluştur (her parçanın path ve süresi dahil)
 * 4. Remotion render
 * 5. Drive'a yükle
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
} = process.env;

const TMP_DIR = "/tmp/video-montaj";
const REMOTION_DIR = path.resolve(process.cwd(), "remotion");
const REMOTION_PUBLIC = path.join(REMOTION_DIR, "public");

// ─── Drive yardımcıları ────────────────────────────────────────────
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

async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

async function jsonIndir(folderId, filename, auth, hedefYol) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${filename}' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  if (!res.data.files || res.data.files.length === 0) return null;
  await driveIndir(res.data.files[0].id, hedefYol, auth);
  return JSON.parse(fs.readFileSync(hedefYol, "utf8"));
}

async function jessPozlariniIndir(auth, hedefKlasor) {
  if (!GDRIVE_JESS_FOLDER_ID) return {};
  const dosyalar = await driveKlasorIcerigi(GDRIVE_JESS_FOLDER_ID, auth);
  const pngler = dosyalar.filter(d => d.name.toLowerCase().endsWith(".png"));
  const pozMap = {};
  for (const d of pngler) {
    const ad = d.name.toLowerCase().replace(".png", "");
    let pozKey = null;
    if (ad.includes("intro")) pozKey = "intro";
    else if (ad.includes("question")) pozKey = "question";
    else if (ad.includes("thinking")) pozKey = "thinking";
    else if (ad.includes("correct")) pozKey = "correct";
    else if (ad.includes("outro")) pozKey = "outro";
    if (pozKey) {
      const hedef = path.join(hedefKlasor, `jess-${pozKey}.png`);
      await driveIndir(d.id, hedef, auth);
      pozMap[pozKey] = hedef;
    }
  }
  console.log(`✓ Jess pozları: ${Object.keys(pozMap).join(", ")}`);
  return pozMap;
}

async function bgMuzikIndir(auth, hedefYol) {
  if (!GDRIVE_MUZIK_FOLDER_ID) return null;
  const moodKlasor = await driveAltKlasorAraSA("kids-happy", GDRIVE_MUZIK_FOLDER_ID, auth);
  const kaynakId = moodKlasor.length > 0 ? moodKlasor[0].id : GDRIVE_MUZIK_FOLDER_ID;
  const dosyalar = await driveKlasorIcerigi(kaynakId, auth);
  const muzikler = dosyalar.filter(d =>
    d.name.match(/\.(mp3|wav|m4a|ogg)$/i) &&
    !d.name.toLowerCase().includes("intro-outro")
  );
  if (muzikler.length === 0) return null;
  const secilen = muzikler[Math.floor(Math.random() * muzikler.length)];
  await driveIndir(secilen.id, hedefYol, auth);
  console.log(`✓ Müzik: ${secilen.name}`);
  return hedefYol;
}

// ─── MAIN ──────────────────────────────────────────────────────────
async function main() {
  const toplamBaslangic = Date.now();

  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);

    try {
      await execAsync("which ffmpeg");
      await execAsync("which npx");
    } catch (e) {
      throw new Error("Gereken araç yok (ffmpeg veya npx)");
    }

    await jobGuncelle(JOB_ID, { video_status: "running" });

    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    fs.rmSync(REMOTION_PUBLIC, { recursive: true, force: true });
    fs.mkdirSync(REMOTION_PUBLIC, { recursive: true });
    fs.mkdirSync(path.join(REMOTION_PUBLIC, "questions"), { recursive: true });
    fs.mkdirSync(path.join(REMOTION_PUBLIC, "jess"), { recursive: true });
    fs.mkdirSync(path.join(REMOTION_PUBLIC, "audio"), { recursive: true });

    const oauthAuth = getOAuthClient();
    const saAuth = getServiceAccountAuth();

    // 1. Format tespit
    const format = await formatTespit(job.drive_folder_id, oauthAuth);
    const compositionId = format === "shorts" ? "KidsQuizShorts" : "KidsQuizLong";
    console.log(`📺 Format: ${format} → ${compositionId}`);

    // 2. questions.json indir
    const questionsData = await jsonIndir(
      job.drive_folder_id,
      "questions.json",
      oauthAuth,
      path.join(TMP_DIR, "questions.json")
    );
    if (!questionsData) throw new Error("questions.json yok!");
    const questions = questionsData.questions;
    const soruSayisi = questions.length;
    console.log(`❓ ${soruSayisi} soru`);

    // 3. audio-segments.json indir (02-ses klasöründen)
    const sesKlasor = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasor.length === 0) throw new Error("02-ses klasörü yok");
    const segmentsManifest = await jsonIndir(
      sesKlasor[0].id,
      "audio-segments.json",
      oauthAuth,
      path.join(TMP_DIR, "audio-segments.json")
    );
    if (!segmentsManifest) throw new Error("audio-segments.json yok! 03-seslendirme v5 çalıştırıldı mı?");
    
    console.log(`🎙 ${segmentsManifest.total_segments} ses parçası, toplam ${segmentsManifest.total_voice_duration.toFixed(1)}s`);

    // 4. Tüm ses parçalarını indir
    const sesler = await driveKlasorIcerigi(sesKlasor[0].id, oauthAuth);
    const mp3ler = sesler.filter(d => d.name.toLowerCase().endsWith(".mp3"));
    
    console.log("⬇️ Ses parçaları indiriliyor...");
    const sesIndirmePromises = [];
    const sesPathMap = {}; // {key: path}
    
    for (const seg of segmentsManifest.segments) {
      const driveDosya = mp3ler.find(m => m.name === seg.filename);
      if (!driveDosya) {
        console.warn(`⚠ ${seg.filename} Drive'da yok`);
        continue;
      }
      const yerelYol = path.join(REMOTION_PUBLIC, "audio", seg.filename);
      sesIndirmePromises.push(driveIndir(driveDosya.id, yerelYol, oauthAuth));
      sesPathMap[seg.key] = `audio/${seg.filename}`;
    }
    
    // 5. Soru görsellerini indir
    const gorselKlasor = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (gorselKlasor.length === 0) throw new Error("01-gorseller yok");
    const gorseller = await driveKlasorIcerigi(gorselKlasor[0].id, oauthAuth);
    const gorselDosyalar = gorseller.filter(d => d.name.match(/\.(jpg|jpeg|png|webp)$/i));
    if (gorselDosyalar.length < soruSayisi) {
      throw new Error(`${gorselDosyalar.length} görsel var, ${soruSayisi} gerekli`);
    }
    
    console.log("⬇️ Soru görselleri indiriliyor...");
    const gorselIndirmePromises = [];
    for (let i = 0; i < soruSayisi; i++) {
      const yerelAdi = `q${String(i + 1).padStart(2, "0")}.jpg`;
      const yol = path.join(REMOTION_PUBLIC, "questions", yerelAdi);
      gorselIndirmePromises.push(driveIndir(gorselDosyalar[i].id, yol, oauthAuth));
      questions[i].image_path = `questions/${yerelAdi}`;
    }

    // 6. Jess pose'larını indir
    const jessPozlarPromise = jessPozlariniIndir(saAuth, path.join(REMOTION_PUBLIC, "jess"));

    // 7. Arka plan müziği indir
    const bgMuzikYol = path.join(REMOTION_PUBLIC, "audio", "bg-music.mp3");
    const bgMuzikPromise = bgMuzikIndir(saAuth, bgMuzikYol);

    const [jessPozlar] = await Promise.all([
      jessPozlarPromise,
      bgMuzikPromise,
      ...sesIndirmePromises,
      ...gorselIndirmePromises,
    ]);
    
    console.log(`✓ Tüm materyaller indirildi`);

    // 8. Sorulara audio path + duration ata
    const segByKey = {};
    for (const seg of segmentsManifest.segments) {
      segByKey[seg.key] = seg;
    }
    
    for (let i = 0; i < soruSayisi; i++) {
      const idx = String(i + 1).padStart(2, "0");
      const qSeg = segByKey[`q${idx}-question`];
      const aSeg = segByKey[`q${idx}-answer`];
      
      if (qSeg) {
        questions[i].question_audio_path = `audio/${qSeg.filename}`;
        questions[i].question_audio_duration = qSeg.duration;
      } else {
        questions[i].question_audio_duration = 8.0; // fallback
      }
      
      if (aSeg) {
        questions[i].answer_audio_path = `audio/${aSeg.filename}`;
        questions[i].answer_audio_duration = aSeg.duration;
      } else {
        questions[i].answer_audio_duration = 8.0; // fallback
      }
    }

    // 9. inputProps hazırla
    const jessPosesForRemotion = {};
    for (const [pose, absPath] of Object.entries(jessPozlar)) {
      jessPosesForRemotion[pose] = path.relative(REMOTION_PUBLIC, absPath);
    }
    
    const introSeg = segByKey["intro"];
    const outroSeg = segByKey["outro"];
    
    const inputProps = {
      title: "GeniMini Tests",
      topic: questionsData.konu || job.konu || "",
      channel_name: "GeniMini Tests",
      questions: questions,
      jess_poses: jessPosesForRemotion,
      
      // YENİ: intro/outro audio path + duration
      intro_audio_path: introSeg ? `audio/${introSeg.filename}` : undefined,
      outro_audio_path: outroSeg ? `audio/${outroSeg.filename}` : undefined,
      intro_audio_duration: introSeg?.duration || 5.0,
      outro_audio_duration: outroSeg?.duration || 5.0,
      
      background_music_url: fs.existsSync(bgMuzikYol)
        ? path.relative(REMOTION_PUBLIC, bgMuzikYol)
        : undefined,
    };

    const propsJsonPath = path.join(TMP_DIR, "input-props.json");
    fs.writeFileSync(propsJsonPath, JSON.stringify(inputProps, null, 2));
    console.log(`✓ inputProps yazıldı`);
    console.log(`  Intro: ${inputProps.intro_audio_duration.toFixed(1)}s`);
    console.log(`  Outro: ${inputProps.outro_audio_duration.toFixed(1)}s`);
    console.log(`  Q durations: ${questions.map(q => `${q.question_audio_duration.toFixed(1)}+${q.answer_audio_duration.toFixed(1)}`).join(", ")}`);

    // 10. NPM install
    console.log("📦 Remotion bağımlılıkları kuruluyor...");
    await execAsync(`cd "${REMOTION_DIR}" && npm install --silent --no-audit --no-fund`, {
      maxBuffer: 200 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });

    // 11. Render
    const finalVideoYol = path.join(TMP_DIR, "final.mp4");
    console.log("🎬 Remotion render başlıyor...");
    const renderCmd = `cd "${REMOTION_DIR}" && npx remotion render src/index.ts ${compositionId} "${finalVideoYol}" --props="${propsJsonPath}" --concurrency=1 --codec=h264 --crf=22 --pixel-format=yuv420p`;
    
    const renderBaslangic = Date.now();
    const { stderr: renderErr } = await execAsync(renderCmd, {
      maxBuffer: 500 * 1024 * 1024,
      timeout: 60 * 60 * 1000, // 60 dk max
    });
    const renderSure = ((Date.now() - renderBaslangic) / 1000).toFixed(0);
    console.log(`✓ Render tamam: ${renderSure}s`);
    if (renderErr) console.log(`stderr (ignored): ${renderErr.substring(0, 300)}`);

    if (!fs.existsSync(finalVideoYol)) {
      throw new Error("Render çıktısı oluşmadı!");
    }
    
    const finalStats = fs.statSync(finalVideoYol);
    console.log(`✓ Final video: ${(finalStats.size / 1024 / 1024).toFixed(1)} MB`);

    // 12. Drive'a yükle
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
    fs.renameSync(finalVideoYol, filepath);

    const yuklenen = await driveDosyaYukle({ filename, filepath }, videoKlasorId, "video/mp4");

    // Temizlik
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.rmSync(REMOTION_PUBLIC, { recursive: true, force: true });

    const toplamSureSec = ((Date.now() - toplamBaslangic) / 1000).toFixed(0);
    
    // Toplam video süresi tahmini
    const tahminToplam = inputProps.intro_audio_duration + 
      questions.reduce((s, q) => s + q.question_audio_duration + 5 + 2 + q.answer_audio_duration + 1, 0) +
      inputProps.outro_audio_duration;
    const videoSureDk = Math.floor(tahminToplam / 60);
    const videoSureSn = Math.floor(tahminToplam % 60);

    await jobGuncelle(JOB_ID, {
      video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB`,
    });

    await telegram(
      job.chat_id,
      `🎬 *Kids Quiz video ready!* 🦊\n\n` +
        `📌 ${job.baslik}\n` +
        `📺 ${format}\n` +
        `❓ ${soruSayisi} questions\n` +
        `📦 ${(finalStats.size / 1024 / 1024).toFixed(1)} MB\n` +
        `⏱ ~${videoSureDk}:${String(videoSureSn).padStart(2, "0")}\n` +
        `⚡ Render: ${renderSure}s (Toplam: ${toplamSureSec}s)\n\n` +
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
        `❌ *07-Video error:* ${error.message.substring(0, 400)}`
      );
    } catch (e) {}
    process.exit(1);
  }
}

main();
