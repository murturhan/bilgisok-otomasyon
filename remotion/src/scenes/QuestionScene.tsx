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
  const inDrumRoll = frame >= phases.drumRoll && frame < phases.silentPause;  // sadece drum çalıyor
  const inSilentPause = frame >= phases.silentPause && frame < phases.reveal; // sessiz gerilim
  const inRevealCorrect = frame >= phases.reveal && frame < phases.funFact;
  const inFunFact = frame >= phases.funFact && frame < phases.end;
  const inTransition = frame >= phases.transition && frame < phases.end;
  
  const isRevealed = frame >= phases.reveal;
  
  let currentJessPose: keyof JessPoses = "question";
  if (inCountdown || inDrumRoll || inSilentPause) currentJessPose = "thinking";
  else if (inRevealCorrect) currentJessPose = "correct";
  
  // GÜÇLENDİRİLMİŞ TRANSITION (0.5s = 15 frame)
  // - Frame 0-5: flash 0→0.95 (güçlü parlama)
  // - Frame 5-15: flash 0.95→0
  // - SAHNE SOLA KAYAR (slide-out): translateX 0 → -width
  // - Blur 0→8 (hareket bulanıklığı)
  // - Hafif scale küçülmesi (uzaklaşıyor hissi)
  // Yeni sahne otomatik sağdan slide-in eder (her sahnenin başında enter spring zaten var)
  const transitionLocalFrame = frame - phases.transition;
  const TR_LEN = FIXED_FRAMES.transition;
  
  const flashOpacity = inTransition
    ? interpolate(
        transitionLocalFrame,
        [0, 5, TR_LEN],
        [0, 0.95, 0],
        { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
      )
    : 0;
  
  // SLIDE-OUT: sahne sola kayar (sağdan yeni sahne gelir)
  const slideOutX = inTransition
    ? interpolate(
        transitionLocalFrame,
        [0, TR_LEN],
        [0, -120],   // %120 sola (tamamen ekrandan çıkar)
        { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
      )
    : 0;
  
  const sceneScale = inTransition
    ? interpolate(
        transitionLocalFrame,
        [0, TR_LEN],
        [1, 0.92],   // uzaklaşma hissi
        { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
      )
    : 1;
  
  const sceneBlur = inTransition
    ? interpolate(
        transitionLocalFrame,
        [0, TR_LEN],
        [0, 10],
        { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
      )
    : 0;
  
  const fadeOut = inTransition
    ? interpolate(
        frame - phases.transition,
        [0, TR_LEN * 0.5, TR_LEN],
        [1, 0.7, 0],
        { extrapolateRight: "clamp" }
      )
    : 1;
  
  // YENİ SAHNE ENTER (her soru sahnesinin başında sağdan gelir)
  // Sahne phase 0'da başlar, ilk 8 frame sağdan slide-in eder
  const ENTER_LEN = 8;
  const isEntering = frame < ENTER_LEN;
  const enterSlideX = isEntering
    ? interpolate(frame, [0, ENTER_LEN], [120, 0], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
      })
    : 0;
  const enterOpacity = isEntering
    ? interpolate(frame, [0, ENTER_LEN], [0, 1], { extrapolateRight: "clamp" })
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
    <AbsoluteFill style={{
      opacity: fadeOut * enterOpacity,
      transform: `translateX(${(slideOutX + enterSlideX)}%) scale(${sceneScale})`,
      filter: sceneBlur > 0 ? `blur(${sceneBlur}px)` : undefined,
    }}>
      <AnimatedBackground theme={theme} pattern={pattern} motionSpeed={1} />
      
      {/* AUDIO */}
      {question.question_audio_path && (
        <Sequence from={phases.show} durationInFrames={phases.countdown - phases.show}>
          <Audio src={staticFile(question.question_audio_path)} volume={1.4} />
        </Sequence>
      )}
      {question.answer_audio_path && (
        <Sequence from={phases.reveal} durationInFrames={phases.transition - phases.reveal}>
          <Audio src={staticFile(question.answer_audio_path)} volume={1.4} />
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
      {/* WHOOSH - güçlendirilmiş transition için biraz daha erken + yüksek volume */}
      {sfx_whoosh && (
        <Sequence
          from={Math.max(0, phases.transition - 3)}
          durationInFrames={FIXED_FRAMES.transition + 6}
        >
          <Audio src={staticFile(sfx_whoosh)} volume={0.85} />
        </Sequence>
      )}
      
      {/* HEADER - soru fazında BurstBadge, fact fazında DID YOU KNOW + yeşil pill */}
      <QuizHeader
        questionNumber={questionNumber}
        questionText={question.question_text}
        showFrame={phases.show}
        isVertical={isVertical}
        theme={theme}
        isFactMode={inFunFact}
        correctAnswerText={question.options[question.correct_answer]}
        factShowFrame={phases.funFact}
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
          inCountdown={inCountdown}
          inDrumRoll={inDrumRoll}
          inSilentPause={inSilentPause}
          localFrame={frame}
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
          localFrame={frame}
        />
      )}
      
      {/* PROGRESS BAR - sadece LONG'ta absolute, shorts'ta layout içinde */}
      {!isVertical && (inCountdown || inDrumRoll || inSilentPause) && (
        <div
          style={{
            position: "absolute",
            bottom: 80,
            left: 200,
            right: 200,
            zIndex: 20,
          }}
        >
          <LiquidProgressBar
            startFrame={phases.countdown}
            durationFrames={FIXED_FRAMES.countdown}
            height={60}
          />
        </div>
      )}
      
      {/* JESS - soru fazlarında, fun fact'te YOK */}
      {!inFunFact && (
        <JessCharacter
          pose={currentJessPose}
          poses={jessPoses}
          position="bottom-center"
          size={isVertical ? 230 : 280}
          animate
        />
      )}
      
      {/* TRANSITION FLASH - kısa beyaz parlama efekti, geçişler için */}
      {inTransition && (
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
  // Yeni: progress bar kontrolü için faz bilgileri
  inCountdown?: boolean;
  inDrumRoll?: boolean;
  inSilentPause?: boolean;
  /** Local frame (soru başlangıcından itibaren) - flu/fitil/burst hesabı için */
  localFrame: number;
}

const LongLayout: React.FC<LayoutProps> = ({
  question, imageSrc, funFactImageSrc, phases,
  inFunFact, isRevealed, revealImageTransition, width, height,
  localFrame,
}) => {
  const bodyTop = 345;  // long header 293 + 52 padding (resim biraz daha aşağı)
  const bodyBottom = 200;
  
  const colGap = 50;
  const leftWidth = Math.floor((width - 100 - colGap) * 0.5);
  const rightWidth = width - 100 - colGap - leftWidth;
  
  const imageHeight = Math.min(height - bodyTop - bodyBottom, 600);
  // Fact modunda alan 1/3 büyük (kullanıcı talebi)
  const factHeight = Math.min(height - bodyTop - bodyBottom, 800);
  
  // ─── FLU + FİTİL + KONFETI hesabı ───
  // Soru gösterilirken (countdown ve drumRoll) resim flu
  // Reveal anında flu kalkar + konfeti patlar
  const inActiveQuestion = localFrame >= phases.countdown && localFrame < phases.reveal;
  const blurAmount = (question.show_image !== false && inActiveQuestion && !isRevealed) ? 24 : 0;
  
  // Fitil: countdown başlangıcı → drumRoll bitişi arası 0..1
  // Süre = phases.silentPause - phases.countdown (countdown + drumRoll)
  let fusePhase = 0;
  if (question.show_image !== false && localFrame >= phases.countdown && localFrame < phases.silentPause) {
    const fuseDuration = phases.silentPause - phases.countdown;
    fusePhase = Math.min(1, (localFrame - phases.countdown) / fuseDuration);
  } else if (localFrame >= phases.silentPause) {
    fusePhase = 1; // Tam yandı
  }
  
  // Burst: reveal anından itibaren 35 frame (1.17s)
  const burstActive = question.show_image !== false && localFrame >= phases.reveal && localFrame < phases.reveal + 35;
  const burstLocalFrame = burstActive ? localFrame - phases.reveal : 0;
  
  return (
    <div
      style={{
        position: "absolute",
        top: bodyTop,
        left: 50,
        right: 50,
        bottom: bodyBottom,
      }}
    >
      {!inFunFact ? (
        // SORU MODU: 2 sütun (resim sol, şıklar sağ) - eski layout
        <div style={{ display: "flex", gap: colGap, height: "100%" }}>
          <div
            style={{
              width: leftWidth,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ImageCard
              src={imageSrc}
              width={leftWidth}
              height={imageHeight}
              isReveal={isRevealed}
              revealTransition={revealImageTransition}
              blurAmount={blurAmount}
              fusePhase={fusePhase}
              burstActive={burstActive}
              burstLocalFrame={burstLocalFrame}
              showAsPlaceholder={question.show_image === false}
            />
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
        </div>
      ) : (
        // FACT MODU: YAN YANA — resim SOL, panel SAĞ, GÖZLÜK altta ortada
        // Kullanıcı talebi (jellyfish görseli): resim solda, panel sağda, gözlük altta ortada
        (() => {
          const factGap = 30;
          const factColWidth = Math.floor((width - 100 - factGap) / 2); // 50+50 padding - gap
          const glassesHeight = 100; // gözlük emoji'si için altta ayrılan alan
          const factColHeight = Math.floor(height - bodyTop - bodyBottom - glassesHeight - 20);
          
          return (
            <>
              {/* Yan yana resim + panel */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: factGap,
                  width: "100%",
                  height: factColHeight,
                }}
              >
                {/* SOL: Resim */}
                <ImageCard
                  src={funFactImageSrc || imageSrc}
                  width={factColWidth}
                  height={factColHeight}
                  isReveal={false}
                  revealTransition={1}
                  showAsPlaceholder={question.show_image === false && !funFactImageSrc}
                />
                
                {/* SAĞ: Fact paneli */}
                <FunFactPanel
                  text={question.fun_fact}
                  showFrame={phases.funFact}
                  isVertical={false}
                  boxWidth={factColWidth}
                  boxHeight={factColHeight}
                  hideGlasses={true}
                />
              </div>
              
              {/* ALT ORTA: Gözlük emoji (büyük) */}
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 0,
                  right: 0,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: glassesHeight,
                  pointerEvents: "none",
                }}
              >
                <div style={{ fontSize: 110, lineHeight: 1 }}>👓</div>
              </div>
            </>
          );
        })()
      )}
    </div>
  );
};

const ShortsLayout: React.FC<LayoutProps> = ({
  question, imageSrc, funFactImageSrc, phases, inDrumRoll, inSilentPause, inCountdown,
  inFunFact, isRevealed, revealImageTransition, width, height, localFrame,
}) => {
  const bodyTop = 320;  // shorts header 267 + 53 padding (resim biraz daha aşağı)
  const padding = 40;
  const contentWidth = width - padding * 2;
  const imageHeight = Math.floor(height * 0.34);
  
  const bodyBottom = inFunFact ? 60 : 240;  // soru fazlarında: Jess için 240
  
  // Progress bar countdown veya drumRoll/silentPause sırasında görünür
  const showProgressBar = inCountdown || inDrumRoll || inSilentPause;
  
  // ─── FLU + FİTİL + KONFETI hesabı (LongLayout ile aynı) ───
  const inActiveQuestion = localFrame >= phases.countdown && localFrame < phases.reveal;
  const blurAmount = (question.show_image !== false && inActiveQuestion && !isRevealed) ? 24 : 0;
  
  let fusePhase = 0;
  if (question.show_image !== false && localFrame >= phases.countdown && localFrame < phases.silentPause) {
    const fuseDuration = phases.silentPause - phases.countdown;
    fusePhase = Math.min(1, (localFrame - phases.countdown) / fuseDuration);
  } else if (localFrame >= phases.silentPause) {
    fusePhase = 1;
  }
  
  const burstActive = question.show_image !== false && localFrame >= phases.reveal && localFrame < phases.reveal + 35;
  const burstLocalFrame = burstActive ? localFrame - phases.reveal : 0;
  
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
        // Eşit dağıtım: resim - şıklar - progress bar
        justifyContent: "space-between",
      }}
    >
      {!inFunFact ? (
        <>
          {/* RESİM */}
          <ImageCard
            src={imageSrc}
            width={contentWidth}
            height={imageHeight}
            isReveal={isRevealed}
            revealTransition={revealImageTransition}
            blurAmount={blurAmount}
            fusePhase={fusePhase}
            burstActive={burstActive}
            burstLocalFrame={burstLocalFrame}
            showAsPlaceholder={question.show_image === false}
          />
          
          {/* ŞIKLAR - 3 tane, aralarında eşit boşluk */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
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
          
          {/* PROGRESS BAR - en altta, son şıkkın altında resim-A boşluğu kadar mesafe */}
          {showProgressBar ? (
            <LiquidProgressBar
              startFrame={phases.countdown}
              durationFrames={FIXED_FRAMES.countdown}
              height={50}
            />
          ) : (
            // Progress bar görünmediği zamanlarda da yerini koru (boş div)
            <div style={{ height: 50 }} />
          )}
        </>
      ) : (
        (() => {
          // FACT MODE: Resim üstte + fact kutusu altta (resim alanıyla AYNI boyutta)
          // Kullanıcı: "alan sabit kalsın resimin buyuklugu kadar olsun"
          // Fact bölümü 1/3 büyütüldü (0.30 → 0.40) - kullanıcı talebi
          const factBoxWidth = contentWidth;
          const factBoxHeight = Math.floor(height * 0.40);
          const factImageSrc = funFactImageSrc || imageSrc;
          
          return (
            <>
              {/* Resim üstte */}
              <ImageCard
                src={factImageSrc}
                width={factBoxWidth}
                height={factBoxHeight}
                isReveal={false}
                revealTransition={1}
                showAsPlaceholder={question.show_image === false && !funFactImageSrc}
              />
              
              {/* Fact paneli ortada (resim ile aynı alan) - gözlük altta */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 24,
                }}
              >
                <FunFactPanel
                  text={question.fun_fact}
                  showFrame={phases.funFact}
                  isVertical
                  boxWidth={factBoxWidth}
                  boxHeight={factBoxHeight}
                />
              </div>
            </>
          );
        })()
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
  /** Soru flu modu (cevap gelince netleşir) */
  blurAmount?: number;     // 0 = net, 30 = çok flu
  /** Fitil yanma ilerlemesi (0..1) - countdown'da artar */
  fusePhase?: number;
  /** Patlama anı (true ise konfeti burst tetiklenir) */
  burstActive?: boolean;
  /** Patlama frame offset (animasyon için, framesSinceBurst) */
  burstLocalFrame?: number;
  /** show_image false ise resim yerine süslü "?" placeholder göster */
  showAsPlaceholder?: boolean;
}

const ImageCard: React.FC<ImageCardProps> = ({
  src, width, height, isReveal = false, revealTransition = 0,
  blurAmount = 0, fusePhase = 0, burstActive = false, burstLocalFrame = 0,
  showAsPlaceholder = false,
}) => {
  const scale = isReveal
    ? interpolate(revealTransition, [0, 1], [0.95, 1])
    : 1;
  const opacity = isReveal
    ? interpolate(revealTransition, [0, 0.5, 1], [0.5, 0.8, 1])
    : 1;
  
  if (!src && !showAsPlaceholder) return null;
  
  // Fitil için SVG path: dikdörtgen çerçeve (saat yönünde, üst-orta'dan başlar)
  // fusePhase 0..1 → strokeDashoffset ile ilerle
  const perim = 2 * (width + height);
  const fuseDashOffset = perim * (1 - fusePhase);
  
  // Konfeti burst - 24 parça farklı yönlere
  const confettiPieces = burstActive ? Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    const dist = 60 + Math.min(burstLocalFrame * 8, 400);
    const fade = Math.max(0, 1 - burstLocalFrame / 35);
    const rot = burstLocalFrame * 12 + i * 30;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - burstLocalFrame * 2, // hafif yukarı
      fade,
      rot,
      emoji: ["🎊", "⭐", "✨", "💫", "🎉"][i % 5],
      size: 40 + (i % 3) * 12,
    };
  }) : [];
  
  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        borderRadius: 28,
        backgroundColor: BRAND.white,
        border: `6px solid ${BRAND.white}`,
        boxShadow: "0 14px 32px rgba(0,0,0,0.45), 0 0 0 3px rgba(0,0,0,0.15)",
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {/* RESİM - flu kalmasın diye iç container içinde overflow gizle */}
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 22,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {showAsPlaceholder ? (
          // SÜSLÜ "?" PLACEHOLDER (görsel olmayan sorular için)
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #FFD700 0%, #FF6B9D 50%, #6B5B95 100%)",
              position: "relative",
            }}
          >
            {/* Arka plan dekor */}
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.3) 8%, transparent 9%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 6%, transparent 7%), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.2) 4%, transparent 5%)",
              backgroundSize: "60px 60px, 80px 80px, 40px 40px",
            }} />
            
            <div style={{
              fontSize: Math.floor(Math.min(width, height) * 0.55),
              fontFamily: FONTS.display,
              fontWeight: 900,
              color: BRAND.white,
              textShadow: `
                -6px -6px 0 ${BRAND.black},
                6px -6px 0 ${BRAND.black},
                -6px 6px 0 ${BRAND.black},
                6px 6px 0 ${BRAND.black},
                10px 10px 0 rgba(0,0,0,0.4)
              `,
              lineHeight: 1,
              zIndex: 2,
            }}>?</div>
          </div>
        ) : src ? (
          <Img
            src={src}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
              transform: blurAmount > 0 ? "scale(1.1)" : undefined, // blur kenarları kapat
              transition: "filter 0.3s ease-out",
            }}
          />
        ) : null}
      </div>
      
      {/* FİTİL — çerçevenin etrafında yanan kıvılcım (sadece countdown'da) */}
      {fusePhase > 0 && fusePhase < 1 && (
        <svg
          style={{
            position: "absolute",
            top: -3, left: -3, width: width, height: height,
            pointerEvents: "none",
            zIndex: 3,
          }}
          width={width}
          height={height}
        >
          {/* Karbonlaşmış iz (yanan kısım) */}
          <rect
            x={3} y={3}
            width={width - 6}
            height={height - 6}
            rx={22}
            fill="none"
            stroke="#1a0500"
            strokeWidth={6}
            strokeDasharray={perim}
            strokeDashoffset={fuseDashOffset}
            strokeLinecap="round"
          />
          {/* Kıvılcım (parlayan baş) */}
          <rect
            x={3} y={3}
            width={width - 6}
            height={height - 6}
            rx={22}
            fill="none"
            stroke="#FFD700"
            strokeWidth={8}
            strokeDasharray={`12 ${perim - 12}`}
            strokeDashoffset={fuseDashOffset}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 8px #FF6B00) drop-shadow(0 0 16px #FFD700)" }}
          />
        </svg>
      )}
      
      {/* KONFETI BURST — patlama anı */}
      {burstActive && (
        <div
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            width: 0, height: 0,
            pointerEvents: "none",
            zIndex: 4,
          }}
        >
          {confettiPieces.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0, top: 0,
                fontSize: p.size,
                lineHeight: 1,
                transform: `translate(${p.x - p.size/2}px, ${p.y - p.size/2}px) rotate(${p.rot}deg)`,
                opacity: p.fade,
                filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
              }}
            >
              {p.emoji}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// FUN FACT PANEL — sabit kutu, içerde GERÇEK dinamik fit-to-fill font
