/**
 * 01 - İçerik Üretimi v15 (Quiz Blitz refactor)
 *
 * v14'ten farkı:
 * - 4 şık → 3 şık (Quiz Blitz tarzı, ABC)
 * - background_prompt KALDIRILDI (artık SVG pattern animasyonlu bg kullanılıyor)
 * - reveal_image_prompt eklendi (opsiyonel - bayrak/cevap görseli için)
 * - audio text 3 şık formatına uyarlandı
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

async function icerikUret(konu) {
  console.log(`Gemini quiz üretiyor: "${konu}", format: ${FORMAT}, ${QUESTION_COUNT} soru`);
  
  const geminiKeys = [GEMINI_API_KEY];
  if (GEMINI_API_KEY_2) geminiKeys.push(GEMINI_API_KEY_2);
  
  const prompt = `You are an expert content creator for "GeniMini Tests" - educational quiz YouTube channel for kids ages 4-12.

Channel mascot: **Jess the Fox** - cute, friendly Pixar-style fox who hosts the quiz.

TOPIC: "${konu}"
FORMAT: ${FORMAT === "shorts" ? "YouTube Shorts (60-90 seconds, 5 quick questions)" : "Long video (12-15 minutes, 25 questions with mixed difficulty)"}

═══════════════════════════════════════════════════
QUIZ STRUCTURE (Quiz Blitz style - 3 OPTIONS)
═══════════════════════════════════════════════════

You will create:
1. **Intro audio** (Jess greets viewers, 2-3 sentences)
2. **${QUESTION_COUNT} questions** with **3 multiple choice answers** each (A, B, C)
3. **Outro audio** (Jess says goodbye, 2-3 sentences)

For EACH question, you must create:
- The question itself + 3 options
- **question_audio_text**: What Jess SAYS when introducing the question (reads question + 3 options out loud)
- **answer_audio_text**: What Jess SAYS when revealing the answer (confirms correct answer + fun fact)
- **image_prompt** for the question visual (what is being asked about)
- **fun_fact_image_prompt** for the fun fact reveal
- **reveal_image_prompt** (OPTIONAL): Used when answer reveal needs a different image
  * Geography quiz with country answer: prompt should generate the FLAG of the answer country
  * Other quizzes: leave empty (question image stays during reveal)

DIFFICULTY DISTRIBUTION (for ${QUESTION_COUNT} questions):
${FORMAT === "shorts" ? `- Easy: 3 questions (ages 4-7)
- Medium: 2 questions (ages 7-12)` : `- Easy: 8 questions (ages 4-7, basic recognition)
- Medium: 12 questions (ages 7-10, knowledge)
- Hard: 5 questions (ages 10-12, challenging)

QUESTIONS MUST PROGRESS from easy → medium → hard.`}

═══════════════════════════════════════════════════
AUDIO TEXT FORMAT (CRITICAL!)
═══════════════════════════════════════════════════

**question_audio_text** template (Jess reads question + 3 options):
"Question [N]. [Question text]. Is it A: [option1], B: [option2], or C: [option3]?"

Example:
"Question 1. Which animal is the king of the jungle? Is it A: Tiger, B: Lion, or C: Cheetah?"

**answer_audio_text** template (Jess reveals answer + fun fact):
"The correct answer is [Letter]: [Correct option]! [Fun fact sentence]."

Example:
"The correct answer is B: Lion! Did you know? Lions are the only cats that live in groups called prides!"

NOTE: Read slowly! Audio is for kids. Each question audio should be 6-9 seconds, answer audio 5-8 seconds.

═══════════════════════════════════════════════════
INTRO & OUTRO AUDIO
═══════════════════════════════════════════════════

**intro_audio_text** (Jess greets, 2-3 sentences, energetic):
Example: "Hi friends! I'm Jess the Fox! Today we're exploring amazing animals! Can you guess them all? Let's play!"

**outro_audio_text** (Jess says goodbye, 2-3 sentences):
Example: "Wow, you did amazing! Don't forget to subscribe and join Jess for more fun quizzes! See you next time, friends!"

═══════════════════════════════════════════════════
QUESTION OBJECT FORMAT
═══════════════════════════════════════════════════

Each question object MUST have ALL these fields:
- **question_text**: Short text shown on screen (e.g., "Which animal is this?")
- **image_prompt**: FLUX prompt for question's image (Pixar-style, kid-friendly)
- **fun_fact_image_prompt**: FLUX prompt for fun fact reveal image
- **reveal_image_prompt** (OPTIONAL): Different image for answer reveal. Use ONLY for:
  * Geography (where answer is a country): generate a clean SOLID-COLOR flag image of that country with the country name written below
  * Otherwise leave as empty string ""
- **options**: Array of EXACTLY 3 short answers (1-3 words each)
- **option_flags**: Array of EXACTLY 3 flag emojis or empty strings
- **correct_answer**: Index 0, 1, or 2 (NOT 3!)
- **difficulty**: "easy", "medium", or "hard"
- **fun_fact**: Short fact sentence (used in answer_audio_text and fun fact reveal)
- **question_audio_text**: Full sentence Jess SPEAKS posing question (3 options A/B/C)
- **answer_audio_text**: Full sentence Jess SPEAKS revealing answer (with fun fact)

═══════════════════════════════════════════════════
TITLE & METADATA
═══════════════════════════════════════════════════

**baslik** (YouTube title): Click-worthy with emoji
Example: "🦁 Can YOU Guess All 25 Animals? Kids Quiz with Jess the Fox!"

**aciklama** (description): 150-250 words with hashtags
Include: #KidsQuiz #LearnForKids #EducationalGames #JessTheFox #GeniMiniTests

**thumbnail_prompt**: FLUX prompt for thumbnail background (NO CHARACTERS)
- Vibrant theme scenery only
- NO ANIMALS, NO CHARACTERS, NO PEOPLE
- Right third empty for text overlay
- 16:9, Pixar 3D style, NO TEXT

**thumbnail_title**: 2-3 WORDS MAX, UPPERCASE, punchy
Examples: "FOOD QUIZ", "GUESS THE ANIMAL", "OCEAN QUIZ"

═══════════════════════════════════════════════════
SAFETY (Made for Kids)
═══════════════════════════════════════════════════

- NO scary content, violence, weapons
- All Pixar/Disney 3D cartoon style, vibrant colors
- All content appropriate for ages 4-12

═══════════════════════════════════════════════════
TOPIC: ${konu}
QUESTION COUNT: ${QUESTION_COUNT}
═══════════════════════════════════════════════════

JSON OUTPUT (must be valid JSON, no markdown):

{
  "konu": "${konu}",
  "format": "${FORMAT}",
  "baslik": "Long YouTube title with emoji",
  "thumbnail_title": "2-3 WORDS MAX UPPERCASE",
  "thumbnail_prompt": "FLUX prompt - scenery only, NO CHARACTERS",
  "aciklama": "200 word description with hashtags",
  "intro_audio_text": "Jess intro 2-3 sentences",
  "outro_audio_text": "Jess outro 2-3 sentences",
  "questions": [
    {
      "question_text": "Short on-screen text",
      "image_prompt": "Pixar-style image prompt for QUESTION",
      "fun_fact_image_prompt": "Pixar-style image prompt for FUN FACT",
      "reveal_image_prompt": "",
      "options": ["A_short", "B_short", "C_short"],
      "option_flags": ["🇮🇹", "🇹🇷", "🇫🇷"],
      "correct_answer": 0,
      "difficulty": "easy",
      "fun_fact": "Fun fact sentence.",
      "question_audio_text": "Question N. [question_text] Is it A: [opt1], B: [opt2], or C: [opt3]?",
      "answer_audio_text": "The correct answer is [Letter]: [correct option]! [fun_fact]"
    }
  ]
}

CRITICAL:
- EXACTLY ${QUESTION_COUNT} questions
- EXACTLY 3 options per question (not 4!)
- correct_answer must be 0, 1, or 2 (not 3!)
- option_flags must be exactly 3 items
- All in English
- Image prompts MUST be PIXAR/3D CARTOON
- All child-safe
- Answers SHORT (1-3 words)
- question_audio_text MUST include all 3 options spoken (A/B/C only)
- answer_audio_text MUST include fun_fact at the end
- fun_fact_image_prompt MUST illustrate the fun fact (different scene from question image)
- **option_flags Logic**:
  * If options are COUNTRIES: use country flag emojis ["🇮🇹","🇫🇷","🇯🇵"]
  * If options relate to COUNTRY-ORIGIN: use the related country flag
  * If options are NEUTRAL (animals, colors, numbers): use ["","",""] empty strings
- **reveal_image_prompt Logic**:
  * If quiz is about COUNTRIES (answer is a country name): generate prompt for a clean country flag with country name overlay
  * If quiz is about food/landmarks with country origin: same, show the answer country's flag
  * Otherwise: empty string ""`;

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
      
      // ─── VALIDATION (3 ŞIK) ──────────────────────
      for (let i = 0; i < json.questions.length; i++) {
        const q = json.questions[i];
        if (!q.question_text) throw new Error(`Soru ${i+1}: question_text yok`);
        if (!q.image_prompt) throw new Error(`Soru ${i+1}: image_prompt yok`);
        
        // ⚠️ DEĞİŞTİ: 4 → 3
        if (!q.options || q.options.length !== 3) {
          throw new Error(`Soru ${i+1}: 3 option olmalı (var: ${q.options?.length})`);
        }
        // ⚠️ DEĞİŞTİ: 0-3 → 0-2
        if (q.correct_answer === undefined || q.correct_answer < 0 || q.correct_answer > 2) {
          throw new Error(`Soru ${i+1}: correct_answer 0-2 arası olmalı`);
        }
        if (!q.difficulty) q.difficulty = "medium";
        if (!q.fun_fact) q.fun_fact = "";
        
        // fun_fact_image_prompt fallback
        if (!q.fun_fact_image_prompt) {
          if (q.fun_fact) {
            q.fun_fact_image_prompt = `Pixar 3D cartoon illustration: ${q.fun_fact}, kid-friendly, vibrant colors, NO TEXT`;
          } else {
            q.fun_fact_image_prompt = q.image_prompt;
          }
        }
        
        // reveal_image_prompt opsiyonel - empty string olabilir
        if (q.reveal_image_prompt === undefined || q.reveal_image_prompt === null) {
          q.reveal_image_prompt = "";
        }
        
        // ⚠️ DEĞİŞTİ: option_flags - 3 item
        if (!q.option_flags || !Array.isArray(q.option_flags) || q.option_flags.length !== 3) {
          q.option_flags = ["", "", ""];
        }
        q.option_flags = q.option_flags.map(f => String(f || ""));
        
        // Audio text varsayılan oluştur (Gemini eksik verirse) - 3 şık
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
      
      // thumbnail_title
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
        json.thumbnail_prompt = `Vibrant ${konu} themed background scenery, Pixar 3D style, NO CHARACTERS, NO ANIMALS, NO PEOPLE, kid-friendly, bright colors, NO TEXT`;
      }
      
      // ⚠️ background_prompt ARTIK YOK - animated SVG pattern kullanılıyor
      // backward compat için empty string set et
      json.background_prompt = "";
      
      // ─── AI GÖRSEL PROMPTS ──────────────────────
      // Sıra: q1_question, q1_funfact, q1_reveal?, q2_question, q2_funfact, q2_reveal?, ..., thumbnail
      // reveal_image_prompt boş ise atlanır (gorsel-uret oraya gelmez)
      // 02-gorsel-uret bu sırayla üretmeli: q01.jpg, q01-fact.jpg, q01-reveal.jpg (varsa), q02.jpg, ...
      json.ai_gorsel_prompts = [];
      for (const q of json.questions) {
        json.ai_gorsel_prompts.push(q.image_prompt);
        json.ai_gorsel_prompts.push(q.fun_fact_image_prompt);
        // Sadece reveal_image_prompt VARsa ekle
        if (q.reveal_image_prompt && q.reveal_image_prompt.trim().length > 0) {
          json.ai_gorsel_prompts.push(q.reveal_image_prompt);
        }
      }
      // Background prompt ARTIK YOK
      
      json.ai_klip_prompts = [];
      json.pexels_anahtar_kelimeler = [];
      
      // Senaryo
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
      // background_prompt ARTIK YOK (boş bırakılıyor)
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
      `❓ ${icerik.questions.length} questions × 3 options (A/B/C)\n` +
      `🦊 Mascot: Jess the Fox\n\n` +
      `📂 [Drive folder](${anaKlasor.link})\n\n` +
      `⏳ Generating images, audio segments, thumbnail...`
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
