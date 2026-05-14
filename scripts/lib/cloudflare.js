/**
 * Cloudflare Workers AI (FLUX) - Multi-account rotation
 */

import axios from "axios";

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN_2,
  CLOUDFLARE_ACCOUNT_ID_2,
  CLOUDFLARE_API_TOKEN_3,
  CLOUDFLARE_ACCOUNT_ID_3,
  CLOUDFLARE_HESAP_A_KOTADA,
} = process.env;

export function getCfAccounts() {
  const accounts = [];
  const hesapAKotada = CLOUDFLARE_HESAP_A_KOTADA === "true";
  
  if (CLOUDFLARE_API_TOKEN && CLOUDFLARE_ACCOUNT_ID && !hesapAKotada) {
    accounts.push({ token: CLOUDFLARE_API_TOKEN, accountId: CLOUDFLARE_ACCOUNT_ID, name: "Hesap-A" });
  }
  if (CLOUDFLARE_API_TOKEN_2 && CLOUDFLARE_ACCOUNT_ID_2) {
    accounts.push({ token: CLOUDFLARE_API_TOKEN_2, accountId: CLOUDFLARE_ACCOUNT_ID_2, name: "Hesap-B" });
  }
  if (CLOUDFLARE_API_TOKEN_3 && CLOUDFLARE_ACCOUNT_ID_3) {
    accounts.push({ token: CLOUDFLARE_API_TOKEN_3, accountId: CLOUDFLARE_ACCOUNT_ID_3, name: "Hesap-C" });
  }
  
  if (accounts.length === 0) {
    throw new Error("Hiç Cloudflare hesabı yapılandırılmamış!");
  }
  return accounts;
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Tek bir FLUX çağrısı
export async function fluxCagri(prompt, account, opts = {}) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  
  const response = await axios({
    method: "POST",
    url: url,
    headers: {
      Authorization: `Bearer ${account.token}`,
      "Content-Type": "application/json",
    },
    data: {
      prompt: prompt,
      steps: opts.steps || 4,
      width: opts.width || 1280,
      height: opts.height || 720,
    },
    timeout: 120000,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  
  if (!response.data?.result?.image) {
    throw new Error("FLUX.1 image alanı boş");
  }
  
  return Buffer.from(response.data.result.image, "base64");
}

// Rotation'la N adet görsel üret (callback ile her buffer'ı işlersin)
export async function fluxRotationCagri(prompts, opts = {}) {
  const accounts = getCfAccounts();
  const ISTEKLER_ARASI_MS = opts.istekler_arasi_ms || 7000;
  const MAX_RETRY = opts.max_retry || 3;
  const RETRY_BEKLEME_MS = opts.retry_bekleme_ms || [10000, 30000, 60000];
  const width = opts.width || 1280;
  const height = opts.height || 720;
  const onSuccess = opts.onSuccess; // (index, buffer) => Promise
  
  console.log(`${prompts.length} FLUX çağrısı (${accounts.length} hesap, ${width}x${height})...`);
  
  const sonuclar = [];
  const hatalar = [];
  const hesapKotaDolu = new Array(accounts.length).fill(false);
  const yariSinir = Math.ceil(prompts.length / accounts.length);
  
  for (let i = 0; i < prompts.length; i++) {
    let basarili = false;
    let sonHata = "";
    
    let oncelikliHesap = Math.min(Math.floor(i / yariSinir), accounts.length - 1);
    const hesapSirasi = [oncelikliHesap];
    for (let j = 0; j < accounts.length; j++) {
      if (j !== oncelikliHesap) hesapSirasi.push(j);
    }
    
    for (const hesapIdx of hesapSirasi) {
      if (hesapKotaDolu[hesapIdx]) continue;
      
      const account = accounts[hesapIdx];
      
      for (let retry = 1; retry <= MAX_RETRY; retry++) {
        try {
          console.log(`  ${i + 1}/${prompts.length} (${account.name}, ${retry}/${MAX_RETRY})...`);
          const buffer = await fluxCagri(prompts[i], account, { width, height });
          
          if (onSuccess) {
            await onSuccess(i, buffer);
          }
          
          sonuclar.push({ index: i, size: buffer.length, account: account.name });
          console.log(`  ✓ ${i + 1} OK (${(buffer.length / 1024).toFixed(0)}KB) [${account.name}]`);
          basarili = true;
          break;
        } catch (e) {
          const status = e.response?.status;
          const msg = e.message || "";
          sonHata = `${status || "?"}: ${msg}`;
          
          const is429 = status === 429 || msg.includes("429");
          const is5xx = status >= 500 && status < 600;
          const retryEdilebilir = is429 || is5xx || msg.includes("timeout") || msg.includes("ECONNRESET");
          
          if (is429 && retry === MAX_RETRY) {
            console.log(`  ⚠ ${account.name} kotada, atlanıyor.`);
            hesapKotaDolu[hesapIdx] = true;
            break;
          }
          
          if (retry < MAX_RETRY && retryEdilebilir) {
            await delay(RETRY_BEKLEME_MS[retry - 1]);
          } else {
            break;
          }
        }
      }
      
      if (basarili) break;
    }
    
    if (!basarili) hatalar.push({ index: i, hata: sonHata });
    
    if (hesapKotaDolu.every(d => d)) {
      console.error("⛔ TÜM CLOUDFLARE HESAPLARI KOTADA.");
      break;
    }
    
    if (i < prompts.length - 1) await delay(ISTEKLER_ARASI_MS);
  }
  
  console.log(`📊 Sonuç: ${sonuclar.length} başarılı, ${hatalar.length} başarısız.`);
  return { sonuclar, hatalar };
}
