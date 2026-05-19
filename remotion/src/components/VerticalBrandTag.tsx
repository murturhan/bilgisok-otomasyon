import React from "react";
import { BRAND, FONTS } from "../styles/theme";

interface VerticalBrandTagProps {
  text?: string;
  side?: "right" | "left";
  /**
   * Üstten/alttan ne kadar boşluk
   */
  topOffset?: number;
  bottomOffset?: number;
  /**
   * Yazı boyutu
   */
  fontSize?: number;
}

/**
 * Sağ (veya sol) kenarda dikey duran marka yazısı.
 * Quiz Blitz'in "QUIZ BLITZ" sağ kenar yazısının aynısı.
 * 
 * Yapı: Yazı 90° dönmüş, küçük bir şimşek ikonu yanında.
 * Sabit, animasyonsuz - sahne stabilizer'ı gibi davranıyor.
 */
export const VerticalBrandTag: React.FC<VerticalBrandTagProps> = ({
  text = "GENIMINI TESTS",
  side = "right",
  topOffset = 200,
  bottomOffset = 200,
  fontSize = 28,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top: topOffset,
        bottom: bottomOffset,
        [side]: 8,
        zIndex: 25,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        pointerEvents: "none",
      }}
    >
      {/* Sarı şimşek (üstte küçük) */}
      <div style={{ fontSize: fontSize * 1.2, lineHeight: 1 }}>
        <svg width={fontSize * 1.1} height={fontSize * 1.5} viewBox="0 0 30 40">
          <path
            d="M 18 2 L 6 22 L 14 22 L 12 38 L 24 18 L 16 18 Z"
            fill={BRAND.yellow}
            stroke={BRAND.black}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      
      {/* Dikey yazı */}
      <div
        style={{
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: side === "right" ? "rotate(0deg)" : "rotate(180deg)",
          fontSize,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: BRAND.white,
          letterSpacing: 6,
          textShadow: `
            -2px -2px 0 ${BRAND.black},
            2px -2px 0 ${BRAND.black},
            -2px 2px 0 ${BRAND.black},
            2px 2px 0 ${BRAND.black}
          `,
          opacity: 0.85,
        }}
      >
        {text}
      </div>
    </div>
  );
};
