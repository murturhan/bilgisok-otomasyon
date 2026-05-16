/**
 * 07 - Video Montaj v9 - TİTREŞİMSİZ
 * - Ken Burns: önce upscale, zoom uygula, sonra 1280x720'ye düşür → subpixel precision
 * - Görseller arası 0.5s crossfade transition
 * - Müzik %5
 * - Font 20
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
  driveKlasorAc,
  driveDosyaYukle,
  getOAuthClient,
  getServiceAccountAuth,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);

const { JOB_ID, GDRIVE_MUZIK_FOLDER_ID } = process.env;

const TMP_DIR = "/tmp/video-montaj";
const PARALEL_KEN_BURNS = 4;
const TRANSITION_SURE = 0.5;

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
  const res = await drive.files.list({ q, fields: "files(id, name)", pageSize: 10 });
  return res.data.files || [];
}

async function driveIndir(fileId, hedefYol, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(hedefYol);
    res.data.on("end", () => resolve()).on("error", reject).pipe(writeStream);
  });
}

async function ffmpegCalistir(args, etiket = "ffmpeg") {
  const cmd = `ffmpeg -y -hide_banner -loglevel error ${args}`;
  const baslangic = Date.now();
  
  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: 15 * 60 * 1000 });
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

// TİTREŞİMSİZ KEN BURNS: upscale → zoom → downscale
async function kenBurnsKlipUret(gorselPath, ciktiPath, sure, varyasyon) {
  const fps = 25;
  const frameSayisi = Math.ceil(sure * fps);
  
  const ICDEN_W = 2560;
  const ICDEN_H = 1440;
  const FINAL_W = 1280;
  const FINAL_H = 720;
  
  let zoomFiltre;
  switch (varyasyon % 4) {
    case 0:
      zoomFiltre = `scale=${ICDEN_W * 1.5}:${ICDEN_H * 1.5}:flags=lanczos,zoompan=z='min(zoom+0.0003,1.15)':d=${frameSayisi}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${ICDEN_W}x${ICDEN_H}:fps=${fps},scale=${FINAL_W}:${FINAL_H}:flags=lanczos`;
      break;
    case 1:
      zoomFiltre = `scale=${ICDEN_W * 1.5}:${ICDEN_H * 1.5}:flags=lanczos,zoompan=z='min(zoom+0.0003,1.15)':d=${frameSayisi}:x='iw/3':y='ih/3':s=${ICDEN_W}x${ICDEN_H}:fps=${fps},scale=${FINAL_W}:${FINAL_H}:flags=lanczos`;
      break;
    case 2:
      zoomFiltre = `scale=${ICDEN_W * 1.5}:${ICDEN_H * 1.5}:flags=lanczos,zoompan=z='if(eq(on,0),1.15,zoom-0.0003)':d=${frameSayisi}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${ICDEN_W}x${ICDEN_H}:fps=${fps},scale=${FINAL_W}:${FINAL_H}:flags=lanczos`;
      break;
    case 3:
      zoomFiltre = `scale=${ICDEN_W * 1.5}:${ICDEN_H * 1.5}:flags=lanczos,zoompan=z='min(zoom+0.0003,1.15)':d=${frameSayisi}:x='iw*2/3-iw/zoom':y='ih*2/3-ih/zoom':s=${ICDEN_W}x${ICDEN_H}:fps=${fps},scale=${FINAL_W}:${FINAL_H}:flags=lanczos`;
      break;
  }
  
  const args = `-loop 1 -i "${gorselPath}" \
    -vf "${zoomFiltre},format=yuv420p" \
    -t ${sure} \
    -c:v libx264 -preset fast -crf 22 \
    -threads 2 \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, `kb${varyasyon}`);
}

async function paralelKenBurns(gorselYollar, klipYollar, sure) {
  console.log(`🎞️ ${gorselYollar.length} klip paralel üretiliyor (titreşimsiz)...`);
  
  for (let i = 0; i < gorselYollar.length; i += PARALEL_KEN_BURNS) {
    const batch = [];
    for (let j = 0; j < PARALEL_KEN_BURNS && (i + j) < gorselYollar.length; j++) {
      const idx = i + j;
      batch.push(kenBurnsKlipUret(gorselYollar[idx], klipYollar[idx], sure, idx));
    }
    console.log(`  Batch ${Math.floor(i / PARALEL_KEN_BURNS) + 1}: ${batch.length} klip...`);
    await Promise.all(batch);
  }
  
  console.log(`  ✓ ${gorselYollar.length} klip hazır`);
}

// FADE TRANSITIONS ile birleştirme
async function videolariFadeIleBirlestir(klipListesi, gorselSure, ciktiPath) {
  const N = klipListesi.length;
  
  if (N === 1) {
    fs.copyFileSync(klipListesi[0], ciktiPath);
    return;
  }
  
  const inputs = klipListesi.map(p => `-i "${p}"`).join(" ");
  
  const filterParts = [];
  let prevLabel = "[0:v]";
  
  for (let i = 1; i < N; i++) {
    const yeniLabel = `[v${i}]`;
    const offset = i * gorselSure - i * TRANSITION_SURE;
    filterParts.push(`${prevLabel}[${i}:v]xfade=transition=fade:duration=${TRANSITION_SURE}:offset=${offset.toFixed(3)}${yeniLabel}`);
    prevLabel = yeniLabel;
  }
  
  const filterComplex = filterParts.join(";");
  
  const args = `${inputs} \
    -filter_complex "${filterComplex}" \
    -map "${prevLabel}" \
    -c:v libx264 -preset fast -crf 22 \
    -pix_fmt yuv420p \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, "concat-fade");
}

async function asamaA_video_ses_muzik({ videoPath, sesPath, muzikPath, ciktiPath }) {
  const hasMusic = muzikPath && fs.existsSync(muzikPath);
  
  let filterComplex, mapArgs, muzikInput;
  
  if (hasMusic) {
    filterComplex = `-filter_complex "[1:a]volume=1.0[tts];[2:a]volume=0.05,aloop=loop=-1:size=2e+09[music];[tts][music]amix=inputs=2:duration=first[aout]"`;
    mapArgs = `-map 0:v -map "[aout]"`;
    muzikInput = `-stream_loop -1 -i "${muzikPath}"`;
  } else {
    filterComplex = `-filter_complex "[1:a]volume=1.0[aout]"`;
    mapArgs = `-map 0:v -map "[aout]"`;
    muzikInput = "";
  }
  
  const args = `-i "${videoPath}" -i "${sesPath}" ${muzikInput} \
    ${filterComplex} \
    ${mapArgs} \
    -c:v copy \
    -c:a aac -b:a 128k \
    -shortest \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, "asama-A");
}

async function asamaB_altyazi({ videoPath, altyaziPath, ciktiPath }) {
  if (!altyaziPath || !fs.existsSync(altyaziPath)) {
    fs.copyFileSync(videoPath, ciktiPath);
    console.log("[asama-B] altyazı yok, atlandı");
    return;
  }
  
  const srtEscaped = altyaziPath.replace(/:/g, "\\:").replace(/'/g, "\\'");
  
  const args = `-i "${videoPath}" \
    -vf "subtitles='${srtEscaped}':force_style='FontName=Arial,FontSize=20,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=50'" \
    -c:v libx264 -preset fast -crf 22 -threads 0 \
    -c:a copy \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, "asama-B-altyazi");
}

async function muzikSec(mood, saAuth) {
  if (!GDRIVE_MUZIK_FOLDER_ID) return null;
  
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
      throw new Error("FFmpeg yok!");
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
    const sesDosyalar = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    const sesler = sesDosyalar.filter(d => d.name.endsWith(".mp3"));
    const altyazilar = altyaziKlasorler.length > 0 ? await driveKlasorIcerigi(altyaziKlasorler[0].id, oauthAuth) : [];
    
    console.log(`📊 ${gorseller.length} görsel, ${sesler.length} ses, ${altyazilar.length} altyazı`);
    
    if (gorseller.length === 0) throw new Error("Görsel yok!");
    if (sesler.length === 0) throw new Error("Ses yok!");
    
    console.log("⬇️ Paralel indirme...");
    const indirmeBaslangic = Date.now();
    
    const gorselYollar = gorseller.map((_, i) => path.join(TMP_DIR, `gorsel-${String(i + 1).padStart(2, "0")}.jpg`));
    const indirmePromise = [];
    
    for (let i = 0; i < gorseller.length; i++) {
      indirmePromise.push(driveIndir(gorseller[i].id, gorselYollar[i], oauthAuth));
    }
    
    const sesYol = path.join(TMP_DIR, "ses.mp3");
    indirmePromise.push(driveIndir(sesler[sesler.length - 1].id, sesYol, oauthAuth));
    
    let altyaziYol = null;
    if (altyazilar.length > 0) {
      const srtler = altyazilar.filter(d => d.name.endsWith(".srt"));
      if (srtler.length > 0) {
        altyaziYol = path.join(TMP_DIR, "altyazi.srt");
        indirmePromise.push(driveIndir(srtler[srtler.length - 1].id, altyaziYol, oauthAuth));
      }
    }
    
    await Promise.all(indirmePromise);
    console.log(`  ✓ İndirme: ${((Date.now() - indirmeBaslangic) / 1000).toFixed(1)}s`);
    
    let muzikYol = null;
    const secilenMuzik = await muzikSec(job.muzik_mood || "epic", saAuth);
    if (secilenMuzik) {
      muzikYol = path.join(TMP_DIR, "muzik.mp3");
      await driveIndir(secilenMuzik.id, muzikYol, saAuth);
      console.log(`  ✓ Müzik: ${secilenMuzik.name}`);
    }
    
    const { stdout: sesDurationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sesYol}"`
    );
    const sesDuration = parseFloat(sesDurationStr.trim());
    
    // Fade transitions için klip süresi
    const N = gorselYollar.length;
    const klipSure = (sesDuration + (N - 1) * TRANSITION_SURE) / N;
    console.log(`📏 Ses: ${sesDuration.toFixed(1)}s, Klip başı: ${klipSure.toFixed(1)}s (${TRANSITION_SURE}s fade x${N-1})`);
    
    const kenBurnsBaslangic = Date.now();
    const klipYollar = gorselYollar.map((_, i) => path.join(TMP_DIR, `klip-${String(i + 1).padStart(3, "0")}.mp4`));
    await paralelKenBurns(gorselYollar, klipYollar, klipSure);
    console.log(`  ✓ Ken Burns toplam: ${((Date.now() - kenBurnsBaslangic) / 1000).toFixed(1)}s`);
    
    console.log("🔗 Fade transitions ile birleştiriliyor...");
    const sessizVideoYol = path.join(TMP_DIR, "sessiz-video.mp4");
    await videolariFadeIleBirlestir(klipYollar, klipSure, sessizVideoYol);
    
    console.log("🎬 Aşama A: Video + Ses + Müzik...");
    const asamaAYol = path.join(TMP_DIR, "asama-a.mp4");
    await asamaA_video_ses_muzik({
      videoPath: sessizVideoYol,
      sesPath: sesYol,
      muzikPath: muzikYol,
      ciktiPath: asamaAYol,
    });
    
    console.log("🎬 Aşama B: Altyazı...");
    const finalYol = path.join(TMP_DIR, "final.mp4");
    await asamaB_altyazi({
      videoPath: asamaAYol,
      altyaziPath: altyaziYol,
      ciktiPath: finalYol,
    });
    
    const finalStats = fs.statSync(finalYol);
    console.log(`✓ Final video: ${(finalStats.size / 1024 / 1024).toFixed(1)}MB`);
    
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
      `📦 ${(finalStats.size / 1024 / 1024).toFixed(1)} MB\n` +
      `⏱ ~${Math.floor(sesDuration / 60)}:${String(Math.floor(sesDuration % 60)).padStart(2, "0")}\n` +
      `⚡ Render: ${toplamSure}s\n` +
      `🎵 ${secilenMuzik ? secilenMuzik.name : "müzik yok"}\n\n` +
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
