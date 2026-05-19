import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
} from "remotion";
import { BRAND, FONTS, ThemeColor } from "../styles/theme";
import { LightningBolt } from "./QuizHeader";

interface JessTransitionProps {
  /**
   * Geçiş hangi frame'de başlar
   */
  startFrame: number;
  /**
   * Geçiş kaç frame sürer
   */
  durationFrames: number;
  /**
   * Önceki sorunun teması (geçişin başında görünen renk)
   */
  fromTheme: ThemeColor;
  /**
   * Sonraki sorunun teması (geçişin sonunda görünen renk)
   */
  toTheme: ThemeColor;
  /**
   * Jess karakteri (varsa) - transition pozu
   */
  jessSrc?: string;
}

/**
 * İki soru arası Jess karakterli wipe geçiş.
 * 
 * Anim akışı (1 saniye = 30 frame):
 *   0-10 frame: Beyaz şimşek tüm ekrana büyür (fromTheme bg)
 *   10-20 frame: Şimşeğin içinde Jess belirir, sallanır
 *   20-30 frame: Şimşek küçülür, toTheme bg ortaya çıkar
 * 
 * Quiz Blitz'in şimşek wipe efektinin aynısı + bizim Jess karakter overlay.
 */
export const JessTransition: React.FC<JessTransitionProps> = ({
  startFrame,
  durationFrames,
  fromTheme,
  toTheme,
  jessSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  const localFrame = frame - startFrame;
  const progress = Math.max(0, Math.min(1, localFrame / durationFrames));
  
  // Şimşek boyutu - 0→max→0 (ortada peak)
  const boltScale = interpolate(
    progress,
    [0, 0.4, 0.6, 1],
    [0, 8, 8, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  // Bg renk geçişi (fromTheme → toTheme, ortada)
  // Geçiş anı %50'ye yakın
  const bgT = progress < 0.5 ? 0 : 1;
  const currentTheme = bgT === 0 ? fromTheme : toTheme;
  
  // Jess scale + bounce
  const jessOpacity = interpolate(
    progress,
    [0.2, 0.4, 0.6, 0.8],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const jessBounce = Math.sin(localFrame * 0.5) * 20;
  const jessRotate = Math.sin(localFrame * 0.3) * 8;
  
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 100,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* BG - tema rengi */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: `radial-gradient(ellipse at center, ${currentTheme.bgPrimary} 0%, ${currentTheme.bgSecondary} 100%)`,
          opacity: interpolate(progress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]),
        }}
      />
      
      {/* DEV ŞİMŞEK (Quiz Blitz wipe efekti) */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${boltScale}) rotate(${localFrame * 5}deg)`,
          opacity: interpolate(progress, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
        }}
      >
        <LightningBolt size={150} color={BRAND.yellow} />
      </div>
      
      {/* JESS KARAKTER (şimşeğin ortasında) */}
      {jessSrc && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, calc(-50% + ${jessBounce}px)) rotate(${jessRotate}deg)`,
            opacity: jessOpacity,
            zIndex: 102,
          }}
        >
          <Img
            src={jessSrc}
            style={{
              width: 360,
              height: "auto",
              filter: "drop-shadow(0 0 30px rgba(255, 215, 0, 0.8))",
            }}
          />
        </div>
      )}
      
      {/* "NEXT QUESTION" YAZISI (kısa süre) */}
      <div
        style={{
          position: "absolute",
          top: "70%",
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 70,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: BRAND.yellow,
          textShadow: `
            -4px -4px 0 ${BRAND.black},
            4px -4px 0 ${BRAND.black},
            -4px 4px 0 ${BRAND.black},
            4px 4px 0 ${BRAND.black}
          `,
          opacity: interpolate(progress, [0.35, 0.5, 0.65], [0, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `scale(${interpolate(progress, [0.35, 0.5], [0.5, 1.2], { extrapolateRight: "clamp" })})`,
          zIndex: 101,
        }}
      >
        NEXT!
      </div>
    </div>
  );
};
