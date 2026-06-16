# 05 - Thumbnail Üretimi (v11 — Hero-Centric Edition)

GeniMini Tests kanalı için viral standartlarda YouTube thumbnail üreten modül.

## v10 → v11 Değişiklikleri (kullanıcı feedback: "viral değildi, konuyu merkeze al")

| # | Sorun (v10)                                | Çözüm (v11)                                                       |
|---|--------------------------------------------|-------------------------------------------------------------------|
| 1 | Konuyla ilgili görsel yoktu                | FLUX bg artık subject-hero olarak gelir + opsiyonel topic overlay |
| 2 | Sağda dev mor panel sahneyi kapatıyordu    | Panel KALDIRILDI; başlık ince alt/üst bant                        |
| 3 | "QUIZ!" kırmızı daire ucuz duruyordu       | KALDIRILDI                                                        |
| 4 | "?" mavi daire (shorts)                    | KALDIRILDI                                                        |
| 5 | Pastel gradient bg soluk + kontrastsızdı   | Per-topic WARM CONTRAST tema (Brain Time / Mind Warehouse tarzı)  |
| 6 | FLUX bg blur'lanıyordu                     | BLUR YOK — konu net görünür                                       |
| 7 | Jess her thumbnail'de zorunluydu           | OPSİYONEL (`THUMB_USE_JESS=1` ile aktif)                          |
| 8 | VS layout pembe/mavi (cinsiyetçi)          | Per-tema warm vs blue                                             |
| 9 | Vignette yoktu                             | Strong radial vignette (%75) — konuya odak                        |

## Per-Topic Warm Contrast Tema

Konu keyword'üne göre otomatik palet seçimi:

| Tema       | Anahtar Kelimeler              | Palet (bg1 → bg2)         | Örnek Konu             |
|------------|--------------------------------|---------------------------|------------------------|
| `jurassic` | dinozor, fosil, jurassic       | `#7C1D1D` → `#F59E0B`     | DİNOZORLAR             |
| `cosmic`   | uzay, gezegen, yıldız, galaksi | `#1E0A5C` → `#EC4899`     | UZAY MACERA            |
| `wild`     | hayvan, kaplan, aslan, fil...  | `#7F1D1D` → `#FB923C`     | VAHŞİ HAYVANLAR        |
| `juicy`    | meyve, çilek, muz, karpuz...   | `#9F1239` → `#FBBF24`     | RENKLİ MEYVELER        |
| `tasty`    | yemek, pizza, hamburger...     | `#7C2D12` → `#F59E0B`     | PIZZA VS HAMBURGER     |
| `ocean`    | deniz, balık, ahtapot, yunus   | `#0C4A6E` → `#22D3EE`     | DENİZ HAYVANLARI       |
| `royal`    | (default fallback)             | `#3B0764` → `#FBBF24`     | herhangi               |

## 3 Layout Tipi

### LONG 1280×720 — Konu hero merkez, başlık ALT bant
```
┌──────────────────────────────────────────────────────┐
│ center warm glow + strong vignette                   │
│ GENIMINI TESTS · sol-üst micro             [CTA ⭐]  │
│                                                      │
│        [ KONU GÖRSELİ — HERO ~%62 height ]           │
│        (FLUX bg + opsiyonel topic overlay)           │
│                                                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ │   BAŞLIK — kelime kelime renkli — rotate -1.5°  │ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
└──────────────────────────────────────────────────────┘
```

### SHORTS 1080×1920 — Konu hero merkez, başlık ÜST bant
```
┌──────────────┐
│ ━━━━━━━━━━━━ │
│ │  BAŞLIK   │ │
│ ━━━━━━━━━━━━ │
│              │
│   [ KONU    │
│     HERO    │
│     ~%60   ]│
│              │
│         [⭐] │
│ GENIMINI…    │
└──────────────┘
```

### VS — split-screen warm vs blue + konu icon'ları her yarıda
```
┌─────────────────────────────────┐
│  PIZZA              HAMBURGER   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│            ┌────┐               │
│  🍕        │ VS │      🍔      │
│            └────┘               │
│   warm                blue       │
│                          [⭐]   │
└─────────────────────────────────┘
```

VS otomatik tetiklenir: konu metni `vs` / `mi…mi` içeriyorsa.

## Kullanım

### Production (job pipeline — v9/v10 ile aynı env/Sheets)

