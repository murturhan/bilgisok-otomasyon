import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const TRANSITION_SURE = 0.65;

async function ffmpegCalistir(args, etiket = "ffmpeg") {
  const cmd = `ffmpeg -y -hide_banner -loglevel error ${args}`;

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });

    console.log(`[${etiket}] OK`);
    return { stdout, stderr };
  } catch (e) {
    console.error(`[${etiket}] HATA`, e.message);
    throw e;
  }
}

function motionPreset(index) {
  const presets = [
    {
      name: "slow_push",
      zoom: "min(zoom+0.00025,1.12)",
      x: "iw/2-(iw/zoom/2)",
      y: "ih/2-(ih/zoom/2)",
    },
    {
      name: "left_drift",
      zoom: "min(zoom+0.00022,1.10)",
      x: "iw/4",
      y: "ih/2-(ih/zoom/2)",
    },
    {
      name: "cinematic_out",
      zoom: "if(eq(on,0),1.15,zoom-0.00025)",
      x: "iw/2-(iw/zoom/2)",
      y: "ih/2-(ih/zoom/2)",
    },
    {
      name: "right_drift",
      zoom: "min(zoom+0.00028,1.14)",
      x: "iw*2/3-iw/zoom",
      y: "ih/3",
    },
  ];

  return presets[index % presets.length];
}

async function cinematicClip(gorselPath, ciktiPath, sure, index) {
  const fps = 25;
  const frameSayisi = Math.ceil(sure * fps);

  const preset = motionPreset(index);

  const vf =
    `scale=2200:1238:flags=lanczos,` +
    `zoompan=` +
    `z='${preset.zoom}':` +
    `d=${frameSayisi}:` +
    `x='${preset.x}':` +
    `y='${preset.y}':` +
    `s=1280x720:` +
    `fps=${fps},` +
    `eq=contrast=1.06:saturation=1.08:brightness=0.01,` +
    `noise=alls=6:allf=t,` +
    `vignette=PI/5,` +
    `unsharp=5:5:0.8:3:3:0.4,` +
    `format=yuv420p`;

  const args =
    `-loop 1 -i "${gorselPath}" ` +
    `-vf "${vf}" ` +
    `-t ${sure} ` +
    `-c:v libx264 ` +
    `-preset medium ` +
    `-crf 20 ` +
    `"${ciktiPath}"`;

  await ffmpegCalistir(args, `scene-${index}`);
}

async function finalMontaj({
  videoPath,
  sesPath,
  muzikPath,
  ciktiPath,
}) {
  const args =
    `-i "${videoPath}" ` +
    `-i "${sesPath}" ` +
    `-stream_loop -1 -i "${muzikPath}" ` +
    `-filter_complex "` +
    `[1:a]volume=1.0,highpass=f=120,lowpass=f=12000[voice];` +
    `[2:a]volume=0.18,afade=t=in:ss=0:d=2[music];` +
    `[voice][music]amix=inputs=2:duration=first:weights=1 0.35[aout]` +
    `" ` +
    `-map 0:v ` +
    `-map "[aout]" ` +
    `-c:v copy ` +
    `-c:a aac ` +
    `-b:a 192k ` +
    `-shortest ` +
    `"${ciktiPath}"`;

  await ffmpegCalistir(args, "final-cinematic");
}

console.log("v12 cinematic engine hazır");
