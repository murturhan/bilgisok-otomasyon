/**
 * 01 - İçerik Üretimi v16 (Quiz Blitz refactor + FLUX kalite iyileştirmesi)
 *
 * v15'ten farkı:
 * - FLUX prompt'larında "no fox, no mascot, no text on image" zorunlu kılındı
 *   (Jess olmayan fox karakteri sorunu + "RUTERIAM" gibi sahte text sorunu)
 * - Fun fact prompt'ları daha somut/literal (Wright Brothers → biplane uçak gösteriyor olmalı)
 * - Question prompt'larında "studio photography style, clean object on plain background" preferenceı
 */

import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  konuHavuzundanAl,
  jobOlustur,
  driveKlasorAc,
  driveDosyaYukle,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const {
  GEMINI_API_KEY,
  GEMINI_API_KEY_2,
  TARIH,
  INDEX,
  CHAT_ID,
  JOB_ID,
  VIDEO_FORMAT,
} = process.env;

const FORMAT = VIDEO_FORMAT || "long";
const QUESTION_COUNT = FORMAT === "shorts" ? 5 : 25;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── FLUX PROMPT IYİLEŞTİRİCİ ─────────────────────
// Tüm FLUX prompt'larına eklenecek negatif/pozitif kuralları
const FLUX_QUALITY_SUFFIX = ", clean studio lighting, kid-friendly Pixar 3D cartoon style, vibrant colors, sharp focus, NO TEXT in image, NO LETTERS, NO LOGOS, NO WATERMARKS, NO FOX CHARACTER, NO MASCOT, NO ANIMAL CHARACTERS in scene";

function enhanceFluxPrompt(prompt) {
  if (!prompt) return prompt;
  // Eğer prompt'ta zaten "no fox" gibi negatifler varsa eklemiyoruz
  if (/NO TEXT|no text|no fox/i.test(prompt)) return prompt;
  // Hayvanlarla ilgili sorularda hayvan olmalı - "NO ANIMAL CHARACTERS" hayvan konularını kırıyor
  // O yüzden hayvan kelimesi varsa NO ANIMAL CHARACTERS çıkar
  const isAnimalTopic = /animal|fox|dog|cat|bear|bird|fish|cow|lion|tiger|monkey|elephant|zebra/i.test(prompt);
  let suffix = FLUX_QUALITY_SUFFIX;
  if (isAnimalTopic) {
    suffix = suffix.replace(", NO ANIMAL CHARACTERS in scene", "");
    suffix = suffix.replace(", NO FOX CHARACTER, NO MASCOT", ", NO FOX CHARACTER, NO MASCOT (animals from question are OK)");
  }
  return prompt + suffix;
}

