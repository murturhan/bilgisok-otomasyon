import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../styles/theme";

interface FunFactBannerProps {
  text: string;
  showFrame: number;
  width?: number | string;
}

export const FunFactBanner: React.FC<FunFactBannerProps> = ({
  text,
  showFrame,
  width = "80%",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Slide-up enter animation
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  
  const translateY = interpolate(enterAnim, [0, 1], [60, 0]);
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);

  return (
    <div
      style={{
        width,
        opacity,
        transform: `translateY(${translateY}px)`,
        backgroundColor: COLORS.accent,
        borderRadius: 20,
        padding: "30px 40px",
        border: `5px solid ${COLORS.primary}`,
        boxShadow: `0 12px 32px rgba(0, 0, 0, 0.4), 0 0 30px ${COLORS.accent}`,
        textAlign: "center",
      }}
    >
      {/* "Did you know?" label */}
      <div
        style={{
          fontSize: 36,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: COLORS.primary,
          textShadow: "2px 2px 0 black",
          marginBottom: 16,
          letterSpacing: 2,
        }}
      >
        💡 Did You Know?
      </div>
      
      {/* Fact text */}
      <div
        style={{
          fontSize: 42,
          fontFamily: FONTS.body,
          fontWeight: 700,
          color: COLORS.textWhite,
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
          lineHeight: 1.3,
        }}
      >
        {text}
      </div>
    </div>
  );
};
