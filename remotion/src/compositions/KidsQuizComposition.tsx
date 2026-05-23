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
import { OutroSceneShorts } from "../scenes/OutroSceneShorts";
import { OutroSceneLong } from "../scenes/OutroSceneLong";
import { JessTransition } from "../components/JessTransition";
import {
  computeQuestionPhases,
  questionStartFrame,
  outroStartFrame,
} from "../utils/timing";

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
  sfx_progress,
  sfx_applause,
  channel_name,
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
  const outroStart = outroStartFrame(intro_audio_duration, questions);
  
  // ─── MUSIC DUCKING ────────────────────────────────
  // Quiz Blitz tarzı: müzik sürekli arka planda, Jess konuşurken duck
  // %15 (sessiz fazlar) → %2 (Jess konuşurken)
  
  const isJessSpeaking = (f: number): boolean => {
    // Intro
    if (f < introFrames) return true;
    // Outro
    if (f >= outroStart && f < outroStart + outroFrames) return true;
    
    // Sorular - question/answer audio fazları
    let scanFrame = introFrames;
    for (let i = 0; i < questions.length; i++) {
      const phases = computeQuestionPhases(questions[i]);
      const qStart = scanFrame;
      const qEnd = scanFrame + phases.end;
      
      if (f >= qStart && f < qEnd) {
        const localFrame = f - qStart;
        // Question audio (show fazı)
        if (localFrame < phases.countdown) return true;
        // Answer audio (reveal → transition)
        if (localFrame >= phases.reveal && localFrame < phases.transition) return true;
        return false;
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
    
    const targetVol = speaking ? 0.02 : 0.15;
    const startVol = prevSpeaking ? 0.02 : 0.15;
    
    if (framesSinceChange < MUSIC_DUCK_FRAMES) {
      const t = framesSinceChange / MUSIC_DUCK_FRAMES;
      return startVol + (targetVol - startVol) * t;
    }
    
    return targetVol;
  };
  
  return (
    <AbsoluteFill>
      {/* INTRO */}
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroSceneComponent
          channelName={channel_name}
          topic={topic}
          jessPoses={resolvedJessPoses}
          durationFrames={introFrames}
          jessVideoDurationFrames={Math.ceil(jess_intro_video_duration * FPS)}
        />
      </Sequence>
      
      {intro_audio_path && (
        <Sequence from={0} durationInFrames={introFrames}>
          <Audio src={staticFile(intro_audio_path)} volume={1.4} />
        </Sequence>
      )}
      
      {/* TOPIC ANNOUNCEMENT - Sahne 2'de oynar (Jess video bittikten sonra) */}
      {topic_announce_path && (
        <Sequence
          from={Math.ceil(jess_intro_video_duration * FPS) + Math.floor(FPS * 0.4)}
          durationInFrames={Math.ceil(topic_announce_duration * FPS)}
        >
          <Audio src={staticFile(topic_announce_path)} volume={1.4} />
        </Sequence>
      )}
      
      {/* SORULAR + JESS GEÇİŞLER */}
      {questions.map((q, idx) => {
        const startFrame = questionStartFrame(idx, intro_audio_duration, questions);
        const phases = computeQuestionPhases(q);
        const theme = getThemeForQuestion(idx);
        
        const imageSrc = q.image_path
          ? staticFile(q.image_path)
          : q.image_url || "";
        const funFactImageSrc = q.fun_fact_image_path
          ? staticFile(q.fun_fact_image_path)
          : imageSrc;
        const revealImageSrc = q.reveal_image_path
          ? staticFile(q.reveal_image_path)
          : undefined;
        
        return (
          <React.Fragment key={idx}>
            <Sequence from={startFrame} durationInFrames={phases.end}>
              <QuestionScene
                question={q}
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
                sfx_progress={sfx_progress}
              />
            </Sequence>
          </React.Fragment>
        );
      })}
      
      {/* OUTRO */}
      <Sequence from={outroStart} durationInFrames={outroFrames}>
        <OutroSceneComponent
          channelName={channel_name}
          jessPoses={resolvedJessPoses}
          durationFrames={outroFrames}
          jessVideoDurationFrames={Math.ceil(jess_outro_video_duration * FPS)}
        />
      </Sequence>
      
      {outro_audio_path && (
        <Sequence from={outroStart} durationInFrames={outroFrames}>
          <Audio src={staticFile(outro_audio_path)} volume={1.4} />
        </Sequence>
      )}
      
      {/* OUTRO ANNOUNCE - Subscribe sahnesinde (Jess outro video bittikten 0.4s sonra) oynar */}
      {outro_announce_path && (
        <Sequence
          from={outroStart + Math.ceil(jess_outro_video_duration * FPS) + Math.floor(FPS * 0.4)}
          durationInFrames={Math.ceil(outro_announce_duration * FPS)}
        >
          <Audio src={staticFile(outro_announce_path)} volume={1.4} />
        </Sequence>
      )}
      
      {/* OUTRO ALKIŞ - "GREAT JOB!" göründüğünde çalar */}
      {sfx_applause && (
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
