import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS } from "../styles/theme";
import { JessTailIcon } from "./JessTailIcon";

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
 * - Sağ üst: Jess kuyruğu (önceki şimşek yerine, brand)
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
  
  const tailAnim = spring({
    frame: frame - showFrame - 8,
    fps,
    config: { damping: 10, stiffness: 130 },
  });
  const tailX = interpolate(tailAnim, [0, 1], [120, 0]);
  const tailOpacity = interpolate(tailAnim, [0, 0.5], [0, 1]);
  
  // Tail wagging
  const tailWag = Math.sin(frame * 0.18) * 12;
  const tailScale = 1 + Math.sin(frame * 0.15) * 0.06;
  
  const badgeSize = isVertical ? 110 : 130;
  const fontSize = isVertical ? 56 : 64;
  const padding = isVertical ? 30 : 50;
  const headerHeight = isVertical ? 130 : 150;
  
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
        gap: 24,
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
          padding: "0 16px",
        }}
      >
        <div
          style={{
            fontSize: isVertical ? 48 : fontSize,
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
      
      {/* Jess kuyruğu (şimşek yerine) */}
      <div
        style={{
          transform: `translateX(${tailX}px) scale(${tailScale}) rotate(${tailWag}deg)`,
          opacity: tailOpacity,
          flexShrink: 0,
          transformOrigin: "center bottom",
        }}
      >
        <JessTailIcon size={isVertical ? 80 : 100} />
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

// Backward compat - IntroScene logosunda hala kullanılıyor
interface LightningBoltProps {
  size?: number;
  color?: string;
}

export const LightningBolt: React.FC<LightningBoltProps> = ({
  size = 100,
  color = BRAND.yellow,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        filter: `drop-shadow(0 0 12px ${color}) drop-shadow(0 4px 8px rgba(0,0,0,0.4))`,
      }}
    >
      <path
        d="M 55 8 L 25 55 L 45 55 L 35 92 L 75 38 L 53 38 Z"
        fill={color}
        stroke={BRAND.black}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 55 8 L 25 55 L 45 55 L 35 92 L 75 38 L 53 38 Z"
        fill="#FF1493"
        opacity="0.3"
        transform="translate(2, 3)"
      />
    </svg>
  );
};
