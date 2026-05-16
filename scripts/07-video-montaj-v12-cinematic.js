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
const TRANSITION_SURE = 0.65;

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
    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 80 * 1024 * 1024,
      timeout: 20 * 60 * 1000,
    });

    const sure = ((Date.now() - baslangic) / 1000).toFixed(1);
    console.log(`[${etiket}] ✓ ${sure}s`);

    if (stderr && stderr.length > 0 && !stderr.includes("deprecated")) {
      console.log(`stderr: ${stderr.substring(0, 300)}`);
    }

    return { stdout, stderr };
  } catch (e) {
    console.error(`[${etiket}] HATA: ${e.message.substring(0, 800)}`);
    throw e;
  }
}

function cinematicPreset(index) {
  const presets = [
    {
      name: "slow_push_center",
      zoom: "min(zoom+0.00024,1.13)",
      x: "iw/2-(iw/zoom/2)+sin(on/38)*10",
      y: "ih/2-(ih/zoom/2)+cos(on/45)*8",
    },
    {
      name: "left_drift",
      zoom: "min(zoom+0.00022,1.11)",
      x: "iw/3-(iw/zoom/3)+sin(on/42)*8",
      y: "ih/2-(ih/zoom/2)",
    },
    {
      name: "cinematic_pull_back",
      zoom: "if(eq(on,0),1.15,max(zoom-0.00022,1.02))",
      x: "iw/2-(iw/zoom/2)",
      y: "ih/2-(ih/zoom/2)+sin(on/50)*7",
    },
    {
      name: "right_drift",
      zoom: "min(zoom+0.00026,1.14)",
      x: "iw*2/3-iw/zoom+cos(on/46)*8",
      y: "ih/3+sin(on/55)*7",
    },
    {
      name: "low_mystery_push",
      zoom: "min(zoom+0.00018,1.09)",
      x: "iw/2-(iw/zoom/2)",
      y: "ih*0.58-(ih/zoom/2)+sin(on/60)*6",
    },
    {
      name: "documentary_float",
      zoom: "min(zoom+0.00020,1.10)",
      x: "iw/2-(iw/zoom/2)+sin(on/32)*12",
      y: "ih/2-(ih/zoom/2)+cos(on/37)*10",
    },
  ];

  return presets[index % presets.length];
}

async function kenBurnsKlipUret(gorselPath, ciktiPath, sure, varyasyon) {
  const fps = 25;
  const frameSayisi = Math.ceil(sure * fps);
  const preset = cinematicPreset(varyasyon);

  const vf =
    `scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296,` +
    `zoompan=` +
    `z='${preset.zoom}':` +
    `d=${frameSayisi}:` +
    `x='${preset.x}':` +
    `y='${preset.y}':` +
    `s=1280x720:` +
    `fps=${fps},` +
    `eq=contrast=1.07:saturation=1.08:brightness=0.005,` +
    `noise=alls=5:allf=t,` +
    `vignette=PI/5,` +
    `unsharp=5:5:0.7:3:3:0.35,` +
    `format=yuv420p`;

  const args =
    `-loop 1 -i "${gorselPath}" ` +
    `-vf "${vf}" ` +
    `-t ${sure} ` +
    `-c:v libx264 -preset fast -crf 20 ` +
    `-threads 2 ` +
    `"${ciktiPath}"`;

  await ffmpegCalistir(args, `cinematic-${varyasyon}-${preset.name}`);
}

async function paralelKenBurns(gorselYollar, klipYollar, sure) {
  console.log(`🎞️ ${gorselYollar.length} cinematic klip paralel üretiliyor...`);

  for (let i = 0; i < gorselYollar.length; i += PARALEL_KEN_BURNS) {
    const batch = [];

    for (let j = 0; j < PARALEL_KEN_BURNS && i + j < gorselYollar.length; j++) {
      const idx = i + j;
      batch.push(kenBurnsKlipUret(gorselYollar[idx], klipYollar[idx], sure, idx));
    }

    console.log(`Batch ${Math.floor(i / PARALEL_KEN_BURNS) + 1}: ${batch.length} klip...`);
    await Promise.all(batch);
  }

  console.log(`✓ ${gorselYollar.length} cinematic klip hazır`);
}

