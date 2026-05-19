import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useVideoConfig,
  staticFile,
} from "remotion";
import { FPS, MUSIC_DUCK_FRAMES, getThemeForQuestion } from "../styles/theme";
import { QuizCompositionProps } from "../types/schemas";
import { IntroScene } from "../scenes/IntroScene";
import { QuestionScene } from "../scenes/QuestionScene";
import { OutroScene } from "../scenes/OutroScene";
import { JessTransition } from "../components/JessTransition";
import {
  computeQuestionPhases,
  questionStartFrame,
  outroStartFrame,
} from "../utils/timing";

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
  sfx_tick,
  sfx_drum,
  sfx_correct,
  sfx_whoosh,
  sfx_progress,
  channel_name,
}) => {
  const { width, height } = useVideoConfig();
  
  // Jess poses path resolve
  const resolvedJessPoses = Object.fromEntries(
    Object.entries(jess_poses || {})
      .filter(([_, v]) => v)
      .map(([k, v]) => [k, staticFile(v as string)])
  );
  
  const introFrames = Math.ceil(intro_audio_duration * FPS);
  const outroFrames = Math.ceil(outro_audio_duration * FPS);
  const outroStart = outroStartFrame(intro_audio_duration, questions);
  
  // ─── MUSIC DUCKING ────────────────────────────────
  // Quiz Blitz tarzı: müzik sürekli arka planda, Jess konuşurken duck
  // %15 (sessiz fazlar) → %2 (Jess konuşurken)
  
  const isJessSpeaking = (f: number): boolean => {
    // Intro
    if (f < introFrames) return true;
    // Outro
    if (f >= outroStart && f < outroStart + outroFrames) return true;
    
    // Sorular - question/answer audio fazları
    let scanFrame = introFrames;
    for (let i = 0; i < questions.length; i++) {
      const phases = computeQuestionPhases(questions[i]);
      const qStart = scanFrame;
      const qEnd = scanFrame + phases.end;
      
      if (f >= qStart && f < qEnd) {
        const localFrame = f - qStart;
        // Question audio (show fazı)
        if (localFrame < phases.countdown) return true;
        // Answer audio (reveal → transition)
        if (localFrame >= phases.reveal && localFrame < phases.transition) return true;
        return false;
      }
      scanFrame = qEnd;
    }
    return false;
  };
  
  const musicVolume = (f: number): number => {
    const speaking = isJessSpeaking(f);
    
    let prevSpeaking = speaking;
    let framesSinceChange = MUSIC_DUCK_FRAMES;
    
    for (let lookback = 1; lookback <= MUSIC_DUCK_FRAMES; lookback++) {
      const prev = isJessSpeaking(Math.max(0, f - lookback));
      if (prev !== speaking) {
        framesSinceChange = lookback;
        prevSpeaking = prev;
        break;
      }
    }
    
    const targetVol = speaking ? 0.02 : 0.15;
    const startVol = prevSpeaking ? 0.02 : 0.15;
    
    if (framesSinceChange < MUSIC_DUCK_FRAMES) {
      const t = framesSinceChange / MUSIC_DUCK_FRAMES;
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
        />
      </Sequence>
      
      {intro_audio_path && (
        <Sequence from={0} durationInFrames={introFrames}>
          <Audio src={staticFile(intro_audio_path)} volume={1.2} />
        </Sequence>
      )}
      
      {/* SORULAR + JESS GEÇİŞLER */}
      {questions.map((q, idx) => {
        const startFrame = questionStartFrame(idx, intro_audio_duration, questions);
        const phases = computeQuestionPhases(q);
        const theme = getThemeForQuestion(idx);
        
        const imageSrc = q.image_path
          ? staticFile(q.image_path)
          : q.image_url || "";
        const funFactImageSrc = q.fun_fact_image_path
          ? staticFile(q.fun_fact_image_path)
          : imageSrc;
        const revealImageSrc = q.reveal_image_path
          ? staticFile(q.reveal_image_path)
          : undefined;
        
        return (
          <React.Fragment key={idx}>
            <Sequence from={startFrame} durationInFrames={phases.end}>
              <QuestionScene
                question={q}
                imageSrc={imageSrc}
                revealImageSrc={revealImageSrc}
                funFactImageSrc={funFactImageSrc}
                questionNumber={idx + 1}
                totalQuestions={questions.length}
                theme={theme}
                jessPoses={resolvedJessPoses}
                channelName={channel_name}
                sfx_tick={sfx_tick}
                sfx_drum={sfx_drum}
                sfx_correct={sfx_correct}
                sfx_whoosh={sfx_whoosh}
                sfx_progress={sfx_progress}
              />
            </Sequence>
          </React.Fragment>
        );
      })}
      
      {/* OUTRO */}
      <Sequence from={outroStart} durationInFrames={outroFrames}>
        <OutroScene
          channelName={channel_name}
          jessPoses={resolvedJessPoses}
          durationFrames={outroFrames}
        />
      </Sequence>
      
      {outro_audio_path && (
        <Sequence from={outroStart} durationInFrames={outroFrames}>
          <Audio src={staticFile(outro_audio_path)} volume={1.2} />
        </Sequence>
      )}
      
      {/* ARKA PLAN MÜZİK - gradual ducking */}
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
