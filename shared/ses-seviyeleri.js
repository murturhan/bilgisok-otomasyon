// REV 002/19SEP26 - ORNEKLEME_HZ eklendi (loudnorm ciktiyi 96 kHz e tasiyordu)
/**
 * SES SEVİYELERİ — TEK KAYNAK
 *
 * Videodaki bütün ses seviyeleri BURADAN okunur. Kodun içinde dağınık sayı yok.
 * Ayar yapmak için SADECE bu dosyayı düzenle.
 *
 * Okuyanlar:
 *   - remotion/src/styles/theme.ts  (re-export eder, bileşenler oradan alır)
 *   - scripts/07-video-montaj.js    (render sonrası loudnorm hedefleri)
 *
 * ── İKİ KADEMELİ SES ZİNCİRİ ──────────────────────────────────────────────
 * 1) MIX (Remotion): aşağıdaki çarpanlar parçaların BİRBİRİNE göre dengesini
 *    belirler. Konuşma ana ses, müzik fon. Oranlar korunmalı.
 * 2) LOUDNESS (ffmpeg loudnorm): render sonrası TÜM mix ölçülüp hedef
 *    yüksekliğe normalize edilir ve true-peak sınırlanır.
 *
 * Toplam yüksekliği artırmanın DOĞRU yolu (2)'dir — çarpanı büyütmek kaynak
 * zaten yüksekse clipping (bozulma) yapar, sesi açmaz. Bu yüzden çarpanlar
 * ölçülü artırıldı, asıl kazanç loudnorm'dan geliyor.
 */

/** Remotion <Audio volume={...}> çarpanları. 1.0 = kaynak ses seviyesi. */
export const SES = {
  // ── KONUŞMA (Jess) — ana ses ───────────────────────────────────────────
  /** Soru ve cevap seslendirmesi (QuestionScene, WouldYouRatherScene) */
  KONUSMA_SORU: 2.8,          // eski: 2.4
  /** Konu duyurusu + kapanış duyurusu (başlık ekranı / outro sahnesi) */
  KONUSMA_DUYURU: 1.6,        // eski: 1.4
  /** Intro/outro ses parçası (KidsQuizComposition) */
  KONUSMA_INTRO_OUTRO: 2.5,   // eski: 2.2
  /** Jess karakter videosunun KENDİ sesi (TTS yoksa devreye girer) */
  JESS_VIDEO: 1.0,            // eski: 1.0 (değişmedi)

  // ── MÜZİK — fon, konuşmanın ÜSTÜNE ÇIKMAZ ──────────────────────────────
  /** Kimse konuşmazken */
  MUZIK_NORMAL: 0.11,         // eski: 0.09
  /** Jess konuşurken (ducking) */
  MUZIK_KONUSURKEN: 0.06,     // eski: 0.05
  /** Sahne geçişi (whoosh) sırasında kısa yükselme */
  MUZIK_GECIS: 0.23,          // eski: 0.20

  // ── SFX — dokunulmadı (kullanıcı şikâyeti yoktu) ───────────────────────
  SFX_POP: 0.5,
  SFX_POP_WYR: 0.8,
  SFX_TICK: 0.6,
  SFX_DRUM: 0.5,
  SFX_DRUM_WYR: 0.8,
  SFX_CORRECT: 0.5,
  SFX_WHOOSH: 1.0,
  SFX_PROGRESS: 0.5,
  SFX_PROGRESS_WYR: 0.4,
  SFX_APPLAUSE: 0.6,
};

/**
 * ffmpeg loudnorm hedefleri (render sonrası tek geçiş).
 * I   : hedef bütünleşik yükseklik (LUFS). YouTube ~-14 LUFS'a normalize eder;
 *       bu hedefle yüklerken sıkıştırma/kısma uygulanmaz.
 * TP  : true-peak tavanı (dBTP). -1.5 clipping'e karşı emniyet payı.
 * LRA : izin verilen yükseklik aralığı.
 */
export const LOUDNESS = {
  HEDEF_LUFS: -14,
  TEPE_DBTP: -1.5,
  ARALIK_LRA: 11,
  /** Normalize sonrası AAC bit hızı */
  AAC_BITRATE: "192k",
  /**
   * Normalize sonrası örnekleme hızı (Hz).
   * ZORUNLU: loudnorm filtresi içeride 192 kHz calisir. -ar verilmezse ffmpeg
   * cikisi AAC in destekledigi en yakin hiza (96 kHz) tasir — kaynak 48 kHz iken
   * dosya buyur, YouTube zaten 48 kHz e geri indirir. 48 kHz e sabitliyoruz.
   */
  ORNEKLEME_HZ: 48000,
};

/** 07-video-montaj'ın kullandığı ffmpeg ses filtresi dizesi. */
export function loudnormFiltresi() {
  return `loudnorm=I=${LOUDNESS.HEDEF_LUFS}:TP=${LOUDNESS.TEPE_DBTP}:LRA=${LOUDNESS.ARALIK_LRA}`;
}
