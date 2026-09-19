// REV 013/19SEP26 - hata bildirimi: Telegram ILK + duz metin, sessiz yutma kaldirildi
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
import { telegram, telegramHata } from "./lib/telegram.js";

const {
  JOB_ID,
  GDRIVE_FOLDER_ID,
  GDRIVE_SURPRISE_BOX_FOLDER_ID,
  WORKER_URL: WORKER_URL_RAW,
  GITHUB_TOKEN,
  CLOUDFLARE_PAGES_URL,
} = process.env;

// Trailing slash'i temizle (çift slash olmaması için)
const WORKER_URL = (WORKER_URL_RAW || "").replace(/\/+$/, "");

/**
 * Drive klasöründeki tüm görselleri listele, public link üret.
 * Filename pattern: "gorsel-NN.jpg" (yeni standart) veya "gorsel-NN-<ts>.jpg" (legacy).
 */
async function driveGorselUrlleri(klasorId, pattern) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const sonuc = {};
  let pageToken = undefined;
  const dosyalar = [];
  
  // Önce tüm dosyaları topla
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
        dosyalar.push({ id: f.id, name: f.name, idx: parseInt(match[1], 10) });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  
  // Her dosyayı public yap (anyone with link can view)
  // Hata olursa atla (zaten public ise sorun değil)
  for (const f of dosyalar) {
    try {
      await drive.permissions.create({
        fileId: f.id,
        requestBody: { role: "reader", type: "anyone" },
        fields: "id",
      });
    } catch (e) {
      // Zaten public ise hata atar, görmezden gel
      if (!String(e.message || "").includes("already exists")) {
        console.warn(`  ⚠ Permission hata (${f.name}): ${e.message}`);
      }
    }
    sonuc[f.idx] = `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`;
  }
  
  return sonuc;
}

/**
 * 02-ses klasöründeki mp3'leri public yapıp URL'lerini döndür + audio-segments.json'u oku.
 * Son onay formundaki DİNLE butonu ve metin kutuları bunlardan besleniyor.
 * @returns {Promise<{urls: Object, segments: Array}>} urls: key -> mp3 url
 */
async function sesSegmentBilgisi(sesFolderId) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const sonuc = { urls: {}, segments: [] };
  if (!sesFolderId) return sonuc;

  // audio-segments.json → key/filename/duration/text
  try {
    const mRes = await drive.files.list({
      q: `'${sesFolderId}' in parents and name='audio-segments.json' and trashed=false`,
      fields: "files(id)", pageSize: 1,
    });
    if (mRes.data.files?.length) {
      const r = await drive.files.get({ fileId: mRes.data.files[0].id, alt: "media" }, { responseType: "text" });
      const manifest = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      sonuc.segments = Array.isArray(manifest?.segments) ? manifest.segments : [];
    }
  } catch (e) {
    console.warn(`  ⚠ audio-segments.json okunamadı: ${e.message}`);
  }

  // mp3'leri listele + public yap (DİNLE butonu tarayıcıdan çalacak)
  const dosyalar = [];
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: `'${sesFolderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, createdTime)",
      pageSize: 1000, orderBy: "createdTime", pageToken,
    });
    for (const f of res.data.files || []) {
      if (/\.mp3$/i.test(f.name)) dosyalar.push(f); // aynı adlı varsa sonraki (yeni) kazanır
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  const adToId = new Map();
  for (const f of dosyalar) adToId.set(f.name, f.id);

  for (const [ad, id] of adToId) {
    try {
      await drive.permissions.create({ fileId: id, requestBody: { role: "reader", type: "anyone" }, fields: "id" });
    } catch (e) {
      if (!String(e.message || "").includes("already exists")) {
        console.warn(`  ⚠ mp3 permission hata (${ad}): ${e.message}`);
      }
    }
    // Segment key'i manifest'ten bul; yoksa dosya adından türet
    const seg = sonuc.segments.find(s => s.filename === ad);
    const key = seg?.key || ad.replace(/\.mp3$/i, "");
    sonuc.urls[key] = `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return sonuc;
}

