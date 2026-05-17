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
} from "remotion";
import { COLORS, FONTS, FIXED_FRAMES, FPS } from "../styles/theme";
import { Question, JessPoses } from "../types/schemas";
import { JessCharacter } from "../components/JessCharacter";
import { AnswerBox } from "../components/AnswerBox";
import { CountdownTimer } from "../components/CountdownTimer";
import { QuestionImage } from "../components/QuestionImage";
import { FunFactBanner } from "../components/FunFactBanner";
import { HeaderBar } from "../components/HeaderBar";
import { computeQuestionPhases } from "../utils/timing";

interface QuestionSceneProps {
  question: Question;
  imageSrc: string;
  questionNumber: number;
  totalQuestions: number;
  jessPoses: JessPoses;
  channelName: string;
  // SFX dosya yolları (opsiyonel)
  sfx_tick?: string;
  sfx_drum?: string;
  sfx_correct?: string;
  sfx_whoosh?: string;
}

export const QuestionScene: React.FC<QuestionSceneProps> = ({
  question,
  imageSrc,
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

  // DİNAMİK faz frame'leri
  const phases = computeQuestionPhases(question);
  
  // Faz testleri
  const inShow = frame < phases.countdown;
  const inCountdown = frame >= phases.countdown && frame < phases.drumRoll;
  const inDrumRoll = frame >= phases.drumRoll && frame < phases.reveal;
  const inReveal = frame >= phases.reveal && frame < phases.transition;
  const inTransition = frame >= phases.transition && frame < phases.end;
  
  // Jess pose
  let currentJessPose: keyof JessPoses = "question";
  if (inShow) currentJessPose = "question";
  else if (inCountdown || inDrumRoll) currentJessPose = "thinking";
  else if (inReveal) currentJessPose = "correct";

  const fadeOut = inTransition
    ? interpolate(
        frame - phases.transition,
        [0, FIXED_FRAMES.transition],
        [1, 0.3],
        { extrapolateRight: "clamp" }
      )
    : 1;

  // Görsel boyutları
  const imageWidth = isVertical
    ? width - 80
    : Math.floor(width * 0.42);
  const imageHeight = isVertical
    ? Math.floor((width - 80) * 0.62)
    : Math.floor(height * 0.5);

  // ─── SFX zamanlamaları ───
  // Tick: son 2 saniye (countdown sonunun son 2sn'si)
  const tickStartFrame = phases.drumRoll - (2 * FPS); // 5sn countdown'ın son 2sn'si

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.bgGradientStart} 0%, ${COLORS.bgGradientEnd} 100%)`,
        opacity: fadeOut,
      }}
    >
      {/* Audio: Question text (show fazı boyunca) */}
      {question.question_audio_path && (
        <Sequence from={phases.show} durationInFrames={phases.countdown - phases.show}>
          <Audio src={staticFile(question.question_audio_path)} volume={1.2} />
        </Sequence>
      )}
      
      {/* Audio: Answer text (reveal fazı boyunca) */}
      {question.answer_audio_path && (
        <Sequence from={phases.reveal} durationInFrames={phases.transition - phases.reveal}>
          <Audio src={staticFile(question.answer_audio_path)} volume={1.2} />
        </Sequence>
      )}

      {/* SFX: Tick - son 2 saniye (countdown'ın son 2sn'si) */}
      {sfx_tick && (
        <Sequence from={tickStartFrame} durationInFrames={2 * FPS}>
          <Audio src={staticFile(sfx_tick)} volume={0.6} loop />
        </Sequence>
      )}

      {/* SFX: Drum roll - drum roll fazı boyunca */}
      {sfx_drum && (
        <Sequence from={phases.drumRoll} durationInFrames={FIXED_FRAMES.drumRoll}>
          <Audio src={staticFile(sfx_drum)} volume={0.7} />
        </Sequence>
      )}

      {/* SFX: Correct answer - reveal başlangıcında */}
      {sfx_correct && (
        <Sequence from={phases.reveal} durationInFrames={2 * FPS}>
          <Audio src={staticFile(sfx_correct)} volume={0.7} />
        </Sequence>
      )}

      {/* SFX: Whoosh - transition */}
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

      {/* YATAY LAYOUT (long video) */}
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
            {!inReveal && !inDrumRoll && (
              <QuestionTextBlock
                text={question.question_text}
                showFrame={phases.show}
                maxWidth={imageWidth}
              />
            )}
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 26,
              justifyContent: "center",
              maxWidth: 800,
            }}
          >
            {(inShow || inCountdown) && (
              <>
                <AnswerBox letter="A" text={question.options[0]} isCorrect={question.correct_answer === 0} showFrame={phases.show + 15} revealFrame={phases.reveal} index={0} layout="horizontal" />
                <AnswerBox letter="B" text={question.options[1]} isCorrect={question.correct_answer === 1} showFrame={phases.show + 15} revealFrame={phases.reveal} index={1} layout="horizontal" />
                <AnswerBox letter="C" text={question.options[2]} isCorrect={question.correct_answer === 2} showFrame={phases.show + 15} revealFrame={phases.reveal} index={2} layout="horizontal" />
                <AnswerBox letter="D" text={question.options[3]} isCorrect={question.correct_answer === 3} showFrame={phases.show + 15} revealFrame={phases.reveal} index={3} layout="horizontal" />
              </>
            )}

            {inReveal && (
              <CorrectAnswerHighlight
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

      {/* DİKEY LAYOUT (shorts) */}
      {isVertical && (
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 40,
            right: 40,
            bottom: 380, // Jess için altta yer bırak (320px Jess + boşluk)
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
          
          {/* Soru metni - drumroll ve reveal'da gizli */}
          {(inShow || inCountdown) && (
            <QuestionTextBlock
              text={question.question_text}
              showFrame={phases.show}
              maxWidth="100%"
              isCompact
            />
          )}

          {(inShow || inCountdown) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
              <AnswerBox letter="A" text={question.options[0]} isCorrect={question.correct_answer === 0} showFrame={phases.show + 15} revealFrame={phases.reveal} index={0} layout="vertical" />
              <AnswerBox letter="B" text={question.options[1]} isCorrect={question.correct_answer === 1} showFrame={phases.show + 15} revealFrame={phases.reveal} index={1} layout="vertical" />
              <AnswerBox letter="C" text={question.options[2]} isCorrect={question.correct_answer === 2} showFrame={phases.show + 15} revealFrame={phases.reveal} index={2} layout="vertical" />
              <AnswerBox letter="D" text={question.options[3]} isCorrect={question.correct_answer === 3} showFrame={phases.show + 15} revealFrame={phases.reveal} index={3} layout="vertical" />
              {inCountdown && (
                <CountdownTimer
                  startFrame={phases.countdown}
                  durationFrames={FIXED_FRAMES.countdown}
                  width="100%"
                  showNumber={false}
                />
              )}
            </div>
          )}

          {inReveal && (
            <CorrectAnswerHighlight
              letter={["A", "B", "C", "D"][question.correct_answer]}
              text={question.options[question.correct_answer]}
              showFrame={phases.reveal}
            />
          )}
        </div>
      )}

      {/* Drum roll fazı - SADECE büyük yanıp sönen "?" işareti, metin YOK */}
      {inDrumRoll && (
        <BigQuestionMark startFrame={phases.drumRoll} />
      )}

      {/* Büyük geri sayım numarası */}
      {inCountdown && (
        <BigCountdownNumber
          startFrame={phases.countdown}
          durationFrames={FIXED_FRAMES.countdown}
        />
      )}

      {/* Fun fact - reveal fazında, SOL-ÜST'te (Jess'i kapatmıyacak) */}
      {inReveal && question.fun_fact && (
        <div
          style={{
            position: "absolute",
            top: isVertical ? 700 : 200,  // Üst kısımda, image'in altında
            left: isVertical ? 30 : 50,
            right: isVertical ? 30 : "50%", // Sağ yarısı boş (Jess oraya gelecek)
            display: "flex",
            justifyContent: "center",
            zIndex: 15,
          }}
        >
          <FunFactBanner
            text={question.fun_fact}
            showFrame={phases.reveal + 30}
            width="100%"
          />
        </div>
      )}

      {/* Jess karakter - SAĞ ALT, BÜYÜK (320px) */}
      <JessCharacter
        pose={currentJessPose}
        poses={jessPoses}
        position="bottom-right"
        size={isVertical ? 320 : 360}
        animate
      />
    </AbsoluteFill>
  );
};

// ────────── Alt komponentler ──────────

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
        backgroundColor: "rgba(0,0,0,0.75)",
        borderRadius: 18,
        padding: isCompact ? "18px 28px" : "24px 36px",
        border: `5px solid ${COLORS.primary}`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: isCompact ? 48 : 54,  // BÜYÜTÜLDÜ
          fontFamily: FONTS.display,
          fontWeight: 400,  // Lilita One zaten kalın
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

const BigCountdownNumber: React.FC<{
  startFrame: number;
  durationFrames: number;
}> = ({ startFrame, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  const elapsed = frame - startFrame;
  const remainingSeconds = Math.max(1, Math.ceil((durationFrames - elapsed) / fps));
  
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
          fontFamily: '"Lilita One", "Fredoka", Arial Black, sans-serif',
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
          opacity: 0.92,
        }}
      >
        {remainingSeconds}
      </div>
    </div>
  );
};

// Drumroll yerine sadece yanıp sönen büyük "?" — METİN YOK
const BigQuestionMark: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  const enterAnim = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });
  const scale = interpolate(enterAnim, [0, 1], [0.3, 1]);
  
  // Yanıp sön (saniyede 4 kez)
  const blink = 0.7 + Math.abs(Math.sin(frame * 0.6)) * 0.3;
  
  // Hafif sallanma
  const shake = Math.sin(frame * 0.8) * 5;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "35%",
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
  
  const glowIntensity = 30 + Math.sin(frame * 0.2) * 20;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        transform: `scale(${scale}) rotate(${rotation}deg)`,
        padding: 40,
      }}
    >
      <div
        style={{
          fontSize: 60,
          fontFamily: FONTS.display,
          fontWeight: 400,
          color: COLORS.primary,
          textShadow: "4px 4px 0 black",
          letterSpacing: 2,
        }}
      >
        ✅ CORRECT!
      </div>
      <div
        style={{
          fontSize: 70,
          fontFamily: FONTS.display,
          fontWeight: 400,
          color: COLORS.textWhite,
          backgroundColor: COLORS.correctGreen,
          padding: "26px 48px",
          borderRadius: 30,
          border: "6px solid black",
          boxShadow: `0 0 ${glowIntensity}px ${COLORS.correctGreen}, 0 8px 24px rgba(0,0,0,0.4)`,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <span style={{ fontSize: 90 }}>{letter}</span>
        <span>{text}</span>
      </div>
    </div>
  );
};
