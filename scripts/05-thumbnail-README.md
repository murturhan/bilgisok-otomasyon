# 05 - Thumbnail Üretimi (v10 — Viral Edition)

GeniMini Tests kanalı için viral standartlarda YouTube thumbnail üreten modül.

## Ne Değişti? (v9 → v10)

**Mimari aynı:** `sharp` + SVG overlay + Cloudflare FLUX background + Drive'dan Jess PNG indirme + Telegram bildirimi. v9 ile pipeline tamamen geriye uyumlu.

**Görsel olarak yeniden tasarlandı:**

| # | Viral Standart                                  | v9            | v10                                          |
|---|--------------------------------------------------|---------------|----------------------------------------------|
| 1 | Yüksek kontrast bg                               | Mor→pembe panel | FLUX bg + center radial glow + vignette       |
| 2 | Jess köşede, abartılı pose                       | Var (sol alt) | Var + arkasında sarı radial glow halkası      |
| 3 | Büyük ana görsel                                 | -             | FLUX bg artık merkez vurgu ile öne çıkıyor    |
| 4 | Büyük kısa metin                                 | Tek renk sarı | 168–220px, kelime kelime farklı renk          |
| 5 | Çoklu renk metin                                 | Yok           | **`highlightPalette` rotasyonu**              |
| 6 | Stroke + shadow                                  | Siyah stroke  | Beyaz/sarı stroke + 2 katmanlı drop shadow    |
| 7 | Vignette / glow / radial gradient                | Yok           | **Hepsi SVG filter'ları ile**                 |
| 8 | "VS" formatı                                     | Yok           | **Otomatik tespit (`X vs Y`, `X mi Y mi`)**   |
| 9 | Çocuk dostu pastel                               | Var           | Var (palet: #FFE600 / #FF5BA7 / #5BE0FF / #7FFF7F / #FFB347) |
| 10 | Eğri CTA rozeti                                 | Yok           | **Yıldız patlaması + rotate edilmiş slogan**  |

## Layout Tipleri

Modül üç farklı layout üretir; girdiyi otomatik olarak değerlendirir:

### 1. LONG (1280×720) — yatay varsayılan
```
┌─────────────────────────────────────────────┐
│ FLUX bg + central glow + vignette           │
│ ┌──[Jess]──┐  ┌── BÜYÜK BAŞLIK PANELİ ───┐  │
│ │  glow    │  │  UZAY (sarı)              │  │
│ │  shocked │  │  GEZEGENLERİ (pembe)      │  │
│ │  pose    │  │  QUIZ (mavi)              │  │
│ └──────────┘  └──────────────────────────┘  │
│ [QUIZ!]                    [TAHMİN ET! ⭐]   │
└─────────────────────────────────────────────┘
```

### 2. SHORTS (1080×1920) — dikey
```
┌──────────────┐
│ [?]   [QUIZ!]│
│ ┌──────────┐ │
│ │ TITLE    │ │
│ │ (çoklu   │ │
│ │  renk)   │ │
│ └──────────┘ │
│              │
│   [Jess]     │
│   + glow     │
│              │
│ [15 SORU] [⭐]│
└──────────────┘
```

### 3. VS (her iki formatta)
Konu metni `vs` / `ve` / `mi…mi` kalıplarından birini içeriyorsa otomatik aktif:

```
┌─────────────────────────────────────┐
│ [QUIZ!]              [ZOR MU? ⭐]    │
│                                     │
│  KAPLAN     ╔══╗      ASLAN         │
│  (pembe)    ║VS║      (mavi)        │
│             ╚══╝                    │
│                                     │
└─────────────────────────────────────┘
```

## Kullanım

### Production (job pipeline, v9 ile aynı)

```bash
# Aynı env değişkenleri:
JOB_ID=<sheet_row_id> \
GDRIVE_JESS_FOLDER_ID=1R6dy2JfGc_gqALMdawL5fLJRiFOgQPDZ \
GDRIVE_SERVICE_ACCOUNT_JSON='...' \
GSHEETS_SPREADSHEET_ID='...' \
CLOUDFLARE_API_TOKEN='...' CLOUDFLARE_ACCOUNT_ID='...' \
TELEGRAM_BOT_TOKEN='...' \
node scripts/05-thumbnail-uret.js
```

Sheets'teki kolonlar (değişmedi):

| Kolon              | Açıklama                                              |
|--------------------|-------------------------------------------------------|
| `thumbnail_baslik` | 2-3 kelimelik kısa başlık (örn `UZAY QUIZ`)           |
| `thumbnail_prompt` | FLUX background prompt (sahne tarifi, "no creatures") |
| `konu`             | Ham konu (VS formatı tespiti buradan da yapılır)      |
| `drive_folder_id`  | Hedef Drive klasörü                                   |
| `chat_id`          | Telegram chat                                         |

Format otomatik: `drive_folder_id`'in klasör adı `-shorts-` içeriyorsa shorts, değilse long.

### Standalone Test (Drive/FLUX bağımlılığı olmadan)

```bash
cd scripts
node 05-thumbnail-test.js
# → ./test-output/ klasöründe 6 örnek thumbnail
```

Üretilen örnekler:
- `long-1-kisa.jpg` — Tek kelime (`DİNOZORLAR`)
- `long-2-uzun.jpg` — Çok kelime, kelime-kelime renk (`UZAY GEZEGENLERİ QUIZ`)
- `long-3-vs.jpg` — VS formatı (`KAPLAN VS ASLAN`)
- `shorts-1-kisa.jpg`, `shorts-2-uzun.jpg`, `shorts-3-vs.jpg` — dikey versiyonlar

### Programatik (yeni: export'lar)

```js
import {
  thumbnailUret,
  svgLong,
  svgShorts,
  svgVS,
  vsTespit,
  HIGHLIGHT_PALETTE,
} from "./scripts/05-thumbnail-uret.js";

// Sadece SVG üretmek için:
const svg = svgLong("HANGİSİ DOĞRU?", "seed");

// VS tespiti:
const vs = vsTespit("KAPLAN vs ASLAN");
// → { sol: "KAPLAN", sag: "ASLAN" }

// Tam render (FLUX bg + Jess overlay + composite):
const buffer = await thumbnailUret(
  promptFlux,         // FLUX bg prompt
  jessPngYolu,        // Jess PNG path (null olabilir)
  baslikKisa,         // başlık
  "long",             // "long" | "shorts"
  konuHam,            // VS tespiti için
  cfHesap,            // Cloudflare hesap obj
  jobSeed             // CTA seçimi için
);
```

## Tasarım Sistemi

### Renk Paleti (`theme.ts` ile bire bir)
- Sarı: `#FFE600`
- Pembe: `#FF5BA7`
- Mavi: `#5BE0FF`
- Yeşil: `#7FFF7F`
- Turuncu: `#FFB347`

Başlık kelimeleri bu paletten sırayla rotasyon yapar.

### Fontlar
- **Display**: `Lilita One` → `Fredoka` → `Baloo` → `Luckiest Guy` → `Impact` fallback
- **Body**: `Fredoka` → `Nunito` → Arial fallback

### Stroke & Shadow
- Long başlık: 12px beyaz stroke + `bigShadow` filter (2 katman drop-shadow)
- Shorts başlık: 16px beyaz stroke + aynı filter
- CTA rozeti: 6% iç beyaz stroke

### CTA Slogan Havuzu
`TAHMİN ET!`, `HANGİSİ?`, `%99 BİLEMİYOR!`, `BİL BAKALIM!`, `ŞOK!`, `VAY CANINA!`, `ZOR MU?`

Her job için deterministik (job seed'ten hash) bir slogan seçilir.

## Bağımlılıklar
- `sharp` — image composite + SVG rasterize (librsvg)
- `googleapis` — Drive okuma/yazma, Sheets job
- Mevcut `scripts/lib/*` — değişmedi

## Geriye Uyumluluk

- ✅ Aynı env değişkenleri
- ✅ Aynı Sheets kolonları
- ✅ Aynı çıktı yolu/format (`thumbnail-<format>-<ts>.jpg`)
- ✅ Aynı Drive upload klasörü (`05-thumbnail`)
- ✅ Aynı Telegram mesaj formatı
- ✅ Aynı exit code'lar

v9'u kullanan job'lar **kod değişikliği gerektirmeden** v10 ile çalışır.

## Bilinen Sınırlar
- FLUX bg üretimi başarısız olursa SVG fallback gradient devreye girer (pembe/sarı). Pipeline kırılmaz.
- VS modunda Jess overlay yok (split-screen estetiğini bozmamak için).
- 4 kelimeden fazla başlıklar 2 satıra otomatik bölünür; çok uzun başlıklar küçülmez (kasten — `thumbnail_baslik`'in 2-3 kelime olması beklenir).
