// REV 001/02JUN26 - video_url olan slotları FLUX'tan atla
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

const { JOB_ID } = process.env;

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
        width: 1280,
        height: 720,
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

main();
