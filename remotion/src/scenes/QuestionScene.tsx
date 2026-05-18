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
import { HeaderBar } from "../components/HeaderBar";
import { computeQuestionPhases } from "../utils/timing";

interface QuestionSceneProps {
  question: Question;
  imageSrc: string;
  funFactImageSrc?: string;
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
  const { width, height } = useVideoConfig();
  const isVertical = height > width;

  const phases = computeQuestionPhases(question);
  
  const inShow = frame < phases.countdown;
  const inCountdown = frame >= phases.countdown && frame < phases.drumRoll;
  const inDrumRoll = frame >= phases.drumRoll && frame < phases.reveal;
  const inReveal = frame >= phases.reveal && frame < phases.transition;
  const inTransition = frame >= phases.transition && frame < phases.end;
  
  // Reveal'ı 2 alt-faza böl:
  // İlk %30: "CORRECT! [cevap]" göster
  // Son %70: Fun fact + fun fact görseli (Canva mock'a göre)
  const revealDuration = phases.transition - phases.reveal;
  const revealCorrectEnd = phases.reveal + Math.floor(revealDuration * 0.30);
  const inRevealCorrect = inReveal && frame < revealCorrectEnd;
  const inRevealFunFact = inReveal && frame >= revealCorrectEnd;
  
  let currentJessPose: keyof JessPoses = "question";
  if (inShow) currentJessPose = "question";
  else if (inCountdown || inDrumRoll) currentJessPose = "thinking";
  else if (inReveal) currentJessPose = "correct";

  const fadeOut = inTransition
    ? interpolate(frame - phases.transition, [0, FIXED_FRAMES.transition], [1, 0.3], { extrapolateRight: "clamp" })
    : 1;

