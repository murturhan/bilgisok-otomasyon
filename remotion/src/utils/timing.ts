import { FRAMES, FPS, TIMING } from "../styles/theme";

// Bir sorunun başlangıç frame'i (intro sonrasında)
export function questionStartFrame(questionIndex: number): number {
  return FRAMES.intro + (questionIndex * FRAMES.questionTotal);
}

// Bir soru içindeki fazların başlangıç frame'leri (soru başlangıcına göre relatif)
export const QUESTION_PHASE_FRAMES = {
  show: 0,
  countdown: FRAMES.questionShow,
  drumRoll: FRAMES.questionShow + FRAMES.countdown,
  reveal: FRAMES.questionShow + FRAMES.countdown + FRAMES.drumRoll,
  funFact: FRAMES.questionShow + FRAMES.countdown + FRAMES.drumRoll + FRAMES.reveal,
  transition: FRAMES.questionShow + FRAMES.countdown + FRAMES.drumRoll + FRAMES.reveal + FRAMES.funFact,
  rest: FRAMES.questionShow + FRAMES.countdown + FRAMES.drumRoll + FRAMES.reveal + FRAMES.funFact + FRAMES.transition,
};

// Outro başlangıç frame'i
export function outroStartFrame(questionCount: number): number {
  return FRAMES.intro + (questionCount * FRAMES.questionTotal);
}

// Frame to seconds
export function frameToSecond(frame: number): number {
  return frame / FPS;
}

// Bir aralıkta normalize ilerleme (0-1) - animasyonlar için
export function rangeProgress(currentFrame: number, startFrame: number, endFrame: number): number {
  if (currentFrame < startFrame) return 0;
  if (currentFrame > endFrame) return 1;
  return (currentFrame - startFrame) / (endFrame - startFrame);
}
