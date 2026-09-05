// REV 001/05SEP26 - width/height KALDIRILDI (flux-1-schnell desteklemiyor), tam hata govdesi loglaniyor, 401/403 (token) ile 429 (kota) ayri raporlaniyor
/**
 * Cloudflare Workers AI (FLUX) - Multi-account rotation
 *
 * Değişiklikler:
 * - Manuel CLOUDFLARE_HESAP_A_KOTADA flag'i KALDIRILDI (429 zaten otomatik tespit ediliyor)
 * - Hesap-D desteği eklendi (CLOUDFLARE_API_TOKEN_4 + CLOUDFLARE_ACCOUNT_ID_4)
 * - 05SEP26: @cf/black-forest-labs/flux-1-schnell SADECE prompt/steps/seed kabul eder.
 *   width/height gönderilmiyor (resmi doküman: parametre listesinde yok). Model kendi
 *   doğal çözünürlüğünde üretir; Remotion tarafında objectFit:"cover" ile kırpılıyor.
 * - 05SEP26: Hata yakalandığında HTTP status + response body'nin TAMAMI + Cloudflare
 *   errors[] dizisi (code/message) + hangi hesap + kaçıncı görsel loglanıyor.
 */

import axios from "axios";

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN_2,
  CLOUDFLARE_ACCOUNT_ID_2,
  CLOUDFLARE_API_TOKEN_3,
  CLOUDFLARE_ACCOUNT_ID_3,
  CLOUDFLARE_API_TOKEN_4,
  CLOUDFLARE_ACCOUNT_ID_4,
  CLOUDFLARE_API_TOKEN_5,
  CLOUDFLARE_ACCOUNT_ID_5,
  CLOUDFLARE_API_TOKEN_6,
  CLOUDFLARE_ACCOUNT_ID_6,
} = process.env;

// Resmi doküman: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
// Desteklenen input: prompt (zorunlu, max 2048 karakter), steps (opsiyonel, default 4, max 8),
//                    seed (opsiyonel, pozitif tamsayı)
// DESTEKLENMEYEN: width, height  → gönderilirse istek reddedilebilir (HTTP 400).
export const FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";
export const FLUX_MAX_STEPS = 8;
export const FLUX_MAX_PROMPT = 2048;

