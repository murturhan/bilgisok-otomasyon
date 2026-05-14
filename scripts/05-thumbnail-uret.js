/**
 * 05 - Thumbnail Üretimi v4 (Taşma garantili)
 */

import fs from "fs";
import sharp from "sharp";
import {
  jobOku,
  jobGuncelle,
  driveAltKlasorBul,
  driveDosyaYukle,
} from "./lib/google.js";
import { fluxCagri, getCfAccounts, delay } from "./lib/cloudflare.js";
import { telegram } from "./lib/telegram.js";

const { JOB_ID } = process.env;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Başlığı 1 veya 2 satıra böl (eşik: 6 karakter)
function basligiBol(baslik) {
  const trimmed = baslik.trim();
  if (trimmed.length <= 6) return [trimmed];
  
  const kelimeler = trimmed.split(/\s+/);
  
  // Tek kelime ama uzunsa ortadan böl
  if (kelimeler.length === 1) {
    const mid = Math.ceil(trimmed.length / 2);
    return [trimmed.substring(0, mid), trimmed.substring(mid)];
  }
  
  // İki+ kelime varsa en dengeli bölme
  const toplam = trimmed.length;
  let enIyiBolme = 1;
  let enKucukFark = Infinity;
  
  for (let i = 1; i < kelimeler.length; i++) {
    const ilkSatir = kelimeler.slice(0, i).join(" ");
    const ikinciSatir = kelimeler.slice(i).join(" ");
    const fark = Math.abs(ilkSatir.length - ikinciSatir.length);
    if (fark < enKucukFark) {
      enKucukFark = fark;
      enIyiBolme = i;
    }
  }
  
  return [
    kelimeler.slice(0, enIyiBolme).join(" "),
    kelimeler.slice(enIyiBolme).join(" "),
  ];
}

// Font boyutu - GÜVENLİ (sıkı sıkıştırılmış)
// Impact için karakter genişlik oranı yaklaşık 0.65-0.7
function fontBoyutuHesapla(satir, maxGenislik) {
  const oran = 0.70; // İmpact gerçek oranı
  for (let size = 130; size >= 40; size -= 5) {
    if (satir.length * size * oran <= maxGenislik) return size;
  }
  return 40;
}

function svgOverlayUret(baslik, altBaslik) {
  const satirlar = basligiBol(baslik);
  const altBaslikVar = altBaslik && altBaslik.trim().length > 0;
  
  // Sağ blok - daha sıkı kenar
  const BLOK_BASLANGIC_X = 640;
  const BLOK_GENISLIGI = 640;
  const BLOK_ORTA_X = BLOK_BASLANGIC_X + BLOK_GENISLIGI / 2;
  const KENAR_BOSLUK = 90;
  const MAX_METIN_GENISLIGI = BLOK_GENISLIGI - KENAR_BOSLUK * 2; // 460
  
  // En uzun satıra göre font boyutu - GÜVENLİ
  const enUzunSatir = satirlar.reduce((a, b) => a.length > b.length ? a : b);
  const baslikFontSize = fontBoyutuHesapla(enUzunSatir, MAX_METIN_GENISLIGI);
  const lineHeight = baslikFontSize * 1.05;
  
  const altFontSize = altBaslikVar 
    ? Math.min(fontBoyutuHesapla(altBaslik, MAX_METIN_GENISLIGI - 40), Math.floor(baslikFontSize * 0.5))
    : 0;
  
  // Toplam yükseklik
  const toplamBaslikYukseklik = satirlar.length * lineHeight;
  const altBaslikBosluk = altBaslikVar ? altFontSize + 40 : 0;
  const toplamYukseklik = toplamBaslikYukseklik + altBaslikBosluk;
  
  // Dikey ortalama
  const baslangicY = (720 - toplamYukseklik) / 2 + baslikFontSize * 0.9;
  
  // Ana başlık satırları
  const baslikTextElements = satirlar.map((satir, i) => {
    const y = baslangicY + i * lineHeight;
    return `<text x="${BLOK_ORTA_X}" y="${y}" 
            font-family="Impact, 'Arial Black', sans-serif" 
            font-size="${baslikFontSize}" 
            font-weight="900" 
            fill="#FFEB3B" 
            stroke="#000000" 
            stroke-width="${Math.max(5, baslikFontSize * 0.07)}" 
            paint-order="stroke fill"
            text-anchor="middle"
            letter-spacing="1"
            filter="url(#dropShadow)">${escapeXml(satir)}</text>`;
  }).join("\n");
  
  // Alt başlık (kırmızı şeritte)
  let altBaslikSvg = "";
  if (altBaslikVar) {
    const altY = baslangicY + toplamBaslikYukseklik + altFontSize * 0.6 + 10;
    const seritGenislik = Math.min(altBaslik.length * altFontSize * 0.75 + 50, MAX_METIN_GENISLIGI);
    altBaslikSvg = `
      <rect x="${BLOK_ORTA_X - seritGenislik/2}" y="${altY - altFontSize}" 
            width="${seritGenislik}" height="${altFontSize + 18}" 
            fill="#E50914" rx="6"/>
      <text x="${BLOK_ORTA_X}" y="${altY + 2}" 
            font-family="Impact, 'Arial Black', sans-serif" 
            font-size="${altFontSize}" 
            font-weight="900" 
            fill="#FFFFFF" 
            text-anchor="middle"
            letter-spacing="2">${escapeXml(altBaslik)}</text>`;
  }
  
  return `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rightBlock" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.0)"/>
        <stop offset="15%" style="stop-color:rgba(0,0,0,0.5)"/>
        <stop offset="40%" style="stop-color:rgba(0,0,0,0.85)"/>
        <stop offset="100%" style="stop-color:rgba(0,0,0,0.9)"/>
      </linearGradient>
      <filter id="dropShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
        <feOffset dx="8" dy="10" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.95"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    <rect x="${BLOK_BASLANGIC_X}" y="0" width="${BLOK_GENISLIGI}" height="720" fill="url(#rightBlock)"/>
    
    <rect x="${BLOK_BASLANGIC_X + 60}" y="60" width="120" height="6" fill="#FFEB3B"/>
    
    ${baslikTextElements}
    ${altBaslikSvg}
    
    <rect x="${BLOK_BASLANGIC_X + 60}" y="660" width="120" height="6" fill="#FFEB3B"/>
  </svg>`;
}

