// REV 014/06JUN26 - skip_stage2: fact gorsel yoksa question gorselini fallback kullan, driveIndir hata toleransli
/**
 * 07 - Video Montaj v14 (Remotion + Çoklu ses parçaları - SES-VİDEO SENKRON)
 *
 * v13'ten farkı:
 * - Tek MP3 yerine 03-seslendirme'nin ürettiği N adet MP3 indirilir
 * - audio-segments.json'dan her parçanın süresi okunur
 * - inputProps'a intro, outro ve her sorunun question/answer audio path+duration verilir
 * - Remotion her sahnenin uzunluğunu kendi audio süresine göre dinamik hesaplar
 * - Tam ses-video senkron
 *
 * Akış:
 * 1. questions.json + audio-segments.json indir
 * 2. Tüm ses parçalarını ve görselleri remotion/public/ içine indir
 * 3. inputProps oluştur (her parçanın path ve süresi dahil)
 * 4. Remotion render
 * 5. Drive'a yükle
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { google } from "googleapis";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveKlasorAc,
  driveDosyaYukle,
  getOAuthClient,
  getServiceAccountAuth,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);

const {
  JOB_ID,
  GDRIVE_FOLDER_ID,
  GDRIVE_SURPRISE_BOX_FOLDER_ID,
  GDRIVE_MUZIK_FOLDER_ID,
  GDRIVE_JESS_FOLDER_ID,
  GDRIVE_SFX_FOLDER_ID,
} = process.env;

const TMP_DIR = "/tmp/video-montaj";
const REMOTION_DIR = path.resolve(process.cwd(), "remotion");
const REMOTION_PUBLIC = path.join(REMOTION_DIR, "public");

// ─── Jess greeting videoları (Drive'da 02-Jess-Karakter klasöründe) ─
// Yeşil arka planlı, chroma key #00FF00 ile şeffaflaştırılır
const JESS_GREETING_VIDEOS = {
  "shorts-intro": "1aD2MoLXSEkQXo9_-4qAjq08hq-EGUFYg",
  "long-intro":   "1qElPI2jzg839rcvv2KajlT-2lSjMCtUz",
  "shorts-outro": "1zjxE-gtQLndMcZ27LEdVsR6qTEDP6bxA",
  "long-outro":   "1o4o4kiRqIrqWGNGFMvnc8kVJLPwKIfw6",
};
const JESS_CHROMA_KEY = {
  color: "0x00FF00",
  similarity: 0.15,
  blend: 0.05,
};

// ─── Drive yardımcıları ────────────────────────────────────────────
async function driveKlasorIcerigi(klasorId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${klasorId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, size)",
    pageSize: 200,
    orderBy: "name",
  });
  return res.data.files || [];
}

async function driveAltKlasorAraSA(adKismi, parentId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const q = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and name contains '${adKismi.replace(/'/g, "\\'")}' and trashed=false`;
  const res = await drive.files.list({ q, fields: "files(id, name)", pageSize: 10 });
  return res.data.files || [];
}

async function driveIndir(fileId, hedefYol, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(hedefYol);
    res.data.on("error", reject).pipe(writeStream);
    writeStream.on("finish", resolve).on("error", reject);
  });
}

async function driveIndirFallback(fileId, hedefYol, fallbackYol, auth) {
  try {
    await driveIndir(fileId, hedefYol, auth);
  } catch (e) {
    console.warn(`driveIndir basarisiz (${hedefYol}): ${e.message}`);
    if (fallbackYol && fs.existsSync(fallbackYol)) {
      fs.copyFileSync(fallbackYol, hedefYol);
      console.log(`✓ Fallback kullanildi: ${fallbackYol} → ${hedefYol}`);
    } else {
      console.warn(`Fallback da yok: ${hedefYol} atlanıyor`);
    }
  }
}

async function formatTespit(jobFolderId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: jobFolderId, fields: "name" });
  const klasorAdi = res.data.name || "";
  if (klasorAdi.toLowerCase().includes("-shorts-")) return "shorts";
  return "long";
}

/**
 * Jess greeting videolarını Drive'dan indir, chroma key uygula, 
 * remotion/public/jess/ altına {intro|outro}.webm olarak yaz.
 * 
 * Chroma key işlemi: yeşil (#00FF00) arka planı şeffaf yap.
 * Çıktı: WebM VP9 (alpha kanallı, yuva420p).
 * 
 * @param {string} format - "shorts" veya "long"
 * @param {object} auth - SA auth
 * @param {string} jessPublicDir - hedef klasör (remotion/public/jess)
 * @returns {object} {introDuration, outroDuration} - WebM süreleri (saniye)
 */