// (DID YOU KNOW + ampul + yeşil cevap pill ARTIK üst barda, TopBar component'inde)
// Kullanıcı talebi: "alan sabit kalsın resimin buyuklugu kadar olsun, sonra bilginin
// uzunluguna gore yazı forntunu alanı tam dolsuracak sekılde ayarlayıp ortalayıp yazdırmak"
// ═══════════════════════════════════════════════════
interface FunFactPanelProps {
  text: string;
  showFrame: number;
  isVertical?: boolean;
  // Kutunun fiziksel boyutu (resimle aynı boyutta tutulur)
  boxWidth: number;
  boxHeight: number;
  /** Gözlük emoji'si gizlensin mi? (Long fact'te yan yana layout'ta dışarıda göstermek için) */
  hideGlasses?: boolean;
}

/**
 * Verilen metin için, verilen kutuya tam sığacak font size'ı hesaplar.
 * Lilita One uppercase için karakter genişliği yaklaşık 0.55 × fontSize.
 * Satır yüksekliği yaklaşık 1.15 × fontSize (lineHeight 1.15).
 * 
 * Binary search ile en büyük sığan font'u bulur.
 */
function calculateFitFont(
  text: string,
  availableWidth: number,
  availableHeight: number,
  minFont: number = 24,
  maxFont: number = 120
): number {
  const upper = text.toUpperCase();
  const words = upper.split(/\s+/).filter(Boolean);
  if (words.length === 0) return minFont;
  
  const lineHeight = 1.15;
  const charWidthRatio = 0.55; // Lilita One uppercase
  
  // Verilen fontSize için kaç satır gerekli + sığar mı?
  const fits = (fontSize: number): boolean => {
    const maxCharsPerLine = Math.floor(availableWidth / (fontSize * charWidthRatio));
    if (maxCharsPerLine < 3) return false;
    
    // Greedy line break (kelime kelime)
    let lines = 1;
    let currentLineLen = 0;
    for (const word of words) {
      // Eğer kelime tek başına bile satıra sığmıyorsa fit edemez
      if (word.length > maxCharsPerLine) return false;
      
      const needed = currentLineLen === 0 ? word.length : currentLineLen + 1 + word.length;
      if (needed <= maxCharsPerLine) {
        currentLineLen = needed;
      } else {
        lines++;
        currentLineLen = word.length;
      }
    }
    
    const totalHeight = lines * fontSize * lineHeight;
    return totalHeight <= availableHeight;
  };
  
  // Binary search
  let lo = minFont;
  let hi = maxFont;
  let best = minFont;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

const FunFactPanel: React.FC<FunFactPanelProps> = ({
  text,
  showFrame,
  isVertical,
  boxWidth,
  boxHeight,
  hideGlasses,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Kart enter animasyonu
  const cardAnim = spring({
    frame: frame - showFrame,
    fps,
    config: { damping: 13, stiffness: 100 },
  });
  const cardOpacity = interpolate(cardAnim, [0, 0.5, 1], [0, 1, 1]);
  const cardY = interpolate(cardAnim, [0, 1], [60, 0]);
  const cardScale = interpolate(cardAnim, [0, 1], [0.85, 1]);
  
  // Gözlük geç gelir - DAHA BÜYÜK (kullanıcı talebi: "gozluk daha da buyuk olmalı")
  const glassesAnim = spring({
    frame: frame - showFrame - 20,
    fps,
    config: { damping: 10, stiffness: 130 },
  });
  const glassesScale = interpolate(glassesAnim, [0, 1], [0, 1]);
  const glassesOpacity = interpolate(glassesAnim, [0, 0.5], [0, 1]);
  const glassesRotate = interpolate(glassesAnim, [0, 0.7, 1], [-180, 10, 0]);
  const glassesIdleBounce = Math.sin((frame - showFrame - 20) * 0.1) * 6;
  
  // KUTU BOYUTU: SABİT (resim ile aynı)
  // İçerideki paddingleri hesaba katıp inner alanı bul
  const paddingX = isVertical ? 36 : 50;
  const paddingY = isVertical ? 36 : 44;
  const innerWidth = boxWidth - paddingX * 2;
  const innerHeight = boxHeight - paddingY * 2;
  
  // GERÇEK DİNAMİK FONT (binary search ile tam doldur)
  const fittedFont = calculateFitFont(
    text,
    innerWidth,
    innerHeight,
    isVertical ? 28 : 32,   // min
    isVertical ? 96 : 110,  // max
  );
  
  // Gözlük boyutu — KULLANICI TALEBİ: 500
  const glassesSize = 500;
  
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: isVertical ? 28 : 36,
        width: boxWidth,
      }}
    >
      {/* Fact kutusu - SABİT boyut, içerde font dinamik */}
      <div
        style={{
          opacity: cardOpacity,
          transform: `translateY(${cardY}px) scale(${cardScale})`,
          backgroundColor: BRAND.white,
          borderRadius: 24,
          padding: `${paddingY}px ${paddingX}px`,
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          borderTop: `8px solid ${BRAND.yellow}`,
          borderBottom: `8px solid ${BRAND.yellow}`,
          width: boxWidth,
          height: boxHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: fittedFont,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: BRAND.black,
            lineHeight: 1.15,
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            width: "100%",
          }}
        >
          {text.toUpperCase()}
        </div>
      </div>
      
      {/* Gözlük - DAHA BÜYÜK (hideGlasses true ise gizle - long fact yan yana layout için) */}
      {!hideGlasses && (
        <div
          style={{
            transform: `scale(${glassesScale}) rotate(${glassesRotate}deg) translateY(${glassesIdleBounce}px)`,
            opacity: glassesOpacity,
          }}
        >
          <GlassesIcon size={glassesSize} />
        </div>
      )}
    </div>
  );
};
