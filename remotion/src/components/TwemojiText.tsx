// REV 001/26MAY26 - TwemojiText: sistem emoji -> SVG (twemoji)
import React from "react";
// @ts-ignore
import twemoji from "twemoji";

interface TwemojiTextProps {
  text: string;
  style?: React.CSSProperties;
  className?: string;
}

export const TwemojiText: React.FC<TwemojiTextProps> = ({ text, style, className }) => {
  const raw: string = twemoji.parse(text, {
    folder: "svg",
    ext: ".svg",
    base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/",
  });
  const parsed = raw.replace(/<img/g, '<img style="height:1em;width:auto;vertical-align:-0.1em"');
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: parsed }} />;
};
