// REV 002/28MAY26 - pop SFX volume 0.7->0.5
import React from "react";
import { Sequence, Audio, staticFile, spring, interpolate, useVideoConfig } from "remotion";
import { BRAND, highlightPalette } from "../styles/theme";
import { TwemojiText } from "./TwemojiText";
import { selectColoredIndices } from "../utils/colorWords";

interface AnimatedTitleWordsProps {
  text: string;
  /** frame - scene2StartFrame (spring animasyonu için) */
  localFrame: number;
  /** scene2StartFrame — Sequence from={} hesabı için (IntroScene Sequence'ına göre mutlak) */
  absoluteStartFrame: number;
  baseColor?: string;
  palette?: string[];
  sfx_pop_single?: string;
  sfx_pop_double?: string;
  /** Her kelime arasındaki frame farkı, default 12 (~0.4sn) */
  stagger?: number;
}

export const AnimatedTitleWords: React.FC<AnimatedTitleWordsProps> = ({
  text,
  localFrame,
  absoluteStartFrame,
  baseColor = BRAND.white,
  palette = highlightPalette,
  sfx_pop_single,
  sfx_pop_double,
  stagger = 12,
}) => {
  const { fps } = useVideoConfig();
  const cleanText = text.replace(/\*\*/g, "");
  const words = cleanText.split(/\s+/).filter(Boolean);
  const N = words.length;
  if (N === 0) return null;

  // Enter frame per word: son 2 kelime aynı frame'de gelir
  const enterFrames = words.map((_, i) => {
    if (i >= N - 2) return Math.max(0, N - 2) * stagger;
    return i * stagger;
  });

  // TAM 3 kelime renkli (farklı palette renkleri)
  const coloredIndices = selectColoredIndices(words, 3);
  const colorMap: Record<number, string> = {};
  coloredIndices.forEach((wi, ci) => {
    colorMap[wi] = palette[ci % palette.length];
  });

  return (
    <>
      <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.3em" }}>
        {words.map((word, i) => {
          const ef = enterFrames[i];
          const anim = spring({
            frame: localFrame - ef,
            fps,
            config: { damping: 12, stiffness: 130 },
          });
          const scale = interpolate(anim, [0, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const opacity = interpolate(anim, [0, 0.4, 1], [0, 1, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const color = colorMap[i] ?? baseColor;

          return (
            <span
              key={i}
              style={{ display: "inline-block", transform: `scale(${scale})`, opacity, color }}
            >
              <TwemojiText text={word} />
            </span>
          );
        })}
      </span>

      {/* Pop SFX: N=1 → pop_single; N=2 → pop_double; N>2 → her tek kelime pop_single, son çift pop_double */}
      {N === 1 && sfx_pop_single && (
        <Sequence from={absoluteStartFrame} durationInFrames={20}>
          <Audio src={staticFile(sfx_pop_single)} volume={0.5} />
        </Sequence>
      )}
      {N >= 2 && words.slice(0, N - 2).map((_, i) =>
        sfx_pop_single ? (
          <Sequence key={`pop-s-${i}`} from={absoluteStartFrame + i * stagger} durationInFrames={20}>
            <Audio src={staticFile(sfx_pop_single)} volume={0.5} />
          </Sequence>
        ) : null
      )}
      {N >= 2 && sfx_pop_double && (
        <Sequence from={absoluteStartFrame + Math.max(0, N - 2) * stagger} durationInFrames={20}>
          <Audio src={staticFile(sfx_pop_double)} volume={0.5} />
        </Sequence>
      )}
    </>
  );
};