```bash
JOB_ID=<sheet_row_id> \
GDRIVE_JESS_FOLDER_ID=1R6dy2JfGc_gqALMdawL5fLJRiFOgQPDZ \
GDRIVE_SERVICE_ACCOUNT_JSON='...' \
GSHEETS_SPREADSHEET_ID='...' \
CLOUDFLARE_API_TOKEN='...' CLOUDFLARE_ACCOUNT_ID='...' \
TELEGRAM_BOT_TOKEN='...' \
node scripts/05-thumbnail-uret.js
```

Sheets kolonları:

| Kolon                       | Değişti?    | Açıklama                                      |
|-----------------------------|-------------|-----------------------------------------------|
| `thumbnail_baslik`          | aynı        | 2-3 kelimelik kısa başlık                     |
| `thumbnail_prompt`          | aynı        | FLUX bg prompt — artık "hero shot" tarzında   |
| `konu`                      | aynı        | Ham konu (VS + tema tespiti)                  |
| `thumbnail_subject_image`   | **YENİ**    | Opsiyonel topic hero (Drive path)             |

### Opsiyonel Env

| Env                 | Varsayılan | Açıklama                                    |
|---------------------|------------|---------------------------------------------|
| `THUMB_USE_JESS=1`  | (off)      | Jess'i küçük köşe mascot'u olarak ekle     |

### Standalone Test

```bash
node scripts/05-thumbnail-test.js
# → ./test-output/ — 6 farklı tema thumbnail'i (Twemoji hero ile)
```

Üretilen örnekler:
- `1-long-dinozor.jpg` — jurassic tema, T-rex hero
- `2-long-uzay.jpg` — cosmic tema, gezegen + roket
- `3-shorts-hayvan.jpg` — wild tema, aslan + fil vertical
- `4-shorts-meyve.jpg` — juicy tema, çilek + muz + üzüm diamond
- `5-long-vs-yemek.jpg` — tasty VS, pizza vs hamburger
- `6-shorts-vs-hayvan.jpg` — wild VS, kaplan vs aslan vertical

### Programatik

```js
import {
  thumbnailUret,
  temaSec,
  svgLong,
  svgVS,
  svgVSBackground,
  vsTespit,
  HIGHLIGHT_PALETTE,
  TEMALAR,
} from "./scripts/05-thumbnail-uret.js";

const tema = temaSec("dinozor çağı"); // { ad: "jurassic", bg1, bg2, ... }
const vs = vsTespit("KAPLAN vs ASLAN"); // { sol: "KAPLAN", sag: "ASLAN" }

// Tam render:
const buffer = await thumbnailUret({
  prompt: "T-Rex roaring in volcanic landscape",
  baslikKisa: "DİNOZORLAR",
  format: "long",
  konu: "dinozor",
  hesap: cfHesap,
  jobSeed: "abc",
  topicImagePath: "/path/to/optional-hero.png",  // opsiyonel
});
```

## Tasarım Sistemi

### Tipografi
- **Display**: `Lilita One` → `Fredoka` → `Baloo` → `Luckiest Guy` → `Impact`
- 168-220px başlık (subject'in altında/üstünde)
- Beyaz 14-18px stroke + 3 katmanlı drop-shadow

### Renkler
- Kelime kelime: `HIGHLIGHT_PALETTE` = `["#FFE600", "#FF5BA7", "#5BE0FF", "#7FFF7F", "#FFB347"]`
- Per-topic warm contrast: `TEMALAR` (jurassic/cosmic/wild/juicy/tasty/ocean/royal)

### CTA Slogan Havuzu (deterministik seçim)
`TAHMİN ET!` · `HANGİSİ?` · `%99 BİLEMİYOR!` · `BİL BAKALIM!` · `ŞOK!` · `VAY CANINA!` · `ZOR MU?`

## Geriye Uyumluluk
- ✅ Aynı env değişkenleri (yeni: opsiyonel `THUMB_USE_JESS`)
- ✅ Aynı Sheets kolonları (yeni: opsiyonel `thumbnail_subject_image`)
- ✅ Aynı çıktı yolu (`thumbnail-<format>-<ts>.jpg`)
- ✅ Aynı Drive klasörü, aynı Telegram formatı
- ✅ v9/v10 job'ları **kod değişikliği gerektirmeden** v11 ile çalışır

## Bilinen Sınırlar
- FLUX bg başarısız olursa per-tema radial gradient fallback (pipeline kırılmaz)
- Konu keyword'leri TEMALAR.* keywords array'ine ekleyerek genişletilebilir
- VS modunda Jess yok (split estetiğini bozmamak için)
