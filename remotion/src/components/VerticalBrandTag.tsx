import React from "react";
import { useCurrentFrame } from "remotion";
import { BRAND, FONTS } from "../styles/theme";
import { JessTail } from "./BrandAssets";

interface VerticalBrandTagProps {
  text?: string;
  side?: "right" | "left";
  topOffset?: number;
  bottomOffset?: number;
  fontSize?: number;
}

export const VerticalBrandTag: React.FC<VerticalBrandTagProps> = ({
  text = "GENIMINI TESTS",
  side = "right",
  topOffset = 200,
  bottomOffset = 200,
  fontSize = 28,
}) => {
  const frame = useCurrentFrame();
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
      {/* Jess kuyruğu */}
      <div
        style={{
          transform: `rotate(${wag}deg)`,
          transformOrigin: "center bottom",
        }}
      >
        <JessTail size={fontSize * 2} />
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
