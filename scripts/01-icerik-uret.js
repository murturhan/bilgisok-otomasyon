/**
 * 01 - İçerik Üretimi v14 (GeniMini Tests Kids Quiz)
 * v13'ten farkı:
 * - Her soru için AYRI question_audio_text ve answer_audio_text üretir
 * - questions.json'da bu yapı: { intro_audio_text, outro_audio_text, questions: [{..., question_audio_text, answer_audio_text}] }
 * - Bu sayede 03-seslendirme her parçayı ayrı MP3 yapacak
 * - Video tam ses süresine göre senkron olacak
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
FORMAT: ${FORMAT === "shorts" ? "YouTube Shorts (60-90 seconds, 5 quick questions)" : "Long video (10-12 minutes, 25 questions with mixed difficulty)"}

═══════════════════════════════════════════════════
QUIZ STRUCTURE
═══════════════════════════════════════════════════

You will create:
1. **Intro audio** (Jess greets viewers, 2-3 sentences)
2. **${QUESTION_COUNT} questions** with 4 multiple choice answers each
3. **Outro audio** (Jess says goodbye, 2-3 sentences)

For EACH question, you must create:
- The question itself + 4 options
- **question_audio_text**: What Jess SAYS when introducing the question (reads question + 4 options out loud)
- **answer_audio_text**: What Jess SAYS when revealing the answer (confirms correct answer + fun fact)
- image_prompt for the question visual

DIFFICULTY DISTRIBUTION (for ${QUESTION_COUNT} questions):
${FORMAT === "shorts" ? `- Easy: 3 questions (ages 4-7)
- Medium: 2 questions (ages 7-12)` : `- Easy: 8 questions (ages 4-7, basic recognition)
- Medium: 12 questions (ages 7-10, knowledge)
- Hard: 5 questions (ages 10-12, challenging)

QUESTIONS MUST PROGRESS from easy → medium → hard.`}

═══════════════════════════════════════════════════
AUDIO TEXT FORMAT (CRITICAL!)
═══════════════════════════════════════════════════

**question_audio_text** template (what Jess says when showing the question):
"Question [N]. [Question text]. Is it A: [option1], B: [option2], C: [option3], or D: [option4]?"

Example:
"Question 1. Which animal is the king of the jungle? Is it A: Tiger, B: Lion, C: Cheetah, or D: Leopard?"

**answer_audio_text** template (what Jess says revealing answer):
"The correct answer is [Letter]: [Correct option]! [Fun fact sentence]."

Example:
"The correct answer is B: Lion! Did you know? Lions are the only cats that live in groups called prides!"

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
- **options**: Array of 4 short answers (1-3 words each)
- **correct_answer**: Index 0, 1, 2, or 3
- **difficulty**: "easy", "medium", or "hard"
- **fun_fact**: Short fact sentence (used in answer_audio_text)
- **question_audio_text**: Full sentence Jess SPEAKS when posing the question (includes all 4 options)
- **answer_audio_text**: Full sentence Jess SPEAKS when revealing the answer (includes fun fact)

═══════════════════════════════════════════════════
TITLE & METADATA
═══════════════════════════════════════════════════

**baslik** (YouTube title): Click-worthy with emoji
Example: "🦁 Can YOU Guess All 25 Animals? Kids Quiz with Jess the Fox!"

**aciklama** (description): 150-250 words with hashtags
Include: #KidsQuiz #LearnForKids #EducationalGames #JessTheFox #GeniMiniTests

**thumbnail_prompt**: FLUX prompt for thumbnail background (NO CHARACTERS, just theme scenery)
- Vibrant theme scenery only
- NO ANIMALS, NO CHARACTERS, NO PEOPLE in the image
- Right third should be empty for text overlay
- 16:9, Pixar 3D style, NO TEXT

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
  "baslik": "YouTube title with emoji",
  "thumbnail_prompt": "FLUX prompt - scenery only, NO CHARACTERS",
  "aciklama": "200 word description with hashtags",
  "intro_audio_text": "Jess intro 2-3 sentences",
  "outro_audio_text": "Jess outro 2-3 sentences",
  "questions": [
    {
      "question_text": "Short on-screen text",
      "image_prompt": "Pixar-style image prompt",
      "options": ["A_short", "B_short", "C_short", "D_short"],
      "correct_answer": 0,
      "difficulty": "easy",
      "fun_fact": "Fun fact sentence.",
      "question_audio_text": "Question N. [question_text] Is it A: [opt1], B: [opt2], C: [opt3], or D: [opt4]?",
      "answer_audio_text": "The correct answer is [Letter]: [correct option]! [fun_fact]"
    }
  ]
}

CRITICAL:
- EXACTLY ${QUESTION_COUNT} questions
- All in English
- Image prompts MUST be PIXAR/3D CARTOON
- All child-safe
- Answers SHORT (1-3 words)
- question_audio_text MUST include all 4 options spoken out loud
- answer_audio_text MUST include fun_fact at the end`;

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
          temperature: 0.85,
          maxOutputTokens: 32768,
        },
      });
      
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const json = JSON.parse(text);
      
      if (!json.questions || json.questions.length < QUESTION_COUNT) {
        throw new Error(`Gemini ${json.questions?.length || 0} soru verdi, ${QUESTION_COUNT} gerekli.`);
      }
      
      if (json.questions.length > QUESTION_COUNT) {
        json.questions = json.questions.slice(0, QUESTION_COUNT);
      }
      
      // Validation
      for (let i = 0; i < json.questions.length; i++) {
        const q = json.questions[i];
        if (!q.question_text) throw new Error(`Soru ${i+1}: question_text yok`);
        if (!q.image_prompt) throw new Error(`Soru ${i+1}: image_prompt yok`);
        if (!q.options || q.options.length !== 4) throw new Error(`Soru ${i+1}: 4 option olmalı`);
        if (q.correct_answer === undefined || q.correct_answer < 0 || q.correct_answer > 3) {
          throw new Error(`Soru ${i+1}: correct_answer 0-3 arası olmalı`);
        }
        if (!q.difficulty) q.difficulty = "medium";
        if (!q.fun_fact) q.fun_fact = "";
        
        // Audio text alanları varsayılan oluştur (Gemini eksik verirse)
        if (!q.question_audio_text) {
          const letters = ["A", "B", "C", "D"];
          q.question_audio_text = `Question ${i+1}. ${q.question_text} Is it ` +
            q.options.map((opt, j) => `${letters[j]}: ${opt}`).join(", ") + "?";
        }
        if (!q.answer_audio_text) {
          const letter = ["A", "B", "C", "D"][q.correct_answer];
          q.answer_audio_text = `The correct answer is ${letter}: ${q.options[q.correct_answer]}! ${q.fun_fact}`;
        }
      }
      
      if (!json.intro_audio_text) json.intro_audio_text = "Hi friends! I'm Jess the Fox! Let's play a fun quiz!";
      if (!json.outro_audio_text) json.outro_audio_text = "Great job! Subscribe for more fun! See you next time!";
      if (!json.baslik) json.baslik = `${konu} Quiz for Kids!`;
      if (!json.thumbnail_prompt) {
        json.thumbnail_prompt = `Vibrant ${konu} themed background scenery, Pixar 3D style, NO CHARACTERS, NO ANIMALS, NO PEOPLE, kid-friendly, bright colors, 16:9, NO TEXT`;
      }
      
      json.ai_gorsel_prompts = json.questions.map(q => q.image_prompt);
      json.ai_klip_prompts = [];
      json.pexels_anahtar_kelimeler = [];
      
      // Senaryo: Tüm ses parçalarının birleşimi (backward compat için)
      json.senaryo = [
        json.intro_audio_text,
        ...json.questions.map(q => `${q.question_audio_text} ${q.answer_audio_text}`),
        json.outro_audio_text
      ].join("\n\n");
      
      json.tts_telaffuz = json.senaryo;
      json.muzik_mood = "kids";
      
      console.log(`İçerik üretildi: ${json.baslik}`);
      console.log(`${json.questions.length} soru, format: ${FORMAT}`);
      console.log(`Zorluk: ${
        ["easy", "medium", "hard"].map(d => 
          `${d}=${json.questions.filter(q => q.difficulty === d).length}`
        ).join(", ")
      }`);
      
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
      `📺 Format: ${FORMAT === "shorts" ? "Shorts (60-90s)" : "Long (10-12 min)"}\n` +
      `🆔 \`${JOB_ID}\`\n\n` +
      `⏳ Generating quiz with Jess...`
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
      thumbnail_baslik: "",
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
    
    // questions.json - YENİ FORMAT (audio segments dahil)
    const tmpDir = "/tmp/quiz-data";
    fs.mkdirSync(tmpDir, { recursive: true });
    const questionsPath = path.join(tmpDir, "questions.json");
    fs.writeFileSync(questionsPath, JSON.stringify({
      format: FORMAT,
      konu: konu,
      baslik: icerik.baslik,
      intro_audio_text: icerik.intro_audio_text,
      outro_audio_text: icerik.outro_audio_text,
      questions: icerik.questions, // Her q'da question_audio_text + answer_audio_text var
    }, null, 2));
    
    console.log(`questions.json yazıldı: ${questionsPath}`);
    
    await driveDosyaYukle(
      { filename: "questions.json", filepath: questionsPath },
      anaKlasor.id,
      "application/json"
    );
    
    console.log(`✓ questions.json Drive'a yüklendi`);
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    
    await telegram(
      CHAT_ID,
      `📝 *Quiz ready!*\n\n` +
      `📌 ${icerik.baslik}\n` +
      `📺 ${FORMAT}\n` +
      `❓ ${icerik.questions.length} questions (2 audio per question)\n` +
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
