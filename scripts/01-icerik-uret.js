/**
 * 01 - İçerik Üretimi v3
 * - Storytelling odaklı senaryo (hook + drama + akış)
 * - Görseller senaryo cümleleriyle eşleşir (her bölüme özel)
 * - Pexels kaldırıldı
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
- "Hititler MÖ 2. binyılda Ortadoğu'da kurulmuş bir medeniyettir" gibi kuru cümleler YOK
- Sadece tarih, tarih, tarih sıralama YOK
- "olmuştur, edilmiştir, kullanılmıştır" gibi formal dil YOK

✅ YAP:
- DRAMATİK HOOK ile başla: bir sahne, bir sır, bir soru, "Tahmin et ne oldu?"
- HİKAYE anlat: karakterleri, sahneleri, çatışmaları olan
- SORU VE CEVAP yapısı kullan: "Peki ya...? Cevap şaşırtıcı..."
- SES TONUNDA YAZILIYORMUŞ GİBİ: "Hayal et", "Bir an düşün", "Şimdi şunu söylüyorum...", "Tam burada", "İşte tam o anda"
- VURGU KELİMELERİ: "İnanılmaz", "Şoke edici", "Şaşırtıcı", "Sırlarla dolu"
- SES BÖLÜMLENMESİ: Kısa cümleler, virgül ve nokta ile nefes verme
- MERAK CÜMLELERİ ARASI: "Ve burada işler ilginçleşiyor...", "Ama bu yeterli değildi..."
- KAPANIŞ: Düşündürücü, soru bırakan, abone olmaya yönlendiren

ÖRNEK BAŞLANGIÇ (Sadece tarz örneği, kopyalama):
"Hayal et. MÖ 1.700. Anadolu'nun ortasında, sıradan görünen bir köy. Kimse farkında değil ama, bu insanlar tarihi değiştirecek. Çünkü onlar... demirin sırrını çözmek üzereler. Bu, sıradan bir hikaye değil. Bu, bir imparatorluğun nasıl doğduğunun hikayesi. Ve bugün anlatacaklarım, seni şaşırtacak."

═══════════════════════════════════════════════════
GÖRSEL EŞLEŞTİRME - EN ÖNEMLİSİ!
═══════════════════════════════════════════════════

Senaryoyu YAZDIKTAN SONRA, içeriği 20 SAHNEYE böl. Her sahne ~40-50 kelimelik bir bölüm olmalı (senaryo akışını koru).

Her sahne için, O SAHNENİN TAM İÇERİĞİNİ GÖSTEREN bir FLUX görsel promptu üret.

ÖRNEK:
Senaryo bölümü: "Hititler demir işlemeyi öğrendiklerinde, bunu sadece silah yapmak için kullanmadılar. Onlar, demiri bir ekonomik avantaja çevirdiler."
Görsel prompt: "Hittite blacksmith forging iron sword in dark workshop, glowing orange forge fire, sparks flying, dramatic chiaroscuro lighting, cinematic 16:9, photorealistic, ancient Anatolian setting"

KRİTİK: Görsel prompt o sahnedeki SOMUT GÖRSEL ÖGEYI göstermeli (savaşçı dövüyor, kral konuşuyor, ordu yürüyor, harabe görüntüsü, vb.)

═══════════════════════════════════════════════════
KONU: ${konu}
═══════════════════════════════════════════════════

GERÇEK BİLGİ ZORUNLULUĞU:
- SADECE doğrulanmış tarihi ve arkeolojik bilgi kullan
- UYDURMA YOK ama BU BİLGİLERİ HİKAYE GİBİ ANLAT

Şu JSON yapısında çıktı üret:

{
  "konu": "${konu}",
  "baslik": "YouTube videosu için MERAK UYANDIRICI başlık (60-70 karakter, clickbait yakın olabilir)",
  "thumbnail_baslik": "Thumbnail KISA başlık (MAKS 15 karakter, BÜYÜK HARF, 1-2 kelime). Örnek: 'HİTİTLER', 'PİRAMİT SIRRI', 'GİZLİ GERÇEK'",
  "thumbnail_alt_baslik": "Alt başlık 1-3 kelime: 'GERÇEK Mİ?', 'KEŞFEDİLDİ', 'AÇIKLANDI'",
  "thumbnail_prompt": "Thumbnail FLUX promptu - MUTLAKA konuyla doğrudan ilgili (Hitit konusunda Hitit savaşçısı/Anadolu kralı). Hyperrealistic close-up face shot, dramatic shocked/intense expression, cinematic lighting, MrBeast YouTube thumbnail style, leave RIGHT THIRD empty for text. 16:9, NO TEXT IN IMAGE",
  "aciklama": "Video açıklaması, 200-300 kelime, ilk satır hook olsun",
  "senaryo": "TAM 800-1100 kelimelik STORYTELLING senaryo. Yukarıdaki kurallara UY. Hook ile başla, hikaye anlat, soru sor, drama kur, kapanışla bağla. Cümleler arası nokta/virgüllere DİKKAT (TTS için).",
  "sahneler": [
    {
      "metin": "Senaryonun 1. bölümünden ~40-50 kelimelik bir parça (senaryodaki cümlelerle birebir eşleşir)",
      "gorsel_prompt": "Bu sahnenin SOMUT görsel öğesi - FLUX prompt İngilizce, cinematic, photorealistic, 16:9 widescreen"
    }
    // 20 sahne tam olarak
  ],
  "ai_klip_prompts": ["3 adet AI video klip promptu (İngilizce, Veo Studio için, 16:9)"]
}

KRİTİK KURALLAR:
- sahneler: TAM 20 öğe
- Her sahnenin metni senaryonun bir bölümüne karşılık gelmeli
- Her sahnenin görsel_prompt'u O sahnedeki SOMUT görsel öğeyi göstermeli (alakasız genel kavram değil!)
- ai_klip_prompts: TAM 3 öğe
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
          temperature: 0.8, // Daha yaratıcı
          maxOutputTokens: 16384, // Daha uzun çıktı için
        },
      });
      
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const json = JSON.parse(text);
      
      // Validasyon
      if (!json.sahneler || json.sahneler.length < 20) {
        throw new Error(`Gemini ${json.sahneler?.length || 0} sahne verdi, 20 gerekli.`);
      }
      
      if (json.sahneler.length > 20) {
        json.sahneler = json.sahneler.slice(0, 20);
      }
      
      // Eski format uyumluluğu için ai_gorsel_prompts ve pexels'i de oluştur
      json.ai_gorsel_prompts = json.sahneler.map(s => s.gorsel_prompt);
      json.pexels_anahtar_kelimeler = []; // Boş - pexels kullanmayacağız
      
      // Fallback'ler
      if (!json.thumbnail_prompt) {
        json.thumbnail_prompt = `Hyperrealistic close-up dramatic shocked face shot related to ${konu}, vibrant cinematic lighting, high contrast, MrBeast YouTube thumbnail style, leave right third empty for text, 16:9 widescreen, no text`;
      }
      if (!json.thumbnail_baslik) json.thumbnail_baslik = "GİZEM";
      if (!json.thumbnail_alt_baslik) json.thumbnail_alt_baslik = "AÇIKLANDI";
      
      if (json.thumbnail_baslik.length > 18) {
        json.thumbnail_baslik = json.thumbnail_baslik.substring(0, 18).trim();
      }
      if (json.thumbnail_alt_baslik.length > 20) {
        json.thumbnail_alt_baslik = json.thumbnail_alt_baslik.substring(0, 20).trim();
      }
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      console.log(`Thumbnail: "${json.thumbnail_baslik}" + "${json.thumbnail_alt_baslik}"`);
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
      pexels_anahtar_kelimeler: [], // Boş - pexels'i tamamen kaldırdık
      drive_folder_id: anaKlasor.id,
      klip_klasor_id: klipKlasor.id,
    });
    
    const klipPromptlari = icerik.ai_klip_prompts
      .map((p, i) => `🎥 *KLİP ${i + 1}:*\n\`${p}\``)
      .join("\n\n");
    
    await telegram(
      CHAT_ID,
      `📝 *İçerik hazır!*\n\n` +
      `📌 *Başlık:* ${icerik.baslik}\n` +
      `🎯 *Thumbnail:* ${icerik.thumbnail_baslik} | ${icerik.thumbnail_alt_baslik || ""}\n\n` +
      `📂 [Drive klasörü](${anaKlasor.link})\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `🎬 *VEO STUDIO'DA 3 KLİP ÜRET:*\n\n${klipPromptlari}\n\n` +
      `_Klipleri "04-veo-klipleri-buraya" klasörüne yükle._\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `⏳ Diğer materyaller (görsel, ses, thumbnail, altyazı) paralel üretiliyor...`
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
