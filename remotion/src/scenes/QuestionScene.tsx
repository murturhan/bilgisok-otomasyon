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
            questionAudioDuration={question.question_audio_duration}
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
            questionAudioDuration={question.question_audio_duration}
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
  /** Sorunun ses süresi (saniye). Şıkların okunma penceresini hesaplamak için. */
  questionAudioDuration?: number;
}

const AnswerStack: React.FC<AnswerStackProps> = ({
  options, flags, correctAnswer, isRevealed, phases, large, questionAudioDuration,
}) => {
  const letters: Array<"A" | "B" | "C"> = ["A", "B", "C"];
  const numOptions = options.length;
  
  // Şıkların okunma penceresi (varsayım):
  // Question audio'nun son %50'sinde şıklar okunuyor.
  // Yani: ilk yarı "Question text", ikinci yarı "A, B, C" tek tek.
  // Eğer questionAudioDuration verilmediyse default 8s alalım.
  const totalAudioFrames = Math.ceil((questionAudioDuration ?? 8) * FPS);
  const readingZoneStart = phases.show + Math.floor(totalAudioFrames * 0.45); // %45'ten başla (biraz erken)
  const readingZoneLen = phases.countdown - readingZoneStart;
  const perOptionLen = Math.max(Math.floor(readingZoneLen / numOptions), 18); // her şık için
  
  // Şıklar tek tek stagger ile gelir - 18 frame aralıkla (~0.6s)
  const STAGGER = 18;
  const ENTRY_OFFSET = 8;
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {options.map((text, i) => {
        const letter = letters[i];
        const isCorrect = i === correctAnswer;
        
        let state: AnswerState = "idle";
        if (isRevealed) {
          state = isCorrect ? "revealedCorrect" : "revealedDim";
        }
        
        const readingStart = readingZoneStart + i * perOptionLen;
        const readingEnd = readingStart + perOptionLen;
        
        return (
          <AnswerCard
            key={i}
            letter={letter}
            text={text}
            flag={flags?.[i]}
            state={state}
            enterFrame={phases.show + ENTRY_OFFSET + i * STAGGER}
            revealFrame={phases.reveal}
            large={large}
            readingStartFrame={readingStart}
            readingEndFrame={readingEnd}
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
  
  // STAGGER ENTRY - 3 eleman sırayla giriş yapar
  // 0f: Ampul + "DID YOU KNOW?" girer
  // 15f: Fact metni kartı girer
  // 35f: Gözlük girer
  
  const headerAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 11, stiffness: 110 },
  });
  const headerOpacity = interpolate(headerAnim, [0, 0.5, 1], [0, 1, 1]);
  const headerScale = interpolate(headerAnim, [0, 1], [0.4, 1]);
  const headerY = interpolate(headerAnim, [0, 1], [-40, 0]);
  
  const cardAnim = spring({
    frame: frame - showFrame - 15,
    fps,
    config: { damping: 13, stiffness: 100 },
  });
  const cardOpacity = interpolate(cardAnim, [0, 0.5, 1], [0, 1, 1]);
  const cardY = interpolate(cardAnim, [0, 1], [60, 0]);
  const cardScale = interpolate(cardAnim, [0, 1], [0.85, 1]);
  
  const glassesAnim = spring({
    frame: frame - showFrame - 35,
    fps,
    config: { damping: 10, stiffness: 130 },
  });
  const glassesScale = interpolate(glassesAnim, [0, 1], [0, 1]);
  const glassesOpacity = interpolate(glassesAnim, [0, 0.5], [0, 1]);
  const glassesRotate = interpolate(glassesAnim, [0, 0.7, 1], [-180, 10, 0]);
  
  // Idle animasyonlar
  const bulbPulse = 1 + Math.sin(frame * 0.15) * 0.06;
  const glassesIdleBounce = Math.sin((frame - showFrame - 35) * 0.1) * 6;
  
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: isVertical ? 28 : 32,
        padding: "0 16px",
        width: "100%",
      }}
    >
      {/* 1. AMPUL + DID YOU KNOW yan yana - stagger 0f */}
      <div
        style={{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px) scale(${headerScale})`,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: isVertical ? 130 : 150,
            transform: `scale(${bulbPulse})`,
            filter: `drop-shadow(0 0 35px ${BRAND.yellow})`,
            lineHeight: 1,
          }}
        >
          💡
        </div>
        
        <div
          style={{
            fontSize: isVertical ? 72 : 80,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.yellow,
            textShadow: `
              -4px -4px 0 ${BRAND.black},
              4px -4px 0 ${BRAND.black},
              -4px 4px 0 ${BRAND.black},
              4px 4px 0 ${BRAND.black}
            `,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          DID YOU KNOW?
        </div>
      </div>
      
      {/* 2. Fact metni kartı - stagger 15f */}
      <div
        style={{
          opacity: cardOpacity,
          transform: `translateY(${cardY}px) scale(${cardScale})`,
          backgroundColor: BRAND.white,
          borderRadius: 20,
          padding: isVertical ? "36px 38px" : "44px 50px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.45), 0 0 0 4px rgba(255, 220, 0, 0.4)",
          borderTop: `8px solid ${BRAND.yellow}`,
          borderBottom: `8px solid ${BRAND.yellow}`,
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            fontSize: isVertical ? 50 : 54,
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
      
      {/* 3. GÖZLÜK - stagger 35f, döne döne gelir */}
      <div
        style={{
          transform: `scale(${glassesScale}) rotate(${glassesRotate}deg) translateY(${glassesIdleBounce}px)`,
          opacity: glassesOpacity,
          marginTop: isVertical ? 16 : 24,
        }}
      >
        <GlassesIcon size={isVertical ? 280 : 320} />
      </div>
    </div>
  );
};
