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
 * - Orta-üst: Beyaz kalın soru metni (siyah outline)
 * - Sağ üst: Sarı şimşek ikonu (kanal marka)
 * 
 * Header sahnenin ALT sceneInden bağımsız çalışır - QuestionScene'in üstüne otururlar.
 */
export const QuizHeader: React.FC<QuizHeaderProps> = ({
  questionNumber,
  questionText,
  showFrame = 0,
  isVertical = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  
  // Badge enter animasyonu (yan tarafta sıçrayarak gelir)
  const badgeAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 10, stiffness: 120 },
  });
  const badgeX = interpolate(badgeAnim, [0, 1], [-150, 0]);
  const badgeOpacity = interpolate(badgeAnim, [0, 0.5], [0, 1]);
  
  // Text enter animasyonu (yukarıdan iner)
  const textAnim = spring({
    frame: frame - showFrame - 5,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const textY = interpolate(textAnim, [0, 1], [-30, 0]);
  const textOpacity = interpolate(textAnim, [0, 0.5], [0, 1]);
  
  // Bolt enter (sağdan)
  const boltAnim = spring({
    frame: frame - showFrame - 8,
    fps,
    config: { damping: 10, stiffness: 130 },
  });
  const boltX = interpolate(boltAnim, [0, 1], [120, 0]);
  const boltOpacity = interpolate(boltAnim, [0, 0.5], [0, 1]);
  
  // Bolt sürekli hafif pulse
  const boltPulse = 1 + Math.sin(frame * 0.15) * 0.08;
  
  // Badge boyutları
  const badgeSize = isVertical ? 110 : 130;
  const fontSize = isVertical ? 52 : 58;
  const padding = isVertical ? 30 : 50;
  const headerHeight = isVertical ? 130 : 150;
  
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
      {/* SOL: Yıldız rozet + soru numarası */}
      <StarBadge
        number={questionNumber}
        size={badgeSize}
        style={{
          transform: `translateX(${badgeX}px)`,
          opacity: badgeOpacity,
          flexShrink: 0,
        }}
      />
      
      {/* ORTA: Soru metni (kalan tüm alan) */}
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
            fontSize: isVertical ? 44 : fontSize,
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
            letterSpacing: 0.5,
          }}
        >
          {questionText}
        </div>
      </div>
      
      {/* SAĞ: Sarı şimşek (marka ikon) */}
      <div
        style={{
          transform: `translateX(${boltX}px) scale(${boltPulse})`,
          opacity: boltOpacity,
          flexShrink: 0,
        }}
      >
        <LightningBolt size={isVertical ? 80 : 100} />
      </div>
    </div>
  );
};

// ─── STAR BADGE (soru numarası rozetli yıldız) ─────
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
      {/* Mor 5-köşeli yıldız SVG */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {/* Sarı outline */}
        <polygon
          points="50,5 61,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 39,38"
          fill={BRAND.primary}
          stroke={BRAND.yellow}
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </svg>
      
      {/* Rakam (yıldızın ortasında) */}
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

// ─── LIGHTNING BOLT (sarı şimşek ikon) ─────────────
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
      {/* Şimşek şekli - Quiz Blitz benzeri */}
      <path
        d="M 55 8 L 25 55 L 45 55 L 35 92 L 75 38 L 53 38 Z"
        fill={color}
        stroke={BRAND.black}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Magenta gölge (Quiz Blitz tarzı 3D efekt) */}
      <path
        d="M 55 8 L 25 55 L 45 55 L 35 92 L 75 38 L 53 38 Z"
        fill="#FF1493"
        opacity="0.3"
        transform="translate(2, 3)"
      />
    </svg>
  );
};
