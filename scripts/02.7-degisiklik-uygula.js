/**
 * 02.7-degisiklik-uygula.js
 * 
 * Onay formundan submit gelince Worker'ın tetiklediği workflow.
 * 
 * Görevi:
 * 1. Worker'dan job verisi + edits'i çek
 * 2. Edit'leri questions.json'a uygula (Drive'a güncel JSON yaz)
 * 3. "regen_question_image" işaretli sorular için: Drive'dan eski görseli sil, FLUX'tan yeniden üret
 * 4. "regen_fact_image" işaretli sorular için: aynısı
 * 5. Sonra otomatik 03-seslendirme'yi tetikle
 */

import fs from "fs";
import { google } from "googleapis";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
  getServiceAccountAuth,
} from "./lib/google.js";
import { fluxRotationCagri } from "./lib/cloudflare.js";
import { telegram } from "./lib/telegram.js";

const {
  JOB_ID,
  WORKER_URL: WORKER_URL_RAW,
  GITHUB_TOKEN,
  GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME,
} = process.env;

const WORKER_URL = (WORKER_URL_RAW || "").replace(/\/+$/, "");

/**
 * Drive klasöründen belirli pattern'e uyan dosyaları sil
 */
async function driveDosyaSil(klasorId, pattern) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  let pageToken = undefined;
  const silinen = [];
  do {
    const res = await drive.files.list({
      q: `'${klasorId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files || []) {
      if (pattern.test(f.name)) {
        await drive.files.delete({ fileId: f.id });
        silinen.push(f.name);
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return silinen;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    
    if (!WORKER_URL) throw new Error("WORKER_URL eksik");
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN eksik");
    
    // 1. Worker'dan job + edits çek
    console.log("📥 Worker'dan job verisi çekiliyor...");
    const jobRes = await fetch(`${WORKER_URL}/api/job/${JOB_ID}`);
    if (!jobRes.ok) throw new Error(`Worker job çekme hatası: ${jobRes.status}`);
    const workerJob = await jobRes.json();
    
    // edits ayrı key'de
    console.log("📥 Worker'dan edits çekiliyor...");
    const editsRes = await fetch(`${WORKER_URL}/api/edits/${JOB_ID}`).catch(() => null);
    let edits = {};
    if (editsRes && editsRes.ok) {
      edits = await editsRes.json();
    } else {
      // Worker'da edits endpoint yoksa direkt KV'den çekemeyiz, hata at
      // Worker'a /api/edits/:id endpoint'i de eklenmeli (henüz eklenmedi, basitleştirme)
      // Alternatif: Worker submit'te edits'i job ile birleştirsin
      console.warn("⚠️ /api/edits/:id endpoint çağrısı başarısız, job içindeki edits aranıyor...");
      if (workerJob._edits) {
        edits = workerJob._edits;
      } else {
        throw new Error("Edits bulunamadı. Worker /api/edits/:id endpoint'i ekli mi?");
      }
    }
    
    // 2. Sheet'teki job'u al
    const job = await jobOku(JOB_ID);
    await jobGuncelle(JOB_ID, { onay_status: "applying" });
    
    if (!job.drive_folder_id) throw new Error("drive_folder_id yok");
    
    // 3. questions.json'u Drive'dan oku
    console.log("📂 questions.json Drive'dan okunuyor...");
    const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
    
    let questionsData = null;
    let questionsFileId = null;
    let questionsParentId = null;
    
    const sesSearchRes = await drive.files.list({
      q: `'${job.drive_folder_id}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    if (sesSearchRes.data.files && sesSearchRes.data.files.length > 0) {
      const sesFolderId = sesSearchRes.data.files[0].id;
      const jsonSearchRes = await drive.files.list({
        q: `'${sesFolderId}' in parents and name='questions.json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1,
      });
      if (jsonSearchRes.data.files && jsonSearchRes.data.files.length > 0) {
        questionsFileId = jsonSearchRes.data.files[0].id;
        questionsParentId = sesFolderId;
        const res = await drive.files.get({ fileId: questionsFileId, alt: "media" }, { responseType: "text" });
        questionsData = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        console.log("✓ questions.json '02-ses' klasöründen okundu");
      }
    }
    
    if (!questionsData) {
      const anaSearchRes = await drive.files.list({
        q: `'${job.drive_folder_id}' in parents and name='questions.json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1,
      });
      if (anaSearchRes.data.files && anaSearchRes.data.files.length > 0) {
        questionsFileId = anaSearchRes.data.files[0].id;
        questionsParentId = job.drive_folder_id;
        const res = await drive.files.get({ fileId: questionsFileId, alt: "media" }, { responseType: "text" });
        questionsData = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        console.log("✓ questions.json ana klasörden okundu");
      }
    }
    
    if (!questionsData) throw new Error("questions.json Drive'da bulunamadı");
    
    const regenQuestionImages = []; // [{ index, prompt }]
    const regenFactImages = [];
    
    for (const [idxStr, edit] of Object.entries(edits)) {
      const idx = parseInt(idxStr);
      const q = questionsData.questions[idx];
      if (!q) continue;
      
      // Text alanları güncelle
      if (typeof edit.question_text === "string") q.question_text = edit.question_text;
      if (Array.isArray(edit.options) && edit.options.length === 3) q.options = edit.options;
      if (typeof edit.correct_answer === "number") q.correct_answer = edit.correct_answer;
      if (typeof edit.fun_fact === "string") q.fun_fact = edit.fun_fact;
      if (typeof edit.show_image === "boolean") q.show_image = edit.show_image;
      
      // Prompt değiştiyse güncelle (regen için kullanılacak)
      if (typeof edit.image_prompt === "string") q.image_prompt = edit.image_prompt;
      if (typeof edit.fun_fact_image_prompt === "string") q.fun_fact_image_prompt = edit.fun_fact_image_prompt;
      
      // Audio text'leri yeniden hesapla (cevap değişmiş olabilir)
      const letters = ["A", "B", "C"];
      const correctLetter = letters[q.correct_answer];
      const correctOption = q.options[q.correct_answer];
      q.question_audio_text = `Question ${idx + 1}. ${q.question_text} Is it A: ${q.options[0]}, B: ${q.options[1]}, or C: ${q.options[2]}?`;
      q.answer_audio_text = `The correct answer is ${correctLetter}: ${correctOption}! ${q.fun_fact}`;
      
      // Regen mark
      if (edit.regen_question_image) {
        regenQuestionImages.push({ index: idx, prompt: q.image_prompt });
      }
      if (edit.regen_fact_image) {
        regenFactImages.push({ index: idx, prompt: q.fun_fact_image_prompt });
      }
    }
    
    // 4. Güncel questions.json'ı Drive'a geri yaz (eski dosyayı güncelle)
    const tmpJsonPath = "/tmp/questions-updated.json";
    fs.writeFileSync(tmpJsonPath, JSON.stringify(questionsData, null, 2));
    
    // Drive update (mevcut dosyayı yeni içerikle değiştir)
    const { Readable } = await import("stream");
    await drive.files.update({
      fileId: questionsFileId,
      media: {
        mimeType: "application/json",
        body: Readable.from(JSON.stringify(questionsData, null, 2)),
      },
    });
    try { fs.unlinkSync(tmpJsonPath); } catch (e) {}
    console.log(`✓ questions.json Drive'da güncellendi (${Object.keys(edits).length} edit)`);
    
    // 5. Regen görselleri üret
    const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("01-gorseller klasörü yok");
    const gorselKlasorId = altKlasorler[0].id;
    
    let regenSayisi = 0;
    
    // Soru görselleri regen
    if (regenQuestionImages.length > 0) {
      console.log(`🎨 ${regenQuestionImages.length} soru görseli yeniden üretiliyor...`);
      
      // Önce eski dosyaları sil
      for (const r of regenQuestionImages) {
        const idxStr = String(r.index + 1).padStart(2, "0");
        const silinen = await driveDosyaSil(gorselKlasorId, new RegExp(`^gorsel-${idxStr}-`));
        console.log(`  Silinen: ${silinen.join(", ") || "(yok)"}`);
      }
      
      // Yeniden üret
      const prompts = regenQuestionImages.map(r => r.prompt);
      const { sonuclar, hatalar } = await fluxRotationCagri(prompts, {
        width: 1280,
        height: 720,
        onSuccess: async (filteredIdx, buffer) => {
          const orijinalIdx = regenQuestionImages[filteredIdx].index;
          const filename = `gorsel-${String(orijinalIdx + 1).padStart(2, "0")}-${Date.now()}.jpg`;
          const filepath = `/tmp/${filename}`;
          fs.writeFileSync(filepath, buffer);
          try {
            await driveDosyaYukle({ filename, filepath }, gorselKlasorId, "image/jpeg");
            regenSayisi++;
          } finally {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        },
      });
      console.log(`  ✓ Soru görselleri: ${sonuclar.length}/${prompts.length} regen`);
    }
    
    // Fact görselleri regen
    if (regenFactImages.length > 0) {
      console.log(`🎨 ${regenFactImages.length} fact görseli yeniden üretiliyor...`);
      
      for (const r of regenFactImages) {
        const idxStr = String(r.index + 1).padStart(2, "0");
        const silinen = await driveDosyaSil(gorselKlasorId, new RegExp(`^fun-fact-${idxStr}-`));
        console.log(`  Silinen: ${silinen.join(", ") || "(yok)"}`);
      }
      
      const prompts = regenFactImages.map(r => r.prompt);
      const { sonuclar, hatalar } = await fluxRotationCagri(prompts, {
        width: 1280,
        height: 720,
        onSuccess: async (filteredIdx, buffer) => {
          const orijinalIdx = regenFactImages[filteredIdx].index;
          const filename = `fun-fact-${String(orijinalIdx + 1).padStart(2, "0")}-${Date.now()}.jpg`;
          const filepath = `/tmp/${filename}`;
          fs.writeFileSync(filepath, buffer);
          try {
            await driveDosyaYukle({ filename, filepath }, gorselKlasorId, "image/jpeg");
            regenSayisi++;
          } finally {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        },
      });
      console.log(`  ✓ Fact görselleri: ${sonuclar.length}/${prompts.length} regen`);
    }
    
    await jobGuncelle(JOB_ID, { onay_status: "completed" });
    
    await telegram(
      job.chat_id,
      `✅ *Değişiklikler uygulandı*\n\n🆔 Job: \`${JOB_ID}\`\n🎨 ${regenSayisi} görsel yeniden üretildi\n📝 ${Object.keys(edits).length} soru güncellendi\n\n⏳ 03-Seslendirme otomatik başlatılıyor...`
    );
    
    // 6. 03-seslendirme'yi tetikle (GitHub Action repository_dispatch)
    console.log("🚀 03-seslendirme tetikleniyor...");
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "geniminitests-degisiklik-uygula",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "seslendirme_uret",
          client_payload: {
            job_id: JOB_ID,
            chat_id: job.chat_id,
          },
        }),
      }
    );
    
    if (!dispatchRes.ok) {
      const txt = await dispatchRes.text();
      throw new Error(`03 tetikleme hatası: ${dispatchRes.status} ${txt.substring(0, 200)}`);
    }
    
    console.log("✅ 03-seslendirme tetiklendi");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { onay_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *02.7-Değişiklik hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
