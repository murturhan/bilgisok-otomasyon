import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS } from "../styles/theme";
import { JessEarBadge } from "./JessEarBadge";

interface QuizHeaderProps {
  questionNumber: number;
  questionText: string;
  showFrame?: number;
  isVertical?: boolean;
}

/**
 * Quiz Blitz tarzı header:
 * - Sol: Jess kulağı rozet (yıldız yerine) + içinde büyük beyaz rakam
 * - Orta: Beyaz kalın soru metni (UPPERCASE, siyah outline)
 * - Sağ üst: BOŞ
 *
 * Soru cümlesi tam üst kenara yapışmasın diye padding-top var.
 */
export const QuizHeader: React.FC<QuizHeaderProps> = ({
  questionNumber,
  questionText,
  showFrame = 0,
  isVertical = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const badgeAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 10, stiffness: 120 },
  });
  const badgeX = interpolate(badgeAnim, [0, 1], [-150, 0]);
  const badgeOpacity = interpolate(badgeAnim, [0, 0.5], [0, 1]);
  // Kulak hafif sallanır (animasyon)
  const badgeWobble = Math.sin(frame * 0.08) * 3;
  
  const textAnim = spring({
    frame: frame - showFrame - 5,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const textY = interpolate(textAnim, [0, 1], [-30, 0]);
  const textOpacity = interpolate(textAnim, [0, 0.5], [0, 1]);
  
  // Boyutlar
  const badgeSize = isVertical ? 160 : 180;
  const fontSize = isVertical ? 72 : 84;
  const padding = isVertical ? 28 : 50;
  const headerHeight = isVertical ? 240 : 240;  // büyüdü - soru cümlesi yukarı yapışmasın
  const topPadding = isVertical ? 40 : 50;  // üstten boşluk
  
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

// Geriye dönük uyumluluk - eski StarBadge import'ları olabilir
export { JessEarBadge as StarBadge } from "./JessEarBadge";
