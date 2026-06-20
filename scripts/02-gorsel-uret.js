// REV 004/20JUN26 - gorsel stili FLUX prompt'a uygula (per-slot, partialRegen)
/**
 * 02 - Görsel Üretimi (20 adet FLUX, 1280x720)
 * - job_state'ten promptları oku
 * - Cloudflare rotation ile üret
 * - Her başarılı görseli direkt Drive'a yükle (memory'de tutma)
 * - Sheets'e durum yaz
 * - Trigger: workflow_run (01 tamamlanınca)
 * 
 * Değişiklik: 0 görsel üretildiyse hata at (sessizce "completed:0/N" geçme)
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
import { GORSEL_STILLERI, DEFAULT_STIL } from "./lib/gorsel-stilleri.js";

const {
  JOB_ID,
  PARTIAL_REGEN,
  STAGE: STAGE_ENV,
} = process.env;

const IS_PARTIAL_REGEN = PARTIAL_REGEN === "true" || PARTIAL_REGEN === "1";

/**
 * Drive'daki klasörde mevcut "gorsel-NN-*" dosyalarını listele.
 * Filename örneği: "gorsel-02-1779415297810.jpg" → index 2
 * 
 * @returns {Set<number>} Mevcut görsel index'leri (1-indexed)
 */
