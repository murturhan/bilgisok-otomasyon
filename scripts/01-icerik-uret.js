/**
 * 01 - İçerik Üretimi v7
 * - Storytelling + tarihi DÖNEM DOĞRULUĞU (Konstantinopolis dönemi → minare yok!)
 * - Abone iste cümlesi KALDIRILDI (advance workflow'a)
 * - Müzik mood seçimi
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
- KISA CÜMLELER, virgül ve nokta ile nefes

═══════════════════════════════════════════════════
TARİHİ DÖNEM DOĞRULUĞU - EN KRİTİK KURAL!!!
═══════════════════════════════════════════════════

⛔⛔⛔ MUTLAKA UYGULAMAN GEREKİYOR:

KONUYU OKU. Hangi tarihi dönem? Hangi yüzyıl? Hangi medeniyet?

ÖRNEKLER:
- "Konstantinopolis" konusu → BİZANS DÖNEMİ → Ayasofya'da MİNARE YOK, kubbe var. Bizans bayrakları (kartal), Bizans askerleri
- "İstanbul'un Fethi" konusu → 1453 → Osmanlı askerleri, top mehmet, şehrin ÇİFTHALLİ durumu (kubbe + henüz minaresiz Ayasofya)
- "Osmanlı klasik dönem" → 16-17. yy → Mimari Sinan, minareli camiler, kavuklu askerler, kılıçlar
- "Antik Mısır" → MÖ 3000-1000 → piramitler, hieroglifler, beyaz kıyafetler
- "Hititler" → MÖ 1700-1180 → Anadolu, taş tapınaklar, savaş arabaları
- "Roma İmparatorluğu" → MÖ 27-MS 476 → Toga, lejyoner, marble heykeller

GÖRSEL PROMPT'TA MUTLAKA:
- Dönemin SPESİFİK ADI: "Byzantine era", "Ottoman era 16th century", "Hittite Bronze Age"
- Dönem detayı: hangi yüzyıl, hangi hanedan
- Mimari detay: kubbe? minare? piramit? mabet?
- Kıyafet detayı: toga? kavuk? tunic? robe?

ASLA OLMAYACAKLAR:
- Modern öğeler (telefon, araba, jeans)
- Yanlış dönem öğeleri (Bizans'ta minare!, Antik Mısır'da kemerli kapı!, Hititler'de demir kale!)
- Anachronism (zamanlamasız öğeler)

═══════════════════════════════════════════════════
MÜZIK MOOD
═══════════════════════════════════════════════════

- "epic" → savaşlar, fetihler, kahramanlık
- "mysterious" → sırlar, kayıp medeniyetler
- "calm" → günlük yaşam, sanat, tapınaklar
- "dramatic" → trajediler, çöküşler, ihanetler

═══════════════════════════════════════════════════
KONU: ${konu}
═══════════════════════════════════════════════════

İLK ADIM (zihninde):
1. Bu konunun TAM TARİHİ DÖNEMİ nedir? (yüzyıl, medeniyet)
2. O dönemin mimarisi, kıyafetleri, askeri donanımı nedir?
3. O dönemde NE OLAMAZ? (anachronism)

ŞIMDI JSON çıktısı:

{
  "konu": "${konu}",
  "tarihi_donem": "Bu konunun ait olduğu tarihi dönem (örn: 'Bizans dönemi, 4-15. yy', 'Osmanlı klasik dönem 16. yy')",
  "baslik": "MERAK UYANDIRICI başlık (60-70 karakter)",
  "thumbnail_baslik": "MAKS 15 karakter, BÜYÜK HARF",
  "thumbnail_alt_baslik": "1-3 kelime: 'GERÇEK Mİ?', 'KEŞFEDİLDİ'",
  "thumbnail_prompt": "Thumbnail FLUX prompt - konunun TAM DÖNEMİNE uygun (Bizans için kubbeli kilise minaresiz, Osmanlı için minareli cami). MrBeast style, leave right third empty, 16:9, NO TEXT",
  "muzik_mood": "epic / mysterious / calm / dramatic",
  "aciklama": "Video açıklaması, 200-300 kelime",
  "senaryo": "TAM 800-1100 kelimelik STORYTELLING senaryo. Hook ile başla, hikaye anlat. Türkçe ek apostrofları kullan ('Bizans'ın, Konstantinopolis'in)",
  "sahneler": [
    {
      "metin": "Senaryonun bir bölümü, 40-50 kelime",
      "gorsel_prompt": "BU SAHNENİN SOMUT görsel öğesi. ZORUNLU: dönem adı (Byzantine era / Ottoman 16th century / Hittite Bronze Age). DİKKAT: anachronism YOK (Bizans'ta minare yok!). FLUX İngilizce, cinematic photorealistic 16:9, period-accurate architecture and clothing"
    }
    // TAM 20 sahne
  ]
}

KRİTİK KURALLAR:
- sahneler: TAM 20 öğe
- Her görsel_prompt mutlaka SPESİFİK dönem adı içermeli
- ANACHRONISM YOK (yanlış dönem öğeleri)
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
          maxOutputTokens: 16384,
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
      
      json.ai_gorsel_prompts = json.sahneler.map(s => s.gorsel_prompt);
      json.pexels_anahtar_kelimeler = [];
      json.ai_klip_prompts = []; // Veo klip prompt'u artık yok
      
      if (!json.thumbnail_prompt) {
        json.thumbnail_prompt = `Hyperrealistic close-up dramatic face related to ${konu}, period-accurate clothing, MrBeast YouTube thumbnail style, leave right third empty for text, 16:9, no text`;
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
      console.log(`Thumbnail: "${json.thumbnail_baslik}" + "${json.thumbnail_alt_baslik}"`);
      console.log(`Müzik mood: ${json.muzik_mood}`);
      console.log(`${json.sahneler.length} sahne, senaryo ${json.senaryo.length} karakter`);
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
    
    await telegram(CHAT_ID, `🎬 *Yeni iş başlatıldı!*\n\n✅ *Konu:* ${konu}\n🆔 \`${JOB_ID}\`\n\n⏳ İçerik üretiliyor...`);
    
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
      `📌 *Başlık:* ${icerik.baslik}\n` +
      `🏛 *Dönem:* ${icerik.tarihi_donem || '-'}\n` +
      `🎯 *Thumbnail:* ${icerik.thumbnail_baslik} | ${icerik.thumbnail_alt_baslik || ""}\n` +
      `🎵 *Müzik:* ${icerik.muzik_mood}\n\n` +
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
