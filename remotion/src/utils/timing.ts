import { FPS, FIXED_FRAMES } from "../styles/theme";
import { Question } from "../types/schemas";

// Bir soru için faz başlangıç frame'leri (soru başlangıcına göre relatif)
export interface QuestionPhases {
  show: number;      // 0
  countdown: number; // question_audio_duration
  drumRoll: number;  // + countdown
  reveal: number;    // + drumRoll (answer audio start)
  transition: number; // + answer_audio_duration
  end: number;       // + transition
}

export function computeQuestionPhases(question: Question): QuestionPhases {
  const qFrames = Math.ceil(question.question_audio_duration * FPS);
  const aFrames = Math.ceil(question.answer_audio_duration * FPS);
  
  const show = 0;
  const countdown = show + qFrames;
  const drumRoll = countdown + FIXED_FRAMES.countdown;
  const reveal = drumRoll + FIXED_FRAMES.drumRoll;
  const transition = reveal + aFrames;
  const end = transition + FIXED_FRAMES.transition;
  
  return { show, countdown, drumRoll, reveal, transition, end };
}

// Bir sorunun başlangıç frame'i (intro + tüm önceki soruların süresi)
export function questionStartFrame(
  questionIndex: number,
  introDuration: number,
  questions: Question[]
): number {
  let frame = Math.ceil(introDuration * FPS);
  for (let i = 0; i < questionIndex; i++) {
    const phases = computeQuestionPhases(questions[i]);
    frame += phases.end;
  }
  return frame;
}

// Outro başlangıç frame'i
export function outroStartFrame(
  introDuration: number,
  questions: Question[]
): number {
  let frame = Math.ceil(introDuration * FPS);
  for (const q of questions) {
    const phases = computeQuestionPhases(q);
    frame += phases.end;
  }
  return frame;
}

// Frame to second
export function frameToSecond(frame: number): number {
  return frame / FPS;
}
