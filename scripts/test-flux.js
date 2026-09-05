// REV 002/05SEP26 - --telegram bayragi: duz metin (parse_mode yok) sonuc raporu
/**
 * test-flux.js — Tek görsellik hızlı FLUX testi.
 *
 * 40 görsellik workflow'u çalıştırmadan, saniyeler içinde Cloudflare Workers AI
 * tarafında ne olduğunu görmek için. Yapılandırılmış TÜM hesapları sırayla dener,
 * her hesap için HTTP status + response body'nin TAMAMI + errors[] dizisini basar.
 *
 * Kullanım:
 *   node scripts/test-flux.js "a red apple"
 *   node scripts/test-flux.js                      → varsayılan prompt
 *   node scripts/test-flux.js "a red apple" --kaydet   → başarılı görseli /tmp'ye yazar
 *   node scripts/test-flux.js "a red apple" --wh       → ESKİ davranış: width/height DE gönderir
 *                                                        (parametrenin hataya sebep olup olmadığını kanıtlamak için)
 *   node scripts/test-flux.js "a red apple" --telegram → sonucu Telegram'a DÜZ METİN yollar
 *
 * Env: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (ve _2 .. _6)
 *      --telegram için ayrıca: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *
 * Bu script HİÇBİR workflow tetiklemez, Drive'a/Sheets'e yazmaz. Sadece okur ve raporlar.
 */

import fs from "fs";
import axios from "axios";
import { getCfAccounts, cfHataDetay, FLUX_MODEL, FLUX_MAX_STEPS } from "./lib/cloudflare.js";

const args = process.argv.slice(2);
const bayraklar = args.filter(a => a.startsWith("--"));
const PROMPT = args.filter(a => !a.startsWith("--"))[0] || "a red apple on a wooden table";
const KAYDET = bayraklar.includes("--kaydet");
const WIDTH_HEIGHT_GONDER = bayraklar.includes("--wh");
const TELEGRAM_YOLLA = bayraklar.includes("--telegram");
const STEPS = 4;

/**
 * Telegram'a DÜZ METİN yolla. lib/telegram.js parse_mode:"Markdown" kullanıyor;
 * hata gövdelerinde _ * [ ` gibi karakterler olduğu için Telegram 400 döndürebiliyor.
 * Bu yüzden burada parse_mode GÖNDERİLMİYOR — mesaj birebir düz metin gider.
 */
async function telegramDuzMetin(metin) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("⚠ Telegram atlandı: TELEGRAM_BOT_TOKEN veya TELEGRAM_CHAT_ID yok.");
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: metin.substring(0, 4000), // Telegram limiti 4096
      disable_web_page_preview: true,
    });
    console.log("✓ Telegram raporu gönderildi.");
  } catch (e) {
    const govde = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
    console.error(`Telegram gönderilemedi: ${govde}`);
  }
}

function maskele(s) {
  if (!s) return "(yok)";
  const t = String(s);
  return t.length <= 8 ? "****" : `${t.substring(0, 4)}…${t.substring(t.length - 4)} (${t.length} karakter)`;
}

function govdeMetni(data) {
  if (data === undefined || data === null) return "(bos govde)";
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (typeof data === "string") return data;
  try { return JSON.stringify(data, null, 2); } catch (e) { return String(data); }
}

