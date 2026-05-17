/**
 * 03 - Seslendirme v5 (Her ses parçası ayrı MP3 - SES-VİDEO SENKRON)
 *
 * Önceki v4: Tek MP3 üretiyordu (intro+sorular+outro birleşik)
 * Bu v5: AYRI MP3'ler üretir:
 *   - intro.mp3
 *   - q01-question.mp3, q01-answer.mp3
 *   - q02-question.mp3, q02-answer.mp3
 *   - ...
 *   - outro.mp3
 *
 * Her MP3'ün süresi audio-segments.json'a yazılır.
 * 07-video-montaj bu süreleri kullanıp Remotion'a verir → tam senkron video.
 *
 * Akış:
 * 1. questions.json'dan tüm metinleri oku
 * 2. Her metin için ayrı TTS çağrısı (en-US-Chirp3-HD-Kore + pitch shift +2)
 * 3. Her MP3'ü Drive'a yükle (02-ses/ klasörüne)
 * 4. audio-segments.json yaz (süre bilgileri)
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { exec } from "child_process";
import { promisify } from "util";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
  getOAuthClient,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);
const { JOB_ID } = process.env;

const VOICE_NAME = "en-US-Chirp3-HD-Kore";
const LANGUAGE_CODE = "en-US";
const PITCH_SHIFT_SEMITONES = 2;
const MAX_CHARS_PER_REQUEST = 4500; // Tek parça için yüksek limit, böleceğiz nadiren

// ─── METIN TEMİZLEME (TTS için) ─────────────────────────────────
function ttsMetinTemizle(metin) {
  let sonuc = String(metin || "").trim();
  
  // İngilizce kısaltma açma
  const kisaltmalar = [
    [/\bMr\./g, "Mister"],
    [/\bMrs\./g, "Misses"],
    [/\bMs\./g, "Miss"],
    [/\bDr\./g, "Doctor"],
    [/\bProf\./g, "Professor"],
    [/\bSt\./g, "Saint"],
    [/\be\.g\./gi, "for example"],
    [/\bi\.e\./gi, "that is"],
    [/\betc\./gi, "etcetera"],
    [/\bvs\./gi, "versus"],
    [/\bapprox\./gi, "approximately"],
    [/\bno\./gi, "number"],
    [/(\d+)\s*km\b/gi, "$1 kilometers"],
    [/(\d+)\s*cm\b/gi, "$1 centimeters"],
    [/(\d+)\s*kg\b/gi, "$1 kilograms"],
    [/\bB\.C\./g, "B C"],
    [/\bA\.D\./g, "A D"],
  ];
  for (const [r, rep] of kisaltmalar) sonuc = sonuc.replace(r, rep);
  
  // Emoji temizle
  sonuc = sonuc
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "");
  
  // Boşluk normalize
  sonuc = sonuc.replace(/\s+/g, " ").trim();
  
  return sonuc;
}

// ─── TTS API çağrısı ───────────────────────────────────────────
async function ttsCagri(metin, accessToken) {
  const body = {
    input: { text: metin },
    voice: { languageCode: LANGUAGE_CODE, name: VOICE_NAME },
    audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000 },
  };
  
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`TTS API ${response.status}: ${errText.substring(0, 300)}`);
  }
  
  const data = await response.json();
  if (!data.audioContent) throw new Error("TTS audioContent yok");
  return Buffer.from(data.audioContent, "base64");
}

// ─── Pitch shift (rubberband veya asetrate fallback) ───────────
async function pitchShiftUygula(girdiYol, ciktiYol) {
  const pitchRatio = Math.pow(2, PITCH_SHIFT_SEMITONES / 12);
  
  // rubberband dene
  try {
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "rubberband=pitch=${pitchRatio.toFixed(6)}" -ar 24000 "${ciktiYol}"`;
    await execAsync(cmd);
  } catch (e) {
    // Fallback: asetrate + atempo
    console.warn("rubberband yok, asetrate fallback");
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "asetrate=24000*${pitchRatio.toFixed(6)},atempo=${(1/pitchRatio).toFixed(6)},aresample=24000" "${ciktiYol}"`;
    await execAsync(cmd);
  }
}

// ─── MP3 süresi (saniye) ───────────────────────────────────────
async function mp3Suresi(yol) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${yol}"`
  );
  return parseFloat(stdout.trim());
}

// ─── Tek bir ses parçasını üret ────────────────────────────────
async function sesParcasiUret(metin, ciktiAdi, accessToken, tmpDir) {
  const temizMetin = ttsMetinTemizle(metin);
  
  if (!temizMetin || temizMetin.length < 3) {
    console.warn(`⚠ ${ciktiAdi}: metin çok kısa, atlanıyor`);
    return null;
  }
  
  // TTS
  const buffer = await ttsCagri(temizMetin, accessToken);
  const hamYol = path.join(tmpDir, `ham-${ciktiAdi}`);
  fs.writeFileSync(hamYol, buffer);
  
  // Pitch shift
  const shiftedYol = path.join(tmpDir, ciktiAdi);
  await pitchShiftUygula(hamYol, shiftedYol);
  
  // Ham dosyayı sil
  try { fs.unlinkSync(hamYol); } catch (e) {}
  
  // Süreyi ölç
  const sure = await mp3Suresi(shiftedYol);
  const stats = fs.statSync(shiftedYol);
  
  console.log(`  ✓ ${ciktiAdi}: ${sure.toFixed(2)}s, ${(stats.size/1024).toFixed(0)}KB`);
  
  return {
    filename: ciktiAdi,
    filepath: shiftedYol,
    duration: sure,
    text: temizMetin,
    size: stats.size,
  };
}

// ─── questions.json'u Drive'dan oku (önce 02-ses, sonra ana klasör) ────
async function questionsJsonOku(jobFolderId, auth, hedefYol) {
  const drive = google.drive({ version: "v3", auth });
  
  // 1. Önce 02-ses alt klasöründe ara
  const sesKlasor = await driveAltKlasorBul("02-ses", jobFolderId);
  let fileId = null;
  
  if (sesKlasor.length > 0) {
    const res1 = await drive.files.list({
      q: `'${sesKlasor[0].id}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    if (res1.data.files && res1.data.files.length > 0) {
      fileId = res1.data.files[0].id;
      console.log("✓ questions.json '02-ses' klasöründe bulundu");
    }
  }
  
  // 2. Bulunmadıysa ana klasörde ara (backward compat)
  if (!fileId) {
    const res2 = await drive.files.list({
      q: `'${jobFolderId}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    if (res2.data.files && res2.data.files.length > 0) {
      fileId = res2.data.files[0].id;
      console.log("✓ questions.json ana klasörde bulundu (eski format)");
    }
  }
  
  if (!fileId) return null;
  
  const stream = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(hedefYol);
    stream.data.on("end", () => resolve()).on("error", reject).pipe(ws);
  });
  
  return JSON.parse(fs.readFileSync(hedefYol, "utf8"));
}

// ─── MAIN ──────────────────────────────────────────────────────
async function main() {
  const baslangic = Date.now();
  
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    await jobGuncelle(JOB_ID, { ses_status: "running" });
    
    // Çalışma klasörü
    const tmpDir = "/tmp/seslendirme";
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    
    // OAuth (Drive okuma için)
    const oauthAuth = getOAuthClient();
    
    // questions.json'u indir
    const questionsJsonYol = path.join(tmpDir, "questions.json");
    const questionsData = await questionsJsonOku(job.drive_folder_id, oauthAuth, questionsJsonYol);
    if (!questionsData) throw new Error("questions.json bulunamadı!");
    
    const questions = questionsData.questions;
    const soruSayisi = questions.length;
    console.log(`📋 ${soruSayisi} soru için ses parçaları üretilecek`);
    console.log(`Voice: ${VOICE_NAME} (pitch +${PITCH_SHIFT_SEMITONES})`);
    
    // Google TTS Access Token (Service Account)
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const authClient = await auth.getClient();
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;
    if (!accessToken) throw new Error("TTS access token alınamadı");
    console.log("✓ TTS access token alındı");
    
    // ─── Tüm ses parçaları için liste oluştur ────────────────
    const segmentTasks = [];
    
    // Intro
    segmentTasks.push({
      key: "intro",
      filename: "intro.mp3",
      text: questionsData.intro_audio_text,
    });
    
    // Her soru için 2 parça: question + answer
    for (let i = 0; i < soruSayisi; i++) {
      const q = questions[i];
      const idx = String(i + 1).padStart(2, "0");
      
      segmentTasks.push({
        key: `q${idx}-question`,
        filename: `q${idx}-question.mp3`,
        text: q.question_audio_text,
        question_index: i,
        type: "question",
      });
      segmentTasks.push({
        key: `q${idx}-answer`,
        filename: `q${idx}-answer.mp3`,
        text: q.answer_audio_text,
        question_index: i,
        type: "answer",
      });
    }
    
    // Outro
    segmentTasks.push({
      key: "outro",
      filename: "outro.mp3",
      text: questionsData.outro_audio_text,
    });
    
    console.log(`📊 Toplam ${segmentTasks.length} ses parçası üretilecek`);
    console.log(`   (1 intro + ${soruSayisi*2} soru + 1 outro)`);
    
    // ─── Her parçayı üret (sırayla, TTS rate limit yememek için) ───
    const segments = [];
    for (let i = 0; i < segmentTasks.length; i++) {
      const task = segmentTasks[i];
      console.log(`Parça ${i+1}/${segmentTasks.length}: ${task.filename}`);
      
      const sonuc = await sesParcasiUret(task.text, task.filename, accessToken, tmpDir);
      if (sonuc) {
        segments.push({
          key: task.key,
          ...sonuc,
          question_index: task.question_index,
          type: task.type,
        });
      }
      
      // Hafif bekleme (TTS rate limit)
      if (i < segmentTasks.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    
    console.log(`✓ ${segments.length} parça üretildi`);
    
    // ─── Drive'a yükle (02-ses klasörü) ──────────────────────
    const sesKlasor = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasor.length === 0) throw new Error("02-ses klasörü yok");
    
    console.log(`⬆️ Drive'a yükleniyor (${segments.length} dosya)...`);
    
    // Paralel yükleme (4 thread)
    const PARALLEL = 4;
    for (let i = 0; i < segments.length; i += PARALLEL) {
      const batch = segments.slice(i, i + PARALLEL);
      await Promise.all(
        batch.map(s => driveDosyaYukle(
          { filename: s.filename, filepath: s.filepath },
          sesKlasor[0].id,
          "audio/mpeg"
        ))
      );
    }
    console.log(`✓ Tüm ses parçaları Drive'a yüklendi`);
    
    // ─── audio-segments.json yaz ─────────────────────────────
    const segmentsManifest = {
      voice: VOICE_NAME,
      pitch_shift_semitones: PITCH_SHIFT_SEMITONES,
      total_segments: segments.length,
      total_voice_duration: segments.reduce((sum, s) => sum + s.duration, 0),
      segments: segments.map(s => ({
        key: s.key,
        filename: s.filename,
        duration: s.duration,
        question_index: s.question_index,
        type: s.type,
      })),
    };
    
    const manifestYol = path.join(tmpDir, "audio-segments.json");
    fs.writeFileSync(manifestYol, JSON.stringify(segmentsManifest, null, 2));
    await driveDosyaYukle(
      { filename: "audio-segments.json", filepath: manifestYol },
      sesKlasor[0].id,
      "application/json"
    );
    console.log(`✓ audio-segments.json yüklendi`);
    
    // Temizlik
    fs.rmSync(tmpDir, { recursive: true, force: true });
    
    const toplamSure = ((Date.now() - baslangic) / 1000).toFixed(0);
    const voiceTotal = segmentsManifest.total_voice_duration.toFixed(1);
    
    await jobGuncelle(JOB_ID, { ses_status: `completed:${segments.length}` });
    await telegram(
      job.chat_id,
      `🦊 *Jess voice ready!*\n` +
      `🎙 ${segments.length} segments (${voiceTotal}s total)\n` +
      `⏱ Generation: ${toplamSure}s`
    );
    
    console.log(`✅ Seslendirme tamam (${toplamSure}s)`);
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { ses_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *03-Seslendirme error:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
