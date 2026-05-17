import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS, FPS } from "../styles/theme";

interface CountdownTimerProps {
  startFrame: number;
  durationFrames: number; // 5 saniye = 150 frame
  width?: number | string;
  showNumber?: boolean; // Büyük rakamı göster
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  startFrame,
  durationFrames,
  width = "80%",
  showNumber = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Şu anki ilerleme (0 = başlangıç, 1 = bitiş)
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Kalan saniye (5, 4, 3, 2, 1)
  const remainingSeconds = Math.max(
    1,
    Math.ceil(((startFrame + durationFrames - frame) / fps))
  );

  // Renk: ilk 3 saniye sarı, son 2 saniye kırmızı
  const isDanger = progress > 0.6;
  const fillColor = isDanger ? COLORS.timerFillDanger : COLORS.timerFill;
  
  // Görünür mü
  if (frame < startFrame || frame >= startFrame + durationFrames) {
    return null;
  }

  // Her saniyede bir pulse animasyonu
  const secondTick = Math.floor((frame - startFrame) / fps);
  const pulseStartFrame = startFrame + (secondTick * fps);
  const pulseProgress = (frame - pulseStartFrame) / fps; // 0-1 her saniye
  const pulseScale = pulseProgress < 0.15
    ? interpolate(pulseProgress, [0, 0.15], [1.3, 1.0])
    : 1.0;

  return (
    <div
      style={{
        position: "relative",
        width,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
      }}
    >
      {/* Büyük sayı */}
      {showNumber && (
        <div
          style={{
            fontSize: 200,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: fillColor,
            textShadow: `
              -6px -6px 0 black,
              6px -6px 0 black,
              -6px 6px 0 black,
              6px 6px 0 black,
              0 0 30px ${fillColor}
            `,
            lineHeight: 1,
            transform: `scale(${pulseScale})`,
            transition: "color 0.2s",
          }}
        >
          {remainingSeconds}
        </div>
      )}

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          height: 24,
          backgroundColor: COLORS.timerBg,
          borderRadius: 12,
          border: "3px solid black",
          overflow: "hidden",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            width: `${(1 - progress) * 100}%`,
            height: "100%",
            backgroundColor: fillColor,
            transition: "background-color 0.3s",
            boxShadow: `inset 0 -4px 8px rgba(0,0,0,0.2), 0 0 20px ${fillColor}`,
          }}
        />
      </div>
    </div>
  );
};
