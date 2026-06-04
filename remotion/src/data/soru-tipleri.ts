// REV 001/04JUN26 - soru tipi registry TypeScript (Parça 1/4 refactor)

export interface ImageSlot {
  key: string;
  label: string;
  size: string;
  prompt_key: string;
}

export interface EmojiSlot {
  key: string;
  label: string;
  count: number;
}

export interface SoruTipi {
  type: string;
  label: string;
  schema: Record<string, unknown>;
  image_slots: ImageSlot[];
  emoji_slots: EmojiSlot[];
  template: Record<string, unknown>;
  scene_component: string;
}

export const SORU_TIPLERI: Record<string, SoruTipi> = {
  multiple_choice: {
    type: "multiple_choice",
    label: "Çoktan Seçmeli",
    schema: {
      question_text: { type: "string", editable: true, required: true },
      options: { type: "array", editable: true, length: 3, itemType: "string" },
      correct_answer: { type: "number", editable: true, range: [0, 2] },
      fact_text: { type: "string", editable: true, required: true },
      jess_speech: { type: "string", editable: true, required: true },
    },
    image_slots: [
      { key: "question_image", label: "Soru Görseli", size: "1920x1080", prompt_key: "image_prompt" },
      { key: "fact_image", label: "Fact Görseli", size: "1920x1080", prompt_key: "fun_fact_image_prompt" }
    ],
    emoji_slots: [
      { key: "option_emojis", label: "Şık Emojileri", count: 3 }
    ],
    template: {
      question_text: "",
      options: ["", "", ""],
      correct_answer: 0,
      fact_text: "",
      jess_speech: "",
      image_prompt: "",
      fun_fact_image_prompt: "",
      option_emojis: ["❓", "❓", "❓"]
    },
    scene_component: "QuestionScene"
  },

  would_you_rather: {
    type: "would_you_rather",
    label: "Hangisini Tercih Edersin",
    schema: {
      question_text: { type: "string", default: "Pick One!", editable: false },
      visible_option: {
        label: { type: "string", editable: true, required: true },
        image_prompt: { type: "string", editable: true }
      },
      surprise_option: {
        label: { type: "string", editable: true, default: "Surprise Box" },
        surprise_outcome: { type: "string", editable: true, required: true },
        surprise_image_prompt: { type: "string", editable: true },
        surprise_is_good: { type: "boolean", editable: true }
      },
      jess_reaction: { type: "string", editable: true, required: true },
      jess_speech: { type: "string", editable: true, required: true }
    },
    image_slots: [
      { key: "visible_image", label: "Görünür Seçenek Görseli", size: "1920x1080", prompt_key: "visible_option.image_prompt" },
      { key: "surprise_image", label: "Sürpriz Açılış Görseli", size: "1920x1080", prompt_key: "surprise_option.surprise_image_prompt" }
    ],
    emoji_slots: [],
    template: {
      question_text: "Pick One!",
      visible_option: { label: "", image_prompt: "" },
      surprise_option: { label: "Surprise Box", surprise_outcome: "", surprise_image_prompt: "", surprise_is_good: true },
      jess_reaction: "",
      jess_speech: ""
    },
    scene_component: "WouldYouRatherScene"
  }
};

export function getSoruTipi(type: string): SoruTipi {
  return SORU_TIPLERI[type] ?? SORU_TIPLERI.multiple_choice;
}

export function getBosSablon(type: string): Record<string, unknown> {
  const tip = getSoruTipi(type);
  return JSON.parse(JSON.stringify(tip.template));
}
