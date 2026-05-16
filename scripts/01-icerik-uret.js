/**
 * 01 - İçerik Üretimi v13
 * - Storytelling + dönem doğruluğu + müzik mood + tts_telaffuz
 * - thumbnail_baslik & thumbnail_alt_baslik KALDIRILDI
 * - Sadece `baslik` alanı, MUTLAKA ":" ile bölünmüş (ana: alt açıklama)
 * - 30 sahne / 30 görsel
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
  console.log("Gemini storytelling içerik üretiyor...");
  
  const geminiKeys = [GEMINI_API_KEY];
  if (GEMINI_API_KEY_2) geminiKeys.push(GEMINI_API_KEY_2);
  
  const prompt = `Sen, YouTube'da antik tarih ve gizemler üzerine Türkçe içerik üreten DENEYİMLİ bir senaryist ve belgesel anlatıcısısın. Discovery, National Geographic, BBC kalitesinde içerik yazıyorsun.

KONU: "${konu}"

═══════════════════════════════════════════════════
SENARYO YAZIM KURALLARI
═══════════════════════════════════════════════════

❌ ASLA YAPMA:
- Wikipedia stili düz anlatım YOK
- Kuru tarih sıralaması YOK
- "olmuştur, edilmiştir" formal dil YOK

✅ YAP:
- DRAMATİK HOOK ile başla
- HİKAYE anlat
- SES TONUNDA YAZ: "Hayal et", "Şimdi düşün", "İşte tam o anda"
- KISA CÜMLELER

═══════════════════════════════════════════════════
📌 BAŞLIK FORMATI - ÇOK ÖNEMLİ!
═══════════════════════════════════════════════════

baslik alanı MUTLAKA İKİ KISMI olacak, ":" ile ayrılmış:
**[ANA BAŞLIK]: [ALT AÇIKLAMA]**

ANA BAŞLIK kısmı:
- 2-4 kelime
- ŞOK VEYA MERAK uyandıran
- Konunun en güçlü kelimesi

ALT AÇIKLAMA kısmı:
- 5-12 kelime
- Konunun "ne olduğunu" anlatan
- "Sır, Bedel, Gerçek, Yalan, Gizem" gibi kelimeler

KRİTİK KURALLAR:
- baslik MUTLAKA ":" içerecek (sadece bir tane)
- Ana başlık 2-4 kelime, ALT açıklama 5-12 kelime
- TOPLAM 50-75 karakter
- Türkçe gramer DOĞRU (kesik kelime YOK)
- Soyut değil, KONU adı içermeli

═══════════════════════════════════════════════════
TARİHİ DÖNEM DOĞRULUĞU - KRİTİK!
═══════════════════════════════════════════════════

KONUYU OKU. Hangi yüzyıl? Hangi medeniyet?

GÖRSEL PROMPT'TA:
- Dönem ADI: "Byzantine era", "Ottoman 16th century"
- Mimari: kubbe/minare/piramit
- Kıyafet: toga/kavuk/tunic
- ANACHRONISM YOK

═══════════════════════════════════════════════════
🔥 TTS TELAFFUZ KURALLARI
═══════════════════════════════════════════════════

İKİ VERSİYON SENARYO:

**senaryo**:
- "M.S. 1453", "M.Ö. 1700"
- Türkçe ek apostroflar korunur

**tts_telaffuz**:
- "M.S." → "Milattan Sonra"
- "M.Ö." → "Milattan Önce"
- "1453'te" → "bin dört yüz elli üçte"
- Apostroflar KALDIR

═══════════════════════════════════════════════════
MÜZIK MOOD
═══════════════════════════════════════════════════

- "epic" → savaşlar, fetihler
- "mysterious" → sırlar, kayıp medeniyetler
- "calm" → günlük yaşam
- "dramatic" → trajediler, çöküşler

JSON çıktısı:

{
  "konu": "${konu}",
  "tarihi_donem": "Tarihi dönem",
  "baslik": "ANA BAŞLIK: ALT AÇIKLAMA formatında (':' ZORUNLU), 50-75 karakter",
  "thumbnail_prompt": "Thumbnail FLUX prompt - dönem uygun, MrBeast style, RIGHT THIRD EMPTY for text, 16:9, NO TEXT IN IMAGE",
  "muzik_mood": "epic / mysterious / calm / dramatic",
  "aciklama": "200-300 kelime",
  "senaryo": "800-1100 kelimelik senaryo - GÖRSEL YAZIM",
  "tts_telaffuz": "AYNI senaryonun TÜRKÇE OKUNUŞ versiyonu",
  "sahneler": [
    {
      "metin": "Senaryo bölümü, 30-40 kelime",
      "gorsel_prompt": "Sahne görseli - dönem ADI mutlaka. FLUX İngilizce, cinematic photorealistic 16:9"
    }
    // TAM 30 sahne
  ]
}

KRİTİK KURALLAR:
- sahneler TAM 30
- baslik MUTLAKA ":" içerecek
- baslik Türkçe gramer doğru
- senaryo VE tts_telaffuz ayrı yazılacak`;

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
          temperature: 0.85,
          maxOutputTokens: 32768,
        },
      });
      
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const json = JSON.parse(text);
      
      if (!json.sahneler || json.sahneler.length < 30) {
        throw new Error(`Gemini ${json.sahneler?.length || 0} sahne verdi, 30 gerekli.`);
      }
      
      if (json.sahneler.length > 30) {
        json.sahneler = json.sahneler.slice(0, 30);
      }
      
      if (!json.tts_telaffuz || json.tts_telaffuz.length < 100) {
        console.log("⚠ tts_telaffuz alanı yok/kısa, otomatik dönüştürülüyor");
        json.tts_telaffuz = json.senaryo
          .replace(/M\.\s*Ö\./gi, "Milattan Önce")
          .replace(/M\.\s*S\./gi, "Milattan Sonra")
          .replace(/MÖ/g, "Milattan Önce")
          .replace(/MS/g, "Milattan Sonra");
      }
      
      json.ai_gorsel_prompts = json.sahneler.map(s => s.gorsel_prompt);
      json.pexels_anahtar_kelimeler = [];
      json.ai_klip_prompts = [];
      
      if (!json.thumbnail_prompt) {
        json.thumbnail_prompt = `Hyperrealistic close-up dramatic face related to ${konu}, period-accurate clothing, MrBeast style, right third empty, 16:9, no text`;
      }
      
      if (!json.baslik || !json.baslik.includes(":")) {
        const yeniBaslik = json.baslik || konu;
        console.log(`⚠ baslık ":" içermiyor, otomatik bölünüyor: "${yeniBaslik}"`);
        const kelimeler = yeniBaslik.split(/\s+/);
        const yari = Math.ceil(kelimeler.length / 3);
        const ana = kelimeler.slice(0, yari).join(" ");
        const alt = kelimeler.slice(yari).join(" ") || "Şaşırtıcı Bir Hikaye";
        json.baslik = `${ana}: ${alt}`;
      }
      
      if (!json.muzik_mood || !["epic", "mysterious", "calm", "dramatic"].includes(json.muzik_mood)) {
        json.muzik_mood = "epic";
      }
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      console.log(`Tarihi dönem: ${json.tarihi_donem || "belirtilmemiş"}`);
      console.log(`Müzik: ${json.muzik_mood}`);
      console.log(`Senaryo: ${json.senaryo.length} karakter, TTS: ${json.tts_telaffuz.length} karakter`);
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
    
    const konu = await konuHavuzundanAl(TARIH, INDEX);
    console.log(`Konu: ${konu}`);
    
    await telegram(CHAT_ID, `🎬 *Yeni iş*\n\n✅ *Konu:* ${konu}\n🆔 \`${JOB_ID}\`\n\n⏳ İçerik üretiliyor...`);
    
    const icerik = await icerikUret(konu);
    
    const safeTitle = konu.substring(0, 50).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, "");
    const klasorAdi = `${TARIH}-${safeTitle}`;
    
    console.log(`Drive klasörleri açılıyor: ${klasorAdi}`);
    const anaKlasor = await driveKlasorAc(klasorAdi);
    await driveKlasorAc("01-gorseller", anaKlasor.id);
    await driveKlasorAc("02-ses", anaKlasor.id);
    await driveKlasorAc("05-thumbnail", anaKlasor.id);
    
    await jobOlustur({
      job_id: JOB_ID,
      tarih: TARIH,
      index: INDEX,
      chat_id: CHAT_ID,
      konu: konu,
      baslik: icerik.baslik,
      thumbnail_baslik: "",
      thumbnail_alt_baslik: "",
      thumbnail_prompt: icerik.thumbnail_prompt,
      senaryo: icerik.senaryo,
      tts_telaffuz: icerik.tts_telaffuz,
      aciklama: icerik.aciklama,
      ai_gorsel_prompts: icerik.ai_gorsel_prompts,
      ai_klip_prompts: [],
      pexels_anahtar_kelimeler: [],
      drive_folder_id: anaKlasor.id,
      klip_klasor_id: "",
      muzik_mood: icerik.muzik_mood,
    });
    
    await telegram(
      CHAT_ID,
      `📝 *İçerik hazır!*\n\n` +
      `📌 ${icerik.baslik}\n` +
      `🏛 ${icerik.tarihi_donem || "-"}\n` +
      `🎵 ${icerik.muzik_mood}\n` +
      `🖼 30 sahne / 30 görsel\n\n` +
      `📂 [Drive klasörü](${anaKlasor.link})\n\n` +
      `⏳ Görsel, ses, thumbnail, altyazı üretiliyor...`
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
