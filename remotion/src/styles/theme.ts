// GeniMini Tests tema - Tüm görsel sabitler burada
// Renk paleti varsayılan: Pembe-mor-sarı (kanal kimliği)

export const COLORS = {
  // Ana arka plan gradient
  bgGradientStart: "#5B2C8C", // koyu mor
  bgGradientEnd: "#FF57A6",   // pembe
  
  // Vurgu renkleri (Jess karakter paleti)
  primary: "#FFD600",         // GeniMini sarı
  secondary: "#FF6B35",       // turuncu (Jess kulak rengi)
  accent: "#7B4CDD",          // mor (Jess göz rengi)
  
  // UI durum renkleri
  correctGreen: "#00E676",
  correctGreenDark: "#00C853",
  wrongGray: "#9E9E9E",
  wrongGrayDark: "#616161",
  
  // Metin
  textWhite: "#FFFFFF",
  textYellow: "#FFEB3B",
  textBlack: "#1A1A2E",
  textShadow: "#000000",
  
  // Kutu zemin
  boxBg: "rgba(0, 0, 0, 0.7)",
  boxBgCorrect: "#00C853",
  boxBgWrong: "rgba(97, 97, 97, 0.6)",
  
  // Timer
  timerBg: "rgba(255, 255, 255, 0.2)",
  timerFill: "#FFD600",
  timerFillDanger: "#FF1744",
  
  // Header
  headerBg: "rgba(123, 76, 221, 0.85)",
};

export const FONTS = {
  display: '"Fredoka", "Comic Sans MS", "Arial Black", sans-serif',
  body: '"Nunito", "Comic Sans MS", Arial, sans-serif',
};

// FPS standart, hep aynı kullan
export const FPS = 30;

// Faz süreleri (saniye)
export const TIMING = {
  intro: 5.0,
  outro: 5.0,
  
  // Soru fazları
  questionShow: 3.0,        // Soru görseli + metin görünür
  countdown: 5.0,           // 5,4,3,2,1 geri sayım + cevap kutuları
  drumRoll: 2.0,            // Suspense
  reveal: 3.0,              // Doğru cevap görünür + green glow
  funFact: 9.0,             // Did you know? bilgi sahnesi
  transition: 3.0,          // Whoosh + boşluk
  rest: 3.0,                // Nefes
};

// Frame hesaplamaları (FPS=30)
export const FRAMES = {
  intro: TIMING.intro * FPS,                    // 150
  outro: TIMING.outro * FPS,                    // 150
  questionShow: TIMING.questionShow * FPS,      // 90
  countdown: TIMING.countdown * FPS,            // 150
  drumRoll: TIMING.drumRoll * FPS,             // 60
  reveal: TIMING.reveal * FPS,                  // 90
  funFact: TIMING.funFact * FPS,               // 270
  transition: TIMING.transition * FPS,          // 90
  rest: TIMING.rest * FPS,                      // 90
  questionTotal: (TIMING.questionShow + TIMING.countdown + TIMING.drumRoll +
                  TIMING.reveal + TIMING.funFact + TIMING.transition + TIMING.rest) * FPS, // 840 = 28s
};

// Toplam video süresi hesaplayıcı
export function totalFrames(questionCount: number): number {
  return FRAMES.intro + (questionCount * FRAMES.questionTotal) + FRAMES.outro;
}
