# 05 - Thumbnail Generator (v11 — Hero-Centric Edition)

Viral-standard YouTube thumbnail generator for the GeniMini Tests kids quiz channel.

## v10 → v11 Changes (user feedback: "not viral — put the topic at the center")

| # | Problem (v10)                              | Fix (v11)                                                        |
|---|--------------------------------------------|------------------------------------------------------------------|
| 1 | No topic-related visual                    | FLUX bg now comes as subject hero + optional topic image overlay |
| 2 | Huge purple right panel hid the scene      | Panel REMOVED; title now a thin top/bottom band                  |
| 3 | Cheap "QUIZ!" red circle                   | REMOVED                                                          |
| 4 | "?" blue circle (shorts)                   | REMOVED                                                          |
| 5 | Pastel gradient bg was washed out          | Per-topic WARM CONTRAST theme (Brain Time / Mind Warehouse style)|
| 6 | FLUX bg was being blurred                  | NO blur — topic stays sharp                                      |
| 7 | Jess was mandatory in every thumbnail      | OPTIONAL (`THUMB_USE_JESS=1` to enable)                          |
| 8 | VS layout was pink/blue                    | Per-theme warm vs blue                                           |
| 9 | No vignette                                | Strong radial vignette (75%) — focus on subject                  |

## Per-Topic Warm Contrast Themes

Theme is auto-selected from topic keywords (English):

| Theme      | Keywords                                                  | Palette (bg1 → bg2)       | Example                |
|------------|-----------------------------------------------------------|---------------------------|------------------------|
| `jurassic` | dinosaur, dino, jurassic, t-rex, fossil, prehistoric      | `#7C1D1D` → `#F59E0B`     | DINOSAURS              |
| `cosmic`   | space, planet, star, galaxy, moon, sun, astronaut, rocket | `#1E0A5C` → `#EC4899`     | SPACE ADVENTURE        |
| `wild`     | animal, tiger, lion, elephant, wolf, bear, panda, ...     | `#7F1D1D` → `#FB923C`     | WILD ANIMALS           |
| `juicy`    | fruit, strawberry, banana, apple, grape, watermelon, ...  | `#9F1239` → `#FBBF24`     | JUICY FRUITS           |
| `tasty`    | food, pizza, burger, candy, ice cream, cake, ...          | `#7C2D12` → `#F59E0B`     | PIZZA VS BURGER        |
| `ocean`    | sea, fish, shark, ocean, dolphin, whale, ...              | `#0C4A6E` → `#22D3EE`     | OCEAN ANIMALS          |
| `royal`    | (default fallback)                                        | `#3B0764` → `#FBBF24`     | any topic              |

You can extend by adding keywords to `TEMALAR.*.keywords` in `05-thumbnail-uret.js`.

## 3 Layout Types

### LONG 1280×720 — topic hero centered, title in BOTTOM band
```
┌──────────────────────────────────────────────────────┐
│ center warm glow + strong vignette                   │
│ GENIMINI TESTS · top-left micro            [CTA ⭐]  │
│                                                      │
│        [ TOPIC HERO — ~62% of height ]               │
│        (FLUX bg + optional topic overlay)            │
│                                                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ │   TITLE — word-by-word color — rotated -1.5°    │ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
└──────────────────────────────────────────────────────┘
```

### SHORTS 1080×1920 — topic hero centered, title in TOP band
```
┌──────────────┐
│ ━━━━━━━━━━━━ │
│ │   TITLE   │ │
│ ━━━━━━━━━━━━ │
│              │
│   [ TOPIC   │
│     HERO    │
│    ~60%   ] │
│              │
│         [⭐] │
│ GENIMINI…    │
└──────────────┘
```

### VS — split-screen warm vs blue + topic icons in each half
```
┌─────────────────────────────────┐
│  PIZZA              BURGER       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│            ┌────┐               │
│  🍕        │ VS │      🍔      │
│            └────┘               │
│   warm                blue       │
│                          [⭐]   │
└─────────────────────────────────┘
```

