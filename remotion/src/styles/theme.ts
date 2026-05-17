// GeniMini Tests theme - v3

export const COLORS = {
  bgGradientStart: "#5B2C8C",
  bgGradientEnd: "#FF57A6",
  
  primary: "#FFD600",
  secondary: "#FF6B35",
  accent: "#7B4CDD",
  
  correctGreen: "#00E676",
  correctGreenDark: "#00C853",
  wrongGray: "#9E9E9E",
  wrongGrayDark: "#616161",
  
  textWhite: "#FFFFFF",
  textYellow: "#FFEB3B",
  textBlack: "#1A1A2E",
  textShadow: "#000000",
  
  boxBg: "rgba(0, 0, 0, 0.7)",
  boxBgCorrect: "#00C853",
  boxBgWrong: "rgba(97, 97, 97, 0.6)",
  
  timerBg: "rgba(255, 255, 255, 0.2)",
  timerFill: "#FFD600",
  timerFillDanger: "#FF1744",
  
  headerBg: "rgba(123, 76, 221, 0.85)",
};

// Font: Lilita One (kid-friendly, kalın, dolgun)
export const FONTS = {
  display: '"Lilita One", "Fredoka", "Comic Sans MS", "Arial Black", sans-serif',
  body: '"Lilita One", "Fredoka", "Nunito", "Comic Sans MS", Arial, sans-serif',
};

export const FPS = 30;

// Sabit süreler
export const FIXED_TIMING = {
  countdown: 5.0,
  drumRoll: 2.0,
  transition: 1.0,
};

export const FIXED_FRAMES = {
  countdown: FIXED_TIMING.countdown * FPS,
  drumRoll: FIXED_TIMING.drumRoll * FPS,
  transition: FIXED_TIMING.transition * FPS,
};

export function questionTotalFrames(questionAudioDur: number, answerAudioDur: number): number {
  return Math.ceil(
    questionAudioDur * FPS +
    FIXED_FRAMES.countdown +
    FIXED_FRAMES.drumRoll +
    answerAudioDur * FPS +
    FIXED_FRAMES.transition
  );
}

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
