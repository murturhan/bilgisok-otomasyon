// REV 005/30MAY26 - surpriseBoxSrc prop: Drive'dan random kutu görseli (yoksa 🎁 fallback)
import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Audio,
  staticFile,
  Sequence,
  Img,
} from "remotion";
import { BRAND, FONTS, FIXED_FRAMES, FPS, ThemeColor, highlightPalette } from "../styles/theme";
import { WouldYouRatherQuestion, JessPoses } from "../types/schemas";
import { JessCharacter } from "../components/JessCharacter";
import { QuizHeader } from "../components/QuizHeader";
import { LiquidProgressBar } from "../components/LiquidProgressBar";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { AnimatedBackground, getPatternForQuestion } from "../components/AnimatedBackground";
import { computeWyrPhases, WYR_COUNTDOWN_FRAMES } from "../utils/timing";

interface WouldYouRatherSceneProps {
  question: WouldYouRatherQuestion;
  visibleImageSrc: string;
  surpriseImageSrc: string;
  questionNumber: number;
  totalQuestions: number;
  theme: ThemeColor;
  jessPoses: JessPoses;
  channelName: string;
  sfx_tick?: string;
  sfx_drum?: string;
  sfx_correct?: string;
  sfx_whoosh?: string;
  sfx_pop_single?: string;
  sfx_pop_double?: string;
  sfx_progress?: string;
  surpriseBoxSrc?: string;
}

