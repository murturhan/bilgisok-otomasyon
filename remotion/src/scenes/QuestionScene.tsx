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
import { COLORS, FONTS, FIXED_FRAMES, FPS } from "../styles/theme";
import { Question, JessPoses } from "../types/schemas";
import { JessCharacter } from "../components/JessCharacter";
import { CountdownTimer } from "../components/CountdownTimer";
import { FunFactBanner } from "../components/FunFactBanner";
import { HeaderBar } from "../components/HeaderBar";
import { computeQuestionPhases } from "../utils/timing";

interface QuestionSceneProps {
  question: Question;
  imageSrc: string;
  funFactImageSrc?: string; // YENİ
  questionNumber: number;
  totalQuestions: number;
  jessPoses: JessPoses;
  channelName: string;
  sfx_tick?: string;
  sfx_drum?: string;
  sfx_correct?: string;
  sfx_whoosh?: string;
}

export const QuestionScene: React.FC<QuestionSceneProps> = ({
  question,
  imageSrc,
  funFactImageSrc,
  questionNumber,
  totalQuestions,
  jessPoses,
  channelName,
  sfx_tick,
  sfx_drum,
  sfx_correct,
  sfx_whoosh,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const isVertical = height > width;

  const phases = computeQuestionPhases(question);
  
  const inShow = frame < phases.countdown;
  const inCountdown = frame >= phases.countdown && frame < phases.drumRoll;
  const inDrumRoll = frame >= phases.drumRoll && frame < phases.reveal;
  const inReveal = frame >= phases.reveal && frame < phases.transition;
  const inTransition = frame >= phases.transition && frame < phases.end;
  
  // Reveal fazını 2 alt-faza böl:
  // İlk %35: "CORRECT! [cevap]" göster
  // Son %65: Fun fact + fun fact görseli göster
  const revealDuration = phases.transition - phases.reveal;
  const revealCorrectEnd = phases.reveal + Math.floor(revealDuration * 0.35);
  const inRevealCorrect = inReveal && frame < revealCorrectEnd;
  const inRevealFunFact = inReveal && frame >= revealCorrectEnd;
  
  // Jess pose
  let currentJessPose: keyof JessPoses = "question";
  if (inShow) currentJessPose = "question";
  else if (inCountdown || inDrumRoll) currentJessPose = "thinking";
  else if (inReveal) currentJessPose = "correct";

  // Transition fade
  const fadeOut = inTransition
    ? interpolate(frame - phases.transition, [0, FIXED_FRAMES.transition], [1, 0.3], { extrapolateRight: "clamp" })
    : 1;

  // SFX: Tick - son 2 saniye (10sn için son 4, 5sn için son 2 — şu an 5sn fix)
  const tickStartFrame = phases.drumRoll - (2 * FPS);

  // Layout
  const containerPaddingTop = isVertical ? 120 : 130;
  const containerPaddingBottom = isVertical ? 450 : 60; // Jess için alt boşluk

  // Görsel boyutları (shorts ve long için)
  const imageWidth = isVertical ? width - 80 : Math.floor(width * 0.42);
  const imageHeight = isVertical
    ? Math.min(720, Math.floor((width - 80) * 0.55))
    : Math.floor(height * 0.5);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.bgGradientStart} 0%, ${COLORS.bgGradientEnd} 100%)`,
        opacity: fadeOut,
      }}
    >
      {/* AUDIO: Question text */}
      {question.question_audio_path && (
        <Sequence from={phases.show} durationInFrames={phases.countdown - phases.show}>
          <Audio src={staticFile(question.question_audio_path)} volume={1.2} />
        </Sequence>
      )}
      
      {/* AUDIO: Answer text */}
      {question.answer_audio_path && (
        <Sequence from={phases.reveal} durationInFrames={phases.transition - phases.reveal}>
          <Audio src={staticFile(question.answer_audio_path)} volume={1.2} />
        </Sequence>
      )}

      {/* SFX: Tick - son 2 saniye */}
      {sfx_tick && (
        <Sequence from={tickStartFrame} durationInFrames={2 * FPS}>
          <Audio src={staticFile(sfx_tick)} volume={0.6} loop />
        </Sequence>
      )}

      {/* SFX: Drum roll */}
      {sfx_drum && (
        <Sequence from={phases.drumRoll} durationInFrames={FIXED_FRAMES.drumRoll}>
          <Audio src={staticFile(sfx_drum)} volume={0.7} />
        </Sequence>
      )}

      {/* SFX: Correct */}
      {sfx_correct && (
        <Sequence from={phases.reveal} durationInFrames={2 * FPS}>
          <Audio src={staticFile(sfx_correct)} volume={0.8} />
        </Sequence>
      )}

      {/* SFX: Whoosh */}
      {sfx_whoosh && (
        <Sequence from={phases.transition} durationInFrames={FIXED_FRAMES.transition}>
          <Audio src={staticFile(sfx_whoosh)} volume={0.5} />
        </Sequence>
      )}

      {/* Header */}
      <HeaderBar
        channelName={channelName}
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        height={isVertical ? 100 : 120}
      />

      {/* DİKEY LAYOUT (SHORTS) */}
      {isVertical && (
        <>
          {/* Show/Countdown/DrumRoll/RevealCorrect: QUESTION görseli üstte */}
          {(inShow || inCountdown || inDrumRoll || inRevealCorrect) && (
            <div
              style={{
                position: "absolute",
                top: containerPaddingTop,
                left: 40,
                right: 40,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* QUESTION GÖRSEL */}
              <div
                style={{
                  width: imageWidth,
                  height: imageHeight,
                  borderRadius: 24,
                  overflow: "hidden",
                  border: `8px solid ${COLORS.primary}`,
                  boxShadow: `0 12px 32px rgba(0,0,0,0.5), 0 0 20px ${COLORS.primary}`,
                  backgroundColor: COLORS.textBlack,
                }}
              >
                <Img src={imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              
              {/* SORU METNİ (sadece show + countdown) */}
              {(inShow || inCountdown) && (
                <QuestionTextBlock
                  text={question.question_text}
                  showFrame={phases.show}
                  isCompact
                />
              )}
              
              {/* CEVAP KUTULARI (sadece show + countdown) */}
              {(inShow || inCountdown) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <AnswerBoxNew letter="A" text={question.options[0]} showFrame={phases.show + 15} />
                  <AnswerBoxNew letter="B" text={question.options[1]} showFrame={phases.show + 22} />
                  <AnswerBoxNew letter="C" text={question.options[2]} showFrame={phases.show + 29} />
                  <AnswerBoxNew letter="D" text={question.options[3]} showFrame={phases.show + 36} />
                </div>
              )}
              
              {/* CORRECT! BANDI (reveal-correct sub-phase'da) */}
              {inRevealCorrect && (
                <CorrectBanner
                  letter={["A", "B", "C", "D"][question.correct_answer]}
                  text={question.options[question.correct_answer]}
                  showFrame={phases.reveal}
                />
              )}
            </div>
          )}
          
          {/* RevealFunFact: FUN FACT görseli + banner */}
          {inRevealFunFact && (
            <div
              style={{
                position: "absolute",
                top: containerPaddingTop,
                left: 40,
                right: 40,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* FUN FACT GÖRSELİ - büyük */}
              {funFactImageSrc && (
                <FunFactImage src={funFactImageSrc} showFrame={revealCorrectEnd} width={imageWidth} height={imageHeight} />
              )}
              
              {/* Fun fact metni */}
              {question.fun_fact && (
                <FunFactBanner
                  text={question.fun_fact}
                  showFrame={revealCorrectEnd + 10}
                  width="100%"
                />
              )}
            </div>
          )}
        </>
      )}

      {/* YATAY LAYOUT (LONG) */}
      {!isVertical && (
        <div
          style={{
            position: "absolute",
            top: 140,
            left: 40,
            right: 40,
            bottom: 60,
            display: "flex",
            gap: 50,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            {/* GÖRSEL */}
            <div style={{
              width: imageWidth, height: imageHeight,
              borderRadius: 24, overflow: "hidden",
              border: `8px solid ${COLORS.primary}`,
              boxShadow: `0 12px 32px rgba(0,0,0,0.5), 0 0 20px ${COLORS.primary}`,
            }}>
              <Img 
                src={(inRevealFunFact && funFactImageSrc) ? funFactImageSrc : imageSrc} 
                style={{ width: "100%", height: "100%", objectFit: "cover" }} 
              />
            </div>
            
            {(inShow || inCountdown) && (
              <QuestionTextBlock text={question.question_text} showFrame={phases.show} />
            )}
            
            {inRevealFunFact && question.fun_fact && (
              <FunFactBanner text={question.fun_fact} showFrame={revealCorrectEnd + 10} width="100%" />
            )}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center", maxWidth: 800 }}>
            {(inShow || inCountdown) && (
              <>
                <AnswerBoxNew letter="A" text={question.options[0]} showFrame={phases.show + 15} large />
                <AnswerBoxNew letter="B" text={question.options[1]} showFrame={phases.show + 22} large />
                <AnswerBoxNew letter="C" text={question.options[2]} showFrame={phases.show + 29} large />
                <AnswerBoxNew letter="D" text={question.options[3]} showFrame={phases.show + 36} large />
              </>
            )}
            
            {inRevealCorrect && (
              <CorrectBanner
                letter={["A", "B", "C", "D"][question.correct_answer]}
                text={question.options[question.correct_answer]}
                showFrame={phases.reveal}
              />
            )}
            
            {inCountdown && (
              <div style={{ marginTop: 30 }}>
                <CountdownTimer
                  startFrame={phases.countdown}
                  durationFrames={FIXED_FRAMES.countdown}
                  width="100%"
                  showNumber={false}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* COUNTDOWN: timer + büyük rakam (sağ-üst köşede, soru metnine binmesin) */}
      {inCountdown && isVertical && (
        <>
          {/* Timer bar - cevap kutularının altında ekstra çubuk */}
          <div
            style={{
              position: "absolute",
              left: 40,
              right: 40,
              bottom: 420,
              zIndex: 9,
            }}
          >
            <CountdownTimer
              startFrame={phases.countdown}
              durationFrames={FIXED_FRAMES.countdown}
              width="100%"
              showNumber={false}
            />
          </div>
          
          {/* Büyük geri sayım rakamı - sağ üst köşede (header'ın altında) */}
          <BigCountdownNumberCorner
            startFrame={phases.countdown}
            durationFrames={FIXED_FRAMES.countdown}
            position={isVertical ? "right-top" : "right-top"}
          />
        </>
      )}

      {/* DRUM ROLL: büyük ? işareti */}
      {inDrumRoll && (
        <BigQuestionMark startFrame={phases.drumRoll} />
      )}

      {/* JESS - ALT ORTA, BÜYÜK (400px shorts, 360px long) */}
      <JessCharacter
        pose={currentJessPose}
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 380 : 360}
        animate
      />
    </AbsoluteFill>
  );
};

// ────────── Alt komponentler ──────────

// SORU METNI - büyük, koyu zemin
const QuestionTextBlock: React.FC<{
  text: string;
  showFrame: number;
  isCompact?: boolean;
}> = ({ text, showFrame, isCompact }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterAnim = spring({
    frame: frame - showFrame - 15,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  const translateY = interpolate(enterAnim, [0, 1], [20, 0]);

  return (
    <div
      style={{
        width: "100%",
        opacity,
        transform: `translateY(${translateY}px)`,
        backgroundColor: "rgba(40, 20, 80, 0.85)",
        borderRadius: 20,
        padding: isCompact ? "22px 30px" : "26px 38px",
        border: `5px solid ${COLORS.primary}`,
        textAlign: "center",
        boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          fontSize: isCompact ? 50 : 56,
          fontFamily: FONTS.display,
          fontWeight: 400,
          color: COLORS.textWhite,
          textShadow: "3px 3px 5px rgba(0,0,0,0.7)",
          lineHeight: 1.15,
          letterSpacing: 0.5,
        }}
      >
        {text}
      </div>
    </div>
  );
};

// CEVAP KUTUSU - minimal kontur stili (kullanıcının mock'undaki gibi)
const AnswerBoxNew: React.FC<{
  letter: string;
  text: string;
  showFrame: number;
  large?: boolean;
}> = ({ letter, text, showFrame, large }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  const translateX = interpolate(enterAnim, [0, 1], [200, 0]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: large ? "20px 28px" : "16px 22px",
        backgroundColor: "rgba(40, 20, 80, 0.45)",
        borderRadius: 50,
        border: `3px solid ${COLORS.primary}`,
        opacity,
        transform: `translateX(${translateX}px)`,
        width: "100%",
      }}
    >
      <div
        style={{
          minWidth: large ? 56 : 44,
          height: large ? 56 : 44,
          backgroundColor: COLORS.primary,
          color: COLORS.textBlack,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: large ? 30 : 26,
          fontFamily: FONTS.display,
          fontWeight: 900,
          border: "3px solid black",
          flexShrink: 0,
        }}
      >
        {letter}
      </div>
      <div
        style={{
          fontSize: large ? 34 : 30,
          fontFamily: FONTS.display,
          fontWeight: 400,
          color: COLORS.textWhite,
          textShadow: "2px 2px 3px rgba(0,0,0,0.6)",
          flex: 1,
        }}
      >
        {text}
      </div>
    </div>
  );
};

// CORRECT BANNER - büyük yeşil glow
const CorrectBanner: React.FC<{
  letter: string;
  text: string;
  showFrame: number;
}> = ({ letter, text, showFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 8, stiffness: 150 },
  });
  const scale = interpolate(enterAnim, [0, 1], [0.3, 1]);
  const rotation = interpolate(enterAnim, [0, 1], [-12, 0]);
  const glow = 30 + Math.sin(frame * 0.2) * 20;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        transform: `scale(${scale}) rotate(${rotation}deg)`,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 56,
          fontFamily: FONTS.display,
          fontWeight: 400,
          color: COLORS.primary,
          textShadow: "4px 4px 0 black, -2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black",
          letterSpacing: 2,
        }}
      >
        ✅ CORRECT!
      </div>
      <div
        style={{
          fontSize: 50,
          fontFamily: FONTS.display,
          fontWeight: 400,
          color: COLORS.textWhite,
          backgroundColor: COLORS.correctGreen,
          padding: "22px 36px",
          borderRadius: 24,
          border: "5px solid black",
          boxShadow: `0 0 ${glow}px ${COLORS.correctGreen}, 0 8px 24px rgba(0,0,0,0.4)`,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span style={{ fontSize: 65 }}>{letter}</span>
        <span>{text}</span>
      </div>
    </div>
  );
};

// FUN FACT GÖRSELİ - büyük üstte
const FunFactImage: React.FC<{
  src: string;
  showFrame: number;
  width: number;
  height: number;
}> = ({ src, showFrame, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  const scale = interpolate(enterAnim, [0, 1], [0.7, 1]);
  
  return (
    <div
      style={{
        width,
        height,
        opacity,
        transform: `scale(${scale})`,
        borderRadius: 24,
        overflow: "hidden",
        border: `8px solid ${COLORS.accent}`,
        boxShadow: `0 12px 32px rgba(0,0,0,0.5), 0 0 30px ${COLORS.accent}`,
      }}
    >
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
};

// COUNTDOWN - sağ üst köşede (soru metnine binmesin)
const BigCountdownNumberCorner: React.FC<{
  startFrame: number;
  durationFrames: number;
  position?: string;
}> = ({ startFrame, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const elapsed = frame - startFrame;
  const remainingSeconds = Math.max(1, Math.ceil((durationFrames - elapsed) / fps));
  
  const secondInTime = elapsed % fps;
  const pulse = secondInTime < 6 ? interpolate(secondInTime, [0, 6], [1.6, 1.0]) : 1.0;
  
  const isDanger = remainingSeconds <= 2;
  const color = isDanger ? COLORS.timerFillDanger : COLORS.primary;

  return (
    <div
      style={{
        position: "absolute",
        right: 50,
        top: 130, // Header'ın altında
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 160,
          height: 160,
          backgroundColor: "rgba(0,0,0,0.6)",
          borderRadius: "50%",
          border: `6px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 30px ${color}`,
        }}
      >
        <div
          style={{
            fontSize: 110,
            fontFamily: '"Lilita One", sans-serif',
            fontWeight: 900,
            color,
            textShadow: "5px 5px 0 black, -3px -3px 0 black, 3px -3px 0 black, -3px 3px 0 black",
            lineHeight: 1,
            transform: `scale(${pulse})`,
          }}
        >
          {remainingSeconds}
        </div>
      </div>
    </div>
  );
};

// "?" büyük yanıp sönen (drumroll yerine)
const BigQuestionMark: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  const enterAnim = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });
  const scale = interpolate(enterAnim, [0, 1], [0.3, 1]);
  const blink = 0.7 + Math.abs(Math.sin(frame * 0.6)) * 0.3;
  const shake = Math.sin(frame * 0.8) * 5;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "30%",
        display: "flex",
        justifyContent: "center",
        zIndex: 15,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: Math.min(width, height) * 0.5,
          fontFamily: '"Lilita One", Arial Black, sans-serif',
          fontWeight: 900,
          color: COLORS.primary,
          textShadow: `
            -10px -10px 0 black,
            10px -10px 0 black,
            -10px 10px 0 black,
            10px 10px 0 black,
            0 0 80px ${COLORS.primary}
          `,
          transform: `translateX(${shake}px) scale(${scale})`,
          opacity: blink,
          lineHeight: 1,
        }}
      >
        ?
      </div>
    </div>
  );
};
