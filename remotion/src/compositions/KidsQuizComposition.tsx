import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useVideoConfig,
  useCurrentFrame,
  staticFile,
} from "remotion";
import { FRAMES } from "../styles/theme";
import { QuizCompositionProps } from "../types/schemas";
import { IntroScene } from "../scenes/IntroScene";
import { QuestionScene } from "../scenes/QuestionScene";
import { OutroScene } from "../scenes/OutroScene";

export const KidsQuizComposition: React.FC<QuizCompositionProps> = ({
  title,
  topic,
  questions,
  intro_text,
  outro_text,
  jess_poses,
  voice_audio_url,
  background_music_url,
  channel_name,
}) => {
  const { width, height } = useVideoConfig();

  // Jess pose path'lerini staticFile() ile resolve et
  // (inputProps'tan gelen path'ler public/ relative)
  const resolvedJessPoses = Object.fromEntries(
    Object.entries(jess_poses || {})
      .filter(([_, v]) => v)
      .map(([k, v]) => [k, staticFile(v as string)])
  );

  return (
    <AbsoluteFill>
      {/* INTRO */}
      <Sequence from={0} durationInFrames={FRAMES.intro}>
        <IntroScene
          channelName={channel_name}
          topic={topic}
          jessPoses={resolvedJessPoses}
        />
      </Sequence>

      {/* SORULAR */}
      {questions.map((q, idx) => {
        const startFrame = FRAMES.intro + (idx * FRAMES.questionTotal);
        // Image path -> staticFile()
        const imageSrc = q.image_path
          ? staticFile(q.image_path)
          : q.image_url || "";
        
        return (
          <Sequence
            key={idx}
            from={startFrame}
            durationInFrames={FRAMES.questionTotal}
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
      <Sequence
        from={FRAMES.intro + (questions.length * FRAMES.questionTotal)}
        durationInFrames={FRAMES.outro}
      >
        <OutroScene channelName={channel_name} jessPoses={resolvedJessPoses} />
      </Sequence>

      {/* SES: Jess konuşması (tüm video boyunca) */}
      {voice_audio_url && (
        <Audio
          src={staticFile(voice_audio_url)}
          volume={1.0}
          startFrom={0}
        />
      )}

      {/* SES: Arka plan müziği (intro ve outro hariç orta kısımda düşük seviye) */}
      {background_music_url && (
        <Audio
          src={staticFile(background_music_url)}
          volume={0.15}
          startFrom={0}
          loop
        />
      )}
    </AbsoluteFill>
  );
};
