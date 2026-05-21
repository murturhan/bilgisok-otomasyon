import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { BRAND, FONTS, THEME_COLORS, FPS } from "../styles/theme";
import { JessCharacter } from "../components/JessCharacter";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { JessPoses } from "../types/schemas";

interface OutroSceneProps {
  channelName: string;
  jessPoses: JessPoses;
  durationFrames: number;
}

/**
 * Outro 2 sahnede:
 * Sahne 1 (ilk %55): GREAT JOB! + 🏆🎊⭐ + Jess + THANKS FOR WATCHING tagline
 *   - Üst: GREAT JOB! (büyük)
 *   - Orta: 🏆 (kocaman, ortada) + yan emojiler
 *   - Alt-üstü: THANKS FOR WATCHING! tagline
 *   - Alt: Jess (büyük, daha yukarı)
 * Sahne 2 (son %45): SUBSCRIBE + SEE YOU NEXT TIME (Jess yok, sade)
 * 
 * Sahnenin ortasında beyaz flash geçişi
 */
export const OutroScene: React.FC<OutroSceneProps> = ({
  channelName,
  jessPoses,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;
  
  const theme = THEME_COLORS[2]; // teal
  
  // Sahne 1 ve 2 bölünme noktası
  const scene1End = Math.floor(durationFrames * 0.55);
  const scene2Start = scene1End;
  const inScene1 = frame < scene1End;
  const inScene2 = frame >= scene2Start;
  const inTransition = frame >= scene1End && frame < scene1End + 5;
  
  // Flash arası
  const flashOpacity = inTransition
    ? interpolate(frame - scene1End, [0, 3, 5], [0, 0.85, 0], { extrapolateRight: "clamp" })
    : 0;
  
  return (
    <AbsoluteFill>
      <AnimatedBackground theme={theme} pattern="stars" motionSpeed={1.5} />
      
      <VerticalBrandTag
        side="right"
        topOffset={isVertical ? 200 : 100}
        bottomOffset={isVertical ? 200 : 100}
        fontSize={isVertical ? 28 : 32}
      />
      
      {inScene1 && (
        <OutroScene1
          jessPoses={jessPoses}
          isVertical={isVertical}
        />
      )}
      
      {inScene2 && (
        <OutroScene2
          startFrame={scene2Start}
          isVertical={isVertical}
        />
      )}
      
      {/* FLASH GEÇİŞİ - sahne 1'den 2'ye */}
      {inTransition && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: BRAND.white,
            opacity: flashOpacity,
            zIndex: 99,
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// ═══ SAHNE 1: GREAT JOB + emoji + tagline + Jess (DOLU LAYOUT) ═══
const OutroScene1: React.FC<{ jessPoses: JessPoses; isVertical: boolean }> = ({
  jessPoses,
  isVertical,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // GREAT JOB title
  const titleAnim = spring({
    frame,
    fps,
    config: { damping: 9, stiffness: 110 },
  });
  const titleScale = interpolate(titleAnim, [0, 1], [0, 1]);
  const titlePulse = 1 + Math.sin(frame * 0.12) * 0.03;
  
  // Trofe ortada - geç gelir, BÜYÜK
  const trophyAnim = spring({
    frame: frame - 14,
    fps,
    config: { damping: 8, stiffness: 120 },
  });
  const trophyScale = interpolate(trophyAnim, [0, 1], [0, 1]);
  const trophyRotate = interpolate(trophyAnim, [0, 0.6, 1], [-30, 15, 0]);
  const trophyBounce = Math.sin(frame * 0.1) * 12;
  
  // Yan emojiler
  const sideEmojiAnim = spring({
    frame: frame - 20,
    fps,
    config: { damping: 11, stiffness: 100 },
  });
  const sideEmojiOpacity = interpolate(sideEmojiAnim, [0, 1], [0, 1]);
  const sideEmojiY = interpolate(sideEmojiAnim, [0, 1], [40, 0]);
  
  // Tagline (THANKS FOR WATCHING)
  const taglineAnim = spring({
    frame: frame - 26,
    fps,
    config: { damping: 13, stiffness: 100 },
  });
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineAnim, [0, 1], [40, 0]);
  
  // Jess enter
  const jessAnim = spring({
    frame: frame - 8,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  const jessScale = interpolate(jessAnim, [0, 1], [0, 1]);
  
  const titleFontSize = isVertical ? 200 : 220;
  const taglineFontSize = isVertical ? 64 : 72;
  
  return (
    <>
      {/* ÜST: GREAT JOB! */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "5%" : "8%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        <div
          style={{
            transform: `scale(${titleScale * titlePulse})`,
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
      </div>
      
      {/* ORTA: Trofe ortada büyük + yan emojiler */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "27%" : "30%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: isVertical ? 30 : 50,
          zIndex: 10,
        }}
      >
        {/* Sol: yıldız */}
        <div
          style={{
            opacity: sideEmojiOpacity,
            transform: `translateY(${sideEmojiY}px) rotate(${Math.sin(frame * 0.1) * 10}deg)`,
            fontSize: isVertical ? 170 : 190,
            filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.5))",
            lineHeight: 1,
          }}
        >
          ⭐
        </div>
        
        {/* Orta: TROFE — kocaman */}
        <div
          style={{
            transform: `scale(${trophyScale}) rotate(${trophyRotate}deg) translateY(${trophyBounce}px)`,
            fontSize: isVertical ? 360 : 400,
            filter: "drop-shadow(0 18px 40px rgba(0,0,0,0.6))",
            lineHeight: 1,
          }}
        >
          🏆
        </div>
        
        {/* Sağ: konfeti */}
        <div
          style={{
            opacity: sideEmojiOpacity,
            transform: `translateY(${sideEmojiY}px) rotate(${Math.cos(frame * 0.1) * 10}deg)`,
            fontSize: isVertical ? 170 : 190,
            filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.5))",
            lineHeight: 1,
          }}
        >
          🎊
        </div>
      </div>
      
      {/* JESS arkasında TAGLINE - "THANKS FOR WATCHING!" */}
      <div
        style={{
          position: "absolute",
          bottom: isVertical ? "32%" : "30%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          zIndex: 10,
        }}
      >
        <div
          style={{
            backgroundColor: BRAND.white,
            color: BRAND.black,
            padding: isVertical ? "20px 44px" : "26px 56px",
            borderRadius: 50,
            fontSize: taglineFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            border: `6px solid ${BRAND.yellow}`,
            boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 50px ${BRAND.yellow}`,
            textAlign: "center",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            lineHeight: 1.1,
          }}
        >
          THANKS FOR WATCHING!
        </div>
      </div>
      
      {/* JESS - alt, BÜYÜK */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          justifyContent: "center",
          transform: `scale(${jessScale})`,
          transformOrigin: "bottom center",
        }}
      >
        <JessCharacter
          pose="outro"
          poses={jessPoses}
          position="bottom-center"
          size={isVertical ? 720 : 600}
          animate
          customStyle={{
            bottom: isVertical ? -120 : 20,
          }}
        />
      </div>
    </>
  );
};

// ═══ SAHNE 2: SUBSCRIBE + SEE YOU ═══
const OutroScene2: React.FC<{ startFrame: number; isVertical: boolean }> = ({
  startFrame,
  isVertical,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;
  
  const subAnim = spring({
    frame: localFrame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });
  const subScale = interpolate(subAnim, [0, 1], [0, 1]);
  const subPulse = 1 + Math.sin(frame * 0.15) * 0.05;
  
  const taglineAnim = spring({
    frame: localFrame - 12,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  const taglineY = interpolate(taglineAnim, [0, 1], [60, 0]);
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  
  const arrowAnim = spring({
    frame: localFrame - 22,
    fps,
    config: { damping: 11, stiffness: 110 },
  });
  const arrowY = interpolate(arrowAnim, [0, 1], [-100, 0]);
  const arrowOpacity = interpolate(arrowAnim, [0, 0.5], [0, 1]);
  const arrowBounce = Math.sin(localFrame * 0.18) * 15;
  
  const subFontSize = isVertical ? 100 : 110;
  const taglineFontSize = isVertical ? 64 : 70;
  
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isVertical ? 50 : 60,
        zIndex: 10,
      }}
    >
      {/* Üstte aşağı doğru ok (animasyon: zıplar) */}
      <div
        style={{
          opacity: arrowOpacity,
          transform: `translateY(${arrowY + arrowBounce}px)`,
          fontSize: isVertical ? 180 : 200,
          filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))",
          lineHeight: 1,
        }}
      >
        👇
      </div>
      
      {/* SUBSCRIBE - kocaman kırmızı buton */}
      <div
        style={{
          transform: `scale(${subScale * subPulse})`,
          backgroundColor: "#FF0000",
          color: BRAND.white,
          padding: isVertical ? "48px 110px" : "60px 140px",
          borderRadius: 80,
          fontSize: subFontSize,
          fontFamily: FONTS.display,
          fontWeight: 900,
          border: `10px solid ${BRAND.black}`,
          boxShadow: "0 16px 50px rgba(0,0,0,0.6), 0 0 100px #FF0000",
          display: "flex",
          alignItems: "center",
          gap: 30,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        ▶ SUBSCRIBE
      </div>
      
      {/* SEE YOU NEXT TIME */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: isVertical ? "26px 50px" : "32px 60px",
          borderRadius: 50,
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
          textTransform: "uppercase",
        }}
      >
        SEE YOU NEXT TIME! 👋
      </div>
    </div>
  );
};
