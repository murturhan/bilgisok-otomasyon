import { BRAND } from "../styles/theme";

export const SHORTS_GREETING_TEXT = "Hey, curious minds! Jess the Fox here… are you ready?";
export const LONG_GREETING_TEXT = "Hey curious minds! I'm Jess the Fox, and welcome to Geni-Mini Tests! Ready for today's fun challenge?";

export function getTopicEmojis(topic: string): string[] {
  const t = topic.toLowerCase();
  
  // Buildings / Landmarks / Architecture
  if (/build|architect|monument|landmark|tower|castle|temple|palace|wonder/i.test(t))
    return ["🏰", "🗼", "🏛️", "🗽", "🕌", "⛩️"];
  if (/invent|technolog|machine|gadget|computer|phone/i.test(t))
    return ["📞", "💡", "✈️", "📷", "🎬", "🚗"];
  if (/animal|wild|pet|fox|dog|cat|jungle|safari|home/i.test(t))
    return ["🦁", "🐘", "🦒", "🐯", "🐧", "🐵"];
  if (/fruit/i.test(t))
    return ["🍎", "🍌", "🍇", "🍓", "🍑", "🍉"];
  if (/food|drink|cook|cuisine|snack|dish/i.test(t))
    return ["🍕", "🍔", "🌮", "🍦", "🍩", "🥕"];
  if (/countr|geograph|flag|world|capital|city|culture/i.test(t))
    return ["🗺️", "🌍", "🗽", "🏔️", "🏛️", "🚩"];
  if (/space|planet|astronaut|star|galaxy|moon|sun/i.test(t))
    return ["🚀", "🌙", "⭐", "🪐", "👽", "☄️"];
  if (/plant|flower|tree|forest|nature|garden/i.test(t))
    return ["🌳", "🌸", "🌻", "🍄", "🌵", "🌿"];
  if (/sport|game|ball|olympic/i.test(t))
    return ["⚽", "🏀", "🎾", "🏈", "⛹️", "🏆"];
  if (/vehicl|car|truck|transport|plane|train|ship/i.test(t))
    return ["🚗", "✈️", "🚂", "🚢", "🚁", "🚀"];
  if (/scien|physic|chem|biolog|experiment|cross.section/i.test(t))
    return ["🧪", "🔬", "🧬", "⚗️", "🧲", "🔭"];
  if (/music|instrument|song|sound/i.test(t))
    return ["🎵", "🎸", "🎹", "🥁", "🎤", "🎺"];
  if (/object|item|everyday|things/i.test(t))
    return ["🔑", "📱", "⌚", "🎒", "✏️", "📦"];
  if (/dinosaur|prehistor|fossil/i.test(t))
    return ["🦖", "🦕", "🦴", "🌋", "🥚", "🦎"];
  if (/ocean|sea|fish|marine|underwater/i.test(t))
    return ["🐠", "🐳", "🦈", "🐙", "🦀", "🌊"];
  if (/insect|bug/i.test(t))
    return ["🐛", "🦋", "🐝", "🐞", "🕷️", "🐜"];
  
  return ["📚", "💡", "🎨", "🔍", "🌟", "🎯"];
}

/** 3D çıkıntılı topic font için text-shadow stack üretir (font boyutuna dinamik) */
export function buildTopic3DShadow(fontSize: number): string {
  const s = Math.max(2, Math.floor(fontSize / 28));
  const o = Math.max(2, Math.floor(fontSize / 50));
  const layers = [
    `-${o}px -${o}px 0 ${BRAND.black}`,
    `${o}px -${o}px 0 ${BRAND.black}`,
    `-${o}px ${o}px 0 ${BRAND.black}`,
    `${o}px ${o}px 0 ${BRAND.black}`,
  ];
  for (let i = 1; i <= 8; i++) {
    const d = i * s;
    layers.push(`${d}px ${d}px 0 ${BRAND.black}`);
  }
  for (let i = 9; i <= 12; i++) {
    const d = i * s;
    layers.push(`${d}px ${d}px 0 #B91C7A`);
  }
  const finalD = 13 * s;
  layers.push(`${finalD}px ${finalD}px ${s * 4}px rgba(0,0,0,0.55)`);
  return layers.join(", ");
}
