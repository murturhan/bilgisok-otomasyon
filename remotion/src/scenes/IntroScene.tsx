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
  jessVideoDurationFrames: number;
}

function getTopicEmojis(topic: string): string[] {
  const t = topic.toLowerCase();
  
  // Buildings / Landmarks / Architecture
  if (/build|architect|monument|landmark|tower|castle|temple|palace|wonder/i.test(t))
    return ["🏰", "🗼", "🏛️", "🗽", "🕌", "⛩️"];
  if (/invent|technolog|machine|gadget|computer|phone/i.test(t))
    return ["📞", "💡", "✈️", "📷", "🎬", "🚗"];
  if (/animal|wild|pet|fox|dog|cat|jungle|safari|home/i.test(t))
    return ["🦁", "🐘", "🦒", "🐯", "🐧", "🐵"];
  if (/fruit/i.test(t))
    return ["🍎", "🍌", "🍇", "🍓", "🍑", "🍉"];
  if (/food|drink|cook|cuisine|snack|dish/i.test(t))
    return ["🍕", "🍔", "🌮", "🍦", "🍩", "🥕"];
  if (/countr|geograph|flag|world|capital|city|culture/i.test(t))
    return ["🗺️", "🌍", "🗽", "🏔️", "🏛️", "🚩"];
  if (/space|planet|astronaut|star|galaxy|moon|sun/i.test(t))
    return ["🚀", "🌙", "⭐", "🪐", "👽", "☄️"];
  if (/plant|flower|tree|forest|nature|garden/i.test(t))
    return ["🌳", "🌸", "🌻", "🍄", "🌵", "🌿"];
  if (/sport|game|ball|olympic/i.test(t))
    return ["⚽", "🏀", "🎾", "🏈", "⛹️", "🏆"];
  if (/vehicl|car|truck|transport|plane|train|ship/i.test(t))
    return ["🚗", "✈️", "🚂", "🚢", "🚁", "🚀"];
  if (/scien|physic|chem|biolog|experiment|cross.section/i.test(t))
    return ["🧪", "🔬", "🧬", "⚗️", "🧲", "🔭"];
  if (/music|instrument|song|sound/i.test(t))
    return ["🎵", "🎸", "🎹", "🥁", "🎤", "🎺"];
  if (/object|item|everyday|things/i.test(t))
    return ["🔑", "📱", "⌚", "🎒", "✏️", "📦"];
  if (/dinosaur|prehistor|fossil/i.test(t))
    return ["🦖", "🦕", "🦴", "🌋", "🥚", "🦎"];
  if (/ocean|sea|fish|marine|underwater/i.test(t))
    return ["🐠", "🐳", "🦈", "🐙", "🦀", "🌊"];
  if (/insect|bug/i.test(t))
    return ["🐛", "🦋", "🐝", "🐞", "🕷️", "🐜"];
  
  return ["📚", "💡", "🎨", "🔍", "🌟", "🎯"];
}

