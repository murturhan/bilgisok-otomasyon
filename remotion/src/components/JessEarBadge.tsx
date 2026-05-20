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
 * Tilki kulağı şekli - beyaz dış + turuncu iç + siyah kontür.
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
        height: size * 1.15, // kulak yatay değil, dik
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.5))",
        ...style,
      }}
    >
      {/* Kulak SVG - üçgen/yumurta arası, beyaz dış + turuncu iç */}
      <svg
        width={size}
        height={size * 1.15}
        viewBox="0 0 100 115"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {/* Dış kulak - beyaz, tabanı yuvarlak, ucu hafif kıvrık */}
        <path
          d="M 50 8
             C 30 8, 18 35, 18 60
             C 18 85, 28 105, 50 110
             C 72 105, 82 85, 82 60
             C 82 35, 70 8, 50 8 Z"
          fill="#FFFFFF"
          stroke="#000000"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        
        {/* İç kulak - turuncu (Jess'in kulak iç rengi) */}
        <path
          d="M 50 22
             C 38 22, 30 42, 30 62
             C 30 80, 38 96, 50 100
             C 62 96, 70 80, 70 62
             C 70 42, 62 22, 50 22 Z"
          fill="#FF8C42"
          opacity="0.9"
        />
        
        {/* Pembe iç gölge (daha derinlik) */}
        <ellipse
          cx="50"
          cy="68"
          rx="14"
          ry="22"
          fill="#FFB088"
          opacity="0.6"
        />
      </svg>
      
      {/* Rakam - kulağın üzerinde */}
      <div
        style={{
          position: "relative",
          fontSize: size * 0.5,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: BRAND.white,
          textShadow: `
            -3px -3px 0 ${BRAND.black},
            3px -3px 0 ${BRAND.black},
            -3px 3px 0 ${BRAND.black},
            3px 3px 0 ${BRAND.black},
            0 4px 8px rgba(0,0,0,0.4)
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
