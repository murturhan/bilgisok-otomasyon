import React from "react";
import { Img } from "remotion";
import { COLORS, FONTS } from "../styles/theme";

interface HeaderBarProps {
  channelName: string;
  questionNumber: number;
  totalQuestions: number;
  height?: number;
  logoSrc?: string; // YENİ: Jess logo PNG (sol üst yuvarlak kafa)
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  channelName,
  questionNumber,
  totalQuestions,
  height = 100,
  logoSrc,
}) => {
  const logoSize = Math.round(height * 0.85);
  
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        backgroundColor: COLORS.headerBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        borderBottom: `4px solid ${COLORS.primary}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: 20,
      }}
    >
      {/* Channel name + logo (left) */}
      <div
        style={{
          fontSize: 38,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: COLORS.textWhite,
          textShadow: "2px 2px 0 black",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {logoSrc ? (
          <div
            style={{
              width: logoSize,
              height: logoSize,
              borderRadius: "50%",
              overflow: "hidden",
              border: `3px solid ${COLORS.primary}`,
              backgroundColor: "rgba(255,255,255,0.1)",
              flexShrink: 0,
            }}
          >
            <Img
              src={logoSrc}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        ) : (
          <span style={{ fontSize: logoSize * 0.75 }}>🦊</span>
        )}
        <span>{channelName}</span>
      </div>

      {/* Question counter (right) */}
      <div
        style={{
          fontSize: 32,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: COLORS.primary,
          backgroundColor: COLORS.textBlack,
          padding: "8px 24px",
          borderRadius: 24,
          border: `3px solid ${COLORS.primary}`,
        }}
      >
        Question {questionNumber}/{totalQuestions}
      </div>
    </div>
  );
};
