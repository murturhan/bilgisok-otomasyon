import React from "react";
import { Composition } from "remotion";
import { KidsQuizComposition } from "./compositions/KidsQuizComposition";
import { quizCompositionSchema, defaultQuizProps } from "./types/schemas";
import { totalFrames, FPS } from "./styles/theme";

export const RemotionRoot: React.FC = () => {
  // Total frames - default props 5 soruluk olduğu için
  // Render sırasında --props ile gerçek soru sayısı geçilecek,
  // calculateMetadata callback'i ile dinamik süre hesaplanacak
  const defaultTotalFrames = totalFrames(defaultQuizProps.questions.length);

  return (
    <>
      {/* LONG video composition (1920x1080) */}
      <Composition
        id="KidsQuizLong"
        component={KidsQuizComposition}
        durationInFrames={defaultTotalFrames}
        fps={FPS}
        width={1920}
        height={1080}
        schema={quizCompositionSchema}
        defaultProps={defaultQuizProps}
        calculateMetadata={async ({ props }) => {
          return {
            durationInFrames: totalFrames(props.questions.length),
          };
        }}
      />

      {/* SHORTS composition (1080x1920) */}
      <Composition
        id="KidsQuizShorts"
        component={KidsQuizComposition}
        durationInFrames={defaultTotalFrames}
        fps={FPS}
        width={1080}
        height={1920}
        schema={quizCompositionSchema}
        defaultProps={defaultQuizProps}
        calculateMetadata={async ({ props }) => {
          return {
            durationInFrames: totalFrames(props.questions.length),
          };
        }}
      />
    </>
  );
};
