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
import { LightningBolt } from "../components/QuizHeader";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { JessPoses } from "../types/schemas";

interface IntroSceneProps {
  channelName: string;
  topic: string;
  jessPoses: JessPoses;
  durationFrames: number;
}

/**
 * Intro sahnesi - Quiz Blitz tarzı logo reveal.
 * 
 * Akış:
 *  0-20:  "GENIMINI" sol yumruğuyla, "TESTS" sağ yumruğuyla aynı anda gelir, ortada şimşek belirir
 *  20-45: "Fun & Smart Learning" tagline aşağıdan gelir
 *  45-75: "Today: {topic}" rozet sıçrayarak gelir
 *  75-end: Jess karakter ortada, hafif bounce
 */
export const IntroScene: React.FC<IntroSceneProps> = ({
  channelName,
  topic,
  jessPoses,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;
  
  // Intro için canlı bir tema (pembe-mor mix)
  const theme = THEME_COLORS[0]; // pink
  
  // ─── ANIMASYONLAR ─────────────────────────────────
  // Logo "GENIMINI" - soldan gelir (yumruk hissi)
  const leftAnim = spring({ frame: frame - 0, fps, config: { damping: 11, stiffness: 130 } });
  const leftX = interpolate(leftAnim, [0, 1], [-400, 0]);
  const leftScale = interpolate(leftAnim, [0, 1], [0, 1]);
  
  // Logo "TESTS" - sağdan gelir
  const rightAnim = spring({ frame: frame - 5, fps, config: { damping: 11, stiffness: 130 } });
  const rightX = interpolate(rightAnim, [0, 1], [400, 0]);
  const rightScale = interpolate(rightAnim, [0, 1], [0, 1]);
  
  // Şimşek - ortada büyüyerek belirir
  const boltAnim = spring({ frame: frame - 15, fps, config: { damping: 9, stiffness: 100 } });
  const boltScale = interpolate(boltAnim, [0, 1], [0, 1]);
  const boltRotate = interpolate(frame, [15, 30], [180, 0], { extrapolateRight: "clamp" });
  
  // Tagline
  const taglineAnim = spring({ frame: frame - 30, fps, config: { damping: 14, stiffness: 100 } });
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineAnim, [0, 1], [40, 0]);
  
  // Topic rozet
  const topicAnim = spring({ frame: frame - 50, fps, config: { damping: 10, stiffness: 110 } });
  const topicScale = interpolate(topicAnim, [0, 1], [0, 1]);
  const topicOpacity = interpolate(topicAnim, [0, 0.5], [0, 1]);
  
  // ─── BOYUTLAR ─────────────────────────────────────
  const logoFontSize = isVertical ? 140 : 180;
  const taglineFontSize = isVertical ? 48 : 56;
  const topicFontSize = isVertical ? 46 : 56;
  
  // Logo dönemi - frame'e göre hafif sallanma
  const logoIdleBounce = frame > 30 ? Math.sin(frame * 0.1) * 4 : 0;
  
  return (
    <AbsoluteFill>
      <AnimatedBackground theme={theme} pattern="bolt" motionSpeed={1.5} />
      
      <VerticalBrandTag side="right" topOffset={200} bottomOffset={200} fontSize={isVertical ? 32 : 36} />
      
      {/* ÜST: LOGO BLOĞU */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "10%" : "12%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
        }}
      >
        {/* "GENIMINI ⚡ TESTS" tek satır - sembol ortada */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 30,
            flexWrap: isVertical ? "wrap" : "nowrap",
            transform: `translateY(${logoIdleBounce}px)`,
          }}
        >
          {/* GENIMINI */}
          <div
            style={{
              fontSize: logoFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: BRAND.white,
              textShadow: `
                -6px -6px 0 ${BRAND.black},
                6px -6px 0 ${BRAND.black},
                -6px 6px 0 ${BRAND.black},
                6px 6px 0 ${BRAND.black},
                10px 10px 0 #FF1493
              `,
              letterSpacing: 4,
              transform: `translateX(${leftX}px) scale(${leftScale})`,
              lineHeight: 1,
            }}
          >
            GENIMINI
          </div>
          
          {/* Şimşek */}
          <div
            style={{
              transform: `scale(${boltScale}) rotate(${boltRotate}deg)`,
            }}
          >
            <LightningBolt size={isVertical ? 130 : 160} color={BRAND.yellow} />
          </div>
          
          {/* TESTS */}
          <div
            style={{
              fontSize: logoFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: BRAND.yellow,
              textShadow: `
                -6px -6px 0 ${BRAND.black},
                6px -6px 0 ${BRAND.black},
                -6px 6px 0 ${BRAND.black},
                6px 6px 0 ${BRAND.black},
                10px 10px 0 #FF1493
              `,
              letterSpacing: 4,
              transform: `translateX(${rightX}px) scale(${rightScale})`,
              lineHeight: 1,
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
            letterSpacing: 2,
          }}
        >
          🎉 Fun &amp; Smart Learning 🦊
        </div>
        
        {/* Today: Topic */}
        {topic && (
          <div
            style={{
              transform: `scale(${topicScale})`,
              opacity: topicOpacity,
              backgroundColor: BRAND.white,
              color: BRAND.black,
              padding: isVertical ? "22px 50px" : "28px 70px",
              borderRadius: 60,
              fontSize: topicFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              border: `6px solid ${BRAND.yellow}`,
              boxShadow: `0 10px 28px rgba(0,0,0,0.5), 0 0 50px ${BRAND.yellow}`,
              maxWidth: "85%",
              textAlign: "center",
              letterSpacing: 1,
            }}
          >
            Today: {topic}
          </div>
        )}
      </div>
      
      {/* JESS - alt orta, BÜYÜK */}
      <JessCharacter
        pose="intro"
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 500 : 520}
        animate
      />
    </AbsoluteFill>
  );
};
