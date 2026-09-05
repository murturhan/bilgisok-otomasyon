// REV 011/05SEP26 - flux width/height cagrilardan kaldirildi, ilk 3 FLUX hatasinin tam govdesi Telegram a gidiyor
/**
 * 02 - Görsel Üretimi (20 adet FLUX, 1280x720)
 * - job_state'ten promptları oku
 * - Cloudflare rotation ile üret
 * - Her başarılı görseli direkt Drive'a yükle (memory'de tutma)
 * - Sheets'e durum yaz
 * - Trigger: workflow_run (01 tamamlanınca)
 * 
 * Değişiklik: 0 görsel üretildiyse hata at (sessizce "completed:0/N" geçme)
 */

import fs from "fs";
import { google } from "googleapis";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
  getServiceAccountAuth,
  getOAuthClient,
} from "./lib/google.js";
import { fluxRotationCagri, fluxHataOzeti } from "./lib/cloudflare.js";
import { telegram } from "./lib/telegram.js";
import { GORSEL_STILLERI, DEFAULT_STIL } from "./lib/gorsel-stilleri.js";

function cleanGorselPrompt(p) {
  if (!p) return "";
  // Remove Jess/fox character references first
  p = p.replace(/jess\s*(the\s*)?fox|jess\s*karakteri?|fox\s*character|fox\s*mascot|the\s*fox\s*mascot|cartoon\s+fox|a\s+fox\s+wearing|a\s+fox\s+holding|a\s+fox\s+presenting|fox\s+holding|fox\s+presenting/gi, "");
  // Remove empty parentheses left after character removal
  p = p.replace(/\(\s*\)/g, "");
  // Remove stale style keywords — correct style appended via gorsel-stilleri.js
  p = p.replace(/watercolor\s+painting(?:\s+style)?|pencil\s+sketch(?:\s+style)?|(?:pixar|cartoon|anime|watercolor|pencil\s*sketch|realistic)[\s-]*(?:3d\s+)?(?:animation\s+)?style|pixar\s*3d|photorealistic|3d\s+animation|stylized|\bcartoon\b|\bfriendly\b|\bcute\b|\badorable\b|\billustration\b|\brendered\b|\billustrated\b|\banimated\b|\bwhimsical\b|\bcharming\b|\bdelightful\b/gi, "");
  p = p.replace(/\bTurkey\b/gi, "Turkiye");
  return p.replace(/,\s*,+/g, ",").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
}

const {
  JOB_ID,
  PARTIAL_REGEN,
  STAGE: STAGE_ENV,
} = process.env;

const IS_PARTIAL_REGEN = PARTIAL_REGEN === "true" || PARTIAL_REGEN === "1";

// ─── TEK DOSYA ADLANDIRMA STANDARDI ──────────────────────────────────────────
// Yazan taraf (02, 02.7, worker.js) ve okuyan taraf (02.5) AYNI şemayı kullanır:
//   slot 1 = soru1 görseli, slot 2 = fact1, slot 3 = soru2, slot 4 = fact2, ...
//   dosya adı: "gorsel-01.jpg" — TIMESTAMP YOK.
// Timestamp'li eski isimler ("gorsel-01-1779415297810.jpg") okumada hâlâ kabul
// edilir (eski job'lar bozulmasın), ama yeni yazımlar deterministik isim kullanır.
// Deterministik isim sayesinde: regen'de eski dosya kesin siliniyor, aynı slot
// için birden fazla dosya kalmıyor, 02.5 eşleştirmesi tek dosyaya düşüyor.
const GORSEL_AD_PATTERN = /^gorsel-(\d+)[-.]/;

function gorselDosyaAdi(slot, ext = "jpg") {
  return `gorsel-${String(slot).padStart(2, "0")}.${ext}`;
}

/**
 * Drive'daki klasörde mevcut "gorsel-NN" dosyalarını listele.
 * Kabul edilen isimler: "gorsel-02.jpg" (yeni) ve "gorsel-02-<ts>.jpg" (legacy)
 *
 * @returns {Set<number>} Mevcut görsel index'leri (1-indexed)
 */
