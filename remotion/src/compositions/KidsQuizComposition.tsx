import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useVideoConfig,
  staticFile,
} from "remotion";
import { FPS } from "../styles/theme";
import { QuizCompositionProps } from "../types/schemas";
import { IntroScene } from "../scenes/IntroScene";
import { QuestionScene } from "../scenes/QuestionScene";
import { OutroScene } from "../scenes/OutroScene";
import { computeQuestionPhases, questionStartFrame, outroStartFrame } from "../utils/timing";

export const KidsQuizComposition: React.FC<QuizCompositionProps> = ({
  title,
  topic,
  questions,
  intro_audio_path,
  outro_audio_path,
  intro_audio_duration,
  outro_audio_duration,
  jess_poses,
  background_music_url,
  background_image_path,
  sfx_tick,
  sfx_drum,
  sfx_correct,
  sfx_whoosh,
  channel_name,
}) => {
  const { width, height } = useVideoConfig();

  const resolvedJessPoses = Object.fromEntries(
    Object.entries(jess_poses || {})
      .filter(([_, v]) => v)
      .map(([k, v]) => [k, staticFile(v as string)])
  );
  
  // Background image src - varsa staticFile ile
  const backgroundImageSrc = background_image_path
    ? staticFile(background_image_path)
    : undefined;

  const introFrames = Math.ceil(intro_audio_duration * FPS);
  const outroFrames = Math.ceil(outro_audio_duration * FPS);
  const outroStart = outroStartFrame(intro_audio_duration, questions);
  const totalDuration = outroStart + outroFrames;

  // ─── GRADUAL DUCKING ───
  // İdeal müzik seviyeleri:
  // - Intro/outro: %15 (normal, Jess konuşurken side-chain ducking)
  // - Sessiz fazlar (countdown, drumroll, transition): %15
  // - Jess konuşurken: %1 (neredeyse sessiz)
  // 
  // GEÇISLER: lineer 0.5sn (15 frame) fade ile yumuşatılıyor
  // Bu side-chain ducking gibi profesyonel ses karışımı verir
  
  const FADE_FRAMES = 15; // 0.5 saniye yumuşak geçiş
  
  // Belirli bir frame'de "Jess konuşuyor mu?" testi
  const isJessSpeaking = (f: number): boolean => {
    // Intro audio çalıyor mu?
    if (f < introFrames) return true; // intro boyunca Jess konuşur
    
    // Outro audio çalıyor mu?
    if (f >= outroStart && f < outroStart + outroFrames) return true;
    
    // Sorular - question_audio veya answer_audio fazında mı?
    let scanFrame = introFrames;
    for (let i = 0; i < questions.length; i++) {
      const phases = computeQuestionPhases(questions[i]);
      const qStart = scanFrame;
      const qEnd = scanFrame + phases.end;
      
      if (f >= qStart && f < qEnd) {
        const localFrame = f - qStart;
        // Question audio fazı
        if (localFrame < phases.countdown) return true;
        // Answer audio fazı (reveal başlangıcından transition'a kadar)
        if (localFrame >= phases.reveal && localFrame < phases.transition) return true;
        return false;
      }
      scanFrame = qEnd;
    }
    return false;
  };

  // Gradual volume: 0.01 (konuşurken) ↔ 0.15 (sessiz) arası fade
  const musicVolume = (f: number): number => {
    const speaking = isJessSpeaking(f);
    
    // Geçişleri yumuşatmak için: hedef seviyeden geri geri bak
    // Eğer son FADE_FRAMES içinde state değişimi varsa, lineer geçiş yap
    let prevSpeaking = speaking;
    let framesSinceChange = FADE_FRAMES;
    
    for (let lookback = 1; lookback <= FADE_FRAMES; lookback++) {
      const prev = isJessSpeaking(Math.max(0, f - lookback));
      if (prev !== speaking) {
        framesSinceChange = lookback;
        prevSpeaking = prev;
        break;
      }
    }
    
    const targetVol = speaking ? 0.01 : 0.15;
    const startVol = prevSpeaking ? 0.01 : 0.15;
    
    // Eğer state değişti, lineer interpolate
    if (framesSinceChange < FADE_FRAMES) {
      const t = framesSinceChange / FADE_FRAMES;
      return startVol + (targetVol - startVol) * t;
    }
    
    return targetVol;
  };

  return (
    <AbsoluteFill>
      {/* INTRO */}
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroScene
          channelName={channel_name}
          topic={topic}
          jessPoses={resolvedJessPoses}
          durationFrames={introFrames}
          backgroundImageSrc={backgroundImageSrc}
        />
      </Sequence>

      {/* Intro audio */}
      {intro_audio_path && (
        <Sequence from={0} durationInFrames={introFrames}>
          <Audio src={staticFile(intro_audio_path)} volume={1.2} />
        </Sequence>
      )}

      {/* SORULAR */}
      {questions.map((q, idx) => {
        const startFrame = questionStartFrame(idx, intro_audio_duration, questions);
        const phases = computeQuestionPhases(q);
        const imageSrc = q.image_path
          ? staticFile(q.image_path)
          : q.image_url || "";
        const funFactImageSrc = q.fun_fact_image_path
          ? staticFile(q.fun_fact_image_path)
          : imageSrc; // fallback: aynı görsel
        
        return (
          <Sequence
            key={idx}
            from={startFrame}
            durationInFrames={phases.end}
          >
            <QuestionScene
              question={q}
              imageSrc={imageSrc}
              funFactImageSrc={funFactImageSrc}
              questionNumber={idx + 1}
              totalQuestions={questions.length}
              jessPoses={resolvedJessPoses}
              channelName={channel_name}
              sfx_tick={sfx_tick}
              sfx_drum={sfx_drum}
              sfx_correct={sfx_correct}
              sfx_whoosh={sfx_whoosh}
              backgroundImageSrc={backgroundImageSrc}
            />
          </Sequence>
        );
      })}

      {/* OUTRO */}
      <Sequence from={outroStart} durationInFrames={outroFrames}>
        <OutroScene
          channelName={channel_name}
          jessPoses={resolvedJessPoses}
          durationFrames={outroFrames}
          backgroundImageSrc={backgroundImageSrc}
        />
      </Sequence>

      {/* Outro audio */}
      {outro_audio_path && (
        <Sequence from={outroStart} durationInFrames={outroFrames}>
          <Audio src={staticFile(outro_audio_path)} volume={1.2} />
        </Sequence>
      )}

      {/* Arka plan müziği - GRADUAL DUCKING */}
      {background_music_url && (
        <Audio
          src={staticFile(background_music_url)}
          volume={musicVolume}
          startFrom={0}
          loop
        />
      )}
    </AbsoluteFill>
  );
};
