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
import { JessPoses } from "../types/schemas";

interface IntroSceneProps {
  channelName: string;
  topic: string;
  jessPoses: JessPoses;
  durationFrames: number;
}

function getTopicEmojis(topic: string): string[] {
  const t = topic.toLowerCase();
  
  if (/invent|technolog|machine|gadget|computer|phone|comput/i.test(t))
    return ["📞", "💡", "✈️", "📷", "🎬", "🚗"];
  if (/animal|wild|pet|fox|dog|cat|jungle|safari|home/i.test(t))
    return ["🦁", "🐘", "🦒", "🐯", "🐧", "🐵"];
  if (/food|fruit|drink|cook|cuisine|snack|dish/i.test(t))
    return ["🍕", "🍔", "🍎", "🍦", "🍩", "🥕"];
  if (/countr|geograph|flag|world|capital|landmark|city/i.test(t))
    return ["🗺️", "🌍", "🗽", "🏔️", "🏛️", "🚩"];
  if (/space|planet|astronaut|star|galaxy|moon|sun/i.test(t))
    return ["🚀", "🌙", "⭐", "🪐", "👽", "☄️"];
  if (/plant|flower|tree|forest|nature|garden/i.test(t))
    return ["🌳", "🌸", "🌻", "🍄", "🌵", "🌿"];
  if (/sport|game|ball|olympic/i.test(t))
    return ["⚽", "🏀", "🎾", "🏈", "⛹️", "🏆"];
  if (/vehicl|car|truck|transport|plane|train|ship|machine/i.test(t))
    return ["🚗", "✈️", "🚂", "🚢", "🚁", "🚀"];
  if (/scien|physic|chem|biolog|experiment/i.test(t))
    return ["🧪", "🔬", "🧬", "⚗️", "🧲", "🔭"];
  if (/music|instrument|song|sound/i.test(t))
    return ["🎵", "🎸", "🎹", "🥁", "🎤", "🎺"];
  
  return ["📚", "💡", "🎨", "🔍", "🌟", "🎯"];
}

/**
 * INTRO - İKİ SAHNE
 * 
 * Sahne 1 (ilk %50): Jess karşılama VIDEO (lip-sync, alpha-channel WebM)
 *   - GeniMini logo üstte
 *   - JESS VIDEO altta (07-video-montaj chroma key'den alpha WebM olarak indirir)
 *   - Greeting metni video'nun KENDİ sesi (TTS Leda pitch+3) ile geliyor
 * 
 * Geçiş: 0.5s güçlü beyaz flash + scale + blur
 * 
 * Sahne 2 (son %50): Topic reveal
 *   - Logo KÜÇÜK sol üstte
 *   - Büyük TOPIC başlığı ortada (patlama efektiyle)
 *   - Altta bouncing emoji bandı
 */
