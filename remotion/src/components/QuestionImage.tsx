import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig, Img } from "remotion";
import { COLORS } from "../styles/theme";

interface QuestionImageProps {
  src: string;
  showFrame: number; // Görünmeye başlama frame'i
  width: number;
  height: number;
}

export const QuestionImage: React.FC<QuestionImageProps> = ({
  src,
  showFrame,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Görselin gelişi: scale + opacity spring
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: {
      damping: 14,
      stiffness: 100,
    },
  });

  const scale = interpolate(enterAnim, [0, 1], [0.7, 1]);
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  
  // Yumuşak nefes alma animasyonu (saniyede ~0.5 cycle)
  const breathing = 1 + Math.sin(frame * 0.05) * 0.015;
  
  return (
    <div
      style={{
        width,
        height,
        opacity,
        transform: `scale(${scale * breathing})`,
        borderRadius: 24,
        overflow: "hidden",
        border: `8px solid ${COLORS.primary}`,
        boxShadow: `
          0 12px 32px rgba(0, 0, 0, 0.4),
          0 0 20px ${COLORS.primary}
        `,
        backgroundColor: COLORS.textWhite,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
};
