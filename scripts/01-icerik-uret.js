// REV 016/20JUN26 - gemini prompt'tan cartoon/Pixar/3D stil sirintisi kaldirildi
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
import { GORSEL_STILLERI, DEFAULT_STIL } from "./lib/gorsel-stilleri.js";

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
const IS_TEST_MODE = process.env.TEST_MODE === "true" || process.env.TEST_MODE === "1";
const QUESTION_COUNT = IS_TEST_MODE ? 1 : (FORMAT === "shorts" ? 5 : 25);
const QUESTION_TYPE = process.env.QUESTION_TYPE || "multiple_choice";
const IS_WYR = QUESTION_TYPE === "would_you_rather";

// /uret form override parametreleri
const KONU_OVERRIDE = process.env.KONU_OVERRIDE || null;
const N_SORU_OVERRIDE = process.env.N_SORU ? parseInt(process.env.N_SORU) : null;
const DIL = process.env.DIL || "English";
const SORU_TIPI_JSON_STR = process.env.SORU_TIPI_JSON || null;
const INCLUDE_INTRO = process.env.INCLUDE_INTRO !== "false";
const INCLUDE_OUTRO = process.env.INCLUDE_OUTRO !== "false";
const GORSEL_STILI_ENV = process.env.GORSEL_STILI || DEFAULT_STIL;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanPrompt(p) {
  if (!p) return "";
  // Remove Jess/fox character references first (before style cleanup)
  p = p.replace(/jess\s*(the\s*)?fox|jess\s*karakteri?|fox\s*character|fox\s*mascot|the\s*fox\s*mascot|cartoon\s+fox|a\s+fox\s+wearing|a\s+fox\s+holding|a\s+fox\s+presenting|fox\s+holding|fox\s+presenting/gi, "");
  // Remove empty parentheses left after character removal
  p = p.replace(/\(\s*\)/g, "");
  // Remove style keywords — style is appended separately via gorsel-stilleri.js
  p = p.replace(/watercolor\s+painting(?:\s+style)?|pencil\s+sketch(?:\s+style)?|(?:pixar|cartoon|anime|watercolor|pencil\s*sketch|realistic)[\s-]*(?:3d\s+)?(?:animation\s+)?style|pixar\s*3d|photorealistic|3d\s+animation|stylized|\bcartoon\b/gi, "");
  return p.replace(/,\s*,+/g, ",").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
}

