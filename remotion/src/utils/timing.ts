// REV 002/28MAY26 - APPLAUSE_DELAY_FRAMES 60->90 (3sn), OutroScene gecikmesi için
/**
 * Soru başına faz timing'leri (Quiz Blitz tarzı, çocuk hızında)
 * 
 * Bir soru şu fazlardan oluşur:
 *   [show] → [countdown] → [drumRoll] → [revealCorrect] → [funFact] → [transition]
 * 
 * Frame cinsinden offset'ler döner.
 */

import { FPS, FIXED_FRAMES } from "../styles/theme";

// Outro Jess sesi alkış SFX bittikten sonra başlar (2s @ 30fps)
export const APPLAUSE_DELAY_FRAMES = 90;
import { Question } from "../types/schemas";

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

/**
 * Belirli bir sorunun video içindeki başlangıç frame'ini hesapla
 */
export function questionStartFrame(
  questionIndex: number,
  introAudioDuration: number,
  questions: Question[]
): number {
  const introFrames = Math.ceil(introAudioDuration * FPS);
  let frame = introFrames;
  
  for (let i = 0; i < questionIndex; i++) {
    const phases = computeQuestionPhases(questions[i]);
    frame += phases.end;
  }
  
  return frame;
}

/**
 * Outro'nun başlangıç frame'i (tüm soruların sonundaki frame)
 */
export function outroStartFrame(
  introAudioDuration: number,
  questions: Question[]
): number {
  return questionStartFrame(questions.length, introAudioDuration, questions);
}

/**
 * Toplam video süresini frame cinsinden hesapla
 */
export function totalDurationFrames(
  introAudioDuration: number,
  outroAudioDuration: number,
  questions: Question[]
): number {
  const outroFrames = Math.ceil(outroAudioDuration * FPS);
  return outroStartFrame(introAudioDuration, questions) + outroFrames + APPLAUSE_DELAY_FRAMES;
}
