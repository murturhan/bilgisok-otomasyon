/**
 * 03 - Seslendirme v8 (topic-announce + outro-announce eklendi)
 *
 * v6: Leda voice + pitch +3 (Kore → Leda, +2 → +3)
 * v7: intro.mp3 ve outro.mp3 ARTIK üretilmiyor — Jess video kendi sesini taşıyor
 * v8: topic-announce.mp3 + outro-announce.mp3 üretiliyor (07'deki TTS kodu kaldırıldı,
 *     tüm TTS işi burada — temiz mimari)
 *
 * AYRI MP3'ler üretir:
 *   - topic-announce.mp3 (Intro Sahne 2'de oynar — "Today: TOPIC! Let's play!")
 *   - outro-announce.mp3 (Outro Sahne 2'de oynar — "Subscribe! See you next time!")
 *   - q01-question.mp3, q01-answer.mp3
 *   - q02-question.mp3, q02-answer.mp3
 *   - ...
 *
 * Her MP3'ün süresi audio-segments.json'a yazılır.
 * 07-video-montaj bu süreleri + Jess video sürelerini kullanıp Remotion'a verir.
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

// ⚠️ DEĞİŞTİ: Kore → Leda (daha yumuşak, sempatik kadın sesi)
const VOICE_NAME = "en-US-Chirp3-HD-Leda";
const LANGUAGE_CODE = "en-US";
// ⚠️ DEĞİŞTİ: 2 → 3 (daha sevimli/çocuksu)
const PITCH_SHIFT_SEMITONES = 3;
const MAX_CHARS_PER_REQUEST = 4500;

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
  
  try {
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "rubberband=pitch=${pitchRatio.toFixed(6)}" -ar 24000 "${ciktiYol}"`;
    await execAsync(cmd);
  } catch (e) {
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
  
  const buffer = await ttsCagri(temizMetin, accessToken);
  const hamYol = path.join(tmpDir, `ham-${ciktiAdi}`);
  fs.writeFileSync(hamYol, buffer);
  
  const shiftedYol = path.join(tmpDir, ciktiAdi);
  await pitchShiftUygula(hamYol, shiftedYol);
  
  try { fs.unlinkSync(hamYol); } catch (e) {}
  
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

// ─── questions.json'u Drive'dan oku ───────────────────────────
async function questionsJsonOku(jobFolderId, auth, hedefYol) {
  const drive = google.drive({ version: "v3", auth });
  
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
    
    const tmpDir = "/tmp/seslendirme";
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    
    const oauthAuth = getOAuthClient();
    
    const questionsJsonYol = path.join(tmpDir, "questions.json");
    const questionsData = await questionsJsonOku(job.drive_folder_id, oauthAuth, questionsJsonYol);
    if (!questionsData) throw new Error("questions.json bulunamadı!");
    
    const questions = questionsData.questions;
    const soruSayisi = questions.length;
    console.log(`📋 ${soruSayisi} soru için ses parçaları üretilecek`);
    console.log(`Voice: ${VOICE_NAME} (pitch +${PITCH_SHIFT_SEMITONES})`);
    
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const authClient = await auth.getClient();
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;
    if (!accessToken) throw new Error("TTS access token alınamadı");
    console.log("✓ TTS access token alındı");
    
    const segmentTasks = [];
    
    // intro/outro mp3 üretimi kaldırıldı - Jess video kendi sesini taşıyor
    
    // TOPIC ANNOUNCE — Intro Sahne 2'de (topic reveal) oynar
    // OUTRO ANNOUNCE — Outro Sahne 2 (Subscribe) sahnesinde oynar
    // Format'a göre cümle değişir
    const format = questionsData.format || "shorts";
    const konu = questionsData.konu || "today's quiz";
    
    const topicAnnounceText = format === "shorts"
      ? `Today: ${konu}! Let's play!`
      : `Today's topic: ${konu}! Are you ready? Let's play!`;
    const outroAnnounceText = format === "shorts"
      ? "Don't forget to subscribe! See you next time!"
      : "If you enjoyed this quiz, please subscribe and hit the bell! See you next time, friends!";
    
    segmentTasks.push({
      key: "topic-announce",
      filename: "topic-announce.mp3",
      text: topicAnnounceText,
      type: "announce",
    });
    segmentTasks.push({
      key: "outro-announce",
      filename: "outro-announce.mp3",
      text: outroAnnounceText,
      type: "announce",
    });
    
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
    
    console.log(`📊 Toplam ${segmentTasks.length} ses parçası üretilecek`);
    console.log(`   (2 announce + ${soruSayisi*2} soru/cevap - Jess greeting video kendi sesini taşıyor)`);
    
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
      
      if (i < segmentTasks.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    
    console.log(`✓ ${segments.length} parça üretildi`);
    
    const sesKlasor = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasor.length === 0) throw new Error("02-ses klasörü yok");
    
    console.log(`⬆️ Drive'a yükleniyor (${segments.length} dosya)...`);
    
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
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    
    const toplamSure = ((Date.now() - baslangic) / 1000).toFixed(0);
    const voiceTotal = segmentsManifest.total_voice_duration.toFixed(1);
    
    await jobGuncelle(JOB_ID, { ses_status: `completed:${segments.length}` });
    await telegram(
      job.chat_id,
      `🦊 *Jess voice ready!*\n` +
      `🎙 Voice: ${VOICE_NAME} (pitch +${PITCH_SHIFT_SEMITONES})\n` +
      `📊 ${segments.length} segments (${voiceTotal}s total)\n` +
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
