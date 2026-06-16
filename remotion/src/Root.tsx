import React from "react";
import { Composition } from "remotion";
import { KidsQuizComposition } from "./compositions/KidsQuizComposition";
import { quizCompositionSchema, defaultQuizProps } from "./types/schemas";
import { FPS } from "./styles/theme";
import { totalDurationFrames } from "./utils/timing";

function calculateTotalFrames(props: typeof defaultQuizProps): number {
  return totalDurationFrames(
    props.intro_audio_duration,
    props.outro_audio_duration,
    props.questions,
    props.skip_outro ?? false
  );
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
        calculateMetadata={async ({ props }) => ({
          durationInFrames: calculateTotalFrames(props),
        })}
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
        calculateMetadata={async ({ props }) => ({
          durationInFrames: calculateTotalFrames(props),
        })}
      />
    </>
  );
};
