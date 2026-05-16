/**
 * 03 - Seslendirme v4 (Google Cloud TTS Chirp3 HD Kore - İngilizce)
 * - Dil: en-US
 * - Ses: en-US-Chirp3-HD-Kore (neşeli kadın ses)
 * - Pitch shift: +2 semitone (FFmpeg rubberband) → Jess the Fox çocuksu ses
 * - Kısaltma açma (Mr. → Mister, Dr. → Doctor, vs.)
 * - Sayı/yıl okuma desteği (Gemini tts_telaffuz alanı varsa onu kullan)
 * - Her parçanın süresini kaydet (altyazı veya video montaj için)
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

const VOICE_NAME = "en-US-Chirp3-HD-Kore";
const LANGUAGE_CODE = "en-US";
const MAX_CHARS_PER_REQUEST = 900;
const PITCH_SHIFT_SEMITONES = 2; // +2 semitone = çocuksu ton

// ─── İNGİLİZCE KISALTMA AÇMA ─────────────────────────────────────
function kisaltmalariAc(metin) {
  const kisaltmalar = [
    // Titles
    [/\bMr\./g, "Mister"],
    [/\bMrs\./g, "Misses"],
    [/\bMs\./g, "Miss"],
    [/\bDr\./g, "Doctor"],
    [/\bProf\./g, "Professor"],
    [/\bSt\./g, "Saint"],
    // Common abbreviations
    [/\be\.g\./gi, "for example"],
    [/\bi\.e\./gi, "that is"],
    [/\betc\./gi, "etcetera"],
    [/\bvs\./gi, "versus"],
    [/\bapprox\./gi, "approximately"],
    [/\bno\./gi, "number"],
    // Units (sayıdan sonra geliyorsa)
    [/(\d+)\s*km\b/gi, "$1 kilometers"],
    [/(\d+)\s*cm\b/gi, "$1 centimeters"],
    [/(\d+)\s*mm\b/gi, "$1 millimeters"],
    [/(\d+)\s*kg\b/gi, "$1 kilograms"],
    [/(\d+)\s*lbs\b/gi, "$1 pounds"],
    [/(\d+)\s*ft\b/gi, "$1 feet"],
    // Time eras
    [/\bB\.C\./g, "B C"],
    [/\bA\.D\./g, "A D"],
    [/\bBCE\b/g, "B C E"],
    [/\bCE\b/g, "C E"],
  ];
  
  let sonuc = metin;
  for (const [regex, replacement] of kisaltmalar) {
    sonuc = sonuc.replace(regex, replacement);
  }
  return sonuc;
}

// ─── EMOJİ TEMİZLE (TTS okumasın) ────────────────────────────────
function emojiTemizle(metin) {
  return metin
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{1F000}-\u{1F02F}]/gu, "")
    .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, "")
    .replace(/[\u{1F100}-\u{1F1FF}]/gu, "");
}

// ─── TTS İÇİN TOPLU METIN TEMİZLEME ──────────────────────────────
function ttsMetinHazirla(senaryo, tts_telaffuz) {
  let sonuc = senaryo;
  
  // 1. Eğer Gemini'den tts_telaffuz alanı geldiyse onu kullan
  if (tts_telaffuz && typeof tts_telaffuz === "string" && tts_telaffuz.length > 50) {
    console.log("✓ Gemini'den tts_telaffuz alanı geldi, onu kullanıyoruz");
    sonuc = tts_telaffuz;
  }
  
  // 2. Kısaltmaları aç
  sonuc = kisaltmalariAc(sonuc);
  
  // 3. Emojileri temizle
  sonuc = emojiTemizle(sonuc);
  
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

// ─── PITCH SHIFT (FFmpeg rubberband, ses süresi sabit kalır) ────
async function pitchShiftUygula(girdiYol, ciktiYol, semitone = PITCH_SHIFT_SEMITONES) {
  // rubberband filter: pitch shift süreyi değiştirmez (asetrate'den farklı olarak)
  // semitone → pitch ratio: 2^(semitone/12)
  const pitchRatio = Math.pow(2, semitone / 12);
  
  // rubberband mevcut değilse asetrate+atempo fallback'ı
  const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "rubberband=pitch=${pitchRatio.toFixed(6)}" -ar 24000 "${ciktiYol}"`;
  
  try {
    await execAsync(cmd);
  } catch (e) {
    // rubberband yoksa asetrate fallback (kalite biraz düşer ama çalışır)
    console.warn("⚠ rubberband filter yok, asetrate fallback kullanılıyor");
    const sampleRateMultiplier = pitchRatio;
    const tempoCompensation = 1 / pitchRatio;
    const fallbackCmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "asetrate=24000*${sampleRateMultiplier.toFixed(6)},atempo=${tempoCompensation.toFixed(6)},aresample=24000" "${ciktiYol}"`;
    await execAsync(fallbackCmd);
  }
}

// MP3 süresini ölç
async function mp3Suresi(yol) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${yol}"`
  );
  return parseFloat(stdout.trim());
}

// Pitch-shifted parçaları birleştir (re-encode, çünkü asetrate fallback uyuşmazlık yaratabilir)
async function mp3leriBirlestir(parcaYollari, ciktiYol) {
  const concatListPath = `/tmp/concat-${Date.now()}.txt`;
  const concatIcerik = parcaYollari.map(p => `file '${p}'`).join("\n");
  fs.writeFileSync(concatListPath, concatIcerik);
  
  // re-encode (copy değil) - pitch shift sonrası uyumluluk için
  const cmd = `ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "${concatListPath}" -c:a libmp3lame -b:a 128k -ar 24000 "${ciktiYol}"`;
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
    console.log(`Ses: ${VOICE_NAME} (pitch shift +${PITCH_SHIFT_SEMITONES} semitone)`);
    
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
    
    // 4. Her parçayı seslendir → pitch shift uygula → süre ölç
    const pitchShiftedYollar = [];
    const parcaBilgileri = [];
    
    for (let i = 0; i < parcalar.length; i++) {
      console.log(`Parça ${i + 1}/${parcalar.length} (${parcalar[i].length} karakter)...`);
      
      // TTS sentez
      const buffer = await ttsParcaSesle(parcalar[i], accessToken);
      const ham_yol = `/tmp/tts-ham-${String(i + 1).padStart(3, "0")}.mp3`;
      fs.writeFileSync(ham_yol, buffer);
      
      // Pitch shift
      const shifted_yol = `/tmp/tts-shifted-${String(i + 1).padStart(3, "0")}.mp3`;
      await pitchShiftUygula(ham_yol, shifted_yol, PITCH_SHIFT_SEMITONES);
      pitchShiftedYollar.push(shifted_yol);
      
      // Süre ölç (pitch shift sonrası - kullanılacak final süre)
      const sure = await mp3Suresi(shifted_yol);
      parcaBilgileri.push({
        sira: i + 1,
        metin: parcalar[i],
        sure: sure,
      });
      
      // Ham dosyayı temizle
      try { fs.unlinkSync(ham_yol); } catch (e) {}
      
      const stats = fs.statSync(shifted_yol);
      console.log(`  ✓ ${(stats.size / 1024).toFixed(0)}KB, ${sure.toFixed(2)}s (pitch+${PITCH_SHIFT_SEMITONES})`);
    }
    
    // 5. Birleştir
    console.log("MP3 parçaları birleştiriliyor...");
    const filename = `seslendirme-${Date.now()}.mp3`;
    const filepath = `/tmp/${filename}`;
    await mp3leriBirlestir(pitchShiftedYollar, filepath);
    
    for (const yol of pitchShiftedYollar) {
      try { fs.unlinkSync(yol); } catch (e) {}
    }
    
    const stats = fs.statSync(filepath);
    const toplamSure = parcaBilgileri.reduce((sum, p) => sum + p.sure, 0);
    console.log(`✓ Final MP3: ${(stats.size / 1024).toFixed(0)}KB, ${toplamSure.toFixed(2)}s`);
    
    // 6. Parça bilgilerini JSON olarak yan dosya yaz
    const parcaJsonAdi = `parca-bilgileri-${Date.now()}.json`;
    const parcaJsonYol = `/tmp/${parcaJsonAdi}`;
    fs.writeFileSync(parcaJsonYol, JSON.stringify({ 
      toplam_sure: toplamSure,
      voice: VOICE_NAME,
      pitch_shift_semitones: PITCH_SHIFT_SEMITONES,
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
    await telegram(job.chat_id, `🦊 *Jess konuşuyor!* (${parcalar.length} parça, ${toplamSure.toFixed(1)}s, pitch+${PITCH_SHIFT_SEMITONES})`);
    
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