function transitionSec(index) {
  const transitions = ["fade", "smoothleft", "smoothright", "fadeblack"];
  return transitions[index % transitions.length];
}

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
    const transition = transitionSec(i);

    filterParts.push(
      `${prevLabel}[${i}:v]xfade=transition=${transition}:duration=${TRANSITION_SURE}:offset=${offset.toFixed(3)}${yeniLabel}`
    );

    prevLabel = yeniLabel;
  }

  const filterComplex = filterParts.join(";");

  const args =
    `${inputs} ` +
    `-filter_complex "${filterComplex}" ` +
    `-map "${prevLabel}" ` +
    `-c:v libx264 -preset fast -crf 20 ` +
    `-pix_fmt yuv420p ` +
    `"${ciktiPath}"`;

  await ffmpegCalistir(args, "concat-cinematic-transitions");
}

async function finalMontaj({ videoPath, sesPath, muzikPath, ciktiPath }) {
  const hasMusic = muzikPath && fs.existsSync(muzikPath);

  let filterComplex;
  let mapArgs;
  let muzikInput;

  if (hasMusic) {
    filterComplex =
      `-filter_complex "` +
      `[1:a]volume=1.0,highpass=f=90,lowpass=f=13500[voice];` +
      `[2:a]volume=0.12,afade=t=in:ss=0:d=2,aloop=loop=-1:size=2e+09[music];` +
      `[voice][music]amix=inputs=2:duration=first:weights=1 0.35[aout]` +
      `"`;

    mapArgs = `-map 0:v -map "[aout]"`;
    muzikInput = `-stream_loop -1 -i "${muzikPath}"`;
  } else {
    filterComplex =
      `-filter_complex "` +
      `[1:a]volume=1.0,highpass=f=90,lowpass=f=13500[aout]` +
      `"`;

    mapArgs = `-map 0:v -map "[aout]"`;
    muzikInput = "";
  }

  const args =
    `-i "${videoPath}" -i "${sesPath}" ${muzikInput} ` +
    `${filterComplex} ` +
    `${mapArgs} ` +
    `-c:v copy ` +
    `-c:a aac -b:a 192k ` +
    `-shortest ` +
    `"${ciktiPath}"`;

  await ffmpegCalistir(args, "final-cinematic-montaj");
}

