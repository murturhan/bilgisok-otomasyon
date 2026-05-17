import React from "react";
import { Composition } from "remotion";
import { KidsQuizComposition } from "./compositions/KidsQuizComposition";
import { quizCompositionSchema, defaultQuizProps } from "./types/schemas";
import { FPS } from "./styles/theme";
import { outroStartFrame } from "./utils/timing";

// Toplam frame helper'ı
function calculateTotalFrames(props: typeof defaultQuizProps): number {
  const outroFrames = Math.ceil(props.outro_audio_duration * FPS);
  const outroStart = outroStartFrame(props.intro_audio_duration, props.questions);
  return outroStart + outroFrames;
}

export const RemotionRoot: React.FC = () => {
  const defaultDuration = calculateTotalFrames(defaultQuizProps);

  return (
    <>
      {/* LONG video (1920x1080) */}
      <Composition
        id="KidsQuizLong"
        component={KidsQuizComposition}
        durationInFrames={defaultDuration}
        fps={FPS}
        width={1920}
        height={1080}
        schema={quizCompositionSchema}
        defaultProps={defaultQuizProps}
        calculateMetadata={async ({ props }) => {
          return {
            durationInFrames: calculateTotalFrames(props),
          };
        }}
      />

      {/* SHORTS video (1080x1920) */}
      <Composition
        id="KidsQuizShorts"
        component={KidsQuizComposition}
        durationInFrames={defaultDuration}
        fps={FPS}
        width={1080}
        height={1920}
        schema={quizCompositionSchema}
        defaultProps={defaultQuizProps}
        calculateMetadata={async ({ props }) => {
          return {
            durationInFrames: calculateTotalFrames(props),
          };
        }}
      />
    </>
  );
};
