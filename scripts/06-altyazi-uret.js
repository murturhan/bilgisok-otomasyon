/**
 * 06 - Altyazı Üretimi (SRT) v2
 * - Senaryoyu cümlelere böl, karakter sayısına oranlı süre ata
 * - Edge TTS'le bir kez seslendir, gerçek ses süresini ölç (ffprobe yerine MP3 header)
 * - Süreleri gerçek ses süresine göre ölçeklendir
 * - Standart SRT formatı dosya üret + Drive'a yükle
 */

import fs from "fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { exec } from "child_process";
import { promisify } from "util";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveKlasorAc,
  driveDosyaYukle,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);
const { JOB_ID } = process.env;

// SRT zaman formatı: HH:MM:SS,mmm
function msToSrtTime(ms) {
  ms = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

// Senaryoyu altyazı satırlarına böl (her satır 5-9 kelime, noktalama ile)
function senaryoyuAltyaziSatirlarinaBol(senaryo, hedefKelime = 7) {
  const text = senaryo.replace(/\s+/g, " ").trim();
  // Noktalama ile cümlelere böl
  const cumleler = text.match(/[^.!?…]+[.!?…]+/g) || [text];
  
  const altyazilar = [];
  
  for (const cumle of cumleler) {
    const kelimeler = cumle.trim().split(/\s+/);
    
    // Eğer cümle kısaysa tek satır
    if (kelimeler.length <= hedefKelime + 2) {
      altyazilar.push(kelimeler.join(" "));
      continue;
    }
    
    // Cümleyi 5-9 kelimelik parçalara böl
    for (let i = 0; i < kelimeler.length; i += hedefKelime) {
      const parca = kelimeler.slice(i, i + hedefKelime).join(" ");
      altyazilar.push(parca);
    }
  }
  
  return altyazilar.filter(a => a.length > 0);
}

// Edge TTS ile MP3 üret + dosyaya yaz (zamanı ölçmek için)
async function ttsMp3Uret(metin, filepath) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    "tr-TR-AhmetNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
  );
  
  const result = await tts.toStream(metin);
  const audioStream = result.audioStream;
  
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filepath);
    
    audioStream.on("data", (chunk) => writeStream.write(chunk));
    audioStream.on("end", () => {
      writeStream.end();
      writeStream.on("finish", () => resolve(filepath));
    });
    audioStream.on("error", reject);
    
    setTimeout(() => reject(new Error("Edge TTS timeout (120s)")), 120000);
  });
}

// MP3 süresini al (ffprobe ile)
async function mp3SuresiAl(filepath) {
  try {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`;
    const { stdout } = await execAsync(cmd);
    return parseFloat(stdout.trim()) * 1000; // ms
  } catch (e) {
    // ffprobe yoksa MP3 dosya boyutundan tahmin
    const stats = fs.statSync(filepath);
    // 24kHz 96kbps mono = ~12 KB/sec
    const tahminSure = (stats.size / 12000) * 1000;
    console.log(`  ⚠ ffprobe yok, dosya boyutundan tahmin: ${tahminSure.toFixed(0)}ms`);
    return tahminSure;
  }
}

// SRT formatla
function srtFormatla(altyazilar) {
  return altyazilar.map((a, i) => {
    return `${i + 1}\n${msToSrtTime(a.startMs)} --> ${msToSrtTime(a.endMs)}\n${a.text}\n`;
  }).join("\n");
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.senaryo) throw new Error("Senaryo boş!");
    
    await jobGuncelle(JOB_ID, { altyazi_status: "running" });
    
    // 1. Senaryoyu altyazı satırlarına böl
    const satirMetinleri = senaryoyuAltyaziSatirlarinaBol(job.senaryo, 7);
    console.log(`${satirMetinleri.length} altyazı satırı oluşturuldu`);
    
    // 2. Edge TTS ile MP3 üret (gerçek süreyi ölçmek için)
    console.log("Edge TTS MP3 üretiyor (süre ölçümü için)...");
    const tempMp3 = `/tmp/altyazi-temp-${Date.now()}.mp3`;
    await ttsMp3Uret(job.senaryo, tempMp3);
    
    // 3. Süreyi ölç
    const toplamSureMs = await mp3SuresiAl(tempMp3);
    console.log(`Toplam ses süresi: ${(toplamSureMs / 1000).toFixed(1)}s`);
    
    // 4. Her satırın süresini karakter sayısına oranlı dağıt
    const toplamKarakter = satirMetinleri.reduce((sum, s) => sum + s.length, 0);
    
    const altyazilar = [];
    let mevcutMs = 0;
    
    for (const satir of satirMetinleri) {
      const sureBuSatir = (satir.length / toplamKarakter) * toplamSureMs;
      const startMs = mevcutMs;
      const endMs = mevcutMs + sureBuSatir;
      
      altyazilar.push({ startMs, endMs, text: satir });
      mevcutMs = endMs;
    }
    
    // 5. SRT formatla
    const srtIcerik = srtFormatla(altyazilar);
    
    // 6. SRT dosyasını oluştur
    const filename = `altyazi-${Date.now()}.srt`;
    const filepath = `/tmp/${filename}`;
    fs.writeFileSync(filepath, srtIcerik, "utf-8");
    console.log(`✓ SRT oluşturuldu (${(fs.statSync(filepath).size / 1024).toFixed(1)}KB)`);
    
    // 7. Temp MP3'ü sil
    try { fs.unlinkSync(tempMp3); } catch (e) {}
    
    // 8. Drive'a yükle - "06-altyazi" klasörü (yoksa aç)
    let altKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    let altyaziKlasorId;
    if (altKlasorler.length === 0) {
      console.log("06-altyazi klasörü oluşturuluyor...");
      const yeni = await driveKlasorAc("06-altyazi", job.drive_folder_id);
      altyaziKlasorId = yeni.id;
    } else {
      altyaziKlasorId = altKlasorler[0].id;
    }
    
    await driveDosyaYukle({ filename, filepath }, altyaziKlasorId, "application/x-subrip");
    try { fs.unlinkSync(filepath); } catch (e) {}
    
    await jobGuncelle(JOB_ID, { altyazi_status: `completed:${altyazilar.length}` });
    await telegram(job.chat_id, `📝 *Altyazı hazır:* ${altyazilar.length} satır`);
    
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
