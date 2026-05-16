/**
 * 01 - İçerik Üretimi v9
 * - Storytelling + dönem doğruluğu + müzik mood + tts_telaffuz
 * - YENİ: Kancalı (clickbait) thumbnail başlıkları
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
🎣 KANCALI THUMBNAIL BAŞLIĞI - ÇOK ÖNEMLİ!
═══════════════════════════════════════════════════

Thumbnail başlığı **merak uyandırmalı, soru bırakmalı, ŞAŞIRTMALI**.
İnsan tıklamak ZORUNDA hissetsin.

KANCA FORMÜLLERİ (ör.):
1. SAYISAL KANCA: "TAM 3000 YIL!", "5 KEZ YANDI!", "1 GECEDE..."
2. SIR/GİZEM KANCA: "GİZLENEN GERÇEK", "BU YÜZDEN", "ASLA SÖYLENMEDİ"
3. ŞOKLAYICI: "DEHŞET!", "İNANILMAZ!", "BU NASIL?"
4. SORU KANCA: "NEDEN ÖLDÜ?", "NASIL BAŞARDI?", "GERÇEK NE?"
5. TEZAT KANCA: "AMA SONRA...", "TERSİNE", "BEKLENMEYEN"
6. SONUÇ KANCA: "İŞTE NEDENİ", "BU YÜZDEN", "AÇIKLANDI"

ÖRNEKLER (konuya göre):
- Hititler → "DEMİRİN SIRRI!" + "GERÇEK Mİ?"
- Konstantinopolis → "DÜŞMEMELİYDİ!" + "AMA OLDU"
- Mısır piramitleri → "GİZLİ ODA!" + "SONUNDA"
- Truva atı → "AKILLI HİLE!" + "VE..."
- Atlantis → "GERÇEKTEN VAR MI?" + "İŞTE KANITLAR"
- Maya takvimi → "DÜNYA NEDEN BİTMEDİ?" + "GERÇEK"
- Pompeii → "1 SANİYEDE!" + "FELAKET"

KURALLAR:
- thumbnail_baslik: ANA BAŞLIK, MAKS 15 KARAKTER, BÜYÜK HARF
  → Mutlaka KANCA içermeli (sayı/sır/soru/tezat)
  → Yer/kişi adı KISALT veya bırak (zaten görsel açıklıyor)
- thumbnail_alt_baslik: TAMAMLAYICI, 1-3 KELİME
  → ÜNLEM veya SORU işareti ile
  → Ana başlığı destekler, kanca daha güçlü olur

KOMBO ÖRNEKLERİ:
✅ "DEMİRİN SIRRI" + "GERÇEK Mİ?"
✅ "TAM 3000 YIL!" + "İŞTE NEDENİ"
✅ "GİZLENEN GERÇEK" + "AÇIKLANDI"
✅ "1 GECEDE BİTTİ" + "NASIL?"
✅ "BU YÜZDEN ÖLDÜ" + "ŞOK!"
✅ "ASLA İNANMAZSIN" + "GERÇEK"

❌ YAPMA:
- "HİTİTLER" (düz, kanca yok)
- "ANTİK ROMA" (düz, kanca yok)
- "Konstantinopolis" (uzun, düz)

═══════════════════════════════════════════════════
TARİHİ DÖNEM DOĞRULUĞU - KRİTİK!
═══════════════════════════════════════════════════

KONUYU OKU. Hangi yüzyıl? Hangi medeniyet?

ÖRNEKLER:
- "Konstantinopolis" → BİZANS → Ayasofya'da MİNARE YOK, kubbe var
- "İstanbul'un Fethi 1453" → Osmanlı askerleri, Bizans savunması
- "Antik Mısır" → piramitler, hieroglifler
- "Hititler" → MÖ 1700-1180, Anadolu

GÖRSEL PROMPT'TA:
- Dönem ADI: "Byzantine era", "Ottoman 16th century"
- Mimari: kubbe/minare/piramit
- Kıyafet: toga/kavuk/tunic
- ANACHRONISM YOK

═══════════════════════════════════════════════════
🔥 TTS TELAFFUZ KURALLARI
═══════════════════════════════════════════════════

İKİ VERSİYON SENARYO YAZACAKSIN:

**senaryo** (GÖRSEL ALTYAZI, gerçek yazım):
- "M.S. 1453", "M.Ö. 1700"
- "Teotihuacan", "Caesar"
- Türkçe ek apostroflar: "Hititler'in"

**tts_telaffuz** (SES, okunuş yazımı):
- "M.S." YAZMA → "Milattan Sonra"
- "M.Ö." YAZMA → "Milattan Önce"
- "Teotihuacan" → "Teotiakan"
- "Caesar" → "Sezar"
- "Pythagoras" → "Pisagor"
- "1453'te" → "bin dört yüz elli üçte"
- Türkçe ek apostrofları KALDIR: "Hititler'in" → "Hititlerin"

═══════════════════════════════════════════════════
MÜZIK MOOD
═══════════════════════════════════════════════════

- "epic" → savaşlar, fetihler
- "mysterious" → sırlar, kayıp medeniyetler
- "calm" → günlük yaşam
- "dramatic" → trajediler, çöküşler

═══════════════════════════════════════════════════
KONU: ${konu}
═══════════════════════════════════════════════════

JSON çıktısı:

{
  "konu": "${konu}",
  "tarihi_donem": "Tarihi dönem",
  "baslik": "MERAK UYANDIRICI YouTube başlık (60-70 karakter)",
  "thumbnail_baslik": "KANCALI ana başlık, MAKS 15 karakter, BÜYÜK HARF (örn: 'TAM 3000 YIL!')",
  "thumbnail_alt_baslik": "Destekleyici alt başlık, 1-3 kelime (örn: 'NEDENİ?', 'ŞOK!')",
  "thumbnail_prompt": "Thumbnail FLUX prompt - dönem uygun, MrBeast style, RIGHT THIRD EMPTY for text, 16:9, NO TEXT IN IMAGE",
  "muzik_mood": "epic / mysterious / calm / dramatic",
  "aciklama": "200-300 kelime",
  "senaryo": "800-1100 kelimelik senaryo - GÖRSEL YAZIM",
  "tts_telaffuz": "AYNI senaryonun TÜRKÇE OKUNUŞ versiyonu",
  "sahneler": [
    {
      "metin": "Senaryo bölümü, 40-50 kelime",
      "gorsel_prompt": "Sahne görseli - dönem ADI mutlaka. FLUX İngilizce, cinematic photorealistic 16:9"
    }
    // TAM 20 sahne
  ]
}

KRİTİK KURALLAR:
- sahneler TAM 20
- thumbnail_baslik MUTLAKA KANCALI (sayı/sır/soru/şok/tezat)
- thumbnail_baslik MAKS 15 KARAKTER
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
          temperature: 0.85, // Daha yaratıcı - kanca için
          maxOutputTokens: 32768,
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
      
      // Kancalı başlık kontrolü
      if (!json.thumbnail_baslik) {
        json.thumbnail_baslik = "GERÇEK Mİ?";
      }
      if (!json.thumbnail_alt_baslik) {
        json.thumbnail_alt_baslik = "ŞOK!";
      }
      
      // Kanca olup olmadığını kontrol et - basit heuristic
      const kancaIsaretleri = ["!", "?", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "SIR", "GİZ", "ŞOK", "NEDEN", "NASIL"];
      const kancaVarMi = kancaIsaretleri.some(k => 
        json.thumbnail_baslik.toUpperCase().includes(k) || json.thumbnail_alt_baslik.toUpperCase().includes(k)
      );
      if (!kancaVarMi) {
        console.log(`⚠ Thumbnail başlığında kanca yok: "${json.thumbnail_baslik}" - ünlem ekleniyor`);
        json.thumbnail_baslik = json.thumbnail_baslik.replace(/[.!?]$/, "") + "!";
      }
      
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
      console.log(`🎣 Thumbnail: "${json.thumbnail_baslik}" | "${json.thumbnail_alt_baslik}"`);
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
      `🎣 *Thumbnail:* ${icerik.thumbnail_baslik} | ${icerik.thumbnail_alt_baslik || ""}\n` +
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
