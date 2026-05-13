/**
 * BİLGİ-ŞOK İçerik ve Görsel Üretim Scripti
 * Multi-account Cloudflare rotation (3 hesap destekli)
 * Hesap A şu an kotada, B+C ile çalışıyor.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
import axios from "axios";
import fs from "fs";

const {
  GEMINI_API_KEY,
  GEMINI_API_KEY_2,
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN_2,
  CLOUDFLARE_ACCOUNT_ID_2,
  CLOUDFLARE_API_TOKEN_3,
  CLOUDFLARE_ACCOUNT_ID_3,
  CLOUDFLARE_HESAP_A_KOTADA,
  GDRIVE_SERVICE_ACCOUNT_JSON,
  GSHEETS_SPREADSHEET_ID,
  GDRIVE_FOLDER_ID,
  TELEGRAM_BOT_TOKEN,
  CHAT_ID,
  TARIH,
  INDEX,
} = process.env;

// Cloudflare hesap listesi (rotation için)
const CF_ACCOUNTS = [];

// Hesap A — manuel olarak devre dışı bırakılabilir (CLOUDFLARE_HESAP_A_KOTADA=true ile)
const hesapAKotada = CLOUDFLARE_HESAP_A_KOTADA === "true";
if (CLOUDFLARE_API_TOKEN && CLOUDFLARE_ACCOUNT_ID && !hesapAKotada) {
  CF_ACCOUNTS.push({ token: CLOUDFLARE_API_TOKEN, accountId: CLOUDFLARE_ACCOUNT_ID, name: "Hesap-A" });
}
if (CLOUDFLARE_API_TOKEN_2 && CLOUDFLARE_ACCOUNT_ID_2) {
  CF_ACCOUNTS.push({ token: CLOUDFLARE_API_TOKEN_2, accountId: CLOUDFLARE_ACCOUNT_ID_2, name: "Hesap-B" });
}
if (CLOUDFLARE_API_TOKEN_3 && CLOUDFLARE_ACCOUNT_ID_3) {
  CF_ACCOUNTS.push({ token: CLOUDFLARE_API_TOKEN_3, accountId: CLOUDFLARE_ACCOUNT_ID_3, name: "Hesap-C" });
}

if (CF_ACCOUNTS.length === 0) {
  throw new Error("Hiç Cloudflare hesabı yapılandırılmamış!");
}

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
  
  console.log(`Toplam ${rows.length} satır okundu.`);
  
  const aranan = normalizeTarih(TARIH);
  
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
    throw new Error(`Geçersiz index ${idx}, ${matchingRows.length} konu var.`);
  }
  
  const selected = matchingRows[idx];
  console.log(`Seçilen konu: ${selected.konu}`);
  return selected;
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
  "aciklama": "Video açıklaması, 200-300 kelime",
  "senaryo": "Tam seslendirme metni, 800-1200 kelime",
  "ai_gorsel_prompts": ["20 adet detaylı görsel üretim promptu (İngilizce, cinematic, photorealistic)"],
  "ai_klip_prompts": ["3 adet AI video klip promptu (İngilizce, Veo Studio için)"],
  "pexels_anahtar_kelimeler": ["4 adet Pexels stok video anahtar kelimesi (İngilizce)"]
}

ai_gorsel_prompts: TAM 20 öğe
ai_klip_prompts: TAM 3 öğe
pexels_anahtar_kelimeler: TAM 4 öğe`;

  const maxRetries = 5;
  const modeller = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const modelAdi = modeller[Math.min(attempt - 1, modeller.length - 1)];
    const aktifKey = geminiKeys[(attempt - 1) % geminiKeys.length];
    const keyAdi = geminiKeys.length > 1 ? `Key-${(attempt - 1) % geminiKeys.length + 1}` : "Key-1";
    
    try {
      console.log(`Gemini denemesi ${attempt}/${maxRetries} - Model: ${modelAdi} - ${keyAdi}`);
      
      const genAI = new GoogleGenerativeAI(aktifKey);
      const model = genAI.getGenerativeModel({
        model: modelAdi,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      });
      
      const result = await model.generateContent(prompt);
      let text = result.response.text();
      text = text.trim();
      
      const json = JSON.parse(text);
      
      if (!json.ai_gorsel_prompts || json.ai_gorsel_prompts.length < 20) {
        throw new Error(`Gemini ${json.ai_gorsel_prompts?.length || 0} görsel promptu verdi, 20 gerekli.`);
      }
      
      if (json.ai_gorsel_prompts.length > 20) {
        console.log(`Gemini ${json.ai_gorsel_prompts.length} prompt verdi, ilk 20 alınıyor.`);
        json.ai_gorsel_prompts = json.ai_gorsel_prompts.slice(0, 20);
      }
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      return json;
      
    } catch (error) {
      const msg = error.message || "";
      const is503 = msg.includes("503") || msg.includes("Service Unavailable") || msg.includes("overloaded");
      const is429 = msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
      
      if (attempt === maxRetries) {
        console.error(`Gemini ${maxRetries} denemede başarısız:`, msg);
        throw error;
      }
      
      if (is503 || is429) {
        const bekle = attempt * 30000;
        console.log(`Gemini yoğun (${is503 ? '503' : '429'}). ${bekle/1000}s bekleyip tekrar denenecek...`);
        await delay(bekle);
      } else {
        console.error(`Gemini hatası (denenecek): ${msg}`);
        await delay(10000);
      }
    }
  }
  
  throw new Error("Gemini retry mantığı beklenmedik şekilde bitti");
}

async function gorselUretCloudflare(prompt, index, account) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  
  const response = await axios({
    method: "POST",
    url: url,
    headers: {
      Authorization: `Bearer ${account.token}`,
      "Content-Type": "application/json",
    },
    data: {
      prompt: prompt,
      steps: 4,
    },
    timeout: 120000,
    validateStatus: (status) => status >= 200 && status < 300,
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
  const ISTEKLER_ARASI_MS = 7000;
  const MAX_RETRY_PER_ACCOUNT = 3;
  const RETRY_BEKLEME_MS = [10000, 30000, 60000];
  
  console.log(`${prompts.length} görsel üretilecek (${CF_ACCOUNTS.length} hesap: ${CF_ACCOUNTS.map(a => a.name).join(", ")})...`);
  
  const sonuclar = [];
  const hatalar = [];
  
  // Her hesabın çalışma durumu
  const hesapKotaDolu = new Array(CF_ACCOUNTS.length).fill(false);
  
  // Görsel başına öncelikli hesap: 20 görsel / N hesap = her hesap eşit pay
  const yariSinir = Math.ceil(prompts.length / CF_ACCOUNTS.length);
  
  for (let i = 0; i < prompts.length; i++) {
    let basarili = false;
    let sonHata = "";
    
    let oncelikliHesap = Math.min(Math.floor(i / yariSinir), CF_ACCOUNTS.length - 1);
    
    // Hesap denemesi: önce öncelikli, sonra diğerleri (fallback)
    const hesapSirasi = [oncelikliHesap];
    for (let j = 0; j < CF_ACCOUNTS.length; j++) {
      if (j !== oncelikliHesap) hesapSirasi.push(j);
    }
    
    for (const hesapIdx of hesapSirasi) {
      if (hesapKotaDolu[hesapIdx]) {
        continue;
      }
      
      const account = CF_ACCOUNTS[hesapIdx];
      
      for (let retry = 1; retry <= MAX_RETRY_PER_ACCOUNT; retry++) {
        try {
          console.log(`Görsel ${i + 1}/${prompts.length} (${account.name}, deneme ${retry}/${MAX_RETRY_PER_ACCOUNT})...`);
          const gorsel = await gorselUretCloudflare(prompts[i], i, account);
          sonuclar.push({ ...gorsel, index: i });
          console.log(`  ✓ Görsel ${i + 1} OK (${(gorsel.size/1024).toFixed(0)}KB) [${account.name}]`);
          basarili = true;
          break;
        } catch (e) {
          const status = e.response?.status;
          const msg = e.message || "";
          sonHata = `${status || "?"}: ${msg}`;
          
          const is429 = status === 429 || msg.includes("429");
          const is5xx = status >= 500 && status < 600;
          const retryEdilebilir = is429 || is5xx || msg.includes("timeout") || msg.includes("ECONNRESET");
          
          if (is429 && retry === MAX_RETRY_PER_ACCOUNT) {
            console.log(`  ⚠ ${account.name} sürekli 429, kotası dolu kabul ediliyor.`);
            hesapKotaDolu[hesapIdx] = true;
            break;
          }
          
          if (retry < MAX_RETRY_PER_ACCOUNT && retryEdilebilir) {
            const bekle = RETRY_BEKLEME_MS[retry - 1];
            console.log(`  ⚠ Görsel ${i + 1} hata (${sonHata}). ${bekle/1000}s bekleniyor [${account.name}]...`);
            await delay(bekle);
          } else if (retry < MAX_RETRY_PER_ACCOUNT) {
            console.error(`  ✗ Görsel ${i + 1} retry edilemez hata: ${sonHata}`);
            break;
          } else {
            console.error(`  ✗ Görsel ${i + 1} ${account.name}'te başarısız: ${sonHata}`);
          }
        }
      }
      
      if (basarili) break;
    }
    
    if (!basarili) hatalar.push({ index: i, hata: sonHata });
    
    if (hesapKotaDolu.every(d => d)) {
      console.error("\n⛔ TÜM CLOUDFLARE HESAPLARI KOTADA. Üretim durduruldu.");
      break;
    }
    
    if (i < prompts.length - 1) {
      await delay(ISTEKLER_ARASI_MS);
    }
  }
  
  console.log(`\n📊 Sonuç: ${sonuclar.length} başarılı, ${hatalar.length} başarısız.`);
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
    console.log(`🔧 ${CF_ACCOUNTS.length} Cloudflare hesabı aktif: ${CF_ACCOUNTS.map(a => a.name).join(", ")}`);
    if (hesapAKotada) {
      console.log(`ℹ Hesap-A manuel olarak devre dışı (CLOUDFLARE_HESAP_A_KOTADA=true).`);
    }
    
    const { konu } = await konuyuAl();
    
    await telegram(`✅ *Konu:* ${konu}\n\n⏳ Gemini ile içerik üretiliyor...`);
    
    const icerik = await icerikUret(konu);
    
    await telegram(
      `📝 *İçerik hazır*\n\n📌 *Başlık:* ${icerik.baslik}\n\n⏳ 20 görsel üretiliyor (${CF_ACCOUNTS.length} hesap, ~3-4 dakika)...`
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
