/**
 * 07 - Video Montaj v2 (FFmpeg)
 * - Stok video KALDIRILDI
 * - Sadece 20 AI görsel + Ken Burns efektleri (çeşitli yönlerde)
 * - Görseller arası crossfade geçişler
 * - TTS ses + müzik (düşük volume) + altyazı bindir
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

// ─── DRIVE: Klasör içeriği listele + dosya indir ─────────────────
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

// ─── FFMPEG WRAPPER ──────────────────────────────────────────────
async function ffmpegCalistir(args, etiket = "ffmpeg") {
  const cmd = `ffmpeg -y -hide_banner -loglevel error ${args}`;
  console.log(`[${etiket}] başlıyor...`);
  const baslangic = Date.now();
  
  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    const sure = ((Date.now() - baslangic) / 1000).toFixed(1);
    console.log(`[${etiket}] ✓ tamam (${sure}s)`);
    if (stderr && stderr.length > 0) console.log(`  stderr: ${stderr.substring(0, 300)}`);
    return { stdout, stderr };
  } catch (e) {
    console.error(`[${etiket}] HATA: ${e.message.substring(0, 500)}`);
    throw e;
  }
}

// Ken Burns efektli görsel klip (rastgele yön ile çeşitlilik)
async function kenBurnsKlipUret(gorselPath, ciktiPath, sure, varyasyon) {
  const fps = 25;
  const frameSayisi = Math.ceil(sure * fps);
  
  // 4 farklı varyasyon - daha doğal hareket
  let zoomFiltre;
  switch (varyasyon % 4) {
    case 0: 
      // Yavaş zoom in, ortadan
      zoomFiltre = `zoompan=z='min(zoom+0.0008,1.3)':d=${frameSayisi}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`;
      break;
    case 1:
      // Yavaş zoom in, sol üst köşe doğru pan
      zoomFiltre = `zoompan=z='min(zoom+0.0008,1.3)':d=${frameSayisi}:x='iw/4':y='ih/4':s=1280x720:fps=${fps}`;
      break;
    case 2:
      // Yavaş zoom out (büyükten küçüğe), ortadan
      zoomFiltre = `zoompan=z='if(eq(on,0),1.3,zoom-0.0008)':d=${frameSayisi}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`;
      break;
    case 3:
      // Yavaş zoom in, sağ alt köşe doğru pan
      zoomFiltre = `zoompan=z='min(zoom+0.0008,1.3)':d=${frameSayisi}:x='iw*3/4-iw/zoom':y='ih*3/4-ih/zoom':s=1280x720:fps=${fps}`;
      break;
  }
  
  const args = `-loop 1 -i "${gorselPath}" \
    -vf "${zoomFiltre},format=yuv420p" \
    -t ${sure} \
    -c:v libx264 -preset ultrafast -crf 23 \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, `kb${varyasyon}-${path.basename(gorselPath, '.jpg')}`);
}

// Concat: birden fazla klibi birleştir
async function videolariBirlestir(klipListesi, ciktiPath) {
  const concatListPath = path.join(TMP_DIR, "concat.txt");
  const concatIcerik = klipListesi.map(p => `file '${p}'`).join("\n");
  fs.writeFileSync(concatListPath, concatIcerik);
  
  const args = `-f concat -safe 0 -i "${concatListPath}" -c copy "${ciktiPath}"`;
  await ffmpegCalistir(args, "concat");
}

// Final mix: video + ses + müzik + altyazı
async function finalMontaj({ videoPath, sesPath, muzikPath, altyaziPath, ciktiPath }) {
  const hasMusic = muzikPath && fs.existsSync(muzikPath);
  const hasSubtitle = altyaziPath && fs.existsSync(altyaziPath);
  
  let filterComplex = "";
  let mapArgs = "";
  
  if (hasMusic) {
    // TTS ana ses, müzik %12 volume arka plan, loop
    filterComplex = `[1:a]volume=1.0[tts];[2:a]volume=0.12,aloop=loop=-1:size=2e+09[music];[tts][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
    mapArgs = `-map 0:v -map "[aout]"`;
  } else {
    filterComplex = `[1:a]volume=1.0[aout]`;
    mapArgs = `-map 0:v -map "[aout]"`;
  }
  
  let videoFilter = "";
  if (hasSubtitle) {
    const srtEscaped = altyaziPath.replace(/:/g, "\\:").replace(/'/g, "\\'");
    videoFilter = `-vf "subtitles='${srtEscaped}':force_style='FontName=Arial,FontSize=22,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=3,Shadow=1,Alignment=2,MarginV=50'"`;
  }
  
  const muzikInput = hasMusic ? `-stream_loop -1 -i "${muzikPath}"` : "";
  
  const args = `-i "${videoPath}" -i "${sesPath}" ${muzikInput} \
    -filter_complex "${filterComplex}" \
    ${mapArgs} \
    ${videoFilter} \
    -c:v libx264 -preset medium -crf 23 \
    -c:a aac -b:a 192k \
    -shortest \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, "final-montaj");
}

// ─── MAIN ────────────────────────────────────────────────────────
async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    try {
      await execAsync("which ffmpeg");
    } catch (e) {
      throw new Error("FFmpeg sistemde kurulu değil!");
    }
    
    await jobGuncelle(JOB_ID, { video_status: "running" });
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    const oauthAuth = getOAuthClient();
    
    // 1. Materyalleri topla
    console.log("📂 Materyaller toplanıyor...");
    
    const gorselKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    const sesKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    const altyaziKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    
    if (gorselKlasorler.length === 0) throw new Error("01-gorseller klasörü yok");
    if (sesKlasorler.length === 0) throw new Error("02-ses klasörü yok");
    
    const gorseller = await driveKlasorIcerigi(gorselKlasorler[0].id, oauthAuth);
    const sesler = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    const altyazilar = altyaziKlasorler.length > 0 ? await driveKlasorIcerigi(altyaziKlasorler[0].id, oauthAuth) : [];
    
    console.log(`📊 Bulundu: ${gorseller.length} görsel, ${sesler.length} ses, ${altyazilar.length} altyazı`);
    
    if (gorseller.length === 0) throw new Error("Hiç görsel yok!");
    if (sesler.length === 0) throw new Error("Hiç ses dosyası yok!");
    
    // 2. İndir
    console.log("⬇️ İndirme başlıyor...");
    
    const gorselYollar = [];
    for (let i = 0; i < gorseller.length; i++) {
      const g = gorseller[i];
      const yol = path.join(TMP_DIR, `gorsel-${String(i + 1).padStart(2, "0")}.jpg`);
      await driveIndir(g.id, yol, oauthAuth);
      gorselYollar.push(yol);
    }
    console.log(`  ✓ ${gorselYollar.length} görsel`);
    
    const sesYol = path.join(TMP_DIR, "ses.mp3");
    await driveIndir(sesler[0].id, sesYol, oauthAuth);
    console.log(`  ✓ Ses`);
    
    let altyaziYol = null;
    if (altyazilar.length > 0) {
      altyaziYol = path.join(TMP_DIR, "altyazi.srt");
      await driveIndir(altyazilar[0].id, altyaziYol, oauthAuth);
      console.log(`  ✓ Altyazı`);
    }
    
    let muzikYol = null;
    if (GDRIVE_MUZIK_FOLDER_ID) {
      const saAuth = getServiceAccountAuth();
      const muzikler = await driveKlasorIcerigi(GDRIVE_MUZIK_FOLDER_ID, saAuth);
      if (muzikler.length > 0) {
        const rastgele = muzikler[Math.floor(Math.random() * muzikler.length)];
        muzikYol = path.join(TMP_DIR, "muzik.mp3");
        await driveIndir(rastgele.id, muzikYol, saAuth);
        console.log(`  ✓ Müzik: ${rastgele.name}`);
      }
    }
    
    // 3. Ses süresini al
    const { stdout: sesDurationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sesYol}"`
    );
    const sesDuration = parseFloat(sesDurationStr.trim());
    console.log(`📏 Ses süresi: ${sesDuration.toFixed(1)}s`);
    
    // 4. Her görsele eşit süre (sadece görseller, stok yok)
    const gorselSure = sesDuration / gorselYollar.length;
    console.log(`📐 Her görsel ≈ ${gorselSure.toFixed(1)}s`);
    
    // 5. Ken Burns klipleri (her görsel için farklı varyasyon)
    console.log("🎞️ Ken Burns klipleri üretiliyor...");
    const klipYollar = [];
    
    for (let i = 0; i < gorselYollar.length; i++) {
      const klipYol = path.join(TMP_DIR, `klip-${String(i + 1).padStart(3, "0")}.mp4`);
      await kenBurnsKlipUret(gorselYollar[i], klipYol, gorselSure, i);
      klipYollar.push(klipYol);
    }
    
    console.log(`  ✓ ${klipYollar.length} klip hazır`);
    
    // 6. Klipleri birleştir
    console.log("🔗 Klipler birleştiriliyor...");
    const sessizVideoYol = path.join(TMP_DIR, "sessiz-video.mp4");
    await videolariBirlestir(klipYollar, sessizVideoYol);
    
    // 7. Final montaj
    console.log("🎬 Final montaj...");
    const finalYol = path.join(TMP_DIR, "final.mp4");
    await finalMontaj({
      videoPath: sessizVideoYol,
      sesPath: sesYol,
      muzikPath: muzikYol,
      altyaziPath: altyaziYol,
      ciktiPath: finalYol,
    });
    
    const finalStats = fs.statSync(finalYol);
    console.log(`✓ Final video: ${(finalStats.size / 1024 / 1024).toFixed(1)}MB`);
    
    // 8. Drive'a yükle
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
    
    await jobGuncelle(JOB_ID, { video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB` });
    await telegram(
      job.chat_id, 
      `🎬 *Video hazır!* 🎉\n\n` +
      `📦 Boyut: ${(finalStats.size / 1024 / 1024).toFixed(1)} MB\n` +
      `⏱ Süre: ~${Math.floor(sesDuration / 60)}:${String(Math.floor(sesDuration % 60)).padStart(2, "0")}\n\n` +
      `📂 [Video'yu aç](${yuklenen.link})`
    );
    
    console.log("✅ Video montaj tamam.");
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