function wyrGeminiPrompt(konu, QUESTION_COUNT, FORMAT) {
  return `You are creating "Would You Rather?" questions for a kids YouTube quiz channel (ages 4-12).
Host: Jess the Fox (cute friendly fox)

TASK: Generate ${QUESTION_COUNT} "Would You Rather?" questions.

Each question: one option is VISIBLE (kids know what they're picking), one is a SURPRISE BOX (contents revealed after timer).

Mix surprise_is_good: roughly half good, half bad. Keep it funny and kid-appropriate.

VISIBLE options examples: "100,000 TL", "A Puppy", "Infinite Pizza", "A Unicorn", "A Week Vacation"
GOOD surprise outcomes: "A Million TL!", "A Real Dragon!", "Magic Powers!", "Your Own Island!"
BAD surprise outcomes: "Empty Box 😅", "Homework for a Month!", "No Internet for a Week!", "A Spider Collection"

OUTPUT (valid JSON, no markdown):
{
  "konu": "${konu}",
  "format": "${FORMAT}",
  "intro_title": "**Would** You Rather?",
  "topic_emojis": ["🤔","🎁","✨","🎯","🎉"],
  "baslik": "Would You Rather? Kids Edition with Jess the Fox! 🤔",
  "thumbnail_title": "Would You Rather?",
  "thumbnail_obje_1": "Gift Box",
  "thumbnail_obje_2": "Question Mark",
  "thumbnail_prompt": "Colorful split screen with question marks and gift boxes, vibrant colors, no characters",
  "background_prompt": "Colorful background with floating question marks and ribbons, soft blur, center empty, vibrant colors",
  "aciklama": "Play Would You Rather with Jess the Fox! ${QUESTION_COUNT} fun questions for kids. #WouldYouRather #KidsQuiz #JessTheFox #GeniMiniTests",
  "questions": [
    {
      "question_type": "would_you_rather",
      "question_text": "Pick One!",
      "visible_option": {
        "label": "Short label (1-5 words)",
        "image_prompt": "Image showing the visible option item clearly (describe subject/scene, NO style words)"
      },
      "surprise_option": {
        "label": "Sürpriz Kutu",
        "surprise_outcome": "Short reveal label (1-6 words)",
        "surprise_image_prompt": "Image showing the surprise outcome (describe what is revealed, NO style words)",
        "surprise_is_good": true
      },
      "jess_reaction": "What Jess says when revealing (excited for good, funny for bad)",
      "question_audio_text": "Question 1. Would you rather have [visible option], or open this mystery surprise box? You have 10 seconds to decide!",
      "reveal_audio_text": "What Jess says when opening the box (= jess_reaction, natural speech)"
    }
  ]
}

CRITICAL:
- EXACTLY ${QUESTION_COUNT} questions
- question_type MUST be "would_you_rather" for all
- Mix surprise_is_good: roughly half true, half false
- All content kid-safe (ages 4-12)
- question_text MUST be exactly "Pick One!" — do not change it
- reveal_audio_text = jess_reaction as natural speech
- image_prompt and surprise_image_prompt MUST describe ONLY the option/outcome subject. CRITICAL: NEVER use style keywords. Forbidden words: cartoon, Pixar, 3D, animation, anime, watercolor, sketch, photorealistic, realistic, stylized. Style is applied at render time. NO character/fox/Jess references.
- IMPORTANT: Image prompts should describe ONLY the scene content (subjects, objects, action, environment, colors). DO NOT include any style keywords like "Pixar 3D", "cartoon style", "photorealistic", "anime style", "watercolor", "pencil sketch". Style will be applied separately at render time.
- IMPORTANT — Image prompt rules: DO NOT include any characters, mascots, foxes, or animals UNLESS the question is specifically about that animal. DO NOT mention "Jess", "Jess the Fox", "fox character", "mascot", "cartoon character", or any character presenting/holding/showing things. Image should be the subject alone. BAD: "a fox presenting a gift box". GOOD: "a colorful gift box with ribbons, sparkles around it". The mascot will be added separately during rendering.
`;
}

