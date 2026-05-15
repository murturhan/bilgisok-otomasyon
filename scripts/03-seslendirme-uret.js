/**
 * 03 - Seslendirme v3 (Google Cloud TTS Chirp 3 HD Algenib)
 * - Apostrof temizleme
 * - Kısaltma açma (M.S. → milattan sonra, yy. → yüzyıl)
 * - Yabancı isim → Türkçe okunuş (Gemini'den gelen tts_telaffuz alanı varsa kullan)
 * - Her parçanın süresini kaydet (06-altyazı için)
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
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);
const { JOB_ID } = process.env;

const VOICE_NAME = "tr-TR-Chirp3-HD-Algenib";
const LANGUAGE_CODE = "tr-TR";
const MAX_CHARS_PER_REQUEST = 900;

// ─── KISALTMA AÇMA ───────────────────────────────────────────────
function kisaltmalariAc(metin) {
  // Sıralama önemli: önce uzun ve özel olanlar
  const kisaltmalar = [
    // Tarih
    [/\bM\.\s*Ö\./gi, "Milattan Önce"],
    [/\bM\.\s*S\./gi, "Milattan Sonra"],
    [/\bM\.Ö\b/gi, "Milattan Önce"],
    [/\bM\.S\b/gi, "Milattan Sonra"],
    [/\bMÖ\b/g, "Milattan Önce"],
    [/\bMS\b/g, "Milattan Sonra"],
    // Yüzyıl
    [/\b(\d+)\.\s*yy\./gi, "$1. yüzyıl"],
    [/\b(\d+)\.\s*yy\b/gi, "$1. yüzyıl"],
    [/\byy\./gi, "yüzyıl"],
    // Genel
    [/\bvb\./gi, "ve benzeri"],
    [/\bvs\./gi, "ve saire"],
    [/\bör\./gi, "örneğin"],
    [/\bbkz\./gi, "bakınız"],
    [/\bsf\./gi, "sayfa"],
    [/\bmü\./gi, "müdür"],
    [/\bdr\./gi, "doktor"],
    [/\bprof\./gi, "profesör"],
    // Sayı + nokta (1., 2.) kalsın - bunlar sıra
  ];
  
  let sonuc = metin;
  for (const [regex, replacement] of kisaltmalar) {
    sonuc = sonuc.replace(regex, replacement);
  }
  return sonuc;
}

// ─── APOSTROF TEMİZLEME ──────────────────────────────────────────
function apostrofTemizle(metin) {
  return metin
    .replace(/(\p{L}|\d)'(\p{L})/gu, "$1$2")
    .replace(/(\p{L}|\d)'(?=\s|$)/gu, "$1");
}

// ─── TTS İÇİN TOPLU METIN TEMİZLEME ──────────────────────────────
function ttsMetinHazirla(senaryo, tts_telaffuz) {
  let sonuc = senaryo;
  
  // 1. Eğer Gemini'den tts_telaffuz alanı geldiyse onu kullan (telaffuzlu versiyon)
  if (tts_telaffuz && typeof tts_telaffuz === "string" && tts_telaffuz.length > 100) {
    console.log("✓ Gemini'den tts_telaffuz alanı geldi, onu kullanıyoruz");
    sonuc = tts_telaffuz;
  }
  
  // 2. Kısaltmaları aç
  sonuc = kisaltmalariAc(sonuc);
  
  // 3. Apostrof temizle (Türkçe ek apostrofları)
  sonuc = apostrofTemizle(sonuc);
  
  // 4. Boşluk normalize
  sonuc = sonuc.replace(/\s+/g, " ").trim();
  
  return sonuc;
}

// ─── SENARYO PARÇALARA BÖL ───────────────────────────────────────
function senaryoyuParcalaraBol(senaryo, maxChars = MAX_CHARS_PER_REQUEST) {
  const cumleler = senaryo.match(/[^.!?…]+[.!?…]+/g) || [senaryo];
  const parcalar = [];
  let mevcut = "";
  
  for (const cumle of cumleler) {
    const trimmed = cumle.trim();
    if (mevcut.length + trimmed.length + 1 <= maxChars) {
      mevcut = mevcut ? `${mevcut} ${trimmed}` : trimmed;
    } else {
      if (mevcut) parcalar.push(mevcut);
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

async function ttsParcaSesle(metin, accessToken) {
  const body = {
    input: { text: metin },
    voice: { languageCode: LANGUAGE_CODE, name: VOICE_NAME },
    audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000 },
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
  if (!data.audioContent) throw new Error("TTS response'da audioContent yok!");
  return Buffer.from(data.audioContent, "base64");
}

// MP3 süresini ölç
async function mp3Suresi(yol) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${yol}"`
  );
  return parseFloat(stdout.trim());
}

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
    
    // 1. TTS için metin hazırla
    const ttsMetin = ttsMetinHazirla(job.senaryo, job.tts_telaffuz);
    console.log(`Senaryo: ${job.senaryo.length} → ${ttsMetin.length} karakter`);
    console.log(`Ses: ${VOICE_NAME}`);
    
    // Örnek dönüşüm log'u
    const ornek = ttsMetin.substring(0, 200);
    console.log(`İlk 200 karakter: "${ornek}..."`);
    
    // 2. Parçalara böl
    const parcalar = senaryoyuParcalaraBol(ttsMetin);
    console.log(`${parcalar.length} parçaya bölündü.`);
    
    // 3. Service Account access token
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    
    const authClient = await auth.getClient();
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;
    if (!accessToken) throw new Error("Access token alınamadı!");
    console.log("✓ Access token alındı");
    
    // 4. Her parçayı seslendir + süre ölç
    const parcaYollari = [];
    const parcaBilgileri = []; // {sira, metin, sure} - 06 için
    
    for (let i = 0; i < parcalar.length; i++) {
      console.log(`Parça ${i + 1}/${parcalar.length} (${parcalar[i].length} karakter)...`);
      
      const buffer = await ttsParcaSesle(parcalar[i], accessToken);
      const yol = `/tmp/tts-parca-${String(i + 1).padStart(3, "0")}.mp3`;
      fs.writeFileSync(yol, buffer);
      parcaYollari.push(yol);
      
      const sure = await mp3Suresi(yol);
      parcaBilgileri.push({
        sira: i + 1,
        metin: parcalar[i],
        sure: sure,
      });
      
      console.log(`  ✓ ${(buffer.length / 1024).toFixed(0)}KB, ${sure.toFixed(2)}s`);
    }
    
    // 5. Birleştir
    console.log("MP3 parçaları birleştiriliyor...");
    const filename = `seslendirme-${Date.now()}.mp3`;
    const filepath = `/tmp/${filename}`;
    await mp3leriBirlestir(parcaYollari, filepath);
    
    for (const yol of parcaYollari) {
      try { fs.unlinkSync(yol); } catch (e) {}
    }
    
    const stats = fs.statSync(filepath);
    console.log(`✓ Final MP3: ${(stats.size / 1024).toFixed(0)}KB`);
    
    // 6. Parça bilgilerini JSON olarak yan dosya yaz (06 için)
    const parcaJsonAdi = `parca-bilgileri-${Date.now()}.json`;
    const parcaJsonYol = `/tmp/${parcaJsonAdi}`;
    fs.writeFileSync(parcaJsonYol, JSON.stringify({ 
      toplam_sure: parcaBilgileri.reduce((sum, p) => sum + p.sure, 0),
      parcalar: parcaBilgileri 
    }, null, 2));
    
    // 7. Drive'a yükle (MP3 + parça bilgileri)
    const altKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("02-ses klasörü bulunamadı.");
    
    await driveDosyaYukle({ filename, filepath }, altKlasorler[0].id, "audio/mpeg");
    await driveDosyaYukle({ filename: parcaJsonAdi, filepath: parcaJsonYol }, altKlasorler[0].id, "application/json");
    
    try { fs.unlinkSync(filepath); } catch (e) {}
    try { fs.unlinkSync(parcaJsonYol); } catch (e) {}
    
    await jobGuncelle(JOB_ID, { ses_status: "completed" });
    await telegram(job.chat_id, `🔊 *Seslendirme hazır* (${parcalar.length} parça, ${(stats.size / 1024).toFixed(0)}KB)`);
    
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
