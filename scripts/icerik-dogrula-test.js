// REV 001/27EKI26 - icerik dogrulama gecisini mevcut bir questions.json uzerinde calistirir (yerel test, Drive'a YAZMAZ)
/**
 * Kullanim (PC):
 *   npm install --no-save @google/generative-ai
 *   $env:GEMINI_API_KEY="..."; node scripts/icerik-dogrula-test.js <questions.json | JOB_ID>
 *
 * JOB_ID verilirse questions.json gh + Drive public klasorden okunur (pc-comfy-gorsel ile ayni yol).
 * Sonuc sadece ekrana basilir; hicbir dosya degismez.
 */

import fs from "fs";
import { execFileSync } from "child_process";
import { icerikDogrula, dogrulamaUygula, dogrulamaOzetSatiri } from "./lib/icerik-dogrula.js";

const arg = process.argv[2];
if (!arg) { console.error("Kullanim: node scripts/icerik-dogrula-test.js <questions.json | JOB_ID>"); process.exit(1); }

async function klasorListele(id) {
  const h = await (await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`)).text();
  return h.split('<div class="flip-entry"').slice(1).map(b => ({
    id: (b.match(/id="entry-([^"]+)"/) || [])[1],
    name: (b.match(/flip-entry-title">([^<]+)/) || [])[1],
  })).filter(f => f.id && f.name);
}

async function questionsOku(a) {
  if (fs.existsSync(a)) return JSON.parse(fs.readFileSync(a, "utf8"));
  const out = execFileSync("gh", ["issue", "list", "--repo", "murturhan/bilgisok-otomasyon", "--state", "all",
    "--search", `${a} in:title`, "--json", "body", "-q", ".[0].body"]).toString();
  const folder = (out.match(/drive_folder_id"?\s*[:=]\s*"?([A-Za-z0-9_-]{20,})/) || [])[1];
  if (!folder) throw new Error(`${a}: drive_folder_id bulunamadi`);
  const ses = (await klasorListele(folder)).find(f => f.name === "02-ses");
  const qj = ses && (await klasorListele(ses.id)).find(f => f.name === "questions.json");
  if (!qj) throw new Error("02-ses/questions.json bulunamadi");
  return await (await fetch(`https://drive.google.com/uc?export=download&confirm=t&id=${qj.id}`)).json();
}

const data = await questionsOku(arg);
const qs = data.questions || [];
const t0 = Date.now();
const { kayitlar, hata } = await icerikDogrula(data.konu || data.baslik || "", qs, [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2]);
dogrulamaUygula(qs, kayitlar);
console.log(`\n${dogrulamaOzetSatiri(qs, hata)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
qs.forEach((q, i) => {
  const d = q.dogrulama;
  console.log(`Soru ${i + 1}: ${String(q.question_text || "").replace(/\*\*/g, "")}`);
  if (!d) console.log("  - kayit yok");
  else if (d.durum === "temiz") console.log("  ✓ temiz");
  else {
    console.log(`  ⚠ SUPHELI [${d.kontroller.join(", ")}] ${d.gerekce}`);
    if (d.oneri) console.log(`    oneri: ${d.oneri}`);
  }
});