  const tickStartFrame = phases.drumRoll - (2 * FPS);
  const logoSrc = jessPoses.logo as string | undefined;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.bgGradientStart} 0%, ${COLORS.bgGradientEnd} 100%)`,
        opacity: fadeOut,
      }}
    >
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
      {sfx_tick && (
        <Sequence from={tickStartFrame} durationInFrames={2 * FPS}>
          <Audio src={staticFile(sfx_tick)} volume={1.0} loop />
        </Sequence>
      )}
      {sfx_drum && (
        <Sequence from={phases.drumRoll} durationInFrames={FIXED_FRAMES.drumRoll}>
          <Audio src={staticFile(sfx_drum)} volume={1.0} />
        </Sequence>
      )}
      {sfx_correct && (
        <Sequence from={phases.reveal} durationInFrames={2 * FPS}>
          <Audio src={staticFile(sfx_correct)} volume={1.0} />
        </Sequence>
      )}
      {sfx_whoosh && (
        <Sequence from={phases.transition} durationInFrames={FIXED_FRAMES.transition}>
          <Audio src={staticFile(sfx_whoosh)} volume={0.7} />
        </Sequence>
      )}

      {/* HEADER */}
      <HeaderBar
        channelName={channelName}
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        height={isVertical ? 100 : 110}
        logoSrc={logoSrc}
      />

      {/* LAYOUT - format'a göre AYRI render */}
      {isVertical ? (
        <ShortsLayout
          question={question}
          imageSrc={imageSrc}
          funFactImageSrc={funFactImageSrc}
          inShow={inShow}
          inCountdown={inCountdown}
          inDrumRoll={inDrumRoll}
          inRevealCorrect={inRevealCorrect}
          inRevealFunFact={inRevealFunFact}
          phases={phases}
          revealCorrectEnd={revealCorrectEnd}
          width={width}
          height={height}
        />
      ) : (
        <LongLayout
          question={question}
          imageSrc={imageSrc}
          funFactImageSrc={funFactImageSrc}
          inShow={inShow}
          inCountdown={inCountdown}
          inDrumRoll={inDrumRoll}
          inRevealCorrect={inRevealCorrect}
          inRevealFunFact={inRevealFunFact}
          phases={phases}
          revealCorrectEnd={revealCorrectEnd}
          width={width}
          height={height}
        />
      )}

      {/* DRUM ROLL: büyük yanıp sönen "?" */}
      {inDrumRoll && <BigQuestionMark startFrame={phases.drumRoll} />}

      {/* JESS - ALT ORTA */}
      <JessCharacter
        pose={currentJessPose}
        poses={jessPoses}
        position="bottom-center"
        size={isVertical ? 380 : 320}
        animate
      />
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════
// SHORTS LAYOUT (9:16 dikey)
// ═══════════════════════════════════════════════════
const ShortsLayout: React.FC<any> = ({
  question, imageSrc, funFactImageSrc,
  inShow, inCountdown, inDrumRoll, inRevealCorrect, inRevealFunFact,
  phases, revealCorrectEnd, width, height,
}) => {
  const imageWidth = width - 80;
  const imageHeight = Math.min(720, Math.floor((width - 80) * 0.55));

  return (
    <>
      {/* SHOW/COUNTDOWN/DRUMROLL/CORRECT: question image */}
      {(inShow || inCountdown || inDrumRoll || inRevealCorrect) && (
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 40,
            right: 40,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <ImageFrame src={imageSrc} width={imageWidth} height={imageHeight} color="primary" />

          {(inShow || inCountdown) && (
            <>
              <QuestionTextBlock text={question.question_text} showFrame={phases.show} isCompact />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <AnswerBoxNew letter="A" text={question.options[0]} flag={question.option_flags?.[0]} showFrame={phases.show + 15} />
                <AnswerBoxNew letter="B" text={question.options[1]} flag={question.option_flags?.[1]} showFrame={phases.show + 22} />
                <AnswerBoxNew letter="C" text={question.options[2]} flag={question.option_flags?.[2]} showFrame={phases.show + 29} />
                <AnswerBoxNew letter="D" text={question.options[3]} flag={question.option_flags?.[3]} showFrame={phases.show + 36} />
              </div>
            </>
          )}

          {inRevealCorrect && (
            <CorrectBanner
              letter={["A", "B", "C", "D"][question.correct_answer]}
              text={question.options[question.correct_answer]}
              flag={question.option_flags?.[question.correct_answer]}
              showFrame={phases.reveal}
            />
          )}
        </div>
      )}

      {/* FUN FACT REVEAL - üst görsel + ampul + alt metin */}
      {inRevealFunFact && (
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 40,
            right: 40,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Fun fact görseli */}
          {funFactImageSrc && (
            <FunFactImage
              src={funFactImageSrc}
              showFrame={revealCorrectEnd}
              width={imageWidth}
              height={imageHeight}
            />
          )}
          
          {/* Ampul ikonu - büyük */}
          <BulbIcon showFrame={revealCorrectEnd + 5} size={120} />
          
          {/* Fun fact metni - Canva mock'a benzer kutu */}
          {question.fun_fact && (
            <FunFactBox text={question.fun_fact} showFrame={revealCorrectEnd + 10} />
          )}
        </div>
      )}

      {/* COUNTDOWN sağ-üst */}
      {inCountdown && (
        <>
          <div style={{ position: "absolute", left: 40, right: 40, bottom: 420, zIndex: 9 }}>
            <CountdownTimer
              startFrame={phases.countdown}
              durationFrames={FIXED_FRAMES.countdown}
              width="100%"
              showNumber={false}
            />
          </div>
          <BigCountdownNumberCorner
            startFrame={phases.countdown}
            durationFrames={FIXED_FRAMES.countdown}
          />
        </>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════
// LONG LAYOUT (16:9 yatay) - Canva mock'a tam uyumlu
// ═══════════════════════════════════════════════════
const LongLayout: React.FC<any> = ({
  question, imageSrc, funFactImageSrc,
  inShow, inCountdown, inDrumRoll, inRevealCorrect, inRevealFunFact,
  phases, revealCorrectEnd, width, height,
}) => {
  // Header: 0-110, Body: 110-1080, padding 30
  const bodyTop = 130;
  const bodyBottom = 60;
  const bodyHeight = height - bodyTop - bodyBottom;
  
  // SHOW/COUNTDOWN/DRUMROLL: Sol görsel + Sağ soru/cevaplar
  // REVEAL FUN FACT: Sol BÜYÜK görsel + Sağ ampul + Sağ alt metin (Canva mock)
  const leftWidth = Math.floor(width * 0.55) - 60;
  const rightWidth = width - leftWidth - 100;
  const leftImageHeight = Math.floor(bodyHeight * 0.85);

  return (
    <div
      style={{
        position: "absolute",
        top: bodyTop,
        left: 40,
        right: 40,
        bottom: bodyBottom,
        display: "flex",
        gap: 40,
      }}
    >
      {/* SOL: GÖRSEL */}
      <div
        style={{
          width: leftWidth,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        {/* Show fazlarında question görseli, fun fact fazında fun fact görseli */}
        {(inShow || inCountdown || inDrumRoll || inRevealCorrect) && (
          <ImageFrame src={imageSrc} width={leftWidth} height={leftImageHeight} color="primary" />
        )}
        {inRevealFunFact && funFactImageSrc && (
          <FunFactImage src={funFactImageSrc} showFrame={revealCorrectEnd} width={leftWidth} height={leftImageHeight} />
        )}
      </div>

      {/* SAĞ: SORU + CEVAPLAR | YA DA FUN FACT */}
      <div
        style={{
          width: rightWidth,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          justifyContent: "center",
        }}
      >
        {/* Show + Countdown: soru + cevaplar */}
        {(inShow || inCountdown) && (
          <>
            <QuestionTextBlock text={question.question_text} showFrame={phases.show} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AnswerBoxNew letter="A" text={question.options[0]} flag={question.option_flags?.[0]} showFrame={phases.show + 15} large />
              <AnswerBoxNew letter="B" text={question.options[1]} flag={question.option_flags?.[1]} showFrame={phases.show + 22} large />
              <AnswerBoxNew letter="C" text={question.options[2]} flag={question.option_flags?.[2]} showFrame={phases.show + 29} large />
              <AnswerBoxNew letter="D" text={question.options[3]} flag={question.option_flags?.[3]} showFrame={phases.show + 36} large />
            </div>
            {inCountdown && (
              <div style={{ marginTop: 10 }}>
                <CountdownTimer
                  startFrame={phases.countdown}
                  durationFrames={FIXED_FRAMES.countdown}
                  width="100%"
                  showNumber={false}
                />
              </div>
            )}
          </>
        )}

        {/* RevealCorrect: CORRECT! banner */}
        {inRevealCorrect && (
          <CorrectBanner
            letter={["A", "B", "C", "D"][question.correct_answer]}
            text={question.options[question.correct_answer]}
            flag={question.option_flags?.[question.correct_answer]}
            showFrame={phases.reveal}
          />
        )}

        {/* RevealFunFact: Ampul + Did You Know metni */}
        {inRevealFunFact && (
          <>
            <BulbIcon showFrame={revealCorrectEnd} size={140} alignSelf="flex-start" />
            {question.fun_fact && (
              <FunFactBox text={question.fun_fact} showFrame={revealCorrectEnd + 10} />
            )}
          </>
        )}
      </div>

      {/* Countdown number - sağ-üst dış katmanda */}
      {inCountdown && (
        <BigCountdownNumberCorner
          startFrame={phases.countdown}
          durationFrames={FIXED_FRAMES.countdown}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// ALT KOMPONENTLER
// ═══════════════════════════════════════════════════

const ImageFrame: React.FC<{ src: string; width: number; height: number; color?: "primary" | "accent" }> = ({
  src, width, height, color = "primary",
}) => (
  <div
    style={{
      width,
      height,
      borderRadius: 24,
      overflow: "hidden",
      border: `8px solid ${color === "primary" ? COLORS.primary : COLORS.accent}`,
      boxShadow: `0 12px 32px rgba(0,0,0,0.5), 0 0 20px ${color === "primary" ? COLORS.primary : COLORS.accent}`,
      backgroundColor: COLORS.textBlack,
    }}
  >
    <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  </div>
);

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
          fontSize: isCompact ? 50 : 46,
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

// ANSWER BOX - bayrak emoji desteği
const AnswerBoxNew: React.FC<{
  letter: string;
  text: string;
  flag?: string;
  showFrame: number;
  large?: boolean;
}> = ({ letter, text, flag, showFrame, large }) => {
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
        padding: large ? "18px 26px" : "16px 22px",
        backgroundColor: "rgba(40, 20, 80, 0.45)",
        borderRadius: 50,
        border: `3px solid ${COLORS.primary}`,
        opacity,
        transform: `translateX(${translateX}px)`,
        width: "100%",
      }}
    >
      {/* Harf rozeti */}
      <div
        style={{
          minWidth: large ? 52 : 44,
          height: large ? 52 : 44,
          backgroundColor: COLORS.primary,
          color: COLORS.textBlack,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: large ? 28 : 26,
          fontFamily: FONTS.display,
          fontWeight: 900,
          border: "3px solid black",
          flexShrink: 0,
        }}
      >
        {letter}
      </div>
      
      {/* Bayrak (varsa) */}
      {flag && flag.trim().length > 0 && (
        <div
          style={{
            fontSize: large ? 44 : 38,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {flag}
        </div>
      )}
      
      {/* Metin */}
      <div
        style={{
          fontSize: large ? 32 : 30,
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

const CorrectBanner: React.FC<{
  letter: string;
  text: string;
  flag?: string;
  showFrame: number;
}> = ({ letter, text, flag, showFrame }) => {
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
        {flag && flag.trim().length > 0 && (
          <span style={{ fontSize: 60 }}>{flag}</span>
        )}
        <span>{text}</span>
      </div>
    </div>
  );
};

// FUN FACT GÖRSELİ
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
        border: `8px solid ${COLORS.primary}`,
        boxShadow: `0 12px 32px rgba(0,0,0,0.5), 0 0 30px ${COLORS.primary}`,
      }}
    >
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
};

// AMPUL İKONU (Canva mock'undaki gibi)
const BulbIcon: React.FC<{
  showFrame: number;
  size?: number;
  alignSelf?: string;
}> = ({ showFrame, size = 140, alignSelf }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });
  const scale = interpolate(enterAnim, [0, 1], [0, 1]);
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  // Hafif yanıp sönme
  const glow = 0.8 + Math.abs(Math.sin(frame * 0.15)) * 0.2;
  
  return (
    <div
      style={{
        fontSize: size,
        transform: `scale(${scale})`,
        opacity,
        textAlign: "center",
        lineHeight: 1,
        filter: `drop-shadow(0 0 ${20 * glow}px ${COLORS.primary})`,
        alignSelf: alignSelf as any,
      }}
    >
      💡
    </div>
  );
};

// FUN FACT KUTUSU (Canva mock'undaki gibi mor kutu)
const FunFactBox: React.FC<{
  text: string;
  showFrame: number;
}> = ({ text, showFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  const translateY = interpolate(enterAnim, [0, 1], [30, 0]);
  
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        backgroundColor: COLORS.accent,
        borderRadius: 20,
        padding: "28px 32px",
        border: `5px solid ${COLORS.primary}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          fontSize: 38,
          fontFamily: FONTS.display,
          fontWeight: 400,
          color: COLORS.textWhite,
          textShadow: "3px 3px 4px rgba(0,0,0,0.5)",
          lineHeight: 1.25,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// COUNTDOWN sağ-üst köşede daire
const BigCountdownNumberCorner: React.FC<{
  startFrame: number;
  durationFrames: number;
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
        top: 140,
        zIndex: 25,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 160,
          height: 160,
          backgroundColor: "rgba(0,0,0,0.7)",
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
