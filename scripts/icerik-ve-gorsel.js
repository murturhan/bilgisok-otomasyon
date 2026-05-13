/**
 * BİLGİ-ŞOK İçerik ve Görsel Üretim Scripti
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
import axios from "axios";
import fs from "fs";

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

function normalizeTarih(t) {
  if (!t) return "";
  return String(t).trim().toLowerCase();
}

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

async function konuyuAl() {
  console.log(`Konu alınıyor: tarih=${TARIH}, index=${INDEX}`);
  
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: "konu_havuzu!A:C",
  });
  
  const rows = res.data.values || [];
  
  console.log(`Toplam ${rows.length} satır okundu (başlık dahil).`);
  console.log("İlk 3 satır:", JSON.stringify(rows.slice(0, 3)));
  
  const aranan = normalizeTarih(TARIH);
  console.log(`Aranan tarih (normalize): "${aranan}"`);
  
  const matchingRows = [];
  for (let i = 1; i < rows.length; i++) {
    const satirTarih = normalizeTarih(rows[i][1]);
    if (satirTarih === aranan) {
      matchingRows.push({ rowIndex: i + 1, konu: rows[i][0] });
    }
  }
  
  console.log(`Eşleşen satır sayısı: ${matchingRows.length}`);
  
  const idx = parseInt(INDEX);
  if (idx < 0 || idx >= matchingRows.length) {
    throw new Error(`Geçersiz index ${idx}, ${matchingRows.length} konu var. Aranan tarih: "${aranan}".`);
  }
  
  const selected = matchingRows[idx];
  console.log(`Seçilen konu: ${selected.konu}`);
  return selected;
}

async function icerikUret(konu) {
  console.log("Gemini içerik üretiyor...");
  
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });
  
  const prompt = `Sen, YouTube'da antik tarih ve gizemler üzerine Türkçe içerik üreten bir uzmansın.

KONU: "${konu}"

GERÇEK BİLGİ ZORUNLULUĞU:
- SADECE doğrulanmış tarihi ve arkeolojik bilgi kullan
- UYDURMA YOK

Aşağıdaki JSON yapısında çıktı üret:

{
  "konu": "${konu}",
  "baslik": "YouTube videosu için merak uyandırıcı başlık (60-70 karakter)",
  "aciklama": "Video açıklaması, 200-300 kelime",
  "senaryo": "Tam seslendirme metni, 800-1200 kelime",
  "ai_gorsel_prompts": ["20 adet detaylı görsel üretim promptu (İngilizce, cinematic, photorealistic)"],
  "ai_klip_prompts": ["3 adet AI video klip promptu (İngilizce, Veo Studio için)"],
  "pexels_anahtar_kelimeler": ["4 adet Pexels stok video anahtar kelimesi (İngilizce)"]
}

ai_gorsel_prompts: TAM 20 öğe
ai_klip_prompts: TAM 3 öğe
pexels_anahtar_kelimeler: TAM 4 öğe`;

  const result = await model.generateContent(prompt);
  let text = result.response.text();
  text = text.trim();
  
  const json = JSON.parse(text);
  
  if (!json.ai_gorsel_prompts || json.ai_gorsel_prompts.length < 20) {
    throw new Error(`Gemini 20 görsel promptu vermedi, ${json.ai_gorsel_prompts?.length || 0} verdi.`);
  }
  
  console.log(`İçerik üretildi: ${json.baslik}`);
  return json;
}

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
      steps: 4,
    },
    timeout: 120000,
  });
  
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
      console.log(`Görsel ${i + 1}/${prompts.length}...`);
      const gorsel = await gorselUret(prompts[i], i);
      sonuclar.push({ ...gorsel, index: i });
      await delay(500);
    } catch (e) {
      console.error(`Görsel ${i + 1} hatası: ${e.message}`);
      hatalar.push({ index: i, error: e.message });
    }
  }
  
  console.log(`${sonuclar.length} görsel üretildi, ${hatalar.length} hata.`);
  return { sonuclar, hatalar };
}

async function driveYukle(gorseller, konuKlasoru) {
  console.log("Drive'a yükleniyor...");
  
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });
  
  const folderRes = await drive.files.create({
    requestBody: {
      name: konuKlasoru,
      mimeType: "application/vnd.google-apps.folder",
      parents: [GDRIVE_FOLDER_ID],
    },
    fields: "id, name, webViewLink",
  });
  
  const altKlasorId = folderRes.data.id;
  console.log(`Alt klasör: ${konuKlasoru} (${altKlasorId})`);
  
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
      console.error(`Drive yükleme hatası: ${e.message}`);
    }
  }
  
  console.log(`${yuklenenler.length} görsel Drive'a yüklendi.`);
  return { yuklenenler, altKlasorId, klasorLink: folderRes.data.webViewLink };
}

async function sheetKaydet(konu, icerik) {
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

async function main() {
  try {
    const { konu } = await konuyuAl();
    
    await telegram(`✅ *Konu:* ${konu}\n\n⏳ Gemini ile içerik üretiliyor...`);
    
    const icerik = await icerikUret(konu);
    
    await telegram(
      `📝 *İçerik hazır*\n\n📌 *Başlık:* ${icerik.baslik}\n\n⏳ 20 görsel üretiliyor (Cloudflare FLUX.1)...`
    );
    
    const { sonuclar: gorseller } = await tumGorselleriUret(icerik.ai_gorsel_prompts);
    
    if (gorseller.length === 0) {
      throw new Error("Hiç görsel üretilemedi");
    }
    
    const konuKlasoru = `${TARIH}-${konu.substring(0, 50).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, "")}`;
    const { yuklenenler, klasorLink } = await driveYukle(gorseller, konuKlasoru);
    
    await sheetKaydet(konu, icerik);
    
    const klipPromptlari = icerik.ai_klip_prompts
      .map((p, i) => `🎥 *KLİP ${i + 1}:*\n${p}`)
      .join("\n\n");
    
    await telegram(
      `🎉 *${yuklenenler.length}/20 görsel hazır!*\n\n` +
      `📂 *Drive klasörü:* [Aç](${klasorLink})\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `🎬 *VEO STUDIO'DA 3 KLİP ÜRET:*\n\n${klipPromptlari}\n\n` +
      `Klipleri "bilgisok-klipler" klasörüne yükle.`
    );
    
    console.log("\n✅ TÜM İŞLEM BAŞARILI");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    
    await telegram(`❌ *Hata:* ${error.message.substring(0, 500)}`);
    
    process.exit(1);
  }
}

main();
