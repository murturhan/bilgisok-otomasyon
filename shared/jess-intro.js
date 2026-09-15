// REV 001/16SEP26 - Jess giris sahnesi TEK KAYNAK (ekran metni + seslendirme ayni yerden okur)
/**
 * JESS GİRİŞ SAHNESİ — TEK KAYNAK (single source of truth)
 *
 * Giriş sahnesi HER VİDEODA BİREBİR AYNIDIR:
 *   - Gemini üretmez (JSON şemasında ve prompt'ta yok)
 *   - Onay sayfasından değiştirilemez (salt okunur)
 *   - TTS her job'da yeniden seslendirmez (ses BİR KEZ üretilir, sonra hep o dosya)
 *
 * Bu dosyayı HEM Remotion bileşeni (remotion/src/scenes/IntroHelpers.ts)
 * HEM ses üretimi (scripts/03-seslendirme-uret.js) okur. Metni DEĞİŞTİRMEK
 * İÇİN SADECE BURAYI düzenle — iki taraf da otomatik uyar.
 *
 * ⚠ Metni değiştirirsen mevcut jess-intro-<dil>.mp3 dosyası ESKİ metni taşır.
 *   Drive'daki dosyayı sil; 03-seslendirme bir sonraki job'da yenisini üretir.
 *   (03 metin ile dosyayı karşılaştırmaz — dosya varsa kullanır.)
 *
 * Marka adı EKRANDA TİRELİ yazılır: "Geni-Mini Tests". Değiştirme.
 */

/** Varsayılan dil kodu. Çok dillilik için jess-intro-<dil>.mp3 yapısı kullanılır. */
export const JESS_INTRO_VARSAYILAN_DIL = "en";

/**
 * Sabit giriş metinleri, dil koduna göre.
 * Şu an sadece "en" var. Yeni dil eklemek için buraya bir satır ekle;
 * 03-seslendirme o dil için mp3'ü otomatik bir kez üretip Drive'a kaydeder.
 */
export const JESS_INTRO_METINLERI = {
  en: {
    // Uzun (yatay) format — intro sahnesinde ekranda yazan VE Jess'in konuştuğu metin
    long: "Hey curious minds! I'm Jess the Fox, and welcome to Geni-Mini Tests! Ready for today's fun challenge?",
    // Shorts (dikey) format — daha kısa
    shorts: "Hey, curious minds! Jess the Fox here… are you ready?",
  },
};

/** Dil kodunu normalize et; tanımsızsa varsayılana düş. */
export function jessIntroDil(dil) {
  const d = String(dil || "").toLowerCase().trim().slice(0, 5) || JESS_INTRO_VARSAYILAN_DIL;
  return JESS_INTRO_METINLERI[d] ? d : JESS_INTRO_VARSAYILAN_DIL;
}

/**
 * Giriş metnini döndür.
 * @param {"long"|"shorts"} format
 * @param {string} [dil] - "en" gibi. Tanımsızsa varsayılan.
 */
export function jessIntroMetni(format, dil) {
  const d = jessIntroDil(dil);
  const set = JESS_INTRO_METINLERI[d];
  return format === "shorts" ? set.shorts : set.long;
}

/**
 * Kalıcı ses dosyasının adı. Format'a göre değil DİLE göre ayrılır;
 * long/shorts aynı dilde farklı metin kullandığı için format da ada girer.
 * Örn: "jess-intro-en.mp3", "jess-intro-en-shorts.mp3"
 */
export function jessIntroSesDosyaAdi(format, dil) {
  const d = jessIntroDil(dil);
  return format === "shorts" ? `jess-intro-${d}-shorts.mp3` : `jess-intro-${d}.mp3`;
}

// Remotion tarafındaki eski isimlerle uyum (IntroHelpers bunları re-export eder)
export const LONG_GREETING_TEXT = JESS_INTRO_METINLERI.en.long;
export const SHORTS_GREETING_TEXT = JESS_INTRO_METINLERI.en.shorts;
