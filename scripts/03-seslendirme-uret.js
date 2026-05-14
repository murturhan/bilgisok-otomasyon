/**
 * 03 - Seslendirme (Edge TTS, Ahmet)
 * - job_state'ten senaryo oku
 * - Edge TTS ile MP3 üret
 * - Drive'a yükle
 */

import fs from "fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID } = process.env;

async function seslendirmeUret(senaryo) {
  console.log(`Edge TTS, ${senaryo.length} karakter`);
  
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    "tr-TR-AhmetNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
  );
  
  const filename = `seslendirme-${Date.now()}.mp3`;
  const filepath = `/tmp/${filename}`;
  
  const { audioStream } = await tts.toStream(senaryo);
  const writeStream = fs.createWriteStream(filepath);
  
  return new Promise((resolve, reject) => {
    audioStream.on("data", (chunk) => writeStream.write(chunk));
    audioStream.on("end", () => {
      writeStream.end();
      writeStream.on("finish", () => {
        const stats = fs.statSync(filepath);
        resolve({ filename, filepath, size: stats.size });
      });
    });
    audioStream.on("error", reject);
    
    setTimeout(() => reject(new Error("Edge TTS timeout (120s)")), 120000);
  });
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.senaryo) throw new Error("Senaryo boş!");
    
    await jobGuncelle(JOB_ID, { ses_status: "running" });
    
    const ses = await seslendirmeUret(job.senaryo);
    console.log(`✓ Seslendirme OK (${(ses.size / 1024).toFixed(0)}KB)`);
    
    const altKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("02-ses klasörü bulunamadı.");
    
    await driveDosyaYukle(ses, altKlasorler[0].id, "audio/mpeg");
    try { fs.unlinkSync(ses.filepath); } catch (e) {}
    
    await jobGuncelle(JOB_ID, { ses_status: "completed" });
    await telegram(job.chat_id, `🔊 *Seslendirme hazır* (${(ses.size / 1024).toFixed(0)}KB)`);
    
    console.log("✅ Seslendirme tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { ses_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *03-Seslendirme hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
