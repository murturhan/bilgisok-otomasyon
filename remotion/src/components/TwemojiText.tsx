// REV 002/26MAY26 - :shortcode: custom emoji altyapısı eklendi
import React from "react";
// @ts-ignore
import twemoji from "twemoji";

interface TwemojiTextProps {
  text: string;
  style?: React.CSSProperties;
  className?: string;
}

export const TwemojiText: React.FC<TwemojiTextProps> = ({ text, style, className }) => {
  // :shortcode: custom emoji altyapısı (Gemini henüz kullanmıyor — infrastructure hazır)
  const withCustom = text.replace(/:([a-z0-9_-]+):/g, (_match, code) => {
    return `<img style="height:1em;width:auto;vertical-align:-0.1em" src="/custom-emoji/${code}.svg" alt=":${code}:" onerror="this.style.display='none'">`;
  });
  const raw: string = twemoji.parse(withCustom, {
    folder: "svg",
    ext: ".svg",
    base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/",
  });
  // Only add style to twemoji's <img class="emoji"> — custom emoji already has style
  const parsed = raw.replace(/<img class="emoji"/g, '<img style="height:1em;width:auto;vertical-align:-0.1em" class="emoji"');
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: parsed }} />;
};
