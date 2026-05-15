/**
 * 01 - İçerik Üretimi v8
 * - Storytelling + dönem doğruluğu + müzik mood
 * - YENİ: tts_telaffuz alanı (yabancı isimler Türkçe okunuş)
 * - YENİ: kısaltma yasağı (Gemini M.S. yazmasın, "milattan sonra" yazsın)
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
- HİKAYE anlat: karakterler, sahneler, çatışmalar
- SES TONUNDA YAZ: "Hayal et", "Şimdi düşün", "İşte tam o anda"
- KISA CÜMLELER

═══════════════════════════════════════════════════
TARİHİ DÖNEM DOĞRULUĞU - KRİTİK!
═══════════════════════════════════════════════════

KONUYU OKU. Hangi yüzyıl? Hangi medeniyet? O dönemin mimarisi neye benzer?

ÖRNEKLER:
- "Konstantinopolis" → BİZANS DÖNEMİ → Ayasofya'da MİNARE YOK, kubbe var
- "İstanbul'un Fethi 1453" → Osmanlı askerleri, Bizans savunması
- "Antik Mısır" → piramitler, hieroglifler
- "Hititler" → MÖ 1700-1180, Anadolu, taş tapınaklar
- "Roma" → toga, lejyoner

GÖRSEL PROMPT'TA:
- Dönem SPESİFİK adı: "Byzantine era", "Ottoman 16th century", "Hittite Bronze Age"
- Mimari detay: kubbe/minare/piramit/mabet
- Kıyafet: toga/kavuk/tunic/robe
- ANACHRONISM YOK

═══════════════════════════════════════════════════
🔥 TTS TELAFFUZ KURALLARI - ÇOK ÖNEMLİ!
═══════════════════════════════════════════════════

İKİ VERSİYON SENARYO YAZACAKSIN:

**senaryo** alanı (GÖRSEL ALTYAZI için, GERÇEK YAZIM):
- "M.S. 1453", "M.Ö. 1700"
- "Teotihuacan", "Tutankhamun", "Roma"
- Türkçe ek apostroflar: "Hititler'in", "Konstantinopolis'in"
- Normal punctuation

**tts_telaffuz** alanı (SES İÇİN, OKUNUŞ YAZIMI):
SES bunu okuyacak. Bu yüzden TÜRKÇE OKUNUŞU yaz!

KURALLAR:
1. Kısaltma YOK:
   - "M.S." YAZMA → "Milattan Sonra" yaz
   - "M.Ö." YAZMA → "Milattan Önce" yaz
   - "5. yy." YAZMA → "beşinci yüzyıl" yaz
   - "vb." YAZMA → "ve benzeri" yaz

2. Yabancı isimleri TÜRKÇE OKUNUŞU ile yaz:
   - "Teotihuacan" → "Teotiakan"
   - "Tutankhamun" → "Tutankamun"
   - "Caesar" → "Sezar"
   - "Pythagoras" → "Pisagor"
   - "Babylon" → "Babil"
   - "Mesopotamia" → "Mezopotamya"
   - "Achilles" → "Aşil"
   - "Tenochtitlan" → "Tenoçtitlan"
   - "Machu Picchu" → "Maçu Piçu"
   - "Hieroglif" → "hiyeroglif" (oluyor zaten)
   - "Sphinx" → "Sfenks"

3. Sayıları kelime olarak yaz (5'ten büyük):
   - "MÖ 1700" → "Milattan Önce bin yedi yüz"
   - "1453'te" → "bin dört yüz elli üçte"
   - Küçük sayılar normal: "2 yıl", "3 sefer" olabilir

4. Türkçe ek apostroflarını KALDIR:
   - "Hititler'in" → "Hititlerin"
   - "Konstantinopolis'i" → "Konstantinopolisi"

ÖRNEK:
senaryo: "M.Ö. 1700'de, Hititler'in başkenti Hattuşa'ya gelen tüccarlar..."
tts_telaffuz: "Milattan Önce bin yedi yüzde, Hititlerin başkenti Hattuşaya gelen tüccarlar..."

═══════════════════════════════════════════════════
MÜZIK MOOD
═══════════════════════════════════════════════════

- "epic" → savaşlar, fetihler, kahramanlık
- "mysterious" → sırlar, kayıp medeniyetler
- "calm" → günlük yaşam, sanat
- "dramatic" → trajediler, çöküşler

═══════════════════════════════════════════════════
KONU: ${konu}
═══════════════════════════════════════════════════

JSON çıktısı:

{
  "konu": "${konu}",
  "tarihi_donem": "Tarihi dönem (örn: 'Bizans 4-15. yy', 'Aztek 14-16. yy')",
  "baslik": "MERAK UYANDIRICI başlık (60-70 karakter)",
  "thumbnail_baslik": "MAKS 15 karakter, BÜYÜK HARF",
  "thumbnail_alt_baslik": "1-3 kelime",
  "thumbnail_prompt": "Thumbnail FLUX prompt - dönem uygun, MrBeast style, right third empty, 16:9, NO TEXT",
  "muzik_mood": "epic / mysterious / calm / dramatic",
  "aciklama": "200-300 kelime",
  "senaryo": "800-1100 kelimelik senaryo - GÖRSEL YAZIM (M.S., yabancı isim orijinal, Türkçe ek apostrof)",
  "tts_telaffuz": "AYNI senaryonun TÜRKÇE OKUNUŞ versiyonu - kısaltma açık, yabancı isim Türkçe, apostrof yok",
  "sahneler": [
    {
      "metin": "Senaryo bölümü, 40-50 kelime",
      "gorsel_prompt": "BU SAHNENİN GÖRSEL ÖĞESİ. Dönem ADI mutlaka. ANACHRONISM YOK. FLUX İngilizce, cinematic photorealistic 16:9"
    }
    // TAM 20 sahne
  ]
}

KRİTİK KURALLAR:
- sahneler TAM 20
- senaryo VE tts_telaffuz **ayrı yazılacak** (telaffuz farklı)
- tts_telaffuz YAKLAŞIK AYNI UZUNLUKTA olmalı (büyük fark olmasın)
- thumbnail_baslik MAKS 15 KARAKTER`;

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
          temperature: 0.8,
          maxOutputTokens: 32768, // İki senaryo için arttırdık
        },
      });
      
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const json = JSON.parse(text);
      
      if (!json.sahneler || json.sahneler.length < 20) {
        throw new Error(`Gemini ${json.sahneler?.length || 0} sahne verdi, 20 gerekli.`);
      }
      
      if (json.sahneler.length > 20) {
        json.sahneler = json.sahneler.slice(0, 20);
      }
      
      // tts_telaffuz yoksa senaryo'dan üret (fallback)
      if (!json.tts_telaffuz || json.tts_telaffuz.length < 100) {
        console.log("⚠ tts_telaffuz alanı yok/kısa, senaryo'dan otomatik üretiliyor");
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
      if (!json.thumbnail_baslik) json.thumbnail_baslik = "GİZEM";
      if (!json.thumbnail_alt_baslik) json.thumbnail_alt_baslik = "AÇIKLANDI";
      if (!json.muzik_mood || !["epic", "mysterious", "calm", "dramatic"].includes(json.muzik_mood)) {
        json.muzik_mood = "epic";
      }
      
      if (json.thumbnail_baslik.length > 18) {
        json.thumbnail_baslik = json.thumbnail_baslik.substring(0, 18).trim();
      }
      if (json.thumbnail_alt_baslik.length > 20) {
        json.thumbnail_alt_baslik = json.thumbnail_alt_baslik.substring(0, 20).trim();
      }
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      console.log(`Tarihi dönem: ${json.tarihi_donem || 'belirtilmemiş'}`);
      console.log(`Müzik: ${json.muzik_mood}`);
      console.log(`Senaryo: ${json.senaryo.length} karakter, TTS telaffuz: ${json.tts_telaffuz.length} karakter`);
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
      thumbnail_baslik: icerik.thumbnail_baslik,
      thumbnail_alt_baslik: icerik.thumbnail_alt_baslik || "",
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
      `🏛 ${icerik.tarihi_donem || '-'}\n` +
      `🎯 ${icerik.thumbnail_baslik} | ${icerik.thumbnail_alt_baslik || ""}\n` +
      `🎵 ${icerik.muzik_mood}\n\n` +
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
