// REV 002/25MAY26 - GlassesIcon animasyonlu GIF (saydam, chroma key uygulandi)
import React from "react";
import { Img, staticFile } from "remotion";
import { Gif } from "@remotion/gif";

/**
 * Merkezi brand asset path'leri.
 * Tüm asset'ler remotion/public/brand/ altında.
 */
export const BRAND_ASSETS = {
  logo: "brand/geniminilogo.png",
  tail: "brand/jess-tail.svg",
  glasses: "brand/glasses.gif",
};

/**
 * Jess kuyruğu - SVG dosyasını yükler.
 * Önceki JessTailIcon (inline SVG) yerine geçer.
 */
interface JessTailProps {
  size?: number;
  style?: React.CSSProperties;
}

export const JessTail: React.FC<JessTailProps> = ({ size = 100, style }) => {
  return (
    <Img
      src={staticFile(BRAND_ASSETS.tail)}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
        ...style,
      }}
    />
  );
};

/**
 * GeniMini Tests logosu - PNG dosyasını yükler.
 */
interface GeniMiniLogoProps {
  width?: number;
  style?: React.CSSProperties;
}

export const GeniMiniLogo: React.FC<GeniMiniLogoProps> = ({ width = 600, style }) => {
  return (
    <Img
      src={staticFile(BRAND_ASSETS.logo)}
      style={{
        width,
        height: "auto",
        objectFit: "contain",
        filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.4))",
        ...style,
      }}
    />
  );
};

/**
 * Gözlük ikonu - SAYDAM ANIMASYONLU GIF.
 * Fun fact ekranında Jess yerine kullanılır.
 * Chroma key ile yeşil arkaplan saydamlaştırılmış, gözlük canlandırılır.
 */
interface GlassesIconProps {
  size?: number;
  style?: React.CSSProperties;
}

export const GlassesIcon: React.FC<GlassesIconProps> = ({ size = 100, style }) => {
  // GIF orijinal aspect ratio: 458x223 (yaklaşık 2.05:1)
  const aspectRatio = 458 / 223;
  const gifWidth = size * 1.4; // gözlüğü biraz daha geniş göstermek için
  const gifHeight = gifWidth / aspectRatio;
  return (
    <Gif
      src={staticFile(BRAND_ASSETS.glasses)}
      width={gifWidth}
      height={gifHeight}
      fit="contain"
      style={{
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
        ...style,
      }}
    />
  );
};
