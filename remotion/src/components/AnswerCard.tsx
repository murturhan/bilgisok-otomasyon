import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS, ANSWER_BADGE_COLORS } from "../styles/theme";

export type AnswerState = "idle" | "revealedCorrect" | "revealedDim";

interface AnswerCardProps {
  letter: "A" | "B" | "C";
  text: string;
  flag?: string;
  state: AnswerState;
  enterFrame: number;
  revealFrame?: number;
  large?: boolean;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({
  letter,
  text,
  flag,
  state,
  enterFrame,
  revealFrame = 0,
  large = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const enterAnim = spring({
    frame: frame - enterFrame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const enterTranslateX = interpolate(enterAnim, [0, 1], [300, 0]);
  const enterOpacity = interpolate(enterAnim, [0, 1], [0, 1]);
  
  const revealAnim = spring({
    frame: frame - revealFrame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  
  let targetScale = 1;
  let targetOpacity = 1;
  let bgColor = "rgba(255, 255, 255, 0.92)";
  let textColor = BRAND.black;
  let badgeColor: string = ANSWER_BADGE_COLORS[letter];
  let borderWidth = 0;
  let extraShadow = "";
  let dimFilter = "";
  
  if (state === "revealedCorrect") {
    targetScale = 1.15;
    bgColor = "#FFFFFF";
    textColor = BRAND.black;
    badgeColor = BRAND.correctGreen;
    borderWidth = 5;
    extraShadow = `, 0 0 40px ${BRAND.correctGreen}, 0 0 80px ${BRAND.correctGreen}`;
  } else if (state === "revealedDim") {
    targetScale = 0.92;
    targetOpacity = 0.55;
    dimFilter = "saturate(0.4) brightness(0.9)";
  }
  
  const isRevealed = state !== "idle";
  const revealProgress = isRevealed
    ? interpolate(revealAnim, [0, 1], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  
  const currentScale = 1 + (targetScale - 1) * revealProgress;
  const currentOpacity = 1 + (targetOpacity - 1) * revealProgress;
  
  const correctPulse = state === "revealedCorrect"
    ? 1 + Math.sin(frame * 0.2) * 0.03
    : 1;
  
  const cardPadding = large ? "28px 42px" : "24px 34px";
  const badgeSize = large ? 86 : 74;
  const textSize = large ? 52 : 44;
  const letterSize = large ? 42 : 38;
  
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: cardPadding,
        backgroundColor: bgColor,
        borderRadius: 50,
        border: borderWidth > 0 ? `${borderWidth}px solid ${BRAND.correctGreen}` : "none",
        opacity: enterOpacity * currentOpacity,
        transform: `translateX(${enterTranslateX}px) scale(${currentScale * correctPulse})`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.35)${extraShadow}`,
        width: "100%",
        filter: dimFilter,
      }}
    >
      <div
        style={{
          minWidth: badgeSize,
          width: badgeSize,
          height: badgeSize,
          backgroundColor: badgeColor,
          color: BRAND.white,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: letterSize,
          fontFamily: FONTS.display,
          fontWeight: 900,
          border: `3px solid ${BRAND.white}`,
          boxShadow: `0 4px 8px rgba(0,0,0,0.3), inset 0 -3px 6px rgba(0,0,0,0.2)`,
          flexShrink: 0,
        }}
      >
        {letter}
      </div>
      
      {flag && flag.trim().length > 0 && (
        <div
          style={{
            fontSize: large ? 48 : 42,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {flag}
        </div>
      )}
      
      <div
        style={{
          fontSize: textSize,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: textColor,
          flex: 1,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
    </div>
  );
};
