/**
 * 01 - İçerik Üretimi v5
 * - Storytelling + modern öğe yasağı + müzik mood
 * - Senaryo SONUNDA abone iste kapanışı (yeni)
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
SENARYO YAZIM KURALLARI - DİKKAT!
═══════════════════════════════════════════════════

❌ ASLA YAPMA:
- Wikipedia stili düz anlatım YOK
- Kuru tarih sıralaması YOK
- "olmuştur, edilmiştir, kullanılmıştır" formal dil YOK

✅ YAP:
- DRAMATİK HOOK ile başla: bir sahne, bir sır, bir soru
- HİKAYE anlat: karakterler, sahneler, çatışmalar
- SORU VE CEVAP yapısı: "Peki ya...? Cevap şaşırtıcı..."
- SES TONUNDA YAZ: "Hayal et", "Şimdi şunu söylüyorum", "İşte tam o anda"
- VURGU KELİMELERİ: "İnanılmaz", "Şoke edici", "Şaşırtıcı"
- KISA CÜMLELER, virgül ve nokta ile nefes verme

🎯 SENARYO SONUNDA MUTLAKA:
Senaryonun SON 50-80 kelimesi şöyle olmalı:
"...[konu kapanışı]. Eğer bu videoyu beğendiyseniz, lütfen beğen butonuna basmayı ve kanalımıza abone olmayı unutmayın. Bir sonraki videoda görüşmek üzere, hoşçakalın!"

Veya benzer bir kapanış. Ama ŞU CÜMLE MUTLAKA OLMALI:
"Eğer bu videoyu beğendiyseniz, lütfen beğen butonuna basmayı ve kanalımıza abone olmayı unutmayın."

═══════════════════════════════════════════════════
GÖRSEL EŞLEŞTİRME - EN ÖNEMLİSİ!
═══════════════════════════════════════════════════

⛔ KESİN YASAK - GÖRSELLERDE ASLA OLMAYACAK:
- Modern insanlar (jeansli, takım elbiseli, modern saç)
- Modern teknoloji (telefon, bilgisayar, araba, uçak)
- Modern mekanlar (şehir, ofis, ev, dükkan)
- Modern kıyafet (tişört, ayakkabı, gözlük)
- Modern aktiviteler (altın arama makineleri, fabrika)
- 1900 sonrası HİÇBİR ŞEY

✅ MUTLAKA OLACAK:
- "ancient" veya dönem adıyla başlasın
- "Bronze Age", "Hittite Empire", "Ancient Egypt" gibi dönem
- "wearing ancient tunic/robe", "leather sandals", "bronze armor"
- "ancient temple", "stone palace", "desert oasis"
- "cinematic photorealistic, period-accurate"

═══════════════════════════════════════════════════
MÜZIK MOOD
═══════════════════════════════════════════════════

- "epic" → büyük savaşlar, imparatorluk, fethedişler
- "mysterious" → gizemler, kayıp medeniyetler, sırlar
- "calm" → günlük yaşam, tapınaklar, sanat
- "dramatic" → trajediler, çöküşler, ihanetler

═══════════════════════════════════════════════════
KONU: ${konu}
═══════════════════════════════════════════════════

GERÇEK BİLGİ ZORUNLULUĞU:
- Doğrulanmış tarihi ve arkeolojik bilgi
- UYDURMA YOK ama HİKAYE GİBİ ANLAT

JSON çıktısı:

{
  "konu": "${konu}",
  "baslik": "MERAK UYANDIRICI başlık (60-70 karakter)",
  "thumbnail_baslik": "MAKS 15 karakter, BÜYÜK HARF, 1-2 kelime",
  "thumbnail_alt_baslik": "1-3 kelime: 'GERÇEK Mİ?', 'KEŞFEDİLDİ'",
  "thumbnail_prompt": "Thumbnail FLUX promptu - konuyla DİREKT ilgili, ancient period clothing, MrBeast YouTube thumbnail style, leave RIGHT THIRD empty for text. 16:9, NO TEXT",
  "muzik_mood": "epic / mysterious / calm / dramatic",
  "aciklama": "Video açıklaması, 200-300 kelime",
  "senaryo": "TAM 850-1150 kelimelik STORYTELLING senaryo. Yukarıdaki kurallara UY. Hook ile başla, hikaye anlat, SONUNDA abone kapanışını ekle ('Eğer bu videoyu beğendiyseniz, lütfen beğen butonuna basmayı ve kanalımıza abone olmayı unutmayın')",
  "sahneler": [
    {
      "metin": "Senaryonun bir bölümü, 40-50 kelime",
      "gorsel_prompt": "BU SAHNENİN SOMUT GÖRSEL ÖĞESİ. ASLA modern öğe. Mutlaka 'ancient' veya dönem adı. FLUX İngilizce prompt, cinematic photorealistic 16:9, period-accurate"
    }
    // TAM 20 sahne
  ],
  "ai_klip_prompts": ["3 AI video klip promptu (İngilizce, period-accurate, 16:9)"]
}

KRİTİK KURALLAR:
- sahneler: TAM 20 öğe
- Her görsel_prompt MUTLAKA "ancient" veya dönem adı içermeli
- Senaryonun SONUNDA abone iste cümlesi MUTLAKA olmalı
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
      
      // Geriye uyumluluk
      json.ai_gorsel_prompts = json.sahneler.map(s => s.gorsel_prompt);
      json.pexels_anahtar_kelimeler = [];
      
      // Fallback'ler
      if (!json.thumbnail_prompt) {
        json.thumbnail_prompt = `Hyperrealistic close-up dramatic face related to ${konu}, ancient period clothing, MrBeast YouTube thumbnail style, leave right third empty for text, 16:9, no text`;
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
      
      // Senaryoda abone cümlesi yoksa zorla ekle (güvence)
      const aboneCumlesi = "Eğer bu videoyu beğendiyseniz, lütfen beğen butonuna basmayı ve kanalımıza abone olmayı unutmayın.";
      if (!json.senaryo.toLowerCase().includes("abone")) {
        console.log("⚠️ Abone cümlesi senaryoda yok, manuel ekleniyor.");
        json.senaryo = json.senaryo.trim() + " " + aboneCumlesi + " Bir sonraki videoda görüşmek üzere, hoşçakalın!";
      }
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      console.log(`Thumbnail: "${json.thumbnail_baslik}" + "${json.thumbnail_alt_baslik}"`);
      console.log(`Müzik mood: ${json.muzik_mood}`);
      console.log(`${json.sahneler.length} sahne, senaryo ${json.senaryo.length} karakter`);
      console.log(`Abone cümlesi: ${json.senaryo.toLowerCase().includes("abone") ? "✓" : "✗"}`);
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
    
    await telegram(CHAT_ID, `🎬 *Yeni iş başlatıldı!*\n\n✅ *Konu:* ${konu}\n🆔 \`${JOB_ID}\`\n\n⏳ Gemini storytelling içerik üretiyor...`);
    
    const icerik = await icerikUret(konu);
    
    const safeTitle = konu.substring(0, 50).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, "");
    const klasorAdi = `${TARIH}-${safeTitle}`;
    
    console.log(`Drive klasörleri açılıyor: ${klasorAdi}`);
    const anaKlasor = await driveKlasorAc(klasorAdi);
    await driveKlasorAc("01-gorseller", anaKlasor.id);
    await driveKlasorAc("02-ses", anaKlasor.id);
    const klipKlasor = await driveKlasorAc("04-veo-klipleri-buraya", anaKlasor.id);
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
      ai_klip_prompts: icerik.ai_klip_prompts,
      pexels_anahtar_kelimeler: [],
      drive_folder_id: anaKlasor.id,
      klip_klasor_id: klipKlasor.id,
      muzik_mood: icerik.muzik_mood,
    });
    
    const klipPromptlari = icerik.ai_klip_prompts
      .map((p, i) => `🎥 *KLİP ${i + 1}:*\n\`${p}\``)
      .join("\n\n");
    
    await telegram(
      CHAT_ID,
      `📝 *İçerik hazır!*\n\n` +
      `📌 *Başlık:* ${icerik.baslik}\n` +
      `🎯 *Thumbnail:* ${icerik.thumbnail_baslik} | ${icerik.thumbnail_alt_baslik || ""}\n` +
      `🎵 *Müzik mood:* ${icerik.muzik_mood}\n\n` +
      `📂 [Drive klasörü](${anaKlasor.link})\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `🎬 *VEO STUDIO'DA 3 KLİP ÜRET:*\n\n${klipPromptlari}\n\n` +
      `_Klipleri "04-veo-klipleri-buraya" klasörüne yükle._\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `⏳ Diğer materyaller paralel üretiliyor...`
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
