// REV 011/30MAY26 - is_test_mode: intro/outro atlanir, sadece sorular render edilir
import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useVideoConfig,
  staticFile,
} from "remotion";
import { FPS, MUSIC_DUCK_FRAMES, getThemeForQuestion } from "../styles/theme";
import { QuizCompositionProps } from "../types/schemas";
import { IntroSceneShorts } from "../scenes/IntroSceneShorts";
import { IntroSceneLong } from "../scenes/IntroSceneLong";
import { QuestionScene } from "../scenes/QuestionScene";
import { WouldYouRatherScene } from "../scenes/WouldYouRatherScene";
import { OutroSceneShorts } from "../scenes/OutroSceneShorts";
import { OutroSceneLong } from "../scenes/OutroSceneLong";
import { JessTransition } from "../components/JessTransition";
import {
  computeQuestionPhases,
  computeWyrPhases,
  computeAnyQuestionEnd,
  questionStartFrame,
  outroStartFrame,
  APPLAUSE_DELAY_FRAMES,
} from "../utils/timing";
import { WouldYouRatherQuestion } from "../types/schemas";

export const KidsQuizComposition: React.FC<QuizCompositionProps> = ({
  title,
  topic,
  questions,
  intro_audio_path,
  outro_audio_path,
  intro_audio_duration,
  outro_audio_duration,
  jess_intro_video_duration,
  jess_outro_video_duration,
  topic_announce_path,
  topic_announce_duration,
  outro_announce_path,
  outro_announce_duration,
  jess_poses,
  background_music_url,
  sfx_tick,
  sfx_drum,
  sfx_correct,
  sfx_whoosh,
  sfx_pop_single,
  sfx_pop_double,
  sfx_progress,
  sfx_applause,
  channel_name,
  topic_emojis,
  is_test_mode = false,
}) => {
  const { width, height } = useVideoConfig();
  const isVertical = height > width;
  const IntroSceneComponent = isVertical ? IntroSceneShorts : IntroSceneLong;
  const OutroSceneComponent = isVertical ? OutroSceneShorts : OutroSceneLong;
  
  // Jess poses path resolve
  const resolvedJessPoses = Object.fromEntries(
    Object.entries(jess_poses || {})
      .filter(([_, v]) => v)
      .map(([k, v]) => [k, staticFile(v as string)])
  );
  
  const introFrames = Math.ceil(intro_audio_duration * FPS);
  const outroFrames = Math.ceil(outro_audio_duration * FPS);
  const outroStart = outroStartFrame(intro_audio_duration, questions as any);
  
  // ─── MUSIC DUCKING ────────────────────────────────
  // Quiz Blitz tarzı: müzik sürekli arka planda, Jess konuşurken duck
  // %15 (sessiz fazlar) → %2 (Jess konuşurken)
  
  const isJessSpeaking = (f: number): boolean => {
    // Intro
    if (f < introFrames) return true;
    // Outro - APPLAUSE_DELAY_FRAMES + 20 sonra başlıyor
    if (f >= outroStart + APPLAUSE_DELAY_FRAMES + 20 && f < outroStart + APPLAUSE_DELAY_FRAMES + 20 + outroFrames) return true;
    
    // Sorular - question/answer audio fazları
    let scanFrame = introFrames;
    for (let i = 0; i < questions.length; i++) {
      const isWyr = (questions[i] as any).question_type === "would_you_rather";
      const qDuration = computeAnyQuestionEnd(questions[i] as any);
      const qStart = scanFrame;
      const qEnd = scanFrame + qDuration;

      if (f >= qStart && f < qEnd) {
        const localFrame = f - qStart;
        if (isWyr) {
          const wyrPhases = computeWyrPhases(questions[i] as unknown as WouldYouRatherQuestion);
          if (localFrame < wyrPhases.countdown) return true;
          if (localFrame >= wyrPhases.reaction && localFrame < wyrPhases.transition) return true;
          return false;
        } else {
          const phases = computeQuestionPhases(questions[i] as any);
          if (localFrame < phases.countdown) return true;
          if (localFrame >= phases.reveal && localFrame < phases.transition) return true;
          return false;
        }
      }
      scanFrame = qEnd;
    }
    return false;
  };
  
  const musicVolume = (f: number): number => {
    const speaking = isJessSpeaking(f);
    
    let prevSpeaking = speaking;
    let framesSinceChange = MUSIC_DUCK_FRAMES;
    
    for (let lookback = 1; lookback <= MUSIC_DUCK_FRAMES; lookback++) {
      const prev = isJessSpeaking(Math.max(0, f - lookback));
      if (prev !== speaking) {
        framesSinceChange = lookback;
        prevSpeaking = prev;
        break;
      }
    }
    
    const targetVol = speaking ? 0.05 : 0.09;
    const startVol = prevSpeaking ? 0.05 : 0.09;
    
    if (framesSinceChange < MUSIC_DUCK_FRAMES) {
      const t = framesSinceChange / MUSIC_DUCK_FRAMES;
      return startVol + (targetVol - startVol) * t;
    }
    
    return targetVol;
  };
  
  return (
    <AbsoluteFill>
      {/* INTRO - test modunda atlanır */}
      {!is_test_mode && introFrames > 0 && (
        <Sequence from={0} durationInFrames={introFrames}>
          <IntroSceneComponent
            channelName={channel_name}
            topic={topic}
            topicEmojis={topic_emojis}
            jessPoses={resolvedJessPoses}
            durationFrames={introFrames}
            jessVideoDurationFrames={Math.ceil(jess_intro_video_duration * FPS)}
            sfx_pop_single={sfx_pop_single}
            sfx_pop_double={sfx_pop_double}
          />
        </Sequence>
      )}

      {!is_test_mode && intro_audio_path && (
        <Sequence from={0} durationInFrames={introFrames}>
          <Audio src={staticFile(intro_audio_path)} volume={2.2} />
        </Sequence>
      )}
      
      {/* TOPIC ANNOUNCEMENT - test modunda atlanır */}
      {!is_test_mode && topic_announce_path && (
        <Sequence
          from={Math.ceil(jess_intro_video_duration * FPS) + Math.floor(FPS * 0.4)}
          durationInFrames={Math.ceil(topic_announce_duration * FPS)}
        >
          <Audio src={staticFile(topic_announce_path)} volume={1.4} />
        </Sequence>
      )}
      
      {/* SORULAR + JESS GEÇİŞLER */}
      {questions.map((q, idx) => {
        const startFrame = questionStartFrame(idx, intro_audio_duration, questions as any);
        const theme = getThemeForQuestion(idx);
        const isWyr = (q as any).question_type === "would_you_rather";

        if (isWyr) {
          const wyrQ = q as unknown as WouldYouRatherQuestion;
          const wyrPhases = computeWyrPhases(wyrQ);
          const visibleSrc = wyrQ.visible_option?.image_path
            ? staticFile(wyrQ.visible_option.image_path)
            : wyrQ.visible_option?.image_url || "";
          const surpriseSrc = wyrQ.surprise_option?.surprise_image_path
            ? staticFile(wyrQ.surprise_option.surprise_image_path)
            : wyrQ.surprise_option?.surprise_image_url || "";
          return (
            <React.Fragment key={idx}>
              <Sequence from={startFrame} durationInFrames={wyrPhases.end}>
                <WouldYouRatherScene
                  question={wyrQ}
                  visibleImageSrc={visibleSrc}
                  surpriseImageSrc={surpriseSrc}
                  questionNumber={idx + 1}
                  totalQuestions={questions.length}
                  theme={theme}
                  jessPoses={resolvedJessPoses}
                  channelName={channel_name}
                  sfx_tick={sfx_tick}
                  sfx_drum={sfx_drum}
                  sfx_correct={sfx_correct}
                  sfx_whoosh={sfx_whoosh}
                  sfx_pop_single={sfx_pop_single}
                  sfx_pop_double={sfx_pop_double}
                  sfx_progress={sfx_progress}
                />
              </Sequence>
            </React.Fragment>
          );
        }

        const phases = computeQuestionPhases(q as any);
        const imageSrc = (q as any).image_path
          ? staticFile((q as any).image_path)
          : (q as any).image_url || "";
        const funFactImageSrc = (q as any).fun_fact_image_path
          ? staticFile((q as any).fun_fact_image_path)
          : imageSrc;
        const revealImageSrc = (q as any).reveal_image_path
          ? staticFile((q as any).reveal_image_path)
          : undefined;

        return (
          <React.Fragment key={idx}>
            <Sequence from={startFrame} durationInFrames={phases.end}>
              <QuestionScene
                question={q as any}
                imageSrc={imageSrc}
                revealImageSrc={revealImageSrc}
                funFactImageSrc={funFactImageSrc}
                questionNumber={idx + 1}
                totalQuestions={questions.length}
                theme={theme}
                jessPoses={resolvedJessPoses}
                channelName={channel_name}
                sfx_tick={sfx_tick}
                sfx_drum={sfx_drum}
                sfx_correct={sfx_correct}
                sfx_whoosh={sfx_whoosh}
                sfx_pop_single={sfx_pop_single}
                sfx_pop_double={sfx_pop_double}
                sfx_progress={sfx_progress}
              />
            </Sequence>
          </React.Fragment>
        );
      })}
      
      {/* OUTRO - test modunda atlanır */}
      {!is_test_mode && (
        <Sequence from={outroStart} durationInFrames={outroFrames + APPLAUSE_DELAY_FRAMES}>
          <OutroSceneComponent
            channelName={channel_name}
            jessPoses={resolvedJessPoses}
            durationFrames={outroFrames + APPLAUSE_DELAY_FRAMES}
            jessVideoDurationFrames={Math.ceil(jess_outro_video_duration * FPS)}
            jessEntryFrames={APPLAUSE_DELAY_FRAMES}
          />
        </Sequence>
      )}

      {!is_test_mode && outro_audio_path && (
        <Sequence from={outroStart + APPLAUSE_DELAY_FRAMES + 20} durationInFrames={outroFrames}>
          <Audio src={staticFile(outro_audio_path)} volume={2.2} />
        </Sequence>
      )}

      {/* OUTRO ANNOUNCE - test modunda atlanır */}
      {!is_test_mode && outro_announce_path && (
        <Sequence
          from={outroStart + APPLAUSE_DELAY_FRAMES + Math.ceil(jess_outro_video_duration * FPS) + Math.floor(FPS * 0.4)}
          durationInFrames={Math.ceil(outro_announce_duration * FPS)}
        >
          <Audio src={staticFile(outro_announce_path)} volume={1.4} />
        </Sequence>
      )}

      {/* OUTRO ALKIŞ - test modunda atlanır */}
      {!is_test_mode && sfx_applause && (
        <Sequence from={outroStart} durationInFrames={Math.floor(FPS * 3)}>
          <Audio src={staticFile(sfx_applause)} volume={0.6} />
        </Sequence>
      )}
      
      {/* ARKA PLAN MÜZİK - gradual ducking */}
      {background_music_url && (
        <Audio
          src={staticFile(background_music_url)}
          volume={musicVolume}
          startFrom={0}
          loop
        />
      )}
    </AbsoluteFill>
  );
};
