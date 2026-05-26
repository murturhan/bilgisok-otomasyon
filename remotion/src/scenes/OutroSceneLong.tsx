// REV 001/26MAY26 - motionSpeed 1.5->2.5
import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Video,
  staticFile,
} from "remotion";
import { BRAND, FONTS, THEME_COLORS, FPS } from "../styles/theme";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { JessPoses } from "../types/schemas";

interface Props {
  channelName: string;
  jessPoses: JessPoses;
  durationFrames: number;
  jessVideoDurationFrames: number;
}

export const OutroSceneLong: React.FC<Props> = ({
  durationFrames,
  jessVideoDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const theme = THEME_COLORS[2];
  
  const scene1End = Math.min(
    jessVideoDurationFrames + Math.floor(FPS * 0.3),
    durationFrames - Math.floor(FPS * 4)
  );
  const inScene1 = frame < scene1End;
  const inScene2 = frame >= scene1End;
  
  const TR_LEN = Math.floor(FPS * 0.5);
  const inTransition = frame >= scene1End && frame < scene1End + TR_LEN;
  const trLocal = frame - scene1End;
  
  const flashOpacity = inTransition
    ? interpolate(trLocal, [0, 5, TR_LEN], [0, 0.95, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
    : 0;
  const scene1Scale = inTransition ? interpolate(trLocal, [0, TR_LEN], [1, 1.2], { extrapolateRight: "clamp" }) : 1;
  const scene1Opacity = inTransition ? interpolate(trLocal, [0, TR_LEN * 0.6, TR_LEN], [1, 0.6, 0], { extrapolateRight: "clamp" }) : 1;
  const scene1Blur = inTransition ? interpolate(trLocal, [0, TR_LEN], [0, 8], { extrapolateRight: "clamp" }) : 0;
  
  return (
    <AbsoluteFill>
      <AnimatedBackground theme={theme} pattern="stars" motionSpeed={2.5} />
      <VerticalBrandTag side="right" topOffset={100} bottomOffset={100} fontSize={32} />
      
      {(inScene1 || inTransition) && (
        <div style={{
          position: "absolute", inset: 0,
          opacity: scene1Opacity,
          transform: `scale(${scene1Scale})`,
          filter: scene1Blur > 0 ? `blur(${scene1Blur}px)` : undefined,
        }}>
          <Scene1Long />
        </div>
      )}
      
      {inScene2 && !inTransition && (
        <Scene2Long startFrame={scene1End} />
      )}
      
      {inTransition && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: BRAND.white,
          opacity: flashOpacity,
          zIndex: 99, pointerEvents: "none",
        }} />
      )}
    </AbsoluteFill>
  );
};

