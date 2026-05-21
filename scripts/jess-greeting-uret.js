/**
 * jess-greeting-uret.js
 * 
 * Jess'in sabit intro/outro greeting'lerini 03-seslendirme-uret.js ile
 * AYNI seste üretir:
 *   - Voice: en-US-Chirp3-HD-Leda
 *   - Pitch: +3
 *   - Speaking rate: 1.0
 * 
 * Çıktılar: ./jess-audio/
 *   - shorts-intro.mp3
 *   - shorts-outro.mp3
 *   - long-intro.mp3
 *   - long-outro.mp3
 * 
 * Bu mp3'leri Hedra'ya audio olarak upload et + Jess PNG ile lip-sync video al.
 * 
 * Auth: GDRIVE_SERVICE_ACCOUNT_JSON ortam değişkeni (03-seslendirme-uret.js'le aynı)
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";

const OUT_DIR = "./jess-audio";

const VOICE_NAME = "en-US-Chirp3-HD-Leda";
const PITCH_SHIFT = 3.0;
const SPEAKING_RATE = 1.0;

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
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text: metin },
      voice: {
        languageCode: "en-US",
        name: VOICE_NAME,
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: SPEAKING_RATE,
        pitch: PITCH_SHIFT,
      },
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`TTS API ${response.status}: ${errText.substring(0, 300)}`);
  }
  
  const data = await response.json();
  if (!data.audioContent) throw new Error("TTS audioContent yok");
  return Buffer.from(data.audioContent, "base64");
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  
  console.log("Jess greeting sesleri üretiliyor...");
  console.log(`Voice: ${VOICE_NAME} (pitch +${PITCH_SHIFT})\n`);
  
  if (!process.env.GDRIVE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GDRIVE_SERVICE_ACCOUNT_JSON ortam değişkeni gerekli (03-seslendirme-uret.js ile aynı)");
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
    const buffer = await ttsCagri(seg.text, accessToken);
    const outFile = path.join(OUT_DIR, seg.filename);
    fs.writeFileSync(outFile, buffer);
    const sizeKB = (buffer.length / 1024).toFixed(1);
    console.log(`✓ ${sizeKB} KB`);
  }
  
  console.log(`\n✅ Bitti. Dosyalar: ${path.resolve(OUT_DIR)}`);
  console.log("\nSonraki adım:");
  console.log("  Hedra'da Jess PNG + bu mp3'lerden biri → lip-sync video çıkart.");
}

main().catch((err) => {
  console.error("\nHATA:", err.message || err);
  process.exit(1);
});