async function main() {
  try {
    console.log(`Job: ${JOB_ID}`);
    const job = await jobOku(JOB_ID);
    
    if (!job.thumbnail_prompt || !job.thumbnail_baslik) {
      throw new Error("thumbnail_prompt veya thumbnail_baslik boş!");
    }
    
    await jobGuncelle(JOB_ID, { thumbnail_status: "running" });
    
    const altKlasorler = await driveAltKlasorBul("05-thumbnail", job.drive_folder_id);
    if (altKlasorler.length === 0) throw new Error("05-thumbnail klasörü bulunamadı.");
    const thumbnailKlasorId = altKlasorler[0].id;
    
    const accounts = getCfAccounts();
    const aktifHesap = accounts[0];
    const altBaslik = job.thumbnail_alt_baslik || "";
    
    console.log(`Thumbnail: "${job.thumbnail_baslik}" | "${altBaslik}"`);
    const satirlar = basligiBol(job.thumbnail_baslik);
    console.log(`Satırlara bölündü: ${satirlar.join(" / ")}`);
    
    const svg = svgOverlayUret(job.thumbnail_baslik, altBaslik);
    
    let basariliSayisi = 0;
    
    for (let v = 0; v < 2; v++) {
      try {
        console.log(`Thumbnail varyantı ${v + 1}/2...`);
        const imageBuffer = await fluxCagri(job.thumbnail_prompt, aktifHesap, {
          width: 1280,
          height: 720,
        });
        
        const filename = `thumbnail-${String(v + 1).padStart(2, "0")}-${Date.now()}.jpg`;
        const filepath = `/tmp/${filename}`;
        
        await sharp(imageBuffer)
          .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
          .jpeg({ quality: 92 })
          .toFile(filepath);
        
        const stats = fs.statSync(filepath);
        console.log(`  ✓ ${v + 1}: ${(stats.size / 1024).toFixed(0)}KB`);
        
        await driveDosyaYukle({ filename, filepath }, thumbnailKlasorId, "image/jpeg");
        try { fs.unlinkSync(filepath); } catch (e) {}
        
        basariliSayisi++;
        
        if (v < 1) await delay(7000);
      } catch (e) {
        console.error(`  ✗ Thumbnail ${v + 1}: ${e.message}`);
      }
    }
    
    const status = basariliSayisi === 2 ? "completed" : "partial";
    await jobGuncelle(JOB_ID, { thumbnail_status: `${status}:${basariliSayisi}/2` });
    
    await telegram(job.chat_id, `🎯 *Thumbnail hazır:* ${basariliSayisi}/2`);
    
    console.log("✅ Thumbnail tamam.");
    process.exit(0);
    
  } catch (error) {
    console.error("HATA:", error.message);
    try {
      const job = await jobOku(JOB_ID);
      await jobGuncelle(JOB_ID, { thumbnail_status: `error: ${error.message.substring(0, 100)}` });
      await telegram(job.chat_id, `❌ *05-Thumbnail hatası:* ${error.message.substring(0, 300)}`);
    } catch (e) {}
    process.exit(1);
  }
}

main();
