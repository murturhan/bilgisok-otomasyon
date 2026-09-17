// REV 011/17SEP26 - SECICI URETIM: sadece ses_yeniden_uret listesindekiler TTS e gider, digerleri Drive dan alinir; duplicate mp3 temizligi
/**
 * 03 - Seslendirme v8 (topic-announce + outro-announce eklendi)
 *
 * v6: Leda voice + pitch +3 (Kore → Leda, +2 → +3)
 * v7: intro.mp3 ve outro.mp3 ARTIK üretilmiyor — Jess video kendi sesini taşıyor
 * v8: topic-announce.mp3 + outro-announce.mp3 üretiliyor (07'deki TTS kodu kaldırıldı,
 *     tüm TTS işi burada — temiz mimari)
 *
 * AYRI MP3'ler üretir:
 *   - topic-announce.mp3 (Intro Sahne 2'de oynar — "Today: TOPIC! Let's play!")
 *   - outro-announce.mp3 (Outro Sahne 2'de oynar — "Subscribe! See you next time!")
 *   - q01-question.mp3, q01-answer.mp3
 *   - q02-question.mp3, q02-answer.mp3
 *   - ...
 *
 * Her MP3'ün süresi audio-segments.json'a yazılır.
 * 07-video-montaj bu süreleri + Jess video sürelerini kullanıp Remotion'a verir.
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { exec } from "child_process";
import { promisify } from "util";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
  getOAuthClient,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";
// TEK KAYNAK: giriş metni Remotion bileşeniyle AYNI dosyadan okunur
import { jessIntroMetni, jessIntroSesDosyaAdi, jessIntroDil } from "../shared/jess-intro.js";

const execAsync = promisify(exec);
const { JOB_ID, GDRIVE_JESS_FOLDER_ID } = process.env;

/**
 * Kalıcı Jess giriş sesini Drive'da ara, varsa indir.
 * Neden Drive (repo değil): GitHub Actions binary'yi repoya geri commit edemiyor,
 * Jess intro/outro VİDEOLARI da zaten aynı klasörde yaşıyor (aynı yaşam döngüsü),
 * ve repo şişmiyor. Klasör: GDRIVE_JESS_FOLDER_ID
 * @returns {Promise<string|null>} indirilen dosyanın yolu, yoksa null
 */
async function kaliciJessSesiIndir(dosyaAdi, hedefYol, auth) {
  if (!GDRIVE_JESS_FOLDER_ID) {
    console.warn(`  ⚠ GDRIVE_JESS_FOLDER_ID yok → kalıcı giriş sesi kullanılamıyor, TTS'e düşülecek`);
    return null;
  }
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${GDRIVE_JESS_FOLDER_ID}' in parents and name='${dosyaAdi}' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  if (!res.data.files?.length) return null;
  const stream = await drive.files.get({ fileId: res.data.files[0].id, alt: "media" }, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(hedefYol);
    stream.data.on("end", resolve).on("error", reject).pipe(ws);
  });
  return hedefYol;
}

/**
 * İşin 02-ses klasöründeki mevcut mp3'leri listele.
 * SEÇİCİ ÜRETİM için: dokunulmayan segment yeniden TTS'e gitmez, bu dosya kullanılır.
 * @returns {Promise<Map<string, string>>} filename -> fileId (aynı adlı birden fazla varsa EN YENİSİ)
 */
