// REV 001/16SEP26 - giris metni shared/jess-intro.js ten okunuyor (gomulu metin silindi)
import { BRAND } from "../styles/theme";

// ─── TEK KAYNAK ──────────────────────────────────────────────────────────
// Giriş metni artık burada GÖMÜLÜ DEĞİL. shared/jess-intro.js tek kaynak;
// aynı dosyayı scripts/03-seslendirme-uret.js de okuyor, böylece EKRANDAKİ
// YAZI ile JESS'İN KONUŞTUĞU metin birebir aynı oluyor.
// @ts-ignore - shared/ düz ESM JS; tsconfig include'u dışında ama bundler çözer.
export { LONG_GREETING_TEXT, SHORTS_GREETING_TEXT } from "../../../shared/jess-intro.js";

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
