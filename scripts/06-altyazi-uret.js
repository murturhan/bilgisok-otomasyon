/**
 * 06 - Altyazı Üretimi v2
 * - Gerçek MP3'ün süresini FFprobe ile ölçer (Edge TTS yerine)
 * - Kelime sayısına göre ağırlıklı SRT dağıtımı
 * - Daha doğru senkronizasyon
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
  driveDosyaYukle,
  getOAuthClient,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);

const { JOB_ID } = process.env;
const TMP_DIR = "/tmp/altyazi";

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

// Senaryoyu okunabilir SRT satırlarına böl (~7-10 kelime/satır, max 2 satır görünür)
function senaryoyuSrtSatirlarinaBol(senaryo) {
  const temizlenmis = senaryo.replace(/\s+/g, " ").trim();
  
  // Önce cümlelere böl
  const cumleler = temizlenmis.match(/[^.!?…]+[.!?…]+/g) || [temizlenmis];
  
  const satirlar = [];
  
  for (const cumle of cumleler) {
    const trimmed = cumle.trim();
    if (!trimmed) continue;
    
    const kelimeler = trimmed.split(/\s+/);
    
    // Cümle 12 kelimeden kısaysa tek satır
    if (kelimeler.length <= 12) {
      satirlar.push(trimmed);
      continue;
    }
    
    // Uzun cümle: virgüllere göre böl
    const altParcalar = trimmed.split(/,\s+/);
    if (altParcalar.length > 1) {
      let mevcut = "";
      for (const parca of altParcalar) {
        const kelimeSayisi = (mevcut + " " + parca).trim().split(/\s+/).length;
        if (kelimeSayisi <= 14) {
          mevcut = mevcut ? mevcut + ", " + parca : parca;
        } else {
          if (mevcut) satirlar.push(mevcut);
          mevcut = parca;
        }
      }
      if (mevcut) satirlar.push(mevcut);
    } else {
      // Virgül yoksa kelime grubuna böl (7-10 kelimelik)
      for (let i = 0; i < kelimeler.length; i += 9) {
        satirlar.push(kelimeler.slice(i, i + 9).join(" "));
      }
    }
  }
  
  return satirlar;
}

function saniyeyiSrtZamaninaCevir(saniye) {
  const h = Math.floor(saniye / 3600);
  const m = Math.floor((saniye % 3600) / 60);
  const s = Math.floor(saniye % 60);
  const ms = Math.floor((saniye % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// Kelime sayısı ağırlıklı zamanlama
function srtUret(satirlar, toplamSure) {
  // Her satırın kelime sayısı (ağırlığı)
  const kelimeSayilari = satirlar.map(s => s.split(/\s+/).length);
  const toplamKelime = kelimeSayilari.reduce((a, b) => a + b, 0);
  
  // Saniye/kelime
  const sanePerKelime = toplamSure / toplamKelime;
  
  let mevcutZaman = 0;
  const srtBlocks = [];
  
  for (let i = 0; i < satirlar.length; i++) {
    const sure = kelimeSayilari[i] * sanePerKelime;
    const baslangic = mevcutZaman;
    const bitis = mevcutZaman + sure;
    
    srtBlocks.push(`${i + 1}\n${saniyeyiSrtZamaninaCevir(baslangic)} --> ${saniyeyiSrtZamaninaCevir(bitis)}\n${satirlar[i]}\n`);
    
    mevcutZaman = bitis;
  }
  
  return srtBlocks.join("\n");
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.senaryo) throw new Error("Senaryo boş!");
    
    await jobGuncelle(JOB_ID, { altyazi_status: "running" });
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    // 1. MP3'ü Drive'dan indir
    console.log("📂 Ses dosyası indiriliyor...");
    const oauthAuth = getOAuthClient();
    
    const sesKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasorler.length === 0) throw new Error("02-ses klasörü yok");
    
    const sesler = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    if (sesler.length === 0) throw new Error("Ses dosyası yok!");
    
    // En son yüklenen sesi al (alfabetik son)
    const sesDosya = sesler[sesler.length - 1];
    const sesYol = path.join(TMP_DIR, "ses.mp3");
    await driveIndir(sesDosya.id, sesYol, oauthAuth);
    console.log(`  ✓ ${sesDosya.name}`);
    
    // 2. Gerçek süreyi ölç
    const { stdout: durationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sesYol}"`
    );
    const toplamSure = parseFloat(durationStr.trim());
    console.log(`📏 Ses süresi: ${toplamSure.toFixed(2)}s`);
    
    // 3. Senaryoyu SRT satırlarına böl
    const satirlar = senaryoyuSrtSatirlarinaBol(job.senaryo);
    console.log(`📝 ${satirlar.length} altyazı satırı`);
    
    // 4. Kelime ağırlıklı SRT üret
    const srtIcerik = srtUret(satirlar, toplamSure);
    
    const srtAdi = `altyazi-${Date.now()}.srt`;
    const srtYol = path.join(TMP_DIR, srtAdi);
    fs.writeFileSync(srtYol, srtIcerik, "utf-8");
    
    console.log(`✓ SRT yazıldı: ${(fs.statSync(srtYol).size / 1024).toFixed(1)}KB`);
    
    // 5. Drive'a yükle (06-altyazi klasörü)
    let altyaziKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    let altyaziKlasorId;
    
    if (altyaziKlasorler.length === 0) {
      // Yoksa oluştur
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
    
    await jobGuncelle(JOB_ID, { altyazi_status: `completed:${satirlar.length}satır` });
    await telegram(job.chat_id, `📝 *Altyazı hazır* (${satirlar.length} satır, ${toplamSure.toFixed(1)}s)`);
    
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
