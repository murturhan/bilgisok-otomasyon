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
  
  // YENİ: Reveal anında bayrak veya cevabı sembolize eden görsel (opsiyonel)
  // - Coğrafya quizleri için bayrak emoji veya bayrak image_path
  // - Diğer konular için: doğru cevabın yakın çekim/etiketli görseli
  reveal_image_path: z.string().optional(),
  
  question_audio_path: z.string().optional(),
  answer_audio_path: z.string().optional(),
  question_audio_duration: z.number().default(8.0),
  answer_audio_duration: z.number().default(8.0),
});

export type Question = z.infer<typeof questionSchema>;

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
  questions: z.array(questionSchema),
  
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
  // Sıvı progress bar dolan sesi (Quiz Blitz tarzı)
  sfx_progress: z.string().optional(),
  // Outro alkış sesi - "GREAT JOB!" göründüğünde çalar
  sfx_applause: z.string().optional(),
  
  channel_name: z.string().default("GeniMini Tests"),
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
