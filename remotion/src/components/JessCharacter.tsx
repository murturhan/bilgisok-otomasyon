import React from "react";
import { useCurrentFrame, interpolate, Img } from "remotion";

interface JessCharacterProps {
  pose: "intro" | "question" | "thinking" | "correct" | "outro" | "transition";
  poses: { [key: string]: string | undefined };
  position?: "center" | "bottom-right" | "bottom-left" | "bottom-center" | "right" | "left";
  size?: number;
  animate?: boolean;
  customStyle?: React.CSSProperties;
}

export const JessCharacter: React.FC<JessCharacterProps> = ({
  pose,
  poses,
  position = "bottom-right",
  size = 350,
  animate = true,
  customStyle,
}) => {
  const frame = useCurrentFrame();
  
  const posePath = poses[pose];
  if (!posePath) {
    return null;
  }
  
  const bobbing = animate ? Math.sin(frame * 0.08) * 8 : 0;
  const rotating = animate ? Math.sin(frame * 0.05) * 1.5 : 0;

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
    "bottom-center": {
      position: "absolute",
      left: "50%",
      bottom: 20,
      transform: `translateX(-50%) translateY(${-bobbing}px) rotate(${rotating}deg)`,
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
    <div style={{ ...positionStyles[position], zIndex: 10, ...customStyle }}>
      <Img
        src={posePath}
        style={{
          width: size,
          height: "auto",
          filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.4))",
        }}
      />
    </div>
  );
};
