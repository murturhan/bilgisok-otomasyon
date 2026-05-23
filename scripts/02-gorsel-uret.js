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
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
} from "./lib/google.js";
import { fluxRotationCagri } from "./lib/cloudflare.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID } = process.env;

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.ai_gorsel_prompts || job.ai_gorsel_prompts.length === 0) {
      throw new Error("ai_gorsel_prompts boş!");
    }
    
    // Drive: 01-gorseller alt klasörünü bul
    const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (altKlasorler.length === 0) {
      throw new Error("01-gorseller klasörü bulunamadı.");
    }
    const gorselKlasorId = altKlasorler[0].id;
    
    await jobGuncelle(JOB_ID, { gorsel_status: "running" });
    
    let basariliSayisi = 0;
    const toplam = job.ai_gorsel_prompts.length;
    
    // FLUX rotation ile üret + her görseli anında yükle
    const { sonuclar, hatalar } = await fluxRotationCagri(job.ai_gorsel_prompts, {
      width: 1280,
      height: 720,
      onSuccess: async (index, buffer) => {
        const filename = `gorsel-${String(index + 1).padStart(2, "0")}-${Date.now()}.jpg`;
        const filepath = `/tmp/${filename}`;
        fs.writeFileSync(filepath, buffer);
        
        try {
          await driveDosyaYukle({ filename, filepath }, gorselKlasorId, "image/jpeg");
          basariliSayisi++;
        } catch (e) {
          console.error(`Drive yükleme hatası (görsel ${index + 1}): ${e.message}`);
        } finally {
          // Yerel dosyayı sil (disk dolmasın)
          try { fs.unlinkSync(filepath); } catch (e) {}
        }
      },
    });
    
    // SIFIR görsel = hata (kullanıcı talebi: 0 görselde durmalı)
    if (basariliSayisi === 0) {
      const sebep = hatalar.length > 0
        ? hatalar[hatalar.length - 1].hata
        : "tüm hesaplar kotada";
      throw new Error(
        `0/${toplam} görsel üretildi. Sebep: ${sebep}. ` +
        `Tüm Cloudflare hesaplarının kotası dolmuş olabilir, UTC 00:00'ı bekleyin.`
      );
    }
    
    const status = sonuclar.length === toplam ? "completed" : "partial";
    await jobGuncelle(JOB_ID, {
      gorsel_status: `${status}:${basariliSayisi}/${toplam}`,
    });
    
    console.log(`✅ ${basariliSayisi}/${toplam} görsel hazır.`);
    
    await telegram(job.chat_id, `🖼 *Görseller hazır:* ${basariliSayisi}/${toplam}`);
    
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