VS is auto-triggered when the topic contains `vs` (e.g., "PIZZA VS BURGER").

## Usage

### Production (job pipeline — same env/Sheets as v9/v10)

```bash
JOB_ID=<sheet_row_id> \
GDRIVE_JESS_FOLDER_ID=... \
GDRIVE_SERVICE_ACCOUNT_JSON='...' \
GSHEETS_SPREADSHEET_ID='...' \
CLOUDFLARE_API_TOKEN='...' CLOUDFLARE_ACCOUNT_ID='...' \
TELEGRAM_BOT_TOKEN='...' \
node scripts/05-thumbnail-uret.js
```

Sheets columns:

| Column                      | Changed? | Description                                  |
|-----------------------------|----------|----------------------------------------------|
| `thumbnail_baslik`          | same     | 2-3 word short title (e.g. "SPACE QUIZ")     |
| `thumbnail_prompt`          | same     | FLUX bg prompt — now "hero shot" style       |
| `konu`                      | same     | Raw topic (used for VS + theme detection)    |
| `thumbnail_subject_image`   | **NEW**  | Optional topic hero (file path)              |

### Optional Env

| Env                 | Default | Description                                     |
|---------------------|---------|-------------------------------------------------|
| `THUMB_USE_JESS=1`  | (off)   | Add Jess as a small corner mascot               |

### Standalone Test

```bash
node scripts/05-thumbnail-test.js
# → ./test-output/ — 6 theme samples (Twemoji hero placeholders)
```

Generated samples:
- `1-long-dinosaur.jpg` — jurassic theme, T-Rex hero
- `2-long-space.jpg` — cosmic theme, planet + rocket
- `3-shorts-animals.jpg` — wild theme, lion + elephant vertical
- `4-shorts-fruits.jpg` — juicy theme, strawberry + banana + grape diamond
- `5-long-vs-food.jpg` — tasty VS, pizza vs burger
- `6-shorts-vs-animals.jpg` — wild VS, tiger vs lion vertical

### Programmatic

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

const tema = temaSec("dinosaur era"); // { ad: "jurassic", bg1, bg2, ... }
const vs = vsTespit("TIGER VS LION");  // { sol: "TIGER", sag: "LION" }

const buffer = await thumbnailUret({
  prompt: "T-Rex roaring in volcanic landscape",
  baslikKisa: "DINOSAURS",
  format: "long",
  konu: "dinosaur",
  hesap: cfAccount,
  jobSeed: "abc",
  topicImagePath: "/path/to/optional-hero.png",  // optional
});
```

## Design System

### Typography
- **Display**: `Lilita One` → `Fredoka` → `Baloo` → `Luckiest Guy` → `Impact`
- Title: 110-220px (above/below the subject)
- White 14-18px stroke + 3-layer drop shadow

### Colors
- Word-by-word: `HIGHLIGHT_PALETTE` = `["#FFE600", "#FF5BA7", "#5BE0FF", "#7FFF7F", "#FFB347"]`
- Per-topic warm contrast: `TEMALAR` (jurassic/cosmic/wild/juicy/tasty/ocean/royal)

### CTA Slogan Pool (deterministic selection)
`GUESS!` · `WHICH ONE?` · `99% FAIL!` · `CAN YOU?` · `SHOCK!` · `NO WAY!` · `TOO HARD?`

## Backwards Compatibility
- ✅ Same env variables (new: optional `THUMB_USE_JESS`)
- ✅ Same Sheets columns (new: optional `thumbnail_subject_image`)
- ✅ Same output filename format (`thumbnail-<format>-<ts>.jpg`)
- ✅ Same Drive folder, same Telegram message format
- ✅ v9/v10 jobs run on v11 **without any code changes**

## Known Limits
- If FLUX bg fails → per-theme radial gradient fallback (pipeline never breaks)
- Extend keyword coverage by appending to `TEMALAR.<theme>.keywords` arrays
- No Jess in VS mode (preserves the split aesthetic)
