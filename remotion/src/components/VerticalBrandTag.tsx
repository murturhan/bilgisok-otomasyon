// REV 001/26MAY26 - idle bounce eklendi
import React from "react";
import { useCurrentFrame } from "remotion";
import { BRAND, FONTS } from "../styles/theme";

interface VerticalBrandTagProps {
  text?: string;
  side?: "right" | "left";
  topOffset?: number;
  bottomOffset?: number;
  fontSize?: number;
}

/**
 * Sağ (veya sol) kenarda dikey marka yazısı.
 * Kuyruk YOK - sadece dikey yazı.
 * Kullanıcı talebi: kuyruk SADECE progress bar üzerinde olacak.
 */
export const VerticalBrandTag: React.FC<VerticalBrandTagProps> = ({
  text = "GENIMINI TESTS",
  side = "right",
  topOffset = 200,
  bottomOffset = 200,
  fontSize = 28,
}) => {
  const frame = useCurrentFrame();
  const BOUNCE_PHASE = 60;
  const idleBounce = Math.sin((frame + BOUNCE_PHASE) * 0.08) * 4;
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
        pointerEvents: "none",
        transform: `translateY(${idleBounce}px)`,
      }}
    >
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
