import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS, ThemeColor, THEME_COLORS } from "../styles/theme";
import { BurstBadge } from "./BurstBadge";
import { TopBar } from "./TopBar";

interface QuizHeaderProps {
  questionNumber: number;
  questionText: string;
  showFrame?: number;
  isVertical?: boolean;
  theme?: ThemeColor;
  /** Fact modu - true ise: DID YOU KNOW + yeşil pill */
  isFactMode?: boolean;
  /** Fact modunda gösterilecek doğru cevap */
  correctAnswerText?: string;
  /** Fact modunun başlangıç frame'i */
  factShowFrame?: number;
}

export const QuizHeader: React.FC<QuizHeaderProps> = ({
  questionNumber,
  questionText,
  showFrame = 0,
  isVertical = false,
  theme = THEME_COLORS[0],
  isFactMode = false,
  correctAnswerText = "",
  factShowFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // ─── SORU MODU ANİMASYONLARI ───
  const badgeAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 10, stiffness: 120 },
  });
  const badgeX = interpolate(badgeAnim, [0, 1], [-150, 0]);
  const badgeOpacity = interpolate(badgeAnim, [0, 0.5], [0, 1]);
  
  const textAnim = spring({
    frame: frame - showFrame - 5,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const textY = interpolate(textAnim, [0, 1], [-30, 0]);
  const textOpacity = interpolate(textAnim, [0, 0.5], [0, 1]);
  
  // ─── FACT MODU ANİMASYONLARI ───
  const bulbAnim = spring({
    frame: frame - factShowFrame,
    fps,
    config: { damping: 12, stiffness: 110 },
  });
  const bulbX = interpolate(bulbAnim, [0, 1], [-200, 0]);
  const bulbOpacity = interpolate(bulbAnim, [0, 0.5], [0, 1]);
  const bulbPulse = 1 + Math.sin(frame * 0.15) * 0.06;
  
  const factTitleAnim = spring({
    frame: frame - factShowFrame - 6,
    fps,
    config: { damping: 13, stiffness: 100 },
  });
  const factTitleOpacity = interpolate(factTitleAnim, [0, 0.5], [0, 1]);
  const factTitleY = interpolate(factTitleAnim, [0, 1], [-20, 0]);
  
  const pillAnim = spring({
    frame: frame - factShowFrame - 12,
    fps,
    config: { damping: 11, stiffness: 110 },
  });
  const pillX = interpolate(pillAnim, [0, 1], [300, 0]);
  const pillOpacity = interpolate(pillAnim, [0, 0.5], [0, 1]);
  
  // Boyutlar
  const badgeSize = isVertical ? 160 : 180;
  const fontSize = isVertical ? 64 : 76;
  const barHeight = isVertical ? 180 : 200;
  const padding = isVertical ? 28 : 50;
  
  // ═══ FACT MODU: Ampul sol + DID YOU KNOW + yeşil pill sağ ═══
  if (isFactMode) {
    const bulbSize = isVertical ? 90 : 120;
    const didYouKnowFontSize = isVertical ? 56 : 68;
    const pillFontSize = isVertical ? 52 : 64;
    
    return (
      <TopBar theme={theme} height={barHeight}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            paddingLeft: padding,
            paddingRight: padding,
            gap: 16,
          }}
        >
          {/* SOL: Ampul */}
          <div
            style={{
              transform: `translateX(${bulbX}px) scale(${bulbPulse})`,
              opacity: bulbOpacity,
              fontSize: bulbSize,
              lineHeight: 1,
              filter: `drop-shadow(0 0 25px ${BRAND.yellow})`,
              flexShrink: 0,
            }}
          >
            💡
          </div>
          
          {/* ORTA: DID YOU KNOW */}
          <div
            style={{
              flex: 1,
              opacity: factTitleOpacity,
              transform: `translateY(${factTitleY}px)`,
              fontSize: didYouKnowFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: BRAND.yellow,
              textShadow: `
                -3px -3px 0 ${BRAND.black},
                3px -3px 0 ${BRAND.black},
                -3px 3px 0 ${BRAND.black},
                3px 3px 0 ${BRAND.black}
              `,
              letterSpacing: 2,
              textTransform: "uppercase",
              textAlign: "left",
            }}
          >
            DID YOU KNOW?
          </div>
          
          {/* SAĞ: Yeşil pill - cevap */}
          <div
            style={{
              transform: `translateX(${pillX}px)`,
              opacity: pillOpacity,
              backgroundColor: "#E8F5E8",
              padding: isVertical ? "14px 32px" : "18px 44px",
              borderRadius: 50,
              border: `5px solid ${BRAND.black}`,
              boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
              maxWidth: "45%",
              flexShrink: 1,
            }}
          >
            <div
              style={{
                fontSize: pillFontSize,
                fontFamily: FONTS.display,
                fontWeight: 900,
                color: BRAND.correctGreen,
                letterSpacing: 1,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.1,
              }}
            >
              {(correctAnswerText || "").toUpperCase()}
            </div>
          </div>
        </div>
      </TopBar>
    );
  }
  
  // ═══ NORMAL MOD: BurstBadge + soru cümlesi ═══
  const questionUpper = questionText.toUpperCase();
  
  return (
    <TopBar theme={theme} height={barHeight}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          paddingLeft: padding,
          paddingRight: padding,
          gap: 20,
        }}
      >
        <div
          style={{
            transform: `translateX(${badgeX}px)`,
            opacity: badgeOpacity,
            flexShrink: 0,
          }}
        >
          <BurstBadge number={questionNumber} size={badgeSize} theme={theme} />
        </div>
        
        <div
          style={{
            flex: 1,
            textAlign: "center",
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
            paddingRight: badgeSize + 8,
          }}
        >
          <div
            style={{
              fontSize: fontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: BRAND.white,
              textShadow: `
                -3px -3px 0 ${BRAND.black},
                3px -3px 0 ${BRAND.black},
                -3px 3px 0 ${BRAND.black},
                3px 3px 0 ${BRAND.black},
                0 6px 12px rgba(0,0,0,0.5)
              `,
              lineHeight: 1.1,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {questionUpper}
          </div>
        </div>
      </div>
    </TopBar>
  );
};

export { BurstBadge as StarBadge } from "./BurstBadge";
