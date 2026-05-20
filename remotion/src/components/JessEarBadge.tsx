import React from "react";
import { BRAND, FONTS } from "../styles/theme";

interface JessEarBadgeProps {
  number: number;
  size?: number;
  style?: React.CSSProperties;
}

/**
 * Jess Kulağı Rozet:
 * Yıldız rozet yerine kullanılır.
 * Tilki kulağı şekli - beyaz dış + parlak turuncu iç + kalın siyah kontür.
 * Üzerinde soru numarası (büyük, beyaz, siyah outline).
 */
export const JessEarBadge: React.FC<JessEarBadgeProps> = ({
  number,
  size = 160,
  style,
}) => {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size * 1.15,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.6))",
        ...style,
      }}
    >
      <svg
        width={size}
        height={size * 1.15}
        viewBox="0 0 100 115"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {/* Gradient tanımları */}
        <defs>
          <linearGradient id={`ear-outer-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F5F5F5" />
          </linearGradient>
          <linearGradient id={`ear-inner-${size}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FF9F4D" />
            <stop offset="60%" stopColor="#FF7A1A" />
            <stop offset="100%" stopColor="#E65A00" />
          </linearGradient>
        </defs>
        
        {/* Dış kulak - beyaz, kalın siyah kontür */}
        <path
          d="M 50 6
             C 28 6, 14 32, 14 58
             C 14 86, 26 108, 50 112
             C 74 108, 86 86, 86 58
             C 86 32, 72 6, 50 6 Z"
          fill={`url(#ear-outer-${size})`}
          stroke="#000000"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        
        {/* İç kulak - parlak turuncu */}
        <path
          d="M 50 20
             C 36 20, 28 42, 28 62
             C 28 82, 36 98, 50 102
             C 64 98, 72 82, 72 62
             C 72 42, 64 20, 50 20 Z"
          fill={`url(#ear-inner-${size})`}
          stroke="#B84500"
          strokeWidth="2"
        />
        
        {/* Pembe gölge (derinlik) */}
        <ellipse
          cx="50"
          cy="70"
          rx="12"
          ry="20"
          fill="#FFCBA4"
          opacity="0.5"
        />
      </svg>
      
      {/* Rakam */}
      <div
        style={{
          position: "relative",
          fontSize: size * 0.52,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: BRAND.white,
          textShadow: `
            -4px -4px 0 ${BRAND.black},
            4px -4px 0 ${BRAND.black},
            -4px 4px 0 ${BRAND.black},
            4px 4px 0 ${BRAND.black},
            0 4px 8px rgba(0,0,0,0.5)
          `,
          zIndex: 2,
          lineHeight: 1,
          marginTop: size * 0.08, // rakam dikey ortada görünsün
        }}
      >
        {number}
      </div>
    </div>
  );
};
