// REV 003/29MAY26 - WyrPhases eklendi
/**
 * Soru başına faz timing'leri (Quiz Blitz tarzı, çocuk hızında)
 * 
 * Bir soru şu fazlardan oluşur:
 *   [show] → [countdown] → [drumRoll] → [revealCorrect] → [funFact] → [transition]
 * 
 * Frame cinsinden offset'ler döner.
 */

import { FPS, FIXED_FRAMES } from "../styles/theme";
import { Question, WouldYouRatherQuestion, AnyQuestion, isWyrQuestion } from "../types/schemas";

// Outro Jess sesi alkış SFX bittikten sonra başlar (2s @ 30fps)
export const APPLAUSE_DELAY_FRAMES = 90;

export interface QuestionPhases {
  show: number;          // 0 - başlangıç
  countdown: number;     // show + question_audio (5s progress)
  drumRoll: number;      // countdown + 5s (1s drum çalıyor)
  silentPause: number;   // drumRoll + 1s (drum bitti, 1s sessiz gerilim) ⚠️ YENİ
  reveal: number;        // silentPause + 1s (cevap açılıyor)
  funFact: number;       // reveal + 2s
  transition: number;    // funFact + 5s
  end: number;           // transition + 1s
}

/**
 * Bir sorunun tüm fazlarının başlangıç frame'lerini hesapla
 * Her faz local frame (soru başlangıcından itibaren)
 */
export function computeQuestionPhases(question: Question): QuestionPhases {
  // Show fazı: Question audio kadar (en az 1s)
  const showDuration = Math.max(
    FIXED_FRAMES.showMin,
    Math.ceil(question.question_audio_duration * FPS)
  );
  
  const show = 0;
  const countdown = show + showDuration;
  const drumRoll = countdown + FIXED_FRAMES.countdown;
  const silentPause = drumRoll + FIXED_FRAMES.drumRoll;
  const reveal = silentPause + FIXED_FRAMES.silentPause;
  
  // FunFact fazı: Answer audio kadar veya sabit (hangisi büyükse)
  // Ama önce 2s correct reveal animasyonu var
  const funFact = reveal + FIXED_FRAMES.revealCorrect;
  
  const funFactDuration = Math.max(
    FIXED_FRAMES.funFact,
    Math.ceil(question.answer_audio_duration * FPS)
  );
  const transition = funFact + funFactDuration;
  const end = transition + FIXED_FRAMES.transition;
  
  return { show, countdown, drumRoll, silentPause, reveal, funFact, transition, end };
}

export const WYR_COUNTDOWN_FRAMES = FPS * 10; // 10s countdown

export interface WyrPhases {
  show: number;
  countdown: number;
  timerEnd: number;
  silentPause: number;
  reveal: number;
  reaction: number;
  transition: number;
  end: number;
}

export function computeWyrPhases(question: WouldYouRatherQuestion): WyrPhases {
  const showDuration = Math.max(FPS, Math.ceil(question.question_audio_duration * FPS));
  const show = 0;
  const countdown = show + showDuration;
  const timerEnd = countdown + WYR_COUNTDOWN_FRAMES;
  const silentPause = timerEnd + FPS;
  const reveal = silentPause + Math.floor(FPS * 0.5);
  const reaction = reveal + FPS * 2;
  const reactionDuration = Math.max(FPS * 4, Math.ceil(question.reveal_audio_duration * FPS));
  const transition = reaction + reactionDuration;
  const end = transition + FIXED_FRAMES.transition;
  return { show, countdown, timerEnd, silentPause, reveal, reaction, transition, end };
}

export function computeAnyQuestionEnd(question: AnyQuestion): number {
  if (isWyrQuestion(question)) return computeWyrPhases(question).end;
  return computeQuestionPhases(question as Question).end;
}

/**
 * Belirli bir sorunun video içindeki başlangıç frame'ini hesapla
 */
export function questionStartFrame(
  questionIndex: number,
  introAudioDuration: number,
  questions: AnyQuestion[]
): number {
  const introFrames = Math.ceil(introAudioDuration * FPS);
  let frame = introFrames;

  for (let i = 0; i < questionIndex; i++) {
    frame += computeAnyQuestionEnd(questions[i]);
  }

  return frame;
}

/**
 * Outro'nun başlangıç frame'i (tüm soruların sonundaki frame)
 */
export function outroStartFrame(
  introAudioDuration: number,
  questions: AnyQuestion[]
): number {
  return questionStartFrame(questions.length, introAudioDuration, questions);
}

/**
 * Toplam video süresini frame cinsinden hesapla
 */
export function totalDurationFrames(
  introAudioDuration: number,
  outroAudioDuration: number,
  questions: AnyQuestion[],
  skipOutro: boolean = false
): number {
  const questionsEnd = outroStartFrame(introAudioDuration, questions);
  if (skipOutro) return questionsEnd;
  const outroFrames = Math.ceil(outroAudioDuration * FPS);
  return questionsEnd + outroFrames + APPLAUSE_DELAY_FRAMES;
}
