/**
 * 06 - Altyazı Üretimi (SRT)
 * - Senaryoyu Edge TTS ile yeniden seslendir, boundary event'lerinden zaman damgaları topla
 * - Standard SRT formatı dosya üret
 * - Drive'a yükle
 */

import fs from "fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveKlasorAc,
  driveDosyaYukle,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID } = process.env;

// SRT zaman formatı: HH:MM:SS,mmm
function msToSrtTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

// Edge TTS'i çağırıp word-level boundary event'leri topla
async function ttsWordBoundaries(senaryo) {
  console.log(`Edge TTS ile word boundaries toplanıyor (${senaryo.length} karakter)...`);
  
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    "tr-TR-AhmetNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
  );
  
  // msedge-tts boundary event ile metadata akışını destekler
  const { audioStream, metadataStream } = await tts.toStream(senaryo);
  
  const wordBoundaries = [];
  let audioChunks = [];
  
  // Audio stream'i tüket (bitirmek için gerekli, ama kaydetmiyoruz - 03 zaten kaydetti)
  audioStream.on("data", (chunk) => audioChunks.push(chunk));
  
  // Metadata stream'i dinle (her kelime için event)
  metadataStream.on("data", (data) => {
    try {
      const meta = typeof data === "string" ? JSON.parse(data) : data;
      // Edge TTS metadata format: { Metadata: [{ Type, Data: { Offset, Duration, text: {...} } }] }
      const items = meta?.Metadata || [];
      for (const item of items) {
        if (item.Type === "WordBoundary") {
          const offset100ns = item.Data?.Offset || 0;
          const duration100ns = item.Data?.Duration || 0;
          const text = item.Data?.text?.Text || "";
          
          // Edge TTS offset 100-nanosecond units (1 ms = 10000 units)
          wordBoundaries.push({
            startMs: offset100ns / 10000,
            durationMs: duration100ns / 10000,
            text: text,
          });
        }
      }
    } catch (e) {
      // Metadata parse hatası - sessizce atla
    }
  });
  
  return new Promise((resolve, reject) => {
    audioStream.on("end", () => {
      console.log(`✓ ${wordBoundaries.length} kelime boundary toplandı`);
      resolve(wordBoundaries);
    });
    audioStream.on("error", reject);
    
    setTimeout(() => reject(new Error("Edge TTS boundary timeout (120s)")), 120000);
  });
}

// Kelime boundary'lerini cümle/satır gruplarına böl (her altyazı 5-9 kelime)
function bountaryleriCumleleryeBol(boundaries, hedefKelimePerSatir = 7) {
  const altyazilar = [];
  let mevcutSatir = [];
  
  // Noktalama işaretleriyle biten kelimeleri yakala
  const cumleBitimi = /[.!?…]$/;
  
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    mevcutSatir.push(b);
    
    const bittiPunktuation = cumleBitimi.test(b.text.trim());
    const dolu = mevcutSatir.length >= hedefKelimePerSatir;
    const son = i === boundaries.length - 1;
    
    if (bittiPunktuation || dolu || son) {
      // Mevcut satırı altyazıya ekle
      if (mevcutSatir.length > 0) {
        const startMs = mevcutSatir[0].startMs;
        const lastWord = mevcutSatir[mevcutSatir.length - 1];
        const endMs = lastWord.startMs + lastWord.durationMs;
        const text = mevcutSatir.map(w => w.text).join(" ");
        
        altyazilar.push({ startMs, endMs, text });
        mevcutSatir = [];
      }
    }
  }
  
  return altyazilar;
}

// SRT formatına çevir
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
    
    // 1. TTS word boundaries
    const boundaries = await ttsWordBoundaries(job.senaryo);
    
    if (boundaries.length === 0) {
      throw new Error("Hiç word boundary alınamadı!");
    }
    
    // 2. Cümlelere böl
    const altyazilar = bountaryleriCumleleryeBol(boundaries, 7);
    console.log(`${altyazilar.length} altyazı satırı oluşturuldu.`);
    
    // 3. SRT formatla
    const srtIcerik = srtFormatla(altyazilar);
    
    // 4. Dosyaya yaz
    const filename = `altyazi-${Date.now()}.srt`;
    const filepath = `/tmp/${filename}`;
    fs.writeFileSync(filepath, srtIcerik, "utf-8");
    console.log(`✓ SRT oluşturuldu: ${filepath}`);
    
    // 5. Drive'a yükle - "06-altyazi" klasörü (yoksa aç)
    let altKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    let altyaziKlasorId;
    if (altKlasorler.length === 0) {
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
