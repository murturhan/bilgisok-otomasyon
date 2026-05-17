import React from "react";
import { useCurrentFrame, interpolate, Img, staticFile } from "remotion";

interface JessCharacterProps {
  pose: "intro" | "question" | "thinking" | "correct" | "outro";
  poses: { [key: string]: string | undefined };
  position?: "center" | "bottom-right" | "bottom-left" | "right" | "left";
  size?: number; // px (genişlik)
  animate?: boolean; // yukarı-aşağı yumuşak salınım
}

export const JessCharacter: React.FC<JessCharacterProps> = ({
  pose,
  poses,
  position = "bottom-right",
  size = 350,
  animate = true,
}) => {
  const frame = useCurrentFrame();
  
  // Poz dosya yolunu al, yoksa hiç gösterme
  const posePath = poses[pose];
  if (!posePath) {
    return null;
  }
  
  // Yumuşak salınım (saniyede ~0.5 cycle)
  const bobbing = animate
    ? Math.sin(frame * 0.08) * 8 // ±8px yukarı-aşağı
    : 0;
  
  // Hafif rotasyon (saniyede ~0.3 cycle)
  const rotating = animate
    ? Math.sin(frame * 0.05) * 1.5 // ±1.5 derece
    : 0;

  // Konum stilleri
  const positionStyles: { [key: string]: React.CSSProperties } = {
    "center": {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: `translate(-50%, calc(-50% + ${bobbing}px)) rotate(${rotating}deg)`,
    },
    "bottom-right": {
      position: "absolute",
      right: 40,
      bottom: 40 + bobbing,
      transform: `rotate(${rotating}deg)`,
    },
    "bottom-left": {
      position: "absolute",
      left: 40,
      bottom: 40 + bobbing,
      transform: `rotate(${rotating}deg)`,
    },
    "right": {
      position: "absolute",
      right: 40,
      top: "50%",
      transform: `translateY(calc(-50% + ${bobbing}px)) rotate(${rotating}deg)`,
    },
    "left": {
      position: "absolute",
      left: 40,
      top: "50%",
      transform: `translateY(calc(-50% + ${bobbing}px)) rotate(${rotating}deg)`,
    },
  };

  return (
    <div style={{ ...positionStyles[position], zIndex: 10 }}>
      <Img
        src={posePath}
        style={{
          width: size,
          height: "auto",
          filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.3))",
        }}
      />
    </div>
  );
};
