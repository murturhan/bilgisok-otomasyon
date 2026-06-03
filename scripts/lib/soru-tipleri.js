// REV 002/04JUN26 - validateSoru + migrateSchema eklendi (Parça 4/4)

export const SORU_TIPLERI = {
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
      { key: "fact_image", label: "Fact Görseli", size: "1024x1024", prompt_key: "fun_fact_image_prompt" }
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
      { key: "visible_image", label: "Görünür Seçenek Görseli", size: "1024x1024", prompt_key: "visible_option.image_prompt" },
      { key: "surprise_image", label: "Sürpriz Açılış Görseli", size: "1024x1024", prompt_key: "surprise_option.surprise_image_prompt" }
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

export function getSoruTipi(type) {
  return SORU_TIPLERI[type] || SORU_TIPLERI.multiple_choice;
}

export function getBosSablon(type) {
  const tip = getSoruTipi(type);
  return JSON.parse(JSON.stringify(tip.template));
}

// JSON-serializable copy for worker/non-module environments
export const SORU_TIPLERI_JSON = JSON.parse(JSON.stringify(SORU_TIPLERI));

export function validateSoru(soru) {
  const tip = getSoruTipi(soru?.question_type);
  const errors = [];
  if (!soru?.question_type) errors.push("question_type");

  if (soru?.question_type === "multiple_choice") {
    if (!soru.question_text?.trim()) errors.push("question_text");
    if (!Array.isArray(soru.options) || soru.options.length !== 3 || soru.options.some(o => !o?.trim())) errors.push("options");
    if (typeof soru.correct_answer !== "number" || soru.correct_answer < 0 || soru.correct_answer > 2) errors.push("correct_answer");
    if (!soru.fun_fact?.trim()) errors.push("fun_fact");
  } else if (soru?.question_type === "would_you_rather") {
    if (!soru.visible_option?.label?.trim()) errors.push("visible_option.label");
    if (!soru.surprise_option?.surprise_outcome?.trim()) errors.push("surprise_option.surprise_outcome");
    if (!soru.jess_reaction?.trim()) errors.push("jess_reaction");
  }

  return { valid: errors.length === 0, errors };
}

export function migrateSchema(eski, yeni_tip) {
  // Tip değişiminde: kullanıcı isteğiyle içerik tamamen sıfırlanır
  return getBosSablon(yeni_tip);
}