// ═══ SAHNE 1 ═══ GREAT JOB üstte, trofe SOL ortada, Jess SAĞ (YATAY)
const Scene1Long: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const titleAnim = spring({ frame, fps, config: { damping: 9, stiffness: 110 } });
  const titleScale = interpolate(titleAnim, [0, 1], [0, 1]);
  const titlePulse = 1 + Math.sin(frame * 0.12) * 0.03;
  
  const trophyAnim = spring({ frame: frame - 14, fps, config: { damping: 8, stiffness: 120 } });
  const trophyScale = interpolate(trophyAnim, [0, 1], [0, 1]);
  const trophyRotate = interpolate(trophyAnim, [0, 0.6, 1], [-30, 15, 0]);
  const trophyBounce = Math.sin(frame * 0.1) * 12;
  
  const sideEmojiAnim = spring({ frame: frame - 20, fps, config: { damping: 11, stiffness: 100 } });
  const sideEmojiOpacity = interpolate(sideEmojiAnim, [0, 1], [0, 1]);
  const sideEmojiY = interpolate(sideEmojiAnim, [0, 1], [40, 0]);
  
  return (
    <>
      {/* ÜST: GREAT JOB! */}
      <div style={{
        position: "absolute", top: "5%", left: 0, right: 0,
        display: "flex", justifyContent: "center", zIndex: 10,
      }}>
        <div style={{
          transform: `scale(${titleScale * titlePulse})`,
          fontSize: 160, fontFamily: FONTS.display, fontWeight: 900,
          color: BRAND.yellow,
          textShadow: `
            -8px -8px 0 ${BRAND.black},
            8px -8px 0 ${BRAND.black},
            -8px 8px 0 ${BRAND.black},
            8px 8px 0 ${BRAND.black},
            14px 14px 0 #FF1493
          `,
          textAlign: "center", lineHeight: 1, letterSpacing: 4,
          textTransform: "uppercase",
        }}>
          GREAT JOB!
        </div>
      </div>
      
      {/* SOL ORTA: Trofe + yan emojiler */}
      <div style={{
        position: "absolute", left: "5%", top: "35%", width: "55%",
        display: "flex", justifyContent: "center", alignItems: "center",
        gap: 40, zIndex: 10,
      }}>
        <div style={{
          opacity: sideEmojiOpacity,
          transform: `translateY(${sideEmojiY}px) rotate(${Math.sin(frame * 0.1) * 10}deg)`,
          fontSize: 140, filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.5))",
          lineHeight: 1,
        }}>⭐</div>
        
        <div style={{
          transform: `scale(${trophyScale}) rotate(${trophyRotate}deg) translateY(${trophyBounce}px)`,
          fontSize: 340, filter: "drop-shadow(0 18px 40px rgba(0,0,0,0.6))",
          lineHeight: 1,
        }}>🏆</div>
        
        <div style={{
          opacity: sideEmojiOpacity,
          transform: `translateY(${sideEmojiY}px) rotate(${Math.cos(frame * 0.1) * 10}deg)`,
          fontSize: 140, filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.5))",
          lineHeight: 1,
        }}>🎊</div>
      </div>
      
      {/* SAĞ: Jess Video */}
      <div style={{
        position: "absolute", right: "2%", bottom: 0, width: "40%",
        display: "flex", justifyContent: "center",
      }}>
        <Video
          src={staticFile("jess/outro.webm")}
          style={{ width: 600, height: 600, objectFit: "contain" }}
          volume={1}
        />
      </div>
    </>
  );
};

// ═══ SAHNE 2 ═══ Subscribe (YATAY - merkez)
const Scene2Long: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;
  
  const subAnim = spring({ frame: localFrame, fps, config: { damping: 10, stiffness: 100 } });
  const subScale = interpolate(subAnim, [0, 1], [0, 1]);
  const subPulse = 1 + Math.sin(frame * 0.15) * 0.05;
  
  const taglineAnim = spring({ frame: localFrame - 12, fps, config: { damping: 12, stiffness: 100 } });
  const taglineY = interpolate(taglineAnim, [0, 1], [60, 0]);
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  
  const arrowAnim = spring({ frame: localFrame - 22, fps, config: { damping: 11, stiffness: 110 } });
  const arrowY = interpolate(arrowAnim, [0, 1], [-100, 0]);
  const arrowOpacity = interpolate(arrowAnim, [0, 0.5], [0, 1]);
  const arrowBounce = Math.sin(localFrame * 0.18) * 15;
  
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 60, zIndex: 10,
    }}>
      <div style={{
        opacity: arrowOpacity,
        transform: `translateY(${arrowY + arrowBounce}px)`,
        fontSize: 200, filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))",
        lineHeight: 1,
      }}>👇</div>
      
      <div style={{
        transform: `scale(${subScale * subPulse})`,
        backgroundColor: "#FF0000", color: BRAND.white,
        padding: "60px 140px", borderRadius: 80,
        fontSize: 110, fontFamily: FONTS.display, fontWeight: 900,
        border: `10px solid ${BRAND.black}`,
        boxShadow: "0 16px 50px rgba(0,0,0,0.6), 0 0 100px #FF0000",
        display: "flex", alignItems: "center", gap: 30,
        letterSpacing: 3, textTransform: "uppercase",
      }}>
        ▶ SUBSCRIBE
      </div>
      
      <div style={{
        opacity: taglineOpacity,
        transform: `translateY(${taglineY}px)`,
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: "32px 60px", borderRadius: 50,
        fontSize: 70, fontFamily: FONTS.display, fontWeight: 900,
        color: BRAND.white,
        textShadow: `
          -4px -4px 0 ${BRAND.black},
          4px -4px 0 ${BRAND.black},
          -4px 4px 0 ${BRAND.black},
          4px 4px 0 ${BRAND.black}
        `,
        textAlign: "center", letterSpacing: 2, textTransform: "uppercase",
      }}>
        SEE YOU NEXT TIME! 👋
      </div>
    </div>
  );
};
