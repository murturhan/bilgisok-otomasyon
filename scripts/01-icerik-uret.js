/**
 * 01 - İçerik Üretimi v14 (GeniMini Tests Kids Quiz)
 * v13'ten farkı:
 * - Her soru için AYRI question_audio_text ve answer_audio_text üretir
 * - questions.json'da bu yapı: { questions: [{..., question_audio_text, answer_audio_text}] }
 *   (intro/outro greeting metinleri kaldırıldı - Jess video kendi sesini taşıyor)
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
2. **${QUESTION_COUNT} questions** with 3 multiple choice answers each
3. **Outro audio** (Jess says goodbye, 2-3 sentences)

For EACH question, you must create:
- The question itself + 3 options
- **question_audio_text**: What Jess SAYS when introducing the question (reads question + 3 options out loud)
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
QUESTION OBJECT FORMAT
═══════════════════════════════════════════════════

Each question object MUST have ALL these fields:
- **question_text**: Short text shown on screen (e.g., "Which animal is this?")
- **image_prompt**: FLUX prompt for question's image (Pixar-style, kid-friendly)
- **options**: Array of 3 short answers (1-3 words each)
- **correct_answer**: Index 0, 1, 2, or 3
- **difficulty**: "easy", "medium", or "hard"
- **fun_fact**: Short fact sentence (used in answer_audio_text)
- **question_audio_text**: Full sentence Jess SPEAKS when posing the question (includes all 3 options)
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

**background_prompt**: FLUX prompt for VIDEO BACKGROUND (will be used behind all UI in the video)
- Empty scenic environment related to the topic
- HEAVY blur / soft focus / depth of field (it's a BACKGROUND, must not distract)
- Pixar 3D cartoon style with vibrant colors
- NO characters, NO animals, NO people, NO faces
- NO text, NO logos
- Center area MUST be soft/empty (UI elements go there)
- Edges can have subtle thematic decorative elements (e.g. for food: blurred utensils on edges; for space: distant stars)
- Kid-friendly atmosphere
- Examples:
  * Food topic: "Cozy blurred cartoon kitchen interior, warm orange lighting, decorative pans hanging on edges, center empty wall, NO food in view"
  * Ocean topic: "Underwater scene with blurred coral on edges, deep teal-blue gradient, light rays from above, center open water, NO sea creatures"
  * Space topic: "Cosmic galaxy with swirling purple nebula at edges, golden stars scattered, deep dark center, NO planets in center"
  * Animals topic: "Stylized cartoon savanna at sunset with blurred acacia trees on edges, warm orange-purple sky, center empty grassland, NO animals"

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
  "thumbnail_title": "2-3 WORDS MAX (uppercase, punchy)",
  "thumbnail_prompt": "FLUX prompt - scenery only, NO CHARACTERS",
  "background_prompt": "FLUX prompt - blurred topic-themed background, depth of field, center empty for UI",
  "aciklama": "200 word description with hashtags",
  "questions": [
    {
      "question_text": "Short on-screen text",
      "image_prompt": "Pixar-style image prompt for the QUESTION",
      "fun_fact_image_prompt": "Pixar-style image prompt for the FUN FACT (different scene illustrating the fun fact - e.g. if fun_fact is 'Pizza invented in Naples 1889', show a chef in Naples 1889 cartoon style)",
      "options": ["A_short", "B_short", "C_short"],
      "option_flags": ["🇮🇹", "🇹🇷", "🇫🇷", "🇪🇸"],
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
- question_audio_text MUST include all 3 options spoken out loud
- answer_audio_text MUST include fun_fact at the end
- **fun_fact_image_prompt MUST illustrate the fun fact narrative** (different scene from question image - e.g. if fun fact is about Eiffel Tower being 330m tall, show a Pixar-style Eiffel Tower with measurement; if about pizza invented in Naples 1889, show a cartoon chef in old Naples kitchen)
- fun_fact_image_prompt should be Pixar 3D style, NO TEXT, kid-friendly
- **option_flags**: ALWAYS include flag emojis array (4 items). Logic:
  * If options are COUNTRIES (e.g. "Italy", "France", "Japan", "Brazil"): use country flag emojis ["🇮🇹","🇫🇷","🇯🇵"]
  * If options relate to COUNTRY-ORIGIN (e.g. "Pizza" → Italy, "Sushi" → Japan, "Croissant" → France): use the related country flag
  * If options are NEUTRAL (no country relation, e.g. animals, colors, numbers): use ["","",""] (empty strings)
  * NEVER skip this field - if uncertain, use empty strings
- **background_prompt MUST**:
  * Match the topic theme but be GENERIC (no specific objects in center)
  * Have HEAVY BLUR / depth of field (it's a background, not foreground)
  * Have empty soft center for UI overlay
  * NO characters, NO animals, NO text
  * Be Pixar 3D cartoon style
- **thumbnail_title MUST be 2-3 WORDS MAX, UPPERCASE, PUNCHY** (examples: "FOOD QUIZ", "GUESS THE ANIMAL", "OCEAN QUIZ", "TRUCK CHALLENGE", "MIGHTY MACHINES")
- thumbnail_title is for the thumbnail image (LARGE TEXT), NOT for YouTube title
- baslik is the LONG YouTube title (10-15 words with emoji), separate from thumbnail_title`;

  const maxRetries = 5;
  // Sadece güçlü model kullan - flash-lite bozuk JSON üretiyor
  const modeller = ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash"];
  
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
      
      // ÖNCE BOZUK SORULARI FİLTRELE - eksik options veya correct_answer olanları at
      if (json.questions && Array.isArray(json.questions)) {
        const oncekiSayi = json.questions.length;
        json.questions = json.questions.filter((q) => {
          if (!q.options || !Array.isArray(q.options) || q.options.length !== 3) return false;
          if (q.correct_answer === undefined || q.correct_answer < 0 || q.correct_answer > 2) return false;
          if (!q.question_text) return false;
          return true;
        });
        const sonrakiSayi = json.questions.length;
        if (sonrakiSayi < oncekiSayi) {
          console.log(`⚠ ${oncekiSayi - sonrakiSayi} bozuk soru filtrelendi, ${sonrakiSayi} geçerli`);
        }
      }
      
      // Minimum gereken soru sayısı (tam sayı şart değil - %80 yeter)
      const minQuestions = Math.floor(QUESTION_COUNT * 0.8);
      if (!json.questions || json.questions.length < minQuestions) {
        throw new Error(`Gemini ${json.questions?.length || 0} sağlam soru verdi, ${minQuestions} (min) gerekli.`);
      }
      
      if (json.questions.length > QUESTION_COUNT) {
        json.questions = json.questions.slice(0, QUESTION_COUNT);
      }
      
      // Validation
      for (let i = 0; i < json.questions.length; i++) {
        const q = json.questions[i];
        if (!q.question_text) throw new Error(`Soru ${i+1}: question_text yok`);
        if (!q.image_prompt) throw new Error(`Soru ${i+1}: image_prompt yok`);
        if (!q.options || q.options.length !== 3) throw new Error(`Soru ${i+1}: 3 option olmalı (var: ${q.options?.length})`);
        if (q.correct_answer === undefined || q.correct_answer < 0 || q.correct_answer > 2) {
          throw new Error(`Soru ${i+1}: correct_answer 0-2 arası olmalı`);
        }
        if (!q.difficulty) q.difficulty = "medium";
        if (!q.fun_fact) q.fun_fact = "";
        
        // fun_fact_image_prompt fallback - Gemini vermediyse, question image prompt + fun fact birleştir
        if (!q.fun_fact_image_prompt) {
          if (q.fun_fact) {
            q.fun_fact_image_prompt = `Pixar 3D cartoon illustration: ${q.fun_fact}, kid-friendly, vibrant colors, NO TEXT`;
          } else {
            // Soru görselini reuse
            q.fun_fact_image_prompt = q.image_prompt;
          }
        }
        
        // option_flags validation - 4 string array, yoksa boş
        if (!q.option_flags || !Array.isArray(q.option_flags) || q.option_flags.length !== 3) {
          q.option_flags = ["", "", ""];
        }
        // String'e çevir (emoji unicode için emniyet)
        q.option_flags = q.option_flags.map(f => String(f || ""));
        
        // ŞIK KARIŞTIRMA (kullanıcı talebi: Gemini hep correct_answer=0 veriyordu)
        // options + option_flags'i rastgele permute et, correct_answer index'i ona göre güncelle
        {
          const correctOpt = q.options[q.correct_answer];
          const correctFlag = q.option_flags[q.correct_answer];
          // 3 elemanlı [option, flag, wasCorrect] dizisi yap
          const pairs = q.options.map((opt, idx) => ({
            option: opt,
            flag: q.option_flags[idx] || "",
            wasCorrect: idx === q.correct_answer,
          }));
          // Fisher-Yates shuffle
          for (let k = pairs.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1));
            [pairs[k], pairs[r]] = [pairs[r], pairs[k]];
          }
          q.options = pairs.map(p => p.option);
          q.option_flags = pairs.map(p => p.flag);
          q.correct_answer = pairs.findIndex(p => p.wasCorrect);
          // Sanity check
          if (q.options[q.correct_answer] !== correctOpt) {
            throw new Error(`Soru ${i+1}: shuffle bozuldu`);
          }
        }
        
        // Audio text alanları SHUFFLE SONRASI yeniden inşa et
        // (Gemini'nin verdiği metinler eski sıraya göreydi, geçersiz artık)
        {
          const letters = ["A", "B", "C"];
          q.question_audio_text = `Question ${i+1}. ${q.question_text} Is it ` +
            q.options.map((opt, j) => `${letters[j]}: ${opt}`).join(", ") + "?";
          const letter = letters[q.correct_answer];
          q.answer_audio_text = `The correct answer is ${letter}: ${q.options[q.correct_answer]}! ${q.fun_fact}`;
        }
      }
      
      if (!json.baslik) json.baslik = `${konu} Quiz for Kids!`;
      
      // thumbnail_title validate - 2-3 kelime, uppercase, max 16 karakter
      if (!json.thumbnail_title) {
        // Konu'dan otomatik üret
        const konuTemiz = konu.replace(/[:!?].*$/g, "").trim(); // İlk : veya ! sonrasını at
        const kelimeler = konuTemiz.split(/\s+/).slice(0, 2);
        json.thumbnail_title = kelimeler.join(" ").toUpperCase() + " QUIZ";
      } else {
        // Çok uzun ise kısalt
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
      
      // background_prompt validation - yoksa konu'dan üret
      if (!json.background_prompt) {
        json.background_prompt = `Blurred ${konu} themed empty environment, Pixar 3D cartoon style, heavy depth of field, soft empty center for UI overlay, decorative thematic elements on edges only, NO characters, NO animals, NO text, kid-friendly bright atmosphere`;
      }
      console.log(`Background prompt: "${json.background_prompt.substring(0, 80)}..."`);

      // ai_gorsel_prompts: her soru için 2 prompt (question + fun_fact) + 1 background (en sonda)
      // Sıra: q1_question, q1_funfact, q2_question, q2_funfact, ..., background
      // 02-gorsel-uret bunu sıralı işler ve q01.jpg, q01-fact.jpg, ..., background.jpg
      json.ai_gorsel_prompts = [];
      for (const q of json.questions) {
        json.ai_gorsel_prompts.push(q.image_prompt);
        json.ai_gorsel_prompts.push(q.fun_fact_image_prompt);
      }
      // Background prompt - EN SON
      json.ai_gorsel_prompts.push(json.background_prompt);
      
      json.ai_klip_prompts = [];
      json.pexels_anahtar_kelimeler = [];
      
      // Senaryo: Tüm ses parçalarının birleşimi (backward compat için)
      // Not: intro/outro Jess video kendi sesini taşıdığı için burada yok
      json.senaryo = json.questions
        .map(q => `${q.question_audio_text} ${q.answer_audio_text}`)
        .join("\n\n");
      
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
      thumbnail_baslik: icerik.thumbnail_title || "",  // YENİ: 2-3 kelime kısa başlık
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
    
    // questions.json'a da ekle (07-video-montaj da görsel için kullanır)
    const tmpDir = "/tmp/quiz-data";
    fs.mkdirSync(tmpDir, { recursive: true });
    const questionsPath = path.join(tmpDir, "questions.json");
    fs.writeFileSync(questionsPath, JSON.stringify({
      format: FORMAT,
      konu: konu,
      baslik: icerik.baslik,
      thumbnail_title: icerik.thumbnail_title || "",
      background_prompt: icerik.background_prompt || "",
      questions: icerik.questions,
    }, null, 2));
    
    console.log(`questions.json yazıldı: ${questionsPath}`);
    
    // 02-ses alt klasörünü bul ve oraya yükle
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
