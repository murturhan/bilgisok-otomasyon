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
import { LightningBolt } from "../components/QuizHeader";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { JessPoses } from "../types/schemas";

interface IntroSceneProps {
  channelName: string;
  topic: string;
  jessPoses: JessPoses;
  durationFrames: number;
}

/**
 * Topic'e göre sallanan emoji ikonları seç (Quiz Blitz tarzı).
 * Eşleşme bulamazsa default mix kullan.
 */
function getTopicEmojis(topic: string): string[] {
  const t = topic.toLowerCase();
  
  // İcat / teknoloji
  if (/invent|technolog|machine|gadget|computer|phone|comput/i.test(t))
    return ["📞", "💡", "✈️", "📷", "🎬", "🚗"];
  
  // Hayvan
  if (/animal|wild|pet|fox|dog|cat|jungle|safari/i.test(t))
    return ["🦁", "🐘", "🦒", "🐯", "🐧", "🐵"];
  
  // Yiyecek
  if (/food|fruit|drink|cook|cuisine|snack/i.test(t))
    return ["🍕", "🍔", "🍎", "🍦", "🍩", "🥕"];
  
  // Coğrafya / ülke
  if (/countr|geograph|flag|world|capital|landmark|city/i.test(t))
    return ["🗺️", "🌍", "🗽", "🏔️", "🏛️", "🚩"];
  
  // Uzay
  if (/space|planet|astronaut|star|galaxy|moon|sun/i.test(t))
    return ["🚀", "🌙", "⭐", "🪐", "👽", "☄️"];
  
  // Doğa / bitkiler
  if (/plant|flower|tree|forest|nature|garden/i.test(t))
    return ["🌳", "🌸", "🌻", "🍄", "🌵", "🌿"];
  
  // Spor
  if (/sport|game|ball|olympic/i.test(t))
    return ["⚽", "🏀", "🎾", "🏈", "⛹️", "🏆"];
  
  // Ulaşım
  if (/vehicl|car|truck|transport|plane|train|ship/i.test(t))
    return ["🚗", "✈️", "🚂", "🚢", "🚁", "🚀"];
  
  // Bilim
  if (/scien|physic|chem|biolog|experiment/i.test(t))
    return ["🧪", "🔬", "🧬", "⚗️", "🧲", "🔭"];
  
  // Müzik
  if (/music|instrument|song|sound/i.test(t))
    return ["🎵", "🎸", "🎹", "🥁", "🎤", "🎺"];
  
  // Default - genel eğitici karışım
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
  
  const theme = THEME_COLORS[0];
  const topicEmojis = getTopicEmojis(topic);
  
  // ─── ANIMASYONLAR ─────────────────────────────────
  const leftAnim = spring({ frame: frame - 0, fps, config: { damping: 11, stiffness: 130 } });
  const leftX = interpolate(leftAnim, [0, 1], [-400, 0]);
  const leftScale = interpolate(leftAnim, [0, 1], [0, 1]);
  
  const rightAnim = spring({ frame: frame - 5, fps, config: { damping: 11, stiffness: 130 } });
  const rightX = interpolate(rightAnim, [0, 1], [400, 0]);
  const rightScale = interpolate(rightAnim, [0, 1], [0, 1]);
  
  const boltAnim = spring({ frame: frame - 15, fps, config: { damping: 9, stiffness: 100 } });
  const boltScale = interpolate(boltAnim, [0, 1], [0, 1]);
  const boltRotate = interpolate(frame, [15, 30], [180, 0], { extrapolateRight: "clamp" });
  
  const taglineAnim = spring({ frame: frame - 30, fps, config: { damping: 14, stiffness: 100 } });
  const taglineOpacity = interpolate(taglineAnim, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineAnim, [0, 1], [40, 0]);
  
  const topicAnim = spring({ frame: frame - 45, fps, config: { damping: 10, stiffness: 110 } });
  const topicScale = interpolate(topicAnim, [0, 1], [0, 1]);
  const topicOpacity = interpolate(topicAnim, [0, 0.5], [0, 1]);
  
  // Emoji bandı animasyonu (60. frame'den sonra sallanmaya başla)
  const emojiBandStart = 60;
  const emojiBandAnim = spring({
    frame: frame - emojiBandStart,
    fps,
    config: { damping: 12, stiffness: 100 }
  });
  const emojiBandOpacity = interpolate(emojiBandAnim, [0, 1], [0, 1]);
  const emojiBandY = interpolate(emojiBandAnim, [0, 1], [50, 0]);
  
  // ─── BOYUTLAR ─────────────────────────────────────
  const logoFontSize = isVertical ? 160 : 200;
  const taglineFontSize = isVertical ? 54 : 60;
  const topicFontSize = isVertical ? 56 : 64;
  
  const logoIdleBounce = frame > 30 ? Math.sin(frame * 0.1) * 4 : 0;
  
  // Topic metnini UPPERCASE yap
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
      
      {/* ÜST: LOGO BLOĞU */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "8%" : "10%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
        }}
      >
        {/* GENIMINI ⚡ TESTS */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            flexWrap: isVertical ? "wrap" : "nowrap",
            transform: `translateY(${logoIdleBounce}px)`,
          }}
        >
          <div
            style={{
              fontSize: logoFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: BRAND.white,
              textShadow: `
                -6px -6px 0 ${BRAND.black},
                6px -6px 0 ${BRAND.black},
                -6px 6px 0 ${BRAND.black},
                6px 6px 0 ${BRAND.black},
                10px 10px 0 #FF1493
              `,
              letterSpacing: 4,
              transform: `translateX(${leftX}px) scale(${leftScale})`,
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            GENIMINI
          </div>
          
          <div
            style={{
              transform: `scale(${boltScale}) rotate(${boltRotate}deg)`,
            }}
          >
            <LightningBolt size={isVertical ? 140 : 170} color={BRAND.yellow} />
          </div>
          
          <div
            style={{
              fontSize: logoFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: BRAND.yellow,
              textShadow: `
                -6px -6px 0 ${BRAND.black},
                6px -6px 0 ${BRAND.black},
                -6px 6px 0 ${BRAND.black},
                6px 6px 0 ${BRAND.black},
                10px 10px 0 #FF1493
              `,
              letterSpacing: 4,
              transform: `translateX(${rightX}px) scale(${rightScale})`,
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            TESTS
          </div>
        </div>
        
        {/* Tagline */}
        <div
          style={{
            transform: `translateY(${taglineY}px)`,
            opacity: taglineOpacity,
            fontSize: taglineFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.white,
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
          🎉 FUN &amp; SMART LEARNING 🦊
        </div>
        
        {/* Today: TOPIC - büyütüldü, UPPERCASE */}
        {topic && (
          <div
            style={{
              transform: `scale(${topicScale})`,
              opacity: topicOpacity,
              backgroundColor: BRAND.white,
              color: BRAND.black,
              padding: isVertical ? "28px 50px" : "32px 70px",
              borderRadius: 60,
              fontSize: topicFontSize,
              fontFamily: FONTS.display,
              fontWeight: 900,
              border: `6px solid ${BRAND.yellow}`,
              boxShadow: `0 10px 28px rgba(0,0,0,0.5), 0 0 50px ${BRAND.yellow}`,
              maxWidth: "90%",
              textAlign: "center",
              letterSpacing: 1,
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            TODAY: {topicUpper}
          </div>
        )}
        
        {/* SALLANANDA EMOJİ BANDI - Quiz Blitz tarzı */}
        <div
          style={{
            transform: `translateY(${emojiBandY}px)`,
            opacity: emojiBandOpacity,
            display: "flex",
            gap: isVertical ? 18 : 32,
            justifyContent: "center",
            marginTop: 10,
          }}
        >
          {topicEmojis.map((emoji, i) => {
            // Her emoji farklı faz/genlik ile sallanır
            const swing = Math.sin(frame * 0.08 + i * 0.6) * 15;
            const bounce = Math.cos(frame * 0.1 + i * 0.5) * 8;
            const idleScale = 1 + Math.sin(frame * 0.12 + i) * 0.04;
            
            return (
              <div
                key={i}
                style={{
                  fontSize: isVertical ? 80 : 100,
                  transform: `translateY(${bounce}px) rotate(${swing}deg) scale(${idleScale})`,
                  filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.4))",
                  lineHeight: 1,
                }}
              >
                {emoji}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* JESS - alt orta, BÜYÜK */}
      <JessCharacter
        pose="intro"
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 460 : 500}
        animate
      />
    </AbsoluteFill>
  );
};
