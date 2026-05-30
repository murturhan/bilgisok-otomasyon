// REV 006/30MAY26 - Scene2 logo kucultuldu, baslik zIndex yukseltildi
import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  Audio,
  Video,
  staticFile,
} from "remotion";
import { BRAND, FONTS, THEME_COLORS, FPS } from "../styles/theme";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { GeniMiniLogo } from "../components/BrandAssets";
import { AnimatedTitleWords } from "../components/AnimatedTitleWords";
import { JessPoses } from "../types/schemas";
import {
  LONG_GREETING_TEXT,
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
  sfx_pop_single?: string;
  sfx_pop_double?: string;
}

/**
 * INTRO LONG - 1920x1080 yatay
 * Sahne 1: Logo+balon SOL, Jess SAĞ
 * Sahne 2: Topic 3D üst yarıda, emoji bandı altta
 */
export const IntroSceneLong: React.FC<Props> = ({
  topic,
  topicEmojis,
  durationFrames,
  jessVideoDurationFrames,
  sfx_pop_single,
  sfx_pop_double,
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
        <Scene2Long
          topic={topic}
          topicEmojis={topicEmojis}
          startFrame={scene1End}
          sfx_pop_single={sfx_pop_single}
          sfx_pop_double={sfx_pop_double}
        />
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

// ═══ SAHNE 1 ═══ Logo+balon SOL, Jess SAĞ (YATAY)
const Scene1Long: React.FC = () => {
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
      {/* SOL: Logo + Greeting balonu */}
      <div style={{
        position: "absolute", left: "4%", top: 0, bottom: 0, width: "55%",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40,
      }}>
        <div style={{
          transform: `translateY(${logoY + logoIdleBounce}px) scale(${logoScale})`,
          display: "flex", justifyContent: "center",
        }}>
          <GeniMiniLogo width={700} />
        </div>
        
        <div style={{
          opacity: greetingOpacity,
          transform: `scale(${greetingScale}) translateY(${greetingFloat}px) rotate(${greetingTilt}deg)`,
          backgroundColor: BRAND.white, color: BRAND.black,
          padding: "24px 44px", borderRadius: 36,
          fontSize: 42, fontFamily: FONTS.display, fontWeight: 900,
          border: `5px solid ${BRAND.yellow}`,
          boxShadow: `0 10px 25px rgba(0,0,0,0.45), 0 0 40px ${BRAND.yellow}`,
          maxWidth: "95%", textAlign: "center", letterSpacing: 0.5,
          lineHeight: 1.2, textTransform: "uppercase",
        }}>
          {LONG_GREETING_TEXT}
        </div>
      </div>
      
      {/* SAĞ: Jess Video */}
      <div style={{
        position: "absolute", right: "2%", bottom: 0, width: "40%",
        display: "flex", justifyContent: "center",
      }}>
        <Video
          src={staticFile("jess/intro.webm")}
          style={{ width: 600, height: 600, objectFit: "contain" }}
          volume={1}
        />
      </div>
    </>
  );
};

// ═══ SAHNE 2 ═══ Topic 3D üst, emoji band alt (YATAY)
const Scene2Long: React.FC<{ topic: string; topicEmojis?: string[]; startFrame: number; sfx_pop_single?: string; sfx_pop_double?: string }> = ({ topic, topicEmojis: topicEmojisProp, startFrame, sfx_pop_single, sfx_pop_double }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const localFrame = frame - startFrame;

  const topicEmojis = topicEmojisProp && topicEmojisProp.length > 0 ? topicEmojisProp : getTopicEmojis(topic);
  const topicUpper = (topic || "").toUpperCase().replace(/\*\*/g, "");

  const smallLogoAnim = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 110 } });
  const smallLogoX = interpolate(smallLogoAnim, [0, 1], [-200, 0]);
  const smallLogoOpacity = interpolate(smallLogoAnim, [0, 0.5], [0, 1]);
  
  // Blok animasyonu kaldırıldı — per-word spring AnimatedTitleWords'de
  const topicPulse = 1 + Math.sin(localFrame * 0.1) * 0.025;
  const topicWobble = Math.sin(localFrame * 0.07) * 1.8;
  const topicFloat = Math.cos(localFrame * 0.09) * 12;
  
  // Emoji giriş zamanlaması: başlık animasyonu bittikten sonra
  const titleWords = topicUpper.split(/\s+/).filter(Boolean);
  const titleEndLocalFrame = Math.max(0, titleWords.length - 2) * 12 + 25;
  const EMOJI_STAGGER = 12;
  const emojisToShow = topicEmojis.slice(0, 5);
  const emojiCount = emojisToShow.length;
  const emojiSingleCount = Math.max(0, emojiCount - 2);

  // Font: long için daha küçük max (yükseklik kısıtlı)
  const topicForFit = topicUpper;
  const topicLen = topicForFit.length;
  let maxTargetFont: number;
  if (topicLen < 18) maxTargetFont = 220;
  else if (topicLen < 30) maxTargetFont = 170;
  else if (topicLen < 45) maxTargetFont = 130;
  else maxTargetFont = 100;
  
  const titleInnerWidth = Math.floor(width * 0.80) - 80;
  const titleInnerHeight = Math.floor(height * 0.50); // ekran yarısı (emoji bandı altta yer alabilsin)
  
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
  const smallLogoWidth = width * 0.14;

  return (
    <>
      <div style={{
        position: "absolute", top: 40, left: 60,
        transform: `translateX(${smallLogoX}px)`,
        opacity: smallLogoOpacity, zIndex: 2,
      }}>
        <GeniMiniLogo width={smallLogoWidth} />
      </div>

      {/* TOPIC üst yarıda */}
      <div style={{
        position: "absolute", top: "8%", left: 0, right: 0, bottom: "40%",
        display: "flex", alignItems: "center", justifyContent: "center",
        paddingLeft: 40, paddingRight: 40, zIndex: 10,
      }}>
        <div style={{
          transform: `scale(${topicPulse}) rotate(${topicWobble}deg) translateY(${topicFloat}px)`,
          fontSize: topicFontSize, fontFamily: FONTS.display, fontWeight: 900,
          textShadow: topicTextShadow,
          maxWidth: "94%", textAlign: "center", letterSpacing: 2,
          textTransform: "uppercase", lineHeight: 1.05,
        }}>
          <AnimatedTitleWords
            text={topicUpper}
            localFrame={localFrame}
            absoluteStartFrame={startFrame}
            sfx_pop_single={sfx_pop_single}
            sfx_pop_double={sfx_pop_double}
          />
        </div>
      </div>
      
      {/* EMOJI bandı altta — her emoji kendi spring ile giriyor */}
      <div style={{
        position: "absolute", bottom: "12%", left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 50,
      }}>
        {emojisToShow.map((emoji, i) => {
          const enterOffset = (i < emojiSingleCount ? i : emojiSingleCount) * EMOJI_STAGGER;
          const emojiAnim = spring({
            frame: localFrame - (titleEndLocalFrame + enterOffset),
            fps,
            config: { damping: 10, stiffness: 130 },
          });
          const entryScale = interpolate(emojiAnim, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const entryOpacity = interpolate(emojiAnim, [0, 0.4, 1], [0, 1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const swing = Math.sin(localFrame * 0.1 + i * 0.7) * 18;
          const bounce = Math.cos(localFrame * 0.12 + i * 0.5) * 14;
          const idleScale = 1 + Math.sin(localFrame * 0.13 + i) * 0.06;

          return (
            <div key={i} style={{
              fontSize: 200,
              opacity: entryOpacity,
              transform: `scale(${entryScale * idleScale}) translateY(${bounce}px) rotate(${swing}deg)`,
              filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.5))",
              lineHeight: 1,
            }}>
              {emoji}
            </div>
          );
        })}
      </div>

      {/* Emoji pop SFX — ilk (emojiSingleCount) emoji tek tek pop_single */}
      {Array.from({ length: emojiSingleCount }).map((_, i) =>
        sfx_pop_single ? (
          <Sequence key={`epop-s-${i}`} from={startFrame + titleEndLocalFrame + i * EMOJI_STAGGER} durationInFrames={20}>
            <Audio src={staticFile(sfx_pop_single)} volume={0.5} />
          </Sequence>
        ) : null
      )}
      {/* Son 2 emoji birlikte — pop_double */}
      {emojiCount >= 2 && sfx_pop_double && (
        <Sequence from={startFrame + titleEndLocalFrame + emojiSingleCount * EMOJI_STAGGER} durationInFrames={20}>
          <Audio src={staticFile(sfx_pop_double)} volume={0.5} />
        </Sequence>
      )}
      {/* emojiCount=1 ise sadece pop_single */}
      {emojiCount === 1 && sfx_pop_single && (
        <Sequence from={startFrame + titleEndLocalFrame} durationInFrames={20}>
          <Audio src={staticFile(sfx_pop_single)} volume={0.5} />
        </Sequence>
      )}
    </>
  );
};
