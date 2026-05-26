/**
 * Ortak Google kütüphanesi: Service Account (her şey: Sheets + Drive read/write)
 *
 * OAuth artık kullanılmıyor. Drive klasörleri service account ile paylaşıldığı
 * için her şey SA üzerinden çalışır. OAuth client kod hala duruyor ama referans yok.
 */
import { google } from "googleapis";
import fs from "fs";

const {
  GDRIVE_SERVICE_ACCOUNT_JSON,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN,
  GSHEETS_SPREADSHEET_ID,
  GDRIVE_FOLDER_ID,
} = process.env;

// ─── AUTH ─────────────────────────────────────────────────────
export function getServiceAccountAuth() {
  const credentials = JSON.parse(GDRIVE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive", // ⚠ TAM YETKİ (eski: drive.readonly)
    ],
  });
}

// OAuth eski kod - artık kullanılmıyor ama export kalsın (legacy script uyumu)
export function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN,
  });
  return oauth2Client;
}

// ─── CLIENTS ──────────────────────────────────────────────────
export function getSheets() {
  return google.sheets({ version: "v4", auth: getServiceAccountAuth() });
}

// ⚠ KRİTİK DEĞİŞİKLİK: Service Account kullan, OAuth değil
export function getDrive() {
  return google.drive({ version: "v3", auth: getServiceAccountAuth() });
}

// ─── KONU HAVUZU ──────────────────────────────────────────────
export async function konuHavuzundanAl(tarih, index) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: "konu_havuzu!A:C",
  });
  
  const rows = res.data.values || [];
  const aranan = String(tarih).trim().toLowerCase();
  
  const matching = [];
  for (let i = 1; i < rows.length; i++) {
    const satirTarih = String(rows[i][1] || "").trim().toLowerCase();
    if (satirTarih === aranan) {
      matching.push({ rowIndex: i + 1, konu: rows[i][0] });
    }
  }
  
  const idx = parseInt(index);
  if (idx < 0 || idx >= matching.length) {
    throw new Error(`Geçersiz index ${idx}, ${matching.length} konu var.`);
  }
  
  return matching[idx].konu;
}

// ─── JOB STATE ────────────────────────────────────────────────
// job_state kolonları:
// A=job_id, B=tarih, C=index, D=konu, E=baslik, F=thumb_baslik, G=thumb_prompt,
// H=senaryo, I=aciklama, J=gorsel_prompts, K=klip_prompts, L=pexels_kw,
// M=drive_folder_id, N=gorsel_status, O=ses_status, P=stok_status, Q=thumb_status,
// R=created_at, S=updated_at, T=chat_id, U=klip_klasor_id, V=thumb_alt_baslik,
// W=altyazi_status, X=video_status, Y=muzik_mood, Z=tts_telaffuz
const JOB_STATE_RANGE = "job_state!A:Z";

export async function jobOlustur(jobData) {
  const sheets = getSheets();
  const now = new Date().toISOString();
  
  const row = [
    jobData.job_id,
    jobData.tarih,
    String(jobData.index),
    jobData.konu,
    jobData.baslik || "",
    jobData.thumbnail_baslik || "",
    jobData.thumbnail_prompt || "",
    jobData.senaryo || "",
    jobData.aciklama || "",
    JSON.stringify(jobData.ai_gorsel_prompts || []),
    JSON.stringify(jobData.ai_klip_prompts || []),
    JSON.stringify(jobData.pexels_anahtar_kelimeler || []),
    jobData.drive_folder_id || "",
    "pending",
    "pending",
    "pending",
    "pending",
    now,
    now,
    String(jobData.chat_id || ""),
    jobData.klip_klasor_id || "",
    jobData.thumbnail_alt_baslik || "",
    "",
    "",
    jobData.muzik_mood || "epic",
    jobData.tts_telaffuz || "",
  ];
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: JOB_STATE_RANGE,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
  
  console.log(`Job kaydedildi: ${jobData.job_id}`);
}

