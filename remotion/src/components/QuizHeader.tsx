import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS } from "../styles/theme";
import { JessEarBadge } from "./JessEarBadge";

interface QuizHeaderProps {
  questionNumber: number;
  questionText: string;
  showFrame?: number;
  isVertical?: boolean;
  /**
   * Fact modu - true ise:
   * - Kulak rozet GİZLİ
   * - Soru cümlesi yerine ortada doğru cevap büyük gösterilir
   */
  isFactMode?: boolean;
  /** Fact modunda gösterilecek doğru cevap metni (örn: "COLONY") */
  correctAnswerText?: string;
  /** Fact modunun başlangıç frame'i (animasyon için) */
  factShowFrame?: number;
}

export const QuizHeader: React.FC<QuizHeaderProps> = ({
  questionNumber,
  questionText,
  showFrame = 0,
  isVertical = false,
  isFactMode = false,
  correctAnswerText = "",
  factShowFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // ─── SORU MODU ANİMASYONLARI ───
  const badgeAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 10, stiffness: 120 },
  });
  const badgeX = interpolate(badgeAnim, [0, 1], [-150, 0]);
  const badgeOpacity = interpolate(badgeAnim, [0, 0.5], [0, 1]);
  const badgeWobble = Math.sin(frame * 0.08) * 3;
  
  const textAnim = spring({
    frame: frame - showFrame - 5,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const textY = interpolate(textAnim, [0, 1], [-30, 0]);
  const textOpacity = interpolate(textAnim, [0, 0.5], [0, 1]);
  
  // ─── FACT MODU ANİMASYONLARI ───
  const factAnim = spring({
    frame: frame - factShowFrame,
    fps,
    config: { damping: 11, stiffness: 110 },
  });
  const factScale = interpolate(factAnim, [0, 1], [0.3, 1]);
  const factOpacity = interpolate(factAnim, [0, 0.5, 1], [0, 1, 1]);
  const factPulse = 1 + Math.sin(frame * 0.12) * 0.04;
  
  // Boyutlar
  const badgeSize = isVertical ? 160 : 180;
  const fontSize = isVertical ? 72 : 84;
  const factFontSize = isVertical ? 96 : 110; // fact mode için DAHA BÜYÜK
  const padding = isVertical ? 28 : 50;
  const headerHeight = isVertical ? 240 : 240;
  const topPadding = isVertical ? 40 : 50;
  
  // ═══ FACT MODU: Doğru cevap büyük, kulak yok ═══
  if (isFactMode) {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: headerHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: topPadding,
          paddingLeft: padding,
          paddingRight: padding,
          paddingBottom: 12,
          zIndex: 30,
        }}
      >
        <div
          style={{
            opacity: factOpacity,
            transform: `scale(${factScale * factPulse})`,
            fontSize: factFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.correctGreen,
            textShadow: `
              -5px -5px 0 ${BRAND.black},
              5px -5px 0 ${BRAND.black},
              -5px 5px 0 ${BRAND.black},
              5px 5px 0 ${BRAND.black},
              0 8px 16px rgba(0,0,0,0.5),
              0 0 40px rgba(76, 209, 55, 0.6)
            `,
            textAlign: "center",
            letterSpacing: 3,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {(correctAnswerText || "").toUpperCase()}
        </div>
      </div>
    );
  }
  
  // ═══ NORMAL MOD: Kulak + soru cümlesi ═══
  const questionUpper = questionText.toUpperCase();
  
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: headerHeight,
        display: "flex",
        alignItems: "center",
        paddingTop: topPadding,
        paddingLeft: padding,
        paddingRight: padding,
        paddingBottom: 12,
        zIndex: 30,
        gap: 20,
      }}
    >
      <div
        style={{
          transform: `translateX(${badgeX}px) rotate(${badgeWobble}deg)`,
          opacity: badgeOpacity,
          flexShrink: 0,
        }}
      >
        <JessEarBadge number={questionNumber} size={badgeSize} />
      </div>
      
      <div
        style={{
          flex: 1,
          textAlign: "center",
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          padding: "0 8px",
          paddingRight: badgeSize + 8,
        }}
      >
        <div
          style={{
            fontSize: fontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.white,
            textShadow: `
              -3px -3px 0 ${BRAND.black},
              3px -3px 0 ${BRAND.black},
              -3px 3px 0 ${BRAND.black},
              3px 3px 0 ${BRAND.black},
              0 6px 12px rgba(0,0,0,0.5)
            `,
            lineHeight: 1.1,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {questionUpper}
        </div>
      </div>
    </div>
  );
};

export { JessEarBadge as StarBadge } from "./JessEarBadge";
