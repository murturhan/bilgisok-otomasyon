import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS, ANSWER_BADGE_COLORS } from "../styles/theme";

export type AnswerState = "idle" | "revealedCorrect" | "revealedDim";

interface AnswerCardProps {
  letter: "A" | "B" | "C";
  text: string;
  flag?: string;
  state: AnswerState;
  /**
   * Bu kart hangi frame'de görünmeye başlasın (idle stagger için)
   */
  enterFrame: number;
  /**
   * Reveal anında bu kart hangi frame'de state'i değiştirdi (animasyon için)
   */
  revealFrame?: number;
  large?: boolean;
}

/**
 * Quiz Blitz tarzı cevap kartı.
 * 
 * IDLE: Yarı-saydam kart + renkli daire içinde harf + cevap metni
 *   → Stagger ile enter: sağdan kayarak gelir
 * 
 * REVEALED CORRECT: Büyür, beyaz arka plan, yeşil daire, kalın siyah metin
 *   → Spring scale + glow efekti
 * 
 * REVEALED DIM: Küçülür, daha soluk, gri tonlu
 *   → Soluklaşma animasyonu
 */
export const AnswerCard: React.FC<AnswerCardProps> = ({
  letter,
  text,
  flag,
  state,
  enterFrame,
  revealFrame = 0,
  large = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // ─── ENTER ANIMASYONU (sağdan kayarak gel) ─────
  const enterAnim = spring({
    frame: frame - enterFrame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const enterTranslateX = interpolate(enterAnim, [0, 1], [300, 0]);
  const enterOpacity = interpolate(enterAnim, [0, 1], [0, 1]);
  
  // ─── REVEAL ANIMASYONU (correct/dim state için) ─
  const revealAnim = spring({
    frame: frame - revealFrame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  
  // Hedef değerleri state'e göre belirle
  let targetScale = 1;
  let targetOpacity = 1;
  let bgColor = "rgba(255, 255, 255, 0.92)";
  let textColor = BRAND.black;
  let badgeColor: string = ANSWER_BADGE_COLORS[letter];
  let borderWidth = 0;
  let extraShadow = "";
  let dimFilter = "";
  
  if (state === "revealedCorrect") {
    targetScale = 1.15;
    bgColor = "#FFFFFF";
    textColor = BRAND.black;
    badgeColor = BRAND.correctGreen;
    borderWidth = 5;
    extraShadow = `, 0 0 40px ${BRAND.correctGreen}, 0 0 80px ${BRAND.correctGreen}`;
  } else if (state === "revealedDim") {
    targetScale = 0.92;
    targetOpacity = 0.55;
    dimFilter = "saturate(0.4) brightness(0.9)";
  }
  
  // Reveal animasyonu - mevcut state hedef değere doğru
  // Eğer reveal başladıysa animate et
  const isRevealed = state !== "idle";
  const revealProgress = isRevealed
    ? interpolate(revealAnim, [0, 1], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  
  // Anlık değerleri interpolate
  const currentScale = 1 + (targetScale - 1) * revealProgress;
  const currentOpacity = 1 + (targetOpacity - 1) * revealProgress;
  
  // Glow pulse (sadece correct için)
  const correctPulse = state === "revealedCorrect"
    ? 1 + Math.sin(frame * 0.2) * 0.03
    : 1;
  
  const cardPadding = large ? "20px 32px" : "18px 28px";
  const badgeSize = large ? 62 : 56;
  const textSize = large ? 34 : 30;
  const letterSize = large ? 30 : 28;
  
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: cardPadding,
        backgroundColor: bgColor,
        borderRadius: 50,
        border: borderWidth > 0 ? `${borderWidth}px solid ${BRAND.correctGreen}` : "none",
        opacity: enterOpacity * currentOpacity,
        transform: `translateX(${enterTranslateX}px) scale(${currentScale * correctPulse})`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.35)${extraShadow}`,
        width: "100%",
        filter: dimFilter,
        transition: "background-color 0.3s ease",
      }}
    >
      {/* SOL: Renkli daire içinde harf */}
      <div
        style={{
          minWidth: badgeSize,
          width: badgeSize,
          height: badgeSize,
          backgroundColor: badgeColor,
          color: BRAND.white,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: letterSize,
          fontFamily: FONTS.display,
          fontWeight: 900,
          border: `3px solid ${BRAND.white}`,
          boxShadow: `0 4px 8px rgba(0,0,0,0.3), inset 0 -3px 6px rgba(0,0,0,0.2)`,
          flexShrink: 0,
        }}
      >
        {letter}
      </div>
      
      {/* Bayrak emoji (varsa) */}
      {flag && flag.trim().length > 0 && (
        <div
          style={{
            fontSize: large ? 44 : 38,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {flag}
        </div>
      )}
      
      {/* SAĞ: Cevap metni */}
      <div
        style={{
          fontSize: textSize,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: textColor,
          flex: 1,
          letterSpacing: 0.5,
        }}
      >
        {text}
      </div>
    </div>
  );
};
