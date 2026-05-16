/**
 * 08 - YouTube Upload
 * - Drive'dan final video + thumbnail indirir
 * - YouTube'a yükler (privacy: private varsayılan)
 * - Telegram'a sonuç linkini gönderir
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  getOAuthClient,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const {
  JOB_ID,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REFRESH_TOKEN,
  YOUTUBE_PRIVACY,
} = process.env;

const TMP_DIR = "/tmp/youtube-upload";
const PRIVACY = YOUTUBE_PRIVACY || "private"; // private / unlisted / public

// YouTube için ayrı OAuth client (Cloud project: bilgisok-youtube)
function getYouTubeAuth() {
  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: YOUTUBE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

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
    res.data.on("end", () => resolve()).on("error", reject).pipe(writeStream);
  });
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.baslik) throw new Error("Başlık yok!");
    
    console.log(`📌 Başlık: ${job.baslik}`);
    console.log(`🔒 Privacy: ${PRIVACY}`);
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    const driveAuth = getOAuthClient(); // Drive için (eski project)
    
    // 1. Video dosyasını bul ve indir
    console.log("📂 Video aranıyor...");
    const videoKlasorler = await driveAltKlasorBul("07-video", job.drive_folder_id);
    if (videoKlasorler.length === 0) throw new Error("07-video klasörü yok");
    
    const videolar = await driveKlasorIcerigi(videoKlasorler[0].id, driveAuth);
    const finalVideos = videolar.filter(v => v.name.startsWith("final-") && v.name.endsWith(".mp4"));
    
    if (finalVideos.length === 0) throw new Error("Final video bulunamadı!");
    
    // En son yüklenen
    const videoDosya = finalVideos.sort((a, b) => b.name.localeCompare(a.name))[0];
    console.log(`  ✓ Video: ${videoDosya.name} (${(parseInt(videoDosya.size) / 1024 / 1024).toFixed(1)}MB)`);
    
    const videoYol = path.join(TMP_DIR, "video.mp4");
    await driveIndir(videoDosya.id, videoYol, driveAuth);
    console.log(`  ✓ İndirildi`);
    
    // 2. Thumbnail bul ve indir (varsa)
    console.log("📂 Thumbnail aranıyor...");
    let thumbYol = null;
    
    const thumbKlasorler = await driveAltKlasorBul("05-thumbnail", job.drive_folder_id);
    if (thumbKlasorler.length > 0) {
      const thumbs = await driveKlasorIcerigi(thumbKlasorler[0].id, driveAuth);
      const thumbDosyalar = thumbs.filter(t => t.name.match(/\.(jpg|jpeg|png)$/i));
      
      if (thumbDosyalar.length > 0) {
        // İlk thumbnail'i kullan (thumbnail-1-*)
        const thumb = thumbDosyalar.sort((a, b) => a.name.localeCompare(b.name))[0];
        console.log(`  ✓ Thumbnail: ${thumb.name}`);
        thumbYol = path.join(TMP_DIR, "thumbnail.jpg");
        await driveIndir(thumb.id, thumbYol, driveAuth);
      }
    }
    
    if (!thumbYol) {
      console.log("  ⚠ Thumbnail bulunamadı, otomatik thumbnail kullanılacak");
    }
    
    // 3. YouTube'a yükle
    console.log("📤 YouTube'a yükleniyor...");
    const youtubeAuth = getYouTubeAuth();
    const youtube = google.youtube({ version: "v3", auth: youtubeAuth });
    
    // Başlık ":" ile ana ve alt'a ayrılmış olabilir, YouTube için tek satır kullan
    const fullTitle = job.baslik.length > 100 ? job.baslik.substring(0, 100) : job.baslik;
    
    // Açıklama: aciklama + footer
    let description = job.aciklama || "";
    description += "\n\n━━━━━━━━━━━━━━━━━━━━━━━\n";
    description += "📺 Kanalımıza abone olmayı unutmayın!\n";
    description += "🔔 Bildirim zilini açın\n";
    description += "👍 Videoyu beğendiyseniz like atın\n\n";
    description += "#tarih #antiktarih #belgesel #bilgisok";
    
    if (job.tarihi_donem) {
      description += `\n\nTarihi dönem: ${job.tarihi_donem}`;
    }
    
    // Tags: konudan üret
    const tags = ["tarih", "antik tarih", "belgesel", "bilgisok"];
    const konuKelimeler = (job.konu || "").split(/[\s,:\-]+/).filter(k => k.length > 3).slice(0, 5);
    tags.push(...konuKelimeler);
    
    console.log(`  Başlık: ${fullTitle}`);
    console.log(`  Tags: ${tags.join(", ")}`);
    console.log(`  Privacy: ${PRIVACY}`);
    
    const uploadBaslangic = Date.now();
    
    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: fullTitle,
          description: description,
          tags: tags,
          categoryId: "27", // Education kategorisi
          defaultLanguage: "tr",
          defaultAudioLanguage: "tr",
        },
        status: {
          privacyStatus: PRIVACY,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoYol),
      },
    });
    
    const uploadSure = ((Date.now() - uploadBaslangic) / 1000).toFixed(0);
    const videoId = uploadResponse.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`✅ Yüklendi: ${videoUrl}`);
    console.log(`   Süre: ${uploadSure}s`);
    
    // 4. Thumbnail ayarla (varsa)
    if (thumbYol) {
      try {
        console.log("🖼️ Thumbnail yükleniyor...");
        await youtube.thumbnails.set({
          videoId: videoId,
          media: {
            body: fs.createReadStream(thumbYol),
          },
        });
        console.log("  ✓ Thumbnail set edildi");
      } catch (e) {
        console.log(`  ⚠ Thumbnail set hatası: ${e.message}`);
        // Thumbnail başarısız olursa videoyu sil değil, devam
      }
    }
    
    // 5. Cleanup
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    
    // 6. Job'u güncelle
    await jobGuncelle(JOB_ID, { 
      video_status: `uploaded:${videoId}` 
    });
    
    // 7. Telegram'a bildir
    const privacyEmoji = {
      "public": "🌍 Yayında",
      "private": "🔒 Sadece sen",
      "unlisted": "🔗 Linki olanlar",
    }[PRIVACY];
    
    await telegram(
      job.chat_id,
      `📺 *Video YouTube'a yüklendi!* 🎉\n\n` +
      `📌 ${fullTitle}\n` +
      `${privacyEmoji}\n` +
      `⚡ Upload süresi: ${uploadSure}s\n\n` +
      `🔗 [Videoyu aç](${videoUrl})\n\n` +
      `${PRIVACY === "private" ? "_Videoyu kontrol edip elle yayına alabilirsin._" : ""}`
    );
    
    console.log("✅ YouTube upload tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { video_status: `upload-error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *08-YouTube Upload hatası:*\n\n${error.message.substring(0, 500)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
