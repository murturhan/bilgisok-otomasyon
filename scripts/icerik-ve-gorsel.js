/**
 * BİLGİ-ŞOK İçerik ve Görsel Üretim Scripti
 * - Cloudflare: 3 hesap rotation (FLUX görseller)
 * - Drive: OAuth user delegation (kullanıcının kendi quotası)
 * - Sheets: Service Account
 * - Görsel boyutu: 1280x720 (16:9 YouTube)
 * - Seslendirme: Edge TTS (tr-TR-AhmetNeural)
 * - Stok video: Pexels API
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
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
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN,
  GSHEETS_SPREADSHEET_ID,
  GDRIVE_FOLDER_ID,
  PEXELS_API_KEY,
  TELEGRAM_BOT_TOKEN,
  CHAT_ID,
  TARIH,
  INDEX,
} = process.env;

const CF_ACCOUNTS = [];
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

function getServiceAccountAuth() {
  const credentials = JSON.parse(GDRIVE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN,
  });
  return oauth2Client;
}

async function konuyuAl() {
  console.log(`Konu alınıyor: tarih=${TARIH}, index=${INDEX}`);
  
  const auth = getServiceAccountAuth();
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
  "senaryo": "Tam seslendirme metni, 800-1200 kelime. Doğal akıcı Türkçe. Cümleler arası nokta ve virgüllere dikkat et (TTS için önemli). Soru, ünlem, vurgu işaretlerini doğru kullan.",
  "ai_gorsel_prompts": ["20 adet detaylı görsel üretim promptu (İngilizce, cinematic, photorealistic, 16:9 widescreen composition, wide cinematic shot)"],
  "ai_klip_prompts": ["3 adet AI video klip promptu (İngilizce, Veo Studio için, 16:9)"],
  "pexels_anahtar_kelimeler": ["4 adet Pexels stok video anahtar kelimesi (İngilizce, tek/iki kelimelik, basit, örn: 'ancient ruins', 'desert sunset', 'old map', 'historical artifacts')"]
}

ai_gorsel_prompts: TAM 20 öğe, her birinde "wide cinematic shot" veya benzeri 16:9 kompozisyon ipucu olsun
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
      width: 1280,
      height: 720,
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
  
  console.log(`${prompts.length} görsel üretilecek 1280x720 (${CF_ACCOUNTS.length} hesap: ${CF_ACCOUNTS.map(a => a.name).join(", ")})...`);
  
  const sonuclar = [];
  const hatalar = [];
  
  const hesapKotaDolu = new Array(CF_ACCOUNTS.length).fill(false);
  const yariSinir = Math.ceil(prompts.length / CF_ACCOUNTS.length);
  
  for (let i = 0; i < prompts.length; i++) {
    let basarili = false;
    let sonHata = "";
    
    let oncelikliHesap = Math.min(Math.floor(i / yariSinir), CF_ACCOUNTS.length - 1);
    
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
  
  console.log(`\n📊 Görsel sonucu: ${sonuclar.length} başarılı, ${hatalar.length} başarısız.`);
  return { sonuclar, hatalar };
}

// ─── EDGE TTS: Seslendirme ─────────────────────────────────────────
async function seslendirmeUret(senaryo) {
  console.log(`Seslendirme üretiliyor (Edge TTS, ${senaryo.length} karakter)...`);
  
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    "tr-TR-AhmetNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
  );
  
  const filename = `seslendirme-${Date.now()}.mp3`;
  const filepath = `/tmp/${filename}`;
  
  // Stream'i dosyaya yaz
  const { audioStream } = await tts.toStream(senaryo);
  const writeStream = fs.createWriteStream(filepath);
  
  return new Promise((resolve, reject) => {
    audioStream.on("data", (chunk) => writeStream.write(chunk));
    audioStream.on("end", () => {
      writeStream.end();
      writeStream.on("finish", () => {
        const stats = fs.statSync(filepath);
        console.log(`  ✓ Seslendirme OK (${(stats.size / 1024).toFixed(0)}KB)`);
        resolve({ filename, filepath, size: stats.size });
      });
    });
    audioStream.on("error", (err) => {
      console.error("TTS audio stream error:", err);
      reject(err);
    });
    
    // Timeout (90 saniye)
    setTimeout(() => {
      reject(new Error("Edge TTS timeout (90s)"));
    }, 90000);
  });
}

// ─── PEXELS: Stok Video İndirme ────────────────────────────────────
async function pexelsVideoAra(query) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape&size=medium`;
  
  const response = await axios.get(url, {
    headers: { Authorization: PEXELS_API_KEY },
    timeout: 30000,
  });
  
  const videos = response.data.videos || [];
  if (videos.length === 0) return null;
  
  // İlk video, HD veya SD dosyasını seç
  const video = videos[0];
  const videoFile = video.video_files.find((f) => f.quality === "hd" && f.width <= 1920)
    || video.video_files.find((f) => f.quality === "sd")
    || video.video_files[0];
  
  return {
    url: videoFile.link,
    width: videoFile.width,
    height: videoFile.height,
    duration: video.duration,
    pexels_id: video.id,
  };
}

async function pexelsVideoIndir(videoBilgi, index) {
  console.log(`  Stok video ${index + 1} indiriliyor (${videoBilgi.width}x${videoBilgi.height}, ${videoBilgi.duration}s)...`);
  
  const response = await axios({
    method: "GET",
    url: videoBilgi.url,
    responseType: "arraybuffer",
    timeout: 120000,
  });
  
  const filename = `pexels-${String(index + 1).padStart(2, "0")}-${videoBilgi.pexels_id}.mp4`;
  const filepath = `/tmp/${filename}`;
  fs.writeFileSync(filepath, Buffer.from(response.data));
  
  const stats = fs.statSync(filepath);
  return { filename, filepath, size: stats.size, ...videoBilgi };
}

async function tumStokVideolariIndir(keywords) {
  console.log(`${keywords.length} stok video aranıyor (Pexels)...`);
  
  const sonuclar = [];
  
  for (let i = 0; i < keywords.length; i++) {
    try {
      const videoBilgi = await pexelsVideoAra(keywords[i]);
      if (!videoBilgi) {
        console.log(`  ⚠ "${keywords[i]}" için sonuç bulunamadı.`);
        continue;
      }
      
      const indirilen = await pexelsVideoIndir(videoBilgi, i);
      sonuclar.push({ ...indirilen, keyword: keywords[i], index: i });
      console.log(`  ✓ Stok video ${i + 1} OK (${(indirilen.size / 1024 / 1024).toFixed(1)}MB) [${keywords[i]}]`);
    } catch (e) {
      console.error(`  ✗ Stok video ${i + 1} hata (${keywords[i]}): ${e.message}`);
    }
  }
  
  console.log(`\n📊 Stok video sonucu: ${sonuclar.length}/${keywords.length} indirildi.`);
  return sonuclar;
}

// ─── DRIVE: Yükleme ────────────────────────────────────────────────
async function driveAltKlasorAc(drive, ad, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name: ad,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id, name, webViewLink",
  });
  return { id: res.data.id, name: res.data.name, link: res.data.webViewLink };
}

async function driveDosyaYukle(drive, dosya, parentId, mimeType) {
  const res = await drive.files.create({
    requestBody: {
      name: dosya.filename,
      parents: [parentId],
    },
    media: {
      mimeType: mimeType,
      body: fs.createReadStream(dosya.filepath),
    },
    fields: "id, name, webViewLink",
  });
  return { drive_id: res.data.id, filename: res.data.name, link: res.data.webViewLink };
}

async function driveYukle(materyaller, konuKlasoru) {
  console.log("Drive'a yükleniyor (OAuth user delegation)...");
  
  const auth = getOAuthClient();
  const drive = google.drive({ version: "v3", auth });
  
  // Ana konu klasörü
  const anaKlasor = await driveAltKlasorAc(drive, konuKlasoru, GDRIVE_FOLDER_ID);
  console.log(`Ana klasör: ${anaKlasor.name} (${anaKlasor.id})`);
  
  // Alt klasörler
  const gorsellerKlasor = await driveAltKlasorAc(drive, "01-gorseller", anaKlasor.id);
  const sesKlasor = await driveAltKlasorAc(drive, "02-ses", anaKlasor.id);
  const stokVideoKlasor = await driveAltKlasorAc(drive, "03-pexels-stok-video", anaKlasor.id);
  const klipKlasor = await driveAltKlasorAc(drive, "04-veo-klipleri-buraya", anaKlasor.id);
  
  // Görseller
  const yuklenenGorseller = [];
  for (const gorsel of materyaller.gorseller) {
    try {
      const sonuc = await driveDosyaYukle(drive, gorsel, gorsellerKlasor.id, "image/jpeg");
      yuklenenGorseller.push({ ...sonuc, index: gorsel.index });
    } catch (e) {
      console.error(`Görsel yükleme hatası: ${e.message}`);
    }
  }
  console.log(`✓ ${yuklenenGorseller.length} görsel yüklendi.`);
  
  // Ses
  let yuklenenSes = null;
  if (materyaller.ses) {
    try {
      yuklenenSes = await driveDosyaYukle(drive, materyaller.ses, sesKlasor.id, "audio/mpeg");
      console.log(`✓ Seslendirme yüklendi.`);
    } catch (e) {
      console.error(`Ses yükleme hatası: ${e.message}`);
    }
  }
  
  // Stok videolar
  const yuklenenStokVideolar = [];
  for (const video of materyaller.stokVideolar) {
    try {
      const sonuc = await driveDosyaYukle(drive, video, stokVideoKlasor.id, "video/mp4");
      yuklenenStokVideolar.push({ ...sonuc, keyword: video.keyword });
    } catch (e) {
      console.error(`Stok video yükleme hatası: ${e.message}`);
    }
  }
  console.log(`✓ ${yuklenenStokVideolar.length} stok video yüklendi.`);
  
  return {
    klasorLink: anaKlasor.link,
    klipKlasorId: klipKlasor.id,
    yuklenenGorseller,
    yuklenenSes,
    yuklenenStokVideolar,
  };
}

async function sheetKaydet(konu, icerik) {
  console.log("Sheets'e içerik kaydediliyor...");
  
  const auth = getServiceAccountAuth();
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
        "Materyaller hazır - Veo klipleri ve montaj bekleniyor",
      ]],
    },
  });
  
  console.log("Sheets'e yazıldı.");
}

async function main() {
  try {
    console.log(`🔧 ${CF_ACCOUNTS.length} Cloudflare hesabı aktif: ${CF_ACCOUNTS.map(a => a.name).join(", ")}`);
    if (hesapAKotada) {
      console.log(`ℹ Hesap-A manuel olarak devre dışı.`);
    }
    
    // 1. Konu al
    const { konu } = await konuyuAl();
    await telegram(`✅ *Konu:* ${konu}\n\n⏳ Gemini ile içerik üretiliyor...`);
    
    // 2. İçerik üret
    const icerik = await icerikUret(konu);
    await telegram(
      `📝 *İçerik hazır*\n\n📌 *Başlık:* ${icerik.baslik}\n\n⏳ Görsel + ses + stok video üretiliyor (~5 dakika)...`
    );
    
    // 3. Paralel: Görseller, ses, stok videolar
    console.log("\n=== PARALEL ÜRETİM BAŞLIYOR ===\n");
    
    const [gorselSonuc, sesSonuc, stokVideoSonuc] = await Promise.all([
      tumGorselleriUret(icerik.ai_gorsel_prompts),
      seslendirmeUret(icerik.senaryo).catch((e) => {
        console.error(`Seslendirme hatası: ${e.message}`);
        return null;
      }),
      tumStokVideolariIndir(icerik.pexels_anahtar_kelimeler).catch((e) => {
        console.error(`Stok video hatası: ${e.message}`);
        return [];
      }),
    ]);
    
    const gorseller = gorselSonuc.sonuclar;
    
    if (gorseller.length === 0) {
      throw new Error("Hiç görsel üretilemedi");
    }
    
    // 4. Drive'a yükle
    const konuKlasoru = `${TARIH}-${konu.substring(0, 50).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, "")}`;
    const drive = await driveYukle(
      {
        gorseller,
        ses: sesSonuc,
        stokVideolar: stokVideoSonuc,
      },
      konuKlasoru
    );
    
    // 5. Sheets'e kaydet
    await sheetKaydet(konu, icerik);
    
    // 6. Telegram özet
    const klipPromptlari = icerik.ai_klip_prompts
      .map((p, i) => `🎥 *KLİP ${i + 1}:*\n\`${p}\``)
      .join("\n\n");
    
    const ozet =
      `🎉 *Materyaller hazır!*\n\n` +
      `📂 [Drive klasörü](${drive.klasorLink})\n\n` +
      `📊 *İçerik:*\n` +
      `• 🖼 ${drive.yuklenenGorseller.length}/20 görsel (16:9)\n` +
      `• 🔊 ${drive.yuklenenSes ? "Seslendirme hazır (Ahmet)" : "❌ Seslendirme YOK"}\n` +
      `• 🎬 ${drive.yuklenenStokVideolar.length}/4 stok video\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `🎬 *VEO STUDIO'DA 3 KLİP ÜRET:*\n\n${klipPromptlari}\n\n` +
      `Klipleri Drive'daki "04-veo-klipleri-buraya" klasörüne yükle.`;
    
    await telegram(ozet);
    
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