async function icerikUret(konu, nSoruArg = null, isWyrArg = null) {
  const effectiveCount = nSoruArg !== null ? nSoruArg : QUESTION_COUNT;
  const effectiveIsWyr = isWyrArg !== null ? isWyrArg : IS_WYR;
  const effectiveDil = DIL || "English";
  console.log(`Gemini quiz üretiyor: "${konu}", format: ${FORMAT}, ${effectiveCount} soru, isWyr: ${effectiveIsWyr}, dil: ${effectiveDil}`);

  const geminiKeys = [GEMINI_API_KEY];
  if (GEMINI_API_KEY_2) geminiKeys.push(GEMINI_API_KEY_2);

  const dilNote = effectiveDil !== "English" ? `\n- Language: Write ALL content in ${effectiveDil} (question_text, options, fun_fact, audio texts, baslik, aciklama). Keep field names in English.` : "";
  const prompt = effectiveIsWyr ? wyrGeminiPrompt(konu, effectiveCount, FORMAT) : `You are an expert content creator for "GeniMini Tests" - educational quiz YouTube channel for kids ages 4-12.

Channel mascot: **Jess the Fox** - cute, friendly fox who hosts the quiz.

TOPIC: "${konu}"
FORMAT: ${FORMAT === "shorts" ? "YouTube Shorts (60-90 seconds, 5 quick questions)" : "Long video (10-12 minutes, 25 questions with mixed difficulty)"}

═══════════════════════════════════════════════════
QUIZ STRUCTURE
═══════════════════════════════════════════════════

You will create:
1. **Intro audio** (Jess greets viewers, 2-3 sentences)
2. **${effectiveCount} questions** with 3 multiple choice answers each
3. **Outro audio** (Jess says goodbye, 2-3 sentences)

For EACH question, you must create:
- The question itself + 3 options
- **question_audio_text**: What Jess SAYS when introducing the question (reads question + 3 options out loud)
- **answer_audio_text**: What Jess SAYS when revealing the answer (confirms correct answer + fun fact)
- image_prompt for the question visual

DIFFICULTY DISTRIBUTION (for ${effectiveCount} questions):
${FORMAT === "shorts" ? `- Easy: 3 questions (ages 4-7)
- Medium: 2 questions (ages 7-12)` : `- Easy: 8 questions (ages 4-7, basic recognition)
- Medium: 12 questions (ages 7-10, knowledge)
- Hard: 5 questions (ages 10-12, challenging)

QUESTIONS MUST PROGRESS from easy → medium → hard.`}

═══════════════════════════════════════════════════
QUESTION QUALITY RULES (CRITICAL!)
═══════════════════════════════════════════════════

**AVOID TRIVIAL "WHAT IS THIS?" QUESTIONS.**
BAD: "What is this?" with an apple image. (Too obvious — kids over age 3 know what an apple is.)
BAD: "Guess this object" with a toothbrush image. (Insulting to anyone over age 4.)

**INSTEAD, ASK QUESTIONS THAT REQUIRE KNOWLEDGE OR CURIOSITY:**

Easy (ages 4-7): Still recognition but with a TWIST.
GOOD: "Which fruit grows on the tallest trees?" (with image showing options visually)
GOOD: "Which animal is the fastest runner on land?" (with cheetah/horse/elephant visual)
GOOD: "Which planet is closest to the Sun?" (with solar system visual)

Medium (ages 7-10): Require knowledge.
GOOD: "Which country invented pizza?"
GOOD: "Which vitamin do oranges contain the most of?"
GOOD: "How many continents are there in the world?"

Hard (ages 10-12): Challenging facts.
GOOD: "What was the first man-made object to orbit Earth?" (Sputnik)
GOOD: "Which Greek mathematician is known for his theorem about right triangles?" (Pythagoras)

**For "What's Inside?" or "Cross-section" topics specifically:**
BAD: Apple cross-section → "What is this?" (everyone knows it's an apple)
GOOD: Apple cross-section → "Which part of the apple do you NOT eat?" (Core/seeds)
GOOD: Apple cross-section → "Apple seeds contain a small amount of which substance?" (Cyanide-related, age-appropriate phrasing)

**Topic-specific guidance:** When the topic is given (e.g., "everyday objects"), ASK QUESTIONS ABOUT THE OBJECTS' HISTORY, INVENTION, FUNCTION, OR INTERESTING FACTS — not just identification.

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
- **question_text**: Short text shown on screen — MAX 6 WORDS (e.g., "Which animal is this?")
- **image_prompt**: FLUX prompt for question's image — describe scene content ONLY (NO style words: cartoon, Pixar, 3D, anime, watercolor, realistic)
- CRITICAL: image_prompt and fun_fact_image_prompt MUST NEVER contain ANY style adjectives. Forbidden words: cartoon, Pixar, 3D, animation, anime, watercolor, sketch, photorealistic, realistic, stylized. Just describe what the image shows (subject, action, environment, mood).
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

**thumbnail_title**: SHORT QUESTION format like "Which Ocean Animal?", "Which Dinosaur?", "Which Planet?". Maximum 3-4 words.

**thumbnail_obje_1** and **thumbnail_obje_2**: Two iconic objects from the topic (e.g. "Octopus", "Starfish"). Used for 2-object FLUX image.

**thumbnail_prompt**: FLUX prompt for thumbnail background (NO CHARACTERS, just theme scenery)
- Vibrant theme scenery only
- NO ANIMALS, NO CHARACTERS, NO PEOPLE in the image
- Right third should be empty for text overlay
- 16:9, NO TEXT, vibrant colors

**background_prompt**: FLUX prompt for VIDEO BACKGROUND (will be used behind all UI in the video)
- Empty scenic environment related to the topic
- HEAVY blur / soft focus / depth of field (it's a BACKGROUND, must not distract)
- Vibrant colors, kid-friendly atmosphere
- NO characters, NO animals, NO people, NO faces
- NO text, NO logos
- Center area MUST be soft/empty (UI elements go there)
- Edges can have subtle thematic decorative elements (e.g. for food: blurred utensils on edges; for space: distant stars)
- Kid-friendly atmosphere
- Examples:
  * Food topic: "Cozy blurred kitchen interior, warm orange lighting, decorative pans on edges, center empty, NO food"
  * Ocean topic: "Underwater scene with blurred coral on edges, deep teal-blue gradient, light rays from above, center open water, NO sea creatures"
  * Space topic: "Cosmic galaxy with swirling purple nebula at edges, golden stars scattered, deep dark center, NO planets in center"
  * Animals topic: "Savanna at sunset with blurred acacia trees on edges, warm orange-purple sky, center open grassland, NO animals"

═══════════════════════════════════════════════════
SAFETY (Made for Kids)
═══════════════════════════════════════════════════

- NO scary content, violence, weapons
- All visuals vibrant, colorful, kid-friendly atmosphere
- All content appropriate for ages 4-12

═══════════════════════════════════════════════════
TOPIC: ${konu}
QUESTION COUNT: ${QUESTION_COUNT}
═══════════════════════════════════════════════════

JSON OUTPUT (must be valid JSON, no markdown):

{
  "konu": "${konu}",
  "intro_title": "Topic as intro big title — wrap the most important 1-2 words with **double stars** (e.g. '**Wild** Animals' or 'Amazing **Oceans**')",
  "format": "${FORMAT}",
  "topic_emojis": ["🎯", "📚", "💡", "🔍", "🌟"],
  "baslik": "Long YouTube title with emoji",
  "thumbnail_title": "Which Ocean Animal? (short question format, max 3-4 words)",
  "thumbnail_obje_1": "Octopus",
  "thumbnail_obje_2": "Starfish",
  "thumbnail_prompt": "FLUX prompt - scenery only, NO CHARACTERS",
  "background_prompt": "FLUX prompt - blurred topic-themed background, depth of field, center empty for UI",
  "aciklama": "200 word description with hashtags",
  "questions": [
    {
      "question_text": "Short on-screen text",
      "show_image": true,
      "image_prompt": "image showing the question subject — describe what you see, NO style words",
      "fun_fact_image_prompt": "image illustrating the fun fact (different scene — e.g. if fun_fact is 'Pizza invented in Naples 1889', show a chef in Naples 1889)",
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
- EXACTLY ${effectiveCount} question${effectiveCount === 1 ? "" : "s"}
- All in English${dilNote}
- Image prompts MUST be PIXAR/3D CARTOON
- All child-safe
- Answers SHORT (1-3 words)
- question_audio_text MUST include all 3 options spoken out loud
- answer_audio_text MUST include fun_fact at the end
- **fun_fact_image_prompt MUST illustrate the fun fact narrative** (different scene from question image - e.g. if fun fact is about Eiffel Tower being 330m tall, show the Eiffel Tower with measurement; if about pizza invented in Naples 1889, show a chef in old Naples kitchen)
- fun_fact_image_prompt should describe the scene content only, NO TEXT, NO style words
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
- baslik is the LONG YouTube title (10-15 words with emoji), separate from thumbnail_title
- **question_text MUST be MAX 6 WORDS** — short and impactful, never exceed 6 words. Wrong: "What is the name of the largest ocean on Earth?". Right: "Which is Earth's largest ocean?"
- **intro_title CRITICAL — MANDATORY STARS**: Short topic title for the video intro screen (MAX 4 WORDS). You MUST wrap the 1-2 most important words with **double stars**. Examples: "**Wild** Animals", "Amazing **Oceans**", "**Rocket** Science", "**Dino** World". NEVER output intro_title without ** markers — it MUST contain ** or the UI breaks. Wrong: "Animal Adaptations". Right: "**Animal** Adaptations".
- **show_image** (boolean, per question): Decide if showing the image during question helps or spoils.
  * TRUE — image is a visual *clue* (blurred during guess, revealed with confetti). Examples: cross-sections, silhouettes, partial views, mood scenes.
  * FALSE — image would obviously reveal the answer ("What is this?" with clear apple photo → false). Shows fancy "?" placeholder instead.
  * Default to FALSE when uncertain. Better hidden than spoiled.
- IMPORTANT: Image prompts should describe ONLY the scene content (subjects, objects, action, environment, colors). DO NOT include any style keywords like "Pixar 3D", "cartoon style", "photorealistic", "anime style", "watercolor", "pencil sketch". Style will be applied separately at render time.
- IMPORTANT — Image prompt rules: DO NOT include any characters, mascots, foxes, or animals UNLESS the question is specifically about that animal. DO NOT mention "Jess", "Jess the Fox", "fox character", "mascot", "cartoon character", or any character presenting/holding/showing things. Image should be the subject of the question alone, in its natural environment. BAD: "a fox wearing a chef hat holding a pizza". GOOD: "a delicious pepperoni pizza on a wooden peel, vibrant colors, kitchen background". BAD: "Jess the Fox standing next to a planet". GOOD: "planet Saturn with its rings, cosmic background". The mascot will be added separately during rendering. Image prompts must NEVER contain characters unless the question is specifically about an animal species.

═══════════════════════════════════════════════════
HIGHLIGHTED WORDS (for animated text on screen)
═══════════════════════════════════════════════════

In **question_text** and **fun_fact**, mark 1-3 key words with **bold** markers using \`**word**\` syntax:
- Highlight the most important or interesting concept words
- Example fun_fact: "**Lions** are the only cats that live in groups called **prides**!"
- Example question_text: "Which animal can hold its breath for **22 minutes**?"
- Keep it natural — only highlight words that deserve emphasis
- DO NOT highlight more than 3 words per sentence
- Plain text without markers is fine if nothing stands out

═══════════════════════════════════════════════════
TOPIC EMOJIS (for intro screen emoji band)
═══════════════════════════════════════════════════

**topic_emojis**: 5 emojis representing the TOPIC CONCEPT/OBJECTS — NOT the answer choices.
- These appear as a decorative emoji band in the intro screen
- They should represent WHAT THE TOPIC IS ABOUT, not what the answer options are
- GOOD: "Animal Footprints" → 🐾👣🦶🐾👣 (tracks and paws — the topic itself)
- BAD: "Animal Footprints" → 🐱🦊🐻🐺🦌 (these are answer choices — spoils the quiz!)
- GOOD: "Ocean Animals" → 🌊🐚🐠🌊💧 (ocean elements)
- GOOD: "Fruits" → 🍎🍓🍋🍇🍊 (actual fruits — the topic)
- Use thematic/atmospheric emojis that evoke the topic without revealing answers`;

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
          if (!q.question_text) return false;
          if (effectiveIsWyr) return true; // WYR sorularında options kontrolü yok
          if (!q.options || !Array.isArray(q.options) || q.options.length !== 3) return false;
          if (q.correct_answer === undefined || q.correct_answer < 0 || q.correct_answer > 2) return false;
          return true;
        });
        const sonrakiSayi = json.questions.length;
        if (sonrakiSayi < oncekiSayi) {
          console.log(`⚠ ${oncekiSayi - sonrakiSayi} bozuk soru filtrelendi, ${sonrakiSayi} geçerli`);
        }
      }
      
      // Minimum gereken soru sayısı (tam sayı şart değil - %80 yeter)
      const minQuestions = Math.floor(effectiveCount * 0.8);
      if (!json.questions || json.questions.length < minQuestions) {
        throw new Error(`Gemini ${json.questions?.length || 0} sağlam soru verdi, ${minQuestions} (min) gerekli.`);
      }

      if (json.questions.length > effectiveCount) {
        json.questions = json.questions.slice(0, effectiveCount);
      }
      
      // Validation
      for (let i = 0; i < json.questions.length; i++) {
        const q = json.questions[i];
        if (!q.question_text) throw new Error(`Soru ${i+1}: question_text yok`);
        if (effectiveIsWyr) {
          // WYR soruları için hafif validasyon
          q.question_type = "would_you_rather"; // Gemini bazen unutuyor, garantile
          if (!q.visible_option) q.visible_option = { label: "Option A" };
          if (!q.surprise_option) q.surprise_option = { label: "Sürpriz Kutu", surprise_outcome: "Surprise!", surprise_is_good: true };
          // WYR: stil per-slot kaydet
          q.visible_option.image_stili = GORSEL_STILI_ENV;
          q.surprise_option.surprise_image_stili = GORSEL_STILI_ENV;
          // WYR için ai_gorsel_prompts prompt'larını yükle (stil suffix ile)
          const stilSuffix = GORSEL_STILLERI[GORSEL_STILI_ENV]?.promptAppend || "";
          const vp = cleanPrompt(q.visible_option.image_prompt || `image of ${q.visible_option.label}, kid-friendly, vibrant colors`) + stilSuffix;
          const sp = cleanPrompt(q.surprise_option.surprise_image_prompt || `image of ${q.surprise_option.surprise_outcome}, kid-friendly, vibrant colors`) + stilSuffix;
          json.ai_gorsel_prompts = json.ai_gorsel_prompts || [];
          json.ai_gorsel_prompts.push(vp);
          json.ai_gorsel_prompts.push(sp);
          continue;
        }
        if (!q.image_prompt) throw new Error(`Soru ${i+1}: image_prompt yok`);
        if (!q.options || q.options.length !== 3) throw new Error(`Soru ${i+1}: 3 option olmalı (var: ${q.options?.length})`);
        if (q.correct_answer === undefined || q.correct_answer < 0 || q.correct_answer > 2) {
          throw new Error(`Soru ${i+1}: correct_answer 0-2 arası olmalı`);
        }
        if (!q.difficulty) q.difficulty = "medium";
        if (!q.fun_fact) q.fun_fact = "";
        
        // MC: stil per-slot kaydet
        q.question_image_stili = GORSEL_STILI_ENV;
        q.fact_image_stili = GORSEL_STILI_ENV;

        // fun_fact_image_prompt fallback - Gemini vermediyse, question image prompt + fun fact birleştir
        if (!q.fun_fact_image_prompt) {
          if (q.fun_fact) {
            q.fun_fact_image_prompt = `${q.fun_fact} — illustrated scene, vibrant colors, NO TEXT`;
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
        json.thumbnail_prompt = `Vibrant ${konu} themed background scenery, NO CHARACTERS, NO ANIMALS, NO PEOPLE, bright colors, NO TEXT`;
      }
      
      // background_prompt validation - yoksa konu'dan üret
      if (!json.background_prompt) {
        json.background_prompt = `Blurred ${konu} themed empty environment, Pixar 3D cartoon style, heavy depth of field, soft empty center for UI overlay, decorative thematic elements on edges only, NO characters, NO animals, NO text, kid-friendly bright atmosphere`;
      }
      console.log(`Background prompt: "${json.background_prompt.substring(0, 80)}..."`);

      // ai_gorsel_prompts: her soru için 2 prompt + 1 background (en sonda)
      // MC: q1_question, q1_funfact, ..., background
      // WYR: q1_visible, q1_surprise, ..., background
      if (!effectiveIsWyr) {
        json.ai_gorsel_prompts = [];
        const stilSuffix = GORSEL_STILLERI[GORSEL_STILI_ENV]?.promptAppend || "";
        for (const q of json.questions) {
          json.ai_gorsel_prompts.push(cleanPrompt(q.image_prompt || "") + stilSuffix);
          json.ai_gorsel_prompts.push(cleanPrompt(q.fun_fact_image_prompt || "") + stilSuffix);
        }
      } else {
        // WYR: ai_gorsel_prompts already built in validation loop above
        if (!json.ai_gorsel_prompts) json.ai_gorsel_prompts = [];
      }
      // Background prompt - EN SON
      json.ai_gorsel_prompts.push(json.background_prompt);
      
      json.ai_klip_prompts = [];
      json.pexels_anahtar_kelimeler = [];
      
      // Senaryo: Tüm ses parçalarının birleşimi (backward compat için)
      // Not: intro/outro Jess video kendi sesini taşıdığı için burada yok
      json.senaryo = json.questions
        .map(q => effectiveIsWyr
          ? `${q.question_audio_text || ""} ${q.reveal_audio_text || q.jess_reaction || ""}`
          : `${q.question_audio_text} ${q.answer_audio_text}`)
        .join("\n\n");

      json.tts_telaffuz = json.senaryo;
      json.muzik_mood = "kids";

      console.log(`İçerik üretildi: ${json.baslik}`);
      console.log(`${json.questions.length} soru, format: ${FORMAT}, isWyr: ${effectiveIsWyr}, dil: ${effectiveDil}`);
      if (!effectiveIsWyr) {
        console.log(`Zorluk: ${
          ["easy", "medium", "hard"].map(d =>
            `${d}=${json.questions.filter(q => q.difficulty === d).length}`
          ).join(", ")
        }`);
      }
      
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
    // GECİCİ: Shorts format disabled
    if (FORMAT === "shorts") throw new Error("Shorts şimdilik desteklenmiyor");

    const konu = KONU_OVERRIDE || await konuHavuzundanAl(TARIH, INDEX);
    console.log(`Konu: ${konu}${KONU_OVERRIDE ? " (override)" : ""}`);
    
    await telegram(
      CHAT_ID,
      `🦊 *GeniMini Tests new quiz!*\n\n` +
      `📚 Topic: ${konu}\n` +
      `📺 Format: ${FORMAT === "shorts" ? "Shorts (60-90s)" : "Long (10-12 min)"}\n` +
      `🆔 \`${JOB_ID}\`\n\n` +
      `⏳ Generating quiz with Jess...`
    );
    
    // Karma tip destegi: SORU_TIPI_JSON varsa MC + WYR ayri uret, birlestir
    let icerik;
    if (SORU_TIPI_JSON_STR) {
      let tipiDagilimi;
      try { tipiDagilimi = JSON.parse(SORU_TIPI_JSON_STR); } catch { tipiDagilimi = {}; }
      const mcN = parseInt(tipiDagilimi.multiple_choice) || 0;
      const wyrN = parseInt(tipiDagilimi.would_you_rather) || 0;
      if (mcN > 0 && wyrN > 0) {
        console.log(`Karma tip: ${mcN} MC + ${wyrN} WYR ayri üretiliyor...`);
        const mcIcerik = await icerikUret(konu, mcN, false);
        const wyrIcerik = await icerikUret(konu, wyrN, true);
        icerik = mcIcerik;
        icerik.questions = [...mcIcerik.questions, ...wyrIcerik.questions];
        // Karistir
        for (let k = icerik.questions.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [icerik.questions[k], icerik.questions[r]] = [icerik.questions[r], icerik.questions[k]];
        }
        icerik.ai_gorsel_prompts = [
          ...mcIcerik.ai_gorsel_prompts.slice(0, -1),
          ...wyrIcerik.ai_gorsel_prompts.slice(0, -1),
          icerik.background_prompt,
        ];
        console.log(`Karma üretim tamam: ${icerik.questions.length} soru (${mcN} MC + ${wyrN} WYR)`);
      } else if (wyrN > 0) {
        icerik = await icerikUret(konu, wyrN, true);
      } else {
        icerik = await icerikUret(konu, mcN || N_SORU_OVERRIDE, false);
      }
    } else {
      icerik = await icerikUret(konu, N_SORU_OVERRIDE, null);
    }

    const safeTitle = konu.substring(0, 50).replace(/[^a-zA-Z0-9 ]/g, "");
    const tarihForFolder = TARIH || new Date().toISOString().split("T")[0].replace(/-/g, "");
    const klasorAdi = `${tarihForFolder}-${FORMAT}-${safeTitle}`;
    
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
      is_test_mode: IS_TEST_MODE,
      baslik: icerik.baslik,
      thumbnail_baslik: icerik.thumbnail_title || "",
      thumbnail_alt_baslik: "",
      thumbnail_obje_1: icerik.thumbnail_obje_1 || "",
      thumbnail_obje_2: icerik.thumbnail_obje_2 || "",
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
      topic_emojis: icerik.topic_emojis || [],
      is_test_mode: IS_TEST_MODE,
      skip_intro: !INCLUDE_INTRO,
      skip_outro: !INCLUDE_OUTRO,
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
      `⏳ İçerik onay aşamasına geçiliyor...`
    );

    // 01.5-icerik-onay workflow'u YAML step'i tarafından tetiklenecek (bu scriptten değil)
    console.log("✅ İçerik üretimi tamam. 01.5-icerik-onay workflow YAML'dan tetiklenecek.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    await telegram(CHAT_ID, `❌ *01-İçerik error:* ${error.message.substring(0, 500)}`);
    process.exit(1);
  }
}

main();
