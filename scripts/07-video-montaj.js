/**
 * 07 - Video Montaj v5 (FFmpeg) - HIZLANDIRILDI
 * - ultrafast preset (medium yerine, 3x hızlı)
 * - Ken Burns klipleri PARALEL üretilir (sıralı değil)
 * - Final montajda single-pass encoding
 * - Abone butonu son 10sn
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { google } from "googleapis";
import axios from "axios";
import sharp from "sharp";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveKlasorAc,
  driveDosyaYukle,
  getOAuthClient,
  getServiceAccountAuth,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);

const { JOB_ID, GDRIVE_MUZIK_FOLDER_ID } = process.env;

const TMP_DIR = "/tmp/video-montaj";
const ABONE_BUTTON_URL = "https://raw.githubusercontent.com/murturhan/bilgisok-otomasyon/main/abone-ol-button.png";

// Aynı anda kaç Ken Burns paralel çalışsın? CPU çekirdek sayısına göre.
const PARALEL_KEN_BURNS = 4;

async function driveKlasorIcerigi(klasorId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${klasorId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, size)",
    pageSize: 100,
    orderBy: "name",
  });
  return res.data.files || [];
}

async function driveAltKlasorAraSA(adKismi, parentId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const q = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and name contains '${adKismi.replace(/'/g, "\\'")}' and trashed=false`;
  const res = await drive.files.list({
    q: q,
    fields: "files(id, name)",
    pageSize: 10,
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

async function ffmpegCalistir(args, etiket = "ffmpeg") {
  const cmd = `ffmpeg -y -hide_banner -loglevel error ${args}`;
  const baslangic = Date.now();
  
  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    const sure = ((Date.now() - baslangic) / 1000).toFixed(1);
    console.log(`[${etiket}] ✓ ${sure}s`);
    if (stderr && stderr.length > 0 && !stderr.includes("deprecated")) {
      console.log(`  stderr: ${stderr.substring(0, 300)}`);
    }
    return { stdout, stderr };
  } catch (e) {
    console.error(`[${etiket}] HATA: ${e.message.substring(0, 500)}`);
    throw e;
  }
}

// Ken Burns klibi (ultrafast preset)
async function kenBurnsKlipUret(gorselPath, ciktiPath, sure, varyasyon) {
  const fps = 25;
  const frameSayisi = Math.ceil(sure * fps);
  
  let zoomFiltre;
  switch (varyasyon % 4) {
    case 0:
      zoomFiltre = `zoompan=z='min(zoom+0.0008,1.3)':d=${frameSayisi}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`;
      break;
    case 1:
      zoomFiltre = `zoompan=z='min(zoom+0.0008,1.3)':d=${frameSayisi}:x='iw/4':y='ih/4':s=1280x720:fps=${fps}`;
      break;
    case 2:
      zoomFiltre = `zoompan=z='if(eq(on,0),1.3,zoom-0.0008)':d=${frameSayisi}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`;
      break;
    case 3:
      zoomFiltre = `zoompan=z='min(zoom+0.0008,1.3)':d=${frameSayisi}:x='iw*3/4-iw/zoom':y='ih*3/4-ih/zoom':s=1280x720:fps=${fps}`;
      break;
  }
  
  const args = `-loop 1 -i "${gorselPath}" \
    -vf "${zoomFiltre},format=yuv420p" \
    -t ${sure} \
    -c:v libx264 -preset ultrafast -crf 28 \
    -threads 2 \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, `kb${varyasyon}`);
}

// Paralel Ken Burns: batch'ler halinde aynı anda 4 tane çalıştır
async function paralelKenBurns(gorselYollar, klipYollar, sure) {
  console.log(`🎞️ ${gorselYollar.length} klip paralel üretiliyor (${PARALEL_KEN_BURNS}'erli batch)...`);
  
  for (let i = 0; i < gorselYollar.length; i += PARALEL_KEN_BURNS) {
    const batch = [];
    for (let j = 0; j < PARALEL_KEN_BURNS && (i + j) < gorselYollar.length; j++) {
      const idx = i + j;
      batch.push(kenBurnsKlipUret(gorselYollar[idx], klipYollar[idx], sure, idx));
    }
    console.log(`  Batch ${Math.floor(i / PARALEL_KEN_BURNS) + 1}: ${batch.length} klip paralel...`);
    await Promise.all(batch);
  }
  
  console.log(`  ✓ ${gorselYollar.length} klip hazır`);
}

async function videolariBirlestir(klipListesi, ciktiPath) {
  const concatListPath = path.join(TMP_DIR, "concat.txt");
  const concatIcerik = klipListesi.map(p => `file '${p}'`).join("\n");
  fs.writeFileSync(concatListPath, concatIcerik);
  
  // -c copy ile concat (encode yok, hızlı)
  const args = `-f concat -safe 0 -i "${concatListPath}" -c copy "${ciktiPath}"`;
  await ffmpegCalistir(args, "concat");
}

async function aboneButtonHazirla(ciktiPath) {
  console.log("🔘 Abone butonu hazırlanıyor...");
  
  const indirilenYol = path.join(TMP_DIR, "abone-raw.png");
  
  try {
    const response = await axios.get(ABONE_BUTTON_URL, { responseType: "arraybuffer", timeout: 10000 });
    fs.writeFileSync(indirilenYol, response.data);
  } catch (e) {
    console.log(`⚠ Abone butonu indirilemedi: ${e.message}`);
    return false;
  }
  
  try {
    const buf = await sharp(indirilenYol)
      .resize(320, 160, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const { data, info } = buf;
    const threshold = 240;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
        data[i + 3] = 0;
      }
    }
    
    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 }
    }).png().toFile(ciktiPath);
    
    console.log("  ✓ Abone butonu hazır");
    return true;
  } catch (e) {
    console.log(`⚠ Sharp başarısız: ${e.message}`);
    fs.copyFileSync(indirilenYol, ciktiPath);
    return true;
  }
}

// Final montaj: ultrafast preset, threads max
async function finalMontaj({ videoPath, sesPath, muzikPath, altyaziPath, abonePath, toplamSure, ciktiPath }) {
  const hasMusic = muzikPath && fs.existsSync(muzikPath);
  const hasSubtitle = altyaziPath && fs.existsSync(altyaziPath);
  const hasAbone = abonePath && fs.existsSync(abonePath);
  
  const aboneBaslangic = Math.max(0, toplamSure - 10);
  
  let filterParts = [];
  let audioMap;
  
  if (hasMusic) {
    filterParts.push(`[1:a]volume=1.0[tts]`);
    filterParts.push(`[2:a]volume=0.12,aloop=loop=-1:size=2e+09[music]`);
    filterParts.push(`[tts][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    audioMap = `-map "[aout]"`;
  } else {
    filterParts.push(`[1:a]volume=1.0[aout]`);
    audioMap = `-map "[aout]"`;
  }
  
  let videoSource = "[0:v]";
  
  if (hasSubtitle) {
    const srtEscaped = altyaziPath.replace(/:/g, "\\:").replace(/'/g, "\\'");
    filterParts.push(`${videoSource}subtitles='${srtEscaped}':force_style='FontName=Arial,FontSize=22,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=3,Shadow=1,Alignment=2,MarginV=50'[vsub]`);
    videoSource = "[vsub]";
  }
  
  if (hasAbone) {
    const aboneInputIdx = hasMusic ? 3 : 2;
    filterParts.push(`${videoSource}[${aboneInputIdx}:v]overlay=x='main_w-overlay_w-30':y='main_h-overlay_h-30':enable='gte(t,${aboneBaslangic})*lt(mod(t-${aboneBaslangic},1.0),0.5)'[vout]`);
    videoSource = "[vout]";
  }
  
  const filterComplex = filterParts.join(";");
  const videoMap = videoSource === "[0:v]" ? `-map 0:v` : `-map "${videoSource}"`;
  
  const muzikInput = hasMusic ? `-stream_loop -1 -i "${muzikPath}"` : "";
  const aboneInput = hasAbone ? `-loop 1 -i "${abonePath}"` : "";
  
  // ultrafast + threads + tune
  const args = `-i "${videoPath}" -i "${sesPath}" ${muzikInput} ${aboneInput} \
    -filter_complex "${filterComplex}" \
    ${videoMap} ${audioMap} \
    -c:v libx264 -preset ultrafast -crf 25 -threads 0 -tune zerolatency \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    -shortest \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, "final-montaj");
}

async function muzikSec(mood, saAuth) {
  if (!GDRIVE_MUZIK_FOLDER_ID) {
    console.log("⚠ GDRIVE_MUZIK_FOLDER_ID yok");
    return null;
  }
  
  console.log(`🎵 Müzik, mood: "${mood}"`);
  
  const moodKlasorler = await driveAltKlasorAraSA(mood, GDRIVE_MUZIK_FOLDER_ID, saAuth);
  
  let kaynakKlasorId;
  
  if (moodKlasorler.length > 0) {
    kaynakKlasorId = moodKlasorler[0].id;
    console.log(`  ✓ Mood klasörü: ${moodKlasorler[0].name}`);
  } else {
    kaynakKlasorId = GDRIVE_MUZIK_FOLDER_ID;
    console.log(`  ⚠ Mood klasörü yok, ana klasörden`);
  }
  
  const tumDosyalar = await driveKlasorIcerigi(kaynakKlasorId, saAuth);
  const muzikler = tumDosyalar.filter(d =>
    d.mimeType && (d.mimeType.startsWith("audio/") || d.name.match(/\.(mp3|wav|m4a|ogg)$/i))
  );
  
  if (muzikler.length === 0) return null;
  
  console.log(`  ✓ ${muzikler.length} müzik`);
  return muzikler[Math.floor(Math.random() * muzikler.length)];
}

async function main() {
  const toplamBaslangic = Date.now();
  
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    try {
      await execAsync("which ffmpeg");
      const { stdout: nproc } = await execAsync("nproc");
      console.log(`💻 CPU çekirdek: ${nproc.trim()}`);
    } catch (e) {
      throw new Error("FFmpeg veya nproc yok!");
    }
    
    await jobGuncelle(JOB_ID, { video_status: "running" });
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    const oauthAuth = getOAuthClient();
    const saAuth = getServiceAccountAuth();
    
    console.log("📂 Materyaller toplanıyor...");
    
    const gorselKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    const sesKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    const altyaziKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    
    if (gorselKlasorler.length === 0) throw new Error("01-gorseller yok");
    if (sesKlasorler.length === 0) throw new Error("02-ses yok");
    
    const gorseller = await driveKlasorIcerigi(gorselKlasorler[0].id, oauthAuth);
    const sesler = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    const altyazilar = altyaziKlasorler.length > 0 ? await driveKlasorIcerigi(altyaziKlasorler[0].id, oauthAuth) : [];
    
    console.log(`📊 ${gorseller.length} görsel, ${sesler.length} ses, ${altyazilar.length} altyazı`);
    
    if (gorseller.length === 0) throw new Error("Görsel yok!");
    if (sesler.length === 0) throw new Error("Ses yok!");
    
    // Paralel indirme
    console.log("⬇️ Paralel indirme...");
    const indirmeBaslangic = Date.now();
    
    const gorselYollar = gorseller.map((_, i) => path.join(TMP_DIR, `gorsel-${String(i + 1).padStart(2, "0")}.jpg`));
    const indirmePromise = [];
    
    for (let i = 0; i < gorseller.length; i++) {
      indirmePromise.push(driveIndir(gorseller[i].id, gorselYollar[i], oauthAuth));
    }
    
    const sesYol = path.join(TMP_DIR, "ses.mp3");
    indirmePromise.push(driveIndir(sesler[0].id, sesYol, oauthAuth));
    
    let altyaziYol = null;
    if (altyazilar.length > 0) {
      altyaziYol = path.join(TMP_DIR, "altyazi.srt");
      indirmePromise.push(driveIndir(altyazilar[0].id, altyaziYol, oauthAuth));
    }
    
    await Promise.all(indirmePromise);
    console.log(`  ✓ İndirme: ${((Date.now() - indirmeBaslangic) / 1000).toFixed(1)}s`);
    
    // Müzik ayrı (servis hesabı)
    let muzikYol = null;
    const secilenMuzik = await muzikSec(job.muzik_mood || "epic", saAuth);
    if (secilenMuzik) {
      muzikYol = path.join(TMP_DIR, "muzik.mp3");
      await driveIndir(secilenMuzik.id, muzikYol, saAuth);
      console.log(`  ✓ Müzik: ${secilenMuzik.name}`);
    }
    
    // Abone butonu
    const aboneYol = path.join(TMP_DIR, "abone.png");
    const aboneHazir = await aboneButtonHazirla(aboneYol);
    
    // Ses süresi
    const { stdout: sesDurationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sesYol}"`
    );
    const sesDuration = parseFloat(sesDurationStr.trim());
    const gorselSure = sesDuration / gorselYollar.length;
    console.log(`📏 Ses: ${sesDuration.toFixed(1)}s, Görsel başı: ${gorselSure.toFixed(1)}s`);
    
    // Ken Burns - PARALEL
    const kenBurnsBaslangic = Date.now();
    const klipYollar = gorselYollar.map((_, i) => path.join(TMP_DIR, `klip-${String(i + 1).padStart(3, "0")}.mp4`));
    await paralelKenBurns(gorselYollar, klipYollar, gorselSure);
    console.log(`  ✓ Ken Burns toplam: ${((Date.now() - kenBurnsBaslangic) / 1000).toFixed(1)}s`);
    
    // Birleştir (copy, hızlı)
    console.log("🔗 Birleştiriliyor...");
    const sessizVideoYol = path.join(TMP_DIR, "sessiz-video.mp4");
    await videolariBirlestir(klipYollar, sessizVideoYol);
    
    // Final montaj
    console.log("🎬 Final montaj...");
    const finalBaslangic = Date.now();
    const finalYol = path.join(TMP_DIR, "final.mp4");
    await finalMontaj({
      videoPath: sessizVideoYol,
      sesPath: sesYol,
      muzikPath: muzikYol,
      altyaziPath: altyaziYol,
      abonePath: aboneHazir ? aboneYol : null,
      toplamSure: sesDuration,
      ciktiPath: finalYol,
    });
    console.log(`  ✓ Final: ${((Date.now() - finalBaslangic) / 1000).toFixed(1)}s`);
    
    const finalStats = fs.statSync(finalYol);
    console.log(`✓ Final video: ${(finalStats.size / 1024 / 1024).toFixed(1)}MB`);
    
    // Yükle
    let videoKlasorler = await driveAltKlasorBul("07-video", job.drive_folder_id);
    let videoKlasorId;
    if (videoKlasorler.length === 0) {
      const yeni = await driveKlasorAc("07-video", job.drive_folder_id);
      videoKlasorId = yeni.id;
    } else {
      videoKlasorId = videoKlasorler[0].id;
    }
    
    const filename = `final-${Date.now()}.mp4`;
    const filepath = path.join(TMP_DIR, filename);
    fs.renameSync(finalYol, filepath);
    
    const yuklenen = await driveDosyaYukle({ filename, filepath }, videoKlasorId, "video/mp4");
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    
    const toplamSure = ((Date.now() - toplamBaslangic) / 1000).toFixed(0);
    
    await jobGuncelle(JOB_ID, { video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB` });
    await telegram(
      job.chat_id,
      `🎬 *Video hazır!* 🎉\n\n` +
      `📦 Boyut: ${(finalStats.size / 1024 / 1024).toFixed(1)} MB\n` +
      `⏱ Süre: ~${Math.floor(sesDuration / 60)}:${String(Math.floor(sesDuration % 60)).padStart(2, "0")}\n` +
      `⚡ Render: ${toplamSure}s\n` +
      `🎵 ${secilenMuzik ? secilenMuzik.name : "müzik yok"}\n` +
      `🔘 Abone btn: ${aboneHazir ? "var" : "yok"}\n\n` +
      `📂 [Video'yu aç](${yuklenen.link})`
    );
    
    console.log(`✅ TOPLAM: ${toplamSure}s`);
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { video_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *07-Video hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
