import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { BRAND, FONTS, THEME_COLORS } from "../styles/theme";
import { JessCharacter } from "../components/JessCharacter";
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

export const IntroScene: React.FC<IntroSceneProps> = ({
  channelName,
  topic,
  jessPoses,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;
  
  const theme = THEME_COLORS[0]; // pink
  const topicEmojis = getTopicEmojis(topic);
  
  // Logo enter animasyonu (yukarıdan iner + büyür)
  const logoAnim = spring({
    frame: frame - 0,
    fps,
    config: { damping: 11, stiffness: 110 },
  });
  const logoScale = interpolate(logoAnim, [0, 1], [0, 1]);
  const logoY = interpolate(logoAnim, [0, 1], [-100, 0]);
  
  // Tagline
  const taglineAnim = spring({ frame: frame - 25, fps, config: { damping: 14, stiffness: 100 } });
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineAnim, [0, 1], [40, 0]);
  
  // Topic
  const topicAnim = spring({ frame: frame - 45, fps, config: { damping: 10, stiffness: 110 } });
  const topicScale = interpolate(topicAnim, [0, 1], [0, 1]);
  const topicOpacity = interpolate(topicAnim, [0, 0.5], [0, 1]);
  
  // Emoji bandı
  const emojiBandStart = 60;
  const emojiBandAnim = spring({
    frame: frame - emojiBandStart,
    fps,
    config: { damping: 12, stiffness: 100 }
  });
  const emojiBandOpacity = interpolate(emojiBandAnim, [0, 1], [0, 1]);
  const emojiBandY = interpolate(emojiBandAnim, [0, 1], [50, 0]);
  
  // Logo idle bounce
  const logoIdleBounce = frame > 30 ? Math.sin(frame * 0.1) * 6 : 0;
  
  // Boyutlar
  const logoWidth = isVertical ? width * 0.85 : width * 0.55;
  const taglineFontSize = isVertical ? 54 : 60;
  const topicFontSize = isVertical ? 56 : 64;
  
  const topicUpper = (topic || "").toUpperCase();
  
  return (
    <AbsoluteFill>
      <AnimatedBackground theme={theme} pattern="bolt" motionSpeed={1.5} />
      
      <VerticalBrandTag
        side="right"
        topOffset={200}
        bottomOffset={200}
        fontSize={isVertical ? 28 : 32}
      />
      
      <div
        style={{
          position: "absolute",
          top: isVertical ? "6%" : "8%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isVertical ? 26 : 36,
        }}
      >
        {/* LOGO - senin Canva tasarımı */}
        <div
          style={{
            transform: `translateY(${logoY + logoIdleBounce}px) scale(${logoScale})`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <GeniMiniLogo width={logoWidth} />
        </div>
        
        {/* Tagline */}
        <div
          style={{
            transform: `translateY(${taglineY}px)`,
            opacity: taglineOpacity,
            fontSize: taglineFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.yellow,
            textShadow: `
              -4px -4px 0 ${BRAND.black},
              4px -4px 0 ${BRAND.black},
              -4px 4px 0 ${BRAND.black},
              4px 4px 0 ${BRAND.black}
            `,
            textAlign: "center",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          FUN &amp; SMART LEARNING
        </div>
        
        {/* Topic */}
        {topic && (
          <div
            style={{
              transform: `scale(${topicScale})`,
              opacity: topicOpacity,
              backgroundColor: BRAND.white,
              color: BRAND.black,
              padding: isVertical ? "26px 50px" : "32px 70px",
              borderRadius: 60,
              fontSize: topicFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              border: `6px solid ${BRAND.yellow}`,
              boxShadow: `0 10px 28px rgba(0,0,0,0.5), 0 0 50px ${BRAND.yellow}`,
              maxWidth: "92%",
              textAlign: "center",
              letterSpacing: 1,
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            {topicUpper}
          </div>
        )}
        
        {/* Emoji bandı - sallanan, BÜYÜK (kullanıcı talebi: daha büyük + aşağıda) */}
        <div
          style={{
            transform: `translateY(${emojiBandY}px)`,
            opacity: emojiBandOpacity,
            display: "flex",
            gap: isVertical ? 30 : 50,
            justifyContent: "center",
            marginTop: 20,
          }}
        >
          {topicEmojis.slice(0, isVertical ? 3 : 5).map((emoji, i) => {
            const swing = Math.sin(frame * 0.08 + i * 0.6) * 15;
            const bounce = Math.cos(frame * 0.1 + i * 0.5) * 10;
            const idleScale = 1 + Math.sin(frame * 0.12 + i) * 0.05;
            
            return (
              <div
                key={i}
                style={{
                  fontSize: isVertical ? 170 : 180,
                  transform: `translateY(${bounce}px) rotate(${swing}deg) scale(${idleScale})`,
                  filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
                  lineHeight: 1,
                }}
              >
                {emoji}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* JESS - alt orta */}
      <JessCharacter
        pose="intro"
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 440 : 480}
        animate
      />
    </AbsoluteFill>
  );
};
