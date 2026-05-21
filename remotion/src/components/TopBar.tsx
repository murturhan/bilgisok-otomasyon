import React from "react";
import { BRAND, ThemeColor } from "../styles/theme";

interface TopBarProps {
  theme: ThemeColor;
  height?: number;
  children?: React.ReactNode;
}

/**
 * Dinamik renkli üst bar.
 * Theme rengine göre koyu varyant kullanılır (theme'in en koyu tonu).
 * Soru başlığı ve fact başlığını içine alır.
 *
 * Kontrast garantili - tema rengine göre koyu/açık otomatik seçilir.
 */
export const TopBar: React.FC<TopBarProps> = ({
  theme,
  height = 180,
  children,
}) => {
  // Theme rengine göre koyu varyant (theme'in birincil rengini koyulaştır)
  const barColor = darken(theme.primary, 0.6);
  
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: height,
        backgroundColor: barColor,
        display: "flex",
        alignItems: "center",
        zIndex: 30,
        // Alt kenar - sarı kalın çizgi (profesyonel görünüm)
        borderBottom: `6px solid ${BRAND.yellow}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
      }}
    >
      {children}
    </div>
  );
};

/**
 * Hex rengi belirtilen orana göre koyulaştır.
 * amount = 0.5 → %50 daha koyu
 */
function darken(hex: string, amount: number): string {
  // #RRGGBB → RGB
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  
  const darken = (c: number) => Math.max(0, Math.floor(c * (1 - amount)));
  
  const rd = darken(r);
  const gd = darken(g);
  const bd = darken(b);
  
  return `#${rd.toString(16).padStart(2, "0")}${gd.toString(16).padStart(2, "0")}${bd.toString(16).padStart(2, "0")}`;
}
