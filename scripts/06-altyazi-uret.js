/**
 * 06 - Altyazı Üretimi v4 (HİBRİT)
 * - Edge TTS senaryoyu sessiz okur, kelime zamanlarını yakalar (wordBoundaryEnabled:true)
 * - Chirp HD'nin gerçek süresine SCALE
 * - 5-7 kelime per altyazı satırı
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { google } from "googleapis";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
  getOAuthClient,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);

const { JOB_ID } = process.env;
const TMP_DIR = "/tmp/altyazi";

const HEDEF_KELIME_PER_SATIR = 6;

async function driveKlasorIcerigi(klasorId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${klasorId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType)",
    pageSize: 100,
    orderBy: "name",
  });
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
    res.data
      .on("end", () => resolve())
      .on("error", reject)
      .pipe(writeStream);
  });
}

function metniTemizle(metin) {
  return metin
    .replace(/\s+/g, " ")
    .replace(/(\p{L}|\d)'(\p{L})/gu, "$1$2")
    .replace(/(\p{L}|\d)'(?=\s|$)/gu, "$1")
    .trim();
}

async function edgeTtsKelimeZamanlari(metin) {
  console.log("🎤 Edge TTS ile kelime zamanları alınıyor...");
  
  const tts = new MsEdgeTTS();
  
  // KRİTİK: wordBoundaryEnabled:true parametresi olmazsa metadataStream null gelir!
  await tts.setMetadata(
    "tr-TR-AhmetNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    { wordBoundaryEnabled: true, sentenceBoundaryEnabled: false }
  );
  
  return new Promise((resolve, reject) => {
    const kelimeler = [];
    let timeout;
    
    try {
      const stream = tts.toStream(metin);
      
      if (!stream.metadataStream) {
        return reject(new Error("metadataStream hâlâ null (wordBoundaryEnabled verildi ama gelmedi)"));
      }
      
      stream.metadataStream.on("data", (md) => {
        try {
          // md Buffer veya string olabilir
          const str = md instanceof Buffer ? md.toString() : md;
          const obj = typeof str === "string" ? JSON.parse(str) : str;
          const metadata = obj.Metadata || (Array.isArray(obj) ? obj : null);
          
          if (Array.isArray(metadata)) {
            for (const item of metadata) {
              if (item.Type === "WordBoundary" && item.Data) {
                const kelimeMetni = item.Data.text?.Text || item.Data.text || "";
                kelimeler.push({
                  kelime: kelimeMetni,
                  offset: item.Data.Offset,
                  duration: item.Data.Duration || 0,
                });
              }
            }
          }
        } catch (e) {
          // parse hatası göz ardı
        }
      });
      
      stream.audioStream.on("data", () => {}); // veriyi at, sadece sayar
      
      stream.audioStream.on("end", () => {
        clearTimeout(timeout);
        console.log(`  ✓ ${kelimeler.length} kelime zamanı alındı`);
        resolve(kelimeler);
      });
      
      stream.audioStream.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      
      stream.metadataStream.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      
      // 90 saniye timeout (uzun senaryolar için)
      timeout = setTimeout(() => {
        if (kelimeler.length > 0) {
          console.log(`  ⚠ Timeout, ${kelimeler.length} kelime ile devam`);
          resolve(kelimeler);
        } else {
          reject(new Error("Edge TTS timeout, hiç kelime gelmedi"));
        }
      }, 90000);
      
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
}

function offsetToSeconds(offset) {
  return offset / 10_000_000;
}

async function mp3Suresi(yol) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${yol}"`
  );
  return parseFloat(stdout.trim());
}

function kelimeleriSatirlaraGrupla(kelimeler, hedef = HEDEF_KELIME_PER_SATIR) {
  const satirlar = [];
  let mevcut = [];
  
  for (let i = 0; i < kelimeler.length; i++) {
    const k = kelimeler[i];
    mevcut.push(k);
    
    const kelimeMetni = k.kelime || "";
    const cumleSonu = /[.!?…]$/.test(kelimeMetni);
    
    if (mevcut.length >= hedef || (cumleSonu && mevcut.length >= 3)) {
      satirlar.push(mevcut);
      mevcut = [];
    }
  }
  
  if (mevcut.length > 0) {
    if (satirlar.length > 0 && mevcut.length < 3) {
      satirlar[satirlar.length - 1] = satirlar[satirlar.length - 1].concat(mevcut);
    } else {
      satirlar.push(mevcut);
    }
  }
  
  return satirlar;
}

function saniyeyiSrtZamaninaCevir(saniye) {
  if (saniye < 0) saniye = 0;
  const h = Math.floor(saniye / 3600);
  const m = Math.floor((saniye % 3600) / 60);
  const s = Math.floor(saniye % 60);
  const ms = Math.floor((saniye % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.senaryo) throw new Error("Senaryo boş!");
    
    await jobGuncelle(JOB_ID, { altyazi_status: "running" });
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    // 1. Chirp HD MP3
    console.log("📂 Chirp HD ses dosyası indiriliyor...");
    const oauthAuth = getOAuthClient();
    
    const sesKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasorler.length === 0) throw new Error("02-ses klasörü yok");
    
    const sesler = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    if (sesler.length === 0) throw new Error("Ses dosyası yok!");
    
    const sesDosya = sesler[sesler.length - 1];
    const sesYol = path.join(TMP_DIR, "chirp-ses.mp3");
    await driveIndir(sesDosya.id, sesYol, oauthAuth);
    console.log(`  ✓ ${sesDosya.name}`);
    
    const chirpSure = await mp3Suresi(sesYol);
    console.log(`📏 Chirp HD süresi: ${chirpSure.toFixed(2)}s`);
    
    // 2. Edge TTS word boundaries
    const temizMetin = metniTemizle(job.senaryo);
    const edgeKelimeler = await edgeTtsKelimeZamanlari(temizMetin);
    
    if (edgeKelimeler.length === 0) {
      throw new Error("Edge TTS hiç kelime zamanı veremedi!");
    }
    
    const sonKelime = edgeKelimeler[edgeKelimeler.length - 1];
    const edgeSureRaw = offsetToSeconds(sonKelime.offset + sonKelime.duration);
    console.log(`📏 Edge TTS süresi: ${edgeSureRaw.toFixed(2)}s`);
    
    // 3. Scale Edge zamanlarını Chirp'e
    const scale = chirpSure / edgeSureRaw;
    console.log(`⚖️ Scale faktör: ${scale.toFixed(3)} (Chirp/Edge)`);
    
    const chirpZamanli = edgeKelimeler.map(k => ({
      kelime: k.kelime,
      baslangic: offsetToSeconds(k.offset) * scale,
      bitis: offsetToSeconds(k.offset + k.duration) * scale,
    }));
    
    // 4. Satırlara grupla
    const satirGruplari = kelimeleriSatirlaraGrupla(chirpZamanli, HEDEF_KELIME_PER_SATIR);
    console.log(`📝 ${satirGruplari.length} altyazı satırı`);
    
    // 5. SRT üret
    const srtBlocks = [];
    for (let i = 0; i < satirGruplari.length; i++) {
      const grup = satirGruplari[i];
      const baslangic = grup[0].baslangic;
      let bitis = grup[grup.length - 1].bitis;
      
      if (i + 1 < satirGruplari.length) {
        const sonrakiBaslangic = satirGruplari[i + 1][0].baslangic;
        bitis = Math.min(sonrakiBaslangic - 0.05, bitis + 0.3);
      }
      
      if (bitis - baslangic < 1.0) bitis = baslangic + 1.0;
      
      const metin = grup.map(g => g.kelime).join(" ").trim();
      
      srtBlocks.push(
        `${i + 1}\n${saniyeyiSrtZamaninaCevir(baslangic)} --> ${saniyeyiSrtZamaninaCevir(bitis)}\n${metin}\n`
      );
    }
    
    const srtIcerik = srtBlocks.join("\n");
    
    const srtAdi = `altyazi-${Date.now()}.srt`;
    const srtYol = path.join(TMP_DIR, srtAdi);
    fs.writeFileSync(srtYol, srtIcerik, "utf-8");
    
    console.log(`✓ SRT yazıldı: ${(fs.statSync(srtYol).size / 1024).toFixed(1)}KB`);
    
    // 6. Drive'a yükle
    let altyaziKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    let altyaziKlasorId;
    
    if (altyaziKlasorler.length === 0) {
      const drive = google.drive({ version: "v3", auth: oauthAuth });
      const res = await drive.files.create({
        requestBody: {
          name: "06-altyazi",
          mimeType: "application/vnd.google-apps.folder",
          parents: [job.drive_folder_id],
        },
        fields: "id",
      });
      altyaziKlasorId = res.data.id;
    } else {
      altyaziKlasorId = altyaziKlasorler[0].id;
    }
    
    await driveDosyaYukle({ filename: srtAdi, filepath: srtYol }, altyaziKlasorId, "text/plain");
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    
    await jobGuncelle(JOB_ID, { altyazi_status: `completed:${satirGruplari.length}satır` });
    await telegram(job.chat_id, `📝 *Altyazı hazır* (word-level, ${satirGruplari.length} satır, scale=${scale.toFixed(2)})`);
    
    console.log("✅ Altyazı tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { altyazi_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *06-Altyazı hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
