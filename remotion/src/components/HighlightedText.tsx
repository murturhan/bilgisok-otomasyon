// REV 002/28MAY26 - ** sistemi devre dışı; otomatik 3 kelime renk seçimi (uzun/önemli kelimeler)
import React from "react";
import { TwemojiText } from "./TwemojiText";
import { BRAND, highlightPalette } from "../styles/theme";
import { selectColoredIndices } from "../utils/colorWords";

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
  // ** işaretlerini temizle (Gemini'den gelebilir, artık kod seçiyor)
  const cleanText = text.replace(/\*\*/g, "");

  // Tokenize: kelimeler ve boşluklar
  const tokens: Array<{text: string; isWord: boolean}> = [];
  const wordList: string[] = [];
  cleanText.split(/(\s+)/).forEach(token => {
    if (!token) return;
    const isWord = !/^\s+$/.test(token);
    tokens.push({text: token, isWord});
    if (isWord) wordList.push(token);
  });

  // TAM 3 kelime renkli (hepsi farklı palette rengi), kalanlar baseColor
  const coloredIndices = selectColoredIndices(wordList, 3);
  const colorMap: Record<number, string> = {};
  coloredIndices.forEach((wi, ci) => {
    colorMap[wi] = palette[ci % palette.length];
  });

  let wordIdx = 0;
  return (
    <span style={style}>
      {tokens.map((token, i) => {
        if (!token.isWord) return <span key={i}>{token.text}</span>;
        const wi = wordIdx++;
        const color = colorMap[wi] ?? baseColor;
        return (
          <span key={i} style={{color}}>
            <TwemojiText text={token.text} />
          </span>
        );
      })}
    </span>
  );
};