async function hesabiDene(account, sira, toplam) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${FLUX_MODEL}`;

  // Resmi doküman (developers.cloudflare.com/workers-ai/models/flux-1-schnell/):
  // desteklenen input = prompt (max 2048), steps (max 8), seed. width/height YOK.
  const govde = { prompt: PROMPT, steps: Math.min(STEPS, FLUX_MAX_STEPS) };
  if (WIDTH_HEIGHT_GONDER) { govde.width = 1280; govde.height = 720; }

  console.log("");
  console.log("─".repeat(78));
  console.log(`[${sira}/${toplam}] ${account.name}`);
  console.log(`  account_id: ${maskele(account.accountId)}`);
  console.log(`  token:      ${maskele(account.token)}`);
  console.log(`  endpoint:   ${url.replace(account.accountId, "<ACCOUNT_ID>")}`);
  console.log(`  body:       ${JSON.stringify(govde)}`);

  const t0 = Date.now();
  try {
    const response = await axios({
      method: "POST",
      url,
      headers: { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" },
      data: govde,
      timeout: 120000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    const sure = Date.now() - t0;
    const img = response.data?.result?.image;

    if (!img) {
      console.log(`  ❌ HTTP ${response.status} ama result.image YOK (${sure}ms)`);
      console.log(`  TAM GÖVDE:\n${govdeMetni(response.data).substring(0, 4000)}`);
      return { ad: account.name, ok: false, status: response.status, not: "image alani bos" };
    }

    const buf = Buffer.from(img, "base64");
    console.log(`  ✅ HTTP ${response.status} — ${(buf.length / 1024).toFixed(0)}KB, ${sure}ms`);
    // Gerçek çözünürlüğü göster (width/height göndermeyince model ne üretiyor?)
    console.log(`  boyut: ${pngJpegBoyut(buf)}`);
    if (KAYDET) {
      const yol = `/tmp/test-flux-${account.name}.jpg`;
      fs.writeFileSync(yol, buf);
      console.log(`  💾 kaydedildi: ${yol}`);
    }
    return { ad: account.name, ok: true, status: response.status, kb: Math.round(buf.length / 1024), boyut: pngJpegBoyut(buf) };

  } catch (e) {
    const sure = Date.now() - t0;
    const d = cfHataDetay(e);
    console.log(`  ❌ HTTP ${d.status ?? "-"} (${d.tur}) — ${sure}ms`);
    if (d.errorsOzet) console.log(`  errors: ${d.errorsOzet}`);
    console.log(`  TAM GÖVDE:\n${(d.body || "(bos govde)").substring(0, 4000)}`);
    if (!d.status) console.log(`  ag/istisna: ${d.mesaj}`);
    return { ad: account.name, ok: false, status: d.status, tur: d.tur, not: d.errorsOzet || d.mesaj };
  }
}

/** JPEG/PNG başlığından genişlik-yükseklik oku (bağımlılık gerektirmeden). */
function pngJpegBoyut(buf) {
  try {
    // PNG: 8 bayt imza + IHDR
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)} (PNG)`;
    }
    // JPEG: SOF0/SOF2 markerini ara
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)} (JPEG)`;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return "boyut okunamadi (JPEG)";
    }
    return "bilinmeyen format";
  } catch (e) {
    return `boyut okunamadi (${e.message})`;
  }
}

async function main() {
  console.log("═".repeat(78));
  console.log("FLUX TEK GÖRSEL TESTİ");
  console.log(`  model:  ${FLUX_MODEL}`);
  console.log(`  prompt: "${PROMPT}"`);
  console.log(`  steps:  ${STEPS}`);
  console.log(`  width/height gönderiliyor mu: ${WIDTH_HEIGHT_GONDER ? "EVET (--wh)" : "HAYIR (model desteklemiyor)"}`);
  console.log("═".repeat(78));

  const whEtiket = WIDTH_HEIGHT_GONDER ? "width/height GONDERILDI" : "width/height GONDERILMEDI";

  let accounts;
  try {
    accounts = getCfAccounts();
  } catch (e) {
    console.error(`⛔ ${e.message}`);
    console.error("   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env değişkenlerini ayarla.");
    if (TELEGRAM_YOLLA) {
      await telegramDuzMetin(`FLUX TEST (${whEtiket})\nprompt: ${PROMPT}\n\nHIC CLOUDFLARE HESABI YAPILANDIRILMAMIS.\nCLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secret'lari eksik.`);
    }
    process.exit(1);
  }
  console.log(`${accounts.length} hesap yapılandırılmış: ${accounts.map(a => a.name).join(", ")}`);

  const sonuclar = [];
  for (let i = 0; i < accounts.length; i++) {
    sonuclar.push(await hesabiDene(accounts[i], i + 1, accounts.length));
  }

  console.log("");
  console.log("═".repeat(78));
  console.log("ÖZET");
  for (const s of sonuclar) {
    const durum = s.ok ? `✅ OK (${s.kb}KB)` : `❌ HTTP ${s.status ?? "-"} ${s.tur ? `(${s.tur})` : ""} ${s.not || ""}`;
    console.log(`  ${s.ad.padEnd(10)} ${durum}`);
  }
  const okSayisi = sonuclar.filter(s => s.ok).length;
  console.log(`  → ${okSayisi}/${sonuclar.length} hesap çalışıyor`);
  console.log("═".repeat(78));

  if (TELEGRAM_YOLLA) {
    // DÜZ METİN: backtick / yıldız / alt çizgi biçimlendirmesi YOK
    const satirlar = [
      `FLUX TEST SONUCU (${whEtiket})`,
      `model: ${FLUX_MODEL}`,
      `prompt: ${PROMPT}`,
      `steps: ${STEPS}`,
      "",
    ];
    for (const s of sonuclar) {
      if (s.ok) {
        satirlar.push(`${s.ad}: HTTP ${s.status} OK - ${s.kb}KB - ${s.boyut || "boyut bilinmiyor"}`);
      } else {
        satirlar.push(`${s.ad}: HTTP ${s.status ?? "-"} (${s.tur || "?"})`);
        if (s.not) satirlar.push(`  ${String(s.not).substring(0, 300)}`);
      }
    }
    satirlar.push("");
    satirlar.push(`SONUC: ${okSayisi}/${sonuclar.length} hesap calisiyor`);
    await telegramDuzMetin(satirlar.join("\n"));
  }

  process.exit(okSayisi > 0 ? 0 : 1);
}

main().catch(e => {
  console.error("BEKLENMEYEN HATA:", e.message);
  console.error(e.stack);
  process.exit(1);
});
