/**
 * 02.5-onay-tetikle.js
 * 
 * 01-icerik-uret + 02-gorsel-uret tamamlandıktan sonra çalışır.
 * 
 * Görevi:
 * 1. questions.json + image_urls'ları Drive'dan toplar
 * 2. Bunları Cloudflare Worker'a POST eder (KV'ye yazılır)
 * 3. Telegram'a onay sayfası linkini gönderir
 * 
 * Kullanıcı linke tıklayıp formu doldurur → Worker /api/submit/:id'yi tetikler
 * → 02.7-degisiklik-uygula workflow'u çalışır → 03-seslendirme'ye geçer
 */

import { google } from "googleapis";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  getServiceAccountAuth,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const {
  JOB_ID,
  WORKER_URL,           // https://telegram-to-github.MURTURHAN.workers.dev
  GITHUB_TOKEN,
  CLOUDFLARE_PAGES_URL, // https://genimini-onay.pages.dev
} = process.env;

/**
 * Drive klasöründeki tüm görselleri listele, public link üret.
 * Filename pattern: "gorsel-NN-..." veya "fun-fact-NN-..." gibi.
 */
async function driveGorselUrlleri(klasorId, pattern) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const sonuc = {};
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: `'${klasorId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files || []) {
      const match = f.name.match(pattern);
      if (match) {
        const idx = parseInt(match[1], 10);
        // Drive direct thumbnail URL (public okuma için)
        sonuc[idx] = `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`;
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return sonuc;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!WORKER_URL) throw new Error("WORKER_URL eksik (Cloudflare Worker URL)");
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN eksik (Worker auth için)");
    
    // 02 tamamlandı mı?
    const gorselStatus = String(job.gorsel_status || "");
    if (!gorselStatus.startsWith("completed") && !gorselStatus.startsWith("partial")) {
      throw new Error(`02 tamamlanmamış (gorsel_status: ${gorselStatus})`);
    }
    
    if (!job.drive_folder_id) throw new Error("drive_folder_id yok");
    
    // questions.json'u Drive'dan oku (02-ses klasöründe, yoksa ana klasörde)
    console.log("📂 questions.json Drive'dan okunuyor...");
    const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
    
    let questionsData = null;
    
    // 1. 02-ses içinde ara
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
        const fileId = jsonSearchRes.data.files[0].id;
        const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
        questionsData = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        console.log("✓ questions.json '02-ses' klasöründen okundu");
      }
    }
    
    // 2. Ana klasörde ara (backward compat)
    if (!questionsData) {
      const anaSearchRes = await drive.files.list({
        q: `'${job.drive_folder_id}' in parents and name='questions.json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1,
      });
      if (anaSearchRes.data.files && anaSearchRes.data.files.length > 0) {
        const fileId = anaSearchRes.data.files[0].id;
        const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
        questionsData = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        console.log("✓ questions.json ana klasörden okundu");
      }
    }
    
    if (!questionsData) {
      throw new Error("questions.json Drive'da bulunamadı (02-ses veya ana klasörde aranır)");
    }
    
    if (!questionsData.questions || !Array.isArray(questionsData.questions)) {
      throw new Error("questions array yok");
    }
    
    // Drive: 01-gorseller klasöründen URL'leri al
    const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (altKlasorler.length === 0) {
      throw new Error("01-gorseller klasörü bulunamadı");
    }
    const gorselKlasorId = altKlasorler[0].id;
    
    // Görsel URL'leri (soru + fun fact ayrı)
    const sorularUrl = await driveGorselUrlleri(gorselKlasorId, /^gorsel-(\d+)-/);
    const factUrl = await driveGorselUrlleri(gorselKlasorId, /^fun-fact-(\d+)-/);
    
    // Worker'a gönderilecek payload
    const payload = {
      job_id: JOB_ID,
      chat_id: job.chat_id,
      drive_folder_id: job.drive_folder_id,
      gorsel_klasor_id: gorselKlasorId,
      topic: questionsData.topic || job.konu,
      format: job.video_format || questionsData.format,
      baslik: questionsData.baslik,
      questions: questionsData.questions.map((q, i) => ({
        index: i,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        option_flags: q.option_flags || ["", "", ""],
        difficulty: q.difficulty,
        fun_fact: q.fun_fact,
        show_image: q.show_image !== false, // default true
        image_prompt: q.image_prompt,
        fun_fact_image_prompt: q.fun_fact_image_prompt,
        question_image_url: sorularUrl[i + 1] || null,
        fun_fact_image_url: factUrl[i + 1] || null,
      })),
      created_at: new Date().toISOString(),
    };
    
    // Worker'a POST
    console.log(`📤 Worker'a job verisi POST ediliyor: ${WORKER_URL}/api/job/${JOB_ID}`);
    const workerRes = await fetch(`${WORKER_URL}/api/job/${JOB_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    
    if (!workerRes.ok) {
      const errorText = await workerRes.text();
      throw new Error(`Worker POST hatası ${workerRes.status}: ${errorText}`);
    }
    
    // Onay sayfası URL'i - artık Worker üzerinde servis ediliyor (Pages'a gerek yok)
    const onayUrl = `${WORKER_URL}/?job=${JOB_ID}`;
    
    await jobGuncelle(JOB_ID, {
      onay_status: "waiting",
      onay_url: onayUrl,
    });
    
    console.log(`✅ Onay sayfası hazır: ${onayUrl}`);
    
    // Telegram'a link gönder
    await telegram(
      job.chat_id,
      `📋 *Onay sayfası hazır*\n\n🆔 Job: \`${JOB_ID}\`\n📝 ${payload.questions.length} soru\n\n👉 [Onay sayfasını aç](${onayUrl})\n\nİncele, düzenle, gönder.`
    );
    
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { onay_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *02.5-Onay hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
