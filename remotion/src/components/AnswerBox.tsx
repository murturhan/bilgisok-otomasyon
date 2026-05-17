import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS, FPS } from "../styles/theme";

interface AnswerBoxProps {
  letter: "A" | "B" | "C" | "D";
  text: string;
  isCorrect: boolean;
  // Frame'ler (animasyon kontrolü için):
  showFrame: number;     // Bu frame'de görünmeye başlar (slide-in)
  revealFrame: number;   // Bu frame'de doğru/yanlış belli olur
  index: number;         // 0, 1, 2, 3 - stagger için
  layout?: "horizontal" | "vertical"; // long mu shorts mu
}

export const AnswerBox: React.FC<AnswerBoxProps> = ({
  letter,
  text,
  isCorrect,
  showFrame,
  revealFrame,
  index,
  layout = "horizontal",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 1. Slide-in animasyonu (showFrame + stagger * index)
  const enterFrame = showFrame + (index * 8); // 8 frame = ~0.27s stagger
  const slideIn = spring({
    frame: frame - enterFrame,
    fps,
    config: {
      damping: 12,
      stiffness: 100,
    },
  });

  // Slide direction: sağdan içeri
  const translateX = interpolate(slideIn, [0, 1], [200, 0]);
  const opacity = interpolate(slideIn, [0, 1], [0, 1]);

  // 2. Reveal animasyonu (revealFrame'den sonra renk değişimi)
  const revealed = frame >= revealFrame;
  const justRevealed = frame >= revealFrame && frame < revealFrame + 30; // ilk 1 sn vurgu
  
  // Doğru cevap: scale + glow burst
  const correctScale = isCorrect && justRevealed
    ? spring({
        frame: frame - revealFrame,
        fps,
        config: { damping: 8, stiffness: 200 },
      })
    : 1;
  const scaleAmount = isCorrect && justRevealed
    ? interpolate(correctScale, [0, 1], [1, 1.15])
    : 1;

  // Yanlış cevap: revealden sonra fade out
  const wrongFade = !isCorrect && revealed
    ? interpolate(frame - revealFrame, [0, 30], [1, 0.45], { extrapolateRight: "clamp" })
    : 1;

  // Renk durumu
  let bgColor = COLORS.boxBg;
  let textColor = COLORS.textWhite;
  let borderColor = COLORS.textWhite;
  let glowStyle = {};

  if (revealed) {
    if (isCorrect) {
      bgColor = COLORS.boxBgCorrect;
      textColor = COLORS.textWhite;
      borderColor = COLORS.correctGreen;
      glowStyle = {
        boxShadow: `0 0 ${justRevealed ? "60px" : "30px"} ${COLORS.correctGreen}, 0 0 20px ${COLORS.correctGreen}`,
      };
    } else {
      bgColor = COLORS.boxBgWrong;
      textColor = "#CCCCCC";
      borderColor = COLORS.wrongGray;
    }
  }

  const isHorizontal = layout === "horizontal";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isHorizontal ? 20 : 16,
        padding: isHorizontal ? "20px 24px" : "16px 20px",
        backgroundColor: bgColor,
        borderRadius: 16,
        border: `4px solid ${borderColor}`,
        opacity: opacity * wrongFade,
        transform: `translateX(${translateX}px) scale(${scaleAmount})`,
        transition: "background-color 0.3s, border-color 0.3s",
        width: "100%",
        ...glowStyle,
      }}
    >
      {/* Harf rozeti */}
      <div
        style={{
          minWidth: isHorizontal ? 60 : 48,
          height: isHorizontal ? 60 : 48,
          backgroundColor: revealed && isCorrect ? COLORS.textWhite : COLORS.primary,
          color: COLORS.textBlack,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isHorizontal ? 32 : 26,
          fontFamily: FONTS.display,
          fontWeight: 900,
          border: "3px solid black",
          flexShrink: 0,
        }}
      >
        {letter}
      </div>

      {/* Cevap metni */}
      <div
        style={{
          fontSize: isHorizontal ? 32 : 28,
          fontFamily: FONTS.display,
          fontWeight: 700,
          color: textColor,
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {text}
      </div>

      {/* Doğru cevap işareti (revealden sonra) */}
      {revealed && isCorrect && (
        <div
          style={{
            fontSize: isHorizontal ? 48 : 36,
            opacity: justRevealed
              ? interpolate(frame - revealFrame, [0, 15, 30], [0, 1, 1])
              : 1,
            flexShrink: 0,
          }}
        >
          ✓
        </div>
      )}
    </div>
  );
};
