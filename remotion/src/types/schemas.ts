import { z } from "zod";

// Tek bir soru
export const questionSchema = z.object({
  question_text: z.string(),
  image_url: z.string().url().optional(), // staticFile() ile geçilecek path veya URL
  image_path: z.string().optional(),       // staticFile içinde path
  options: z.array(z.string()).length(4),
  correct_answer: z.number().int().min(0).max(3),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  fun_fact: z.string().default(""),
});

export type Question = z.infer<typeof questionSchema>;

// Jess karakter pose'ları (path'ler staticFile()'a relatif)
export const jessPosesSchema = z.object({
  intro: z.string().optional(),
  question: z.string().optional(),
  thinking: z.string().optional(),
  correct: z.string().optional(),
  outro: z.string().optional(),
});

export type JessPoses = z.infer<typeof jessPosesSchema>;

// Composition input props
export const quizCompositionSchema = z.object({
  // İçerik
  title: z.string().default("GeniMini Tests"),
  topic: z.string().default(""),
  questions: z.array(questionSchema),
  intro_text: z.string().default("Hi friends! I'm Jess the Fox! Let's play!"),
  outro_text: z.string().default("Thanks for playing! See you next time!"),
  
  // Görsel materyaller (staticFile veya URL)
  jess_poses: jessPosesSchema.default({}),
  
  // Ses (Remotion içinde Audio component ile çalınacak)
  // Bu MP3 tüm video boyunca devam edecek (Jess konuşması)
  voice_audio_url: z.string().optional(),
  background_music_url: z.string().optional(),
  
  // Tema (gelecekte multi-language için)
  channel_name: z.string().default("GeniMini Tests"),
});

export type QuizCompositionProps = z.infer<typeof quizCompositionSchema>;

// Default props (testing için)
export const defaultQuizProps: QuizCompositionProps = {
  title: "GeniMini Tests",
  topic: "Animals",
  channel_name: "GeniMini Tests",
  intro_text: "Hi friends! I'm Jess the Fox! Today we're exploring animals!",
  outro_text: "Great job! Subscribe for more fun quizzes! See you next time!",
  jess_poses: {},
  questions: [
    {
      question_text: "Which animal is the king of the jungle?",
      options: ["Tiger", "Lion", "Cheetah", "Leopard"],
      correct_answer: 1,
      difficulty: "easy",
      fun_fact: "Lions are the only cats that live in groups called prides!",
    },
    {
      question_text: "Which is the largest land animal?",
      options: ["Hippo", "Rhino", "Elephant", "Giraffe"],
      correct_answer: 2,
      difficulty: "easy",
      fun_fact: "African elephants can weigh up to 6 tons!",
    },
    {
      question_text: "Which animal is known for its long neck?",
      options: ["Giraffe", "Camel", "Llama", "Ostrich"],
      correct_answer: 0,
      difficulty: "easy",
      fun_fact: "Giraffes can reach 6 meters tall!",
    },
    {
      question_text: "Which bird cannot fly?",
      options: ["Eagle", "Owl", "Penguin", "Sparrow"],
      correct_answer: 2,
      difficulty: "medium",
      fun_fact: "Penguins are excellent swimmers instead!",
    },
    {
      question_text: "Which is the fastest land animal?",
      options: ["Lion", "Horse", "Cheetah", "Greyhound"],
      correct_answer: 2,
      difficulty: "medium",
      fun_fact: "Cheetahs can run up to 120 km/h!",
    },
  ],
};
