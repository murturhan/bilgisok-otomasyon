// REV 004/26MAY26 - GlassesIcon emoji'ye donustu (glasses.gif kaldirildi)
import React from "react";
import { Img, staticFile } from "remotion";
import { TwemojiText } from "./TwemojiText";

/**
 * Merkezi brand asset path'leri.
 * Tüm asset'ler remotion/public/brand/ altında.
 */
export const BRAND_ASSETS = {
  logo: "brand/geniminilogo.png",
  tail: "brand/jess-tail.svg",
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
 * Gözlük ikonu - 🤓 emoji (Twemoji SVG).
 * Fun fact ekranında Jess yerine kullanılır.
 */
interface GlassesIconProps {
  size?: number;
  style?: React.CSSProperties;
}

export const GlassesIcon: React.FC<GlassesIconProps> = ({ size = 100, style }) => {
  return (
    <span style={{ fontSize: size, lineHeight: 1, display: "inline-block", ...style }}>
      <TwemojiText text="🤓" />
    </span>
  );
};
