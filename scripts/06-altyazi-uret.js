/**
 * 06 - Altyazı Üretimi v5 (PARÇA-BAZLI - kayma SIFIR)
 * - 03-seslendirme'nin yan dosya olarak yüklediği parca-bilgileri JSON'unu okur
 * - Her parçanın GERÇEK SÜRESİNİ kullanarak satırları o aralığa sıkıştırır
 * - Her parça için ayrı zamanlama → birikim olmaz
 * - 5-7 kelime per altyazı satırı
 * - Font 20 (küçük), MarginV 50
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
  driveDosyaYukle,
  getOAuthClient,
} from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const execAsync = promisify(exec);

const { JOB_ID } = process.env;
const TMP_DIR = "/tmp/altyazi";

const HEDEF_KELIME_PER_SATIR = 6;

async function driveKlasorIcerigi(klasorId, auth) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${klasorId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType)",
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

// Bir parçayı 5-7 kelimelik satırlara böl
function parcayiSatirlaraBol(parcaMetin, hedef = HEDEF_KELIME_PER_SATIR) {
  const cumleler = parcaMetin.match(/[^.!?…]+[.!?…]+/g) || [parcaMetin];
  const satirlar = [];
  
  for (const cumle of cumleler) {
    const kelimeler = cumle.trim().split(/\s+/).filter(k => k.length > 0);
    
    // Cümleyi hedef boyutta gruplara böl
    for (let i = 0; i < kelimeler.length; i += hedef) {
      let satir = kelimeler.slice(i, i + hedef).join(" ");
      
      // Eğer kalan kelimeler hedeften küçükse, önceki satıra ekle
      if (kelimeler.length - i < hedef && satirlar.length > 0 && i + hedef < kelimeler.length + 3) {
        // Olmasın, satır olarak ekle
        satirlar.push(satir);
      } else {
        satirlar.push(satir);
      }
    }
  }
  
  return satirlar.filter(s => s.length > 0);
}

function saniyeyiSrtZamaninaCevir(saniye) {
  if (saniye < 0) saniye = 0;
  const h = Math.floor(saniye / 3600);
  const m = Math.floor((saniye % 3600) / 60);
  const s = Math.floor(saniye % 60);
  const ms = Math.floor((saniye % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.senaryo) throw new Error("Senaryo boş!");
    
    await jobGuncelle(JOB_ID, { altyazi_status: "running" });
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    
    // 1. 02-ses klasöründen parca-bilgileri JSON'unu indir
    console.log("📂 Parça bilgileri aranıyor...");
    const oauthAuth = getOAuthClient();
    
    const sesKlasorler = await driveAltKlasorBul("02-ses", job.drive_folder_id);
    if (sesKlasorler.length === 0) throw new Error("02-ses klasörü yok");
    
    const sesDosyalar = await driveKlasorIcerigi(sesKlasorler[0].id, oauthAuth);
    
    // En son parca-bilgileri JSON'u bul
    const parcaJsonlar = sesDosyalar.filter(d => d.name.startsWith("parca-bilgileri-") && d.name.endsWith(".json"));
    
    if (parcaJsonlar.length === 0) {
      throw new Error("parca-bilgileri JSON'u bulunamadı. 03-seslendirme'nin güncel versiyonu çalışmamış olabilir.");
    }
    
    // En sondaki (en yeni) JSON
    const parcaJson = parcaJsonlar.sort((a, b) => b.name.localeCompare(a.name))[0];
    console.log(`  ✓ ${parcaJson.name}`);
    
    const parcaJsonYol = path.join(TMP_DIR, "parca-bilgileri.json");
    await driveIndir(parcaJson.id, parcaJsonYol, oauthAuth);
    
    const parcaData = JSON.parse(fs.readFileSync(parcaJsonYol, "utf-8"));
    console.log(`📊 ${parcaData.parcalar.length} parça, toplam süre: ${parcaData.toplam_sure.toFixed(2)}s`);
    
    // 2. Her parça için altyazı satırları üret
    const srtBlocks = [];
    let satirIndex = 0;
    let mevcutZaman = 0;
    
    for (let p = 0; p < parcaData.parcalar.length; p++) {
      const parca = parcaData.parcalar[p];
      const parcaBaslangic = mevcutZaman;
      const parcaBitis = mevcutZaman + parca.sure;
      
      // Parçayı satırlara böl
      const satirlar = parcayiSatirlaraBol(parca.metin, HEDEF_KELIME_PER_SATIR);
      
      // Her satıra kelime sayısı oranlı süre ver (parça içinde)
      const kelimeSayilari = satirlar.map(s => s.split(/\s+/).length);
      const toplamKelime = kelimeSayilari.reduce((a, b) => a + b, 0);
      const sanePerKelime = parca.sure / toplamKelime;
      
      let parcaIciZaman = parcaBaslangic;
      
      for (let s = 0; s < satirlar.length; s++) {
        const sure = kelimeSayilari[s] * sanePerKelime;
        const baslangic = parcaIciZaman;
        let bitis = parcaIciZaman + sure;
        
        // Son satır ise parça sınırını aşma
        if (s === satirlar.length - 1) {
          bitis = parcaBitis;
        }
        
        // Minimum 1 saniye
        if (bitis - baslangic < 1.0) {
          bitis = Math.min(baslangic + 1.0, parcaBitis);
        }
        
        satirIndex++;
        srtBlocks.push(
          `${satirIndex}\n${saniyeyiSrtZamaninaCevir(baslangic)} --> ${saniyeyiSrtZamaninaCevir(bitis)}\n${satirlar[s]}\n`
        );
        
        parcaIciZaman = bitis;
      }
      
      console.log(`  Parça ${p + 1}: ${satirlar.length} satır, ${parca.sure.toFixed(1)}s`);
      mevcutZaman = parcaBitis;
    }
    
    console.log(`📝 Toplam ${satirIndex} altyazı satırı, ${mevcutZaman.toFixed(2)}s`);
    
    // 3. SRT'yi kaydet
    const srtIcerik = srtBlocks.join("\n");
    const srtAdi = `altyazi-${Date.now()}.srt`;
    const srtYol = path.join(TMP_DIR, srtAdi);
    fs.writeFileSync(srtYol, srtIcerik, "utf-8");
    
    console.log(`✓ SRT yazıldı: ${(fs.statSync(srtYol).size / 1024).toFixed(1)}KB`);
    
    // 4. Drive'a yükle
    let altyaziKlasorler = await driveAltKlasorBul("06-altyazi", job.drive_folder_id);
    let altyaziKlasorId;
    
    if (altyaziKlasorler.length === 0) {
      const drive = google.drive({ version: "v3", auth: oauthAuth });
      const res = await drive.files.create({
        requestBody: {
          name: "06-altyazi",
          mimeType: "application/vnd.google-apps.folder",
          parents: [job.drive_folder_id],
        },
        fields: "id",
      });
      altyaziKlasorId = res.data.id;
    } else {
      altyaziKlasorId = altyaziKlasorler[0].id;
    }
    
    await driveDosyaYukle({ filename: srtAdi, filepath: srtYol }, altyaziKlasorId, "text/plain");
    
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    
    await jobGuncelle(JOB_ID, { altyazi_status: `completed:${satirIndex}satır` });
    await telegram(job.chat_id, `📝 *Altyazı hazır* (parça-bazlı, ${satirIndex} satır)`);
    
    console.log("✅ Altyazı tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    console.error(error.stack);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { altyazi_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *06-Altyazı hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
