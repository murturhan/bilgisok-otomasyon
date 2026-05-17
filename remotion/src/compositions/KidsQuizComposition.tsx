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
  channel_name,
}) => {
  const { width, height } = useVideoConfig();

  // Jess pose path'lerini staticFile() ile resolve et
  const resolvedJessPoses = Object.fromEntries(
    Object.entries(jess_poses || {})
      .filter(([_, v]) => v)
      .map(([k, v]) => [k, staticFile(v as string)])
  );

  // Frame hesaplamaları
  const introFrames = Math.ceil(intro_audio_duration * FPS);
  const outroFrames = Math.ceil(outro_audio_duration * FPS);
  const outroStart = outroStartFrame(intro_audio_duration, questions);
  const totalDuration = outroStart + outroFrames;

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
          <Audio src={staticFile(intro_audio_path)} volume={1.0} />
        </Sequence>
      )}

      {/* SORULAR (her biri kendi dinamik süresiyle) */}
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
          <Audio src={staticFile(outro_audio_path)} volume={1.0} />
        </Sequence>
      )}

      {/* Arka plan müziği - dinamik ducking */}
      {background_music_url && (
        <Audio
          src={staticFile(background_music_url)}
          // Volume dinamik:
          // - Intro/outro: %20 (Jess konuşması az duyulsun değil, ama biraz arkada)
          // - Soruda question/answer audio: %5 (Jess net duyulsun)
          // - Sessiz fazlarda (countdown, drumroll, transition): %15
          volume={(f) => {
            // Intro fazı
            if (f < introFrames) return 0.20;
            // Outro fazı
            if (f >= outroStart) return 0.20;
            
            // Hangi sorudayız ve hangi fazda?
            let scanFrame = introFrames;
            for (let i = 0; i < questions.length; i++) {
              const phases = computeQuestionPhases(questions[i]);
              const qStart = scanFrame;
              const qEnd = scanFrame + phases.end;
              
              if (f >= qStart && f < qEnd) {
                const localFrame = f - qStart;
                // Question audio (Jess soruyu söylüyor): %5
                if (localFrame < phases.countdown) return 0.05;
                // Countdown (sessiz, tick SFX): %15
                if (localFrame < phases.drumRoll) return 0.15;
                // Drumroll (sessiz, drum SFX): %15
                if (localFrame < phases.reveal) return 0.15;
                // Answer audio (Jess cevabı söylüyor): %5
                if (localFrame < phases.transition) return 0.05;
                // Transition (kısa): %15
                return 0.15;
              }
              scanFrame = qEnd;
            }
            return 0.10;
          }}
          startFrom={0}
          loop
        />
      )}
    </AbsoluteFill>
  );
};