async function jessGreetingVideolariHazirla(format, auth, jessPublicDir) {
  const ihtiyac = [
    { key: `${format}-intro`, out: "intro.webm", durationKey: "introDuration" },
    { key: `${format}-outro`, out: "outro.webm", durationKey: "outroDuration" },
  ];
  
  const sureler = { introDuration: 0, outroDuration: 0 };
  
  for (const seg of ihtiyac) {
    const fileId = JESS_GREETING_VIDEOS[seg.key];
    if (!fileId) {
      throw new Error(`Jess ${seg.key} için Drive ID yok`);
    }
    
    const hamYol = path.join(TMP_DIR, `jess-${seg.key}-ham.mp4`);
    const ciktiYol = path.join(jessPublicDir, seg.out);
    
    console.log(`  🦊 Jess ${seg.key} indiriliyor...`);
    await driveIndir(fileId, hamYol, auth);
    const stats = fs.statSync(hamYol);
    console.log(`     ${(stats.size/1024/1024).toFixed(2)} MB indirildi`);
    
    // Chroma key + WebM VP9 alfa
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${hamYol}" -vf "chromakey=${JESS_CHROMA_KEY.color}:${JESS_CHROMA_KEY.similarity}:${JESS_CHROMA_KEY.blend}" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 2M -c:a libopus -b:a 128k "${ciktiYol}"`;
    console.log(`  🎨 ${seg.key} chroma key uygulanıyor...`);
    await execAsync(cmd);
    
    if (!fs.existsSync(ciktiYol)) {
      throw new Error(`Jess ${seg.key} chroma key başarısız`);
    }
    
    // Süreyi ölç (ffprobe ile)
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${ciktiYol}"`
    );
    const sure = parseFloat(stdout.trim());
    sureler[seg.durationKey] = sure;
    
    const outStats = fs.statSync(ciktiYol);
    console.log(`     ✓ ${seg.out} (${(outStats.size/1024/1024).toFixed(2)} MB, ${sure.toFixed(2)}s)`);
    
    try { fs.unlinkSync(hamYol); } catch {}
  }
  
  return sureler;
}

async function jsonIndir(folderId, filename, auth, hedefYol) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${filename}' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  if (!res.data.files || res.data.files.length === 0) {
    console.log(`  ⚠ ${filename} klasörde bulunamadı (folderId: ${folderId})`);
    return null;
  }
  try {
    await driveIndir(res.data.files[0].id, hedefYol, auth);
    if (!fs.existsSync(hedefYol)) {
      console.log(`  ⚠ ${filename} indirildi ama disk'te yok: ${hedefYol}`);
      return null;
    }
    return JSON.parse(fs.readFileSync(hedefYol, "utf8"));
  } catch (e) {
    console.log(`  ⚠ ${filename} okunamadı: ${e.message}`);
    return null;
  }
}

