/**
 * 03 - Seslendirme (Google Cloud TTS - Chirp 3 HD Algenib)
 * - Senaryoyu cümle parçalarına böl (≤1000 karakter)
 * - Her parçayı TTS'e gönder, MP3 chunklarını birleştir
 * - Drive'a yükle
 */

import fs from "fs";
import { google } from "googleapis";
import { exec } from "child_process";
import { promisify } from "util";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
  getServiceAccountAuth,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);
const { JOB_ID } = process.env;

const VOICE_NAME = "tr-TR-Chirp3-HD-Algenib";
const LANGUAGE_CODE = "tr-TR";
const MAX_CHARS_PER_REQUEST = 900; // Chirp 3 HD limit ~1000, güvenli payı bırakırız

// Senaryoyu cümle sınırlarında parçalara böl (max ~900 karakter)
function senaryoyuParcalaraBol(senaryo, maxChars = MAX_CHARS_PER_REQUEST) {
  const temizlenmis = senaryo.replace(/\s+/g, " ").trim();
  
  // Önce cümlelere böl
  const cumleler = temizlenmis.match(/[^.!?…]+[.!?…]+/g) || [temizlenmis];
  
  const parcalar = [];
  let mevcut = "";
  
  for (const cumle of cumleler) {
    const trimmed = cumle.trim();
    if (mevcut.length + trimmed.length + 1 <= maxChars) {
      mevcut = mevcut ? `${mevcut} ${trimmed}` : trimmed;
    } else {
      if (mevcut) parcalar.push(mevcut);
      
      // Tek cümle bile çok uzunsa: kelimelere böl
      if (trimmed.length > maxChars) {
        const kelimeler = trimmed.split(" ");
        let temp = "";
        for (const kelime of kelimeler) {
          if (temp.length + kelime.length + 1 <= maxChars) {
            temp = temp ? `${temp} ${kelime}` : kelime;
          } else {
            if (temp) parcalar.push(temp);
            temp = kelime;
          }
        }
        if (temp) mevcut = temp;
      } else {
        mevcut = trimmed;
      }
    }
  }
  
  if (mevcut) parcalar.push(mevcut);
  return parcalar;
}

// Google Cloud TTS API çağrısı (REST üzerinden)
async function ttsParcaSesle(metin, accessToken) {
  const body = {
    input: { text: metin },
    voice: {
      languageCode: LANGUAGE_CODE,
      name: VOICE_NAME,
    },
    audioConfig: {
      audioEncoding: "MP3",
      sampleRateHertz: 24000,
    },
  };
  
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`TTS API ${response.status}: ${errText.substring(0, 300)}`);
  }
  
  const data = await response.json();
  if (!data.audioContent) {
    throw new Error("TTS response'da audioContent yok!");
  }
  
  // Base64 → Buffer
  return Buffer.from(data.audioContent, "base64");
}

// MP3 parçalarını FFmpeg ile birleştir
async function mp3leriBirlestir(parcaYollari, ciktiYol) {
  const concatListPath = `/tmp/concat-${Date.now()}.txt`;
  const concatIcerik = parcaYollari.map(p => `file '${p}'`).join("\n");
  fs.writeFileSync(concatListPath, concatIcerik);
  
  const cmd = `ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "${concatListPath}" -c copy "${ciktiYol}"`;
  await execAsync(cmd);
  
  try { fs.unlinkSync(concatListPath); } catch (e) {}
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.senaryo) throw new Error("Senaryo boş!");
    
    await jobGuncelle(JOB_ID, { ses_status: "running" });
    
    console.log(`Senaryo: ${job.senaryo.length} karakter`);
    console.log(`Ses: ${VOICE_NAME}`);
    
    // 1. Senaryoyu parçalara böl
    const parcalar = senaryoyuParcalaraBol(job.senaryo);
    console.log(`${parcalar.length} parçaya bölündü.`);
    
    // 2. Service Account ile access token al (TTS için)
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    
    const authClient = await auth.getClient();
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;
    
    if (!accessToken) throw new Error("Access token alınamadı!");
    console.log("✓ Access token alındı");
    
    // 3. Her parçayı seslendir
    const parcaYollari = [];
    for (let i = 0; i < parcalar.length; i++) {
      console.log(`Parça ${i + 1}/${parcalar.length} (${parcalar[i].length} karakter)...`);
      
      const buffer = await ttsParcaSesle(parcalar[i], accessToken);
      const yol = `/tmp/tts-parca-${String(i + 1).padStart(3, "0")}.mp3`;
      fs.writeFileSync(yol, buffer);
      parcaYollari.push(yol);
      
      console.log(`  ✓ ${(buffer.length / 1024).toFixed(0)}KB`);
    }
    
    // 4. Parçaları birleştir
    console.log("MP3 parçaları birleştiriliyor...");
    const filename = `seslendirme-${Date.now()}.mp3`;
    const filepath = `/tmp/${filename}`;
    await mp3leriBirlestir(parcaYollari, filepath);
    
    // 5. Parça dosyalarını sil
    for (const yol of parcaYollari) {
      try { fs.unlinkSync(yol); } catch (e) {}
    }
    
    const stats = fs.statSync(filepath);
    console.log(`✓ Final MP3: ${(stats.size / 1024).toFixed(0)}KB`);
    
    // 6. Drive'a yükle
    const altKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("02-ses klasörü bulunamadı.");
    
    await driveDosyaYukle({ filename, filepath }, altKlasorler[0].id, "audio/mpeg");
    try { fs.unlinkSync(filepath); } catch (e) {}
    
    await jobGuncelle(JOB_ID, { ses_status: "completed" });
    await telegram(job.chat_id, `🔊 *Seslendirme hazır* (Chirp 3 HD Algenib, ${(stats.size / 1024).toFixed(0)}KB)`);
    
    console.log("✅ Seslendirme tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { ses_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *03-Seslendirme hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