async function mevcutSesDosyalari(sesKlasorId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const harita = new Map();
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: `'${sesKlasorId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, createdTime)",
      pageSize: 1000,
      orderBy: "createdTime",
      pageToken,
    });
    for (const f of res.data.files || []) {
      if (/\.mp3$/i.test(f.name)) harita.set(f.name, f.id); // sonraki (daha yeni) öncekini ezer
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return harita;
}

/** Drive'daki bir mp3'ü indir. */
async function sesDosyasiIndir(fileId, hedefYol, auth) {
  const drive = google.drive({ version: "v3", auth });
  const stream = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(hedefYol);
    stream.data.on("end", resolve).on("error", reject).pipe(ws);
  });
  return hedefYol;
}

/**
 * Aynı adlı eski mp3'leri sil (yükleme öncesi).
 * driveDosyaYukle her seferinde YENİ dosya yaratıyor; silinmezse aynı isimden
 * birden fazla kalıyor ve 07 `find(name === ...)` ile ESKİSİNİ seçebiliyor.
 */
async function eskiSesDosyasiniSil(sesKlasorId, filename) {
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  let silinen = 0;
  try {
    const res = await drive.files.list({
      q: `'${sesKlasorId}' in parents and name='${filename}' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 50,
    });
    for (const f of res.data.files || []) {
      try { await drive.files.delete({ fileId: f.id }); silinen++; } catch (e) {
        console.warn(`  ⚠ eski ${filename} silinemedi: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`  ⚠ eski ${filename} aranamadı: ${e.message}`);
  }
  return silinen;
}

/** Üretilen kalıcı giriş sesini Drive'a BİR KEZ yükle. */
async function kaliciJessSesiYukle(dosyaAdi, kaynakYol) {
  if (!GDRIVE_JESS_FOLDER_ID) {
    console.warn(`  ⚠ GDRIVE_JESS_FOLDER_ID yok → ${dosyaAdi} kalıcı kaydedilemedi (her job'da yeniden üretilir)`);
    return false;
  }
  try {
    await driveDosyaYukle({ filename: dosyaAdi, filepath: kaynakYol }, GDRIVE_JESS_FOLDER_ID, "audio/mpeg");
    console.log(`  💾 ${dosyaAdi} Drive'a kalıcı kaydedildi — sonraki job'larda TTS ÇAĞRISI YAPILMAYACAK`);
    return true;
  } catch (e) {
    console.warn(`  ⚠ ${dosyaAdi} Drive'a kaydedilemedi: ${e.message}`);
    return false;
  }
}

// ⚠️ DEĞİŞTİ: Kore → Leda (daha yumuşak, sempatik kadın sesi)
const VOICE_NAME = "en-US-Chirp3-HD-Leda";
const LANGUAGE_CODE = "en-US";
// ⚠️ DEĞİŞTİ: 2 → 3 (daha sevimli/çocuksu)
const PITCH_SHIFT_SEMITONES = 3;
const MAX_CHARS_PER_REQUEST = 4500;

// ─── METIN TEMİZLEME (TTS için) ─────────────────────────────────
function ttsMetinTemizle(metin) {
  return String(metin || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── TTS API çağrısı ───────────────────────────────────────────
async function ttsCagri(metin, accessToken) {
  const voice = { languageCode: LANGUAGE_CODE, name: VOICE_NAME };
  const audioConfig = { audioEncoding: "MP3", sampleRateHertz: 24000 };
  const url = "https://texttospeech.googleapis.com/v1/text:synthesize";
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const temizMetin = ttsMetinTemizle(metin);
  const body = { input: { text: temizMetin }, voice, audioConfig };
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS API ${res.status}: ${errText.substring(0, 300)}`);
  }
  const data = await res.json();
  if (!data.audioContent) throw new Error("TTS audioContent yok");
  return Buffer.from(data.audioContent, "base64");
}

// ─── Pitch shift (rubberband veya asetrate fallback) ───────────
async function pitchShiftUygula(girdiYol, ciktiYol) {
  const pitchRatio = Math.pow(2, PITCH_SHIFT_SEMITONES / 12);
  
  try {
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "rubberband=pitch=${pitchRatio.toFixed(6)}" -ar 24000 "${ciktiYol}"`;
    await execAsync(cmd);
  } catch (e) {
    console.warn("rubberband yok, asetrate fallback");
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "asetrate=24000*${pitchRatio.toFixed(6)},atempo=${(1/pitchRatio).toFixed(6)},aresample=24000" "${ciktiYol}"`;
    await execAsync(cmd);
  }
}

// ─── MP3 süresi (saniye) ───────────────────────────────────────
async function mp3Suresi(yol) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${yol}"`
  );
  return parseFloat(stdout.trim());
}

// ─── Tek bir ses parçasını üret ────────────────────────────────
async function sesParcasiUret(metin, ciktiAdi, accessToken, tmpDir) {
  const temizMetin = ttsMetinTemizle(metin);
  
  if (!temizMetin || temizMetin.length < 3) {
    console.warn(`⚠ ${ciktiAdi}: metin çok kısa, atlanıyor`);
    return null;
  }
  
  const buffer = await ttsCagri(temizMetin, accessToken);
  const hamYol = path.join(tmpDir, `ham-${ciktiAdi}`);
  fs.writeFileSync(hamYol, buffer);
  
  const shiftedYol = path.join(tmpDir, ciktiAdi);
  await pitchShiftUygula(hamYol, shiftedYol);
  
  try { fs.unlinkSync(hamYol); } catch (e) {}
  
  const sure = await mp3Suresi(shiftedYol);
  const stats = fs.statSync(shiftedYol);
  
  console.log(`  ✓ ${ciktiAdi}: ${sure.toFixed(2)}s, ${(stats.size/1024).toFixed(0)}KB`);
  
  return {
    filename: ciktiAdi,
    filepath: shiftedYol,
    duration: sure,
    text: temizMetin,
    size: stats.size,
  };
}

// ─── questions.json'u Drive'dan oku ───────────────────────────
async function questionsJsonOku(jobFolderId, auth, hedefYol) {
  const drive = google.drive({ version: "v3", auth });
  
  const sesKlasor = await driveAltKlasorBul("02-ses", jobFolderId);
  let fileId = null;
  
  if (sesKlasor.length > 0) {
    const res1 = await drive.files.list({
      q: `'${sesKlasor[0].id}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    if (res1.data.files && res1.data.files.length > 0) {
      fileId = res1.data.files[0].id;
      console.log("✓ questions.json '02-ses' klasöründe bulundu");
    }
  }
  
  if (!fileId) {
    const res2 = await drive.files.list({
      q: `'${jobFolderId}' in parents and name='questions.json' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    if (res2.data.files && res2.data.files.length > 0) {
      fileId = res2.data.files[0].id;
      console.log("✓ questions.json ana klasörde bulundu (eski format)");
    }
  }
  
  if (!fileId) return null;
  
  const stream = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(hedefYol);
    stream.data.on("end", () => resolve()).on("error", reject).pipe(ws);
  });
  
  return JSON.parse(fs.readFileSync(hedefYol, "utf8"));
}

// ─── MAIN ──────────────────────────────────────────────────────
async function main() {
  const baslangic = Date.now();
  
  try {
    console.log(`Job: ${JOB_ID}`);
    // GECİCİ: Shorts format disabled
    if (JOB_ID && JOB_ID.endsWith("S")) throw new Error("Shorts şimdilik desteklenmiyor");
    const job = await jobOku(JOB_ID);

    await jobGuncelle(JOB_ID, { ses_status: "running" });
    
    const tmpDir = "/tmp/seslendirme";
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    
    const oauthAuth = getOAuthClient();
    
    const questionsJsonYol = path.join(tmpDir, "questions.json");
    const questionsData = await questionsJsonOku(job.drive_folder_id, oauthAuth, questionsJsonYol);
    if (!questionsData) throw new Error("questions.json bulunamadı!");
    
    const questions = questionsData.questions;
    const soruSayisi = questions.length;
    console.log(`📋 ${soruSayisi} soru için ses parçaları üretilecek`);
    console.log(`Voice: ${VOICE_NAME} (pitch +${PITCH_SHIFT_SEMITONES})`);
    
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const authClient = await auth.getClient();
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;
    if (!accessToken) throw new Error("TTS access token alınamadı");
    console.log("✓ TTS access token alındı");
    
    const segmentTasks = [];
    
    // intro/outro mp3 üretimi kaldırıldı - Jess video kendi sesini taşıyor
    
    // TOPIC ANNOUNCE — Intro Sahne 2'de (topic reveal) oynar
    // OUTRO ANNOUNCE — Outro Sahne 2 (Subscribe) sahnesinde oynar
    // Format'a göre cümle değişir
    const format = questionsData.format || "shorts";

    // JESS GİRİŞ/KAPANIŞ METNİ
    // ÖNEMLİ: burada ARTIK questionsData.konu KULLANILMIYOR. Eskiden metin
    // `Today's topic: ${konu}!` diye kuruluyordu ve konu alanı kullanıcının forma
    // yazdığı UZUN talimat paragrafı olduğu için Jess talimatı baştan sona okuyordu.
    // Artık 01-icerik-uret'in ürettiği (ve onay sayfasından düzenlenebilen)
    // intro_audio_text / outro_audio_text kullanılıyor.
    const kisaBaslik = String(questionsData.ekran_basligi || "").replace(/[*]{2}/g, "").trim();

    // İKİ AYRI SEGMENT — bilgi tekrarı olmasın:
    //   SEGMENT 1 (intro, Jess selamlar)  → jess/intro.webm videosunun KENDİ sesi (TTS yok)
    //   SEGMENT 2 (başlık ekranı, konu)   → topic-announce.mp3  ← burada üretiliyor
    // Bu yüzden topic-announce metni ASLA selamlamamalı; selamlarsa Jess iki kez
    // "Hi, I'm Jess the Fox" demiş oluyordu.
    const VARSAYILAN_DUYURU = kisaBaslik
      ? `In this video we are playing ${kisaBaslik}! Can you get them all right? This is going to be so much fun!`
      : "In this video we have a fun quiz for you! Can you get them all right?";
    const VARSAYILAN_SELAMLAMA = "Hi friends! I am Jess the Fox! Are you ready to play?";
    const VARSAYILAN_OUTRO = format === "shorts"
      ? "Don't forget to subscribe! See you next time!"
      : "If you enjoyed this quiz, please subscribe and hit the bell! See you next time, friends!";

    // Selamlama tespiti/temizliği (01 ile aynı kurallar) — eski job'lardan gelen
    // veya onay sayfasından elle girilen selamlamalı metinler burada da kesilir.
    const SELAMLAMA_KALIPLARI = [
      /\bhi\b/i, /\bhello\b/i, /\bhey\b/i, /\bwelcome\b/i,
      /\bhiya\b/i, /\bgreetings\b/i,
      /\bjess\b/i, /\bi['’]?m jess\b/i, /\bi am jess\b/i, /\bjess the fox\b/i, /\bjess here\b/i,
    ];
    const selamlamaVarMi = (t) => SELAMLAMA_KALIPLARI.some(re => re.test(String(t || "")));
    const selamlamaTemizle = (t) => {
      const metin = String(t || "").replace(/\s+/g, " ").trim();
      if (!metin) return "";
      const cumleler = metin.match(/[^.!?]+[.!?]*/g) || [metin];
      return cumleler.map(c => c.trim()).filter(c => c && !selamlamaVarMi(c)).join(" ").replace(/\s+/g, " ").trim();
    };

    // Emniyet: metin çok uzunsa (Jess dakikalarca konuşmasın) varsayılana düş
    const JESS_MAX_KELIME = 50;
    const jessMetniSec = (alan, varsayilan) => {
      const metin = String(questionsData[alan] || "").replace(/\s+/g, " ").trim();
      if (!metin) {
        if (varsayilan) console.log(`  ${alan} yok → varsayılan metin kullanılıyor`);
        return varsayilan;
      }
      const kelime = metin.split(" ").filter(Boolean).length;
      if (kelime > JESS_MAX_KELIME) {
        console.warn(`  ⚠ ${alan} çok uzun (${kelime} kelime) → varsayılan metne düşüldü`);
        return varsayilan;
      }
      console.log(`  ${alan} kullanılıyor (${kelime} kelime): "${metin.substring(0, 100)}"`);
      return metin;
    };

    // SEGMENT 2 metni: yeni alan > (geriye uyum) eski intro_audio_text > varsayılan
    let topicAnnounceText = jessMetniSec("konu_duyuru_audio_text", "");
    if (!topicAnnounceText) {
      const eski = jessMetniSec("intro_audio_text", "");
      if (eski) {
        console.log("  konu_duyuru_audio_text yok → eski intro_audio_text kullanılıyor (geriye uyum)");
        topicAnnounceText = eski;
      }
    }
    if (!topicAnnounceText) topicAnnounceText = VARSAYILAN_DUYURU;

    // ÇİFT SELAMLAMA KORUMASI: başlık ekranı metni selamlamamalı
    if (selamlamaVarMi(topicAnnounceText)) {
      const temiz = selamlamaTemizle(topicAnnounceText);
      if (temiz && !selamlamaVarMi(temiz) && temiz.split(/\s+/).filter(Boolean).length >= 5) {
        console.warn(`  ⚠ Başlık ekranı metni SELAMLAMA içeriyordu (Jess ikinci kez selamlıyordu) → temizlendi.\n     Önce: "${topicAnnounceText}"\n     Sonra: "${temiz}"`);
        topicAnnounceText = temiz;
      } else {
        console.warn(`  ⚠ Başlık ekranı metni SELAMLAMA içeriyordu, temizlenemedi → varsayılana düşüldü. Reddedilen: "${topicAnnounceText}"`);
        topicAnnounceText = VARSAYILAN_DUYURU;
      }
    }

    // SEGMENT 1 — SABİT. questions.json'dan OKUNMAZ, Gemini üretmez, onay sayfasından
    // değiştirilemez. Metin shared/jess-intro.js'ten gelir (Remotion ekran yazısı da
    // aynı dosyadan okur → EKRAN ile SES birebir aynı).
    const jessDil = jessIntroDil(questionsData.dil || questionsData.language || "en");
    const introAnnounceText = jessIntroMetni(format, jessDil);
    const kaliciIntroDosya = jessIntroSesDosyaAdi(format, jessDil);

    const outroAnnounceText = jessMetniSec("outro_audio_text", VARSAYILAN_OUTRO);

    console.log("🎙 SES SEGMENT DAĞILIMI (formül: soru × 2 + 3):");
    console.log(`   SEGMENT 1 (intro sahnesi)  → intro-announce.mp3 [SABİT, kalıcı: ${kaliciIntroDosya}] : "${introAnnounceText}"`);
    console.log(`   SEGMENT 2 (başlık ekranı)  → topic-announce.mp3 : "${topicAnnounceText}"`);
    console.log(`   SEGMENT 3 (outro sahnesi)  → outro-announce.mp3 : "${outroAnnounceText}"`);
    console.log(`   + ${soruSayisi} soru × 2 (question + answer) = ${soruSayisi * 2}`);
    console.log(`   TOPLAM beklenen segment: ${soruSayisi * 2 + 3}`);

    // 02.7 onay sayfasından gelen metin değişikliğini işaretlemiş olabilir.
    // Bu script zaten HER çalışmada tüm segmentleri baştan üretiyor, yani işaretli
    // segmentler otomatik yenilenir; burada sadece loglanır ve işaret temizlenir.
    if (Array.isArray(questionsData.ses_yeniden_uret) && questionsData.ses_yeniden_uret.length) {
      console.log(`🔁 02.7 şu segmentleri yeniden üretilecek diye işaretlemiş: ${questionsData.ses_yeniden_uret.join(", ")}`);
      console.log("   (03 zaten tüm segmentleri baştan üretiyor — yeni metinler seslendirilecek)");
    }
    
    // SEGMENT 1 — intro sahnesinde çalar (Jess selamlaması).
    // Bu segment eskiden ÜRETİLMİYORDU; selamlama jess/intro.webm videosunun
    // içine gömülüydü ve konu duyurusu da selamlıyordu → Jess iki kez tanıtıyordu.
    segmentTasks.push({
      key: "intro-announce",
      filename: "intro-announce.mp3",
      text: introAnnounceText,
      type: "announce",
      sabit: true,                    // TTS her job'da ÇAĞRILMAZ
      kaliciDosya: kaliciIntroDosya,  // Drive'da tutulan kalıcı mp3 adı
    });
    segmentTasks.push({
      key: "topic-announce",
      filename: "topic-announce.mp3",
      text: topicAnnounceText,
      type: "announce",
    });
    segmentTasks.push({
      key: "outro-announce",
      filename: "outro-announce.mp3",
      text: outroAnnounceText,
      type: "announce",
    });
    
    for (let i = 0; i < soruSayisi; i++) {
      const q = questions[i];
      const idx = String(i + 1).padStart(2, "0");
      const isWyr = q.question_type === "would_you_rather";

      const qAudioText = q.question_audio_text;
      segmentTasks.push({
        key: `q${idx}-question`,
        filename: `q${idx}-question.mp3`,
        text: qAudioText,
        question_index: i,
        type: "question",
      });
      if (isWyr) {
        // SON WYR JESS SUSMASIN: reveal metni boşsa surprise outcome'dan üret
        // (Gemini bazen son soruda reveal_audio_text/jess_reaction vermiyor → segment üretilmez → Jess sessiz)
        let revealText = (q.reveal_audio_text || q.jess_reaction || "").trim();
        if (!revealText) {
          const outcome = q.surprise_option?.surprise_outcome || "a surprise";
          revealText = q.surprise_option?.surprise_is_good
            ? `And the mystery box reveals... ${outcome}! What a lucky pick!`
            : `Oh no! The mystery box was... ${outcome}! Better luck next time!`;
          console.log(`⚠ q${idx} reveal metni boştu, fallback üretildi: "${revealText}"`);
        }
        segmentTasks.push({
          key: `q${idx}-reveal`,
          filename: `q${idx}-reveal.mp3`,
          text: revealText,
          question_index: i,
          type: "reveal",
        });
      } else {
        segmentTasks.push({
          key: `q${idx}-answer`,
          filename: `q${idx}-answer.mp3`,
          text: q.answer_audio_text,
          question_index: i,
          type: "answer",
        });
      }
    }

    // ─── SEÇİCİ ÜRETİM ────────────────────────────────────────────────────
    // ses_yeniden_uret DİZİ ise: SADECE listedeki segmentler TTS'e gider,
    // diğerleri Drive'daki mevcut mp3'ten alınır (kota + süre israfı yok).
    // Alan YOKSA (ilk çalıştırma / eski job): eskisi gibi HEPSİ üretilir.
    const seciciMod = Array.isArray(questionsData.ses_yeniden_uret);
    const yenidenUretSet = new Set(seciciMod ? questionsData.ses_yeniden_uret : []);
    const sesKlasorList = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasorList.length === 0) throw new Error("02-ses klasörü yok");
    const sesKlasorId = sesKlasorList[0].id;
    const mevcutSesler = seciciMod ? await mevcutSesDosyalari(sesKlasorId, oauthAuth) : new Map();

    if (seciciMod) {
      console.log(`🎯 SEÇİCİ ÜRETİM: sadece şunlar yeniden seslendirilecek → ${yenidenUretSet.size ? [...yenidenUretSet].join(", ") : "(hiçbiri)"}`);
      console.log(`   Drive'da mevcut mp3: ${mevcutSesler.size} dosya`);
    } else {
      console.log("🎙 TAM ÜRETİM: ses_yeniden_uret alanı yok → tüm segmentler üretilecek (ilk çalıştırma)");
    }

    console.log(`📊 Toplam ${segmentTasks.length} ses parçası (formül: soru × 2 + 3)`);

    const segments = [];
    let ttsSayisi = 0, yenidenKullanilan = 0;
    for (let i = 0; i < segmentTasks.length; i++) {
      const task = segmentTasks[i];
      console.log(`Parça ${i+1}/${segmentTasks.length}: ${task.filename}`);

      let sonuc = null;
      let yeniUretildi = false;
      const istendi = !seciciMod || yenidenUretSet.has(task.key);

      // 1) YENİDEN ÜRETİLMESİ İSTENMEDİ + Drive'da mevcut → TTS YOK, mevcut dosya
      if (!istendi && mevcutSesler.has(task.filename)) {
        const hedef = path.join(tmpDir, task.filename);
        try {
          await sesDosyasiIndir(mevcutSesler.get(task.filename), hedef, oauthAuth);
          const sure = await mp3Suresi(hedef);
          const st = fs.statSync(hedef);
          console.log(`  ♻ AYNEN BIRAKILDI — mevcut mp3 kullanıldı (TTS çağrısı YAPILMADI): ${sure.toFixed(2)}s`);
          sonuc = { filename: task.filename, filepath: hedef, duration: sure, text: task.text, size: st.size };
          yenidenKullanilan++;
        } catch (e) {
          console.warn(`  ⚠ Mevcut mp3 alınamadı (${e.message}) → yeniden üretilecek`);
        }
      }

      // 2) SABİT SEGMENT (Jess girişi): kalıcı dosya varsa TTS ÇAĞRISI YAPILMAZ
      if (!sonuc && task.sabit && task.kaliciDosya) {
        const hedef = path.join(tmpDir, task.filename);
        try {
          const indirilen = await kaliciJessSesiIndir(task.kaliciDosya, hedef, oauthAuth);
          if (indirilen) {
            const sure = await mp3Suresi(hedef);
            const st = fs.statSync(hedef);
            console.log(`  ♻ ${task.kaliciDosya} Drive'dan alindi (TTS cagrisi YAPILMADI): ${sure.toFixed(2)}s, ${(st.size / 1024).toFixed(0)}KB`);
            sonuc = { filename: task.filename, filepath: hedef, duration: sure, text: task.text, size: st.size };
            yeniUretildi = true; // 02-ses'e yüklenmeli (kalıcı dosya jess klasöründe)
          }
        } catch (e) {
          console.warn(`  ⚠ Kalici giris sesi alinamadi (${e.message}) -> bir kez uretilecek`);
        }
        if (!sonuc) {
          console.log(`  🆕 ${task.kaliciDosya} Drive'da YOK -> BIR KEZ uretiliyor...`);
          sonuc = await sesParcasiUret(task.text, task.filename, accessToken, tmpDir);
          if (sonuc) { ttsSayisi++; yeniUretildi = true; await kaliciJessSesiYukle(task.kaliciDosya, sonuc.filepath); }
        }
      }

      // 3) TTS ile üret
      if (!sonuc) {
        if (seciciMod && !istendi) {
          console.log(`  ⚠ "AYNEN BIRAK" seçiliydi ama Drive'da mp3 yok → mecburen üretiliyor`);
        }
        sonuc = await sesParcasiUret(task.text, task.filename, accessToken, tmpDir);
        if (sonuc) { ttsSayisi++; yeniUretildi = true; }
      }

      if (sonuc) {
        segments.push({
          key: task.key,
          yeniUretildi,
          ...sonuc,
          question_index: task.question_index,
          type: task.type,
        });
      }
      
      if (i < segmentTasks.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    
    console.log(`✓ ${segments.length} parça hazır — TTS ile üretilen: ${ttsSayisi}, mevcuttan alınan: ${yenidenKullanilan}`);

    // SADECE yeni üretilenler yüklenir. Aynen bırakılanlar zaten Drive'da.
    const yuklenecek = segments.filter(s => s.yeniUretildi);
    console.log(`⬆️ Drive'a yüklenecek: ${yuklenecek.length} dosya (${segments.length - yuklenecek.length} tanesi zaten Drive'da)`);

    const PARALLEL = 4;
    for (let i = 0; i < yuklenecek.length; i += PARALLEL) {
      const batch = yuklenecek.slice(i, i + PARALLEL);
      await Promise.all(
        batch.map(async (s) => {
          // Aynı adlı eskiyi SİL, sonra yükle — yoksa Drive'da iki kopya kalıyor
          // ve 07 `find(name === ...)` ile ESKİSİNİ seçebiliyor.
          await eskiSesDosyasiniSil(sesKlasorId, s.filename);
          await driveDosyaYukle({ filename: s.filename, filepath: s.filepath }, sesKlasorId, "audio/mpeg");
        })
      );
    }
    console.log(`✓ ${yuklenecek.length} ses parçası Drive'a yüklendi`);

    // NOT: ses_yeniden_uret işaretini BURADA TEMİZLEMİYORUZ.
    // Sebep 1 (veri kaybı): questions.json'ı silip yeniden yüklemek gerekiyordu;
    //   yükleme adımı patlarsa dosya tamamen kaybolurdu.
    // Sebep 2 (çift kaynak): 03 questions.json'ın hangi klasörden geldiğini takip
    //   etmiyor (02-ses mi kök mü). Yanlış klasöre yazmak ikinci bir questions.json
    //   yaratır ve tek-gerçek-kaynak kuralını bozar.
    // İşareti HER ZAMAN 02.7 yazar (her son-onay gönderiminde yeniden set edilir),
    // yani bayat kalma riski yok. 03 tek başına elle tetiklenirse aynı segmentleri
    // bir kez daha üretir — zararsız.
    
    const segmentsManifest = {
      voice: VOICE_NAME,
      pitch_shift_semitones: PITCH_SHIFT_SEMITONES,
      total_segments: segments.length,
      total_voice_duration: segments.reduce((sum, s) => sum + s.duration, 0),
      segments: segments.map(s => ({
        key: s.key,
        filename: s.filename,
        duration: s.duration,
        question_index: s.question_index,
        type: s.type,
        text: s.text,            // onay formundaki metin kutusu bunu gosterir
      })),
    };
    
    const manifestYol = path.join(tmpDir, "audio-segments.json");
    fs.writeFileSync(manifestYol, JSON.stringify(segmentsManifest, null, 2));
    // Eski manifest'i sil, sonra yükle — yoksa aynı adlı iki dosya kalıyor ve
    // 02.5/07 eskisini okuyabiliyor.
    await eskiSesDosyasiniSil(sesKlasorId, "audio-segments.json");
    await driveDosyaYukle(
      { filename: "audio-segments.json", filepath: manifestYol },
      sesKlasorId,
      "application/json"
    );
    console.log(`✓ audio-segments.json yüklendi`);
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    
    const toplamSure = ((Date.now() - baslangic) / 1000).toFixed(0);
    const voiceTotal = segmentsManifest.total_voice_duration.toFixed(1);
    
    await jobGuncelle(JOB_ID, { ses_status: `completed:${segments.length}` });
    await telegram(
      job.chat_id,
      `🦊 *Jess voice ready!*\n` +
      `🎙 Voice: ${VOICE_NAME} (pitch +${PITCH_SHIFT_SEMITONES})\n` +
      `📊 ${segments.length} segments (${voiceTotal}s total)\n` +
      `⏱ Generation: ${toplamSure}s\n\n` +
      `⏳ Video render başlatılıyor...`
    );
    
    // 07-video-montaj'ı otomatik tetikle
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
              "User-Agent": "geniminitests-seslendirme",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              event_type: "video_montaj",
              client_payload: { job_id: JOB_ID, chat_id: job.chat_id },
            }),
          }
        );
        if (dispatchRes.ok) {
          console.log("✅ 07-video-montaj tetiklendi");
        } else {
          const txt = await dispatchRes.text();
          console.warn(`⚠ 07 dispatch hatası: ${dispatchRes.status} ${txt.substring(0, 200)}`);
        }
      } else {
        console.warn("⚠ WORKFLOW_DISPATCH_TOKEN yok, 07 manuel tetiklenmeli");
      }
    } catch (e) {
      console.warn(`⚠ 07 dispatch hatası (devam): ${e.message}`);
    }
    
    console.log(`✅ Seslendirme tamam (${toplamSure}s)`);
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { ses_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *03-Seslendirme error:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
