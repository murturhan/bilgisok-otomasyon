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
import { QuizHeader } from "../components/QuizHeader";
import { AnswerCard, AnswerState } from "../components/AnswerCard";
import { LiquidProgressBar } from "../components/LiquidProgressBar";
import { VerticalBrandTag } from "../components/VerticalBrandTag";
import { AnimatedBackground, getPatternForQuestion } from "../components/AnimatedBackground";
import { GlassesIcon } from "../components/BrandAssets";
import { computeQuestionPhases } from "../utils/timing";

interface QuestionSceneProps {
  question: Question;
  imageSrc: string;
  revealImageSrc?: string;
  funFactImageSrc?: string;
  questionNumber: number;
  totalQuestions: number;
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
  
  const inShow = frame < phases.countdown;
  const inCountdown = frame >= phases.countdown && frame < phases.drumRoll;
  const inDrumRoll = frame >= phases.drumRoll && frame < phases.reveal;
  const inRevealCorrect = frame >= phases.reveal && frame < phases.funFact;
  const inFunFact = frame >= phases.funFact && frame < phases.end; // ⚠️ transition'a kadar değil, end'e kadar - eski soru geri görünmesin
  const inTransition = frame >= phases.transition && frame < phases.end;
  
  const isRevealed = frame >= phases.reveal;
  
  let currentJessPose: keyof JessPoses = "question";
  if (inCountdown || inDrumRoll) currentJessPose = "thinking";
  else if (inRevealCorrect) currentJessPose = "correct";
  
  const fadeOut = inTransition
    ? interpolate(
        frame - phases.transition,
        [0, FIXED_FRAMES.transition],
        [1, 0],
        { extrapolateRight: "clamp" }
      )
    : 1;
  
  const hasRevealImage = !!revealImageSrc && revealImageSrc !== imageSrc;
  const currentImageSrc = (isRevealed && !inFunFact && hasRevealImage)
    ? revealImageSrc
    : imageSrc;
  
  const revealImageTransition = isRevealed
    ? interpolate(frame - phases.reveal, [0, 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  
  const pattern = getPatternForQuestion(questionNumber - 1);
  
  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
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
      {sfx_progress && (
        <Sequence from={phases.countdown} durationInFrames={FIXED_FRAMES.countdown}>
          <Audio src={staticFile(sfx_progress)} volume={0.5} />
        </Sequence>
      )}
      {sfx_tick && (
        <Sequence from={phases.drumRoll - (3 * FPS)} durationInFrames={3 * FPS}>
          <Audio src={staticFile(sfx_tick)} volume={0.6} loop />
        </Sequence>
      )}
      {/* DRUM - countdown bitince DRUMROLL fazında çalar (1s), sonra SESSIZ silentPause 1s */}
      {sfx_drum && (
        <Sequence from={phases.drumRoll} durationInFrames={FIXED_FRAMES.drumRoll}>
          <Audio src={staticFile(sfx_drum)} volume={0.5} />
        </Sequence>
      )}
      {/* CORRECT - reveal anında çalar (silentPause bittikten sonra) */}
      {sfx_correct && (
        <Sequence from={phases.reveal} durationInFrames={Math.floor(FPS * 1.5)}>
          <Audio src={staticFile(sfx_correct)} volume={0.7} />
        </Sequence>
      )}
      {/* WHOOSH - sonraki soruya transition'da çalar (kullanıcı talebi) */}
      {sfx_whoosh && (
        <Sequence from={phases.transition} durationInFrames={FIXED_FRAMES.transition}>
          <Audio src={staticFile(sfx_whoosh)} volume={0.6} />
        </Sequence>
      )}
      
      {/* HEADER */}
      <QuizHeader
        questionNumber={questionNumber}
        questionText={question.question_text}
        showFrame={phases.show}
        isVertical={isVertical}
      />
      
      {/* VERTICAL BRAND */}
      <VerticalBrandTag
        side="right"
        topOffset={isVertical ? 170 : 200}
        bottomOffset={isVertical ? 250 : 200}
        fontSize={isVertical ? 28 : 32}
      />
      
      {/* ANA İÇERİK */}
      {isVertical ? (
        <ShortsLayout
          question={question}
          imageSrc={currentImageSrc}
          funFactImageSrc={funFactImageSrc}
          theme={theme}
          phases={phases}
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
          inFunFact={inFunFact}
          isRevealed={isRevealed}
          revealImageTransition={revealImageTransition}
          width={width}
          height={height}
        />
      )}
      
      {/* PROGRESS BAR */}
      {(inCountdown || inDrumRoll) && (
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? 320 : 80,
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
      
      {/* JESS - sadece soru fazlarında, fun fact'te YOK (gözlük gösteriyoruz) */}
      {!inFunFact && (
        <JessCharacter
          pose={currentJessPose}
          poses={jessPoses}
          position="bottom-center"
          size={isVertical ? 280 : 280}
          animate
        />
      )}
    </AbsoluteFill>
  );
};

interface LayoutProps {
  question: Question;
  imageSrc: string;
  funFactImageSrc?: string;
  theme: ThemeColor;
  phases: ReturnType<typeof computeQuestionPhases>;
  inFunFact: boolean;
  isRevealed: boolean;
  revealImageTransition: number;
  width: number;
  height: number;
}

const LongLayout: React.FC<LayoutProps> = ({
  question, imageSrc, funFactImageSrc, phases,
  inFunFact, isRevealed, revealImageTransition, width, height,
}) => {
  const bodyTop = 170;
  const bodyBottom = 200;
  
  const colGap = 50;
  const leftWidth = Math.floor((width - 100 - colGap) * 0.5);
  const rightWidth = width - 100 - colGap - leftWidth;
  
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
            isVertical={false}
          />
        )}
      </div>
    </div>
  );
};

