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
import { BackgroundLayer } from "../components/BackgroundLayer";
import { JessPoses } from "../types/schemas";

interface IntroSceneProps {
  channelName: string;
  topic: string;
  jessPoses: JessPoses;
  durationFrames: number;
  backgroundImageSrc?: string;
}

export const IntroScene: React.FC<IntroSceneProps> = ({
  channelName,
  topic,
  jessPoses,
  durationFrames,
  backgroundImageSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;

  const logoAnim = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  const logoScale = interpolate(logoAnim, [0, 1], [0, 1]);
  const logoY = interpolate(logoAnim, [0, 1], [-100, 0]);

  const taglineAnim = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineAnim, [0, 1], [40, 0]);

  const topicAnim = spring({
    frame: frame - 75,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const topicOpacity = interpolate(topicAnim, [0, 1], [0, 1]);
  const topicScale = interpolate(topicAnim, [0, 1], [0.5, 1]);

  // Yıldızlar
  const stars = Array.from({ length: 12 }).map((_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.4;
    const x = width / 2 + Math.cos(angle + frame * 0.02) * radius;
    const y = height / 2 + Math.sin(angle + frame * 0.02) * radius;
    const size = 30 + Math.sin(frame * 0.1 + i) * 10;
    return { x, y, size, key: i };
  });

  return (
    <AbsoluteFill>
      <BackgroundLayer imageSrc={backgroundImageSrc} />
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

      {/* METIN BLOĞU - üst 1/3'te */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "12%" : "20%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isVertical ? 24 : 50,
          zIndex: 5,
        }}
      >
        {/* GENIMINI logo - DAHA BÜYÜK */}
        <div
          style={{
            transform: `translateY(${logoY}px) scale(${logoScale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isVertical ? 18 : 20,
          }}
        >
          <div
            style={{
              fontSize: isVertical ? 160 : 180,  // 110 → 160 (BÜYÜTÜLDÜ)
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: COLORS.primary,
              textShadow: `
                -8px -8px 0 black,
                8px -8px 0 black,
                -8px 8px 0 black,
                8px 8px 0 black,
                15px 15px 0 ${COLORS.accent}
              `,
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            GeniMini
          </div>
          <div
            style={{
              fontSize: isVertical ? 120 : 130,  // 80 → 120 (BÜYÜTÜLDÜ)
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: COLORS.textWhite,
              textShadow: `
                -6px -6px 0 black,
                6px -6px 0 black,
                -6px 6px 0 black,
                6px 6px 0 black
              `,
              lineHeight: 1,
              letterSpacing: 12,
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
            fontSize: isVertical ? 52 : 56,  // 42 → 52
            fontFamily: FONTS.body,
            fontWeight: 700,
            color: COLORS.textWhite,
            textShadow: "4px 4px 0 black",
            textAlign: "center",
          }}
        >
          🎉 Fun &amp; Smart Learning 🦊
        </div>

        {/* Konu rozetı */}
        {topic && (
          <div
            style={{
              opacity: topicOpacity,
              transform: `scale(${topicScale})`,
              backgroundColor: COLORS.primary,
              color: COLORS.textBlack,
              padding: isVertical ? "22px 44px" : "30px 60px",
              borderRadius: 30,
              fontSize: isVertical ? 50 : 60,  // 44 → 50
              fontFamily: FONTS.display,
              fontWeight: 900,
              border: "6px solid black",
              boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 40px ${COLORS.primary}`,
              maxWidth: "85%",
              textAlign: "center",
            }}
          >
            Today: {topic}
          </div>
        )}
      </div>

      {/* Jess - ALT ORTA, BÜYÜK */}
      <JessCharacter
        pose="intro"
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 480 : 500}
        animate
      />
    </AbsoluteFill>
  );
};
