import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { COLORS, FONTS, FRAMES } from "../styles/theme";
import { Question, JessPoses } from "../types/schemas";
import { JessCharacter } from "../components/JessCharacter";
import { AnswerBox } from "../components/AnswerBox";
import { CountdownTimer } from "../components/CountdownTimer";
import { QuestionImage } from "../components/QuestionImage";
import { FunFactBanner } from "../components/FunFactBanner";
import { HeaderBar } from "../components/HeaderBar";
import { QUESTION_PHASE_FRAMES } from "../utils/timing";

interface QuestionSceneProps {
  question: Question;
  imageSrc: string; // Bu sorunun görseli (Drive'dan indirildi, staticFile path)
  questionNumber: number;
  totalQuestions: number;
  jessPoses: JessPoses;
  channelName: string;
}

export const QuestionScene: React.FC<QuestionSceneProps> = ({
  question,
  imageSrc,
  questionNumber,
  totalQuestions,
  jessPoses,
  channelName,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const isVertical = height > width;

  // Faz başlangıç frame'leri (relatif - 0'dan başlar)
  const phases = QUESTION_PHASE_FRAMES;
  
  // Hangi fazdayız?
  const inShow = frame < phases.countdown;
  const inCountdown = frame >= phases.countdown && frame < phases.drumRoll;
  const inDrumRoll = frame >= phases.drumRoll && frame < phases.reveal;
  const inReveal = frame >= phases.reveal && frame < phases.funFact;
  const inFunFact = frame >= phases.funFact && frame < phases.transition;
  const inTransition = frame >= phases.transition && frame < phases.rest;
  
  // Jess pose kontrolü
  let currentJessPose: keyof JessPoses = "question";
  if (inShow) currentJessPose = "question";
  else if (inCountdown || inDrumRoll) currentJessPose = "thinking";
  else if (inReveal || inFunFact) currentJessPose = "correct";

  // Transition fade-out (son saniyelerde)
  const fadeOut = inTransition
    ? interpolate(
        frame - phases.transition,
        [0, FRAMES.transition],
        [1, 0.3],
        { extrapolateRight: "clamp" }
      )
    : 1;

  // Görsel ve soru metni layout farkları
  const imageWidth = isVertical
    ? width - 80
    : Math.floor(width * 0.42);
  const imageHeight = isVertical
    ? Math.floor((width - 80) * 0.75)
    : Math.floor(height * 0.5);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.bgGradientStart} 0%, ${COLORS.bgGradientEnd} 100%)`,
        opacity: fadeOut,
      }}
    >
      {/* Header */}
      <HeaderBar
        channelName={channelName}
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        height={isVertical ? 90 : 110}
      />

      {/* Ana içerik - yatay layout */}
      {!isVertical && (
        <div
          style={{
            position: "absolute",
            top: 130,
            left: 40,
            right: 40,
            bottom: 60,
            display: "flex",
            gap: 50,
          }}
        >
          {/* Sol: görsel + soru metni */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 30,
            }}
          >
            <QuestionImage
              src={imageSrc}
              showFrame={phases.show}
              width={imageWidth}
              height={imageHeight}
            />
            <QuestionTextBlock
              text={question.question_text}
              showFrame={phases.show}
              maxWidth={imageWidth}
            />
          </div>

          {/* Sağ: 4 cevap kutusu + timer */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 24,
              justifyContent: "center",
              maxWidth: 800,
            }}
          >
            {/* Reveal'dan önce kutular göster */}
            {!inReveal && !inFunFact && !inTransition && (
              <>
                <AnswerBox letter="A" text={question.options[0]} isCorrect={question.correct_answer === 0} showFrame={phases.show} revealFrame={phases.reveal} index={0} layout="horizontal" />
                <AnswerBox letter="B" text={question.options[1]} isCorrect={question.correct_answer === 1} showFrame={phases.show} revealFrame={phases.reveal} index={1} layout="horizontal" />
                <AnswerBox letter="C" text={question.options[2]} isCorrect={question.correct_answer === 2} showFrame={phases.show} revealFrame={phases.reveal} index={2} layout="horizontal" />
                <AnswerBox letter="D" text={question.options[3]} isCorrect={question.correct_answer === 3} showFrame={phases.show} revealFrame={phases.reveal} index={3} layout="horizontal" />
              </>
            )}

            {/* Reveal sırasında sadece doğru cevap büyük göster */}
            {(inReveal || inFunFact) && (
              <CorrectAnswerHighlight
                letter={["A", "B", "C", "D"][question.correct_answer]}
                text={question.options[question.correct_answer]}
                showFrame={phases.reveal}
              />
            )}

            {/* Timer (countdown fazı) */}
            {inCountdown && (
              <div style={{ marginTop: 30 }}>
                <CountdownTimer
                  startFrame={phases.countdown}
                  durationFrames={FRAMES.countdown}
                  width="100%"
                  showNumber={false}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ana içerik - dikey layout (shorts) */}
      {isVertical && (
        <div
          style={{
            position: "absolute",
            top: 110,
            left: 40,
            right: 40,
            bottom: 40,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <QuestionImage
            src={imageSrc}
            showFrame={phases.show}
            width={imageWidth}
            height={imageHeight}
          />
          <QuestionTextBlock
            text={question.question_text}
            showFrame={phases.show}
            maxWidth="100%"
            isCompact
          />

          {!inReveal && !inFunFact && !inTransition && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
              <AnswerBox letter="A" text={question.options[0]} isCorrect={question.correct_answer === 0} showFrame={phases.show} revealFrame={phases.reveal} index={0} layout="vertical" />
              <AnswerBox letter="B" text={question.options[1]} isCorrect={question.correct_answer === 1} showFrame={phases.show} revealFrame={phases.reveal} index={1} layout="vertical" />
              <AnswerBox letter="C" text={question.options[2]} isCorrect={question.correct_answer === 2} showFrame={phases.show} revealFrame={phases.reveal} index={2} layout="vertical" />
              <AnswerBox letter="D" text={question.options[3]} isCorrect={question.correct_answer === 3} showFrame={phases.show} revealFrame={phases.reveal} index={3} layout="vertical" />
              {inCountdown && (
                <CountdownTimer
                  startFrame={phases.countdown}
                  durationFrames={FRAMES.countdown}
                  width="100%"
                  showNumber={false}
                />
              )}
            </div>
          )}

          {(inReveal || inFunFact) && (
            <CorrectAnswerHighlight
              letter={["A", "B", "C", "D"][question.correct_answer]}
              text={question.options[question.correct_answer]}
              showFrame={phases.reveal}
            />
          )}
        </div>
      )}

      {/* Drum roll metni - ortada büyük */}
      {inDrumRoll && (
        <DrumRollBanner startFrame={phases.drumRoll} />
      )}

      {/* Büyük geri sayım numarası - ortada */}
      {inCountdown && (
        <BigCountdownNumber
          startFrame={phases.countdown}
          durationFrames={FRAMES.countdown}
        />
      )}

      {/* Fun fact (funFact fazı) */}
      {inFunFact && question.fun_fact && (
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? 120 : 80,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            zIndex: 15,
          }}
        >
          <FunFactBanner
            text={question.fun_fact}
            showFrame={phases.funFact}
            width={isVertical ? "92%" : "80%"}
          />
        </div>
      )}

      {/* Jess karakter */}
      <JessCharacter
        pose={currentJessPose}
        poses={jessPoses}
        position={isVertical ? "bottom-right" : "bottom-right"}
        size={isVertical ? 220 : 280}
        animate
      />
    </AbsoluteFill>
  );
};

// ────────── Yardımcı alt komponentler ──────────

const QuestionTextBlock: React.FC<{
  text: string;
  showFrame: number;
  maxWidth: number | string;
  isCompact?: boolean;
}> = ({ text, showFrame, maxWidth, isCompact }) => {
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
        maxWidth,
        opacity,
        transform: `translateY(${translateY}px)`,
        backgroundColor: "rgba(0,0,0,0.7)",
        borderRadius: 16,
        padding: isCompact ? "14px 24px" : "20px 32px",
        border: `4px solid ${COLORS.primary}`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: isCompact ? 38 : 44,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: COLORS.textWhite,
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
          lineHeight: 1.2,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const BigCountdownNumber: React.FC<{
  startFrame: number;
  durationFrames: number;
}> = ({ startFrame, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  const elapsed = frame - startFrame;
  const remainingSeconds = Math.max(1, Math.ceil((durationFrames - elapsed) / fps));
  
  // Her saniyenin başında pulse
  const secondInTime = elapsed % fps;
  const pulse = secondInTime < 6
    ? interpolate(secondInTime, [0, 6], [1.8, 1.0])
    : 1.0;
  
  const isDanger = remainingSeconds <= 2;
  const color = isDanger ? COLORS.timerFillDanger : COLORS.primary;

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
          fontSize: Math.min(width, height) * 0.35,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color,
          textShadow: `
            -8px -8px 0 black,
            8px -8px 0 black,
            -8px 8px 0 black,
            8px 8px 0 black,
            0 0 50px ${color}
          `,
          lineHeight: 1,
          transform: `scale(${pulse})`,
          opacity: 0.85,
        }}
      >
        {remainingSeconds}
      </div>
    </div>
  );
};

const DrumRollBanner: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Sallanma animasyonu
  const shake = Math.sin(frame * 0.8) * 5;
  
  const enterAnim = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });
  const scale = interpolate(enterAnim, [0, 1], [0.5, 1]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "40%",
        display: "flex",
        justifyContent: "center",
        zIndex: 15,
      }}
    >
      <div
        style={{
          fontSize: 100,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: COLORS.primary,
          textShadow: `
            -5px -5px 0 black,
            5px -5px 0 black,
            -5px 5px 0 black,
            5px 5px 0 black
          `,
          transform: `translate(${shake}px, ${-shake}px) scale(${scale})`,
        }}
      >
        🥁 Drumroll... 🥁
      </div>
    </div>
  );
};

const CorrectAnswerHighlight: React.FC<{
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
  const rotation = interpolate(enterAnim, [0, 1], [-15, 0]);
  
  // Pulsing glow
  const glowIntensity = 30 + Math.sin(frame * 0.2) * 20;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        transform: `scale(${scale}) rotate(${rotation}deg)`,
        padding: 40,
      }}
    >
      <div
        style={{
          fontSize: 50,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: COLORS.primary,
          textShadow: "3px 3px 0 black",
        }}
      >
        ✅ CORRECT!
      </div>
      <div
        style={{
          fontSize: 80,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: COLORS.textWhite,
          backgroundColor: COLORS.correctGreen,
          padding: "30px 60px",
          borderRadius: 30,
          border: "6px solid black",
          boxShadow: `0 0 ${glowIntensity}px ${COLORS.correctGreen}, 0 8px 24px rgba(0,0,0,0.4)`,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <span style={{ fontSize: 100 }}>{letter}</span>
        <span>{text}</span>
      </div>
    </div>
  );
};
