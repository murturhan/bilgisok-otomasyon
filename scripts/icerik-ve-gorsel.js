/**
 * BİLGİ-ŞOK İçerik ve Görsel Üretim Scripti
 * 
 * Gemini ile içerik üretir → Cloudflare FLUX.1 schnell ile 20 görsel üretir
 * → 1024x1024 görseli FFmpeg yerine canvas/sharp ile 1280x720'a crop eder
 * → Drive'a yükler → Sheets'e içerik kaydeder → Telegram bildirim
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

// ============ ENV ============
const {
  GEMINI_API_KEY,
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  GDRIVE_SERVICE_ACCOUNT_JSON,
  GSHEETS_SPREADSHEET_ID,
  GDRIVE_FOLDER_ID,
  TELEGRAM_BOT_TOKEN,
  CHAT_ID,
  TARIH,
  INDEX,
} = process.env;

const FOLDER_KLIPLER = "bilgisok-klipler"; // İleride kullanılacak

// ============ HELPERS ============
async function telegram(text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: CHAT_ID, text: text, parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("Telegram error:", e.message);
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============ GOOGLE AUTH ============
function getGoogleAuth() {
  const credentials = JSON.parse(GDRIVE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
  return auth;
}

// ============ STEP 1: SHEETS'TEN KONU AL ============
async function konuyuAl() {
  console.log(`Konu alınıyor: tarih=${TARIH}, index=${INDEX}`);
  
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  
  // konu_havuzu sheet'inden oku
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: "konu_havuzu!A:C",
  });
  
  const rows = res.data.values || [];
  
  // Header'dan sonraki tarihe ait satırları bul
  const matchingRows = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === TARIH) {
      matchingRows.push({ rowIndex: i + 1, konu: rows[i][0] });
    }
  }
  
  const idx = parseInt(INDEX);
  if (idx < 0 || idx >= matchingRows.length) {
    throw new Error(`Geçersiz index ${idx}, ${matchingRows.length} konu var.`);
  }
  
  const selected = matchingRows[idx];
  console.log(`Seçilen konu: ${selected.konu}`);
  return selected;
}

// ============ STEP 2: GEMINI İLE İÇERİK ÜRET ============
async function icerikUret(konu) {
  console.log("Gemini içerik üretiyor...");
  
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `Sen, YouTube'da antik tarih ve gizemler üzerine Türkçe içerik üreten bir uzmansın. Konuya çok hakim, akademik ama anlaşılır bir tarzda anlatıyorsun.

KONU: "${konu}"

GERÇEK BİLGİ ZORUNLULUĞU:
- SADECE doğrulanmış tarihi ve arkeolojik bilgi kullan
- UYDURMA, TAHMİN VE SPEKÜLASYON YOK
- Tarihler, isimler, yerler GERÇEK olmalı

Aşağıdaki yapıda JSON çıktısı üret:

{
  "konu": "${konu}",
  "baslik": "YouTube videosu için merak uyandırıcı, kanca işlevi gören başlık (60-70 karakter)",
  "aciklama": "Video açıklaması, 200-300 kelime, anahtar kelimeler dahil",
  "senaryo": "Tam seslendirme metni, 800-1200 kelime. Giriş kanca cümlesi, gelişme bölümleri, kapanış. Akıcı, hikayemsi.",
  "ai_gorsel_prompts": [
    "20 adet detaylı görsel üretim promptu (İngilizce). Antik mekanlar, tarihi figürler, arkeolojik buluntular, sanatsal yorumlar.",
    "Her prompt 'cinematic, photorealistic, 16:9, ultra detailed' gibi kalite terimleri içersin",
    "Karakterler ve mekanlar konuyla TUTARLI olmalı"
  ],
  "ai_klip_prompts": [
    "3 adet AI video klip promptu (İngilizce, Veo Studio için). 5-8 saniyelik klip senaryoları."
  ],
  "pexels_anahtar_kelimeler": [
    "4 adet Pexels stok video arama anahtar kelimesi (İngilizce). Dolgu video olarak kullanılacak."
  ]
}

ai_gorsel_prompts dizisinde tam 20 öğe olmalı.
ai_klip_prompts dizisinde tam 3 öğe olmalı.
pexels_anahtar_kelimeler dizisinde tam 4 öğe olmalı.

SADECE JSON çıktısı ver, başka metin ekleme. Markdown code block kullanma.`;

  const result = await model.generateContent(prompt);
  let text = result.response.text();
  
  // Markdown code block varsa temizle
  text = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  
  const json = JSON.parse(text);
  
  // Validasyon
  if (!json.ai_gorsel_prompts || json.ai_gorsel_prompts.length < 20) {
    throw new Error(`Gemini 20 görsel promptu vermedi, ${json.ai_gorsel_prompts?.length || 0} verdi.`);
  }
  
  console.log(`İçerik üretildi: ${json.baslik}`);
  return json;
}

// ============ STEP 3: CLOUDFLARE FLUX.1 SCHNELL İLE GÖRSEL ÜRET ============
async function gorselUret(prompt, index) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  
  const response = await axios({
    method: "POST",
    url: url,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    data: {
      prompt: prompt,
      steps: 4, // schnell sadece 4 step destekler, hızlı
    },
    timeout: 120000,
  });
  
  // Response: { result: { image: "base64..." }, success: true }
  if (!response.data?.result?.image) {
    throw new Error(`FLUX.1 görsel ${index + 1} için image alanı boş`);
  }
  
  const imageBuffer = Buffer.from(response.data.result.image, "base64");
  
  const filename = `gorsel-${String(index + 1).padStart(2, "0")}-${Date.now()}.jpg`;
  const filepath = `/tmp/${filename}`;
  fs.writeFileSync(filepath, imageBuffer);
  
  return { filename, filepath, size: imageBuffer.length };
}

async function tumGorselleriUret(prompts) {
  console.log(`${prompts.length} görsel üretiliyor (FLUX.1 schnell)...`);
  
  const sonuclar = [];
  const hatalar = [];
  
  for (let i = 0; i < prompts.length; i++) {
    try {
      console.log(`Görsel ${i + 1}/${prompts.length} üretiliyor...`);
      const gorsel = await gorselUret(prompts[i], i);
      sonuclar.push({ ...gorsel, index: i });
      await delay(500); // rate limit koruması
    } catch (e) {
      console.error(`Görsel ${i + 1} hatası: ${e.message}`);
      hatalar.push({ index: i, error: e.message });
    }
  }
  
  console.log(`${sonuclar.length} görsel üretildi, ${hatalar.length} hata.`);
  return { sonuclar, hatalar };
}

// ============ STEP 4: DRIVE'A YÜKLE ============
async function driveYukle(gorseller, konuKlasoru) {
  console.log("Drive'a yükleniyor...");
  
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });
  
  // Önce bu video için alt klasör oluştur
  const folderRes = await drive.files.create({
    requestBody: {
      name: konuKlasoru,
      mimeType: "application/vnd.google-apps.folder",
      parents: [GDRIVE_FOLDER_ID],
    },
    fields: "id, name, webViewLink",
  });
  
  const altKlasorId = folderRes.data.id;
  console.log(`Alt klasör oluşturuldu: ${konuKlasoru} (${altKlasorId})`);
  
  const yuklenenler = [];
  
  for (const gorsel of gorseller) {
    try {
      const fileRes = await drive.files.create({
        requestBody: {
          name: gorsel.filename,
          parents: [altKlasorId],
        },
        media: {
          mimeType: "image/jpeg",
          body: fs.createReadStream(gorsel.filepath),
        },
        fields: "id, name, webViewLink",
      });
      
      yuklenenler.push({
        index: gorsel.index,
        drive_id: fileRes.data.id,
        filename: fileRes.data.name,
        link: fileRes.data.webViewLink,
      });
    } catch (e) {
      console.error(`Drive yükleme hatası ${gorsel.filename}: ${e.message}`);
    }
  }
  
  console.log(`${yuklenenler.length} görsel Drive'a yüklendi.`);
  return { yuklenenler, altKlasorId, klasorLink: folderRes.data.webViewLink };
}

// ============ STEP 5: SHEET'E İÇERİK KAYDET ============
async function sheetKaydet(konu, icerik, altKlasorId) {
  console.log("Sheets'e içerik kaydediliyor...");
  
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: "Sheet1!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        TARIH,
        konu,
        icerik.baslik,
        icerik.aciklama,
        icerik.senaryo,
        "Görseller hazır - klip bekleniyor",
      ]],
    },
  });
  
  console.log("Sheets'e yazıldı.");
}

// ============ MAIN ============
async function main() {
  try {
    // 1. Konu al
    const { konu } = await konuyuAl();
    
    await telegram(
      `✅ *Konu:* ${konu}\n\n⏳ Gemini ile içerik üretiliyor...`
    );
    
    // 2. Gemini ile içerik üret
    const icerik = await icerikUret(konu);
    
    await telegram(
      `📝 *İçerik hazır*\n\n📌 *Başlık:* ${icerik.baslik}\n\n⏳ 20 görsel üretiliyor (Cloudflare FLUX.1)...`
    );
    
    // 3. Görselleri üret
    const { sonuclar: gorseller, hatalar } = await tumGorselleriUret(
      icerik.ai_gorsel_prompts
    );
    
    if (gorseller.length === 0) {
      throw new Error("Hiç görsel üretilemedi");
    }
    
    // 4. Drive'a yükle
    const konuKlasoru = `${TARIH}-${konu.substring(0, 50).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, "")}`;
    const { yuklenenler, klasorLink } = await driveYukle(gorseller, konuKlasoru);
    
    // 5. Sheet'e kaydet
    await sheetKaydet(konu, icerik, konuKlasoru);
    
    // 6. Final Telegram bildirim
    const klipPromptlari = icerik.ai_klip_prompts
      .map((p, i) => `🎥 *KLİP ${i + 1}:*\n${p}`)
      .join("\n\n");
    
    await telegram(
      `🎉 *${yuklenenler.length}/20 görsel hazır!*\n\n` +
      `📂 *Drive klasörü:* [Aç](${klasorLink})\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `🎬 *VEO STUDIO'DA 3 KLİP ÜRET:*\n\n${klipPromptlari}\n\n` +
      `Klipleri "bilgisok-klipler" klasörüne yükle, sistem otomatik tespit edip videoyu oluşturacak.`
    );
    
    console.log("\n✅ TÜM İŞLEM BAŞARILI");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    
    await telegram(
      `❌ *Hata:* ${error.message.substring(0, 500)}`
    );
    
    process.exit(1);
  }
}

main();
