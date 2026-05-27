// REV 002/27MAY26 - baseColor white (sarı palette ile çakışıyordu, renkler görünmüyordu)
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
import { GeniMiniLogo } from "../components/BrandAssets";
import { HighlightedText } from "../components/HighlightedText";
import { JessPoses } from "../types/schemas";
import {
  SHORTS_GREETING_TEXT,
  getTopicEmojis,
  buildTopic3DShadow,
} from "./IntroHelpers";

interface Props {
  channelName: string;
  topic: string;
  topicEmojis?: string[];
  jessPoses: JessPoses;
  durationFrames: number;
  jessVideoDurationFrames: number;
}

/**
 * INTRO SHORTS - 1080x1920 dikey
 * Sahne 1: Logo + greeting balonu üstte, Jess altta
 * Sahne 2: Topic 3D + emoji bandı
 */
export const IntroSceneShorts: React.FC<Props> = ({
  topic,
  topicEmojis,
  durationFrames,
  jessVideoDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const theme = THEME_COLORS[0];
  
  const scene1End = Math.min(
    jessVideoDurationFrames + Math.floor(FPS * 0.3),
    durationFrames - Math.floor(FPS * 3)
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
      <AnimatedBackground theme={theme} pattern="bolt" motionSpeed={1.5} />
      <VerticalBrandTag side="right" topOffset={200} bottomOffset={200} fontSize={28} />
      
      {(inScene1 || inTransition) && (
        <div style={{
          position: "absolute", inset: 0,
          opacity: scene1Opacity,
          transform: `scale(${scene1Scale})`,
          filter: scene1Blur > 0 ? `blur(${scene1Blur}px)` : undefined,
        }}>
          <Scene1Shorts />
        </div>
      )}
      
      {inScene2 && !inTransition && (
        <Scene2Shorts topic={topic} topicEmojis={topicEmojis} startFrame={scene1End} />
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

// ═══ SAHNE 1 ═══ Logo+balon üstte, Jess altta (DİKEY)
const Scene1Shorts: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const logoAnim = spring({ frame, fps, config: { damping: 11, stiffness: 110 } });
  const logoScale = interpolate(logoAnim, [0, 1], [0, 1]);
  const logoY = interpolate(logoAnim, [0, 1], [-120, 0]);
  const logoIdleBounce = frame > 25 ? Math.sin(frame * 0.1) * 6 : 0;
  
  const greetingAnim = spring({ frame: frame - 18, fps, config: { damping: 13, stiffness: 100 } });
  const greetingScale = interpolate(greetingAnim, [0, 1], [0, 1]);
  const greetingOpacity = interpolate(greetingAnim, [0, 0.5], [0, 1]);
  const greetingFloat = Math.sin(frame * 0.08) * 5;
  const greetingTilt = Math.sin(frame * 0.1) * 1.5;
  
  return (
    <>
      <div style={{
        position: "absolute", top: "5%", left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 32,
      }}>
        <div style={{
          transform: `translateY(${logoY + logoIdleBounce}px) scale(${logoScale})`,
          display: "flex", justifyContent: "center",
        }}>
          <GeniMiniLogo width={900} />
        </div>
        
        <div style={{
          opacity: greetingOpacity,
          transform: `scale(${greetingScale}) translateY(${greetingFloat}px) rotate(${greetingTilt}deg)`,
          backgroundColor: BRAND.white, color: BRAND.black,
          padding: "20px 36px", borderRadius: 36,
          fontSize: 44, fontFamily: FONTS.display, fontWeight: 900,
          border: `5px solid ${BRAND.yellow}`,
          boxShadow: `0 10px 25px rgba(0,0,0,0.45), 0 0 40px ${BRAND.yellow}`,
          maxWidth: "85%", textAlign: "center", letterSpacing: 0.5,
          lineHeight: 1.2, textTransform: "uppercase",
        }}>
          {SHORTS_GREETING_TEXT}
        </div>
      </div>
      
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        display: "flex", justifyContent: "center",
      }}>
        <Video
          src={staticFile("jess/intro.webm")}
          style={{ width: 900, height: 900, objectFit: "contain" }}
          volume={1}
        />
      </div>
    </>
  );
};

// ═══ SAHNE 2 ═══ Topic 3D + emoji band (DİKEY)
const Scene2Shorts: React.FC<{ topic: string; topicEmojis?: string[]; startFrame: number }> = ({ topic, topicEmojis: topicEmojisProp, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const localFrame = frame - startFrame;

  const topicEmojis = topicEmojisProp && topicEmojisProp.length > 0 ? topicEmojisProp : getTopicEmojis(topic);
  const topicUpper = (topic || "").toUpperCase();
  
  const smallLogoAnim = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 110 } });
  const smallLogoX = interpolate(smallLogoAnim, [0, 1], [-200, 0]);
  const smallLogoOpacity = interpolate(smallLogoAnim, [0, 0.5], [0, 1]);
  
  const topicAnim = spring({ frame: localFrame - 4, fps, config: { damping: 9, stiffness: 130 } });
  const topicScale = interpolate(topicAnim, [0, 1], [0, 1]);
  const topicOpacity = interpolate(topicAnim, [0, 0.5], [0, 1]);
  const topicRotate = interpolate(topicAnim, [0, 0.7, 1], [-15, 5, 0]);
  const topicPulse = 1 + Math.sin(localFrame * 0.1) * 0.025;
  const topicWobble = Math.sin(localFrame * 0.07) * 1.8;
  const topicFloat = Math.cos(localFrame * 0.09) * 12;
  
  const emojiAnim = spring({ frame: localFrame - 18, fps, config: { damping: 11, stiffness: 100 } });
  const emojiOpacity = interpolate(emojiAnim, [0, 1], [0, 1]);
  const emojiY = interpolate(emojiAnim, [0, 1], [80, 0]);
  
  // Font: shorts 2.5x büyütülmüş, binary search ile fit (** markers hariç)
  const topicForFit = topicUpper.replace(/\*\*/g, "");
  const topicLen = topicForFit.length;
  let maxTargetFont: number;
  if (topicLen < 18) maxTargetFont = 325;
  else if (topicLen < 30) maxTargetFont = 250;
  else if (topicLen < 45) maxTargetFont = 195;
  else maxTargetFont = 150;
  
  const titleInnerWidth = Math.floor(width * 0.94) - 112;
  const titleInnerHeight = Math.floor(height * 0.55);
  
  const fitTopicFont = (() => {
    const words = topicForFit.split(/\s+/).filter(Boolean);
    if (words.length === 0) return maxTargetFont;
    const fits = (fs: number): boolean => {
      const maxChars = Math.floor(titleInnerWidth / (fs * 0.55));
      if (maxChars < 3) return false;
      let lines = 1, lineLen = 0;
      for (const w of words) {
        if (w.length > maxChars) return false;
        const need = lineLen === 0 ? w.length : lineLen + 1 + w.length;
        if (need <= maxChars) lineLen = need;
        else { lines++; lineLen = w.length; }
      }
      return lines * fs * 1.05 <= titleInnerHeight;
    };
    let lo = 60, hi = maxTargetFont, best = 60;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  })();
  
  const topicFontSize = fitTopicFont;
  const topicTextShadow = buildTopic3DShadow(topicFontSize);
  const smallLogoWidth = width * 0.42;
  
  return (
    <>
      <div style={{
        position: "absolute", top: 60, left: 40,
        transform: `translateX(${smallLogoX}px)`,
        opacity: smallLogoOpacity, zIndex: 5,
      }}>
        <GeniMiniLogo width={smallLogoWidth} />
      </div>
      
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        paddingLeft: 40, paddingRight: 40,
      }}>
        <div style={{
          transform: `scale(${topicScale * topicPulse}) rotate(${topicRotate + topicWobble}deg) translateY(${topicFloat}px)`,
          opacity: topicOpacity,
          fontSize: topicFontSize, fontFamily: FONTS.display, fontWeight: 900,
          textShadow: topicTextShadow,
          maxWidth: "94%", textAlign: "center", letterSpacing: 2,
          textTransform: "uppercase", lineHeight: 1.05,
        }}>
          <HighlightedText text={topicUpper} baseColor={BRAND.white} />
        </div>
      </div>
      
      <div style={{
        position: "absolute", bottom: "18%", left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 30,
        transform: `translateY(${emojiY}px)`, opacity: emojiOpacity,
      }}>
        {topicEmojis.slice(0, 3).map((emoji, i) => {
          const swing = Math.sin(localFrame * 0.1 + i * 0.7) * 18;
          const bounce = Math.cos(localFrame * 0.12 + i * 0.5) * 14;
          const idleScale = 1 + Math.sin(localFrame * 0.13 + i) * 0.06;
          
          return (
            <div key={i} style={{
              fontSize: 180,
              transform: `translateY(${bounce}px) rotate(${swing}deg) scale(${idleScale})`,
              filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.5))",
              lineHeight: 1,
            }}>
              {emoji}
            </div>
          );
        })}
      </div>
    </>
  );
};