async function mevcutGorselIndexleri(klasorId) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const mevcut = new Set();
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: `'${klasorId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files || []) {
      const match = String(f.name || "").match(GORSEL_AD_PATTERN);
      if (match) {
        mevcut.add(parseInt(match[1], 10));
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return mevcut;
}

/**
 * Bir slot'a ait TÜM eski dosyaları sil (yeni + legacy isimler).
 * OAuth ile yapılır: dosyaların sahibi OAuth kullanıcısı (driveDosyaYukle OAuth kullanır).
 */
async function driveSlotTemizle(klasorId, slot) {
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  let pageToken = undefined;
  let silinen = 0;
  do {
    const res = await drive.files.list({
      q: `'${klasorId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files || []) {
      const m = String(f.name || "").match(GORSEL_AD_PATTERN);
      if (!m || parseInt(m[1], 10) !== slot) continue;
      try {
        await drive.files.delete({ fileId: f.id });
        silinen++;
      } catch (e) {
        console.warn(`   ⚠ eski dosya silinemedi (${f.name}): ${e.message}`);
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return silinen;
}

/**
 * FLUX buffer'ını Drive'a yükle. HER görsel için tek satır log basar:
 *   "gorsel 3/30 (slot 05): FLUX ok -> Drive ok -> gorsel-05.jpg"
 * Drive hatasında null döner (çağıran taraf BAŞARISIZ sayar, yutulmaz).
 */
async function gorselYukle(klasorId, slot, buffer, sira, toplamSira) {
  const filename = gorselDosyaAdi(slot);
  const filepath = `/tmp/${filename}`;
  const etiket = `gorsel ${sira}/${toplamSira} (slot ${String(slot).padStart(2, "0")})`;
  fs.writeFileSync(filepath, buffer);
  try {
    await driveSlotTemizle(klasorId, slot); // duplicate slot dosyası kalmasın
    const result = await driveDosyaYukle({ filename, filepath }, klasorId, "image/jpeg");
    console.log(`${etiket}: FLUX ok -> Drive ok -> ${filename}`);
    return result;
  } catch (e) {
    console.error(`${etiket}: FLUX ok -> Drive HATA (${e.message}) -> ${filename}`);
    return null;
  } finally {
    try { fs.unlinkSync(filepath); } catch (e) {}
  }
}

