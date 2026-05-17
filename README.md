# GeniMini Tests v2 - Remotion Tabanlı Render

## 🎬 NE DEĞİŞTİ

Eski FFmpeg drawtext yaklaşımı tamamen bırakıldı. Artık **Remotion** kullanıyoruz.

Remotion = React komponentleri + Puppeteer (Chrome) + FFmpeg = profesyonel video.

### Avantajları
- Soru metni asla ekrandan TAŞMAZ (CSS auto-fit)
- Şeffaf PNG'ler doğru gözükür (CSS opacity)
- Spring animasyonları (slide-in, scale, pulse, glow)
- Doğru/yanlış cevap reveal'da yeşil glow + scale
- Geri sayım progress bar + büyük sayı pulse
- Drumroll suspense sahnesi
- Fun fact banner ayrı slide

### Render süresi
- Shorts (5 soru, ~2.5 dk): GitHub Actions'ta ~5-8 dk
- Long (25 soru, ~12.5 dk): GitHub Actions'ta ~20-30 dk

---

## 📁 REPO'YA EKLENMESİ GEREKEN DOSYALAR

### Yeni `/remotion/` klasörü (TÜMÜ YENİ)

```
remotion/
├── package.json
├── tsconfig.json
├── remotion.config.ts
└── src/
    ├── index.ts
    ├── Root.tsx
    ├── compositions/
    │   └── KidsQuizComposition.tsx
    ├── scenes/
    │   ├── IntroScene.tsx
    │   ├── QuestionScene.tsx
    │   └── OutroScene.tsx
    ├── components/
    │   ├── AnswerBox.tsx
    │   ├── CountdownTimer.tsx
    │   ├── FunFactBanner.tsx
    │   ├── HeaderBar.tsx
    │   ├── JessCharacter.tsx
    │   └── QuestionImage.tsx
    ├── styles/
    │   └── theme.ts
    ├── types/
    │   └── schemas.ts
    └── utils/
        └── timing.ts
```

### Üzerine yazılacak

| Dosya | Repo yolu |
|---|---|
| `07-video-montaj.js` | `scripts/07-video-montaj.js` |
| `07-video-montaj.yml` | `.github/workflows/07-video-montaj.yml` |

---

## 🛠️ KURULUM ADIMLARI (sabah yap)

### 1. Tüm dosyaları repo'ya yükle

GitHub web UI'dan elle yüklemek çok dosya, **GitHub Desktop** veya **git clone + push** kullan:

```bash
# Yerel'de:
git clone https://github.com/murturhan/bilgisok-otomasyon.git
cd bilgisok-otomasyon

# v2-remotion/ klasöründen dosyaları kopyala:
# scripts/07-video-montaj.js → bilgisok-otomasyon/scripts/
# workflows/07-video-montaj.yml → bilgisok-otomasyon/.github/workflows/
# remotion/* → bilgisok-otomasyon/remotion/

# Commit ve push
git add .
git commit -m "v2: Remotion-based video rendering"
git push origin main
```

### 2. .gitignore'a ekle (çok önemli!)

`remotion/.gitignore` dosyası oluştur veya repo kök dizinindeki `.gitignore`'a şu satırları ekle:

```
# Remotion
remotion/node_modules/
remotion/public/
remotion/.cache/
```

### 3. (Henüz yapılmadıysa) GitHub Secrets ekle

https://github.com/murturhan/bilgisok-otomasyon/settings/secrets/actions

- `GDRIVE_JESS_FOLDER_ID` = `1R6dy2JfGc_gqALMdawL5fLJRiFOgQPDZ`
- `GDRIVE_SFX_FOLDER_ID` = `1OQs3RvEuh32KeABqnLm9YuXkfL3jT2Pd`

(Diğer secrets değişmedi)

### 4. Test çalıştır

Pipedream'i tetikle veya Workflow Actions'tan **shorts** seç:
- TARIH: bugünün tarihi
- INDEX: 0
- VIDEO_FORMAT: shorts

Akış:
1. 01-icerik (Gemini, ~1 dk)
2. 02-gorsel, 03-seslendirme, 05-thumbnail paralel (~3-5 dk)
3. 4 dakika bekleme
4. **07-video-montaj** (Remotion render, ~5-8 dk)
5. Telegram'a video linki

---

## 🎨 TASARIM ÖZELLİKLERİ

### Renk paleti (theme.ts'te)
- Arka plan: mor → pembe gradient
- Vurgu: parlak sarı (#FFD600) + turuncu (#FF6B35) + mor (#7B4CDD)
- Doğru cevap: parlak yeşil + glow
- Yanlış cevap: gri + fade
- Tehlike (timer): kırmızı

### Sahne fazları (her soru = 28 saniye)
| Faz | Süre | Ne olur |
|---|---|---|
| Show | 0-3s | Görsel + soru metni slide-in |
| Countdown | 3-8s | 4 cevap kutusu + 5sn geri sayım + progress bar |
| Drumroll | 8-10s | "Drumroll..." sahnesi, suspense |
| Reveal | 10-13s | Doğru cevap green glow + büyük göster |
| Fun Fact | 13-22s | "Did You Know?" + bilgi metni |
| Transition | 22-25s | Whoosh fade |
| Rest | 25-28s | Nefes |

### Jess karakter
- Intro: el sallıyor (pose: intro)
- Soru süresince: işaret ediyor (pose: question)
- Geri sayım: düşünüyor (pose: thinking)
- Reveal: alkışlıyor (pose: correct)
- Outro: hoşçakal (pose: outro)

---

## 🚨 ÇIKARSAMA SORUNLARI

1. **Remotion ilk render uzun sürer** (~3 dk extra) - Chrome download yapması gerekiyor. Sonraki render'lar daha hızlı.

2. **Jess pose isimleri** Drive'da TAM şu olmalı:
   - `jess-intro.png`
   - `jess-question.png`
   - `jess-thinking.png`
   - `jess-correct.png`
   - `jess-outro.png`
   
   (Senin yüklediğin isimlerle uyuşuyor ✓)

3. **questions.json** 01-icerik-uret tarafından Drive'a yazılıyor (mevcut sistem, değişmedi).

---

## 🔧 ELİT TASARIM (yarın yapılacak küçük şeyler)

- [ ] Long layout test (Shorts test başarılı olduktan sonra)
- [ ] SFX ekleme (countdown tick, applause, drumroll) - Remotion `<Audio>` ile
- [ ] Background music volume duck (Jess konuşurken müzik kıs)
- [ ] Intro müziği vokalli (kids-happy/intro-outro-vocal.mp3)

---

## 📸 PREVIEW MOCK

`PREVIEW-mock.jpg` dosyasında 5 fazın görsel önizlemesi var.

---

## ❓ İLK TEST'TE HATA OLABİLECEK YERLER

1. **Chrome download** GitHub Actions'ta ilk seferinde uzun sürer. 2. seferden sonra cache'lenir.

2. **Jess karakter görünmezse**: questions.json'da `image_path` doğru set edilmiyor olabilir. 07-video-montaj.js log'unda "Jess pozları: ..." satırını izle.

3. **TypeScript hata verirse**: `remotion/` klasöründe `npm install` çalıştırılmamış olabilir. yml içinde "Remotion bağımlılıkları (pre-install)" step'i kontrol et.

Hata olursa log'u tam at, hızla çözeriz.

İyi sabahlar! 🌅
