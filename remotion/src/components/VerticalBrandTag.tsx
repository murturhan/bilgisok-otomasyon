import React, { useEffect, useState } from "react";
import { useCurrentFrame } from "remotion";
import { BRAND, FONTS } from "../styles/theme";
import { JessTailIcon } from "./JessTailIcon";

interface VerticalBrandTagProps {
  text?: string;
  side?: "right" | "left";
  topOffset?: number;
  bottomOffset?: number;
  fontSize?: number;
}

/**
 * Sağ (veya sol) kenarda dikey marka yazısı.
 * Üstte küçük Jess kuyruğu (önceki şimşek yerine).
 * Sabit, hafif animasyonlu.
 */
export const VerticalBrandTag: React.FC<VerticalBrandTagProps> = ({
  text = "GENIMINI TESTS",
  side = "right",
  topOffset = 200,
  bottomOffset = 200,
  fontSize = 28,
}) => {
  const frame = useCurrentFrame();
  
  // Kuyruk hafif sallanır
  const wag = Math.sin(frame * 0.1) * 6;
  
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
      {/* Jess kuyruğu (şimşek yerine) */}
      <div
        style={{
          transform: `rotate(${wag}deg)`,
          transformOrigin: "center bottom",
        }}
      >
        <JessTailIcon size={fontSize * 1.5} />
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
          opacity: 0.9,
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
    </div>
  );
};