async function icerikUret(konu) {
  console.log(`Gemini quiz üretiyor: "${konu}", format: ${FORMAT}, ${QUESTION_COUNT} soru`);
  
  const geminiKeys = [GEMINI_API_KEY];
  if (GEMINI_API_KEY_2) geminiKeys.push(GEMINI_API_KEY_2);
  
  const prompt = `You are an expert content creator for "GeniMini Tests" - educational quiz YouTube channel for kids ages 4-12.

Channel mascot: **Jess the Fox** - cute, friendly Pixar-style fox who hosts the quiz.
IMPORTANT: Jess is the host. She is NEVER part of the visual scenes — DO NOT put a fox character in any image_prompt.

TOPIC: "${konu}"
FORMAT: ${FORMAT === "shorts" ? "YouTube Shorts (60-90 seconds, 5 quick questions)" : "Long video (12-15 minutes, 25 questions with mixed difficulty)"}

═══════════════════════════════════════════════════
QUIZ STRUCTURE (Quiz Blitz style - 3 OPTIONS)
═══════════════════════════════════════════════════

Create:
1. **Intro audio** (Jess greets, 2-3 sentences)
2. **${QUESTION_COUNT} questions** with **3 multiple choice answers** each (A, B, C)
3. **Outro audio** (Jess says goodbye)

For EACH question:
- The question + 3 options
- **question_audio_text**: Jess reads question + 3 options
- **answer_audio_text**: Jess reveals correct answer + fun fact
- **image_prompt**: visual for the QUESTION (literal subject only)
- **fun_fact_image_prompt**: visual illustrating the FUN FACT
- **reveal_image_prompt** (optional): for country quizzes - flag of answer country

DIFFICULTY DISTRIBUTION:
${FORMAT === "shorts" ? `- Easy: 3, Medium: 2` : `- Easy: 8, Medium: 12, Hard: 5
- Progress easy → medium → hard`}

═══════════════════════════════════════════════════
AUDIO TEXT FORMAT (CRITICAL)
═══════════════════════════════════════════════════

question_audio_text: "Question N. [question]. Is it A: [opt1], B: [opt2], or C: [opt3]?"
answer_audio_text: "The correct answer is [Letter]: [correct option]! [Fun fact sentence]."

Each question audio: 6-9 seconds. Answer audio: 5-8 seconds.

═══════════════════════════════════════════════════
INTRO & OUTRO
═══════════════════════════════════════════════════

intro_audio_text: 2-3 energetic sentences. Example: "Hi friends! I'm Jess the Fox! Today we're exploring amazing animals! Let's play!"
outro_audio_text: 2-3 farewell sentences. Example: "Wow, you did great! Subscribe for more! See you next time!"

═══════════════════════════════════════════════════
IMAGE PROMPT RULES (VERY IMPORTANT!)
═══════════════════════════════════════════════════

For EVERY image_prompt and fun_fact_image_prompt:

✅ DO:
- Describe the LITERAL subject in plain language ("a vintage rotary telephone on a wooden desk")
- Use clean studio photography style
- Pixar 3D cartoon look
- Mention background color/setting briefly

❌ DO NOT:
- DO NOT include any text, letters, words, signs, labels in the image
- DO NOT include a fox character (Jess is overlaid separately, NOT in FLUX images)
- DO NOT include any cartoon mascot, character, or person
- DO NOT include logos, brands, watermarks, or made-up text
- DO NOT use stylized text labels or banners
- DO NOT use names of inventors as image subjects (Gemini-generated images can't draw Wright Brothers accurately — use the INVENTION not the inventor)

📸 EXAMPLES:

GOOD question_prompt for "First airplane":
"A red wooden biplane with double wings on grass field, Pixar 3D cartoon style, daytime, clean composition, NO text, NO people, NO animals"

BAD question_prompt:
"The Wright Brothers' first airplane flight in 1903 with the inventors" 
(causes weird humans + fake text)

GOOD fun_fact_prompt for "Lightbulbs were invented in 1879":
"A glowing vintage Edison lightbulb on a wooden table, warm yellow glow, dark background, Pixar 3D style, NO text"

BAD fun_fact_prompt:
"Thomas Edison inventing the lightbulb"
(causes weird Edison face)

═══════════════════════════════════════════════════
QUESTION OBJECT FORMAT
═══════════════════════════════════════════════════

Each question:
- **question_text**: Short on-screen text (e.g., "What does this invention do?")
- **image_prompt**: LITERAL Pixar prompt for question visual (follow IMAGE RULES above)
- **fun_fact_image_prompt**: LITERAL Pixar prompt for fun fact reveal
- **reveal_image_prompt** (optional): For COUNTRIES only - "Clean flag of [country], simple solid colors, NO text, plain white background"
- **options**: Array of EXACTLY 3 short answers (1-3 words)
- **option_flags**: Array of EXACTLY 3 flag emojis or "" empty strings
- **correct_answer**: Index 0, 1, or 2
- **difficulty**: "easy", "medium", or "hard"
- **fun_fact**: Short sentence (used in audio and reveal)
- **question_audio_text**: Full Jess speaks
- **answer_audio_text**: Full Jess speaks with fun fact

═══════════════════════════════════════════════════
METADATA
═══════════════════════════════════════════════════

baslik: Long YouTube title with emoji (10-15 words)
thumbnail_title: 2-3 WORDS UPPERCASE (e.g. "ANIMAL QUIZ")
thumbnail_prompt: Pixar scenery only, NO characters, NO text
aciklama: 200-word description with hashtags (#KidsQuiz #LearnForKids #JessTheFox #GeniMiniTests)

═══════════════════════════════════════════════════
SAFETY (Made for Kids)
═══════════════════════════════════════════════════
- No scary/violent content
- Pixar Disney 3D style
- Ages 4-12 appropriate

═══════════════════════════════════════════════════
TOPIC: ${konu}
QUESTION COUNT: ${QUESTION_COUNT}
═══════════════════════════════════════════════════

JSON OUTPUT (valid JSON, no markdown):

{
  "konu": "${konu}",
  "format": "${FORMAT}",
  "baslik": "Title with emoji",
  "thumbnail_title": "2-3 WORDS UPPERCASE",
  "thumbnail_prompt": "Pixar scenery, NO characters, NO text",
  "aciklama": "200 word desc with hashtags",
  "intro_audio_text": "Jess intro",
  "outro_audio_text": "Jess outro",
  "questions": [
    {
      "question_text": "Short on-screen text",
      "image_prompt": "LITERAL Pixar prompt - the subject only, NO text, NO fox, NO mascot",
      "fun_fact_image_prompt": "LITERAL Pixar prompt for fun fact, NO text, NO characters",
      "reveal_image_prompt": "",
      "options": ["A", "B", "C"],
      "option_flags": ["", "", ""],
      "correct_answer": 0,
      "difficulty": "easy",
      "fun_fact": "Fun fact.",
      "question_audio_text": "Question N. ...",
      "answer_audio_text": "The correct answer is ..."
    }
  ]
}

CRITICAL CHECKS:
- EXACTLY ${QUESTION_COUNT} questions
- EXACTLY 3 options (not 4)
- correct_answer ∈ {0, 1, 2}
- option_flags is exactly 3 items
- All English
- All Pixar/3D cartoon
- Answers SHORT (1-3 words)
- question_audio_text includes A/B/C options
- answer_audio_text ends with fun_fact
- **image_prompt MUST follow IMAGE RULES** (no text, no fox, no mascot, literal subject)
- **fun_fact_image_prompt MUST follow IMAGE RULES** (illustrate fact concretely, NO humans/characters)
- **reveal_image_prompt** only for country quizzes: "Clean flag of [country], solid colors, NO text, white background"`;

  const maxRetries = 5;
  const modeller = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const modelAdi = modeller[Math.min(attempt - 1, modeller.length - 1)];
    const aktifKey = geminiKeys[(attempt - 1) % geminiKeys.length];
    
    try {
      console.log(`Gemini denemesi ${attempt}/${maxRetries} - ${modelAdi}`);
      
      const genAI = new GoogleGenerativeAI(aktifKey);
      const model = genAI.getGenerativeModel({ model: modelAdi });
      
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 16000,
          responseMimeType: "application/json",
        },
      });
      
      const text = result.response.text();
      console.log(`Gemini response: ${text.length} char`);
      
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("JSON parse hatası");
        json = JSON.parse(m[0]);
      }
      
      if (!json.questions || !Array.isArray(json.questions)) {
        throw new Error("questions array yok");
      }
      
      if (json.questions.length < QUESTION_COUNT) {
        throw new Error(`Yetersiz soru: ${json.questions.length}/${QUESTION_COUNT}`);
      }
      
      if (json.questions.length > QUESTION_COUNT) {
        console.log(`Fazla soru kırpılıyor: ${json.questions.length} → ${QUESTION_COUNT}`);
        json.questions = json.questions.slice(0, QUESTION_COUNT);
      }
      
      // VALIDATION (3 şık)
      for (let i = 0; i < json.questions.length; i++) {
        const q = json.questions[i];
        if (!q.question_text) throw new Error(`Soru ${i+1}: question_text yok`);
        if (!q.image_prompt) throw new Error(`Soru ${i+1}: image_prompt yok`);
        
        if (!q.options || q.options.length !== 3) {
          throw new Error(`Soru ${i+1}: 3 option olmalı (var: ${q.options?.length})`);
        }
        if (q.correct_answer === undefined || q.correct_answer < 0 || q.correct_answer > 2) {
          throw new Error(`Soru ${i+1}: correct_answer 0-2 arası olmalı`);
        }
        if (!q.difficulty) q.difficulty = "medium";
        if (!q.fun_fact) q.fun_fact = "";
        
        // FLUX prompt iyileştirme - "no text, no fox" otomatik ekle
        q.image_prompt = enhanceFluxPrompt(q.image_prompt);
        
        if (!q.fun_fact_image_prompt) {
          if (q.fun_fact) {
            q.fun_fact_image_prompt = `Literal Pixar 3D cartoon illustration of: ${q.fun_fact}, no characters, no text`;
          } else {
            q.fun_fact_image_prompt = q.image_prompt;
          }
        }
        q.fun_fact_image_prompt = enhanceFluxPrompt(q.fun_fact_image_prompt);
        
        if (q.reveal_image_prompt === undefined || q.reveal_image_prompt === null) {
          q.reveal_image_prompt = "";
        }
        if (q.reveal_image_prompt && q.reveal_image_prompt.trim().length > 0) {
          q.reveal_image_prompt = enhanceFluxPrompt(q.reveal_image_prompt);
        }
        
        if (!q.option_flags || !Array.isArray(q.option_flags) || q.option_flags.length !== 3) {
          q.option_flags = ["", "", ""];
        }
        q.option_flags = q.option_flags.map(f => String(f || ""));
        
        if (!q.question_audio_text) {
          const letters = ["A", "B", "C"];
          q.question_audio_text = `Question ${i+1}. ${q.question_text} Is it ` +
            q.options.map((opt, j) => `${letters[j]}: ${opt}`).join(", ").replace(/,([^,]*)$/, ", or$1") + "?";
        }
        if (!q.answer_audio_text) {
          const letter = ["A", "B", "C"][q.correct_answer];
          q.answer_audio_text = `The correct answer is ${letter}: ${q.options[q.correct_answer]}! ${q.fun_fact}`;
        }
      }
      
      if (!json.intro_audio_text) json.intro_audio_text = "Hi friends! I'm Jess the Fox! Let's play a fun quiz!";
      if (!json.outro_audio_text) json.outro_audio_text = "Great job! Subscribe for more fun! See you next time!";
      if (!json.baslik) json.baslik = `${konu} Quiz for Kids!`;
      
      if (!json.thumbnail_title) {
        const konuTemiz = konu.replace(/[:!?].*$/g, "").trim();
        const kelimeler = konuTemiz.split(/\s+/).slice(0, 2);
        json.thumbnail_title = kelimeler.join(" ").toUpperCase() + " QUIZ";
      } else {
        json.thumbnail_title = String(json.thumbnail_title).toUpperCase().trim();
        const kelimeler = json.thumbnail_title.split(/\s+/);
        if (kelimeler.length > 3) {
          json.thumbnail_title = kelimeler.slice(0, 3).join(" ");
        }
      }
      console.log(`Thumbnail title: "${json.thumbnail_title}"`);
      
      if (!json.thumbnail_prompt) {
        json.thumbnail_prompt = `Vibrant ${konu} themed background scenery, Pixar 3D style, NO CHARACTERS, NO ANIMALS, NO PEOPLE, NO TEXT, kid-friendly bright colors`;
      }
      
      json.background_prompt = "";
      
      json.ai_gorsel_prompts = [];
      for (const q of json.questions) {
        json.ai_gorsel_prompts.push(q.image_prompt);
        json.ai_gorsel_prompts.push(q.fun_fact_image_prompt);
        if (q.reveal_image_prompt && q.reveal_image_prompt.trim().length > 0) {
          json.ai_gorsel_prompts.push(q.reveal_image_prompt);
        }
      }
      
      json.ai_klip_prompts = [];
      json.pexels_anahtar_kelimeler = [];
      
      json.senaryo = [
        json.intro_audio_text,
        ...json.questions.map(q => `${q.question_audio_text} ${q.answer_audio_text}`),
        json.outro_audio_text
      ].join("\n\n");
      
      json.tts_telaffuz = json.senaryo;
      json.muzik_mood = "kids";
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      console.log(`${json.questions.length} soru, format: ${FORMAT}, 3 şık`);
      console.log(`Zorluk: ${
        ["easy", "medium", "hard"].map(d => 
          `${d}=${json.questions.filter(q => q.difficulty === d).length}`
        ).join(", ")
      }`);
      console.log(`Reveal image sayısı: ${json.questions.filter(q => q.reveal_image_prompt && q.reveal_image_prompt.length > 0).length}`);
      
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
    console.log(`Job: ${JOB_ID}, Format: ${FORMAT}`);
    
    const konu = await konuHavuzundanAl(TARIH, INDEX);
    console.log(`Konu: ${konu}`);
    
    await telegram(
      CHAT_ID,
      `🦊 *GeniMini Tests new quiz!*\n\n` +
      `📚 Topic: ${konu}\n` +
      `📺 Format: ${FORMAT === "shorts" ? "Shorts (60-90s)" : "Long (12-15 min)"}\n` +
      `🆔 \`${JOB_ID}\`\n\n` +
      `⏳ Generating Quiz Blitz style quiz with Jess...`
    );
    
    const icerik = await icerikUret(konu);
    
    const safeTitle = konu.substring(0, 50).replace(/[^a-zA-Z0-9 ]/g, "");
    const klasorAdi = `${TARIH}-${FORMAT}-${safeTitle}`;
    
    console.log(`Drive klasörü açılıyor: ${klasorAdi}`);
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
      thumbnail_baslik: icerik.thumbnail_title || "",
      thumbnail_alt_baslik: "",
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
    
    const tmpDir = "/tmp/quiz-data";
    fs.mkdirSync(tmpDir, { recursive: true });
    const questionsPath = path.join(tmpDir, "questions.json");
    fs.writeFileSync(questionsPath, JSON.stringify({
      format: FORMAT,
      konu: konu,
      baslik: icerik.baslik,
      thumbnail_title: icerik.thumbnail_title || "",
      intro_audio_text: icerik.intro_audio_text,
      outro_audio_text: icerik.outro_audio_text,
      questions: icerik.questions,
    }, null, 2));
    
    console.log(`questions.json yazıldı: ${questionsPath}`);
    
    const { driveAltKlasorBul } = await import("./lib/google.js");
    const sesKlasor = await driveAltKlasorBul("02-ses", anaKlasor.id);
    if (sesKlasor.length === 0) {
      throw new Error("02-ses klasörü oluşturulamadı");
    }
    
    await driveDosyaYukle(
      { filename: "questions.json", filepath: questionsPath },
      sesKlasor[0].id,
      "application/json"
    );
    
    console.log(`✓ questions.json '02-ses' klasörüne yüklendi`);
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    
    await telegram(
      CHAT_ID,
      `📝 *Quiz Blitz ready!*\n\n` +
      `📌 ${icerik.baslik}\n` +
      `📺 ${FORMAT}\n` +
      `❓ ${icerik.questions.length} questions × 3 options\n` +
      `🦊 Mascot: Jess the Fox\n\n` +
      `📂 [Drive folder](${anaKlasor.link})\n\n` +
      `⏳ Generating images, audio, thumbnail...`
    );
    
    console.log("✅ İçerik üretimi tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    await telegram(CHAT_ID, `❌ *01-İçerik error:* ${error.message.substring(0, 500)}`);
    process.exit(1);
  }
}

main();
