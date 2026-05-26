// REV 001/26MAY26 - HighlightedText: **bold** -> renkli vurgu + TwemojiText
import React from "react";
import { TwemojiText } from "./TwemojiText";
import { BRAND, highlightPalette } from "../styles/theme";

interface HighlightedTextProps {
  text: string;
  baseColor?: string;
  palette?: string[];
  style?: React.CSSProperties;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  baseColor = BRAND.white,
  palette = highlightPalette,
  style,
}) => {
  const parts: { text: string; highlighted: boolean }[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index), highlighted: false });
    parts.push({ text: match[1], highlighted: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), highlighted: false });
  let hIdx = 0;
  return (
    <span style={style}>
      {parts.map((part, i) => {
        if (part.highlighted) {
          const color = palette[hIdx++ % palette.length];
          return <span key={i} style={{ color }}><TwemojiText text={part.text} /></span>;
        }
        return <span key={i} style={{ color: baseColor }}><TwemojiText text={part.text} /></span>;
      })}
    </span>
  );
};