/** 3D çıkıntılı topic font için text-shadow stack üretir (font boyutuna dinamik) */
function buildTopic3DShadow(fontSize: number): string {
  const s = Math.max(2, Math.floor(fontSize / 28));
  const o = Math.max(2, Math.floor(fontSize / 50));
  const layers = [
    `-${o}px -${o}px 0 ${BRAND.black}`,
    `${o}px -${o}px 0 ${BRAND.black}`,
    `-${o}px ${o}px 0 ${BRAND.black}`,
    `${o}px ${o}px 0 ${BRAND.black}`,
  ];
  // Siyah çıkıntı 8 katman
  for (let i = 1; i <= 8; i++) {
    const d = i * s;
    layers.push(`${d}px ${d}px 0 ${BRAND.black}`);
  }
  // Pembe alt gölge 4 katman
  for (let i = 9; i <= 12; i++) {
    const d = i * s;
    layers.push(`${d}px ${d}px 0 #B91C7A`);
  }
  // Yumuşak drop shadow
  const finalD = 13 * s;
  layers.push(`${finalD}px ${finalD}px ${s * 4}px rgba(0,0,0,0.55)`);
  return layers.join(", ");
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
  jessVideoDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isVertical = height > width;
  
  const theme = THEME_COLORS[0]; // pink
  
  // Sahne 1 = Jess video süresi + 0.3s buffer
  // Bu sürede greeting konuşması bitsin, sonra Sahne 2'ye geçilir
  const scene1End = Math.min(
    jessVideoDurationFrames + Math.floor(FPS * 0.3),
    durationFrames - Math.floor(FPS * 3)  // Sahne 2 için en az 3s yer kalsın
  );
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
// Sabit Jess konuşma metinleri (Hedra video TTS ile aynı)
const SHORTS_GREETING_TEXT = "Hey, curious minds! Jess the Fox here… are you ready?";
const LONG_GREETING_TEXT = "Hey curious minds! I'm Jess the Fox, and welcome to Geni-Mini Tests! Ready for today's fun challenge?";

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
  
  // Greeting altyazı balonu - logo'dan sonra spring ile gelir
  const greetingAnim = spring({
    frame: frame - 18,
    fps,
    config: { damping: 13, stiffness: 100 },
  });
  const greetingScale = interpolate(greetingAnim, [0, 1], [0, 1]);
  const greetingOpacity = interpolate(greetingAnim, [0, 0.5], [0, 1]);
  const greetingFloat = Math.sin(frame * 0.08) * 5;
  const greetingTilt = Math.sin(frame * 0.1) * 1.5; // hafif sağa-sola sallanma
  
  // Boyutlar
  const logoWidth = isVertical ? 900 : 800;
  const jessVideoSize = isVertical ? 900 : 720;
  const greetingText = isVertical ? SHORTS_GREETING_TEXT : LONG_GREETING_TEXT;
  const greetingFontSize = isVertical ? 44 : 50;
  const greetingMaxWidth = isVertical ? "85%" : "65%";
  
  return (
    <>
      {/* LOGO + GREETING - üstte */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "5%" : "7%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isVertical ? 32 : 36,
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
        
        {/* GREETING BALONU - Jess'in konuşması altyazı */}
        <div
          style={{
            opacity: greetingOpacity,
            transform: `scale(${greetingScale}) translateY(${greetingFloat}px) rotate(${greetingTilt}deg)`,
            backgroundColor: BRAND.white,
            color: BRAND.black,
            padding: isVertical ? "20px 36px" : "24px 44px",
            borderRadius: 36,
            fontSize: greetingFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            border: `5px solid ${BRAND.yellow}`,
            boxShadow: `0 10px 25px rgba(0,0,0,0.45), 0 0 40px ${BRAND.yellow}`,
            maxWidth: greetingMaxWidth,
            textAlign: "center",
            letterSpacing: 0.5,
            lineHeight: 1.2,
            textTransform: "uppercase",
          }}
        >
          {greetingText}
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
}> = ({ topic, startFrame, isVertical, width, height }) => {
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
  // Idle hareket - hafif salınım + yukarı/aşağı float (emojiler gibi)
  const topicWobble = Math.sin(localFrame * 0.07) * 1.8;  // -1.8 → +1.8 derece
  const topicFloat = Math.cos(localFrame * 0.09) * 12;    // -12 → +12 px
  
  const emojiAnim = spring({
    frame: localFrame - 18,
    fps,
    config: { damping: 11, stiffness: 100 },
  });
  const emojiOpacity = interpolate(emojiAnim, [0, 1], [0, 1]);
  const emojiY = interpolate(emojiAnim, [0, 1], [80, 0]);
  
  // Dinamik font - topic uzunluğuna göre 2.5x büyütülmüş, binary search ile fit
  const topicLen = topicUpper.length;
  
  // Hedef max font (önceki değerlerin 2.5x'i)
  let maxTargetFont: number;
  if (isVertical) {
    if (topicLen < 18) maxTargetFont = 325;
    else if (topicLen < 30) maxTargetFont = 250;
    else if (topicLen < 45) maxTargetFont = 195;
    else maxTargetFont = 150;
  } else {
    if (topicLen < 18) maxTargetFont = 375;
    else if (topicLen < 30) maxTargetFont = 300;
    else if (topicLen < 45) maxTargetFont = 225;
    else maxTargetFont = 180;
  }
  
  // Binary search: kutuya sığacak en büyük font
  // Topic kutusu inner alan: maxWidth ekran %94, padding kutuda 56*2 / 80*2
  const titleInnerWidth = isVertical
    ? Math.floor(width * 0.94) - 112  // 56*2 padding
    : Math.floor(width * 0.94) - 160; // 80*2 padding
  const titleInnerHeight = Math.floor(height * 0.55); // ekran ortasında bol yer
  
  const fitTopicFont = (() => {
    const words = topicUpper.split(/\s+/).filter(Boolean);
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
  
  // 3D ÇIKINTI gölge stack — font boyutuna göre dinamik derinlik
  const topicTextShadow = buildTopic3DShadow(topicFontSize);
  
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
      
      {/* TOPIC - 3D çıkıntılı font, kutu yok, canlı hareket */}
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
            transform: `scale(${topicScale * topicPulse}) rotate(${topicRotate + topicWobble}deg) translateY(${topicFloat}px)`,
            opacity: topicOpacity,
            fontSize: topicFontSize,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.yellow,
            textShadow: topicTextShadow,
            maxWidth: "94%",
            textAlign: "center",
            letterSpacing: 2,
            textTransform: "uppercase",
            lineHeight: 1.05,
          }}
        >
          {topicUpper}
        </div>
      </div>
      
      {/* EMOJI BANDI - yukarı çekildi (8% → 18%) */}
      <div
        style={{
          position: "absolute",
          bottom: isVertical ? "18%" : "20%",
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
