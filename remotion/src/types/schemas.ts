import { z } from "zod";

export const questionSchema = z.object({
  question_text: z.string(),
  image_url: z.string().url().optional(),
  image_path: z.string().optional(),
  options: z.array(z.string()).length(4),
  correct_answer: z.number().int().min(0).max(3),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  fun_fact: z.string().default(""),
  
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
});

export type JessPoses = z.infer<typeof jessPosesSchema>;

export const quizCompositionSchema = z.object({
  title: z.string().default("GeniMini Tests"),
  topic: z.string().default(""),
  questions: z.array(questionSchema),
  
  intro_audio_path: z.string().optional(),
  outro_audio_path: z.string().optional(),
  intro_audio_duration: z.number().default(5.0),
  outro_audio_duration: z.number().default(5.0),
  
  jess_poses: jessPosesSchema.default({}),
  background_music_url: z.string().optional(),
  
  // SFX paths
  sfx_tick: z.string().optional(),
  sfx_drum: z.string().optional(),
  sfx_correct: z.string().optional(),
  sfx_whoosh: z.string().optional(),
  
  channel_name: z.string().default("GeniMini Tests"),
});

export type QuizCompositionProps = z.infer<typeof quizCompositionSchema>;

export const defaultQuizProps: QuizCompositionProps = {
  title: "GeniMini Tests",
  topic: "Animals",
  channel_name: "GeniMini Tests",
  intro_audio_duration: 5.0,
  outro_audio_duration: 5.0,
  jess_poses: {},
  questions: [
    {
      question_text: "Which animal is the king of the jungle?",
      options: ["Tiger", "Lion", "Cheetah", "Leopard"],
      correct_answer: 1,
      difficulty: "easy",
      fun_fact: "Lions are the only cats that live in groups called prides!",
      question_audio_duration: 8.0,
      answer_audio_duration: 8.0,
    },
    {
      question_text: "Which is the largest land animal?",
      options: ["Hippo", "Rhino", "Elephant", "Giraffe"],
      correct_answer: 2,
      difficulty: "easy",
      fun_fact: "African elephants can weigh up to 6 tons!",
      question_audio_duration: 8.0,
      answer_audio_duration: 8.0,
    },
    {
      question_text: "Which animal is known for its long neck?",
      options: ["Giraffe", "Camel", "Llama", "Ostrich"],
      correct_answer: 0,
      difficulty: "easy",
      fun_fact: "Giraffes can reach 6 meters tall!",
      question_audio_duration: 8.0,
      answer_audio_duration: 8.0,
    },
    {
      question_text: "Which bird cannot fly?",
      options: ["Eagle", "Owl", "Penguin", "Sparrow"],
      correct_answer: 2,
      difficulty: "medium",
      fun_fact: "Penguins are excellent swimmers instead!",
      question_audio_duration: 8.0,
      answer_audio_duration: 8.0,
    },
    {
      question_text: "Which is the fastest land animal?",
      options: ["Lion", "Horse", "Cheetah", "Greyhound"],
      correct_answer: 2,
      difficulty: "medium",
      fun_fact: "Cheetahs can run up to 120 km/h!",
      question_audio_duration: 8.0,
      answer_audio_duration: 8.0,
    },
  ],
};
