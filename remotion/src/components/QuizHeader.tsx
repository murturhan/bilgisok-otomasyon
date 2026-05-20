import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS } from "../styles/theme";

interface QuizHeaderProps {
  questionNumber: number;
  questionText: string;
  showFrame?: number;
  isVertical?: boolean;
}

/**
 * Quiz Blitz tarzı header:
 * - Sol: Mor yıldız rozet + içinde beyaz rakam (soru no)
 * - Orta-üst: Beyaz kalın soru metni (UPPERCASE, siyah outline)
 * - Sağ üst: BOŞ (önceki kuyruk silindi - kullanıcı talebi)
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
  
  const textAnim = spring({
    frame: frame - showFrame - 5,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const textY = interpolate(textAnim, [0, 1], [-30, 0]);
  const textOpacity = interpolate(textAnim, [0, 0.5], [0, 1]);
  
  // Boyutlar - kullanıcı "yazılar daha büyük" istedi (özellikle soru cümlesi)
  const badgeSize = isVertical ? 120 : 140;
  const fontSize = isVertical ? 72 : 84;
  const padding = isVertical ? 28 : 50;
  const headerHeight = isVertical ? 180 : 200;  // header de büyüdü, 2 satır okunaklı dursun
  
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
        padding: `0 ${padding}px`,
        zIndex: 30,
        gap: 20,
      }}
    >
      <StarBadge
        number={questionNumber}
        size={badgeSize}
        style={{
          transform: `translateX(${badgeX}px)`,
          opacity: badgeOpacity,
          flexShrink: 0,
        }}
      />
      
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

interface StarBadgeProps {
  number: number;
  size?: number;
  style?: React.CSSProperties;
}

export const StarBadge: React.FC<StarBadgeProps> = ({
  number,
  size = 130,
  style,
}) => {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <polygon
          points="50,5 61,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 39,38"
          fill={BRAND.primary}
          stroke={BRAND.yellow}
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </svg>
      
      <div
        style={{
          position: "relative",
          fontSize: size * 0.4,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: BRAND.white,
          textShadow: `
            -2px -2px 0 ${BRAND.black},
            2px -2px 0 ${BRAND.black},
            -2px 2px 0 ${BRAND.black},
            2px 2px 0 ${BRAND.black}
          `,
          zIndex: 2,
          lineHeight: 1,
        }}
      >
        {number}
      </div>
    </div>
  );
};