async function mevcutGorselIndexleri(klasorId) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const mevcut = new Set();
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: `'${klasorId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files || []) {
      // "gorsel-02-..." gibi pattern
      const match = f.name.match(/^gorsel-(\d+)-/);
      if (match) {
        mevcut.add(parseInt(match[1], 10));
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return mevcut;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    // GECİCİ: Shorts format disabled
    if (JOB_ID && JOB_ID.endsWith("S")) throw new Error("Shorts şimdilik desteklenmiyor");
    const job = await jobOku(JOB_ID);

    if (!job.ai_gorsel_prompts || job.ai_gorsel_prompts.length === 0) {
      throw new Error("ai_gorsel_prompts boş!");
    }
    
    const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (altKlasorler.length === 0) {
      throw new Error("01-gorseller klasörü bulunamadı.");
    }
    const gorselKlasorId = altKlasorler[0].id;
    
    await jobGuncelle(JOB_ID, { gorsel_status: "running" });
    
    const toplam = job.ai_gorsel_prompts.length;
    
    // RESUME MODU: Drive'da mevcut görselleri tara
    console.log("📂 Drive'da mevcut görseller taranıyor (resume modu)...");
    const mevcutIndexler = await mevcutGorselIndexleri(gorselKlasorId);
    console.log(`   ${mevcutIndexler.size}/${toplam} görsel zaten mevcut`);

    // Video URL olan slotları tespit et (video varsa FLUX atla)
    const videoSlotlar = new Set();
    try {
      const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
      let qData = null;
      const sesRes = await drive.files.list({
        q: `'${job.drive_folder_id}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id)", pageSize: 1,
      });
      if (sesRes.data.files?.length) {
        const jr = await drive.files.list({
          q: `'${sesRes.data.files[0].id}' in parents and name='questions.json' and trashed=false`,
          fields: "files(id)", pageSize: 1,
        });
        if (jr.data.files?.length) {
          const r = await drive.files.get({ fileId: jr.data.files[0].id, alt: "media" }, { responseType: "text" });
          qData = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        }
      }
      if (!qData) {
        const ar = await drive.files.list({
          q: `'${job.drive_folder_id}' in parents and name='questions.json' and trashed=false`,
          fields: "files(id)", pageSize: 1,
        });
        if (ar.data.files?.length) {
          const r = await drive.files.get({ fileId: ar.data.files[0].id, alt: "media" }, { responseType: "text" });
          qData = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        }
      }
      if (qData?.questions) {
        qData.questions.forEach((q, i) => {
          const isWyr = q.question_type === "would_you_rather";
          if (isWyr ? q.visible_option?.video_url : q.question_video_url) videoSlotlar.add(2 * i + 1);
          if (isWyr ? q.surprise_option?.surprise_video_url : q.fun_fact_video_url) videoSlotlar.add(2 * i + 2);
        });
        if (videoSlotlar.size > 0) console.log(`   ${videoSlotlar.size} slot video ile dolu, FLUX atlanacak`);
      }
    } catch (e) {
      console.warn(`questions.json video kontrolü atlandı: ${e.message}`);
    }

    // Sadece eksik prompt'ları üret - orijinal index'i de tut
    const eksikPromptlar = [];
    const eksikOrijinalIndexler = [];
    for (let i = 0; i < job.ai_gorsel_prompts.length; i++) {
      const oneBased = i + 1;
      if (!mevcutIndexler.has(oneBased) && !videoSlotlar.has(oneBased)) {
        eksikPromptlar.push(job.ai_gorsel_prompts[i]);
        eksikOrijinalIndexler.push(i);
      }
    }
    
    let yeniUretilen = 0;
    
    if (eksikPromptlar.length === 0) {
      console.log("✅ Tüm görseller zaten mevcut, yeni üretim yok.");
    } else {
      console.log(`🎨 ${eksikPromptlar.length} eksik görsel üretilecek (index: ${eksikOrijinalIndexler.map(i => i+1).join(", ")})`);
      
      const { sonuclar, hatalar } = await fluxRotationCagri(eksikPromptlar, {
        width: 1920,
        height: 1080,
        onSuccess: async (filteredIndex, buffer) => {
          // filteredIndex = eksikPromptlar içindeki index → orijinal'e çevir
          const orijinalIndex = eksikOrijinalIndexler[filteredIndex];
          const filename = `gorsel-${String(orijinalIndex + 1).padStart(2, "0")}-${Date.now()}.jpg`;
          const filepath = `/tmp/${filename}`;
          fs.writeFileSync(filepath, buffer);
          
          try {
            await driveDosyaYukle({ filename, filepath }, gorselKlasorId, "image/jpeg");
            yeniUretilen++;
          } catch (e) {
            console.error(`Drive yükleme hatası (görsel ${orijinalIndex + 1}): ${e.message}`);
          } finally {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        },
      });
    }
    
    // Toplam başarılı = mevcut + yeni üretilen
    const toplamBasarili = mevcutIndexler.size + yeniUretilen;
    
    // SIFIR görsel = hata
    if (toplamBasarili === 0) {
      throw new Error(
        `0/${toplam} görsel üretildi. Tüm Cloudflare hesaplarının kotası dolmuş olabilir, UTC 00:00'ı bekleyin.`
      );
    }
    
    const status = toplamBasarili === toplam ? "completed" : "partial";
    await jobGuncelle(JOB_ID, {
      gorsel_status: `${status}:${toplamBasarili}/${toplam}`,
    });
    
    console.log(`✅ ${toplamBasarili}/${toplam} görsel hazır (${yeniUretilen} yeni üretildi).`);
    
    if (status === "partial") {
      const eksikIndexler = [];
      for (let i = 1; i <= toplam; i++) {
        if (!mevcutIndexler.has(i) && !eksikOrijinalIndexler.includes(i - 1)) continue;
        // Hâlâ eksik mi kontrol et - yeniden listele
      }
      await telegram(job.chat_id, `⚠️ *Görseller eksik:* ${toplamBasarili}/${toplam}. 02-gorsel-uret'i tekrar tetikle (resume modu eksikleri üretir).`);
    } else {
      await telegram(job.chat_id, `🖼 *Görseller hazır:* ${toplamBasarili}/${toplam}\n\n⏳ Onay sayfası hazırlanıyor...`);
      
      // 02.5-onay-tetikle workflow'unu çalıştır (GitHub Action repository_dispatch)
      try {
        const repoOwner = process.env.GITHUB_REPO_OWNER || "murturhan";
        const repoName = process.env.GITHUB_REPO_NAME || "bilgisok-otomasyon";
        const token = process.env.WORKFLOW_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
        
        if (token) {
          const dispatchRes = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`,
            {
              method: "POST",
              headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "geniminitests-gorsel-uret",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                event_type: "onay_tetikle",
                client_payload: {
                  job_id: JOB_ID,
                  chat_id: job.chat_id,
                },
              }),
            }
          );
          if (dispatchRes.ok) {
            console.log("✅ 02.5-onay-tetikle dispatch edildi");
          } else {
            const txt = await dispatchRes.text();
            console.warn(`⚠ 02.5 dispatch hatası: ${dispatchRes.status} ${txt.substring(0, 200)}`);
          }
        } else {
          console.warn("⚠ WORKFLOW_DISPATCH_TOKEN yok, 02.5 manuel tetiklenmeli");
        }
      } catch (e) {
        console.warn(`⚠ 02.5 dispatch hatası (devam): ${e.message}`);
      }
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { gorsel_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *02-Görsel hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

// ─── PARTIAL REGEN: stage=1 editlerinden sadece flux_isaretli slotları üret ────

async function questionsJsonOkuFromDrive(driveFolderId) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  // 02-ses klasöründe ara
  const sesRes = await drive.files.list({
    q: `'${driveFolderId}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)", pageSize: 1,
  });
  if (sesRes.data.files?.length) {
    const jr = await drive.files.list({
      q: `'${sesRes.data.files[0].id}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id, name)", pageSize: 1,
    });
    if (jr.data.files?.length) {
      const r = await drive.files.get({ fileId: jr.data.files[0].id, alt: "media" }, { responseType: "text" });
      return { data: typeof r.data === "string" ? JSON.parse(r.data) : r.data, fileId: jr.data.files[0].id };
    }
  }
  // Ana klasörde ara (fallback)
  const ar = await drive.files.list({
    q: `'${driveFolderId}' in parents and name='questions.json' and trashed=false`,
    fields: "files(id, name)", pageSize: 1,
  });
  if (ar.data.files?.length) {
    const r = await drive.files.get({ fileId: ar.data.files[0].id, alt: "media" }, { responseType: "text" });
    return { data: typeof r.data === "string" ? JSON.parse(r.data) : r.data, fileId: ar.data.files[0].id };
  }
  throw new Error("questions.json Drive'da bulunamadı");
}

async function questionsJsonKaydet(fileId, qData) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const content = JSON.stringify(qData, null, 2);
  // Drive'a yaz - SA drive scope ile (read-only SA, write için OAuth ile deneme)
  // Burada tmpFile yolu: fs.writeFile + driveDosyaYukle pattern kullanılamaz (aynı fileId güncelleme gerekir)
  // google.js drive.files.update ile güncelle
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/json",
      body: content,
    },
  });
  console.log(`✓ questions.json güncellendi (fileId: ${fileId})`);
}

async function dispatch02_5(job) {
  try {
    const repoOwner = process.env.GITHUB_REPO_OWNER || "murturhan";
    const repoName = process.env.GITHUB_REPO_NAME || "bilgisok-otomasyon";
    const token = process.env.WORKFLOW_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) { console.warn("⚠ WORKFLOW_DISPATCH_TOKEN yok, 02.5 manuel tetiklenmeli"); return; }
    const r = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "geniminitests-gorsel-uret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_type: "onay_tetikle", client_payload: { job_id: JOB_ID, chat_id: job.chat_id } }),
      }
    );
    if (r.ok) { console.log("✅ 02.5-onay-tetikle dispatch edildi"); }
    else { const t = await r.text(); console.warn(`⚠ 02.5 dispatch hatası: ${r.status} ${t.substring(0,200)}`); }
  } catch (e) { console.warn(`⚠ 02.5 dispatch hatası: ${e.message}`); }
}

async function partialRegenMain() {
  console.log(`Job: ${JOB_ID} [PARTIAL_REGEN mode, stage=${STAGE_ENV || "2"}]`);
  const job = await jobOku(JOB_ID);
  if (!job.drive_folder_id) throw new Error("drive_folder_id yok");

  const { data: qData, fileId: qFileId } = await questionsJsonOkuFromDrive(job.drive_folder_id);
  const questions = qData.questions || [];
  console.log(`questions.json okundu: ${questions.length} soru`);

  // 01-gorseller klasörünü bul
  const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
  if (!altKlasorler.length) throw new Error("01-gorseller klasörü bulunamadı");
  const gorselKlasorId = altKlasorler[0].id;

  await jobGuncelle(JOB_ID, { gorsel_status: "running_partial" });

  // FLUX üretilecek slotları belirle
  const fluxSlots = [];
  questions.forEach((q, i) => {
    const isWyr = q.question_type === "would_you_rather";
    if (isWyr) {
      if (q.flux_visible_image !== false && !q.uploaded_visible_url) {
        const basePrompt = q.visible_option?.image_prompt;
        if (basePrompt) {
          const stili = q.visible_option?.image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "visible", prompt: basePrompt + suffix, gorselNum: 2 * i + 1 });
        }
      }
      if (q.flux_surprise_image !== false && !q.uploaded_surprise_url) {
        const basePrompt = q.surprise_option?.surprise_image_prompt;
        if (basePrompt) {
          const stili = q.surprise_option?.surprise_image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "surprise", prompt: basePrompt + suffix, gorselNum: 2 * i + 2 });
        }
      }
    } else {
      if (q.flux_image !== false && !q.uploaded_image_url) {
        if (q.image_prompt) {
          const stili = q.question_image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "question", prompt: q.image_prompt + suffix, gorselNum: 2 * i + 1 });
        }
      }
      if (q.flux_fact_image !== false && !q.uploaded_fact_image_url) {
        if (q.fun_fact_image_prompt) {
          const stili = q.fact_image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "fact", prompt: q.fun_fact_image_prompt + suffix, gorselNum: 2 * i + 2 });
        }
      }
    }
  });

  let uretilen = 0;
  if (fluxSlots.length === 0) {
    console.log("✅ FLUX üretilecek slot yok (tümü yüklü veya işaretsiz).");
  } else {
    console.log(`🎨 ${fluxSlots.length} slot FLUX üretilecek: ${fluxSlots.map(s => `gorsel-${String(s.gorselNum).padStart(2,"0")} (${s.slotType})`).join(", ")}`);
    const prompts = fluxSlots.map(s => s.prompt);
    await fluxRotationCagri(prompts, {
      width: 1280, height: 720,
      onSuccess: async (filteredIdx, buffer) => {
        const slot = fluxSlots[filteredIdx];
        const filename = `gorsel-${String(slot.gorselNum).padStart(2, "0")}-${Date.now()}.jpg`;
        const filepath = `/tmp/${filename}`;
        fs.writeFileSync(filepath, buffer);
        try {
          const result = await driveDosyaYukle({ filename, filepath }, gorselKlasorId, "image/jpeg");
          const driveUrl = `https://drive.google.com/thumbnail?id=${result.drive_id}&sz=w800`;
          // questions.json'daki ilgili alana URL yaz
          const q = questions[slot.questionIdx];
          if (slot.slotType === "question") q.question_image_url = driveUrl;
          else if (slot.slotType === "fact") q.fun_fact_image_url = driveUrl;
          else if (slot.slotType === "visible") { q.visible_option = q.visible_option || {}; q.visible_option.image_url = driveUrl; }
          else if (slot.slotType === "surprise") { q.surprise_option = q.surprise_option || {}; q.surprise_option.surprise_image_url = driveUrl; }
          uretilen++;
        } catch (e) {
          console.error(`Drive yükleme hatası (gorsel-${slot.gorselNum}): ${e.message}`);
        } finally {
          try { fs.unlinkSync(filepath); } catch (e) {}
        }
      },
    });
  }

  // questions.json'ı güncellenmiş haliyle Drive'a kaydet
  try {
    qData.questions = questions;
    await questionsJsonKaydet(qFileId, qData);
  } catch (e) {
    console.warn(`⚠ questions.json Drive güncelleme hatası (devam): ${e.message}`);
  }

  const toplamYuklu = fluxSlots.length === 0
    ? questions.length * 2 // tümü yüklü sayılır
    : uretilen + (questions.length * 2 - fluxSlots.length); // üretilen + zaten yüklü
  const status = uretilen === fluxSlots.length ? "completed" : "partial";
  await jobGuncelle(JOB_ID, { gorsel_status: `${status}:partial_regen` });
  console.log(`✅ Partial regen tamamlandı: ${uretilen}/${fluxSlots.length} FLUX üretildi.`);

  await telegram(job.chat_id, `🖼 *Görseller hazır* (aşama 1 seçimi)\n\n⏳ Onay sayfası hazırlanıyor...`);
  await dispatch02_5(job);

  process.exit(0);
}

// Entry point: partial veya tam mod
if (IS_PARTIAL_REGEN) {
  partialRegenMain().catch(async (error) => {
    console.error("HATA (partial):", error.message);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { gorsel_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *02-Görsel partial hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  });
} else {
  main();
}