// Önce 02-ses içinde, yoksa ana klasörde questions.json ara
async function questionsJsonOku(jobFolderId, auth, hedefYol) {
  // Hedef klasörü oluştur (yoksa)
  const dir = path.dirname(hedefYol);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const drive = google.drive({ version: "v3", auth });
  
  // 1. 02-ses (yeni format) - direct drive.files.list (driveAltKlasorBul'a güvenmiyoruz)
  console.log(`📂 questions.json aranıyor (önce 02-ses)...`);
  try {
    const sesSearchRes = await drive.files.list({
      q: `'${jobFolderId}' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    
    if (sesSearchRes.data.files && sesSearchRes.data.files.length > 0) {
      const sesFolderId = sesSearchRes.data.files[0].id;
      console.log(`  ✓ 02-ses klasörü bulundu: ${sesFolderId}`);
      
      const jsonSearchRes = await drive.files.list({
        q: `'${sesFolderId}' in parents and name='questions.json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1,
      });
      
      if (jsonSearchRes.data.files && jsonSearchRes.data.files.length > 0) {
        const fileId = jsonSearchRes.data.files[0].id;
        await driveIndir(fileId, hedefYol, auth);
        if (fs.existsSync(hedefYol)) {
          console.log("✓ questions.json '02-ses' klasöründen okundu");
          return JSON.parse(fs.readFileSync(hedefYol, "utf8"));
        }
      } else {
        console.log("  ⚠ 02-ses içinde questions.json yok");
      }
    } else {
      console.log("  ⚠ 02-ses klasörü yok");
    }
  } catch (e) {
    console.log(`  ⚠ 02-ses arama hatası: ${e.message}`);
  }
  
  // 2. Ana klasör (backward compat)
  console.log(`📂 questions.json ana klasörde aranıyor (backward compat)...`);
  try {
    const anaSearchRes = await drive.files.list({
      q: `'${jobFolderId}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    
    if (anaSearchRes.data.files && anaSearchRes.data.files.length > 0) {
      const fileId = anaSearchRes.data.files[0].id;
      await driveIndir(fileId, hedefYol, auth);
      if (fs.existsSync(hedefYol)) {
        console.log("✓ questions.json ana klasörden okundu");
        return JSON.parse(fs.readFileSync(hedefYol, "utf8"));
      }
    }
  } catch (e) {
    console.log(`  ⚠ Ana klasör arama hatası: ${e.message}`);
  }
  
  console.log("❌ questions.json hiçbir yerde bulunamadı");
  return null;
}

// SFX dosyalarını indir, map döner: {tick: relativePath, drum: ..., correct: ..., whoosh: ...}
async function sfxIndir(auth, hedefKlasor) {
  if (!GDRIVE_SFX_FOLDER_ID) {
    console.log("⚠ GDRIVE_SFX_FOLDER_ID yok, SFX atlanıyor");
    return {};
  }
  
  const dosyalar = await driveKlasorIcerigi(GDRIVE_SFX_FOLDER_ID, auth);
  const audioDosyalar = dosyalar.filter(d => d.name.match(/\.(wav|mp3|m4a|ogg)$/i));
  
  const sfxMap = {};
  
  for (const d of audioDosyalar) {
    const ad = d.name.toLowerCase();
    let sfxKey = null;
    
    if (ad.includes("tick") || ad.includes("countdown")) sfxKey = "tick";
    else if (ad.includes("drum")) sfxKey = "drum";
    else if (ad.includes("correct") || ad.includes("ding")) sfxKey = "correct";
    else if (ad.includes("whoosh") || ad.includes("transition")) sfxKey = "whoosh";
    else if (ad.includes("pop-single") || ad.includes("pop_single") || (ad.includes("pop") && ad.includes("single"))) sfxKey = "pop_single";
    else if (ad.includes("pop-double") || ad.includes("pop_double") || (ad.includes("pop") && ad.includes("double"))) sfxKey = "pop_double";
    else if (ad.includes("progress") || ad.includes("fill")) sfxKey = "progress";
    else if (ad.includes("applause") || ad.includes("clap")) sfxKey = "applause";
    
    if (sfxKey && !sfxMap[sfxKey]) {
      // SFX dosyasını .wav uzantılı olsun bizimkilerle uyumlu
      const ext = d.name.substring(d.name.lastIndexOf(".")).toLowerCase();
      const hedefAd = `sfx-${sfxKey}${ext}`;
      const hedef = path.join(hedefKlasor, hedefAd);
      await driveIndir(d.id, hedef, auth);
      sfxMap[sfxKey] = `audio/${hedefAd}`;
      console.log(`  ✓ SFX ${sfxKey}: ${d.name}`);
    }
  }
  
  return sfxMap;
}

async function jessPozlariniIndir(auth, hedefKlasor) {
  if (!GDRIVE_JESS_FOLDER_ID) return {};
  const dosyalar = await driveKlasorIcerigi(GDRIVE_JESS_FOLDER_ID, auth);
  const pngler = dosyalar.filter(d => d.name.toLowerCase().endsWith(".png"));
  const pozMap = {};
  for (const d of pngler) {
    const ad = d.name.toLowerCase().replace(".png", "");
    let pozKey = null;
    if (ad.includes("logo") || ad.includes("kafa") || ad.includes("head")) pozKey = "logo";
    else if (ad.includes("intro")) pozKey = "intro";
    else if (ad.includes("question")) pozKey = "question";
    else if (ad.includes("thinking")) pozKey = "thinking";
    else if (ad.includes("correct")) pozKey = "correct";
    else if (ad.includes("outro")) pozKey = "outro";
    if (pozKey) {
      const hedef = path.join(hedefKlasor, `jess-${pozKey}.png`);
      await driveIndir(d.id, hedef, auth);
      pozMap[pozKey] = hedef;
    }
  }
  console.log(`✓ Jess pozları: ${Object.keys(pozMap).join(", ")}`);
  return pozMap;
}

async function bgMuzikIndir(auth, hedefYol) {
  if (!GDRIVE_MUZIK_FOLDER_ID) return null;
  const moodKlasor = await driveAltKlasorAraSA("kids-happy", GDRIVE_MUZIK_FOLDER_ID, auth);
  const kaynakId = moodKlasor.length > 0 ? moodKlasor[0].id : GDRIVE_MUZIK_FOLDER_ID;
  const dosyalar = await driveKlasorIcerigi(kaynakId, auth);
  const muzikler = dosyalar.filter(d =>
    d.name.match(/\.(mp3|wav|m4a|ogg)$/i) &&
    !d.name.toLowerCase().includes("intro-outro")
  );
  if (muzikler.length === 0) return null;
  const secilen = muzikler[Math.floor(Math.random() * muzikler.length)];
  await driveIndir(secilen.id, hedefYol, auth);
  console.log(`✓ Müzik: ${secilen.name}`);
  return hedefYol;
}

// ─── MAIN ──────────────────────────────────────────────────────────
async function main() {
  const toplamBaslangic = Date.now();

  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);

    try {
      await execAsync("which ffmpeg");
      await execAsync("which npx");
    } catch (e) {
      throw new Error("Gereken araç yok (ffmpeg veya npx)");
    }
    
    // ÖN-KONTROL: Önceki aşamalar tamamlanmadan video montaj başlatılmaz.
    // Kullanıcı talebi: "image tamamlanmadan video montaja geçmesin"
    const gorselStatus = String(job.gorsel_status || "");
    const sesStatus = String(job.ses_status || "");
    if (!gorselStatus.startsWith("completed")) {
      throw new Error(
        `Görsel üretimi tamamlanmamış (gorsel_status: "${gorselStatus || "yok"}"). ` +
        `Önce 02-gorsel-uret tamamlanmalı. Video montaj başlatılamaz.`
      );
    }
    if (!sesStatus.startsWith("completed")) {
      throw new Error(
        `Seslendirme tamamlanmamış (ses_status: "${sesStatus || "yok"}"). ` +
        `Önce 03-seslendirme-uret tamamlanmalı. Video montaj başlatılamaz.`
      );
    }
    console.log(`✓ Ön-kontrol: gorsel_status=${gorselStatus}, ses_status=${sesStatus}`);

    await jobGuncelle(JOB_ID, { video_status: "running" });

    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    // remotion/public'i komple silme - brand/ klasörü (repo'dan gelen) korunmalı
    // Sadece dinamik alt klasörleri temizle: questions, jess, audio
    for (const sub of ["questions", "jess", "audio"]) {
      const p = path.join(REMOTION_PUBLIC, sub);
      fs.rmSync(p, { recursive: true, force: true });
      fs.mkdirSync(p, { recursive: true });
    }
    // public'in kendisi de var olmazsa oluştur (brand olmadan ilk çalıştırmada)
    fs.mkdirSync(REMOTION_PUBLIC, { recursive: true });

    const saAuth = getServiceAccountAuth();

    // 1. Format tespit
    const format = await formatTespit(job.drive_folder_id, saAuth);
    const compositionId = format === "shorts" ? "KidsQuizShorts" : "KidsQuizLong";
    console.log(`📺 Format: ${format} → ${compositionId}`);

    // 1.5. Jess greeting videoları (intro/outro) indir + chroma key uygula
    const jessPublicDir = path.join(REMOTION_PUBLIC, "jess");
    fs.mkdirSync(jessPublicDir, { recursive: true });
    console.log("🦊 Jess greeting videoları hazırlanıyor...");
    const jessSureleri = await jessGreetingVideolariHazirla(format, saAuth, jessPublicDir);
    console.log(`  ✓ Jess intro: ${jessSureleri.introDuration.toFixed(2)}s, outro: ${jessSureleri.outroDuration.toFixed(2)}s`);
    
    // Audio dizini (03-seslendirme'den topic-announce.mp3 + outro-announce.mp3 buraya gelecek)
    const audioPublicDir = path.join(REMOTION_PUBLIC, "audio");
    fs.mkdirSync(audioPublicDir, { recursive: true });

    // 2. questions.json indir (önce 02-ses, yoksa ana klasör)
    const questionsData = await questionsJsonOku(
      job.drive_folder_id,
      saAuth,
      path.join(TMP_DIR, "questions.json")
    );
    if (!questionsData) throw new Error("questions.json yok!");
    const questions = questionsData.questions;
    const soruSayisi = questions.length;
    console.log(`❓ ${soruSayisi} soru`);

    // 3. audio-segments.json indir (02-ses klasöründen)
    const sesKlasor = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasor.length === 0) throw new Error("02-ses klasörü yok");
    const segmentsManifest = await jsonIndir(
      sesKlasor[0].id,
      "audio-segments.json",
      saAuth,
      path.join(TMP_DIR, "audio-segments.json")
    );
    if (!segmentsManifest) throw new Error("audio-segments.json yok! 03-seslendirme v5 çalıştırıldı mı?");
    
    console.log(`🎙 ${segmentsManifest.total_segments} ses parçası, toplam ${segmentsManifest.total_voice_duration.toFixed(1)}s`);

    // 4. Tüm ses parçalarını indir
    const sesler = await driveKlasorIcerigi(sesKlasor[0].id, saAuth);
    const mp3ler = sesler.filter(d => d.name.toLowerCase().endsWith(".mp3"));
    
    console.log("⬇️ Ses parçaları indiriliyor...");
    const sesIndirmePromises = [];
    const sesPathMap = {}; // {key: path}
    
    for (const seg of segmentsManifest.segments) {
      const driveDosya = mp3ler.find(m => m.name === seg.filename);
      if (!driveDosya) {
        console.warn(`⚠ ${seg.filename} Drive'da yok`);
        continue;
      }
      const yerelYol = path.join(REMOTION_PUBLIC, "audio", seg.filename);
      sesIndirmePromises.push(driveIndir(driveDosya.id, yerelYol, saAuth));
      sesPathMap[seg.key] = `audio/${seg.filename}`;
    }
    
    // 5. Soru görsellerini indir
    const gorselKlasor = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    if (gorselKlasor.length === 0) throw new Error("01-gorseller yok");
    const gorseller = await driveKlasorIcerigi(gorselKlasor[0].id, saAuth);
    const gorselDosyalar = gorseller.filter(d => d.name.match(/\.(jpg|jpeg|png|webp)$/i));
    
    // YENİ: Her soru için 2 görsel (question + fun_fact) + 1 background (en sonda)
    // Sıra: q1_question, q1_funfact, q2_question, q2_funfact, ..., background
    // Toplam 2N+1 görsel beklenir
    // Backward compat: eski jobs için 1N veya 2N olabilir (bg yok)
    const beklenenYeni = soruSayisi * 2 + 1;  // 2N+1 (yeni format)
    const beklenenOrta = soruSayisi * 2;       // 2N (orta format - bg yok ama fun fact var)
    const beklenenEski = soruSayisi;           // 1N (eski format - bg ve fun fact yok)
    
    let bgGorseli = null;  // Background dosyasının Drive ID'si
    let tekGorselMu = false;
    
    if (gorselDosyalar.length >= beklenenYeni) {
      // YENİ FORMAT: 2N+1
      console.log(`✓ ${gorselDosyalar.length} görsel (yeni format 2N+1 = ${beklenenYeni})`);
      bgGorseli = gorselDosyalar[beklenenOrta]; // index 2N = background
    } else if (gorselDosyalar.length >= beklenenOrta) {
      // ORTA FORMAT: 2N (bg yok, fun fact var)
      console.log(`✓ ${gorselDosyalar.length} görsel (orta format 2N = ${beklenenOrta}, bg yok)`);
      tekGorselMu = false;
    } else if (gorselDosyalar.length >= beklenenEski) {
      // ESKİ FORMAT: 1N (bg yok, fun fact yok)
      console.log(`⚠ ${gorselDosyalar.length} görsel (eski format 1N, fun fact aynı görsel)`);
      tekGorselMu = true;
    } else {
      throw new Error(`${gorselDosyalar.length} görsel, ${soruSayisi} soru için yetersiz`);
    }
    
    console.log("⬇️ Soru + fun fact + background görselleri indiriliyor...");
    const gorselIndirmePromises = [];
    
    // Background indir (varsa)
    let backgroundImagePath = null;
    if (bgGorseli) {
      const bgYol = path.join(REMOTION_PUBLIC, "questions", "background.jpg");
      gorselIndirmePromises.push(driveIndir(bgGorseli.id, bgYol, saAuth));
      backgroundImagePath = "questions/background.jpg";
      console.log(`  ✓ Background: ${bgGorseli.name}`);
    }
    
    // Surprise box görselleri (sadece WYR sorular için, 05-Surprise-Box klasöründen)
    // Direkt folder ID kullanılır (SA bu klasörü göremeyebilir, share gerekmez)
    let surpriseBoxFiles = [];
    const hasWyrQ = questions.some(q => q.question_type === "would_you_rather");
    if (hasWyrQ && GDRIVE_SURPRISE_BOX_FOLDER_ID) {
      try {
        const sbAllFiles = await driveKlasorIcerigi(GDRIVE_SURPRISE_BOX_FOLDER_ID, saAuth);
        surpriseBoxFiles = sbAllFiles.filter(f => /\.png$/i.test(f.name));
        if (surpriseBoxFiles.length > 0) {
          console.log(`  ✓ 05-Surprise-Box: ${surpriseBoxFiles.length} görsel`);
        } else {
          console.warn(`  ⚠ 05-Surprise-Box klasörü boş veya PNG yok (ID: ${GDRIVE_SURPRISE_BOX_FOLDER_ID})`);
        }
      } catch (e) {
        console.warn(`  ⚠ Sürpriz kutu hatası: ${e.message}`);
      }
    } else if (hasWyrQ) {
      console.warn(`  ⚠ GDRIVE_SURPRISE_BOX_FOLDER_ID secret eksik`);
    }

    for (let i = 0; i < soruSayisi; i++) {
      // Soru görseli (q01.jpg)
      const qAdi = `q${String(i + 1).padStart(2, "0")}.jpg`;
      const qYol = path.join(REMOTION_PUBLIC, "questions", qAdi);
      
      // Fun fact görseli (q01-fact.jpg)
      const fAdi = `q${String(i + 1).padStart(2, "0")}-fact.jpg`;
      const fYol = path.join(REMOTION_PUBLIC, "questions", fAdi);
      
      if (tekGorselMu) {
        // Eski yapı: sıralı N görsel, fact = question ile aynı
        gorselIndirmePromises.push(driveIndir(gorselDosyalar[i].id, qYol, saAuth));
        gorselIndirmePromises.push(driveIndir(gorselDosyalar[i].id, fYol, saAuth));
      } else {
        // Yeni yapı: çift index question, tek index fun_fact
        const qIdx = i * 2;
        const fIdx = i * 2 + 1;
        gorselIndirmePromises.push(driveIndir(gorselDosyalar[qIdx].id, qYol, saAuth));
        // fact yoksa question gorselini fallback kullan
        gorselIndirmePromises.push(
          driveIndirFallback(gorselDosyalar[fIdx].id, fYol, qYol, saAuth)
        );
      }
      
      questions[i].image_path = `questions/${qAdi}`;
      questions[i].fun_fact_image_path = `questions/${fAdi}`;

      if (questions[i].question_type === "would_you_rather") {
        if (!questions[i].visible_option) questions[i].visible_option = {};
        if (!questions[i].surprise_option) questions[i].surprise_option = {};
        questions[i].visible_option.image_path = `questions/${qAdi}`;
        questions[i].surprise_option.surprise_image_path = `questions/${fAdi}`;
        // Random kutu görseli (her soru için farklı seçim)
        if (surpriseBoxFiles.length > 0) {
          const sbFile = surpriseBoxFiles[Math.floor(Math.random() * surpriseBoxFiles.length)];
          const sbAdi = `surprise-box-${String(i + 1).padStart(2, "0")}.png`;
          const sbYol = path.join(REMOTION_PUBLIC, "questions", sbAdi);
          gorselIndirmePromises.push(driveIndir(sbFile.id, sbYol, saAuth));
          questions[i].surprise_box_image_path = `questions/${sbAdi}`;
        }
      }
    }

    // 6. Jess pose'larını indir
    const jessPozlarPromise = jessPozlariniIndir(saAuth, path.join(REMOTION_PUBLIC, "jess"));

    // 7. Arka plan müziği indir
    const bgMuzikYol = path.join(REMOTION_PUBLIC, "audio", "bg-music.mp3");
    const bgMuzikPromise = bgMuzikIndir(saAuth, bgMuzikYol);

    // 8. SFX dosyalarını indir
    console.log("⬇️ SFX indiriliyor...");
    const sfxPromise = sfxIndir(saAuth, path.join(REMOTION_PUBLIC, "audio"));

    const [jessPozlar, _bgMuzik, sfxMap] = await Promise.all([
      jessPozlarPromise,
      bgMuzikPromise,
      sfxPromise,
      ...sesIndirmePromises,
      ...gorselIndirmePromises,
    ]);
    
    console.log(`✓ Tüm materyaller indirildi`);
    console.log(`✓ SFX: ${Object.keys(sfxMap || {}).join(", ") || "yok"}`);

    // 9. Sorulara audio path + duration ata
    const segByKey = {};
    for (const seg of segmentsManifest.segments) {
      segByKey[seg.key] = seg;
    }
    
    for (let i = 0; i < soruSayisi; i++) {
      const idx = String(i + 1).padStart(2, "0");
      const qSeg = segByKey[`q${idx}-question`];
      const aSeg = segByKey[`q${idx}-answer`];
      const isWyr = questions[i].question_type === "would_you_rather";

      if (qSeg) {
        questions[i].question_audio_path = `audio/${qSeg.filename}`;
        questions[i].question_audio_duration = qSeg.duration;
      } else {
        questions[i].question_audio_duration = 8.0;
      }

      if (isWyr) {
        const rSeg = segByKey[`q${idx}-reveal`];
        if (rSeg) {
          questions[i].reveal_audio_path = `audio/${rSeg.filename}`;
          questions[i].reveal_audio_duration = rSeg.duration;
        } else {
          questions[i].reveal_audio_duration = 5.0;
        }
      } else {
        if (aSeg) {
          questions[i].answer_audio_path = `audio/${aSeg.filename}`;
          questions[i].answer_audio_duration = aSeg.duration;
        } else {
          questions[i].answer_audio_duration = 8.0;
        }
      }
    }

    // 10. inputProps hazırla
    const jessPosesForRemotion = {};
    for (const [pose, absPath] of Object.entries(jessPozlar)) {
      jessPosesForRemotion[pose] = path.relative(REMOTION_PUBLIC, absPath);
    }
    
    // Topic + Outro announce ses parçaları (03-seslendirme'den geldi, audio/ altında)
    const topicAnnounceSeg = segByKey["topic-announce"];
    const outroAnnounceSeg = segByKey["outro-announce"];
    if (!topicAnnounceSeg) throw new Error("topic-announce.mp3 yok! 03-seslendirme v8 çalıştırıldı mı?");
    if (!outroAnnounceSeg) throw new Error("outro-announce.mp3 yok! 03-seslendirme v8 çalıştırıldı mı?");
    
    // Sahne süreleri:
    // Intro = Jess video + topic announce + 2s buffer (en az 7s)
    // Outro = Jess outro video + outro announce + 2s buffer (en az 8s)
    const introMinDuration = Math.max(
      jessSureleri.introDuration + topicAnnounceSeg.duration + 2,
      7
    );
    const outroMinDuration = Math.max(
      jessSureleri.outroDuration + outroAnnounceSeg.duration + 2,
      8
    );
    console.log(`  ⏱ Intro toplam: ${introMinDuration.toFixed(2)}s, Outro toplam: ${outroMinDuration.toFixed(2)}s`);

    const IS_TEST_MODE = questionsData.is_test_mode === true;
    if (IS_TEST_MODE) console.log("🧪 TEST MODE: intro/outro render edilmeyecek, sadece sorular");

    const inputProps = {
      title: "GeniMini Tests",
      topic: questionsData.intro_title || questionsData.konu || job.konu || "",
      channel_name: "GeniMini Tests",
      questions: questions,
      jess_poses: jessPosesForRemotion,
      
      // Intro/outro: ayrı mp3 yok, Jess video kendi sesini taşıyor.
      // Sahne 1 = Jess video süresi, Sahne 2 = kalan zaman (topic announce + buffer)
      intro_audio_path: null,
      outro_audio_path: null,
      intro_audio_duration: IS_TEST_MODE ? 0 : introMinDuration,
      outro_audio_duration: IS_TEST_MODE ? 0 : outroMinDuration,
      is_test_mode: IS_TEST_MODE,
      
      // Jess video gerçek süreleri (composition Sahne 1 / Sahne 2 ayrım noktası için)
      jess_intro_video_duration: jessSureleri.introDuration,
      jess_outro_video_duration: jessSureleri.outroDuration,
      
      // Topic announcement - Intro Sahne 2'de oynar (03-seslendirme'den)
      topic_announce_path: `audio/${topicAnnounceSeg.filename}`,
      topic_announce_duration: topicAnnounceSeg.duration,
      
      // Outro announcement - Outro Sahne 2 (Subscribe) sahnesinde oynar (03-seslendirme'den)
      outro_announce_path: `audio/${outroAnnounceSeg.filename}`,
      outro_announce_duration: outroAnnounceSeg.duration,
      
      background_music_url: fs.existsSync(bgMuzikYol)
        ? path.relative(REMOTION_PUBLIC, bgMuzikYol)
        : undefined,
      
      // Topic-themed background image
      background_image_path: backgroundImagePath,
      
      // Intro emoji bandı
      topic_emojis: questionsData.topic_emojis,

      // SFX path'leri
      sfx_tick: sfxMap.tick,
      sfx_drum: sfxMap.drum,
      sfx_correct: sfxMap.correct,
      sfx_whoosh: sfxMap.whoosh,
      sfx_pop_single: sfxMap.pop_single,
      sfx_pop_double: sfxMap.pop_double,
      sfx_progress: sfxMap.progress,
      sfx_applause: sfxMap.applause,
    };

    const propsJsonPath = path.join(TMP_DIR, "input-props.json");
    fs.writeFileSync(propsJsonPath, JSON.stringify(inputProps, null, 2));
    console.log(`✓ inputProps yazıldı`);
    console.log(`  Intro: ${inputProps.intro_audio_duration.toFixed(1)}s`);
    console.log(`  Outro: ${inputProps.outro_audio_duration.toFixed(1)}s`);
    console.log(`  Q durations: ${questions.map(q => `${(q.question_audio_duration || 0).toFixed(1)}+${(q.answer_audio_duration ?? q.reveal_audio_duration ?? 0).toFixed(1)}`).join(", ")}`);

    // 10. NPM install
    console.log("📦 Remotion bağımlılıkları kuruluyor...");
    await execAsync(`cd "${REMOTION_DIR}" && npm install --silent --no-audit --no-fund`, {
      maxBuffer: 200 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });

    // 11. Render - format'a göre optimize
    const finalVideoYol = path.join(TMP_DIR, "final.mp4");
    console.log("🎬 Remotion render başlıyor...");
    
    // Long video çok uzun render oluyor (1+ saat), shorts kısa
    // GitHub runner 4 vCPU - concurrency=4 paralel çalıştırır
    // Long için: concurrency 2 (RAM yetmez 4'e), crf 26 (daha hızlı kod)
    // Shorts için: concurrency 1 (daha güvenli, kısa zaten)
    const concurrency = format === "long" ? 2 : 1;
    const crf = format === "long" ? 26 : 22;  // long için biraz düşük kalite, çok daha hızlı
    
    const renderCmd = `cd "${REMOTION_DIR}" && npx remotion render src/index.ts ${compositionId} "${finalVideoYol}" --props="${propsJsonPath}" --concurrency=${concurrency} --codec=h264 --crf=${crf} --pixel-format=yuv420p`;
    console.log(`🚀 Render config: concurrency=${concurrency}, crf=${crf}`);
    
    const renderBaslangic = Date.now();
    const { stderr: renderErr } = await execAsync(renderCmd, {
      maxBuffer: 500 * 1024 * 1024,
      timeout: 90 * 60 * 1000, // 90 dk max (long için)
    });
    const renderSure = ((Date.now() - renderBaslangic) / 1000).toFixed(0);
    console.log(`✓ Render tamam: ${renderSure}s`);
    if (renderErr) console.log(`stderr (ignored): ${renderErr.substring(0, 300)}`);

    if (!fs.existsSync(finalVideoYol)) {
      throw new Error("Render çıktısı oluşmadı!");
    }
    
    const finalStats = fs.statSync(finalVideoYol);
    console.log(`✓ Final video: ${(finalStats.size / 1024 / 1024).toFixed(1)} MB`);

    // 12. Drive'a yükle
    let videoKlasor = await driveAltKlasorBul("07-video", job.drive_folder_id);
    let videoKlasorId;
    if (videoKlasor.length === 0) {
      const yeni = await driveKlasorAc("07-video", job.drive_folder_id);
      videoKlasorId = yeni.id;
    } else {
      videoKlasorId = videoKlasor[0].id;
    }

    const filename = `kids-quiz-${format}-${Date.now()}.mp4`;
    const filepath = path.join(TMP_DIR, filename);
    fs.renameSync(finalVideoYol, filepath);

    const yuklenen = await driveDosyaYukle({ filename, filepath }, videoKlasorId, "video/mp4");

    console.log(`📂 Drive'a yüklendi: ${yuklenen.link}`);

    // Temizlik
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.rmSync(REMOTION_PUBLIC, { recursive: true, force: true });

    const toplamSureSec = ((Date.now() - toplamBaslangic) / 1000).toFixed(0);
    
    // Toplam video süresi tahmini
    const tahminToplam = inputProps.intro_audio_duration +
      questions.reduce((s, q) => {
        const answerDur = q.question_type === "would_you_rather"
          ? (q.reveal_audio_duration || 0)
          : (q.answer_audio_duration || 0);
        return s + (q.question_audio_duration || 0) + 5 + 2 + answerDur + 1;
      }, 0) +
      inputProps.outro_audio_duration;
    const videoSureDk = Math.floor(tahminToplam / 60);
    const videoSureSn = Math.floor(tahminToplam % 60);

    try {
      await jobGuncelle(JOB_ID, {
        video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB`,
      });
    } catch (e) {
      console.warn(`jobGuncelle hatası (devam): ${e.message}`);
    }

    // Onay sayfası linki (render sonrası değişiklik için)
    const workerUrl = (process.env.WORKER_URL || "").replace(/\/+$/, "");
    const onayLink = workerUrl ? `${workerUrl}/?job=${JOB_ID}` : "";

    // Markdown link syntax — bare URL with underscores (JOB_ID) causes Telegram parse errors
    const msg = onayLink
      ? `🎬 Video hazır!\n[Drive linki](${yuklenen.link})\n\n📝 Değişiklik yapmak için onay sayfasını tıklayınız:\n[Onay sayfası](${onayLink})`
      : `🎬 Video hazır!\n[Drive linki](${yuklenen.link})`;

    console.log(`📨 Telegram mesajı:\n${msg}`);

    try {
      await telegram(job.chat_id, msg);
      console.log("📨 Telegram'a gönderildi");
    } catch (tgErr) {
      console.error(`❌ Telegram gönderilemedi: ${tgErr.message}`);
    }

    // 02.5'i tetikle ki KV'deki onay sayfası verisi taze olsun (yeni değişiklik turu için)
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
              "User-Agent": "geniminitests-video-montaj",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              event_type: "onay_tetikle",
              client_payload: { job_id: JOB_ID, chat_id: job.chat_id },
            }),
          }
        );
        if (dispatchRes.ok) {
          console.log("02.5-onay-tetikle dispatch edildi (post-render)");
        } else {
          console.warn(`02.5 dispatch warn: ${dispatchRes.status}`);
        }
      }
    } catch (e) {
      console.warn(`02.5 dispatch error (devam): ${e.message}`);
    }

    console.log(`✅ TOPLAM: ${toplamSureSec}s`);
    process.exit(0);

  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, {
        video_status: `error: ${error.message.substring(0, 100)}`,
      });
      await telegram(
        job.chat_id,
        `❌ *07-Video error:* ${error.message.substring(0, 400)}`
      );
    } catch (e) {}
    process.exit(1);
  }
}

main();
