// REV 004/30MAY26 - WouldYouRatherQuestion: surprise_box_image_path/url eklendi
import { z } from "zod";

export const questionSchema = z.object({
  question_text: z.string(),
  image_url: z.string().url().optional(),
  image_path: z.string().optional(),
  fun_fact_image_path: z.string().optional(),
  
  // ⚠️ DEĞİŞTİ: 4 şık → 3 şık (Quiz Blitz tarzı)
  options: z.array(z.string()).length(3),
  option_flags: z.array(z.string()).length(3).optional(),
  
  // ⚠️ DEĞİŞTİ: 0-3 → 0-2
  correct_answer: z.number().int().min(0).max(2),
  
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  fun_fact: z.string().default(""),
  
  /** 
   * Sorunun GÖRSEL göstereceği mi? 
   * - true: Soru sırasında soru görseli görünür (flu başlar, cevap açılınca netleşir + konfeti)
   * - false: Süslü "?" placeholder görünür (cevabı içeren tipte sorular için)
   * 01-icerik-uret otomatik karar verir, kullanıcı onay sayfasından değiştirir.
   */
  show_image: z.boolean().default(true),
  
  // YENİ: Reveal anında bayrak veya cevabı sembolize eden görsel (opsiyonel)
  // - Coğrafya quizleri için bayrak emoji veya bayrak image_path
  // - Diğer konular için: doğru cevabın yakın çekim/etiketli görseli
  reveal_image_path: z.string().optional(),
  
  question_audio_path: z.string().optional(),
  answer_audio_path: z.string().optional(),
  question_audio_duration: z.number().default(8.0),
  answer_audio_duration: z.number().default(8.0),
  question_type: z.string().optional(),
}).passthrough();

export type Question = z.infer<typeof questionSchema>;

export interface WyrVisibleOption {
  label: string;
  image_path?: string;
  image_url?: string;
  image_prompt?: string;
}

export interface WyrSurpriseOption {
  label: string;
  surprise_outcome: string;
  surprise_image_path?: string;
  surprise_image_url?: string;
  surprise_image_prompt?: string;
  surprise_is_good: boolean;
}

export interface WouldYouRatherQuestion {
  question_type: "would_you_rather";
  question_text: string;
  visible_option: WyrVisibleOption;
  surprise_option: WyrSurpriseOption;
  jess_reaction: string;
  question_audio_path?: string;
  reveal_audio_path?: string;
  question_audio_duration: number;
  reveal_audio_duration: number;
  surprise_box_image_path?: string;
  surprise_box_image_url?: string;
}

export type AnyQuestion = Question | WouldYouRatherQuestion;

export function isWyrQuestion(q: AnyQuestion): q is WouldYouRatherQuestion {
  return (q as WouldYouRatherQuestion).question_type === "would_you_rather";
}

export const jessPosesSchema = z.object({
  intro: z.string().optional(),
  question: z.string().optional(),
  thinking: z.string().optional(),
  correct: z.string().optional(),
  outro: z.string().optional(),
  logo: z.string().optional(),
  // YENİ: Geçişlerde kullanılan Jess - daha dinamik poz
  transition: z.string().optional(),
});

export type JessPoses = z.infer<typeof jessPosesSchema>;

export const quizCompositionSchema = z.object({
  title: z.string().default("GeniMini Tests"),
  topic: z.string().default(""),
  questions: z.array(z.any()),
  
  intro_audio_path: z.string().nullable().optional(),
  outro_audio_path: z.string().nullable().optional(),
  intro_audio_duration: z.number().default(7.0),
  outro_audio_duration: z.number().default(8.0),
  
  // Jess video gerçek süresi (Sahne 1 / Sahne 2 ayrım noktası için)
  jess_intro_video_duration: z.number().default(3.0),
  jess_outro_video_duration: z.number().default(2.5),
  
  // Topic announcement - Sahne 2'de oynar
  topic_announce_path: z.string().optional(),
  topic_announce_duration: z.number().default(2.5),
  
  // Outro announcement - Outro Sahne 2 (Subscribe) sahnesinde oynar
  outro_announce_path: z.string().optional(),
  outro_announce_duration: z.number().default(3.5),
  
  jess_poses: jessPosesSchema.default({}),
  background_music_url: z.string().optional(),
  
  // ⚠️ DEĞİŞTİ: background_image_path KALDIRILDI
  // Artık her soru kendi tema rengini SVG pattern ile üretiyor
  // FLUX bg üretimi devre dışı - tutarlı, hızlı, az hata
  
  // SFX (Quiz Blitz tarzı sıvı progress + reveal)
  sfx_tick: z.string().optional(),
  sfx_drum: z.string().optional(),
  sfx_correct: z.string().optional(),
  sfx_whoosh: z.string().optional(),
  sfx_pop_single: z.string().optional(),
  sfx_pop_double: z.string().optional(),
  // Sıvı progress bar dolan sesi (Quiz Blitz tarzı)
  sfx_progress: z.string().optional(),
  // Outro alkış sesi - "GREAT JOB!" göründüğünde çalar
  sfx_applause: z.string().optional(),
  
  channel_name: z.string().default("GeniMini Tests"),

  // Intro Sahne 2'de emoji bandı için (Gemini üretir — opsiyonel, yoksa getTopicEmojis fallback)
  topic_emojis: z.array(z.string()).optional(),

  // Test modunda intro/outro render edilmez, sadece sorular
  is_test_mode: z.boolean().optional().default(false),
});

export type QuizCompositionProps = z.infer<typeof quizCompositionSchema>;

export const defaultQuizProps: QuizCompositionProps = {
  title: "GeniMini Tests",
  topic: "Animals",
  channel_name: "GeniMini Tests",
  intro_audio_duration: 7.0,
  outro_audio_duration: 8.0,
  jess_intro_video_duration: 3.0,
  jess_outro_video_duration: 2.5,
  topic_announce_duration: 2.5,
  outro_announce_duration: 3.5,
  jess_poses: {},
  questions: [
    {
      question_text: "Which animal is the king of the jungle?",
      options: ["Tiger", "Lion", "Cheetah"],
      correct_answer: 1,
      difficulty: "easy",
      fun_fact: "Lions are the only cats that live in groups called prides!",
      question_audio_duration: 8.0,
      answer_audio_duration: 8.0,
    },
    {
      question_text: "Which is the largest land animal?",
      options: ["Hippo", "Elephant", "Giraffe"],
      correct_answer: 1,
      difficulty: "easy",
      fun_fact: "African elephants can weigh up to 6 tons!",
      question_audio_duration: 8.0,
      answer_audio_duration: 8.0,
    },
  ],
};
