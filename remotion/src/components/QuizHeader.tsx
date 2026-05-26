// REV 001/26MAY26 - HighlightedText + idle bounce
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { BRAND, FONTS, ThemeColor, THEME_COLORS } from "../styles/theme";
import { BurstBadge } from "./BurstBadge";
import { TopBar } from "./TopBar";
import { HighlightedText } from "./HighlightedText";

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
  
  const idleBounce = Math.sin(frame * 0.08) * 4;

  // Boyutlar - soru başlığı font sabit, BAR 1/3 büyütüldü (kullanıcı talebi)
  const badgeSize = isVertical ? 160 : 180;
  const fontSize = isVertical ? 78 : 90;
  const barHeight = isVertical ? 267 : 293;
  const padding = isVertical ? 28 : 50;

  // ═══ FACT MODU: Ampul sol + DID YOU KNOW + yeşil pill sağ ═══
  if (isFactMode) {
    const bulbSize = isVertical ? 110 : 140;
    const didYouKnowFontSize = isVertical ? 72 : 86;
    const pillFontSize = isVertical ? 62 : 76;
    
    return (
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: barHeight, transform: `translateY(${idleBounce}px)` }}>
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
      </div>
    );
  }

  // ═══ NORMAL MOD: BurstBadge + soru cümlesi ═══
  const questionUpper = questionText.replace(/\*\*/g, "").toUpperCase();
  
  // DİNAMİK FONT: 3 satıra sığması için font küçültme
  // Tahmini: shorts'ta soru alanı genişliği ~ 1080 - 2*padding - badge - gap - badgePadRight ≈ 700px
  // Lilita One uppercase ortalama karakter genişliği = 0.55 * fontSize
  // 3 satır = 3 * fontSize * 1.1 (lineHeight)
  // Bar yüksekliği (padding hariç) = barHeight - ~40px padding
  
  // Mevcut font - shorts 78, long 90
  // Eğer metin uzunsa: küçült
  const innerBarHeight = barHeight - 40;
  const titleAreaWidth = isVertical ? 760 : 1100;
  const charWidthRatio = 0.55;
  const lineHeight = 1.1;
  
  // 3 satıra sığan en büyük font'u binary search ile bul
  const calcFitFont = (maxFont: number, minFont: number = 36): number => {
    const words = questionUpper.split(/\s+/).filter(Boolean);
    if (words.length === 0) return maxFont;
    
    const fits = (fs: number): boolean => {
      const maxCharsPerLine = Math.floor(titleAreaWidth / (fs * charWidthRatio));
      if (maxCharsPerLine < 3) return false;
      let lines = 1, lineLen = 0;
      for (const w of words) {
        if (w.length > maxCharsPerLine) return false;
        const need = lineLen === 0 ? w.length : lineLen + 1 + w.length;
        if (need <= maxCharsPerLine) lineLen = need;
        else { lines++; lineLen = w.length; }
      }
      // 3 satıra sığsın ve toplam yükseklik bar inner height'ı aşmasın
      if (lines > 3) return false;
      return lines * fs * lineHeight <= innerBarHeight;
    };
    
    let lo = minFont, hi = maxFont, best = minFont;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  };
  
  const dynFontSize = calcFitFont(fontSize);
  
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: barHeight, transform: `translateY(${idleBounce}px)` }}>
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
              fontSize: dynFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              textShadow: `
                -3px -3px 0 ${BRAND.black},
                3px -3px 0 ${BRAND.black},
                -3px 3px 0 ${BRAND.black},
                3px 3px 0 ${BRAND.black},
                0 6px 12px rgba(0,0,0,0.5)
              `,
              lineHeight: lineHeight,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            <HighlightedText text={questionText} baseColor={BRAND.white} />
          </div>
        </div>
      </div>
    </TopBar>
    </div>
  );
};

export { BurstBadge as StarBadge } from "./BurstBadge";
