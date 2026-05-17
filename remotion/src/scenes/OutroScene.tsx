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

  const confetti = Array.from({ length: 30 }).map((_, i) => {
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
      }}
    >
      {confetti.map((c) => (
        <div
          key={c.key}
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            fontSize: 48,
            transform: `rotate(${c.rotation}deg)`,
            pointerEvents: "none",
          }}
        >
          {c.emoji}
        </div>
      ))}

      {/* METIN BLOĞU - üst orta */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "10%" : "15%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isVertical ? 30 : 40,
          zIndex: 5,
        }}
      >
        {/* GREAT JOB - BÜYÜK */}
        <div
          style={{
            transform: `scale(${thanksScale})`,
            fontSize: isVertical ? 150 : 160,  // 90 → 150 (BÜYÜTÜLDÜ)
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: COLORS.primary,
            textShadow: `
              -8px -8px 0 black,
              8px -8px 0 black,
              -8px 8px 0 black,
              8px 8px 0 black,
              12px 12px 0 ${COLORS.secondary}
            `,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          Great Job!
        </div>
        <div
          style={{
            transform: `scale(${thanksScale})`,
            fontSize: isVertical ? 100 : 120,
            textAlign: "center",
          }}
        >
          🎉🎊
        </div>

        {/* SUBSCRIBE rozet */}
        <div
          style={{
            transform: `scale(${subBtnScale * pulse})`,
            backgroundColor: "#FF0000",
            color: COLORS.textWhite,
            padding: isVertical ? "30px 70px" : "32px 80px",
            borderRadius: 50,
            fontSize: isVertical ? 60 : 64,
            fontFamily: FONTS.display,
            fontWeight: 900,
            border: "6px solid black",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5), 0 0 50px #FF0000",
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
            fontSize: isVertical ? 48 : 52,
            fontFamily: FONTS.body,
            fontWeight: 700,
            color: COLORS.textWhite,
            textShadow: "4px 4px 0 black",
            textAlign: "center",
          }}
        >
          See you next time! 👋
        </div>
      </div>

      {/* Jess - ALT ORTA, BÜYÜK */}
      <JessCharacter
        pose="outro"
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 480 : 500}
        animate
      />
    </AbsoluteFill>
  );
};
