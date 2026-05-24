/**
 * 02.7-degisiklik-uygula.js
 * 
 * Onay formundan submit gelince Worker'ın tetiklediği workflow.
 * 
 * approval_level değerine göre:
 *   regen_only  → görsel/text güncellemeleri uygula, sonra TEKRAR 02.5'i tetikle (yeni onay turu)
 *   render_only → görsel/text güncellemeleri uygula, sonra 07-video-montaj'ı tetikle (TTS atla)
 *   full        → görsel/text güncellemeleri uygula, sonra 03-seslendirme'yi tetikle (sonra 07 zaten otomatik)
 */

import fs from "fs";
import { Readable } from "stream";
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
  APPROVAL_LEVEL,
  WORKER_URL: WORKER_URL_RAW,
  GITHUB_TOKEN,
  GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME,
} = process.env;

const WORKER_URL = (WORKER_URL_RAW || "").replace(/\/+$/, "");
const APPROVAL = APPROVAL_LEVEL || "full"; // default

/**
 * Drive klasöründen belirli pattern'e uyan dosyaları sil
 */
async function driveDosyaSil(klasorId, pattern, drive) {
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

/**
 * Görsel 1-indexed slot (örn 1 = soru1, 2 = fact1, ...)
 */
function slotForQuestion(qIdx, type) {
  // qIdx 0-based
  // type: "question" → 2*qIdx+1, "fact" → 2*qIdx+2
  return type === "question" ? 2 * qIdx + 1 : 2 * qIdx + 2;
}

/**
 * Base64 data URL → Buffer
 */
function base64ToBuffer(dataUrl) {
  // "data:image/jpeg;base64,XXXX" formatından sadece XXXX al
  const match = String(dataUrl || "").match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;
  return { ext: match[1] === "jpeg" ? "jpg" : match[1], buffer: Buffer.from(match[2], "base64") };
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}, Approval: ${APPROVAL}`);
    
    if (!WORKER_URL) throw new Error("WORKER_URL eksik");
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN eksik");
    
    // 1. Worker'dan edits çek
    console.log("Worker'dan edits cekiliyor...");
    const editsRes = await fetch(`${WORKER_URL}/api/edits/${JOB_ID}`);
    if (!editsRes.ok) throw new Error(`Edits cekme hatasi: ${editsRes.status}`);
    const edits = await editsRes.json();
    
    // 2. Sheets job
    const job = await jobOku(JOB_ID);
    await jobGuncelle(JOB_ID, { onay_status: `applying:${APPROVAL}` });
    
    if (!job.drive_folder_id) throw new Error("drive_folder_id yok");
    
    // 3. questions.json'u Drive'dan oku
    console.log("questions.json Drive'dan okunuyor...");
    const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
    
    let questionsData = null;
    let questionsFileId = null;
    
    // 02-ses içinde ara
    const sesRes = await drive.files.list({
      q: `'${job.drive_folder_id}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    if (sesRes.data.files?.length) {
      const sesId = sesRes.data.files[0].id;
      const jr = await drive.files.list({
        q: `'${sesId}' in parents and name='questions.json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1,
      });
      if (jr.data.files?.length) {
        questionsFileId = jr.data.files[0].id;
        const r = await drive.files.get({ fileId: questionsFileId, alt: "media" }, { responseType: "text" });
        questionsData = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        console.log("questions.json 02-ses'ten okundu");
      }
    }
    
    // Ana klasörde ara
    if (!questionsData) {
      const ar = await drive.files.list({
        q: `'${job.drive_folder_id}' in parents and name='questions.json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1,
      });
      if (ar.data.files?.length) {
        questionsFileId = ar.data.files[0].id;
        const r = await drive.files.get({ fileId: questionsFileId, alt: "media" }, { responseType: "text" });
        questionsData = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        console.log("questions.json ana klasorden okundu");
      }
    }
    
    if (!questionsData) throw new Error("questions.json bulunamadi");
    
    // 4. 01-gorseller klasör id
    const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("01-gorseller klasoru yok");
    const gorselKlasorId = altKlasorler[0].id;
    
    // 5. Her edit için: text uygula, regen mark, custom image upload
    const regenQuestionImages = []; // FLUX ile üretilecek
    const regenFactImages = [];
    let customUploadedCount = 0;
    
    for (const [idxStr, edit] of Object.entries(edits)) {
      const idx = parseInt(idxStr);
      const q = questionsData.questions[idx];
      if (!q) continue;
      
      // Text güncelle
      if (typeof edit.question_text === "string") q.question_text = edit.question_text;
      if (Array.isArray(edit.options) && edit.options.length === 3) q.options = edit.options;
      if (typeof edit.correct_answer === "number") q.correct_answer = edit.correct_answer;
      if (typeof edit.fun_fact === "string") q.fun_fact = edit.fun_fact;
      if (typeof edit.show_image === "boolean") q.show_image = edit.show_image;
      if (typeof edit.image_prompt === "string") q.image_prompt = edit.image_prompt;
      if (typeof edit.fun_fact_image_prompt === "string") q.fun_fact_image_prompt = edit.fun_fact_image_prompt;
      
      // Audio text yeniden hesapla (cevap/şıklar değişmiş olabilir)
      const letters = ["A", "B", "C"];
      const correctLetter = letters[q.correct_answer];
      const correctOption = q.options[q.correct_answer];
      q.question_audio_text = `Question ${idx + 1}. ${q.question_text} Is it A: ${q.options[0]}, B: ${q.options[1]}, or C: ${q.options[2]}?`;
      q.answer_audio_text = `The correct answer is ${correctLetter}: ${correctOption}! ${q.fun_fact}`;
      
      // Custom image upload (öncelikli: FLUX'a gitmeden direkt upload)
      if (edit.custom_question_image) {
        const decoded = base64ToBuffer(edit.custom_question_image);
        if (decoded) {
          const slot = slotForQuestion(idx, "question");
          // Eski dosyayı sil
          const slotStr = String(slot).padStart(2, "0");
          await driveDosyaSil(gorselKlasorId, new RegExp(`^gorsel-${slotStr}-`), drive);
          // Yeni dosyayı yükle
          const filename = `gorsel-${slotStr}-${Date.now()}.${decoded.ext}`;
          const filepath = `/tmp/${filename}`;
          fs.writeFileSync(filepath, decoded.buffer);
          try {
            await driveDosyaYukle({ filename, filepath }, gorselKlasorId, `image/${decoded.ext === "jpg" ? "jpeg" : decoded.ext}`);
            customUploadedCount++;
            console.log(`Custom question image yuklendi: ${filename}`);
          } finally {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        }
      } else if (edit.regen_question_image) {
        // FLUX ile yeniden üret
        regenQuestionImages.push({ index: idx, prompt: q.image_prompt });
      }
      
      if (edit.custom_fact_image) {
        const decoded = base64ToBuffer(edit.custom_fact_image);
        if (decoded) {
          const slot = slotForQuestion(idx, "fact");
          const slotStr = String(slot).padStart(2, "0");
          await driveDosyaSil(gorselKlasorId, new RegExp(`^gorsel-${slotStr}-`), drive);
          const filename = `gorsel-${slotStr}-${Date.now()}.${decoded.ext}`;
          const filepath = `/tmp/${filename}`;
          fs.writeFileSync(filepath, decoded.buffer);
          try {
            await driveDosyaYukle({ filename, filepath }, gorselKlasorId, `image/${decoded.ext === "jpg" ? "jpeg" : decoded.ext}`);
            customUploadedCount++;
            console.log(`Custom fact image yuklendi: ${filename}`);
          } finally {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        }
      } else if (edit.regen_fact_image) {
        regenFactImages.push({ index: idx, prompt: q.fun_fact_image_prompt });
      }
    }
    
    // 6. questions.json'u Drive'a geri yaz
    await drive.files.update({
      fileId: questionsFileId,
      media: {
        mimeType: "application/json",
        body: Readable.from(JSON.stringify(questionsData, null, 2)),
      },
    });
    console.log(`questions.json guncellendi (${Object.keys(edits).length} edit, ${customUploadedCount} custom upload)`);
    
    // 7. FLUX regen
    let fluxRegenSayisi = 0;
    
    if (regenQuestionImages.length > 0) {
      console.log(`FLUX: ${regenQuestionImages.length} soru gorseli regen...`);
      for (const r of regenQuestionImages) {
        const slot = slotForQuestion(r.index, "question");
        const slotStr = String(slot).padStart(2, "0");
        await driveDosyaSil(gorselKlasorId, new RegExp(`^gorsel-${slotStr}-`), drive);
      }
      const prompts = regenQuestionImages.map(r => r.prompt);
      const res = await fluxRotationCagri(prompts, {
        width: 1280,
        height: 720,
        onSuccess: async (filteredIdx, buffer) => {
          const orijinal = regenQuestionImages[filteredIdx];
          const slot = slotForQuestion(orijinal.index, "question");
          const slotStr = String(slot).padStart(2, "0");
          const filename = `gorsel-${slotStr}-${Date.now()}.jpg`;
          const filepath = `/tmp/${filename}`;
          fs.writeFileSync(filepath, buffer);
          try {
            await driveDosyaYukle({ filename, filepath }, gorselKlasorId, "image/jpeg");
            fluxRegenSayisi++;
          } finally {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        },
      });
      console.log(`Soru regen: ${res.sonuclar.length}/${prompts.length}`);
    }
    
    if (regenFactImages.length > 0) {
      console.log(`FLUX: ${regenFactImages.length} fact gorseli regen...`);
      for (const r of regenFactImages) {
        const slot = slotForQuestion(r.index, "fact");
        const slotStr = String(slot).padStart(2, "0");
        await driveDosyaSil(gorselKlasorId, new RegExp(`^gorsel-${slotStr}-`), drive);
      }
      const prompts = regenFactImages.map(r => r.prompt);
      const res = await fluxRotationCagri(prompts, {
        width: 1280,
        height: 720,
        onSuccess: async (filteredIdx, buffer) => {
          const orijinal = regenFactImages[filteredIdx];
          const slot = slotForQuestion(orijinal.index, "fact");
          const slotStr = String(slot).padStart(2, "0");
          const filename = `gorsel-${slotStr}-${Date.now()}.jpg`;
          const filepath = `/tmp/${filename}`;
          fs.writeFileSync(filepath, buffer);
          try {
            await driveDosyaYukle({ filename, filepath }, gorselKlasorId, "image/jpeg");
            fluxRegenSayisi++;
          } finally {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        },
      });
      console.log(`Fact regen: ${res.sonuclar.length}/${prompts.length}`);
    }
    
    const editCount = Object.keys(edits).length;
    
    await jobGuncelle(JOB_ID, { onay_status: `completed:${APPROVAL}` });
    
    // 8. Approval level'a göre sonraki adım
    if (APPROVAL === "regen_only") {
      // Sadece görsel + text değişiklikleri uygulandı, yeni onay turuna git
      await telegram(
        job.chat_id,
        `Degisiklikler uygulandi\n\nJob: ${JOB_ID}\nEdit: ${editCount} soru\nCustom upload: ${customUploadedCount}\nFLUX regen: ${fluxRegenSayisi}\n\nYeni onay sayfasi hazirlaniyor...`
      );
      // 02.5'i tetikle (yeni link gönderecek)
      await tetikle("onay_tetikle", { job_id: JOB_ID, chat_id: job.chat_id });
      console.log("02.5-onay-tetikle yeniden cagrildi");
    } else if (APPROVAL === "render_only") {
      // TTS atla, doğrudan 07-video-montaj
      await telegram(
        job.chat_id,
        `Degisiklikler uygulandi\n\nJob: ${JOB_ID}\nEdit: ${editCount} soru\nCustom upload: ${customUploadedCount}\nFLUX regen: ${fluxRegenSayisi}\n\nVideo render basliyor (ses korunuyor)...`
      );
      await tetikle("video_montaj", { job_id: JOB_ID, chat_id: job.chat_id });
      console.log("07-video-montaj tetiklendi");
    } else {
      // full: 03-seslendirme (sonra 07 zaten otomatik tetikleniyor)
      await telegram(
        job.chat_id,
        `Degisiklikler uygulandi\n\nJob: ${JOB_ID}\nEdit: ${editCount} soru\nCustom upload: ${customUploadedCount}\nFLUX regen: ${fluxRegenSayisi}\n\nSes yeniden uretiliyor...`
      );
      await tetikle("seslendirme_uret", { job_id: JOB_ID, chat_id: job.chat_id });
      console.log("03-seslendirme tetiklendi");
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { onay_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `02.7-Degisiklik hatasi: ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

async function tetikle(eventType, payload) {
  const repoOwner = GITHUB_REPO_OWNER || "murturhan";
  const repoName = GITHUB_REPO_NAME || "bilgisok-otomasyon";
  const res = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "geniminitests-degisiklik-uygula",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${eventType} dispatch hatasi: ${res.status} ${txt.substring(0, 200)}`);
  }
}

main();