export async function jobOku(jobId) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: JOB_STATE_RANGE,
  });
  
  const rows = res.data.values || [];
  let found = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === jobId) {
      found = {
        rowIndex: i + 1,
        job_id: rows[i][0],
        tarih: rows[i][1],
        index: rows[i][2],
        konu: rows[i][3],
        baslik: rows[i][4],
        thumbnail_baslik: rows[i][5],
        thumbnail_prompt: rows[i][6],
        senaryo: rows[i][7],
        aciklama: rows[i][8],
        ai_gorsel_prompts: JSON.parse(rows[i][9] || "[]"),
        ai_klip_prompts: JSON.parse(rows[i][10] || "[]"),
        pexels_anahtar_kelimeler: JSON.parse(rows[i][11] || "[]"),
        drive_folder_id: rows[i][12],
        gorsel_status: rows[i][13],
        ses_status: rows[i][14],
        stok_status: rows[i][15],
        thumbnail_status: rows[i][16],
        created_at: rows[i][17],
        updated_at: rows[i][18],
        chat_id: rows[i][19],
        klip_klasor_id: rows[i][20] || "",
        thumbnail_alt_baslik: rows[i][21] || "",
        altyazi_status: rows[i][22] || "",
        video_status: rows[i][23] || "",
        muzik_mood: rows[i][24] || "epic",
        tts_telaffuz: rows[i][25] || "",
      };
    }
  }

  if (found) return found;
  throw new Error(`Job bulunamadı: ${jobId}`);
}

export async function jobGuncelle(jobId, updates) {
  const sheets = getSheets();
  const job = await jobOku(jobId);
  const rowIndex = job.rowIndex;
  
  const kolonHaritasi = {
    drive_folder_id: 12,
    gorsel_status: 13,
    ses_status: 14,
    stok_status: 15,
    thumbnail_status: 16,
    updated_at: 18,
    klip_klasor_id: 20,
    thumbnail_alt_baslik: 21,
    altyazi_status: 22,
    video_status: 23,
    muzik_mood: 24,
    tts_telaffuz: 25,
  };
  
  const updates2 = { ...updates, updated_at: new Date().toISOString() };
  
  for (const [key, value] of Object.entries(updates2)) {
    if (!(key in kolonHaritasi)) continue;
    const colIdx = kolonHaritasi[key];
    const colLetter = colIdx < 26 
      ? String.fromCharCode(65 + colIdx)
      : "A" + String.fromCharCode(65 + (colIdx - 26));
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: GSHEETS_SPREADSHEET_ID,
      range: `job_state!${colLetter}${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    });
  }
}

// ─── DRIVE OPERATIONS (artık SA ile) ──────────────────────────
export async function driveKlasorAc(ad, parentId) {
  // ⚠ SA quota yok, OAuth kullan
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  const res = await drive.files.create({
    requestBody: {
      name: ad,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId || GDRIVE_FOLDER_ID],
    },
    fields: "id, name, webViewLink",
  });
  return { id: res.data.id, name: res.data.name, link: res.data.webViewLink };
}

export async function driveAltKlasorBul(adKismi, parentId) {
  const drive = getDrive();
  const q = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and name contains '${adKismi.replace(/'/g, "\\'")}' and trashed=false`;
  const res = await drive.files.list({
    q: q,
    fields: "files(id, name, webViewLink)",
    pageSize: 10,
  });
  return res.data.files || [];
}

export async function driveDosyaYukle(dosya, parentId, mimeType) {
  // ⚠ Service Account'un storage quota yok, upload için OAuth kullan
  // OAuth murturhan3@ olarak çalışır, klasör murturhan3@'a paylaşıldı
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  const res = await drive.files.create({
    requestBody: {
      name: dosya.filename,
      parents: [parentId],
    },
    media: {
      mimeType: mimeType,
      body: fs.createReadStream(dosya.filepath),
    },
    fields: "id, name, webViewLink",
  });
  return { drive_id: res.data.id, filename: res.data.name, link: res.data.webViewLink };
}
