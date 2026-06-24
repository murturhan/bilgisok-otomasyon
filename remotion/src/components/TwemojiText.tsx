// REV 005/25JUN26 - Bayrak emoji Flagpedia CDN'e gecildi (Twemoji CDN 404 sorunu)
import React from "react";
import fluentMapRaw from "../data/fluent-emoji-map.json";

const FLUENT_BASE = "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/";
const FLAGPEDIA_BASE = "https://flagcdn.com/w320/";

function isFlagEmoji(grapheme: string): boolean {
  const cp = grapheme.codePointAt(0);
  return cp !== undefined && cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

function flagToFlagpediaUrl(grapheme: string): string {
  const cps = [...grapheme].map(ch => ch.codePointAt(0)!);
  const iso = cps.map(cp => String.fromCharCode(cp - 0x1f1a5)).join("").toLowerCase();
  return FLAGPEDIA_BASE + iso + ".png";
}
const fluentMap = fluentMapRaw as Record<string, { name: string; slug: string }>;

interface FluentEmojiTextProps {
  text: string;
  style?: React.CSSProperties;
  className?: string;
}

type ParsedPart =
  | { type: "custom"; code: string }
  | { type: "emoji"; char: string }
  | { type: "flag"; char: string }
  | { type: "text"; text: string };

function parseText(input: string): ParsedPart[] {
  const result: ParsedPart[] = [];
  const shortcodeRegex = /:([a-z0-9_-]+):/g;

  const rawSegs: Array<{ type: "raw" | "custom"; value: string }> = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = shortcodeRegex.exec(input)) !== null) {
    if (match.index > lastIdx) rawSegs.push({ type: "raw", value: input.slice(lastIdx, match.index) });
    rawSegs.push({ type: "custom", value: match[1] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < input.length) rawSegs.push({ type: "raw", value: input.slice(lastIdx) });

  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new (Intl as any).Segmenter(undefined, { granularity: "grapheme" })
      : null;

  for (const seg of rawSegs) {
    if (seg.type === "custom") {
      result.push({ type: "custom", code: seg.value });
      continue;
    }
    let textBuf = "";
    const graphemes: string[] = segmenter
      ? Array.from((segmenter as any).segment(seg.value), (s: any) => s.segment)
      : Array.from(seg.value);
    for (const g of graphemes) {
      if (isFlagEmoji(g)) {
        if (textBuf) { result.push({ type: "text", text: textBuf }); textBuf = ""; }
        result.push({ type: "flag", char: g });
      } else if (fluentMap[g]) {
        if (textBuf) { result.push({ type: "text", text: textBuf }); textBuf = ""; }
        result.push({ type: "emoji", char: g });
      } else {
        textBuf += g;
      }
    }
    if (textBuf) result.push({ type: "text", text: textBuf });
  }
  return result;
}

const IMG_STYLE: React.CSSProperties = { height: "1em", width: "auto", verticalAlign: "-0.1em" };

export const FluentEmojiText: React.FC<FluentEmojiTextProps> = ({ text, style, className }) => {
  const parts = parseText(text);
  return (
    <span className={className} style={style}>
      {parts.map((part, i) => {
        if (part.type === "custom") {
          return (
            <img
              key={i}
              src={`/custom-emoji/${part.code}.svg`}
              alt={`:${part.code}:`}
              style={IMG_STYLE}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          );
        }
        if (part.type === "flag") {
          const url = flagToFlagpediaUrl(part.char);
          return <img key={i} src={url} alt={part.char} style={IMG_STYLE} />;
        }
        if (part.type === "emoji") {
          const entry = fluentMap[part.char];
          if (entry) {
            const url = `${FLUENT_BASE}${entry.name.replace(/ /g, "%20")}/3D/${entry.slug}_3d.png`;
            return <img key={i} src={url} alt={part.char} style={IMG_STYLE} />;
          }
          return <span key={i}>{part.char}</span>;
        }
        return <span key={i}>{part.text}</span>;
      })}
    </span>
  );
};

// Backward compat alias — mevcut importlar değişmeden çalışmaya devam eder
export const TwemojiText = FluentEmojiText;
