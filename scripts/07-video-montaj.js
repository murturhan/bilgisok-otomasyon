/**
 * 07 - Video Montaj (FFmpeg)
 * - Tüm materyalleri Drive'dan indir
 * - Ken Burns efekti ile görselleri videoya çevir
 * - Stok videoları aralara serpiştir
 * - TTS sesi + müzik (düşük volume) + altyazı bindir
 * - Final MP4'ü Drive'a yükle
 *
 * GEREKLİ: ffmpeg system'de kurulu olmalı (Ubuntu'da apt ile)
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import axios from "axios";
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
const KEN_BURNS_SURE = 6; // her görsel saniye
const STOK_VIDEO_PAYI = 4; // her N görseldan sonra 1 stok video

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
    if (stderr) console.log(`  stderr: ${stderr.substring(0, 500)}`);
    return { stdout, stderr };
  } catch (e) {
    console.error(`[${etiket}] HATA: ${e.message.substring(0, 500)}`);
    throw e;
  }
}

// Ken Burns efektli görsel klip oluştur
async function kenBurnsKlipUret(gorselPath, ciktiPath, sure = KEN_BURNS_SURE) {
  // Zoompan: her frame %0.001 yakınlaş (1280x720, 25fps)
  const frameSayisi = sure * 25;
  
  const args = `-loop 1 -i "${gorselPath}" \
    -vf "zoompan=z='zoom+0.001':d=${frameSayisi}:s=1280x720:fps=25,format=yuv420p" \
    -t ${sure} \
    -c:v libx264 -preset ultrafast -crf 23 \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, `kenburns-${path.basename(gorselPath)}`);
}

// Stok videoyu kırp/normalize
async function stokVideoNormalize(videoPath, ciktiPath, sure = 5) {
  const args = `-i "${videoPath}" \
    -t ${sure} \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=25,format=yuv420p" \
    -an \
    -c:v libx264 -preset ultrafast -crf 23 \
    "${ciktiPath}"`;
  
  await ffmpegCalistir(args, `stok-${path.basename(videoPath)}`);
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
  // Audio mix: TTS ana, müzik %15 volume arka plan
  // Subtitle: hardcoded SRT (yanıp sönen, beyaz outline)
  
  const hasMusic = muzikPath && fs.existsSync(muzikPath);
  const hasSubtitle = altyaziPath && fs.existsSync(altyaziPath);
  
  let filterComplex = "";
  let mapArgs = "";
  
  if (hasMusic) {
    // Müzik döngüye al, %15 volume, TTS ile mix
    filterComplex = `[1:a]volume=1.0[tts];[2:a]volume=0.15,aloop=loop=-1:size=2e+09[music];[tts][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
    mapArgs = `-map 0:v -map "[aout]"`;
  } else {
    filterComplex = `[1:a]volume=1.0[aout]`;
    mapArgs = `-map 0:v -map "[aout]"`;
  }
  
  // Subtitle filter (varsa)
  let videoFilter = "";
  if (hasSubtitle) {
    // Escape path için single quote
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
    
    // FFmpeg kurulu mu kontrol
    try {
      await execAsync("which ffmpeg");
    } catch (e) {
      throw new Error("FFmpeg sistemde kurulu değil! Workflow apt install ffmpeg eklemeli.");
    }
    
    await jobGuncelle(JOB_ID, { video_status: "running" });
    
    // Temp dir hazırla
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    const oauthAuth = getOAuthClient();
    
    // 1. Tüm alt klasör içeriklerini listele
    console.log("📂 Materyaller toplanıyor...");
    
    const gorselKlasorler = await driveAltKlasorBul("01-gorseller", job.drive_folder_id);
    const sesKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    const stokKlasorler = await driveAltKlasorBul("03-pexels-stok-video", job.drive_folder_id);
    const altyaziKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    
    if (gorselKlasorler.length === 0) throw new Error("01-gorseller klasörü yok");
    if (sesKlasorler.length === 0) throw new Error("02-ses klasörü yok");
    
    const gorseller = await driveKlasorIcerigi(gorselKlasorler[0].id, oauthAuth);
    const sesler = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    const stokVideolar = stokKlasorler.length > 0 ? await driveKlasorIcerigi(stokKlasorler[0].id, oauthAuth) : [];
    const altyazilar = altyaziKlasorler.length > 0 ? await driveKlasorIcerigi(altyaziKlasorler[0].id, oauthAuth) : [];
    
    console.log(`📊 Bulundu: ${gorseller.length} görsel, ${sesler.length} ses, ${stokVideolar.length} stok, ${altyazilar.length} altyazı`);
    
    if (gorseller.length === 0) throw new Error("Hiç görsel yok!");
    if (sesler.length === 0) throw new Error("Hiç ses dosyası yok!");
    
    // 2. Dosyaları indir
    console.log("⬇️ İndirme başlıyor...");
    
    // Görselleri indir
    const gorselYollar = [];
    for (let i = 0; i < gorseller.length; i++) {
      const g = gorseller[i];
      const yol = path.join(TMP_DIR, `gorsel-${String(i + 1).padStart(2, "0")}.jpg`);
      await driveIndir(g.id, yol, oauthAuth);
      gorselYollar.push(yol);
    }
    console.log(`  ✓ ${gorselYollar.length} görsel indirildi`);
    
    // Ses
    const sesYol = path.join(TMP_DIR, "ses.mp3");
    await driveIndir(sesler[0].id, sesYol, oauthAuth);
    console.log(`  ✓ Ses indirildi`);
    
    // Stok videolar
    const stokYollar = [];
    for (let i = 0; i < stokVideolar.length; i++) {
      const v = stokVideolar[i];
      const yol = path.join(TMP_DIR, `stok-${String(i + 1).padStart(2, "0")}.mp4`);
      await driveIndir(v.id, yol, oauthAuth);
      stokYollar.push(yol);
    }
    console.log(`  ✓ ${stokYollar.length} stok video indirildi`);
    
    // Altyazı
    let altyaziYol = null;
    if (altyazilar.length > 0) {
      altyaziYol = path.join(TMP_DIR, "altyazi.srt");
      await driveIndir(altyazilar[0].id, altyaziYol, oauthAuth);
      console.log(`  ✓ Altyazı indirildi`);
    }
    
    // Müzik (rastgele)
    let muzikYol = null;
    if (GDRIVE_MUZIK_FOLDER_ID) {
      const saAuth = getServiceAccountAuth();
      const muzikler = await driveKlasorIcerigi(GDRIVE_MUZIK_FOLDER_ID, saAuth);
      if (muzikler.length > 0) {
        const rastgele = muzikler[Math.floor(Math.random() * muzikler.length)];
        muzikYol = path.join(TMP_DIR, "muzik.mp3");
        await driveIndir(rastgele.id, muzikYol, saAuth);
        console.log(`  ✓ Müzik indirildi: ${rastgele.name}`);
      }
    }
    
    // 3. Ses süresini al (Total duration için)
    const sesDurationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sesYol}"`;
    const { stdout: sesDurationStr } = await execAsync(sesDurationCmd);
    const sesDuration = parseFloat(sesDurationStr.trim());
    console.log(`📏 Ses süresi: ${sesDuration.toFixed(1)} saniye`);
    
    // 4. Her görselin süresini hesapla (sese göre dengeli dağıt)
    // Stok videoları aralara serpiştir
    const toplamPara = gorselYollar.length + stokYollar.length;
    const gorselSure = sesDuration / toplamPara;
    console.log(`📐 Her görsel ≈ ${gorselSure.toFixed(1)}s`);
    
    // 5. Ken Burns klipleri üret
    console.log("🎞️ Ken Burns klipleri üretiliyor...");
    const klipYollar = [];
    let stokSayac = 0;
    
    for (let i = 0; i < gorselYollar.length; i++) {
      const klipYol = path.join(TMP_DIR, `klip-${String(i + 1).padStart(3, "0")}.mp4`);
      await kenBurnsKlipUret(gorselYollar[i], klipYol, gorselSure);
      klipYollar.push(klipYol);
      
      // Her STOK_VIDEO_PAYI görselden sonra 1 stok video ekle
      if ((i + 1) % STOK_VIDEO_PAYI === 0 && stokSayac < stokYollar.length) {
        const stokKlipYol = path.join(TMP_DIR, `stokklip-${String(stokSayac + 1).padStart(2, "0")}.mp4`);
        await stokVideoNormalize(stokYollar[stokSayac], stokKlipYol, gorselSure);
        klipYollar.push(stokKlipYol);
        stokSayac++;
      }
    }
    
    // Kalan stok videoları sona ekle
    while (stokSayac < stokYollar.length) {
      const stokKlipYol = path.join(TMP_DIR, `stokklip-${String(stokSayac + 1).padStart(2, "0")}.mp4`);
      await stokVideoNormalize(stokYollar[stokSayac], stokKlipYol, gorselSure);
      klipYollar.push(stokKlipYol);
      stokSayac++;
    }
    
    console.log(`  ✓ ${klipYollar.length} klip hazır`);
    
    // 6. Klipleri birleştir (sessiz video)
    console.log("🔗 Klipler birleştiriliyor...");
    const sessizVideoYol = path.join(TMP_DIR, "sessiz-video.mp4");
    await videolariBirlestir(klipYollar, sessizVideoYol);
    
    // 7. Final montaj (ses + müzik + altyazı bindir)
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
    
    // 8. Drive'a yükle - "07-video" klasörü
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
    
    // 9. Temizlik
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    
    await jobGuncelle(JOB_ID, { video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB` });
    await telegram(
      job.chat_id, 
      `🎬 *Video hazır!* 🎉\n\n` +
      `📦 Boyut: ${(finalStats.size / 1024 / 1024).toFixed(1)} MB\n` +
      `⏱ Süre: ~${Math.floor(sesDuration / 60)}:${String(Math.floor(sesDuration % 60)).padStart(2, "0")}\n\n` +
      `📂 [Video'yu aç](${yuklenen.link})\n\n` +
      `_Drive'daki "07-video" klasöründe._`
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
