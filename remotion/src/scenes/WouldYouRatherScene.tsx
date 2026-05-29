// REV 001/29MAY26 - Would You Rather sahne component'i
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
import { BRAND, FONTS, FIXED_FRAMES, FPS, ThemeColor } from "../styles/theme";
import { WouldYouRatherQuestion, JessPoses } from "../types/schemas";
import { JessCharacter } from "../components/JessCharacter";
import { QuizHeader } from "../components/QuizHeader";
import { LiquidProgressBar } from "../components/LiquidProgressBar";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { AnimatedBackground, getPatternForQuestion } from "../components/AnimatedBackground";
import { HighlightedText } from "../components/HighlightedText";
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

  // === TRANSITION (same as QuestionScene) ===
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

  // === COUNTDOWN PROGRESS ===
  const countdownProgress = inCountdown
    ? 1 - Math.min(1, (frame - phases.countdown) / WYR_COUNTDOWN_FRAMES)
    : isRevealed ? 0 : 1;

  // === REVEAL ANIMATION ===
  const revealProgress = isRevealed
    ? spring({ frame: frame - phases.reveal, fps: FPS, config: { damping: 12, stiffness: 200, mass: 0.8 } })
    : 0;
  const mysteryOpacity = isRevealed
    ? interpolate(frame - phases.reveal, [0, 8], [1, 0], { extrapolateRight: "clamp" })
    : 1;
  const surpriseOpacity = isRevealed
    ? interpolate(frame - phases.reveal, [4, 12], [0, 1], { extrapolateRight: "clamp" })
    : 0;
  const surpriseScale = 0.7 + 0.3 * revealProgress;

  // Jess pose
  let currentJessPose: keyof JessPoses = "question";
  if (inCountdown || inSilentPause) currentJessPose = "thinking";
  if (isRevealed) currentJessPose = question.surprise_option.surprise_is_good ? "correct" : "thinking";

  const pattern = getPatternForQuestion(questionNumber - 1);

  // Layout
  const padding = isVertical ? 30 : 50;
  const headerH = isVertical ? 80 : 100;
  const questionTextH = isVertical ? 120 : 140;
  const bodyTop = headerH + questionTextH + 12;
  const bodyBottom = isVertical ? 180 : 220;
  const cardAreaH = height - bodyTop - bodyBottom;
  const cardGap = isVertical ? 16 : 24;

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

      {/* HEADER */}
      <QuizHeader
        questionNumber={questionNumber}
        questionText={question.question_text || "Hangisini tercih edersin?"}
        showFrame={phases.show}
        isVertical={isVertical}
        theme={theme}
        isFactMode={false}
      />

      {/* QUESTION TEXT */}
      <div style={{
        position: "absolute",
        top: headerH,
        left: padding,
        right: padding,
        height: questionTextH,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}>
        <div style={{
          background: "rgba(0,0,0,0.45)",
          borderRadius: 16,
          padding: isVertical ? "10px 18px" : "12px 24px",
          textAlign: "center",
          maxWidth: "90%",
        }}>
          <HighlightedText
            text={question.question_text || "Hangisini tercih edersin?"}
            style={{
              fontFamily: FONTS.display,
              fontSize: isVertical ? 28 : 36,
              color: "#FFFFFF",
              fontWeight: 900,
              lineHeight: 1.2,
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      </div>

      {/* TWO CARDS */}
      <div style={{
        position: "absolute",
        top: bodyTop,
        left: padding,
        width: width - padding * 2,
        height: cardAreaH,
        display: "flex",
        gap: cardGap,
        zIndex: 10,
      }}>
        {/* VISIBLE CARD */}
        <div style={{
          flex: 1,
          background: "rgba(0,0,0,0.5)",
          borderRadius: 20,
          border: `3px solid ${theme.accent}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: `0 4px 24px rgba(0,0,0,0.4)`,
        }}>
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {visibleImageSrc && (
              <Img
                src={visibleImageSrc}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </div>
          <div style={{
            padding: isVertical ? "8px 12px" : "10px 14px",
            background: theme.accent,
            textAlign: "center",
          }}>
            <span style={{
              fontFamily: FONTS.display,
              fontSize: isVertical ? 18 : 22,
              color: "#fff",
              fontWeight: 800,
              textShadow: "0 1px 4px rgba(0,0,0,0.5)",
            }}>
              {question.visible_option.label}
            </span>
          </div>
        </div>

        {/* SURPRISE CARD */}
        <div style={{
          flex: 1,
          background: isRevealed
            ? (question.surprise_option.surprise_is_good ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)")
            : "rgba(0,0,0,0.5)",
          borderRadius: 20,
          border: `3px solid ${isRevealed
            ? (question.surprise_option.surprise_is_good ? BRAND.correctGreen : "#EF4444")
            : "#6B7280"}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: isRevealed ? `0 4px 32px rgba(0,0,0,0.5)` : `0 4px 16px rgba(0,0,0,0.3)`,
          transform: `scale(${surpriseScale})`,
        }}>
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {/* Mystery face */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              opacity: mysteryOpacity,
              background: "linear-gradient(135deg, #1f2937 0%, #374151 100%)",
            }}>
              <span style={{ fontSize: isVertical ? 56 : 72, lineHeight: 1 }}>🎁</span>
              <span style={{
                fontFamily: FONTS.display,
                fontSize: isVertical ? 22 : 28,
                color: "#9CA3AF",
                fontWeight: 700,
                marginTop: 8,
              }}>?</span>
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
          <div style={{
            padding: isVertical ? "8px 12px" : "10px 14px",
            background: isRevealed
              ? (question.surprise_option.surprise_is_good ? BRAND.correctGreen : "#EF4444")
              : "#374151",
            textAlign: "center",
          }}>
            <span style={{
              fontFamily: FONTS.display,
              fontSize: isVertical ? 18 : 22,
              color: "#fff",
              fontWeight: 800,
              textShadow: "0 1px 4px rgba(0,0,0,0.5)",
              opacity: isRevealed ? surpriseOpacity : 1,
            }}>
              {isRevealed ? question.surprise_option.surprise_outcome : question.surprise_option.label}
            </span>
          </div>
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