export const WouldYouRatherScene: React.FC<WouldYouRatherSceneProps> = ({
  question,
  visibleImageSrc,
  surpriseImageSrc,
  questionNumber,
  totalQuestions,
  theme,
  jessPoses,
  channelName,
  sfx_tick,
  sfx_drum,
  sfx_correct,
  sfx_whoosh,
  sfx_pop_single,
  sfx_pop_double,
  sfx_progress,
  surpriseBoxSrc,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isVertical = height > width;

  const phases = computeWyrPhases(question);

  const inShow = frame < phases.countdown;
  const inCountdown = frame >= phases.countdown && frame < phases.timerEnd;
  const inSilentPause = frame >= phases.timerEnd && frame < phases.reveal;
  const isRevealed = frame >= phases.reveal;
  const inReaction = frame >= phases.reaction;
  const inTransition = frame >= phases.transition;

  // Fuse: 0→1 during countdown
  const fusePhase = inCountdown
    ? Math.min(1, (frame - phases.countdown) / WYR_COUNTDOWN_FRAMES)
    : frame >= phases.timerEnd ? 1 : 0;

  // Burst: 35 frames after reveal
  const burstActive = frame >= phases.reveal && frame < phases.reveal + 35;
  const burstLocalFrame = burstActive ? frame - phases.reveal : 0;

  // === TRANSITION ===
  const transitionLocalFrame = frame - phases.transition;
  const TR_LEN = FIXED_FRAMES.transition;
  const flashOpacity = inTransition
    ? interpolate(transitionLocalFrame, [0, 5, TR_LEN], [0, 0.95, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
    : 0;
  const slideOutX = inTransition
    ? interpolate(transitionLocalFrame, [0, TR_LEN], [0, -120], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
    : 0;
  const sceneScale = inTransition
    ? interpolate(transitionLocalFrame, [0, TR_LEN], [1, 0.92], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
    : 1;
  const sceneBlur = inTransition
    ? interpolate(transitionLocalFrame, [0, TR_LEN], [0, 10], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
    : 0;
  const fadeOut = inTransition
    ? interpolate(frame - phases.transition, [0, TR_LEN * 0.5, TR_LEN], [1, 0.7, 0], { extrapolateRight: "clamp" })
    : 1;

  // === ENTER ===
  const ENTER_LEN = 8;
  const isEntering = frame < ENTER_LEN;
  const enterSlideX = isEntering
    ? interpolate(frame, [0, ENTER_LEN], [120, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
    : 0;
  const enterOpacity = isEntering
    ? interpolate(frame, [0, ENTER_LEN], [0, 1], { extrapolateRight: "clamp" })
    : 1;

  // === REVEAL ===
  const mysteryOpacity = isRevealed
    ? interpolate(frame - phases.reveal, [0, 8], [1, 0], { extrapolateRight: "clamp" })
    : 1;
  const surpriseOpacity = isRevealed
    ? interpolate(frame - phases.reveal, [4, 12], [0, 1], { extrapolateRight: "clamp" })
    : 0;

  // Jess pose
  let currentJessPose: keyof JessPoses = "question";
  if (inCountdown || inSilentPause) currentJessPose = "thinking";
  if (isRevealed) currentJessPose = question.surprise_option.surprise_is_good ? "correct" : "thinking";

  const pattern = getPatternForQuestion(questionNumber - 1);

  // Frame border colors from highlightPalette (2 different for visible/surprise)
  const visibleBorderColor = highlightPalette[(questionNumber - 1) % highlightPalette.length];
  const surpriseBorderColor = highlightPalette[questionNumber % highlightPalette.length];

  // Layout
  const padding = isVertical ? 30 : 50;
  const quizHeaderH = isVertical ? 267 : 293;
  const bodyTop = quizHeaderH + (isVertical ? 24 : 40);
  const bodyBottom = isVertical ? 180 : 220;
  const cardAreaH = height - bodyTop - bodyBottom;
  const cardGap = isVertical ? 20 : 24;

  // Card dimensions differ for vertical (stacked) vs horizontal (side by side)
  const cardW = isVertical
    ? (width - padding * 2)
    : Math.floor((width - padding * 2 - cardGap) / 2);
  const cardH = isVertical
    ? Math.floor((cardAreaH - cardGap) / 2)
    : cardAreaH;

  // Gift box fills ~80% of card height
  const giftBoxSize = Math.floor(cardH * 0.8);

  // Dynamic label font — shrinks for long text to prevent overflow
  const labelFontBase = isVertical ? 52 : 80;
  const labelFont = (label: string) => {
    const len = (label || "").length;
    if (len <= 10) return labelFontBase;
    if (len <= 18) return Math.floor(labelFontBase * 0.75);
    return Math.floor(labelFontBase * 0.6);
  };

  const showProgressBar = inCountdown || inSilentPause;

  return (
    <AbsoluteFill style={{
      opacity: fadeOut * enterOpacity,
      transform: `translateX(${slideOutX + enterSlideX}%) scale(${sceneScale})`,
      filter: sceneBlur > 0 ? `blur(${sceneBlur}px)` : undefined,
    }}>
      <AnimatedBackground theme={theme} pattern={pattern} motionSpeed={1} />

      {/* AUDIO */}
      {question.question_audio_path && (
        <Sequence from={phases.show} durationInFrames={phases.countdown - phases.show}>
          <Audio src={staticFile(question.question_audio_path)} volume={2.4} />
        </Sequence>
      )}
      {question.reveal_audio_path && (
        <Sequence from={phases.reaction} durationInFrames={phases.transition - phases.reaction}>
          <Audio src={staticFile(question.reveal_audio_path)} volume={2.4} />
        </Sequence>
      )}
      {sfx_pop_double && isRevealed && (
        <Sequence from={phases.reveal} durationInFrames={30}>
          <Audio src={staticFile(sfx_pop_double)} volume={0.8} />
        </Sequence>
      )}
      {sfx_progress && showProgressBar && (
        <Sequence from={phases.countdown} durationInFrames={WYR_COUNTDOWN_FRAMES}>
          <Audio src={staticFile(sfx_progress)} volume={0.4} />
        </Sequence>
      )}
      {sfx_drum && inSilentPause && (
        <Sequence from={phases.timerEnd} durationInFrames={Math.floor(FPS * 0.8)}>
          <Audio src={staticFile(sfx_drum)} volume={0.8} />
        </Sequence>
      )}

      {/* HEADER - "Pick One!" sabit */}
      <QuizHeader
        questionNumber={questionNumber}
        questionText="Pick One!"
        showFrame={phases.show}
        isVertical={isVertical}
        theme={theme}
        isFactMode={false}
      />

      {/* TWO CARDS - shorts: alt alta (column), long: yan yana (row) */}
      <div style={{
        position: "absolute",
        top: bodyTop,
        left: padding,
        width: width - padding * 2,
        height: cardAreaH,
        display: "flex",
        flexDirection: isVertical ? "column" : "row",
        gap: cardGap,
        zIndex: 10,
      }}>
        {/* VISIBLE CARD - her zaman net, blur yok */}
        <div style={{
          flex: 1,
          background: "rgba(0,0,0,0.5)",
          borderRadius: 20,
          border: `8px solid ${visibleBorderColor}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 3px rgba(0,0,0,0.2)`,
        }}>
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {visibleImageSrc && (
              <Img
                src={visibleImageSrc}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "none",  // her zaman net, asla blur yok
                }}
              />
            )}
          </div>
          <div style={{
            padding: isVertical ? "10px 14px" : "12px 18px",
            background: theme.accent,
            textAlign: "center",
            flexShrink: 0,
            overflow: "hidden",
          }}>
            <span style={{
              fontFamily: FONTS.display,
              fontSize: labelFont(question.visible_option.label),
              color: "#fff",
              fontWeight: 900,
              textTransform: "uppercase",
              textShadow: "0 2px 6px rgba(0,0,0,0.5)",
              lineHeight: 1.1,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {question.visible_option.label}
            </span>
          </div>
        </div>

        {/* SURPRISE CARD - no overflow:hidden on outer for fuse+confetti */}
        <div style={{
          flex: 1,
          background: isRevealed
            ? (question.surprise_option.surprise_is_good ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)")
            : "rgba(0,0,0,0.5)",
          borderRadius: 20,
          border: `8px solid ${isRevealed
            ? (question.surprise_option.surprise_is_good ? BRAND.correctGreen : "#EF4444")
            : surpriseBorderColor}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: isRevealed ? `0 4px 32px rgba(0,0,0,0.5)` : `0 4px 16px rgba(0,0,0,0.3), 0 0 0 3px rgba(0,0,0,0.2)`,
          position: "relative",
        }}>
          {/* image area - overflow hidden for clip */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative", borderRadius: "12px 12px 0 0" }}>
            {/* Mystery face - kutu görseli varsa Img, yoksa 🎁 emoji */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex",
              alignItems: "center", justifyContent: "center",
              opacity: mysteryOpacity,
              background: "linear-gradient(135deg, #1f2937 0%, #374151 100%)",
            }}>
              {surpriseBoxSrc ? (
                <Img
                  src={surpriseBoxSrc}
                  style={{
                    width: giftBoxSize,
                    height: giftBoxSize,
                    objectFit: "contain",
                    filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))",
                  }}
                />
              ) : (
                <span style={{
                  fontSize: giftBoxSize,
                  lineHeight: 1,
                  filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))",
                }}>🎁</span>
              )}
            </div>
            {/* Revealed face */}
            {surpriseImageSrc && (
              <div style={{ position: "absolute", inset: 0, opacity: surpriseOpacity }}>
                <Img
                  src={surpriseImageSrc}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            )}
          </div>

          {/* Label */}
          <div style={{
            padding: isVertical ? "10px 14px" : "12px 18px",
            background: isRevealed
              ? (question.surprise_option.surprise_is_good ? BRAND.correctGreen : "#EF4444")
              : "#374151",
            textAlign: "center",
            borderRadius: "0 0 12px 12px",
            flexShrink: 0,
            overflow: "hidden",
          }}>
            <span style={{
              fontFamily: FONTS.display,
              fontSize: labelFont(isRevealed ? question.surprise_option.surprise_outcome : question.surprise_option.label),
              color: "#fff",
              fontWeight: 900,
              textTransform: "uppercase",
              textShadow: "0 2px 6px rgba(0,0,0,0.5)",
              opacity: isRevealed ? surpriseOpacity : 1,
              lineHeight: 1.1,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {isRevealed ? question.surprise_option.surprise_outcome : question.surprise_option.label}
            </span>
          </div>

          {/* FUSE SVG - countdown boyunca kart etrafında */}
          {fusePhase > 0 && fusePhase < 1 && (() => {
            const perim = 2 * (cardW + cardH);
            const offset = perim * (1 - fusePhase);
            return (
              <svg
                style={{
                  position: "absolute",
                  top: -7, left: -7,
                  pointerEvents: "none",
                  zIndex: 3,
                  overflow: "visible",
                }}
                width={cardW + 14}
                height={cardH + 14}
              >
                <rect x={3} y={3} width={cardW} height={cardH} rx={17}
                  fill="none" stroke="#1a0500" strokeWidth={6}
                  strokeDasharray={perim} strokeDashoffset={offset} strokeLinecap="round" />
                <rect x={3} y={3} width={cardW} height={cardH} rx={17}
                  fill="none" stroke="#FFD700" strokeWidth={8}
                  strokeDasharray={`12 ${perim - 12}`} strokeDashoffset={offset} strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 8px #FF6B00) drop-shadow(0 0 16px #FFD700)" }} />
              </svg>
            );
          })()}

          {/* CONFETTI BURST - reveal anında */}
          {burstActive && (
            <div style={{
              position: "absolute",
              top: "50%", left: "50%",
              width: 0, height: 0,
              pointerEvents: "none",
              zIndex: 10,
            }}>
              {Array.from({ length: 24 }, (_, i) => {
                const angle = (i / 24) * Math.PI * 2;
                const dist = 60 + Math.min(burstLocalFrame * 8, 400);
                const fade = Math.max(0, 1 - burstLocalFrame / 35);
                const rot = burstLocalFrame * 12 + i * 30;
                const sz = 40 + (i % 3) * 12;
                return (
                  <div key={i} style={{
                    position: "absolute",
                    left: 0, top: 0,
                    fontSize: sz, lineHeight: 1,
                    transform: `translate(${Math.cos(angle) * dist - sz / 2}px, ${Math.sin(angle) * dist - burstLocalFrame * 2 - sz / 2}px) rotate(${rot}deg)`,
                    opacity: fade,
                    filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
                  }}>
                    {["🎊", "⭐", "✨", "💫", "🎉"][i % 5]}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PROGRESS BAR */}
      {showProgressBar && (
        <div style={{
          position: "absolute",
          bottom: bodyBottom - (isVertical ? 80 : 100),
          left: padding,
          right: isVertical ? padding : padding + 160,
          zIndex: 20,
        }}>
          <LiquidProgressBar
            startFrame={phases.countdown}
            durationFrames={WYR_COUNTDOWN_FRAMES}
            height={60}
          />
        </div>
      )}

      {/* JESS */}
      <JessCharacter
        pose={currentJessPose}
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 230 : 280}
        animate
      />

      {/* BRAND TAG */}
      <VerticalBrandTag
        side="right"
        topOffset={isVertical ? 170 : 200}
        bottomOffset={isVertical ? 250 : 200}
        fontSize={isVertical ? 28 : 32}
      />

      {/* TRANSITION FLASH */}
      {flashOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
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
