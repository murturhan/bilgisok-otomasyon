import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { COLORS, FONTS, FRAMES } from "../styles/theme";
import { JessCharacter } from "../components/JessCharacter";
import { JessPoses } from "../types/schemas";

interface IntroSceneProps {
  channelName: string;
  topic: string;
  jessPoses: JessPoses;
}

export const IntroScene: React.FC<IntroSceneProps> = ({
  channelName,
  topic,
  jessPoses,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;

  // Logo gelişi (0-1.5s)
  const logoAnim = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  const logoScale = interpolate(logoAnim, [0, 1], [0, 1]);
  const logoY = interpolate(logoAnim, [0, 1], [-100, 0]);

  // Tagline gelişi (~1s sonra)
  const taglineAnim = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineAnim, [0, 1], [40, 0]);

  // Topic banner (~2.5s sonra)
  const topicAnim = spring({
    frame: frame - 75,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const topicOpacity = interpolate(topicAnim, [0, 1], [0, 1]);
  const topicScale = interpolate(topicAnim, [0, 1], [0.5, 1]);

  // Animasyonlu yıldız parçacıkları (basit, statik konumlu)
  const stars = Array.from({ length: 12 }).map((_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.4;
    const x = width / 2 + Math.cos(angle + frame * 0.02) * radius;
    const y = height / 2 + Math.sin(angle + frame * 0.02) * radius;
    const size = 30 + Math.sin(frame * 0.1 + i) * 10;
    return { x, y, size, key: i };
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${COLORS.bgGradientStart} 0%, ${COLORS.bgGradientEnd} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Yıldız parçacıkları */}
      {stars.map((s) => (
        <div
          key={s.key}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y,
            fontSize: s.size,
            opacity: 0.6,
            pointerEvents: "none",
          }}
        >
          ⭐
        </div>
      ))}

      {/* Ana içerik kontaineri */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isVertical ? 30 : 50,
          zIndex: 5,
        }}
      >
        {/* Logo */}
        <div
          style={{
            transform: `translateY(${logoY}px) scale(${logoScale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              fontSize: isVertical ? 110 : 140,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: COLORS.primary,
              textShadow: `
                -6px -6px 0 black,
                6px -6px 0 black,
                -6px 6px 0 black,
                6px 6px 0 black,
                12px 12px 0 ${COLORS.accent}
              `,
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            GeniMini
          </div>
          <div
            style={{
              fontSize: isVertical ? 80 : 100,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: COLORS.textWhite,
              textShadow: `
                -4px -4px 0 black,
                4px -4px 0 black,
                -4px 4px 0 black,
                4px 4px 0 black
              `,
              lineHeight: 1,
              letterSpacing: 8,
            }}
          >
            TESTS
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            transform: `translateY(${taglineY}px)`,
            opacity: taglineOpacity,
            fontSize: isVertical ? 42 : 50,
            fontFamily: FONTS.body,
            fontWeight: 700,
            color: COLORS.textWhite,
            textShadow: "3px 3px 0 black",
            textAlign: "center",
          }}
        >
          🎉 Fun &amp; Smart Learning for Kids 🦊
        </div>

        {/* Topic banner */}
        {topic && (
          <div
            style={{
              opacity: topicOpacity,
              transform: `scale(${topicScale})`,
              backgroundColor: COLORS.primary,
              color: COLORS.textBlack,
              padding: isVertical ? "20px 40px" : "26px 60px",
              borderRadius: 30,
              fontSize: isVertical ? 44 : 60,
              fontFamily: FONTS.display,
              fontWeight: 900,
              border: "5px solid black",
              boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 30px ${COLORS.primary}`,
              marginTop: 20,
            }}
          >
            Today: {topic}
          </div>
        )}
      </div>

      {/* Jess karakter - alt köşede */}
      <JessCharacter
        pose="intro"
        poses={jessPoses}
        position={isVertical ? "bottom-right" : "bottom-right"}
        size={isVertical ? 400 : 480}
        animate
      />
    </AbsoluteFill>
  );
};
