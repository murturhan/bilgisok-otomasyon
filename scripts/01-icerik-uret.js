/**
 * 01 - İçerik Üretimi
 * - Konu havuzundan konu al
 * - Gemini ile içerik üret (başlık, senaryo, prompts, thumbnail bilgisi)
 * - Drive'da ana klasör + alt klasörler aç
 * - job_state Sheets'e kaydet
 * - Trigger: Telegram → repository_dispatch
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  konuHavuzundanAl,
  jobOlustur,
  driveKlasorAc,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const {
  GEMINI_API_KEY,
  GEMINI_API_KEY_2,
  TARIH,
  INDEX,
  CHAT_ID,
  JOB_ID,
} = process.env;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function icerikUret(konu) {
  console.log("Gemini içerik üretiyor...");
  
  const geminiKeys = [GEMINI_API_KEY];
  if (GEMINI_API_KEY_2) geminiKeys.push(GEMINI_API_KEY_2);
  
  const prompt = `Sen, YouTube'da antik tarih ve gizemler üzerine Türkçe içerik üreten bir uzmansın.

KONU: "${konu}"

GERÇEK BİLGİ ZORUNLULUĞU:
- SADECE doğrulanmış tarihi ve arkeolojik bilgi kullan
- UYDURMA YOK

Aşağıdaki JSON yapısında çıktı üret:

{
  "konu": "${konu}",
  "baslik": "YouTube videosu için merak uyandırıcı başlık (60-70 karakter)",
  "thumbnail_baslik": "Thumbnail için kısa vurucu başlık (MAKS 30 karakter, BÜYÜK HARF, 2-4 kelime)",
  "thumbnail_prompt": "Thumbnail için FLUX görsel promptu (İngilizce, dramatic cinematic shot, vibrant colors, high contrast, eye-catching composition, no text in image, 16:9 widescreen)",
  "aciklama": "Video açıklaması, 200-300 kelime",
  "senaryo": "Tam seslendirme metni, 800-1200 kelime. Doğal akıcı Türkçe. Cümleler arası nokta ve virgüllere dikkat et (TTS için önemli).",
  "ai_gorsel_prompts": ["20 adet detaylı görsel üretim promptu (İngilizce, cinematic, photorealistic, 16:9 widescreen, wide cinematic shot)"],
  "ai_klip_prompts": ["3 adet AI video klip promptu (İngilizce, Veo Studio için, 16:9)"],
  "pexels_anahtar_kelimeler": ["4 adet Pexels stok video anahtar kelimesi (İngilizce, basit)"]
}

thumbnail_baslik örnekler: "SIRRI ÇÖZÜLDÜ!", "GİZLİ GERÇEK", "YALAN MIYDI?"
ai_gorsel_prompts: TAM 20 öğe
ai_klip_prompts: TAM 3 öğe
pexels_anahtar_kelimeler: TAM 4 öğe`;

  const maxRetries = 5;
  const modeller = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const modelAdi = modeller[Math.min(attempt - 1, modeller.length - 1)];
    const aktifKey = geminiKeys[(attempt - 1) % geminiKeys.length];
    
    try {
      console.log(`Gemini denemesi ${attempt}/${maxRetries} - ${modelAdi}`);
      
      const genAI = new GoogleGenerativeAI(aktifKey);
      const model = genAI.getGenerativeModel({
        model: modelAdi,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      });
      
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const json = JSON.parse(text);
      
      if (!json.ai_gorsel_prompts || json.ai_gorsel_prompts.length < 20) {
        throw new Error(`Gemini ${json.ai_gorsel_prompts?.length || 0} görsel promptu verdi.`);
      }
      
      if (json.ai_gorsel_prompts.length > 20) {
        json.ai_gorsel_prompts = json.ai_gorsel_prompts.slice(0, 20);
      }
      
      // Fallback'ler
      if (!json.thumbnail_prompt) {
        json.thumbnail_prompt = `Dramatic cinematic shot of ${konu}, vibrant colors, high contrast, 16:9 widescreen, no text`;
      }
      if (!json.thumbnail_baslik) {
        json.thumbnail_baslik = "GİZEM ÇÖZÜLDÜ!";
      }
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      return json;
      
    } catch (error) {
      const msg = error.message || "";
      if (attempt === maxRetries) throw error;
      
      const is503 = msg.includes("503") || msg.includes("overloaded");
      const is429 = msg.includes("429") || msg.includes("quota");
      
      if (is503 || is429) {
        await delay(attempt * 30000);
      } else {
        await delay(10000);
      }
    }
  }
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}, Tarih: ${TARIH}, Index: ${INDEX}`);
    
    // 1. Konu al
    const konu = await konuHavuzundanAl(TARIH, INDEX);
    console.log(`Konu: ${konu}`);
    
    await telegram(CHAT_ID, `🎬 *Yeni iş başlatıldı!*\n\n✅ *Konu:* ${konu}\n🆔 \`${JOB_ID}\`\n\n⏳ Gemini içerik üretiyor...`);
    
    // 2. İçerik üret
    const icerik = await icerikUret(konu);
    
    // 3. Drive'da ana klasör + alt klasörler aç
    const safeTitle = konu.substring(0, 50).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, "");
    const klasorAdi = `${TARIH}-${safeTitle}`;
    
    console.log(`Drive klasörleri açılıyor: ${klasorAdi}`);
    const anaKlasor = await driveKlasorAc(klasorAdi);
    await driveKlasorAc("01-gorseller", anaKlasor.id);
    await driveKlasorAc("02-ses", anaKlasor.id);
    await driveKlasorAc("03-pexels-stok-video", anaKlasor.id);
    const klipKlasor = await driveKlasorAc("04-veo-klipleri-buraya", anaKlasor.id);
    await driveKlasorAc("05-thumbnail", anaKlasor.id);
    
    // 4. job_state Sheets'e kaydet
    await jobOlustur({
      job_id: JOB_ID,
      tarih: TARIH,
      index: INDEX,
      chat_id: CHAT_ID,
      konu: konu,
      baslik: icerik.baslik,
      thumbnail_baslik: icerik.thumbnail_baslik,
      thumbnail_prompt: icerik.thumbnail_prompt,
      senaryo: icerik.senaryo,
      aciklama: icerik.aciklama,
      ai_gorsel_prompts: icerik.ai_gorsel_prompts,
      ai_klip_prompts: icerik.ai_klip_prompts,
      pexels_anahtar_kelimeler: icerik.pexels_anahtar_kelimeler,
      drive_folder_id: anaKlasor.id,
      klip_klasor_id: klipKlasor.id,
    });
    
    // 5. Telegram bildirim
    const klipPromptlari = icerik.ai_klip_prompts
      .map((p, i) => `🎥 *KLİP ${i + 1}:*\n\`${p}\``)
      .join("\n\n");
    
    await telegram(
      CHAT_ID,
      `📝 *İçerik hazır!*\n\n` +
      `📌 *Başlık:* ${icerik.baslik}\n` +
      `🎯 *Thumbnail:* ${icerik.thumbnail_baslik}\n\n` +
      `📂 [Drive klasörü](${anaKlasor.link})\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `🎬 *VEO STUDIO'DA 3 KLİP ÜRET:*\n\n${klipPromptlari}\n\n` +
      `_Klipleri "04-veo-klipleri-buraya" klasörüne yükle._\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `⏳ Diğer materyaller (görsel, ses, stok video, thumbnail) paralel üretiliyor...`
    );
    
    console.log("✅ İçerik üretimi tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    await telegram(CHAT_ID, `❌ *01-İçerik hatası:* ${error.message.substring(0, 500)}`);
    process.exit(1);
  }
}

main();