async function muzikSec(mood, saAuth) {
  if (!GDRIVE_MUZIK_FOLDER_ID) return null;

  console.log(`🎵 Müzik, mood: "${mood}"`);

  const moodKlasorler = await driveAltKlasorAraSA(mood, GDRIVE_MUZIK_FOLDER_ID, saAuth);

  let kaynakKlasorId;

  if (moodKlasorler.length > 0) {
    kaynakKlasorId = moodKlasorler[0].id;
    console.log(`✓ Mood klasörü: ${moodKlasorler[0].name}`);
  } else {
    kaynakKlasorId = GDRIVE_MUZIK_FOLDER_ID;
    console.log("⚠ Mood klasörü yok, ana klasörden");
  }

  const tumDosyalar = await driveKlasorIcerigi(kaynakKlasorId, saAuth);

  const muzikler = tumDosyalar.filter(d =>
    d.mimeType &&
    (d.mimeType.startsWith("audio/") || d.name.match(/\.(mp3|wav|m4a|ogg)$/i))
  );

  if (muzikler.length === 0) return null;

  console.log(`✓ ${muzikler.length} müzik`);
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

    if (gorselKlasorler.length === 0) throw new Error("01-gorseller yok");
    if (sesKlasorler.length === 0) throw new Error("02-ses yok");

    const gorseller = await driveKlasorIcerigi(gorselKlasorler[0].id, oauthAuth);
    const sesDosyalar = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    const sesler = sesDosyalar.filter(d => d.name.endsWith(".mp3"));

    console.log(`📊 ${gorseller.length} görsel, ${sesler.length} ses`);

    if (gorseller.length === 0) throw new Error("Görsel yok!");
    if (sesler.length === 0) throw new Error("Ses yok!");

    console.log("⬇️ Paralel indirme...");

    const gorselYollar = gorseller.map((_, i) =>
      path.join(TMP_DIR, `gorsel-${String(i + 1).padStart(2, "0")}.jpg`)
    );

    const indirmePromise = [];

    for (let i = 0; i < gorseller.length; i++) {
      indirmePromise.push(driveIndir(gorseller[i].id, gorselYollar[i], oauthAuth));
    }

    const sesYol = path.join(TMP_DIR, "ses.mp3");
    indirmePromise.push(driveIndir(sesler[sesler.length - 1].id, sesYol, oauthAuth));

    await Promise.all(indirmePromise);

    let muzikYol = null;

    const secilenMuzik = await muzikSec(job.muzik_mood || "epic", saAuth);

    if (secilenMuzik) {
      muzikYol = path.join(TMP_DIR, "muzik.mp3");
      await driveIndir(secilenMuzik.id, muzikYol, saAuth);
      console.log(`✓ Müzik: ${secilenMuzik.name}`);
    }

    const { stdout: sesDurationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sesYol}"`
    );

    const sesDuration = parseFloat(sesDurationStr.trim());

    const N = gorselYollar.length;
    const klipSure = (sesDuration + (N - 1) * TRANSITION_SURE) / N;

    console.log(`📏 Ses: ${sesDuration.toFixed(1)}s, Klip başı: ${klipSure.toFixed(1)}s`);

    const klipYollar = gorselYollar.map((_, i) =>
      path.join(TMP_DIR, `klip-${String(i + 1).padStart(3, "0")}.mp4`)
    );

    await paralelKenBurns(gorselYollar, klipYollar, klipSure);

    console.log("🔗 Cinematic transitions ile birleştiriliyor...");

    const sessizVideoYol = path.join(TMP_DIR, "sessiz-video.mp4");
    await videolariFadeIleBirlestir(klipYollar, klipSure, sessizVideoYol);

    console.log("🎬 Final cinematic montaj...");

    const finalYol = path.join(TMP_DIR, "final.mp4");

    await finalMontaj({
      videoPath: sessizVideoYol,
      sesPath: sesYol,
      muzikPath: muzikYol,
      ciktiPath: finalYol,
    });

    const finalStats = fs.statSync(finalYol);

    let videoKlasorler = await driveAltKlasorBul("07-video", job.drive_folder_id);

    let videoKlasorId;

    if (videoKlasorler.length === 0) {
      const yeni = await driveKlasorAc("07-video", job.drive_folder_id);
      videoKlasorId = yeni.id;
    } else {
      videoKlasorId = videoKlasorler[0].id;
    }

    const filename = `final-cinematic-${Date.now()}.mp4`;
    const filepath = path.join(TMP_DIR, filename);

    fs.renameSync(finalYol, filepath);

    const yuklenen = await driveDosyaYukle({ filename, filepath }, videoKlasorId, "video/mp4");

    fs.rmSync(TMP_DIR, { recursive: true, force: true });

    const toplamSure = ((Date.now() - toplamBaslangic) / 1000).toFixed(0);

    await jobGuncelle(JOB_ID, {
      video_status: `completed:${(finalStats.size / 1024 / 1024).toFixed(1)}MB`,
    });

    await telegram(
      job.chat_id,
      `🎬 *Cinematic video hazır!* 🎉\n\n` +
        `📌 ${job.baslik}\n` +
        `📦 ${(finalStats.size / 1024 / 1024).toFixed(1)} MB\n` +
        `⏱ ~${Math.floor(sesDuration / 60)}:${String(Math.floor(sesDuration % 60)).padStart(2, "0")}\n` +
        `⚡ Render: ${toplamSure}s\n` +
        `🎵 ${secilenMuzik ? secilenMuzik.name : "müzik yok"}\n\n` +
        `📂 [Video'yu izle](${yuklenen.link})\n\n` +
        `━━━━━━━━━━━━━━━\n\n` +
        `▶️ *YouTube'a yüklemek için:*\n\n` +
        `\`/yukle ${JOB_ID}\` _(private)_\n` +
        `\`/yukle ${JOB_ID} unlisted\` _(linki olanlar)_\n` +
        `\`/yukle ${JOB_ID} public\` _(yayında)_\n\n` +
        `Komutu kopyala yapıştır 👆`
    );

    console.log(`✅ TOPLAM: ${toplamSure}s`);
    process.exit(0);
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);

    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, {
        video_status: `error: ${error.message.substring(0, 100)}`,
      });
      await telegram(
        job.chat_id,
        `❌ *07-Video cinematic hatası:* ${error.message.substring(0, 300)}`
      );
    } catch (e) {}

    process.exit(1);
  }
}

main();
