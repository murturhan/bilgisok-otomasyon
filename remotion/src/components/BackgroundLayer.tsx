import React from "react";
import { Img } from "remotion";
import { COLORS } from "../styles/theme";

interface BackgroundLayerProps {
  imageSrc?: string;
  fallbackGradient?: string; // CSS gradient string (örn: "linear-gradient(...)")
  overlayOpacity?: number; // 0-1 arası, tema rengini binecek
}

/**
 * Tüm scene'lerin altına gelen background katmanı.
 * Eğer imageSrc varsa: o görseli kullan (FLUX'tan üretilmiş tema-uyumlu bg)
 * Yoksa: fallback olarak gradient kullan
 * Üzerine hafif renkli overlay koyar (brand uyumu + içerik okunabilirlik)
 */
export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  imageSrc,
  fallbackGradient,
  overlayOpacity = 0.35,
}) => {
  const defaultGradient = `linear-gradient(160deg, ${COLORS.bgGradientStart} 0%, ${COLORS.bgGradientEnd} 100%)`;
  
  return (
    <>
      {/* Background image VEYA gradient */}
      {imageSrc ? (
        <>
          {/* Görsel */}
          <Img
            src={imageSrc}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              zIndex: -10,
            }}
          />
          {/* Mor overlay - markaya uyum + okunabilirlik */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: `linear-gradient(160deg, rgba(91, 44, 140, ${overlayOpacity * 0.8}) 0%, rgba(255, 87, 166, ${overlayOpacity}) 100%)`,
              zIndex: -9,
            }}
          />
          {/* Vignette - kenarları biraz koyulaştır (UI öne çıksın) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.45) 100%)",
              zIndex: -8,
            }}
          />
        </>
      ) : (
        // Background yoksa: eski gradient
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: fallbackGradient || defaultGradient,
            zIndex: -10,
          }}
        />
      )}
    </>
  );
};
