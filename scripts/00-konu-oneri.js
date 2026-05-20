/**
 * 00 - KONU ÖNERİ SCRIPT'I
 *
 * Pipedream'den taşındı. Akış:
 * 1. Gemini'ye 3 kids quiz konu önerisi sorulur
 * 2. konu_havuzu sheet'ine [konu, tarih, "hayir"] olarak yazılır
 * 3. Telegram'a 6 butonlu mesaj atılır (3 konu × Shorts/Long)
 *
 * Tetikleme: GitHub Actions cron, her gün 10:00 Europe/Istanbul
 *
 * Callback formatı (Worker tarafında handle ediliyor):
 *   quiz:format:tarih:index
 *   örnek: quiz:shorts:20.05.2026:0
 */

import { google } from "googleapis";

// ─── ENV ──────────────────────────────────────────────────────
const {
  GEMINI_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  GDRIVE_SERVICE_ACCOUNT_JSON,
  GSHEETS_SPREADSHEET_ID,
} = process.env;

function envKontrol() {
  const eksik = [];
  if (!GEMINI_API_KEY) eksik.push("GEMINI_API_KEY");
  if (!TELEGRAM_BOT_TOKEN) eksik.push("TELEGRAM_BOT_TOKEN");
  if (!TELEGRAM_CHAT_ID) eksik.push("TELEGRAM_CHAT_ID");
  if (!GDRIVE_SERVICE_ACCOUNT_JSON) eksik.push("GDRIVE_SERVICE_ACCOUNT_JSON");
  if (!GSHEETS_SPREADSHEET_ID) eksik.push("GSHEETS_SPREADSHEET_ID");
  if (eksik.length > 0) throw new Error(`Eksik env: ${eksik.join(", ")}`);
}

// ─── GEMINI ──────────────────────────────────────────────────
async function geminiKonuOner() {
  const prompt = `You are a YouTube content strategist for "GeniMini Tests" - an educational quiz channel for kids ages 4-12.

Channel mascot: Jess the Fox (cute Pixar-style fox who hosts the quizzes).

TASK: Generate 3 fresh, DIVERSE quiz topic ideas for today's video production.

REQUIREMENTS:
- Topics MUST be in English
- Topics MUST be visually rich (kids should SEE things and guess)
- Topics MUST appeal to kids 4-12
- AVOID overused topics (basic colors, basic shapes, ABC)
- Each topic should generate 5-25 quiz questions easily
- Mix categories: animals, geography, science, food, vehicles, sports, history, music, plants, etc.
- Topics should be SPECIFIC enough to make a focused video (not too broad)

GOOD EXAMPLES:
- "Wild Cats Around the World"
- "Dinosaurs from the Jurassic Period"
- "Fruits That Grow on Trees"
- "Musical Instruments from Different Countries"
- "Insects and Bugs"
- "Famous Landmarks of Europe"

BAD EXAMPLES (too broad or boring):
- "Colors" (too basic)
- "Animals" (too broad - which animals?)
- "Things" (meaningless)

OUTPUT FORMAT (JSON only, no markdown):
{
  "konular": [
    "Topic 1 in English (clear and specific)",
    "Topic 2 in English (different category)",
    "Topic 3 in English (different category)"
  ]
}

Generate 3 DIFFERENT category topics. Be creative and educational!`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 1.0,
      maxOutputTokens: 2048,
    },
  };
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errText.substring(0, 500)}`);
  }
  
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!rawText) throw new Error("Gemini boş yanıt verdi");
  
  // JSON parse (markdown wrapper temizle)
  let cleanText = rawText.trim();
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  
  const parsed = JSON.parse(cleanText);
  const konular = parsed.konular || [];
  if (konular.length !== 3) {
    throw new Error(`Beklenen 3 konu, gelen ${konular.length}`);
  }
  
  return konular;
}

// ─── SHEETS ──────────────────────────────────────────────────
async function sheetsYaz(konular, tarih) {
  const credentials = JSON.parse(GDRIVE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  
  const sheets = google.sheets({ version: "v4", auth });
  
  const sheetRows = konular.map((k) => [k, tarih, "hayir"]);
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: "konu_havuzu!A:C",
    valueInputOption: "RAW",
    requestBody: { values: sheetRows },
  });
  
  console.log(`✓ ${sheetRows.length} konu konu_havuzu sayfasına eklendi`);
}

// ─── TELEGRAM ────────────────────────────────────────────────
async function telegramButonGonder(konular, tarih) {
  // 3 konu × 2 format = 6 buton
  const inlineKeyboard = konular.map((konu, idx) => {
    const kisaKonu = konu.length > 40 ? konu.substring(0, 37) + "..." : konu;
    return [
      {
        text: `🎬 ${idx + 1}. ${kisaKonu} (Short)`,
        callback_data: `quiz:shorts:${tarih}:${idx}`,
      },
      {
        text: `📺 ${idx + 1}. ${kisaKonu} (Long)`,
        callback_data: `quiz:long:${tarih}:${idx}`,
      },
    ];
  });
  
  const mesajMetni =
    `🦊 *GeniMini Tests - Daily Quiz Selection*\n\n` +
    `📅 ${tarih}\n\n` +
    `Today's 3 quiz topic suggestions:\n\n` +
    konular.map((k, i) => `${i + 1}️⃣ *${k}*`).join("\n\n") +
    `\n\n👇 Pick a topic AND format below:`;
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: mesajMetni,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard },
  };
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram error: ${JSON.stringify(result)}`);
  }
  
  console.log(`✓ Telegram mesaj gönderildi (msg_id: ${result.result.message_id})`);
  return result.result.message_id;
}

// ─── TARİH (Türkiye saati) ───────────────────────────────────
function bugunTarih() {
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC+3
  const gun = String(tr.getUTCDate()).padStart(2, "0");
  const ay = String(tr.getUTCMonth() + 1).padStart(2, "0");
  const yil = tr.getUTCFullYear();
  return `${gun}.${ay}.${yil}`;
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  const baslangic = Date.now();
  
  try {
    envKontrol();
    console.log("✓ Env değişkenleri OK");
    
    const tarih = bugunTarih();
    console.log(`📅 Tarih: ${tarih}`);
    
    console.log("🤖 Gemini'den konu önerileri alınıyor...");
    const konular = await geminiKonuOner();
    console.log(`✓ 3 konu önerildi:`);
    konular.forEach((k, i) => console.log(`   ${i + 1}. ${k}`));
    
    console.log("📊 Sheets'e yazılıyor...");
    await sheetsYaz(konular, tarih);
    
    console.log("📱 Telegram mesajı gönderiliyor...");
    await telegramButonGonder(konular, tarih);
    
    const sure = ((Date.now() - baslangic) / 1000).toFixed(1);
    console.log(`✅ Tamam (${sure}s)`);
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    
    // Hata bildirim Telegram'a
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: `❌ *Konu Öneri Hatası*\n\n\`${error.message.substring(0, 300)}\``,
          parse_mode: "Markdown",
        }),
      });
    } catch (e) {}
    
    process.exit(1);
  }
}

main();
