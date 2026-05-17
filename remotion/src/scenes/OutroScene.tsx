import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { COLORS, FONTS } from "../styles/theme";
import { JessCharacter } from "../components/JessCharacter";
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

  const confetti = Array.from({ length: 20 }).map((_, i) => {
    const startY = -50 - (i * 60) % 400;
    const x = (i * 137 + frame * 2) % width;
    const y = (startY + frame * 3) % (height + 100);
    const rotation = (frame * 4 + i * 30) % 360;
    return { x, y, rotation, key: i, emoji: ["🎉", "⭐", "🎊", "✨"][i % 4] };
  });

  const thanksAnim = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 90 },
  });
  const thanksScale = interpolate(thanksAnim, [0, 1], [0, 1]);

  const subBtnAnim = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const subBtnScale = interpolate(subBtnAnim, [0, 1], [0, 1]);
  const pulse = 1 + Math.sin(frame * 0.15) * 0.05;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.bgGradientEnd} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {confetti.map((c) => (
        <div
          key={c.key}
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            fontSize: 40,
            transform: `rotate(${c.rotation}deg)`,
            pointerEvents: "none",
          }}
        >
          {c.emoji}
        </div>
      ))}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          zIndex: 5,
        }}
      >
        <div
          style={{
            transform: `scale(${thanksScale})`,
            fontSize: isVertical ? 90 : 120,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: COLORS.primary,
            textShadow: `
              -6px -6px 0 black,
              6px -6px 0 black,
              -6px 6px 0 black,
              6px 6px 0 black
            `,
            textAlign: "center",
          }}
        >
          Great Job! 🎉
        </div>

        <div
          style={{
            transform: `scale(${subBtnScale * pulse})`,
            backgroundColor: "#FF0000",
            color: COLORS.textWhite,
            padding: isVertical ? "26px 60px" : "32px 80px",
            borderRadius: 50,
            fontSize: isVertical ? 50 : 64,
            fontFamily: FONTS.display,
            fontWeight: 900,
            border: "5px solid black",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5), 0 0 40px #FF0000",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          ▶ SUBSCRIBE
        </div>

        <div
          style={{
            transform: `scale(${subBtnScale})`,
            fontSize: isVertical ? 38 : 48,
            fontFamily: FONTS.body,
            fontWeight: 700,
            color: COLORS.textWhite,
            textShadow: "3px 3px 0 black",
            textAlign: "center",
          }}
        >
          See you next time! 👋
        </div>
      </div>

      <JessCharacter
        pose="outro"
        poses={jessPoses}
        position="bottom-left"
        size={isVertical ? 400 : 480}
        animate
      />
    </AbsoluteFill>
  );
};
