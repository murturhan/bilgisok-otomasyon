/**
 * jess-greeting-uret.js
 * 
 * Jess'in sabit intro/outro greeting'lerini 03-seslendirme-uret.js ile
 * AYNI seste üretir:
 *   - Voice: en-US-Chirp3-HD-Leda
 *   - Pitch: +3 (Chirp3-HD pitch param desteklemiyor → ffmpeg ile shift)
 *   - Sample rate: 24000
 * 
 * Çıktılar: ./jess-audio/
 *   - shorts-intro.mp3
 *   - shorts-outro.mp3
 *   - long-intro.mp3
 *   - long-outro.mp3
 * 
 * Auth: GDRIVE_SERVICE_ACCOUNT_JSON ortam değişkeni (03-seslendirme-uret.js'le aynı)
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const OUT_DIR = "./jess-audio";
const TMP_DIR = "./jess-audio-tmp";

const VOICE_NAME = "en-US-Chirp3-HD-Leda";
const LANGUAGE_CODE = "en-US";
const PITCH_SHIFT_SEMITONES = 3;

const SEGMENTS = [
  {
    filename: "shorts-intro.mp3",
    text: "Hey, curious minds! Jess the Fox here… are you ready?",
  },
  {
    filename: "long-intro.mp3",
    text: "Hey curious minds! I'm Jess the Fox, and welcome to Geni-Mini Tests! Ready for today's fun challenge?",
  },
  {
    filename: "shorts-outro.mp3",
    text: "Great job, friends! Thanks for watching!",
  },
  {
    filename: "long-outro.mp3",
    text: "Great job, curious minds! Thanks for watching — see you in the next Geni-Mini Test!",
  },
];

async function ttsCagri(metin, accessToken) {
  const body = {
    input: { text: metin },
    voice: { languageCode: LANGUAGE_CODE, name: VOICE_NAME },
    audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000 },
  };
  
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`TTS API ${response.status}: ${errText.substring(0, 300)}`);
  }
  
  const data = await response.json();
  if (!data.audioContent) throw new Error("TTS audioContent yok");
  return Buffer.from(data.audioContent, "base64");
}

async function pitchShiftUygula(girdiYol, ciktiYol) {
  const pitchRatio = Math.pow(2, PITCH_SHIFT_SEMITONES / 12);
  
  try {
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "rubberband=pitch=${pitchRatio.toFixed(6)}" -ar 24000 "${ciktiYol}"`;
    await execAsync(cmd);
  } catch (e) {
    console.warn("  (rubberband yok, asetrate fallback)");
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${girdiYol}" -af "asetrate=24000*${pitchRatio.toFixed(6)},atempo=${(1/pitchRatio).toFixed(6)},aresample=24000" "${ciktiYol}"`;
    await execAsync(cmd);
  }
}

async function mp3Suresi(yol) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${yol}"`
  );
  return parseFloat(stdout.trim());
}

async function main() {
  for (const d of [OUT_DIR, TMP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  
  console.log("Jess greeting sesleri üretiliyor...");
  console.log(`Voice: ${VOICE_NAME} (pitch +${PITCH_SHIFT_SEMITONES} via ffmpeg)\n`);
  
  if (!process.env.GDRIVE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GDRIVE_SERVICE_ACCOUNT_JSON ortam değişkeni gerekli");
  }
  
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_JSON),
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const authClient = await auth.getClient();
  const tokenObj = await authClient.getAccessToken();
  const accessToken = tokenObj.token;
  if (!accessToken) throw new Error("TTS access token alınamadı");
  console.log("✓ TTS access token alındı\n");
  
  for (const seg of SEGMENTS) {
    process.stdout.write(`  ${seg.filename} ... `);
    
    // 1. TTS çağrısı (pitch yok)
    const buffer = await ttsCagri(seg.text, accessToken);
    const hamYol = path.join(TMP_DIR, `ham-${seg.filename}`);
    fs.writeFileSync(hamYol, buffer);
    
    // 2. ffmpeg ile pitch shift +3
    const ciktiYol = path.join(OUT_DIR, seg.filename);
    await pitchShiftUygula(hamYol, ciktiYol);
    
    // Cleanup
    try { fs.unlinkSync(hamYol); } catch {}
    
    const sure = await mp3Suresi(ciktiYol);
    const stats = fs.statSync(ciktiYol);
    console.log(`✓ ${sure.toFixed(2)}s, ${(stats.size/1024).toFixed(0)}KB`);
  }
  
  // tmp cleanup
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  
  console.log(`\n✅ Bitti. Dosyalar: ${path.resolve(OUT_DIR)}`);
  console.log("\nSonraki adım:");
  console.log("  Hedra'da Jess PNG + bu mp3'lerden biri → lip-sync video çıkart.");
}

main().catch((err) => {
  console.error("\nHATA:", err.message || err);
  process.exit(1);
});