async function getSurpriseBoxUrls() {
  if (!GDRIVE_SURPRISE_BOX_FOLDER_ID) return [];
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const filesRes = await drive.files.list({
    q: `'${GDRIVE_SURPRISE_BOX_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
    pageSize: 100,
  });
  const files = (filesRes.data.files || []).filter(f => /\.png$/i.test(f.name));
  const urls = [];
  for (const f of files) {
    try {
      await drive.permissions.create({
        fileId: f.id,
        requestBody: { role: "reader", type: "anyone" },
        fields: "id",
      });
    } catch (e) {
      if (!String(e.message || "").includes("already exists")) {
        console.warn(`  ⚠ Permission hata (${f.name}): ${e.message}`);
      }
    }
    urls.push(`https://drive.google.com/thumbnail?id=${f.id}&sz=w800`);
  }
  return urls;
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
    let sesFolderId = null;   // ses segmentleri/mp3 URL'leri icin disarida da lazim
    
    // 1. 02-ses içinde ara
    const sesSearchRes = await drive.files.list({
      q: `'${job.drive_folder_id}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    if (sesSearchRes.data.files && sesSearchRes.data.files.length > 0) {
      sesFolderId = sesSearchRes.data.files[0].id;
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
    
    // Tek pattern: tüm görseller "gorsel-NN" formatında
    // Yeni standart: "gorsel-01.jpg" (timestamp yok). Legacy "gorsel-01-<ts>.jpg" da kabul edilir.
    // Sıralama: 1=soru1, 2=fact1, 3=soru2, 4=fact2, ...
    const tumGorseller = await driveGorselUrlleri(gorselKlasorId, /^gorsel-(\d+)[-.]/);
    const doluSlot = Object.keys(tumGorseller).length;
    const beklenenSlot = questionsData.questions.length * 2;
    console.log(`🖼 Drive eşleşmesi: ${doluSlot}/${beklenenSlot} slot dolu`);
    const kSay = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
    console.log(
      `📝 Video metinleri payload'a ekleniyor: ` +
      `ekran_basligi=${JSON.stringify(String(questionsData.ekran_basligi || "").substring(0, 40))} ` +
      `intro=${kSay(questionsData.intro_audio_text)}k ` +
      `konu_duyuru=${kSay(questionsData.konu_duyuru_audio_text)}k ` +
      `outro=${kSay(questionsData.outro_audio_text)}k`
    );
    if (doluSlot === 0) {
      console.error(`⛔ 01-gorseller klasöründe hiç "gorsel-NN" dosyası yok (klasör: ${gorselKlasorId}).`);
      console.error(`   Onay sayfasındaki TÜM görsel slotları "Görsel yok" görünecek — 02-gorsel-uret loglarını kontrol et.`);
      try {
        await telegram(job.chat_id, `⚠️ *Onay sayfasında görsel yok:* Drive 01-gorseller klasöründe hiç "gorsel-NN" dosyası bulunamadı.\n02-gorsel-uret loglarına bak.`);
      } catch (e) {}
    }

    // SON ONAY FORMU (stage=3): ses segmentlerinin mp3 URL'leri + metin/süre bilgisi
    let sesBilgi = { urls: {}, segments: [] };
    try {
      sesBilgi = await sesSegmentBilgisi(sesFolderId);
      console.log(`🔊 Ses segmentleri: ${sesBilgi.segments.length} kayıt, ${Object.keys(sesBilgi.urls).length} mp3 public yapıldı`);
    } catch (e) {
      console.warn(`⚠ Ses segment bilgisi alınamadı (devam): ${e.message}`);
    }

    // Sürpriz kutu URL'leri (WYR sorular için)
    const isAnyWyr = questionsData.questions.some(q => q.question_type === "would_you_rather");
    let surpriseBoxUrls = [];
    if (isAnyWyr) {
      try {
        surpriseBoxUrls = await getSurpriseBoxUrls();
        console.log(`  ✓ Sürpriz kutu: ${surpriseBoxUrls.length} görsel`);
      } catch (e) {
        console.warn(`  ⚠ Sürpriz kutu alınamadı: ${e.message}`);
      }
    }

    // Worker'a gönderilecek payload
    const payload = {
      job_id: JOB_ID,
      chat_id: job.chat_id,
      drive_folder_id: job.drive_folder_id,
      gorsel_klasor_id: gorselKlasorId,
      topic: questionsData.topic || job.konu,
      format: job.video_format || questionsData.format,
      baslik: questionsData.baslik,
      // VİDEO METİNLERİ — onay sayfasındaki 4 alan bunlardan doluyor.
      // Bunlar payload'a KONMAZSA worker'da job.* undefined olur ve alanlar
      // BOŞ render edilir (kullanıcı mevcut metni göremez).
      ekran_basligi: String(questionsData.ekran_basligi || questionsData.intro_title || "").replace(/[*]{2}/g, "").trim(),
      intro_audio_text: String(questionsData.intro_audio_text || "").trim(),
      konu_duyuru_audio_text: String(questionsData.konu_duyuru_audio_text || "").trim(),
      outro_audio_text: String(questionsData.outro_audio_text || "").trim(),
      topic_emojis: questionsData.topic_emojis || [],
      // SON ONAY FORMU (stage=3) icin: her segmentin mp3 URL'i + metni + suresi
      ses_urls: sesBilgi.urls,
      // SADECE key+duration — text/filename/type gonderilmiyor; metinler zaten
      // questions.json alanlarindan geliyor. Issue govdesi 65KB limitine dayaniyor.
      ses_segments: (sesBilgi.segments || []).map(x => ({ key: x.key, duration: x.duration })),
      questions: questionsData.questions.map((q, i) => {
        // Soru i (0-indexed) için:
        // Question/visible image = gorsel-(2i+1) (1-indexed)
        // Fact/surprise image    = gorsel-(2i+2) (1-indexed)
        const questionImageIdx = 2 * i + 1;
        const factImageIdx = 2 * i + 2;
        const isWyr = q.question_type === "would_you_rather";
        if (isWyr) {
          const randBoxUrl = surpriseBoxUrls.length > 0
            ? surpriseBoxUrls[Math.floor(Math.random() * surpriseBoxUrls.length)]
            : null;
          return {
            index: i,
            question_type: "would_you_rather",
            question_text: q.question_text || "Pick One!",
            visible_option: {
              ...(q.visible_option || {}),
              image_url: tumGorseller[questionImageIdx] || null,
            },
            surprise_option: {
              ...(q.surprise_option || {}),
              surprise_image_url: tumGorseller[factImageIdx] || null,
            },
            surprise_box_image_url: randBoxUrl,
            surprise_box_urls: surpriseBoxUrls,
            jess_reaction: q.jess_reaction || "",
            // Son onay formu (stage=3) ses metin kutularini bunlardan doldurur
            question_audio_text: q.question_audio_text || "",
            reveal_audio_text: q.reveal_audio_text || "",
          };
        }
        return {
          index: i,
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer,
          option_flags: q.option_flags || ["", "", ""],
          option_emojis: q.option_emojis || [],
          difficulty: q.difficulty,
          fun_fact: q.fun_fact,
          show_image: q.show_image !== false, // default true
          image_prompt: q.image_prompt,
          fun_fact_image_prompt: q.fun_fact_image_prompt,
          question_image_url: tumGorseller[questionImageIdx] || null,
          fun_fact_image_url: tumGorseller[factImageIdx] || null,
          question_image_stili: q.question_image_stili || "pixar_3d",
          fact_image_stili: q.fact_image_stili || "pixar_3d",
          // Son onay formu (stage=3) ses metin kutularini bunlardan doldurur
          question_audio_text: q.question_audio_text || "",
          answer_audio_text: q.answer_audio_text || "",
        };
      }),
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

    // Video render tamamlanmışsa (07'den tetiklendi), telegram atma — 07 zaten "Video hazır + onay" gönderdi
    // İlk onay (henüz render yok) ise gönder
    if (!String(job.video_status || "").startsWith("completed:")) {
      await telegram(
        job.chat_id,
        `📋 *Onay sayfası hazır*\n\n🆔 Job: \`${JOB_ID}\`\n📝 ${payload.questions.length} soru\n\n👉 [Onay sayfasını aç](${onayUrl})\n\nİncele, düzenle, gönder.`
      );
    } else {
      console.log("ℹ️ Video zaten hazır, telegram atlandı");
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    // HATA BILDIRIMI: Telegram ILK sirada ve DUZ METIN (hata metinleri `_ * [`
    // icerdigi icin Markdown 400 doner). Her adim AYRI try — biri patlarsa
    // digeri yine calisir. Eskiden tek try + `catch (e) {}` vardi ve
    // jobOku/jobGuncelle patlayinca bildirim HIC gitmiyordu.
    let chatId = process.env.TELEGRAM_CHAT_ID || "";
    try {
      const job = await jobOku(JOB_ID);
      if (job?.chat_id) chatId = job.chat_id;
    } catch (e) {
      console.error(`jobOku basarisiz (chat_id icin env yedegi): ${e.message}`);
    }
    const gonderildi = await telegramHata(chatId, `02.5-Onay hatasi (job ${JOB_ID})`, `${error.message}\n\n${String(error.stack || "").split("\n").slice(1, 4).join("\n")}`);
    if (!gonderildi) console.error("Hata bildirimi Telegram'a ULASTIRILAMADI — tek kayit yukaridaki log.");
    try {
      await jobGuncelle(JOB_ID, { onay_status: `error: ${error.message.substring(0, 100)}` });
    } catch (e) {
      console.error(`onay_status yazilamadi: ${e.message}`);
    }
    process.exit(1);
  }
}

main();
