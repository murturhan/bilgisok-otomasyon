import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { ThemeColor } from "../styles/theme";

interface AnimatedBackgroundProps {
  theme: ThemeColor;
  /**
   * Pattern tipi:
   * - "bolt": Şimşek deseni (Quiz Blitz tarzı)
   * - "stars": Yıldız deseni
   * - "diamonds": Elmas deseni
   * - "dots": Halftone noktalar
   * - "burst": Sunburst (ray) deseni
   */
  pattern?: "bolt" | "stars" | "diamonds" | "dots" | "burst";
  /**
   * Hareket hızı (0 = sabit, 1 = normal, 2 = hızlı)
   */
  motionSpeed?: number;
}

/**
 * Animasyonlu, tema renkli arka plan katmanı.
 * 
 * Yapı:
 * 1. Radial/linear gradient bg (tema rengi)
 * 2. Pattern overlay (yavaş yatay/dikey kayan)
 * 3. Hafif vignette
 * 
 * FLUX bg KALDIRILDI - bu component tüm bg ihtiyacını karşılar.
 * Quiz Blitz tarzı: arka plan canlı, hareketli, hipnotik.
 */
export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  theme,
  pattern = "bolt",
  motionSpeed = 1,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  
  // Yavaş yatay kayma (pattern için)
  const patternOffsetX = (frame * motionSpeed * 0.5) % 200;
  const patternOffsetY = (frame * motionSpeed * 0.3) % 200;
  
  // Hafif renk pulse (gradient durakları arası salınım)
  const colorPulse = 0.5 + Math.sin(frame * 0.02) * 0.1;
  
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: -10,
        overflow: "hidden",
      }}
    >
      {/* KATMAN 1: Radial gradient bg (tema rengi) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: `radial-gradient(ellipse at ${50 + Math.sin(frame * 0.01) * 10}% ${50 + Math.cos(frame * 0.01) * 10}%, ${theme.bgPrimary} 0%, ${theme.bgSecondary} 100%)`,
        }}
      />
      
      {/* KATMAN 2: SVG Pattern (yavaş kayar) */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          opacity: 0.9,
        }}
      >
        <defs>
          {renderPattern(pattern, theme, patternOffsetX, patternOffsetY)}
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={`url(#pattern-${pattern})`}
        />
      </svg>
      
      {/* KATMAN 3: Sunburst rays (sabit, hafif rotate) */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          opacity: 0.18,
          transform: `rotate(${frame * 0.1}deg)`,
          transformOrigin: "center center",
        }}
      >
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * Math.PI * 2;
          const x2 = width / 2 + Math.cos(angle) * width * 1.5;
          const y2 = height / 2 + Math.sin(angle) * height * 1.5;
          return (
            <line
              key={i}
              x1={width / 2}
              y1={height / 2}
              x2={x2}
              y2={y2}
              stroke={theme.bgPattern}
              strokeWidth={i % 2 === 0 ? 30 : 60}
            />
          );
        })}
      </svg>
      
      {/* KATMAN 4: Vignette (kenarları koyulaştır, UI öne çıksın) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.35) 100%)",
        }}
      />
    </div>
  );
};

// ─── PATTERN RENDER YARDIMCILARI ─────────────────────
function renderPattern(
  type: string,
  theme: ThemeColor,
  offsetX: number,
  offsetY: number
): JSX.Element {
  const patternColor = theme.bgPattern;
  
  switch (type) {
    case "bolt":
      // Quiz Blitz şimşek deseni - eğik şimşekler
      return (
        <pattern
          id="pattern-bolt"
          x={offsetX}
          y={offsetY}
          width="180"
          height="180"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 20 L 70 70 L 50 75 L 80 130 L 40 95 L 60 90 Z"
            fill={patternColor}
            opacity="0.9"
          />
          <path
            d="M 120 60 L 150 110 L 130 115 L 160 170 L 120 135 L 140 130 Z"
            fill={patternColor}
            opacity="0.6"
            transform="scale(0.7) translate(40, 30)"
          />
        </pattern>
      );
      
    case "stars":
      return (
        <pattern
          id="pattern-stars"
          x={offsetX}
          y={offsetY}
          width="120"
          height="120"
          patternUnits="userSpaceOnUse"
        >
          <polygon
            points="60,15 70,45 100,45 76,65 86,95 60,77 34,95 44,65 20,45 50,45"
            fill={patternColor}
            opacity="0.9"
          />
          <polygon
            points="20,80 25,90 35,90 27,97 30,107 20,101 10,107 13,97 5,90 15,90"
            fill={patternColor}
            opacity="0.5"
          />
        </pattern>
      );
      
    case "diamonds":
      return (
        <pattern
          id="pattern-diamonds"
          x={offsetX}
          y={offsetY}
          width="100"
          height="100"
          patternUnits="userSpaceOnUse"
        >
          <polygon
            points="50,20 70,50 50,80 30,50"
            fill={patternColor}
            opacity="0.9"
          />
        </pattern>
      );
      
    case "dots":
      return (
        <pattern
          id="pattern-dots"
          x={offsetX}
          y={offsetY}
          width="60"
          height="60"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="30" cy="30" r="8" fill={patternColor} opacity="0.9" />
        </pattern>
      );
      
    case "burst":
    default:
      return (
        <pattern
          id="pattern-burst"
          x={offsetX}
          y={offsetY}
          width="160"
          height="160"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="80" cy="80" r="3" fill={patternColor} opacity="0.5" />
          <circle cx="80" cy="80" r="40" fill="none" stroke={patternColor} strokeWidth="2" opacity="0.3" />
        </pattern>
      );
  }
}

/**
 * Pattern tipini soru indeksinden otomatik seç (variety için)
 */
export function getPatternForQuestion(questionIndex: number): "bolt" | "stars" | "diamonds" | "dots" | "burst" {
  const patterns: Array<"bolt" | "stars" | "diamonds" | "dots" | "burst"> = [
    "bolt", "stars", "diamonds", "dots", "burst"
  ];
  return patterns[questionIndex % patterns.length];
}
