/**
 * 07 - Video Montaj v13 (REMOTION ile profesyonel render)
 *
 * Akış:
 * 1. Job'un Drive klasöründen tüm materyalleri indir:
 *    - questions.json (sorular metadata)
 *    - 01-gorseller/*.jpg (soru görselleri)
 *    - 02-ses/*.mp3 (Jess konuşması)
 * 2. Sabit kaynaklardan indir:
 *    - GDRIVE_JESS_FOLDER_ID/*.png (Jess pose'ları)
 *    - GDRIVE_MUZIK_FOLDER_ID/kids-happy/*.mp3 (arka plan müziği)
 * 3. Format tespit (shorts/long klasör adından)
 * 4. Remotion'ı --props ile çalıştır
 * 5. Çıktıyı Drive'a yükle, Telegram bildirim
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
// Remotion projesi repo'da: repo_root/remotion/
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

// Job klasörü adından format tespit (-shorts- veya -long-)
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

// questions.json'u Drive'dan indir
async function questionsJsonOku(jobFolderId, auth, hedefYol) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${jobFolderId}' in parents and name='questions.json' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  if (!res.data.files || res.data.files.length === 0) return null;
  await driveIndir(res.data.files[0].id, hedefYol, auth);
  return JSON.parse(fs.readFileSync(hedefYol, "utf8"));
}

// Jess pozlarını indir, dict döner: { intro: "/abs/path", ... }
async function jessPozlariniIndir(auth, hedefKlasor) {
  if (!GDRIVE_JESS_FOLDER_ID) {
    console.log("⚠ GDRIVE_JESS_FOLDER_ID yok");
    return {};
  }
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

// kids-happy müzik klasöründen rastgele bir tane (intro-outro hariç)
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

    // Tools kontrol
    try {
      await execAsync("which ffmpeg");
      await execAsync("which npx");
      const { stdout: nproc } = await execAsync("nproc");
      console.log(`💻 CPU çekirdek: ${nproc.trim()}`);
    } catch (e) {
      throw new Error("Gereken araç yok (ffmpeg veya npx)");
    }

    await jobGuncelle(JOB_ID, { video_status: "running" });

    // Çalışma klasörlerini hazırla
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    // Remotion public klasörü temizle ve yeniden oluştur
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
    const questionsJsonYol = path.join(TMP_DIR, "questions.json");
    const questionsData = await questionsJsonOku(job.drive_folder_id, oauthAuth, questionsJsonYol);
    if (!questionsData) throw new Error("questions.json yok!");
    const questions = questionsData.questions;
    const soruSayisi = questions.length;
    console.log(`❓ ${soruSayisi} soru`);

    // 3. Soru görsellerini Remotion'ın public klasörüne indir
    const gorselKlasor = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (gorselKlasor.length === 0) throw new Error("01-gorseller yok");
    const gorseller = await driveKlasorIcerigi(gorselKlasor[0].id, oauthAuth);
    const gorselDosyalar = gorseller.filter(d => d.name.match(/\.(jpg|jpeg|png|webp)$/i));
    if (gorselDosyalar.length < soruSayisi) {
      throw new Error(`${gorselDosyalar.length} görsel var, ${soruSayisi} gerekli`);
    }
    
    console.log("⬇️ Soru görselleri indiriliyor...");
    const indirmePromises = [];
    for (let i = 0; i < soruSayisi; i++) {
      const yerelAdi = `q${String(i + 1).padStart(2, "0")}.jpg`;
      const yol = path.join(REMOTION_PUBLIC, "questions", yerelAdi);
      indirmePromises.push(driveIndir(gorselDosyalar[i].id, yol, oauthAuth));
      // questionsData içindeki image_path alanını set et (Remotion bunu kullanacak)
      questions[i].image_path = `questions/${yerelAdi}`;
    }

    // 4. Jess konuşma MP3'ünü indir
    const sesKlasor = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasor.length === 0) throw new Error("02-ses yok");
    const sesler = await driveKlasorIcerigi(sesKlasor[0].id, oauthAuth);
    const mp3ler = sesler.filter(d => d.name.toLowerCase().endsWith(".mp3"));
    if (mp3ler.length === 0) throw new Error("MP3 yok");
    const enYeniMp3 = mp3ler[mp3ler.length - 1];
    
    const jessSesYol = path.join(REMOTION_PUBLIC, "audio", "jess-voice.mp3");
    indirmePromises.push(driveIndir(enYeniMp3.id, jessSesYol, oauthAuth));

    // 5. Jess pose PNG'lerini indir
    const jessKlasor = path.join(REMOTION_PUBLIC, "jess");
    const jessPozlarPromise = jessPozlariniIndir(saAuth, jessKlasor);

    // 6. Arka plan müziği indir
    const bgMuzikYol = path.join(REMOTION_PUBLIC, "audio", "bg-music.mp3");
    const bgMuzikPromise = bgMuzikIndir(saAuth, bgMuzikYol);

    // Tüm indirmeler bitsin
    const [jessPozlar] = await Promise.all([
      jessPozlarPromise,
      bgMuzikPromise,
      ...indirmePromises,
    ]);
    
    console.log(`✓ Tüm materyaller indirildi`);

    // 7. inputProps JSON hazırla (Remotion buradan veri alacak)
    // Jess pose path'lerini Remotion'a göre relatif yap (public/ relative)
    const jessPosesForRemotion = {};
    for (const [pose, absPath] of Object.entries(jessPozlar)) {
      // Path'i Remotion public içine göre relative yap
      const relativePath = path.relative(REMOTION_PUBLIC, absPath);
      jessPosesForRemotion[pose] = relativePath;
    }
    
    // Voice ve music URL'leri - Remotion staticFile() ile yükleyecek
    const inputProps = {
      title: "GeniMini Tests",
      topic: questionsData.konu || job.konu || "",
      channel_name: "GeniMini Tests",
      intro_text: questionsData.intro_text || "Hi friends!",
      outro_text: questionsData.outro_text || "Thanks for playing!",
      questions: questions,
      jess_poses: Object.fromEntries(
        Object.entries(jessPosesForRemotion).map(([k, v]) => [
          k,
          // staticFile prefix yerine /public sonrası path
          v,
        ])
      ),
      voice_audio_url: fs.existsSync(jessSesYol)
        ? path.relative(REMOTION_PUBLIC, jessSesYol)
        : undefined,
      background_music_url: fs.existsSync(bgMuzikYol)
        ? path.relative(REMOTION_PUBLIC, bgMuzikYol)
        : undefined,
    };
    
    // staticFile() bekleyen alanlar için path'i public/ relative yapıyoruz.
    // Remotion otomatik olarak staticFile() ile resolve eder yan public klasöründen.
    // Ama daha kontrollü olması için JESS_POSES'a tam staticFile output'u verelim:
    // Sorun: inputProps JSON string olarak geçiyor, staticFile() runtime'da çalışıyor.
    // En basit: tüm path'leri relative bırak, schema validation yerine doğrudan ata.

    const propsJsonPath = path.join(TMP_DIR, "input-props.json");
    fs.writeFileSync(propsJsonPath, JSON.stringify(inputProps, null, 2));
    console.log(`✓ inputProps yazıldı: ${propsJsonPath}`);

    // 8. NPM install (Remotion deps)
    console.log("📦 Remotion bağımlılıkları kuruluyor...");
    await execAsync(`cd "${REMOTION_DIR}" && npm install --silent --no-audit --no-fund`, {
      maxBuffer: 200 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });

    // 9. Remotion render
    const finalVideoYol = path.join(TMP_DIR, "final.mp4");
    console.log("🎬 Remotion render başlıyor...");
    const renderCmd = `cd "${REMOTION_DIR}" && npx remotion render src/index.ts ${compositionId} "${finalVideoYol}" --props="${propsJsonPath}" --concurrency=1 --codec=h264 --crf=22 --pixel-format=yuv420p`;
    
    const renderBaslangic = Date.now();
    const { stdout: renderOut, stderr: renderErr } = await execAsync(renderCmd, {
      maxBuffer: 500 * 1024 * 1024,
      timeout: 45 * 60 * 1000, // 45 dk max
    });
    const renderSure = ((Date.now() - renderBaslangic) / 1000).toFixed(0);
    console.log(`✓ Render tamam: ${renderSure}s`);
    if (renderErr) console.log(`stderr: ${renderErr.substring(0, 500)}`);

    if (!fs.existsSync(finalVideoYol)) {
      throw new Error("Render çıktısı oluşmadı!");
    }
    
    const finalStats = fs.statSync(finalVideoYol);
    console.log(`✓ Final video: ${(finalStats.size / 1024 / 1024).toFixed(1)} MB`);

    // 10. Drive'a yükle (07-video klasörü)
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

    await jobGuncelle(JOB_ID, {
      video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB`,
    });

    // Video süresini hesapla
    const videoSureDk = Math.floor((150 + soruSayisi * 28) / 60);
    const videoSureSn = (150 + soruSayisi * 28) % 60;

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