export const IntroScene: React.FC<IntroSceneProps> = ({
  channelName,
  topic,
  jessPoses,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isVertical = height > width;
  
  const theme = THEME_COLORS[0]; // pink
  
  // İki sahneye böl
  const scene1End = Math.floor(durationFrames * 0.5);
  const scene2Start = scene1End;
  const inScene1 = frame < scene1End;
  const inScene2 = frame >= scene2Start;
  
  // GÜÇLÜ FLASH GEÇİŞ — 0.5s
  const TR_LEN = Math.floor(FPS * 0.5);
  const inTransition = frame >= scene1End && frame < scene1End + TR_LEN;
  const trLocal = frame - scene1End;
  
  const flashOpacity = inTransition
    ? interpolate(trLocal, [0, 5, TR_LEN], [0, 0.95, 0], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
      })
    : 0;
  
  const scene1Exiting = inTransition;
  const scene1Scale = scene1Exiting
    ? interpolate(trLocal, [0, TR_LEN], [1, 1.2], { extrapolateRight: "clamp" })
    : 1;
  const scene1Opacity = scene1Exiting
    ? interpolate(trLocal, [0, TR_LEN * 0.6, TR_LEN], [1, 0.6, 0], { extrapolateRight: "clamp" })
    : 1;
  const scene1Blur = scene1Exiting
    ? interpolate(trLocal, [0, TR_LEN], [0, 8], { extrapolateRight: "clamp" })
    : 0;
  
  return (
    <AbsoluteFill>
      <AnimatedBackground theme={theme} pattern="bolt" motionSpeed={1.5} />
      
      <VerticalBrandTag
        side="right"
        topOffset={isVertical ? 200 : 100}
        bottomOffset={isVertical ? 200 : 100}
        fontSize={isVertical ? 28 : 32}
      />
      
      {(inScene1 || inTransition) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: scene1Opacity,
            transform: `scale(${scene1Scale})`,
            filter: scene1Blur > 0 ? `blur(${scene1Blur}px)` : undefined,
          }}
        >
          <IntroScene1
            isVertical={isVertical}
            width={width}
            height={height}
          />
        </div>
      )}
      
      {inScene2 && !inTransition && (
        <IntroScene2
          topic={topic}
          startFrame={scene2Start}
          isVertical={isVertical}
          width={width}
          height={height}
        />
      )}
      
      {inTransition && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: BRAND.white,
            opacity: flashOpacity,
            zIndex: 99,
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════
// SAHNE 1 — Logo + Jess karşılama VIDEO (lip-sync + ses dahil)
// ═══════════════════════════════════════════════════
const IntroScene1: React.FC<{
  isVertical: boolean;
  width: number;
  height: number;
}> = ({ isVertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Logo enter
  const logoAnim = spring({ frame, fps, config: { damping: 11, stiffness: 110 } });
  const logoScale = interpolate(logoAnim, [0, 1], [0, 1]);
  const logoY = interpolate(logoAnim, [0, 1], [-120, 0]);
  const logoIdleBounce = frame > 25 ? Math.sin(frame * 0.1) * 6 : 0;
  
  // Boyutlar
  const logoWidth = isVertical ? 900 : 800;
  const jessVideoSize = isVertical ? 900 : 720;
  
  return (
    <>
      {/* LOGO - üstte */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "6%" : "8%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            transform: `translateY(${logoY + logoIdleBounce}px) scale(${logoScale})`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <GeniMiniLogo width={logoWidth} />
        </div>
      </div>
      
      {/* JESS VIDEO - alt-orta, alpha-channel WebM */}
      {/* Video kendi sesini taşır (TTS Leda pitch+3 ile lip-sync uyumlu) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Video
          src={staticFile("jess/intro.webm")}
          style={{
            width: jessVideoSize,
            height: jessVideoSize,
            objectFit: "contain",
          }}
          volume={1}
        />
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════
// SAHNE 2 — TOPIC REVEAL
// ═══════════════════════════════════════════════════
const IntroScene2: React.FC<{
  topic: string;
  startFrame: number;
  isVertical: boolean;
  width: number;
  height: number;
}> = ({ topic, startFrame, isVertical, width }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;
  
  const topicEmojis = getTopicEmojis(topic);
  const topicUpper = (topic || "").toUpperCase();
  
  const smallLogoAnim = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 110 },
  });
  const smallLogoX = interpolate(smallLogoAnim, [0, 1], [-200, 0]);
  const smallLogoOpacity = interpolate(smallLogoAnim, [0, 0.5], [0, 1]);
  
  const topicAnim = spring({
    frame: localFrame - 4,
    fps,
    config: { damping: 9, stiffness: 130 },
  });
  const topicScale = interpolate(topicAnim, [0, 1], [0, 1]);
  const topicOpacity = interpolate(topicAnim, [0, 0.5], [0, 1]);
  const topicRotate = interpolate(topicAnim, [0, 0.7, 1], [-15, 5, 0]);
  const topicPulse = 1 + Math.sin(localFrame * 0.1) * 0.025;
  
  const emojiAnim = spring({
    frame: localFrame - 18,
    fps,
    config: { damping: 11, stiffness: 100 },
  });
  const emojiOpacity = interpolate(emojiAnim, [0, 1], [0, 1]);
  const emojiY = interpolate(emojiAnim, [0, 1], [80, 0]);
  
  // Dinamik font - topic uzunluğuna göre
  const topicLen = topicUpper.length;
  let topicFontSize: number;
  if (isVertical) {
    if (topicLen < 18) topicFontSize = 130;
    else if (topicLen < 30) topicFontSize = 100;
    else if (topicLen < 45) topicFontSize = 78;
    else topicFontSize = 60;
  } else {
    if (topicLen < 18) topicFontSize = 150;
    else if (topicLen < 30) topicFontSize = 120;
    else if (topicLen < 45) topicFontSize = 90;
    else topicFontSize = 72;
  }
  
  const smallLogoWidth = isVertical ? width * 0.42 : width * 0.22;
  
  return (
    <>
      {/* KÜÇÜK LOGO - sol üst */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? 60 : 40,
          left: isVertical ? 40 : 60,
          transform: `translateX(${smallLogoX}px)`,
          opacity: smallLogoOpacity,
          zIndex: 5,
        }}
      >
        <GeniMiniLogo width={smallLogoWidth} />
      </div>
      
      {/* TOPIC */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 40,
          paddingRight: 40,
        }}
      >
        <div
          style={{
            transform: `scale(${topicScale * topicPulse}) rotate(${topicRotate}deg)`,
            opacity: topicOpacity,
            backgroundColor: BRAND.white,
            color: BRAND.black,
            padding: isVertical ? "36px 56px" : "44px 80px",
            borderRadius: 60,
            fontSize: topicFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            border: `8px solid ${BRAND.yellow}`,
            boxShadow: `0 16px 40px rgba(0,0,0,0.6), 0 0 80px ${BRAND.yellow}`,
            maxWidth: "94%",
            textAlign: "center",
            letterSpacing: 1,
            textTransform: "uppercase",
            lineHeight: 1.05,
          }}
        >
          {topicUpper}
        </div>
      </div>
      
      {/* EMOJI BANDI */}
      <div
        style={{
          position: "absolute",
          bottom: isVertical ? "8%" : "10%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: isVertical ? 30 : 50,
          transform: `translateY(${emojiY}px)`,
          opacity: emojiOpacity,
        }}
      >
        {topicEmojis.slice(0, isVertical ? 3 : 5).map((emoji, i) => {
          const swing = Math.sin(localFrame * 0.1 + i * 0.7) * 18;
          const bounce = Math.cos(localFrame * 0.12 + i * 0.5) * 14;
          const idleScale = 1 + Math.sin(localFrame * 0.13 + i) * 0.06;
          
          return (
            <div
              key={i}
              style={{
                fontSize: isVertical ? 180 : 200,
                transform: `translateY(${bounce}px) rotate(${swing}deg) scale(${idleScale})`,
                filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.5))",
                lineHeight: 1,
              }}
            >
              {emoji}
            </div>
          );
        })}
      </div>
    </>
  );
};
