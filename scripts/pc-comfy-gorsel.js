// REV 002/26EKI26 - video slotlari kare/hepsi'de atlanir, arka plan (slot 2N+1, background_prompt, 1280x720) eklendi
// REV 001/20EKI26 - PC tarafi: ComfyUI (Z-Image Turbo) ile 1328x800 gorsel uret, yedekle, Drive 01-gorseller'e gorsel-NN olarak yukle
/**
 * PC'de calisir (GitHub Actions'tan DEGIL — Actions PC'deki ComfyUI'ye erisemez).
 *
 * Kullanim:
 *   node scripts/pc-comfy-gorsel.js <JOB_ID> [--slots 01,03,05 | --slots kare | --slots hepsi] [--yukle]
 *
 *   --slots kare   (varsayilan) Drive'daki gorseli kare (1024x1024 = FLUX) olan veya gorseli hic
 *                  olmayan slotlar. Kullanicinin yukledigi gorsellere dokunulmaz. VIDEO slotlari atlanir.
 *   --slots hepsi  tum slotlar (2 x soru sayisi + arka plan 2N+1). VIDEO slotlari atlanir.
 *   --slots 01,03  acikca istenen slotlar — video olsa bile uretilir (bilerek istenmis).
 *   --yukle        uretilenleri Drive'a yukle. Yoksa sadece yerelde uretir (deneme).
 *
 *   Gecici klasorler os.tmpdir() altinda (Windows: TEMP). C: yerine D: icin:
 *     $env:TEMP="D:\AI\bilgisok-temp"; node scripts/pc-comfy-gorsel.js ...
 *
 * Akis:
 *   1. gh ile job issue'sundan drive_folder_id
 *   2. 02-ses/questions.json (public) -> image_prompt / fun_fact_image_prompt + stil
 *   3. 01-gorseller'deki TUM gorsel-NN dosyalari yerel yedek klasorune indirilir
 *   4. ComfyUI (COMFY_URL, varsayilan http://127.0.0.1:8188) Z-Image Turbo 1328x800
 *   5. --yukle: worker /api/upload-medya ile gorsel-NN.jpg (worker ayni slotun eskisini siler)
 *
 * Gereken: gh (login), ffmpeg/ffprobe, ComfyUI acik, z_image_turbo_bf16 + qwen_3_4b + ae modelleri.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { GORSEL_STILLERI, DEFAULT_STIL } from "./lib/gorsel-stilleri.js";

const WORKER = "https://telegram-to-github.murturhan.workers.dev";
const REPO = "murturhan/bilgisok-otomasyon";
const COMFY = process.env.COMFY_URL || "http://127.0.0.1:8188";
const GEN = 1328, YUK = 800; // ~1.66 oran = LongLayout cercevesi 885x535; 16'nin kati
// Arka plan tum kareyi (1920x1080) kaplar -> 16:9. 1280x720 = 16'nin kati, soru gorseliyle ayni ~1 MP
const BG_GEN = 1280, BG_YUK = 720;

const args = process.argv.slice(2);
const JOB_ID = args.find(a => !a.startsWith("--"));
const argDeger = (ad) => { const i = args.indexOf(ad); return i >= 0 ? args[i + 1] : undefined; };
const SLOT_ARG = argDeger("--slots") || "kare";
const YUKLE = args.includes("--yukle");
if (!JOB_ID) { console.error("Kullanim: node scripts/pc-comfy-gorsel.js <JOB_ID> [--slots kare|hepsi|01,03] [--yukle]"); process.exit(1); }

// 02-gorsel-uret.js cleanGorselPrompt ile ayni temizlik (orada export yok, kopya)
function cleanGorselPrompt(p) {
  if (!p) return "";
  p = p.replace(/jess\s*(the\s*)?fox|jess\s*karakteri?|fox\s*character|fox\s*mascot|the\s*fox\s*mascot|cartoon\s+fox|a\s+fox\s+wearing|a\s+fox\s+holding|a\s+fox\s+presenting|fox\s+holding|fox\s+presenting/gi, "");
  p = p.replace(/\(\s*\)/g, "");
  p = p.replace(/watercolor\s+painting(?:\s+style)?|pencil\s+sketch(?:\s+style)?|(?:pixar|cartoon|anime|watercolor|pencil\s*sketch|realistic)[\s-]*(?:3d\s+)?(?:animation\s+)?style|pixar\s*3d|photorealistic|3d\s+animation|stylized|\bcartoon\b|\bfriendly\b|\bcute\b|\badorable\b|\billustration\b|\brendered\b|\billustrated\b|\banimated\b|\bwhimsical\b|\bcharming\b|\bdelightful\b/gi, "");
  p = p.replace(/\bTurkey\b/gi, "Turkiye");
  return p.replace(/,\s*,+/g, ",").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
}

// Public klasor listesi (embeddedfolderview) -> [{name, id}]
async function klasorListele(id) {
  const h = await (await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`)).text();
  return h.split('<div class="flip-entry"').slice(1).map(b => ({
    id: (b.match(/id="entry-([^"]+)"/) || [])[1],
    name: (b.match(/flip-entry-title">([^<]+)/) || [])[1],
  })).filter(f => f.id && f.name);
}

async function driveIndir(id, hedef) {
  const r = await fetch(`https://drive.google.com/uc?export=download&confirm=t&id=${id}`);
  if (!r.ok) throw new Error(`indirme ${r.status} (${id})`);
  fs.writeFileSync(hedef, Buffer.from(await r.arrayBuffer()));
}

function boyut(dosya) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", dosya]).toString().trim();
  const [w, h] = out.split(",").map(Number);
  return { w, h };
}

function workflow(prompt, seed, onek, en = GEN, boy = YUK) {
  return {
    "3": { class_type: "KSampler", inputs: { seed, steps: 8, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", denoise: 1, model: ["11", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["13", 0] } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["18", 0] } },
    "7": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["6", 0] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["17", 0] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: onek, images: ["8", 0] } },
    "11": { class_type: "ModelSamplingAuraFlow", inputs: { shift: 3, model: ["16", 0] } },
    "13": { class_type: "EmptySD3LatentImage", inputs: { width: en, height: boy, batch_size: 1 } },
    "16": { class_type: "UNETLoader", inputs: { unet_name: "z_image_turbo_bf16.safetensors", weight_dtype: "default" } },
    "17": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    "18": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b.safetensors", type: "lumina2" } },
  };
}

async function comfyUret(prompt, seed, onek, en, boy) {
  const r = await fetch(`${COMFY}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow(prompt, seed, onek, en, boy) }) });
  if (!r.ok) throw new Error(`ComfyUI /prompt ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const { prompt_id } = await r.json();
  const bas = Date.now();
  while (Date.now() - bas < 300000) {
    await new Promise(res => setTimeout(res, 1000));
    const h = await (await fetch(`${COMFY}/history/${prompt_id}`)).json();
    const kayit = h[prompt_id];
    if (!kayit) continue;
    if (kayit.status?.status_str === "error") throw new Error(`ComfyUI hata: ${JSON.stringify(kayit.status.messages).slice(0, 300)}`);
    const img = kayit.outputs?.["9"]?.images?.[0];
    if (img) {
      const v = await fetch(`${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`);
      return Buffer.from(await v.arrayBuffer());
    }
  }
  throw new Error("ComfyUI zaman asimi (300s)");
}

async function main() {
  const zaman = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  const yedekDir = path.join(os.tmpdir(), `bilgisok_backup_gorsel_${JOB_ID}_${zaman}`);
  const ciktiDir = path.join(os.tmpdir(), `bilgisok_comfy_${JOB_ID}_${zaman}`);
  fs.mkdirSync(yedekDir, { recursive: true });
  fs.mkdirSync(ciktiDir, { recursive: true });

  // 1. job -> drive_folder_id
  const liste = JSON.parse(execFileSync("gh", ["issue", "list", "-R", REPO, "--state", "all", "--search", `worker-job:${JOB_ID} in:title`, "--json", "number,title"]).toString());
  const issue = liste.find(i => i.title === `worker-job:${JOB_ID}`);
  if (!issue) throw new Error(`issue bulunamadi: worker-job:${JOB_ID}`);
  const body = JSON.parse(execFileSync("gh", ["issue", "view", String(issue.number), "-R", REPO, "--json", "body", "-q", ".body"], { maxBuffer: 64 << 20 }).toString());
  const folderId = body.job?.drive_folder_id;
  if (!folderId) throw new Error("drive_folder_id yok");

  // 2. questions.json
  const anaListe = await klasorListele(folderId);
  const gorselKlasor = anaListe.find(f => f.name === "01-gorseller");
  const sesKlasor = anaListe.find(f => f.name === "02-ses");
  if (!gorselKlasor) throw new Error("01-gorseller bulunamadi (klasor public mi?)");
  let qDosya = anaListe.find(f => f.name === "questions.json");
  if (!qDosya && sesKlasor) qDosya = (await klasorListele(sesKlasor.id)).find(f => f.name === "questions.json");
  if (!qDosya) throw new Error("questions.json bulunamadi");
  const qYol = path.join(yedekDir, "questions.json");
  await driveIndir(qDosya.id, qYol);
  const qData = JSON.parse(fs.readFileSync(qYol, "utf8"));
  const questions = qData.questions || [];
  console.log(`Job ${JOB_ID}: ${questions.length} soru, 01-gorseller=${gorselKlasor.id}`);

  // 3. YEDEK: tum gorsel-NN dosyalari
  const gorseller = (await klasorListele(gorselKlasor.id)).filter(f => /^gorsel-\d+[-.]/.test(f.name));
  const slotDosya = new Map();
  for (const f of gorseller) {
    const hedef = path.join(yedekDir, f.name);
    await driveIndir(f.id, hedef);
    slotDosya.set(parseInt(f.name.match(/^gorsel-(\d+)/)[1], 10), { ...f, yol: hedef, ...boyut(hedef) });
  }
  console.log(`💾 Yedek: ${gorseller.length} gorsel -> ${yedekDir}`);

  // VIDEO slotlari: 01-gorseller'deki video-NN dosyasi VEYA questions.json video URL'i (02-gorsel-uret ile ayni alanlar).
  // FLUX video slotuna da kare gorsel uretiyor; o gorsel render'da gorunmez, ama uzerine yazmak yanlis slota dokunmak olur.
  const videoSlot = new Set((await klasorListele(gorselKlasor.id)).map(f => (f.name.match(/^video-(\d+)[-.]/) || [])[1]).filter(Boolean).map(n => parseInt(n, 10)));
  questions.forEach((q, i) => {
    const wyr = q.question_type === "would_you_rather";
    if (wyr ? q.visible_option?.video_url : (q.question_video_url || q.uploaded_video_url)) videoSlot.add(2 * i + 1);
    if (wyr ? q.surprise_option?.surprise_video_url : (q.fun_fact_video_url || q.uploaded_fact_video_url)) videoSlot.add(2 * i + 2);
  });

  // Slot secimi (arka plan = 2N+1, worker/02.5 ile ayni)
  const BG_SLOT = questions.length * 2 + 1;
  const toplam = BG_SLOT;
  const tumSlotlar = Array.from({ length: toplam }, (_, i) => i + 1);
  let slotlar;
  if (SLOT_ARG === "hepsi") slotlar = tumSlotlar.filter(s => !videoSlot.has(s));
  else if (SLOT_ARG === "kare") slotlar = tumSlotlar.filter(s => !videoSlot.has(s) && (!slotDosya.has(s) || slotDosya.get(s).w === slotDosya.get(s).h));
  else slotlar = SLOT_ARG.split(",").map(s => parseInt(s, 10)).filter(n => n >= 1 && n <= toplam);
  const atlanan = SLOT_ARG === "hepsi" || SLOT_ARG === "kare" ? [...videoSlot].filter(s => s <= toplam).sort((a, b) => a - b) : [];
  console.log(`🎬 Video slotlari: ${[...videoSlot].sort((a, b) => a - b).map(s => String(s).padStart(2, "0")).join(", ") || "yok"}${atlanan.length ? " (atlandi)" : ""}`);
  console.log(`🎯 Slotlar (${SLOT_ARG}): ${slotlar.map(s => String(s).padStart(2, "0") + (s === BG_SLOT ? "(arka plan)" : "")).join(", ") || "yok"}`);

  // 4. Uret (+ 5. yukle)
  const sonuc = [];
  for (const slot of slotlar) {
    const bg = slot === BG_SLOT;
    const qi = Math.floor((slot - 1) / 2); // arka planda N -> worker: soruIdx=N + slotKey=image = 2N+1
    const fact = !bg && slot % 2 === 0;
    const q = bg ? {} : questions[qi];
    const slotStr = String(slot).padStart(2, "0");
    let base, stili;
    if (bg) {
      base = qData.background_prompt;
    } else if (q.question_type === "would_you_rather") {
      base = fact ? q.surprise_option?.surprise_image_prompt : q.visible_option?.image_prompt;
      stili = fact ? q.surprise_option?.surprise_image_stili : q.visible_option?.image_stili;
    } else {
      base = fact ? q.fun_fact_image_prompt : q.image_prompt;
      stili = fact ? q.fact_image_stili : q.question_image_stili;
    }
    if (!base) { console.warn(`slot ${slotStr}: prompt yok, atlandi`); continue; }
    const prompt = cleanGorselPrompt(base) + (GORSEL_STILLERI[stili || DEFAULT_STIL]?.promptAppend || "");
    const seed = 1000 + slot;
    const t0 = Date.now();
    const png = await comfyUret(prompt, seed, `bilgisok/${JOB_ID}/gorsel-${slotStr}`, bg ? BG_GEN : GEN, bg ? BG_YUK : YUK);
    const pngYol = path.join(ciktiDir, `gorsel-${slotStr}.png`);
    const jpgYol = path.join(ciktiDir, `gorsel-${slotStr}.jpg`);
    fs.writeFileSync(pngYol, png);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", pngYol, "-q:v", "2", jpgYol]);
    const b = boyut(jpgYol);
    let durum = "yerelde";
    if (YUKLE) {
      const fd = new FormData();
      fd.append("file", new Blob([fs.readFileSync(jpgYol)], { type: "image/jpeg" }), `gorsel-${slotStr}.jpg`);
      const slotKey = fact ? (q.question_type === "would_you_rather" ? "surprise_image" : "fact_image") : (q.question_type === "would_you_rather" ? "visible_image" : "image");
      const r = await fetch(`${WORKER}/api/upload-medya/${JOB_ID}/${qi}/${slotKey}`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(`slot ${slotStr} yukleme hatasi: ${r.status} ${j.error || ""}`);
      durum = `Drive ok (${j.file_id})`;
    }
    console.log(`gorsel ${slotStr}: ${b.w}x${b.h} ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${durum}`);
    sonuc.push(slotStr);
  }
  console.log(`✅ ${sonuc.length}/${slotlar.length} slot. Cikti: ${ciktiDir}  Yedek: ${yedekDir}`);
}

main().catch(e => { console.error("HATA:", e.message); process.exit(1); });
