/**
 * GeniMini Tests - Theme System (Quiz Blitz tarzı)
 * 
 * Önemli değişiklikler:
 * - Her soruda farklı tema rengi (10 renk rotasyonu)
 * - Quiz Blitz tarzı vurgulu renkler
 * - Brand mor (#5B2C8C) header ve "GENIMINI TESTS" için sabit
 */

// ─── SABITLER ─────────────────────────────────────────
export const FPS = 30;

// Yumuşak music ducking için frame sayısı
export const MUSIC_DUCK_FRAMES = 15;

// ─── FONT ─────────────────────────────────────────────
// Quiz Blitz'in font ailesi: kalın, yuvarlak, çocuksu, sans-serif
// Lilita One = ana display (kalın yuvarlak)
// Fredoka = body (okunabilir yuvarlak)
export const FONTS = {
  display: '"Lilita One", "Fredoka", "Luckiest Guy", Arial Black, sans-serif',
  body: '"Fredoka", "Nunito", Arial, sans-serif',
};

// ─── BRAND ───────────────────────────────────────────
export const BRAND = {
  // Sabit marka rengi - header, "GENIMINI TESTS" dikey yazı, logo
  primary: "#5B2C8C",      // Brand mor
  primaryDark: "#3B1C5C",  // Daha koyu mor
  white: "#FFFFFF",
  black: "#0A0A0A",
  yellow: "#FFD700",       // Quiz Blitz şimşek sarısı
  yellowDark: "#FFA500",   // Şimşek gradient için
  
  // Doğru/yanlış cevap (sabit, her temada aynı)
  correctGreen: "#22C55E",
  correctGreenDark: "#16A34A",
  wrongRed: "#EF4444",
};

// ─── TEMA RENKLERİ (PER-QUESTION ROTATION) ───────────
// Quiz Blitz tarzı 10 farklı tema rengi
// Her soru bu paletten birini kullanır (index = questionIndex % 10)
export interface ThemeColor {
  name: string;
  bgPrimary: string;       // Ana background rengi
  bgSecondary: string;     // Gradient ikinci durak
  bgPattern: string;       // Pattern overlay rengi (rgba)
  accent: string;          // Vurgu rengi (bayrak/şık rozet için)
  textOnBg: string;        // Bg üzerinde okunabilir metin
}

export const THEME_COLORS: ThemeColor[] = [
  {
    name: "pink",
    bgPrimary: "#FF1493",
    bgSecondary: "#C71585",
    bgPattern: "rgba(255, 255, 255, 0.08)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "purple",
    bgPrimary: "#7B2CBF",
    bgSecondary: "#5A189A",
    bgPattern: "rgba(255, 255, 255, 0.08)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "teal",
    bgPrimary: "#06B6D4",
    bgSecondary: "#0891B2",
    bgPattern: "rgba(255, 255, 255, 0.10)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "blue",
    bgPrimary: "#2563EB",
    bgSecondary: "#1E40AF",
    bgPattern: "rgba(255, 255, 255, 0.10)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "green",
    bgPrimary: "#16A34A",
    bgSecondary: "#15803D",
    bgPattern: "rgba(255, 255, 255, 0.10)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "orange",
    bgPrimary: "#EA580C",
    bgSecondary: "#C2410C",
    bgPattern: "rgba(255, 255, 255, 0.10)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "red",
    bgPrimary: "#DC2626",
    bgSecondary: "#B91C1C",
    bgPattern: "rgba(255, 255, 255, 0.10)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "yellow",
    bgPrimary: "#EAB308",
    bgSecondary: "#CA8A04",
    bgPattern: "rgba(255, 255, 255, 0.12)",
    accent: "#7B2CBF",
    textOnBg: "#FFFFFF",
  },
  {
    name: "indigo",
    bgPrimary: "#4F46E5",
    bgSecondary: "#3730A3",
    bgPattern: "rgba(255, 255, 255, 0.10)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
  {
    name: "rose",
    bgPrimary: "#E11D48",
    bgSecondary: "#BE123C",
    bgPattern: "rgba(255, 255, 255, 0.10)",
    accent: "#FFD700",
    textOnBg: "#FFFFFF",
  },
];

/**
 * Soru indeksinden tema rengini al (rotasyon)
 */
export function getThemeForQuestion(questionIndex: number): ThemeColor {
  return THEME_COLORS[questionIndex % THEME_COLORS.length];
}

// ─── ANSWER CARD (A/B/C şık rozetleri için renkler) ──
// Şıkların yuvarlak rozeti her zaman sabit renklerde - akıl hızlı bağlayabilsin
export const ANSWER_BADGE_COLORS = {
  A: "#EF4444",   // Kırmızı
  B: "#3B82F6",   // Mavi
  C: "#22C55E",   // Yeşil
} as const;

// ─── FAZ FRAME SÜRELERİ (sabit) ──────────────────────
// Quiz Blitz tempo - çocuklar için biraz daha yavaş
export const FIXED_FRAMES = {
  // Soru gösteriliyor - "Sol görsel + sağ şıklar" stagger ile beliriyor
  // question_audio_duration'a dinamik bağlı, en az bu kadar
  showMin: FPS * 1,        // 1s minimum show fazı
  
  // Geri sayım - progress bar dolan/boşalan
  countdown: FPS * 5,      // 5s tam
  
  // Drum roll - cevap reveal'inden önce gerilim
  drumRoll: FPS * 1,       // 1s (sadece drum çalıyor)
  
  // Drum sonrası sessiz bekleme - kullanıcı talebi: 'drum çaldıktan sonra bekleyecek, doğru cevabı göstermeden'
  silentPause: FPS * 1,    // 1s sessizlik (drum bitti, henüz reveal yok, gerilim)
  
  // Reveal correct (büyük cevap büyüyor) 
  revealCorrect: FPS * 2,  // 2s
  
  // Fun fact ekranı
  funFact: FPS * 5,        // 5s (çocuk okuma hızı için)
  
  // Sonraki soruya geçiş - daha hissedilir flash + slide efekti (0.5s)
  transition: Math.floor(FPS * 0.5),     // 0.5s = 15 frame, beyaz flash + büyük scale + slide
};

// ─── ESKİ COLORS NESNESI (BACKWARD COMPAT) ───────────
// Mevcut kod bunu kullanıyorsa - tek tema fallback
export const COLORS = {
  primary: BRAND.primary,
  primaryDark: BRAND.primaryDark,
  secondary: "#FF1493",
  accent: BRAND.yellow,
  textWhite: BRAND.white,
  textBlack: BRAND.black,
  correctGreen: BRAND.correctGreen,
  wrongRed: BRAND.wrongRed,
  headerBg: BRAND.primary,
  timerFillStart: BRAND.correctGreen,
  timerFillDanger: BRAND.wrongRed,
  bgGradientStart: "#5A189A",
  bgGradientEnd: "#FF1493",
};
