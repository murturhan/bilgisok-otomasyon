import React from "react";
import { useCurrentFrame } from "remotion";
import { BRAND, FONTS, ThemeColor } from "../styles/theme";

interface BurstBadgeProps {
  number: number;
  size?: number;
  theme?: ThemeColor;
  style?: React.CSSProperties;
}

/**
 * Patlama Rozeti:
 * 8-köşe yıldız (zikzak patlama şekli)
 * Tema rengine göre dolgu + sarı gradient kontur
 * Sürekli hafif döner + nabız atar
 * Üzerinde büyük rakam
 */
export const BurstBadge: React.FC<BurstBadgeProps> = ({
  number,
  size = 170,
  theme,
  style,
}) => {
  const frame = useCurrentFrame();
  
  // Sürekli yavaş dönme + nabız
  const rotation = (frame * 0.4) % 360;
  const pulse = 1 + Math.sin(frame * 0.12) * 0.04;
  
  const fillColor = theme?.primary ?? BRAND.primary;
  const accentColor = theme?.accent ?? BRAND.yellow;
  
  // 8-köşe patlama yıldızı (kavisli iç köşeler - daha keskin görünür)
  // Outer: 12 nokta, alternating uzun/kısa
  const points: string[] = [];
  const numPoints = 16;
  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 360 / numPoints - 90) * Math.PI / 180;
    const r = i % 2 === 0 ? 50 : 32; // dış 50, iç 32
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const polygonPoints = points.join(" ");
  
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: `drop-shadow(0 6px 14px rgba(0,0,0,0.5)) drop-shadow(0 0 18px ${accentColor})`,
        transform: `scale(${pulse})`,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        <defs>
          <radialGradient id={`burst-grad-${size}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.3" />
            <stop offset="40%" stopColor={fillColor} stopOpacity="1" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="1" />
          </radialGradient>
        </defs>
        
        <polygon
          points={polygonPoints}
          fill={`url(#burst-grad-${size})`}
          stroke={accentColor}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        
        {/* İç ek parıltı çizgisi */}
        <polygon
          points={polygonPoints}
          fill="none"
          stroke={BRAND.white}
          strokeWidth="1.5"
          strokeLinejoin="round"
          opacity="0.4"
          transform="scale(0.85) translate(8.8, 8.8)"
        />
      </svg>
      
      {/* Rakam - dönen patlama'nın ortasında sabit */}
      <div
        style={{
          position: "relative",
          fontSize: size * 0.45,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: BRAND.white,
          textShadow: `
            -4px -4px 0 ${BRAND.black},
            4px -4px 0 ${BRAND.black},
            -4px 4px 0 ${BRAND.black},
            4px 4px 0 ${BRAND.black},
            0 4px 8px rgba(0,0,0,0.6)
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