/** fluxRotationCagri'nin hata listesini slot bazında logla. */
function fluxHatalariniLogla(hatalar, slotCozucu, toplamSira) {
  for (const h of hatalar || []) {
    const slot = slotCozucu(h.index);
    console.error(
      `gorsel ${h.index + 1}/${toplamSira} (slot ${String(slot).padStart(2, "0")}): ` +
      `FLUX HATA (${String(h.hata).substring(0, 120)}) -> Drive atlandi -> ${gorselDosyaAdi(slot)}`
    );
  }
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    // GECİCİ: Shorts format disabled
    if (JOB_ID && JOB_ID.endsWith("S")) throw new Error("Shorts şimdilik desteklenmiyor");
    const job = await jobOku(JOB_ID);

    if (!job.ai_gorsel_prompts || job.ai_gorsel_prompts.length === 0) {
      throw new Error("ai_gorsel_prompts boş!");
    }
    
    const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (altKlasorler.length === 0) {
      throw new Error("01-gorseller klasörü bulunamadı.");
    }
    const gorselKlasorId = altKlasorler[0].id;
    
    await jobGuncelle(JOB_ID, { gorsel_status: "running" });
    
    const toplam = job.ai_gorsel_prompts.length;
    
    // RESUME MODU: Drive'da mevcut görselleri tara
    console.log("📂 Drive'da mevcut görseller taranıyor (resume modu)...");
    const mevcutIndexler = await mevcutGorselIndexleri(gorselKlasorId);
    console.log(`   ${mevcutIndexler.size}/${toplam} görsel zaten mevcut`);

    // Video URL olan slotları tespit et (video varsa FLUX atla)
    const videoSlotlar = new Set();
    try {
      const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
      let qData = null;
      const sesRes = await drive.files.list({
        q: `'${job.drive_folder_id}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id)", pageSize: 1,
      });
      if (sesRes.data.files?.length) {
        const jr = await drive.files.list({
          q: `'${sesRes.data.files[0].id}' in parents and name='questions.json' and trashed=false`,
          fields: "files(id)", pageSize: 1,
        });
        if (jr.data.files?.length) {
          const r = await drive.files.get({ fileId: jr.data.files[0].id, alt: "media" }, { responseType: "text" });
          qData = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        }
      }
      if (!qData) {
        const ar = await drive.files.list({
          q: `'${job.drive_folder_id}' in parents and name='questions.json' and trashed=false`,
          fields: "files(id)", pageSize: 1,
        });
        if (ar.data.files?.length) {
          const r = await drive.files.get({ fileId: ar.data.files[0].id, alt: "media" }, { responseType: "text" });
          qData = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        }
      }
      if (qData?.questions) {
        qData.questions.forEach((q, i) => {
          const isWyr = q.question_type === "would_you_rather";
          if (isWyr ? q.visible_option?.video_url : q.question_video_url) videoSlotlar.add(2 * i + 1);
          if (isWyr ? q.surprise_option?.surprise_video_url : q.fun_fact_video_url) videoSlotlar.add(2 * i + 2);
        });
        if (videoSlotlar.size > 0) console.log(`   ${videoSlotlar.size} slot video ile dolu, FLUX atlanacak`);
      }
    } catch (e) {
      console.warn(`questions.json video kontrolü atlandı: ${e.message}`);
    }

    // Sadece eksik prompt'ları üret - orijinal index'i de tut
    const eksikPromptlar = [];
    const eksikOrijinalIndexler = [];
    for (let i = 0; i < job.ai_gorsel_prompts.length; i++) {
      const oneBased = i + 1;
      if (!mevcutIndexler.has(oneBased) && !videoSlotlar.has(oneBased)) {
        eksikPromptlar.push(cleanGorselPrompt(job.ai_gorsel_prompts[i]));
        eksikOrijinalIndexler.push(i);
      }
    }
    
    let yeniUretilen = 0;
    let driveHata = 0;
    let fluxHata = 0;
    let sonHatalar = []; // fluxRotationCagri'nin dondugu zengin hata kayitlari (status/body/errors)

    if (eksikPromptlar.length === 0) {
      console.log("✅ Tüm görseller zaten mevcut, yeni üretim yok.");
    } else {
      console.log(`🎨 ${eksikPromptlar.length} eksik görsel üretilecek (slot: ${eksikOrijinalIndexler.map(i => i+1).join(", ")})`);

      // NOT: flux-1-schnell width/height KABUL ETMIYOR (resmi dokuman: prompt/steps/seed).
      // Model kendi dogal cozunurlugunde uretir, Remotion objectFit:"cover" ile kirpar.
      const { sonuclar, hatalar } = await fluxRotationCagri(eksikPromptlar, {
        onSuccess: async (filteredIndex, buffer) => {
          // filteredIndex = eksikPromptlar içindeki index → orijinal slot'a çevir
          const slot = eksikOrijinalIndexler[filteredIndex] + 1;
          const yuklendi = await gorselYukle(gorselKlasorId, slot, buffer, filteredIndex + 1, eksikPromptlar.length);
          if (yuklendi) yeniUretilen++;
          else driveHata++; // Drive hatası artık BAŞARISIZ sayılıyor, sessizce yutulmuyor
        },
      });
      fluxHata = (hatalar || []).length;
      sonHatalar = hatalar || [];
      fluxHatalariniLogla(hatalar, (i) => eksikOrijinalIndexler[i] + 1, eksikPromptlar.length);
      console.log(
        `📊 Üretim özeti: FLUX ok ${(sonuclar || []).length}/${eksikPromptlar.length}, ` +
        `Drive ok ${yeniUretilen}, Drive hata ${driveHata}, FLUX hata ${fluxHata}`
      );
    }

    // Toplam başarılı = mevcut + Drive'a GERÇEKTEN yüklenen
    const toplamBasarili = mevcutIndexler.size + yeniUretilen;

    // SIFIR görsel = hata. İlk 3 FLUX hatasının TAM gövdesini Telegram'a da yolla
    // (Actions loguna girmeden ne olduğu görülsün).
    if (toplamBasarili === 0) {
      const ozet = fluxHataOzeti(sonHatalar, 3, 300);
      if (ozet) {
        try {
          await telegram(job.chat_id, `⛔ *FLUX ilk 3 hata:*\n\`\`\`\n${ozet}\n\`\`\``);
        } catch (e) { console.warn(`Telegram hata özeti gönderilemedi: ${e.message}`); }
      }
      throw new Error(
        `0/${toplam} görsel Drive'a yüklendi (FLUX hata: ${fluxHata}, Drive hata: ${driveHata}). ` +
        (sonHatalar[0] ? `İlk hata: HTTP ${sonHatalar[0].status ?? "-"} (${sonHatalar[0].tur}) ${(sonHatalar[0].errorsOzet || sonHatalar[0].body || "").substring(0, 200)}` : "")
      );
    }

    // Drive'da gerçekten dosya var mı? (yalan "hazır" raporunu kesen son kontrol)
    const dogrulama = await mevcutGorselIndexleri(gorselKlasorId);
    console.log(`🔎 Drive doğrulama: ${dogrulama.size}/${toplam} slot dolu`);
    if (dogrulama.size === 0) {
      throw new Error(
        `Drive'da hiç "gorsel-NN" dosyası yok (FLUX hata: ${fluxHata}, Drive hata: ${driveHata}). ` +
        `Onay sayfası boş kalırdı, durduruldu.`
      );
    }

    // Sayaç değil, Drive'daki GERÇEK dosya sayısı esas alınır (yalan rapor olmasın)
    const gercekBasarili = dogrulama.size;
    const status = gercekBasarili >= toplam ? "completed" : "partial";
    await jobGuncelle(JOB_ID, {
      gorsel_status: `${status}:${gercekBasarili}/${toplam}`,
    });

    console.log(`✅ ${gercekBasarili}/${toplam} görsel Drive'da (${yeniUretilen} yeni üretildi, sayaç: ${toplamBasarili}).`);

    if (status === "partial") {
      const eksikSlotlar = [];
      for (let i = 1; i <= toplam; i++) {
        if (!dogrulama.has(i)) eksikSlotlar.push(i);
      }
      await telegram(
        job.chat_id,
        `⚠️ *Görseller eksik:* ${gercekBasarili}/${toplam}` +
        (fluxHata ? `\nFLUX hata: ${fluxHata}` : "") +
        (driveHata ? `\nDrive hata: ${driveHata}` : "") +
        (eksikSlotlar.length ? `\nEksik slot: ${eksikSlotlar.join(", ")}` : "") +
        `\n\n02-gorsel-uret'i tekrar tetikle (resume modu eksikleri üretir).`
      );
    } else {
      await telegram(job.chat_id, `🖼 *Görseller hazır:* ${gercekBasarili}/${toplam}\n\n⏳ Onay sayfası hazırlanıyor...`);
      
      // 02.5-onay-tetikle workflow'unu çalıştır (GitHub Action repository_dispatch)
      try {
        const repoOwner = process.env.GITHUB_REPO_OWNER || "murturhan";
        const repoName = process.env.GITHUB_REPO_NAME || "bilgisok-otomasyon";
        const token = process.env.WORKFLOW_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
        
        if (token) {
          const dispatchRes = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`,
            {
              method: "POST",
              headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "geniminitests-gorsel-uret",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                event_type: "onay_tetikle",
                client_payload: {
                  job_id: JOB_ID,
                  chat_id: job.chat_id,
                },
              }),
            }
          );
          if (dispatchRes.ok) {
            console.log("✅ 02.5-onay-tetikle dispatch edildi");
          } else {
            const txt = await dispatchRes.text();
            console.warn(`⚠ 02.5 dispatch hatası: ${dispatchRes.status} ${txt.substring(0, 200)}`);
          }
        } else {
          console.warn("⚠ WORKFLOW_DISPATCH_TOKEN yok, 02.5 manuel tetiklenmeli");
        }
      } catch (e) {
        console.warn(`⚠ 02.5 dispatch hatası (devam): ${e.message}`);
      }
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { gorsel_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *02-Görsel hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

// ─── PARTIAL REGEN: stage=1 editlerinden sadece flux_isaretli slotları üret ────

async function questionsJsonOkuFromDrive(driveFolderId) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  // 02-ses klasöründe ara
  const sesRes = await drive.files.list({
    q: `'${driveFolderId}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)", pageSize: 1,
  });
  if (sesRes.data.files?.length) {
    const jr = await drive.files.list({
      q: `'${sesRes.data.files[0].id}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id, name)", pageSize: 1,
    });
    if (jr.data.files?.length) {
      const r = await drive.files.get({ fileId: jr.data.files[0].id, alt: "media" }, { responseType: "text" });
      return { data: typeof r.data === "string" ? JSON.parse(r.data) : r.data, fileId: jr.data.files[0].id };
    }
  }
  // Ana klasörde ara (fallback)
  const ar = await drive.files.list({
    q: `'${driveFolderId}' in parents and name='questions.json' and trashed=false`,
    fields: "files(id, name)", pageSize: 1,
  });
  if (ar.data.files?.length) {
    const r = await drive.files.get({ fileId: ar.data.files[0].id, alt: "media" }, { responseType: "text" });
    return { data: typeof r.data === "string" ? JSON.parse(r.data) : r.data, fileId: ar.data.files[0].id };
  }
  throw new Error("questions.json Drive'da bulunamadı");
}

async function questionsJsonKaydet(fileId, qData) {
  const drive = google.drive({ version: "v3", auth: getServiceAccountAuth() });
  const content = JSON.stringify(qData, null, 2);
  // Drive'a yaz - SA drive scope ile (read-only SA, write için OAuth ile deneme)
  // Burada tmpFile yolu: fs.writeFile + driveDosyaYukle pattern kullanılamaz (aynı fileId güncelleme gerekir)
  // google.js drive.files.update ile güncelle
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/json",
      body: content,
    },
  });
  console.log(`✓ questions.json güncellendi (fileId: ${fileId})`);
}

async function dispatch02_5(job) {
  try {
    const repoOwner = process.env.GITHUB_REPO_OWNER || "murturhan";
    const repoName = process.env.GITHUB_REPO_NAME || "bilgisok-otomasyon";
    const token = process.env.WORKFLOW_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) { console.warn("⚠ WORKFLOW_DISPATCH_TOKEN yok, 02.5 manuel tetiklenmeli"); return; }
    const r = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "geniminitests-gorsel-uret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_type: "onay_tetikle", client_payload: { job_id: JOB_ID, chat_id: job.chat_id } }),
      }
    );
    if (r.ok) { console.log("✅ 02.5-onay-tetikle dispatch edildi"); }
    else { const t = await r.text(); console.warn(`⚠ 02.5 dispatch hatası: ${r.status} ${t.substring(0,200)}`); }
  } catch (e) { console.warn(`⚠ 02.5 dispatch hatası: ${e.message}`); }
}

async function partialRegenMain() {
  console.log(`Job: ${JOB_ID} [PARTIAL_REGEN mode, stage=${STAGE_ENV || "2"}]`);
  const job = await jobOku(JOB_ID);
  if (!job.drive_folder_id) throw new Error("drive_folder_id yok");

  const { data: qData, fileId: qFileId } = await questionsJsonOkuFromDrive(job.drive_folder_id);
  const questions = qData.questions || [];
  console.log(`questions.json okundu: ${questions.length} soru`);

  // 01-gorseller klasörünü bul
  const altKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
  if (!altKlasorler.length) throw new Error("01-gorseller klasörü bulunamadı");
  const gorselKlasorId = altKlasorler[0].id;

  // Regen oncesi mevcut status'u sakla: hic regen yapilmazsa geri yazilacak
  // (aksi halde "running_partial" kalir ve 07-video-montaj bloklanir)
  const oncekiGorselStatus = String(job.gorsel_status || "");

  await jobGuncelle(JOB_ID, { gorsel_status: "running_partial" });

  // FLUX üretilecek slotları belirle
  const fluxSlots = [];
  questions.forEach((q, i) => {
    const isWyr = q.question_type === "would_you_rather";
    if (isWyr) {
      if (q.flux_visible_image !== false && !q.uploaded_visible_url) {
        const basePrompt = q.visible_option?.image_prompt;
        if (basePrompt) {
          const stili = q.visible_option?.image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "visible", prompt: cleanGorselPrompt(basePrompt) + suffix, gorselNum: 2 * i + 1 });
        }
      }
      if (q.flux_surprise_image !== false && !q.uploaded_surprise_url) {
        const basePrompt = q.surprise_option?.surprise_image_prompt;
        if (basePrompt) {
          const stili = q.surprise_option?.surprise_image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "surprise", prompt: cleanGorselPrompt(basePrompt) + suffix, gorselNum: 2 * i + 2 });
        }
      }
    } else {
      if (q.flux_image !== false && !q.uploaded_image_url) {
        if (q.image_prompt) {
          const stili = q.question_image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "question", prompt: cleanGorselPrompt(q.image_prompt) + suffix, gorselNum: 2 * i + 1 });
        }
      }
      if (q.flux_fact_image !== false && !q.uploaded_fact_image_url) {
        if (q.fun_fact_image_prompt) {
          const stili = q.fact_image_stili || DEFAULT_STIL;
          const suffix = GORSEL_STILLERI[stili]?.promptAppend || "";
          fluxSlots.push({ questionIdx: i, slotType: "fact", prompt: cleanGorselPrompt(q.fun_fact_image_prompt) + suffix, gorselNum: 2 * i + 2 });
        }
      }
    }
  });

  let uretilen = 0;
  let driveHata = 0;
  let fluxHata = 0;
  let sonHatalar = []; // zengin hata kayitlari (status/tur/body/errorsOzet/account)
  if (fluxSlots.length === 0) {
    console.log("✅ FLUX üretilecek slot yok (tümü yüklü veya işaretsiz).");
  } else {
    console.log(`🎨 ${fluxSlots.length} slot FLUX üretilecek: ${fluxSlots.map(s => `${gorselDosyaAdi(s.gorselNum)} (${s.slotType})`).join(", ")}`);
    const prompts = fluxSlots.map(s => s.prompt);
    // NOT: flux-1-schnell width/height KABUL ETMIYOR (resmi dokuman: prompt/steps/seed).
    const { sonuclar, hatalar } = await fluxRotationCagri(prompts, {
      onSuccess: async (filteredIdx, buffer) => {
        const slot = fluxSlots[filteredIdx];
        const result = await gorselYukle(gorselKlasorId, slot.gorselNum, buffer, filteredIdx + 1, fluxSlots.length);
        if (!result) { driveHata++; return; } // Drive hatası = BAŞARISIZ, yutulmuyor
        const driveUrl = `https://drive.google.com/thumbnail?id=${result.drive_id}&sz=w800`;
        // questions.json'daki ilgili alana URL yaz
        const q = questions[slot.questionIdx];
        if (slot.slotType === "question") q.question_image_url = driveUrl;
        else if (slot.slotType === "fact") q.fun_fact_image_url = driveUrl;
        else if (slot.slotType === "visible") { q.visible_option = q.visible_option || {}; q.visible_option.image_url = driveUrl; }
        else if (slot.slotType === "surprise") { q.surprise_option = q.surprise_option || {}; q.surprise_option.surprise_image_url = driveUrl; }
        uretilen++;
      },
    });
    fluxHata = (hatalar || []).length;
    sonHatalar = hatalar || [];
    fluxHatalariniLogla(hatalar, (i) => fluxSlots[i].gorselNum, fluxSlots.length);
    console.log(
      `📊 Regen özeti: FLUX ok ${(sonuclar || []).length}/${fluxSlots.length}, ` +
      `Drive ok ${uretilen}, Drive hata ${driveHata}, FLUX hata ${fluxHata}`
    );
  }

  // Yalan başarı raporunu kes: regen istendi ama hiçbir görsel Drive'a yazılamadıysa
  // "hazır" DEME — hata at (catch bloğu gorsel_status=error yazar + Telegram'a hata gider).
  // İlk 3 FLUX hatasının TAM gövdesi ayrıca Telegram'a gider (kör uçuş bitsin).
  if (fluxSlots.length > 0 && uretilen === 0) {
    const ozet = fluxHataOzeti(sonHatalar, 3, 300);
    if (ozet) {
      try {
        await telegram(job.chat_id, `⛔ *FLUX ilk 3 hata:*\n\`\`\`\n${ozet}\n\`\`\``);
      } catch (e) { console.warn(`Telegram hata özeti gönderilemedi: ${e.message}`); }
    }
    throw new Error(
      `0/${fluxSlots.length} görsel Drive'a yüklenebildi (FLUX hata: ${fluxHata}, Drive hata: ${driveHata}). ` +
      (sonHatalar[0] ? `İlk hata: HTTP ${sonHatalar[0].status ?? "-"} (${sonHatalar[0].tur}) ${(sonHatalar[0].errorsOzet || sonHatalar[0].body || "").substring(0, 200)} ` : "") +
      `Onay sayfası boş kalırdı, durduruldu.`
    );
  }

  // questions.json'ı güncellenmiş haliyle Drive'a kaydet
  try {
    qData.questions = questions;
    await questionsJsonKaydet(qFileId, qData);
  } catch (e) {
    console.warn(`⚠ questions.json Drive güncelleme hatası (devam): ${e.message}`);
  }

  // Drive'da gerçekten dosya var mı? Onay sayfası buradan besleniyor —
  // boşsa 02.5'i tetiklemek yerine hata at (30 slotun hepsi "Görsel yok" bug'ı).
  const dogrulama = await mevcutGorselIndexleri(gorselKlasorId);
  console.log(`🔎 Drive doğrulama: ${dogrulama.size} slot dolu (${questions.length * 2} slot bekleniyor)`);
  if (dogrulama.size === 0) {
    throw new Error(
      `Drive'da hiç "gorsel-NN" dosyası yok (FLUX hata: ${fluxHata}, Drive hata: ${driveHata}). ` +
      `Onay sayfası boş kalırdı, durduruldu.`
    );
  }

  // gorsel_status HER ZAMAN sayisal formatta yazilir: "completed:N/N" veya "partial:X/N".
  // "partial:partial_regen" gibi serbest metin 07-video-montaj guard'i tarafindan parse
  // edilemiyor ve pipeline'i bloklyordu.
  const toplamSlot = questions.length * 2;
  if (fluxSlots.length === 0) {
    // Hic regen yapilmadi -> 02'nin yazdigi onceki status'a DOKUNMA, geri yaz.
    const geriYazilacak = /^(completed|partial)/.test(oncekiGorselStatus)
      ? oncekiGorselStatus
      : `completed:${toplamSlot}/${toplamSlot}`;
    await jobGuncelle(JOB_ID, { gorsel_status: geriYazilacak });
    console.log(`✅ Partial regen: 0 slot üretildi, gorsel_status korundu (${geriYazilacak}).`);
  } else {
    const toplamYuklu = uretilen + (toplamSlot - fluxSlots.length); // üretilen + zaten yüklü
    const status = uretilen === fluxSlots.length ? "completed" : "partial";
    await jobGuncelle(JOB_ID, { gorsel_status: `${status}:${toplamYuklu}/${toplamSlot}` });
    console.log(`✅ Partial regen tamamlandı: ${uretilen}/${fluxSlots.length} FLUX üretildi (gorsel_status: ${status}:${toplamYuklu}/${toplamSlot}).`);
  }

  // Telegram GERÇEK sayıyı gösterir (fluxSlots=0 ise zaten üretim istenmemiştir)
  const eksikVar = fluxHata > 0 || driveHata > 0;
  await telegram(
    job.chat_id,
    (eksikVar ? `⚠️ *Görseller eksik* (aşama 1 seçimi)` : `🖼 *Görseller hazır* (aşama 1 seçimi)`) +
    `\n\nÜretilen: ${uretilen}/${fluxSlots.length}` +
    `\nDrive'da dolu slot: ${dogrulama.size}/${toplamSlot}` +
    (fluxHata ? `\nFLUX hata: ${fluxHata}` : "") +
    (driveHata ? `\nDrive hata: ${driveHata}` : "") +
    `\n\n⏳ Onay sayfası hazırlanıyor...`
  );
  await dispatch02_5(job);

  process.exit(0);
}

// Entry point: partial veya tam mod
if (IS_PARTIAL_REGEN) {
  partialRegenMain().catch(async (error) => {
    console.error("HATA (partial):", error.message);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { gorsel_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *02-Görsel partial hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  });
} else {
  main();
}
