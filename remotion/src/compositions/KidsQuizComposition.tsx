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

  const introFrames = Math.ceil(intro_audio_duration * FPS);
  const outroFrames = Math.ceil(outro_audio_duration * FPS);
  const outroStart = outroStartFrame(intro_audio_duration, questions);
  const totalDuration = outroStart + outroFrames;

  // Müzik volume hesaplaması (DİNAMİK DUCKING)
  // Jess konuşurken: %1 (neredeyse sessiz - profesyonel side-chain)
  // Sessiz fazlarda: %15 (normal arka plan)
  // Intro/outro: %15
  const musicVolume = (f: number): number => {
    // Intro fazı - normal seviye, Jess konuşması üstüne biner ama o önce
    if (f < introFrames) {
      return 0.15; // intro audio yokken normal, varken duck olsun
    }
    
    // Outro fazı
    if (f >= outroStart) {
      return 0.15;
    }
    
    // Sorular - hangi fazda olduğumuza göre
    let scanFrame = introFrames;
    for (let i = 0; i < questions.length; i++) {
      const phases = computeQuestionPhases(questions[i]);
      const qStart = scanFrame;
      const qEnd = scanFrame + phases.end;
      
      if (f >= qStart && f < qEnd) {
        const localFrame = f - qStart;
        // Question audio (Jess soru söylüyor): DUCK %1
        if (localFrame < phases.countdown) return 0.01;
        // Countdown (sessiz, tick SFX var): %15
        if (localFrame < phases.drumRoll) return 0.15;
        // Drumroll (drum SFX var): %12
        if (localFrame < phases.reveal) return 0.12;
        // Answer audio (Jess cevap söylüyor): DUCK %1
        if (localFrame < phases.transition) return 0.01;
        // Transition: %15
        return 0.15;
      }
      scanFrame = qEnd;
    }
    return 0.10;
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
        
        return (
          <Sequence
            key={idx}
            from={startFrame}
            durationInFrames={phases.end}
          >
            <QuestionScene
              question={q}
              imageSrc={imageSrc}
              questionNumber={idx + 1}
              totalQuestions={questions.length}
              jessPoses={resolvedJessPoses}
              channelName={channel_name}
              sfx_tick={sfx_tick}
              sfx_drum={sfx_drum}
              sfx_correct={sfx_correct}
              sfx_whoosh={sfx_whoosh}
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
        />
      </Sequence>

      {/* Outro audio */}
      {outro_audio_path && (
        <Sequence from={outroStart} durationInFrames={outroFrames}>
          <Audio src={staticFile(outro_audio_path)} volume={1.2} />
        </Sequence>
      )}

      {/* Arka plan müziği - DİNAMİK DUCKING */}
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