export function getCfAccounts() {
  const accounts = [];
  const candidates = [
    { token: CLOUDFLARE_API_TOKEN,   accountId: CLOUDFLARE_ACCOUNT_ID,   name: "Hesap-A" },
    { token: CLOUDFLARE_API_TOKEN_2, accountId: CLOUDFLARE_ACCOUNT_ID_2, name: "Hesap-B" },
    { token: CLOUDFLARE_API_TOKEN_3, accountId: CLOUDFLARE_ACCOUNT_ID_3, name: "Hesap-C" },
    { token: CLOUDFLARE_API_TOKEN_4, accountId: CLOUDFLARE_ACCOUNT_ID_4, name: "Hesap-D" },
    { token: CLOUDFLARE_API_TOKEN_5, accountId: CLOUDFLARE_ACCOUNT_ID_5, name: "Hesap-E" },
    { token: CLOUDFLARE_API_TOKEN_6, accountId: CLOUDFLARE_ACCOUNT_ID_6, name: "Hesap-F" },
  ];
  for (const c of candidates) {
    if (c.token && c.accountId) accounts.push(c);
  }

  if (accounts.length === 0) {
    throw new Error("Hiç Cloudflare hesabı yapılandırılmamış!");
  }
  return accounts;
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** account_id / token gibi gizli değerleri log'da maskele. */
function maskele(s) {
  if (!s) return "(yok)";
  const t = String(s);
  if (t.length <= 8) return "****";
  return `${t.substring(0, 4)}…${t.substring(t.length - 4)} (${t.length} karakter)`;
}

/**
 * Axios hatasından Cloudflare'in GERÇEK cevabını çıkar.
 * Cloudflare hata gövdesi: { success:false, errors:[{code, message}], messages:[], result:null }
 *
 * @returns {{status:number|null, body:string, errorsOzet:string, tur:string, mesaj:string}}
 *   tur: "token" (401/403) | "kota" (429) | "istek" (400/422) | "sunucu" (5xx) | "ag" (timeout/DNS) | "bilinmiyor"
 */
export function cfHataDetay(e) {
  const status = e?.response?.status ?? null;
  const data = e?.response?.data;

  let body = "";
  if (data === undefined || data === null) {
    body = "";
  } else if (Buffer.isBuffer(data)) {
    body = data.toString("utf8");
  } else if (typeof data === "string") {
    body = data;
  } else {
    try { body = JSON.stringify(data); } catch (_) { body = String(data); }
  }

  // errors[] dizisini AÇIKÇA çıkar (code + message)
  let errorsOzet = "";
  try {
    let obj = (data && typeof data === "object" && !Buffer.isBuffer(data)) ? data : null;
    if (!obj && body) obj = JSON.parse(body);
    if (Array.isArray(obj?.errors) && obj.errors.length) {
      errorsOzet = obj.errors.map(er => `code=${er?.code ?? "?"} message="${er?.message ?? "?"}"`).join(" | ");
    }
  } catch (_) { /* body JSON degil, ham hali zaten loglaniyor */ }

  let tur = "bilinmiyor";
  if (status === 401 || status === 403) tur = "token";
  else if (status === 429) tur = "kota";
  else if (status === 400 || status === 422) tur = "istek";
  else if (status && status >= 500 && status < 600) tur = "sunucu";
  else if (!status) tur = "ag";

  return { status, body, errorsOzet, tur, mesaj: e?.message || "" };
}

let istekSablonuLoglandi = false;

// Tek bir FLUX çağrısı
export async function fluxCagri(prompt, account, opts = {}) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${FLUX_MODEL}`;

  // SADECE dokümanda geçen parametreler gönderilir. width/height BİLEREK yok.
  const govde = { prompt: String(prompt).substring(0, FLUX_MAX_PROMPT) };
  const steps = Number(opts.steps || 4);
  if (Number.isFinite(steps) && steps > 0) govde.steps = Math.min(steps, FLUX_MAX_STEPS);
  if (opts.seed !== undefined && opts.seed !== null) govde.seed = opts.seed;

  // İlk istekte bir kez: ne gönderdiğimizi açıkça yaz (kör uçuş olmasın)
  if (!istekSablonuLoglandi) {
    istekSablonuLoglandi = true;
    console.log("🔧 FLUX istek şablonu (ilk istek):");
    console.log(`   model:      ${FLUX_MODEL}`);
    console.log(`   endpoint:   https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/run/${FLUX_MODEL}`);
    console.log(`   account_id: ${maskele(account.accountId)}  token: ${maskele(account.token)}`);
    console.log(`   body:       ${JSON.stringify({ ...govde, prompt: `${String(prompt).substring(0, 60)}… (${String(prompt).length} karakter)` })}`);
    console.log(`   not:        flux-1-schnell SADECE prompt/steps/seed kabul eder — width/height GÖNDERİLMİYOR`);
  }

  const response = await axios({
    method: "POST",
    url: url,
    headers: {
      Authorization: `Bearer ${account.token}`,
      "Content-Type": "application/json",
    },
    data: govde,
    timeout: 120000,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  if (!response.data?.result?.image) {
    // Başarı statüsü geldi ama image yok → gövdeyi göster
    let ozet = "";
    try { ozet = JSON.stringify(response.data).substring(0, 400); } catch (_) { ozet = String(response.data); }
    throw new Error(`FLUX.1 image alanı boş. Gövde: ${ozet}`);
  }

  return Buffer.from(response.data.result.image, "base64");
}

// Rotation'la N adet görsel üret (callback ile her buffer'ı işlersin)
export async function fluxRotationCagri(prompts, opts = {}) {
  const accounts = getCfAccounts();
  const ISTEKLER_ARASI_MS = opts.istekler_arasi_ms || 7000;
  const MAX_RETRY = opts.max_retry || 3;
  const RETRY_BEKLEME_MS = opts.retry_bekleme_ms || [10000, 30000, 60000];
  const onSuccess = opts.onSuccess; // (index, buffer) => Promise

  // NOT: opts.width / opts.height artık YOK SAYILIYOR (model desteklemiyor).
  if (opts.width || opts.height) {
    console.log(`ℹ width/height (${opts.width || "-"}x${opts.height || "-"}) yok sayıldı: ${FLUX_MODEL} bu parametreleri desteklemiyor.`);
  }

  console.log(`${prompts.length} FLUX çağrısı (${accounts.length} hesap: ${accounts.map(a => a.name).join(", ")}, model ${FLUX_MODEL})...`);

  const sonuclar = [];
  const hatalar = [];
  const hesapKotaDolu = new Array(accounts.length).fill(false);
  const hesapTokenGecersiz = new Array(accounts.length).fill(false);
  // Hesap bazlı istatistik: 40 hatanın hepsi aynı hesapta mı oldu, loglardan görülsün
  const istatistik = accounts.map(a => ({
    ad: a.name, ok: 0, kota: 0, token: 0, istek: 0, sunucu: 0, ag: 0, bilinmiyor: 0,
  }));
  let ardArdaIstekHatasi = 0; // 400/422 üst üste gelirse erken dur (boşuna 40x6x3 istek atma)

  for (let i = 0; i < prompts.length; i++) {
    let basarili = false;
    let sonHata = "";
    let sonDetay = null;
    let sonHesapAdi = "";
    let buGorseldeIstekHatasi = false;

    let oncelikliHesap = Math.min(Math.floor(i / Math.ceil(prompts.length / accounts.length)), accounts.length - 1);
    const hesapSirasi = [oncelikliHesap];
    for (let j = 0; j < accounts.length; j++) {
      if (j !== oncelikliHesap) hesapSirasi.push(j);
    }

    for (const hesapIdx of hesapSirasi) {
      if (hesapKotaDolu[hesapIdx] || hesapTokenGecersiz[hesapIdx]) continue;

      const account = accounts[hesapIdx];

      for (let retry = 1; retry <= MAX_RETRY; retry++) {
        try {
          console.log(`  ${i + 1}/${prompts.length} (${account.name}, ${retry}/${MAX_RETRY})...`);
          const buffer = await fluxCagri(prompts[i], account, { steps: opts.steps, seed: opts.seed });

          if (onSuccess) {
            await onSuccess(i, buffer);
          }

          sonuclar.push({ index: i, size: buffer.length, account: account.name });
          istatistik[hesapIdx].ok++;
          console.log(`  ✓ ${i + 1} OK (${(buffer.length / 1024).toFixed(0)}KB) [${account.name}]`);
          basarili = true;
          break;
        } catch (e) {
          const d = cfHataDetay(e);
          sonDetay = d;
          sonHesapAdi = account.name;
          sonHata = `HTTP ${d.status ?? "-"} [${d.tur}] ${d.errorsOzet || d.mesaj}`;
          istatistik[hesapIdx][d.tur]++;

          // ── HATAYI GÖRÜNÜR YAP: status + hesap + görsel + errors[] + TAM gövde ──
          console.error(`FLUX HATA [${account.name}] gorsel ${i + 1}/${prompts.length} deneme ${retry}/${MAX_RETRY} -> HTTP ${d.status ?? "-"} (${d.tur})`);
          if (d.errorsOzet) console.error(`  errors: ${d.errorsOzet}`);
          console.error(`  body: ${d.body ? d.body.substring(0, 800) : "(bos govde)"}`);
          if (!d.status) console.error(`  ag/istisna: ${d.mesaj}`);

          if (d.tur === "token") {
            // 401/403 → token geçersiz/yetkisiz. Retry anlamsız, bu hesabı komple bırak.
            console.error(`  ⛔ ${account.name} TOKEN GEÇERSİZ/YETKİSİZ (HTTP ${d.status}). Bu hesap devre dışı bırakıldı.`);
            hesapTokenGecersiz[hesapIdx] = true;
            break;
          }

          if (d.tur === "kota") {
            if (retry === MAX_RETRY) {
              console.error(`  ⚠ ${account.name} KOTADA (HTTP 429). Bu hesap atlanıyor.`);
              hesapKotaDolu[hesapIdx] = true;
              break;
            }
            await delay(RETRY_BEKLEME_MS[retry - 1]);
            continue;
          }

          if (d.tur === "istek") {
            // 400/422 → gönderdiğimiz gövde hatalı. Başka hesapta da AYNI sonuç çıkar.
            buGorseldeIstekHatasi = true;
            console.error(`  ⛔ İstek reddedildi (HTTP ${d.status}). Gövde/parametre hatası — retry edilmiyor.`);
            break;
          }

          const retryEdilebilir = d.tur === "sunucu" || d.tur === "ag";
          if (retry < MAX_RETRY && retryEdilebilir) {
            await delay(RETRY_BEKLEME_MS[retry - 1]);
          } else {
            break; // bir sonraki hesabı dene
          }
        }
      }

      if (basarili) break;
    }

    if (!basarili) {
      hatalar.push({
        index: i,
        hata: sonHata,
        status: sonDetay?.status ?? null,
        tur: sonDetay?.tur ?? "bilinmiyor",
        body: (sonDetay?.body || "").substring(0, 1000),
        errorsOzet: sonDetay?.errorsOzet || "",
        account: sonHesapAdi,
        prompt: prompts[i].substring(0, 100),
      });
      console.error(`  ⛔ ${i + 1}/${prompts.length} ATLANDI [son hesap: ${sonHesapAdi || "-"}]. ${sonHata}`);
      console.error(`     Prompt: "${prompts[i].substring(0, 120)}..."`);

      if (buGorseldeIstekHatasi) {
        ardArdaIstekHatasi++;
        if (ardArdaIstekHatasi >= 3) {
          console.error(
            `⛔ Üst üste ${ardArdaIstekHatasi} görsel HTTP 400/422 ile reddedildi. ` +
            `Bu bir kota sorunu DEĞİL, istek gövdesi sorunu. Kalan ${prompts.length - i - 1} çağrı iptal edildi.`
          );
          break;
        }
      } else {
        ardArdaIstekHatasi = 0;
      }
    } else {
      ardArdaIstekHatasi = 0;
    }

    if (hesapKotaDolu.every((d, idx) => d || hesapTokenGecersiz[idx])) {
      console.error("⛔ KULLANILABİLİR CLOUDFLARE HESABI KALMADI (kota dolu veya token geçersiz).");
      break;
    }

    if (i < prompts.length - 1) await delay(ISTEKLER_ARASI_MS);
  }

  console.log(`📊 Sonuç: ${sonuclar.length} başarılı, ${hatalar.length} başarısız.`);

  // Hesap bazlı döküm: 40 hatanın hepsi aynı hesapta mı oldu, tek bakışta görülsün
  console.log("📊 Hesap bazlı döküm (ok / kota429 / token401-403 / istek400-422 / sunucu5xx / ag):");
  istatistik.forEach((s, idx) => {
    const durum = hesapTokenGecersiz[idx] ? " ⛔TOKEN GECERSIZ" : (hesapKotaDolu[idx] ? " ⚠KOTADA" : "");
    console.log(`   ${s.ad}: ${s.ok} / ${s.kota} / ${s.token} / ${s.istek} / ${s.sunucu} / ${s.ag}${durum}`);
  });

  if (hatalar.length > 0) {
    const turSayaci = {};
    hatalar.forEach(h => { turSayaci[h.tur] = (turSayaci[h.tur] || 0) + 1; });
    console.log(`📊 Hata türleri: ${Object.entries(turSayaci).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    console.log("⛔ Başarısız görseller (ilk 5 tam gövde):");
    hatalar.slice(0, 5).forEach(h => {
      console.log(`   #${h.index + 1} [${h.account || "-"}] HTTP ${h.status ?? "-"} (${h.tur})`);
      if (h.errorsOzet) console.log(`     errors: ${h.errorsOzet}`);
      console.log(`     body: ${h.body || "(bos govde)"}`);
      console.log(`     Prompt: "${h.prompt}..."`);
    });
    if (hatalar.length > 5) console.log(`   … ve ${hatalar.length - 5} hata daha (yukarıdaki satır satır loglarda mevcut).`);
  }

  return { sonuclar, hatalar, istatistik };
}

/**
 * Telegram/özet için: ilk N hatanın kısa ama TAM bilgilendirici metni.
 * Actions loguna girmeden hatanın ne olduğu görülebilsin diye.
 */
export function fluxHataOzeti(hatalar, adet = 3, govdeLimit = 300) {
  if (!hatalar || hatalar.length === 0) return "";
  const satirlar = hatalar.slice(0, adet).map(h => {
    const govde = (h.errorsOzet || h.body || h.hata || "").substring(0, govdeLimit);
    return `#${h.index + 1} [${h.account || "-"}] HTTP ${h.status ?? "-"} (${h.tur})\n${govde}`;
  });
  return satirlar.join("\n\n");
}