const ShortsLayout: React.FC<LayoutProps> = ({
  question, imageSrc, funFactImageSrc, phases,
  inFunFact, isRevealed, revealImageTransition, width, height,
}) => {
  const bodyTop = 200;  // header 180 oldu, biraz boşluk
  const padding = 40;
  const contentWidth = width - padding * 2;
  const imageHeight = Math.floor(height * 0.38);
  
  // Fun fact'te alt boşluk daha az (Jess olmadığı için)
  const bodyBottom = inFunFact ? 120 : 280;
  
  return (
    <div
      style={{
        position: "absolute",
        top: bodyTop,
        left: padding,
        right: padding,
        bottom: bodyBottom,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        gap: 30,
      }}
    >
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
            height={Math.floor(height * 0.32)}
            isReveal={false}
            revealTransition={1}
          />
        )
      )}
      
      {!inFunFact ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            flex: 1,
            justifyContent: "center",
          }}
        >
          <AnswerStack
            options={question.options}
            flags={question.option_flags}
            correctAnswer={question.correct_answer}
            isRevealed={isRevealed}
            phases={phases}
            large
          />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 20,
          }}
        >
          <FunFactPanel
            text={question.fun_fact}
            showFrame={phases.funFact}
            isVertical
          />
        </div>
      )}
    </div>
  );
};

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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
// FUN FACT PANEL — Canva tasarımına uygun: ampul + DID YOU KNOW yan yana,
// metin altında GÖZLÜK (Jess yerine)
// ═══════════════════════════════════════════════════
interface FunFactPanelProps {
  text: string;
  showFrame: number;
  isVertical?: boolean;
}

const FunFactPanel: React.FC<FunFactPanelProps> = ({ text, showFrame, isVertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  const translateY = interpolate(enterAnim, [0, 1], [40, 0]);
  
  const bulbPulse = 1 + Math.sin(frame * 0.15) * 0.05;
  
  // Gözlük animasyonu (metin sonrası gelir)
  const glassesAnim = spring({
    frame: frame - showFrame - 30,
    fps,
    config: { damping: 12, stiffness: 110 },
  });
  const glassesScale = interpolate(glassesAnim, [0, 1], [0, 1]);
  const glassesOpacity = interpolate(glassesAnim, [0, 0.5], [0, 1]);
  
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: isVertical ? 20 : 24,
        padding: "0 16px",
        width: "100%",
      }}
    >
      {/* Ampul + DID YOU KNOW yan yana (Canva tasarımı) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            fontSize: isVertical ? 90 : 110,
            transform: `scale(${bulbPulse})`,
            filter: `drop-shadow(0 0 30px ${BRAND.yellow})`,
            lineHeight: 1,
          }}
        >
          💡
        </div>
        
        <div
          style={{
            fontSize: isVertical ? 56 : 64,
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
            textTransform: "uppercase",
          }}
        >
          DID YOU KNOW?
        </div>
      </div>
      
      {/* Fact metni - beyaz kart */}
      <div
        style={{
          backgroundColor: BRAND.white,
          borderRadius: 16,
          padding: isVertical ? "26px 30px" : "32px 40px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          borderTop: `6px solid ${BRAND.yellow}`,
          borderBottom: `6px solid ${BRAND.yellow}`,
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            fontSize: isVertical ? 38 : 40,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.black,
            lineHeight: 1.3,
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {text}
        </div>
      </div>
      
      {/* GÖZLÜK (Jess yerine - Canva tasarımı) */}
      <div
        style={{
          transform: `scale(${glassesScale})`,
          opacity: glassesOpacity,
          marginTop: isVertical ? 10 : 20,
        }}
      >
        <GlassesIcon size={isVertical ? 200 : 240} />
      </div>
    </div>
  );
};
