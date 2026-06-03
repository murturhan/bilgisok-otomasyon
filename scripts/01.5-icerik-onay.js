// REV 002/04JUN26 - Worker'a job data POST et + stage=1 onay linki gönder (Parça 2)

import { google } from "googleapis";
import { jobOku, jobGuncelle, getServiceAccountAuth } from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const {
  JOB_ID,
  VIDEO_FORMAT,
  TARIH,
  CHAT_ID,
  WORKER_URL: WORKER_URL_RAW,
  GITHUB_TOKEN,
} = process.env;

const FORMAT = VIDEO_FORMAT || "long";
const WORKER_URL = (WORKER_URL_RAW || "").replace(/\/+$/, "");

async function questionsJsonOku(driveFolderId) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });

  // 02-ses klasörünü bul
  const sesRes = await drive.files.list({
    q: `'${driveFolderId}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
  });
  if (!sesRes.data.files?.length) throw new Error("02-ses klasörü bulunamadı");
  const sesFolderId = sesRes.data.files[0].id;

  const jsonRes = await drive.files.list({
    q: `'${sesFolderId}' in parents and name='questions.json' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
  });
  if (!jsonRes.data.files?.length) throw new Error("questions.json 02-ses'te bulunamadı");
  const fileId = jsonRes.data.files[0].id;

  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  console.log(`✓ questions.json okundu: ${data.questions?.length || 0} soru`);
  return data;
}

async function main() {
  if (!JOB_ID) throw new Error("JOB_ID env değişkeni zorunlu");
  if (!CHAT_ID) throw new Error("CHAT_ID env değişkeni zorunlu");

  console.log(`01.5-icerik-onay: JOB_ID=${JOB_ID}, FORMAT=${FORMAT}`);

  if (!WORKER_URL) {
    console.warn("⚠ WORKER_URL eksik — Worker'a POST edilemeyecek, sadece Telegram gönderilecek");
  }

  // Job bilgilerini Sheets'ten oku
  const job = await jobOku(JOB_ID);
  const driveFolderId = job.drive_folder_id;
  if (!driveFolderId) throw new Error("Job'da drive_folder_id yok");

  // questions.json Drive'dan oku
  const questionsData = await questionsJsonOku(driveFolderId);

  // Worker'a job data POST et (stage=1 için onay sayfasını besleyecek)
  if (WORKER_URL && GITHUB_TOKEN) {
    const payload = {
      job_id: JOB_ID,
      stage: 1,
      chat_id: job.chat_id || CHAT_ID,
      baslik: questionsData.baslik || job.baslik || "",
      format: FORMAT,
      konu: questionsData.konu || job.konu || "",
      topic_emojis: questionsData.topic_emojis || [],
      drive_folder_id: driveFolderId,
      questions: questionsData.questions || [],
      created_at: new Date().toISOString(),
    };

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
      const txt = await workerRes.text();
      console.warn(`⚠ Worker POST hatası ${workerRes.status}: ${txt.substring(0, 200)}`);
    } else {
      console.log("✓ Worker'a job kaydedildi");
    }
  } else {
    console.warn("⚠ WORKER_URL veya GITHUB_TOKEN eksik, Worker'a POST atlandı");
  }

  // Job durumunu güncelle
  await jobGuncelle(JOB_ID, { gorsel_status: "icerik_onay_bekleniyor" });
  console.log("✓ Job durumu güncellendi: icerik_onay_bekleniyor");

  // Onay sayfası URL
  const onayUrl = `${WORKER_URL || "https://telegram-to-github.murturhan.workers.dev"}/?job=${JOB_ID}&stage=1`;

  const chatId = job.chat_id || CHAT_ID;
  await telegram(
    chatId,
    `📝 *İçerik hazır! Aşama 1 onayı bekleniyor.*\n\n` +
    `📌 ${questionsData.baslik || job.baslik || JOB_ID}\n` +
    `📺 ${FORMAT} · ${questionsData.questions?.length || 0} soru\n` +
    `🆔 \`${JOB_ID}\`\n\n` +
    `👉 [İçerik Onay Sayfası](${onayUrl})\n\n` +
    `_İçeriği gözden geçirip görsel üretimini başlatabilir veya atlayabilirsin._`
  );

  console.log(`✓ İçerik onay link gönderildi: ${onayUrl}`);
}

main().catch((err) => {
  console.error("HATA:", err.message);
  console.error(err.stack);
  process.exit(1);
});
