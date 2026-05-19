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
import { Question, JessPoses } from "../types/schemas";
import { JessCharacter } from "../components/JessCharacter";
import { QuizHeader, LightningBolt } from "../components/QuizHeader";
import { AnswerCard, AnswerState } from "../components/AnswerCard";
import { LiquidProgressBar } from "../components/LiquidProgressBar";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { AnimatedBackground, getPatternForQuestion } from "../components/AnimatedBackground";
import { computeQuestionPhases } from "../utils/timing";

interface QuestionSceneProps {
  question: Question;
  imageSrc: string;
  /**
   * Reveal anında gösterilecek görsel (bayrak için).
   * Yoksa imageSrc kalır.
   */
  revealImageSrc?: string;
  funFactImageSrc?: string;
  questionNumber: number;
  totalQuestions: number;
  /**
   * Bu sorunun tema rengi (KidsQuizComposition tarafından geçilir)
   */
  theme: ThemeColor;
  jessPoses: JessPoses;
  channelName: string;
  sfx_tick?: string;
  sfx_drum?: string;
  sfx_correct?: string;
  sfx_whoosh?: string;
  sfx_progress?: string;
}

export const QuestionScene: React.FC<QuestionSceneProps> = ({
  question,
  imageSrc,
  revealImageSrc,
  funFactImageSrc,
  questionNumber,
  totalQuestions,
  theme,
  jessPoses,
  channelName,
  sfx_tick,
  sfx_drum,
  sfx_correct,
  sfx_whoosh,
  sfx_progress,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isVertical = height > width;
  
  const phases = computeQuestionPhases(question);
  
  // ─── FAZ DETECTION ─────────────────────────────────
  const inShow = frame < phases.countdown;
  const inCountdown = frame >= phases.countdown && frame < phases.drumRoll;
  const inDrumRoll = frame >= phases.drumRoll && frame < phases.reveal;
  const inRevealCorrect = frame >= phases.reveal && frame < phases.funFact;
  const inFunFact = frame >= phases.funFact && frame < phases.transition;
  const inTransition = frame >= phases.transition && frame < phases.end;
  
  // Reveal başlangıcı sonrası (görsel bayrağa geçer, şıklar state değiştirir)
  const isRevealed = frame >= phases.reveal;
  
  // Jess pozu
  let currentJessPose: keyof JessPoses = "question";
  if (inCountdown || inDrumRoll) currentJessPose = "thinking";
  else if (inRevealCorrect || inFunFact) currentJessPose = "correct";
  
  // Fade out transition'da
  const fadeOut = inTransition
    ? interpolate(
        frame - phases.transition,
        [0, FIXED_FRAMES.transition],
        [1, 0],
        { extrapolateRight: "clamp" }
      )
    : 1;
  
  // ─── GÖRSEL: SHOW/COUNTDOWN'da question image, REVEAL'da bayrak/clue ──
  // Bayrak varsa reveal'de değişir, yoksa question image kalır
  const hasRevealImage = !!revealImageSrc && revealImageSrc !== imageSrc;
  const currentImageSrc = (isRevealed && !inFunFact && hasRevealImage)
    ? revealImageSrc
    : imageSrc;
  
  // Reveal görsel geçişi: 0.3s'lik scale+fade
  const revealImageTransition = isRevealed
    ? interpolate(frame - phases.reveal, [0, 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  
  // Pattern - soru başına farklı
  const pattern = getPatternForQuestion(questionNumber - 1);
  
  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      {/* ANIMATED BG */}
      <AnimatedBackground theme={theme} pattern={pattern} motionSpeed={1} />
      
      {/* AUDIO */}
      {question.question_audio_path && (
        <Sequence from={phases.show} durationInFrames={phases.countdown - phases.show}>
          <Audio src={staticFile(question.question_audio_path)} volume={1.2} />
        </Sequence>
      )}
      {question.answer_audio_path && (
        <Sequence from={phases.reveal} durationInFrames={phases.transition - phases.reveal}>
          <Audio src={staticFile(question.answer_audio_path)} volume={1.2} />
        </Sequence>
      )}
      
      {/* SFX */}
      {/* Progress bar sıvı dolan ses - countdown boyunca */}
      {sfx_progress && (
        <Sequence from={phases.countdown} durationInFrames={FIXED_FRAMES.countdown}>
          <Audio src={staticFile(sfx_progress)} volume={0.8} />
        </Sequence>
      )}
      {/* Tick - countdown'un son 2 saniyesi (alarm hissi) */}
      {sfx_tick && (
        <Sequence
          from={phases.drumRoll - (2 * FPS)}
          durationInFrames={2 * FPS}
        >
          <Audio src={staticFile(sfx_tick)} volume={0.9} loop />
        </Sequence>
      )}
      {/* Drum - reveal hazırlığı */}
      {sfx_drum && (
        <Sequence from={phases.drumRoll} durationInFrames={FIXED_FRAMES.drumRoll}>
          <Audio src={staticFile(sfx_drum)} volume={1.0} />
        </Sequence>
      )}
      {/* Correct ding - reveal başlangıcı */}
      {sfx_correct && (
        <Sequence from={phases.reveal} durationInFrames={2 * FPS}>
          <Audio src={staticFile(sfx_correct)} volume={1.0} />
        </Sequence>
      )}
      {/* Whoosh - transition başlangıcı */}
      {sfx_whoosh && (
        <Sequence from={phases.transition} durationInFrames={FIXED_FRAMES.transition}>
          <Audio src={staticFile(sfx_whoosh)} volume={0.8} />
        </Sequence>
      )}
      
      {/* HEADER - sol yıldız rozet + orta soru + sağ şimşek */}
      <QuizHeader
        questionNumber={questionNumber}
        questionText={question.question_text}
        showFrame={phases.show}
        isVertical={isVertical}
      />
      
      {/* VERTICAL BRAND TAG - sağ kenar */}
      <VerticalBrandTag
        side="right"
        topOffset={isVertical ? 180 : 200}
        bottomOffset={isVertical ? 280 : 200}
        fontSize={isVertical ? 32 : 36}
      />
      
      {/* ANA İÇERİK - format'a göre */}
      {isVertical ? (
        <ShortsLayout
          question={question}
          imageSrc={currentImageSrc}
          funFactImageSrc={funFactImageSrc}
          theme={theme}
          phases={phases}
          inShow={inShow}
          inCountdown={inCountdown}
          inDrumRoll={inDrumRoll}
          inRevealCorrect={inRevealCorrect}
          inFunFact={inFunFact}
          isRevealed={isRevealed}
          revealImageTransition={revealImageTransition}
          width={width}
          height={height}
        />
      ) : (
        <LongLayout
          question={question}
          imageSrc={currentImageSrc}
          funFactImageSrc={funFactImageSrc}
          theme={theme}
          phases={phases}
          inShow={inShow}
          inCountdown={inCountdown}
          inDrumRoll={inDrumRoll}
          inRevealCorrect={inRevealCorrect}
          inFunFact={inFunFact}
          isRevealed={isRevealed}
          revealImageTransition={revealImageTransition}
          width={width}
          height={height}
        />
      )}
      
      {/* PROGRESS BAR - alt orta, countdown fazında */}
      {(inCountdown || inDrumRoll) && (
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? 380 : 80,
            left: isVertical ? 60 : 200,
            right: isVertical ? 60 : 200,
            zIndex: 20,
          }}
        >
          <LiquidProgressBar
            startFrame={phases.countdown}
            durationFrames={FIXED_FRAMES.countdown}
            height={isVertical ? 50 : 60}
          />
        </div>
      )}
      
      {/* JESS - sağ alt köşede küçük (long); alt orta (shorts) */}
      <JessCharacter
        pose={currentJessPose}
        poses={jessPoses}
        position={isVertical ? "bottom-center" : "bottom-right"}
        size={isVertical ? 320 : 280}
        animate
      />
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════
// LONG LAYOUT (16:9) — Sol görsel + Sağ şıklar
// ═══════════════════════════════════════════════════
interface LayoutProps {
  question: Question;
  imageSrc: string;
  funFactImageSrc?: string;
  theme: ThemeColor;
  phases: ReturnType<typeof computeQuestionPhases>;
  inShow: boolean;
  inCountdown: boolean;
  inDrumRoll: boolean;
  inRevealCorrect: boolean;
  inFunFact: boolean;
  isRevealed: boolean;
  revealImageTransition: number;
  width: number;
  height: number;
}

const LongLayout: React.FC<LayoutProps> = ({
  question, imageSrc, funFactImageSrc, theme, phases,
  inShow, inCountdown, inDrumRoll, inRevealCorrect, inFunFact, isRevealed,
  revealImageTransition, width, height,
}) => {
  // Header 150, alt boşluk 140 (progress bar + Jess için)
  const bodyTop = 170;
  const bodyBottom = 200;
  
  // Sol kart 50%, sağ kart 50% (gap için)
  const colGap = 50;
  const leftWidth = Math.floor((width - 100 - colGap) * 0.5);
  const rightWidth = width - 100 - colGap - leftWidth;
  
  // Görsel kart boyutu
  const imageHeight = Math.min(height - bodyTop - bodyBottom, 600);
  
  return (
    <div
      style={{
        position: "absolute",
        top: bodyTop,
        left: 50,
        right: 50,
        bottom: bodyBottom,
        display: "flex",
        gap: colGap,
      }}
    >
      {/* SOL: Görsel kart */}
      <div
        style={{
          width: leftWidth,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!inFunFact ? (
          <ImageCard
            src={imageSrc}
            width={leftWidth}
            height={imageHeight}
            isReveal={isRevealed}
            revealTransition={revealImageTransition}
          />
        ) : (
          funFactImageSrc && (
            <ImageCard
              src={funFactImageSrc}
              width={leftWidth}
              height={imageHeight}
              isReveal={false}
              revealTransition={1}
            />
          )
        )}
      </div>
      
      {/* SAĞ: Şıklar veya Fun fact */}
      <div
        style={{
          width: rightWidth,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 22,
        }}
      >
        {!inFunFact ? (
          <AnswerStack
            options={question.options}
            flags={question.option_flags}
            correctAnswer={question.correct_answer}
            isRevealed={isRevealed}
            phases={phases}
            large
          />
        ) : (
          <FunFactPanel
            text={question.fun_fact}
            showFrame={phases.funFact}
          />
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// SHORTS LAYOUT (9:16) — Üst görsel + Alt şıklar
// ═══════════════════════════════════════════════════
const ShortsLayout: React.FC<LayoutProps> = ({
  question, imageSrc, funFactImageSrc, theme, phases,
  inShow, inCountdown, inDrumRoll, inRevealCorrect, inFunFact, isRevealed,
  revealImageTransition, width, height,
}) => {
  const bodyTop = 150;
  const padding = 50;
  
  const contentWidth = width - padding * 2;
  const imageHeight = Math.floor(height * 0.32);
  
  return (
    <div
      style={{
        position: "absolute",
        top: bodyTop,
        left: padding,
        right: padding,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* ÜST: Görsel kart */}
      {!inFunFact ? (
        <ImageCard
          src={imageSrc}
          width={contentWidth}
          height={imageHeight}
          isReveal={isRevealed}
          revealTransition={revealImageTransition}
        />
      ) : (
        funFactImageSrc && (
          <ImageCard
            src={funFactImageSrc}
            width={contentWidth}
            height={imageHeight}
            isReveal={false}
            revealTransition={1}
          />
        )
      )}
      
      {/* ALT: Şıklar veya Fun fact */}
      {!inFunFact ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <AnswerStack
            options={question.options}
            flags={question.option_flags}
            correctAnswer={question.correct_answer}
            isRevealed={isRevealed}
            phases={phases}
          />
        </div>
      ) : (
        <FunFactPanel
          text={question.fun_fact}
          showFrame={phases.funFact}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// ANSWER STACK (3 şık)
// ═══════════════════════════════════════════════════
interface AnswerStackProps {
  options: string[];
  flags?: string[];
  correctAnswer: number;
  isRevealed: boolean;
  phases: ReturnType<typeof computeQuestionPhases>;
  large?: boolean;
}

const AnswerStack: React.FC<AnswerStackProps> = ({
  options, flags, correctAnswer, isRevealed, phases, large,
}) => {
  const letters: Array<"A" | "B" | "C"> = ["A", "B", "C"];
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {options.map((text, i) => {
        const letter = letters[i];
        const isCorrect = i === correctAnswer;
        
        let state: AnswerState = "idle";
        if (isRevealed) {
          state = isCorrect ? "revealedCorrect" : "revealedDim";
        }
        
        return (
          <AnswerCard
            key={i}
            letter={letter}
            text={text}
            flag={flags?.[i]}
            state={state}
            enterFrame={phases.show + 12 + i * 8}
            revealFrame={phases.reveal}
            large={large}
          />
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// IMAGE CARD (yuvarlatılmış görsel kart)
// ═══════════════════════════════════════════════════
interface ImageCardProps {
  src: string;
  width: number;
  height: number;
  isReveal?: boolean;
  revealTransition?: number;
}

const ImageCard: React.FC<ImageCardProps> = ({
  src, width, height, isReveal = false, revealTransition = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Görsel reveal'de yumuşak fade-scale geçiş
  const scale = isReveal
    ? interpolate(revealTransition, [0, 1], [0.95, 1])
    : 1;
  const opacity = isReveal
    ? interpolate(revealTransition, [0, 0.5, 1], [0.5, 0.8, 1])
    : 1;
  
  if (!src) return null;
  
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: BRAND.white,
        border: `6px solid ${BRAND.white}`,
        boxShadow: "0 14px 32px rgba(0,0,0,0.45), 0 0 0 3px rgba(0,0,0,0.15)",
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════
// FUN FACT PANEL
// ═══════════════════════════════════════════════════
interface FunFactPanelProps {
  text: string;
  showFrame: number;
}

const FunFactPanel: React.FC<FunFactPanelProps> = ({ text, showFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  const translateY = interpolate(enterAnim, [0, 1], [40, 0]);
  
  // Ampul pulse
  const bulbPulse = 1 + Math.sin(frame * 0.15) * 0.05;
  
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        padding: "0 20px",
      }}
    >
      {/* Ampul ikonu */}
      <div
        style={{
          fontSize: 130,
          transform: `scale(${bulbPulse})`,
          filter: `drop-shadow(0 0 30px ${BRAND.yellow})`,
          lineHeight: 1,
        }}
      >
        💡
      </div>
      
      {/* "DID YOU KNOW?" başlık */}
      <div
        style={{
          fontSize: 48,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: BRAND.yellow,
          textShadow: `
            -3px -3px 0 ${BRAND.black},
            3px -3px 0 ${BRAND.black},
            -3px 3px 0 ${BRAND.black},
            3px 3px 0 ${BRAND.black}
          `,
          letterSpacing: 2,
        }}
      >
        DID YOU KNOW?
      </div>
      
      {/* Fact metni - beyaz arka plan kart */}
      <div
        style={{
          backgroundColor: BRAND.white,
          borderRadius: 24,
          padding: "32px 40px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          border: `5px solid ${BRAND.yellow}`,
          maxWidth: "90%",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.black,
            lineHeight: 1.3,
            textAlign: "center",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
