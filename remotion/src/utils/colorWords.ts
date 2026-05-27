// REV 001/28MAY26 - otomatik 3 kelime renk seçimi (uzunluk önceliği, stopword'ler atlanır)

const STOP_WORDS = new Set([
  "a","an","the","to","of","is","in","on","and","or","with",
  "for","at","by","as","but","not","its","can","are","that",
  "which","what","how","do","does","was","were","it","this",
  "have","has","be","been","from","up","about","into","than",
  "then","so","if","when","where","who","will","would","could",
  "should","did","had","get","all","no","your","their","our",
]);

/**
 * Cümledeki kelimeleri analiz eder, en az 3 önemli kelimeyi seçer.
 * Öncelik: stopword değil + en uzun kelime.
 * Eğer 3'ten az non-stopword varsa hepsini döner.
 */
export function selectColoredIndices(words: string[], count = 3): number[] {
  const cleaned = words.map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase());
  const candidates = cleaned
    .map((w, i) => ({ i, len: w.length }))
    .filter(c => c.len > 0 && !STOP_WORDS.has(cleaned[c.i]))
    .sort((a, b) => b.len - a.len);

  return candidates
    .slice(0, Math.min(count, candidates.length))
    .map(c => c.i)
    .sort((a, b) => a - b);
}
