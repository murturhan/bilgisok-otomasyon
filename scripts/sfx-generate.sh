#!/bin/bash
# 
# Quiz Blitz tarzı SFX'leri üret (ücretsiz, ffmpeg ile sentez)
# Sonra Drive'a 01-SFX/ klasörüne yükle, GDRIVE_SFX_FOLDER_ID env var doğru ayarla
#
# Üretilenler:
#   - countdown-fill.wav (5 saniyelik sıvı dolan progress bar sesi - Quiz Blitz tarzı)
#   - countdown-tick.wav (hızlı double tick - kalp atışı gibi)
#   - drum-roll.wav (1 saniyelik drum roll build-up)
#   - correct-ding.wav (parlak ding + sparkle)
#   - whoosh-transition.wav (kısa wipe sesi)
#
# Kullanım:
#   bash sfx-generate.sh
#   # Çıkan dosyaları Drive'a yükle:
#   #   01-SFX/countdown-fill.wav  (yeni)
#   #   01-SFX/countdown-tick.wav
#   #   01-SFX/drum-roll.wav
#   #   01-SFX/correct-ding.wav
#   #   01-SFX/whoosh-transition.wav

set -e

OUT_DIR="./sfx-output"
mkdir -p "$OUT_DIR"

# ─── 1. COUNTDOWN-FILL (sıvı dolan progress bar - Quiz Blitz tarzı) ─
# 5 saniyelik yumuşak yükselen + içinde hızlı tıkırtı kombinasyonu
# Filtreleme: yumuşak ton + hızlı palpitation
echo "🎵 1/5: countdown-fill.wav (sıvı dolan)..."
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5,volume=0.3" \
  -af "
    aevalsrc='0.3*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*8*t))':d=5,
    volume=2.0,
    afade=t=in:st=0:d=0.5,
    afade=t=out:st=4.5:d=0.5,
    highpass=f=200,
    lowpass=f=3000
  " "$OUT_DIR/countdown-fill.wav" 2>&1 | tail -3

# ─── 2. COUNTDOWN-TICK (Quiz Blitz hızlı double tick - kalp atışı) ──
# Son 2 saniye yüksek aciliyet hissi
echo "🎵 2/5: countdown-tick.wav (hızlı double tick)..."
ffmpeg -y -f lavfi -i "sine=frequency=1200:duration=0.05" \
  -f lavfi -i "anullsrc=duration=0.15" \
  -filter_complex "
    [0:a]volume=0.5[t1];
    [1:a][t1]concat=n=2:v=0:a=1[beat]
  " -map "[beat]" "$OUT_DIR/_single-tick.wav" 2>&1 | tail -2

# 10 tane peş peşe tek tick = 2 saniyelik tick loop
ffmpeg -y -stream_loop 9 -i "$OUT_DIR/_single-tick.wav" -c copy "$OUT_DIR/countdown-tick.wav" 2>&1 | tail -2
rm -f "$OUT_DIR/_single-tick.wav"

# ─── 3. DRUM-ROLL (1 saniyelik build-up) ──
echo "🎵 3/5: drum-roll.wav..."
ffmpeg -y -f lavfi -i "sine=frequency=60:duration=1" \
  -af "
    aevalsrc='0.5*sin(2*PI*60*t)*sin(2*PI*30*t*t)':d=1,
    volume=3.0,
    afade=t=in:st=0:d=0.1,
    afade=t=out:st=0.9:d=0.1,
    lowpass=f=200
  " "$OUT_DIR/drum-roll.wav" 2>&1 | tail -3

# ─── 4. CORRECT-DING (parlak ding + sparkle) ──
echo "🎵 4/5: correct-ding.wav..."
ffmpeg -y -f lavfi -i "sine=frequency=1320:duration=0.5" \
  -f lavfi -i "sine=frequency=1760:duration=0.5" \
  -filter_complex "
    [0:a]volume=0.4,afade=t=out:st=0.0:d=0.5[d1];
    [1:a]volume=0.3,afade=t=in:st=0.05:d=0.05,afade=t=out:st=0.1:d=0.4[d2];
    [d1][d2]amix=inputs=2:duration=longest[ding]
  " -map "[ding]" "$OUT_DIR/correct-ding.wav" 2>&1 | tail -3

# ─── 5. WHOOSH-TRANSITION (kısa wipe) ──
echo "🎵 5/5: whoosh-transition.wav..."
ffmpeg -y -f lavfi -i "anoisesrc=duration=0.4:amplitude=0.3:color=brown" \
  -af "
    highpass=f=200,
    lowpass=f=4000,
    afade=t=in:st=0:d=0.1,
    afade=t=out:st=0.3:d=0.1,
    volume=2.5
  " "$OUT_DIR/whoosh-transition.wav" 2>&1 | tail -3

echo ""
echo "✅ SFX'ler üretildi: $OUT_DIR/"
ls -la "$OUT_DIR"
echo ""
echo "Drive'a yükle: 01-SFX/ klasörüne (GDRIVE_SFX_FOLDER_ID)"
echo "Dosya adlarındaki anahtar kelimeler 07-video-montaj.js'in sfxIndir() fonksiyonu tarafından tanınır."
