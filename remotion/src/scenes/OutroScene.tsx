import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { BRAND, FONTS, THEME_COLORS } from "../styles/theme";
import { JessCharacter } from "../components/JessCharacter";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { JessPoses } from "../types/schemas";

interface OutroSceneProps {
  channelName: string;
  jessPoses: JessPoses;
  durationFrames: number;
}

export const OutroScene: React.FC<OutroSceneProps> = ({
  channelName,
  jessPoses,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;
  
  const theme = THEME_COLORS[2]; // teal
  
  const greatJobAnim = spring({
    frame,
    fps,
    config: { damping: 9, stiffness: 110 },
  });
  const greatJobScale = interpolate(greatJobAnim, [0, 1], [0, 1]);
  
  const subAnim = spring({
    frame: frame - 25,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  const subScale = interpolate(subAnim, [0, 1], [0, 1]);
  const subPulse = 1 + Math.sin(frame * 0.18) * 0.06;
  
  const taglineAnim = spring({
    frame: frame - 60,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineAnim, [0, 1], [40, 0]);
  
  const confetti = Array.from({ length: 40 }).map((_, i) => {
    const startY = -100 - (i * 80) % 600;
    const x = (i * 137 + frame * 2.5) % width;
    const y = (startY + frame * 4) % (height + 100);
    const rotation = (frame * 4 + i * 30) % 360;
    return { x, y, rotation, key: i, emoji: ["🎉", "⭐", "🎊", "✨", "💫"][i % 5] };
  });
  
  const titleFontSize = isVertical ? 160 : 210;
  const subFontSize = isVertical ? 72 : 82;
  const taglineFontSize = isVertical ? 52 : 60;
  
  return (
    <AbsoluteFill>
      <AnimatedBackground theme={theme} pattern="stars" motionSpeed={1.2} />
      
      <VerticalBrandTag side="right" topOffset={200} bottomOffset={200} fontSize={isVertical ? 28 : 32} />
      
      {confetti.map((c) => (
        <div
          key={c.key}
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            fontSize: isVertical ? 44 : 52,
            transform: `rotate(${c.rotation}deg)`,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {c.emoji}
        </div>
      ))}
      
      <div
        style={{
          position: "absolute",
          top: isVertical ? "7%" : "12%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isVertical ? 30 : 40,
          zIndex: 10,
        }}
      >
        <div
          style={{
            transform: `scale(${greatJobScale})`,
            fontSize: titleFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.yellow,
            textShadow: `
              -8px -8px 0 ${BRAND.black},
              8px -8px 0 ${BRAND.black},
              -8px 8px 0 ${BRAND.black},
              8px 8px 0 ${BRAND.black},
              14px 14px 0 #FF1493
            `,
            textAlign: "center",
            lineHeight: 1,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          GREAT JOB!
        </div>
        
        <div
          style={{
            transform: `scale(${greatJobScale})`,
            fontSize: isVertical ? 100 : 120,
          }}
        >
          🏆 🎊
        </div>
        
        <div
          style={{
            transform: `scale(${subScale * subPulse})`,
            backgroundColor: "#FF0000",
            color: BRAND.white,
            padding: isVertical ? "30px 80px" : "40px 100px",
            borderRadius: 60,
            fontSize: subFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            border: `6px solid ${BRAND.black}`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 60px #FF0000",
            display: "flex",
            alignItems: "center",
            gap: 18,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          ▶ SUBSCRIBE
        </div>
        
        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            fontSize: taglineFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.white,
            textShadow: `
              -4px -4px 0 ${BRAND.black},
              4px -4px 0 ${BRAND.black},
              -4px 4px 0 ${BRAND.black},
              4px 4px 0 ${BRAND.black}
            `,
            textAlign: "center",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          SEE YOU NEXT TIME! 👋
        </div>
      </div>
      
      <JessCharacter
        pose="outro"
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 460 : 500}
        animate
      />
    </AbsoluteFill>
  );
};
