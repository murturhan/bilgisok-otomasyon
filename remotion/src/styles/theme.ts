// GeniMini Tests theme - tüm görsel sabitler ve dinamik süre helper'ları

export const COLORS = {
  // Ana arka plan gradient
  bgGradientStart: "#5B2C8C",
  bgGradientEnd: "#FF57A6",
  
  // Vurgu renkleri
  primary: "#FFD600",
  secondary: "#FF6B35",
  accent: "#7B4CDD",
  
  // UI durum
  correctGreen: "#00E676",
  correctGreenDark: "#00C853",
  wrongGray: "#9E9E9E",
  wrongGrayDark: "#616161",
  
  // Metin
  textWhite: "#FFFFFF",
  textYellow: "#FFEB3B",
  textBlack: "#1A1A2E",
  textShadow: "#000000",
  
  // Kutu
  boxBg: "rgba(0, 0, 0, 0.7)",
  boxBgCorrect: "#00C853",
  boxBgWrong: "rgba(97, 97, 97, 0.6)",
  
  // Timer
  timerBg: "rgba(255, 255, 255, 0.2)",
  timerFill: "#FFD600",
  timerFillDanger: "#FF1744",
  
  // Header
  headerBg: "rgba(123, 76, 221, 0.85)",
};

export const FONTS = {
  display: '"Fredoka", "Comic Sans MS", "Arial Black", sans-serif',
  body: '"Nunito", "Comic Sans MS", Arial, sans-serif',
};

export const FPS = 30;

// SABİT süreler (saniye) - bunlar hep sabit
export const FIXED_TIMING = {
  countdown: 5.0,     // Geri sayım her zaman 5 saniye
  drumRoll: 2.0,      // Drum roll her zaman 2 saniye
  transition: 1.0,    // Soru sonu nefes - kısa
};

// SABİT frame sayıları
export const FIXED_FRAMES = {
  countdown: FIXED_TIMING.countdown * FPS,  // 150
  drumRoll: FIXED_TIMING.drumRoll * FPS,    // 60
  transition: FIXED_TIMING.transition * FPS, // 30
};

// Bir soru için toplam frame sayısı (dinamik!)
// = question_audio_duration + countdown + drumRoll + answer_audio_duration + transition
export function questionTotalFrames(questionAudioDur: number, answerAudioDur: number): number {
  return Math.ceil(
    questionAudioDur * FPS +
    FIXED_FRAMES.countdown +
    FIXED_FRAMES.drumRoll +
    answerAudioDur * FPS +
    FIXED_FRAMES.transition
  );
}

// Tüm video toplam frame sayısı
export function totalFrames(
  introAudioDur: number,
  questionDurations: Array<{ q: number; a: number }>,
  outroAudioDur: number
): number {
  const introFrames = Math.ceil(introAudioDur * FPS);
  const questionsFrames = questionDurations.reduce(
    (sum, { q, a }) => sum + questionTotalFrames(q, a),
    0
  );
  const outroFrames = Math.ceil(outroAudioDur * FPS);
  return introFrames + questionsFrames + outroFrames;
}
