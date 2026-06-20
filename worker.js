// REV 058/20JUN26 - emoji picker bayrak tab (twemoji, 249 ulke)
/**
 * Cloudflare Worker — telegram-to-github
 *
 * Storage: GitHub Issues (GITHUB_TOKEN kullanır, KV gerekmez)
 *
 * Rotalar:
 *   POST /                         → Telegram webhook
 *   POST /api/job/:id              → Job verisini GitHub Issue'ya yaz
 *   GET  /?job=ID&stage=1          → İçerik Onay sayfası (YENİ Parça 2)
 *   GET  /?job=ID                  → Görsel Onay sayfası (mevcut, stage=2)
 *   POST /api/icerik-onay/:id      → İçerik onay kaydet + dispatch (YENİ)
 *   POST /api/upload-medya/:id/... → Medya Drive'a yükle (YENİ)
 *   POST /api/submit/:id           → Görsel form submit → edits yaz + dispatch
 *   GET  /api/edits/:id            → Editleri dön (02.7 için)
 *   GET  /api/random-surprise-box  → WYR için random kutu PNG URL'si
 *
 * Secrets: GITHUB_TOKEN, TELEGRAM_BOT_TOKEN, GDRIVE_SERVICE_ACCOUNT_JSON
 */

const REPO_OWNER = "murturhan";
const REPO_NAME  = "bilgisok-otomasyon";

// Görsel stil tanımları — gorsel-stilleri.js ile senkron tutulmalı
const GORSEL_STILLERI_WORKER = [
  { v: "pixar_3d",  l: "🎨 Pixar 3D" },
  { v: "realistik", l: "📷 Realistik" },
  { v: "anime",     l: "🌸 Anime" },
  { v: "karikatur", l: "🖌️ Karikatür" },
  { v: "suluboya",  l: "💧 Suluboya" },
  { v: "karakalem", l: "✏️ Karakalem" },
];

function stilOptsServer(selected) {
  const sel = selected || "pixar_3d";
  return GORSEL_STILLERI_WORKER.map(s =>
    `<option value="${s.v}"${sel === s.v ? " selected" : ""}>${s.l}</option>`
  ).join("");
}

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const method = request.method;
    const path   = url.pathname;

    if (method === "POST" && path.startsWith("/api/job/")) {
      return handleStoreJob(request, env, url);
    }
    if (method === "GET" && path.startsWith("/api/edits/")) {
      return handleGetEdits(request, env, url);
    }
    if (method === "GET" && path.startsWith("/api/emojis")) {
      return handleGetEmojis(request, env, url);
    }
    if (method === "GET" && path.startsWith("/api/random-surprise-box")) {
      return handleRandomSurpriseBox(request, env, url);
    }
    if (method === "POST" && path.startsWith("/api/submit/")) {
      return handleSubmit(request, env, url, ctx);
    }
    if (method === "GET" && path === "/test-upload") {
      return new Response(`<!DOCTYPE html><html><head><meta charset=UTF-8><title>Upload Test</title></head><body style="background:#111827;color:#f3f4f6;font-family:system-ui;padding:40px">
<h2>📁 FileReader Önizleme Testi</h2>
<p style="color:#9ca3af;margin:8px 0 20px">Resim seç — anında önizleme görünmeli:</p>
<input type="file" id="tf" accept="image/*" style="position:fixed;top:-9999px;left:-9999px;width:1px;height:1px" onchange="go(this)">
<button onclick="document.getElementById('tf').click()" style="display:inline-block;padding:8px 16px;background:#3b82f6;color:#fff;border-radius:6px;cursor:pointer;border:none">📁 Dosya Seç</button>
<div id="prev" style="margin-top:16px;min-height:100px;background:#1f2937;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:.85em">Buraya önizleme gelecek</div>
<div id="log" style="margin-top:12px;font-size:.8em;color:#9ca3af"></div>
<script>
function go(inp){
  var file=inp.files[0];
  document.getElementById('log').textContent='Dosya: '+file.name+' ('+file.size+' byte)';
  var reader=new FileReader();
  reader.onload=function(e){document.getElementById('prev').innerHTML='<img src="'+e.target.result+'" style="max-height:200px;border-radius:6px">';};
  reader.onerror=function(){document.getElementById('log').textContent='FileReader HATA';};
  reader.readAsDataURL(file);
}
</script></body></html>`, {headers:{'Content-Type':'text/html;charset=utf-8'}});
    }
    if (method === "POST" && path.startsWith("/api/icerik-onay/")) {
      return handleIcerikOnay(request, env, url, ctx);
    }
    if (method === "POST" && path.startsWith("/api/upload-medya/")) {
      return handleUploadMedya(request, env, url);
    }
    if (method === "GET" && path === "/uret-form") {
      return handleUretForm(request, env, url);
    }
    if (method === "POST" && path === "/uret-form-submit") {
      return handleUretFormSubmit(request, env, ctx);
    }
    if (method === "GET" && url.searchParams.has("job")) {
      const stage = url.searchParams.get("stage");
      if (stage === "1") return handleContentApprovalPage(request, env, url);
      return handleApprovalPage(request, env, url);
    }
    if (method === "POST") {
      return handleTelegram(request, env, ctx);
    }
    return new Response("GeniMini Tests Worker", { status: 200 });
  },
};

// ─── GitHub Issues storage ────────────────────────────────────

const GH_API = "https://api.github.com";

function ghHeaders(env) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "geniminitests-worker",
  };
}

async function issueBul(jobId, env) {
  const r = await fetch(
    `${GH_API}/search/issues?q=repo:${REPO_OWNER}/${REPO_NAME}+is:issue+in:title+worker-job:${jobId}&per_page=1`,
    { headers: ghHeaders(env) }
  );
  if (!r.ok) return null;
  const d = await r.json();
  return d.items?.[0] || null;
}

async function issueOlustur(jobId, icerik, env) {
  const r = await fetch(
    `${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: "POST",
      headers: ghHeaders(env),
      body: JSON.stringify({
        title: `worker-job:${jobId}`,
        body: JSON.stringify(icerik),
      }),
    }
  );
  return await r.json();
}

async function issueGuncelle(number, icerik, env) {
  await fetch(
    `${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues/${number}`,
    {
      method: "PATCH",
      headers: ghHeaders(env),
      body: JSON.stringify({ body: JSON.stringify(icerik) }),
    }
  );
}

async function issueVeriOku(jobId, env) {
  const issue = await issueBul(jobId, env);
  if (!issue) return null;
  // GitHub search API body truncates — tam içeriği çek
  const r = await fetch(
    `${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}`,
    { headers: ghHeaders(env) }
  );
  if (!r.ok) return null;
  const full = await r.json();
  try { return { number: full.number, data: JSON.parse(full.body) }; }
  catch { return null; }
}

// ─── POST /api/job/:id ─────────────────────────────────────────
async function handleStoreJob(request, env, url) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.GITHUB_TOKEN || auth !== `Bearer ${env.GITHUB_TOKEN}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const jobId = url.pathname.split("/").pop();
  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const mevcut = await issueVeriOku(jobId, env);
  const icerik = { job: data, edits: mevcut?.data?.edits || {} };

  if (mevcut) {
    await issueGuncelle(mevcut.number, icerik, env);
  } else {
    await issueOlustur(jobId, icerik, env);
  }
  return json({ ok: true });
}

// ─── GET /api/edits/:id ────────────────────────────────────────
async function handleGetEdits(request, env, url) {
  const jobId = url.pathname.split("/").pop();
  const mevcut = await issueVeriOku(jobId, env);
  return json(mevcut?.data?.edits || {});
}

// ─── GET /api/emojis ──────────────────────────────────────────
async function handleGetEmojis(request, env, url) {
  const folderId = env.GDRIVE_EMOJI_FOLDER_ID || "";
  const saJson   = env.GDRIVE_SERVICE_ACCOUNT_JSON || "";
  if (!folderId) return json({ ok: false, error: "GDRIVE_EMOJI_FOLDER_ID secret eksik" });
  if (!saJson)   return json({ ok: false, error: "GDRIVE_SERVICE_ACCOUNT_JSON secret eksik (Worker secret olarak eklenmeli)" });

  let accessToken;
  try {
    accessToken = await getGDriveToken(saJson);
  } catch (e) {
    return json({ ok: false, error: "SA token hatası: " + e.message });
  }

  const q      = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,thumbnailLink,mimeType)");
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&orderBy=name`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    if (!r.ok) {
      const txt = await r.text();
      return json({ ok: false, error: `Drive API ${r.status}`, detail: txt.substring(0, 200) });
    }
    const data = await r.json();
    const files = (data.files || []).map(f => ({
      id:    f.id,
      name:  f.name.replace(/\.(svg|png|jpg|webp)$/i, ""),
      thumb: f.thumbnailLink || `https://drive.google.com/thumbnail?id=${f.id}&sz=w64`,
    }));
    return json({ ok: true, files });
  } catch (e) {
    return json({ ok: false, error: e.message });
  }
}

// ─── GET /api/random-surprise-box ─────────────────────────────
async function handleRandomSurpriseBox(request, env, url) {
  const folderId = env.GDRIVE_SURPRISE_BOX_FOLDER_ID || "";
  const saJson   = env.GDRIVE_SERVICE_ACCOUNT_JSON || "";
  if (!folderId) return json({ ok: false, error: "GDRIVE_SURPRISE_BOX_FOLDER_ID secret eksik (Worker secrets'a ekle)" });
  if (!saJson)   return json({ ok: false, error: "GDRIVE_SERVICE_ACCOUNT_JSON secret eksik" });

  let accessToken;
  try {
    accessToken = await getGDriveToken(saJson);
  } catch (e) {
    return json({ ok: false, error: "SA token hatası: " + e.message });
  }

  const q      = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name)");
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    if (!r.ok) {
      const txt = await r.text();
      return json({ ok: false, error: `Drive API ${r.status}`, detail: txt.substring(0, 200) });
    }
    const data = await r.json();
    const pngs = (data.files || []).filter(f => /\.png$/i.test(f.name));
    if (!pngs.length) return json({ ok: false, error: "05-Surprise-Box klasörü boş veya PNG yok" });
    const chosen = pngs[Math.floor(Math.random() * pngs.length)];
    const imageUrl = `https://drive.google.com/thumbnail?id=${chosen.id}&sz=w800`;
    return json({ ok: true, url: imageUrl, file_id: chosen.id, name: chosen.name });
  } catch (e) {
    return json({ ok: false, error: e.message });
  }
}

// Service Account JWT → Google OAuth2 access token (Web Crypto API, no deps)
async function getGDriveToken(saJson) {
  const sa  = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  const b64url = s => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));

  const sigInput = `${header}.${payload}`;

  // PEM → DER (pkcs8)
  const pem    = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const derBuf = Uint8Array.from(atob(pem), c => c.charCodeAt(0)).buffer;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", derBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(sigInput)
  );

  let sigStr = "";
  new Uint8Array(sigBuf).forEach(b => { sigStr += String.fromCharCode(b); });
  const jwt = `${sigInput}.${b64url(sigStr)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt,
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`${tokenRes.status} ${t.substring(0, 200)}`);
  }
  const td = await tokenRes.json();
  if (!td.access_token) throw new Error("access_token yok: " + JSON.stringify(td).substring(0, 200));
  return td.access_token;
}

// ─── POST /api/submit/:id ──────────────────────────────────────
async function handleSubmit(request, env, url, ctx) {
  const jobId = url.pathname.split("/").pop();
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const { edits = {}, approval_level = "full", chat_id = "" } = body;

  const mevcut = await issueVeriOku(jobId, env);
  if (mevcut) {
    const yeni = { job: mevcut.data?.job || {}, edits };
    await issueGuncelle(mevcut.number, yeni, env);
  }

  ctx.waitUntil(githubDispatch("degisiklik_uygula", {
    job_id: jobId,
    chat_id: String(chat_id),
    approval_level,
  }, env));

  return json({ ok: true });
}

// ─── GET /?job=ID — Onay Sayfası ──────────────────────────────
async function handleApprovalPage(request, env, url) {
  const jobId = url.searchParams.get("job") || "";
  if (!jobId) return new Response("job parametresi eksik", { status: 400 });

  const mevcut = await issueVeriOku(jobId, env);
  if (!mevcut || !mevcut.data?.job) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:system-ui;background:#1a1a2e;color:#eee;padding:32px">
      <h2>❌ Job bulunamadı</h2><p>Job ID: <code>${esc(jobId)}</code></p>
      <p>02.5-onay-tetikle henüz çalışmadı veya veri yok.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html;charset=utf-8" } }
    );
  }

  const job = mevcut.data.job;
  const { topic = "", format = "", baslik = "", questions = [], chat_id = "", topic_emojis = [] } = job;
  const qCards = questions.map((q, i) =>
    q.question_type === "would_you_rather" ? buildWyrCard(q, i) : buildQuestionCard(q, i)
  ).join("\n");

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Onay: ${esc(jobId)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#111827;color:#f3f4f6;padding:0 0 40px}
.topbar{background:#1f2937;padding:12px 16px;position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #374151}
.topbar h1{font-size:1em;font-weight:700;color:#fff}
.topbar .meta{font-size:.75em;color:#9ca3af}
.sticky-btns{display:flex;gap:6px;flex-wrap:wrap}
.sticky-btns button{padding:7px 11px;border:none;border-radius:6px;font-weight:700;font-size:.78em;cursor:pointer;line-height:1.3;text-align:left}
.b1{background:#10b981;color:#fff}
.b2{background:#0ea5e9;color:#fff}
.b3{background:#6b7280;color:#fff}
.b4{background:#4b5563;color:#fff}
.b5{background:#f59e0b;color:#000}
button:hover{opacity:.88}
.cards{padding:12px 16px}
.card{background:#1f2937;border-radius:10px;padding:14px;margin-bottom:16px;border:1px solid #374151}
.card-num{display:inline-block;background:#e94560;color:#fff;border-radius:6px;padding:2px 10px;font-size:.8em;font-weight:700;margin-bottom:10px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}
.img-box{position:relative;background:#111827;border-radius:8px;overflow:hidden;height:90px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.img-box img{max-height:90px;max-width:100%;width:auto;object-fit:contain;display:block;border-radius:8px;transition:.2s}
.img-box:hover img{opacity:.85}
.img-box .no-img{color:#6b7280;font-size:.75em;text-align:center;padding:12px}
.emoji-row{display:flex;gap:8px;margin:6px 0;flex-wrap:wrap;align-items:flex-start}
.emoji-cell{display:flex;flex-direction:column;align-items:center;position:relative}
.emoji-pick-btn{width:56px;height:56px;font-size:2em;background:#1f2937;border:2px solid #4b5563;border-radius:12px;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:border-color .15s,background .15s}
.emoji-pick-btn:hover,.emoji-pick-btn:active{border-color:#3b82f6;background:#111827}
.emoji-edit-inp{width:56px;height:56px;text-align:center;font-size:2em;padding:0;background:#111827;border:2px solid #3b82f6;border-radius:12px;color:#fff;display:none}
.emoji-edit-inp:focus{outline:none}
.emoji-hint{font-size:.68em;color:#6b7280;display:block;text-align:center;margin-top:3px;pointer-events:none}
.img-actions{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
.btn-sm{padding:5px 10px;border:1px solid #4b5563;background:#374151;color:#d1d5db;border-radius:5px;font-size:.78em;cursor:pointer;transition:transform 0.08s,box-shadow 0.08s}
.btn-sm:hover{background:#4b5563}
.btn-sm:active{transform:scale(0.93)!important;box-shadow:inset 0 2px 5px rgba(0,0,0,0.5)!important}
.btn-upload{border-color:#3b82f6;color:#93c5fd}
.btn-regen{border-color:#f59e0b;color:#fcd34d}
input[type=file]{position:absolute;width:0;height:0;opacity:0;overflow:hidden;pointer-events:none}
label.lbl{display:block;color:#9ca3af;font-size:.75em;margin:8px 0 3px}
textarea,input[type=text],select{width:100%;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:6px;padding:7px 9px;font-size:.88em;resize:vertical;font-family:inherit}
textarea{min-height:56px}
.opts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.preview-badge{position:absolute;bottom:4px;right:4px;background:#10b981;color:#fff;font-size:.7em;padding:2px 6px;border-radius:4px}
#status{margin:12px 16px;padding:12px 16px;border-radius:8px;display:none;font-weight:600}
.ok{background:#064e3b;color:#6ee7b7}
.err{background:#7f1d1d;color:#fca5a5}
.q-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
.q-text{flex:1;min-height:56px}
.opts-list{display:flex;flex-direction:row;gap:5px;margin-bottom:8px}
.opt-row{flex:1;min-width:0;display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:6px;background:#111827;border:1px solid #374151}
.opt-row.opt-correct{border-color:#10b981;background:#022c22}
.opt-lbl{font-weight:700;color:#9ca3af;font-size:.85em;min-width:16px;text-align:center;flex-shrink:0}
.opt-row input[type=text]{flex:1;margin:0;min-width:0}
.correct-btn{padding:3px 6px;border:1px solid #374151;background:#374151;color:#6b7280;border-radius:4px;font-size:.72em;cursor:pointer;white-space:nowrap;flex-shrink:0}
.correct-btn.is-correct{background:#064e3b;color:#6ee7b7;border-color:#10b981;font-weight:700}
.correct-btn:hover{background:#4b5563;color:#d1d5db}
#emoji-picker-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;align-items:center;justify-content:center}
.picker-inner{background:#1f2937;border-radius:12px;padding:14px;width:92%;max-width:440px;max-height:80vh;display:flex;flex-direction:column;gap:10px;border:1px solid #374151}
.picker-tabs{display:flex;gap:6px}
.tab-btn{padding:5px 12px;border:1px solid #374151;background:#374151;color:#d1d5db;border-radius:6px;cursor:pointer;font-size:.8em}
.tab-btn.active-tab{background:#3b82f6;color:#fff;border-color:#2563eb}
.picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:5px;padding:4px 0}
.e-btn{width:44px;height:44px;font-size:1.6em;background:#111827;border:1px solid #374151;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1}
.e-btn:hover{border-color:#3b82f6;background:#1e3a5f}
</style>
</head>
<body>
<div class="topbar">
  <div>
    <div class="topbar h1">🦊 GeniMini — Onay</div>
    <div class="topbar meta">${esc(jobId)} · ${esc(format)} · ${questions.length} soru · ${esc(topic)}</div>
  </div>
  <div class="sticky-btns">
    <button type="button" class="b1" onclick="submit_('full',true)">✅ Değiştir<br>+ Ses + Render</button>
    <button type="button" class="b2" onclick="submit_('render_only',true)">🎬 Değiştir<br>+ Sadece Render</button>
    <button type="button" class="b3" onclick="submit_('full',false)">▶ Ses + Render<br>(değişiklik yok)</button>
    <button type="button" class="b4" onclick="submit_('render_only',false)">⚡ Sadece Render<br>(değişiklik yok)</button>
    <button type="button" class="b5" onclick="submit_('regen_only',true)">🔄 Değiştir<br>+ Tekrar Göster</button>
  </div>
</div>
<div id="status"></div>
<form id="frm" onsubmit="return false" class="cards">
${topic_emojis.length ? `<div class="card" style="padding:10px 14px">
  <span style="font-size:.75em;color:#9ca3af">🎨 Intro Emojileri (videoda başlık altında görünür)</span>
  <div class="emoji-row" style="margin-top:8px">${topic_emojis.map((e,i)=>`<div class="emoji-cell"><button type="button" class="emoji-pick-btn" id="te_${i}_btn" onclick="editEmoji('te_${i}')">${esc(e)||"❓"}</button><input type="text" class="emoji-edit-inp" id="te_${i}" value="${esc(e)}" maxlength="8"><span class="emoji-hint">Değiştir</span></div>`).join("")}</div>
</div>` : ""}
${qCards}
</form>
<div id="emoji-picker-modal">
  <div class="picker-inner">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="picker-tabs">
        <button type="button" class="tab-btn active-tab" id="tab-fluent" onclick="switchPickerTab('fluent')">🌈 Fluent Emoji</button>
        <button type="button" class="tab-btn" id="tab-drive" onclick="switchPickerTab('drive')">📁 Özel Emojiler</button>
        <button type="button" class="tab-btn" id="tab-bayrak" onclick="switchPickerTab('bayrak')">🏳️ Bayraklar</button>
      </div>
      <button type="button" onclick="closeEmojiPicker()" style="background:none;border:none;color:#9ca3af;font-size:1.3em;cursor:pointer;padding:2px 6px">✕</button>
    </div>
    <input id="fluent-search" type="text" placeholder="ara: fox, pizza, flag..." style="width:100%;box-sizing:border-box;padding:6px 10px;background:#111827;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.85em;outline:none" oninput="_searchFluent()">
    <input id="bayrak-search" type="text" placeholder="Ülke ara..." style="display:none;width:100%;box-sizing:border-box;padding:6px 10px;background:#111827;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.85em;outline:none" oninput="_searchBayrak()">
    <div id="picker-fluent" style="overflow-y:auto;max-height:48vh"></div>
    <div id="picker-drive" style="display:none;overflow-y:auto;max-height:48vh"></div>
    <div id="picker-bayrak" style="display:none;overflow-y:auto;max-height:48vh"></div>
  </div>
</div>
<script>window.addEventListener('error',function(e){var s=document.getElementById('status');if(s){s.style.display='block';s.className='err';s.textContent='JS Hatası: '+e.message+' (satır:'+e.lineno+')';}});</script>
<script>
const JOB_ID = ${JSON.stringify(jobId)};
const CHAT_ID = ${JSON.stringify(String(chat_id))};
const N = ${questions.length};
const QUESTIONS = ${JSON.stringify(questions).replace(/<\//g, '<\\/')};
const customImages = {};
const customVideos = {};
const s1VideoUrls = {};

function val(id){const e=document.getElementById(id);return e?e.value:"";}
function chk(id){const e=document.getElementById(id);return e?e.checked:false;}

function handleFileChange(inp,previewId,key,isVideo){
  var file=inp.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    if(isVideo){
      customVideos[key]=e.target.result;
      var mb=(file.size/1024/1024).toFixed(1);
      document.getElementById(previewId).innerHTML='<div style="background:#0a1f12;border-radius:8px;padding:10px;color:#10b981;font-size:.82em;text-align:center">🎬 '+file.name.substring(0,24)+'<br><span style="color:#6b7280">'+mb+'MB</span></div><span class="preview-badge">✓ Video</span><button type="button" data-p="'+previewId+'" data-k="'+key+'" onclick="clearMediaStage2(this.dataset.p,this.dataset.k,true)" style="display:block;margin-top:4px;padding:3px 8px;background:transparent;border:1px solid #ef4444;color:#fca5a5;border-radius:4px;font-size:.75em;cursor:pointer">❌ Kaldır</button>';
    }else{
      customImages[key]=e.target.result;
      document.getElementById(previewId).innerHTML='<img src="'+e.target.result+'" style="width:100%;border-radius:8px"><span class="preview-badge">✓ Yüklendi</span><button type="button" data-p="'+previewId+'" data-k="'+key+'" onclick="clearMediaStage2(this.dataset.p,this.dataset.k,false)" style="display:block;margin-top:4px;padding:3px 8px;background:transparent;border:1px solid #ef4444;color:#fca5a5;border-radius:4px;font-size:.75em;cursor:pointer">❌ Kaldır</button>';
    }
  };
  reader.readAsDataURL(file);
}
function clearMediaStage2(previewId,key,isVideo){
  if(isVideo) delete customVideos[key]; else delete customImages[key];
  document.getElementById(previewId).innerHTML='';
}

function toggleRegen(checkId, btnId, key){
  const cb=document.getElementById(checkId);
  cb.checked=!cb.checked;
  const btn=document.getElementById(btnId);
  btn.style.background=cb.checked?'#78350f':'';
  btn.style.color=cb.checked?'#fef3c7':'';
  if(cb.checked) delete customImages[key];
}

var _epTarget=null,_driveLoaded=false,_fluentRendered=false,_bayrakRendered=false;
function editEmoji(inputId){
  _epTarget=inputId;
  document.getElementById('emoji-picker-modal').style.display='flex';
  switchPickerTab('fluent');
}
function closeEmojiPicker(){
  document.getElementById('emoji-picker-modal').style.display='none';
  _epTarget=null;
}
function switchPickerTab(tab){
  ['fluent','drive','bayrak'].forEach(function(t){
    document.getElementById('picker-'+t).style.display=t===tab?'block':'none';
    document.getElementById('tab-'+t).classList.toggle('active-tab',t===tab);
  });
  var fs=document.getElementById('fluent-search');
  if(fs)fs.style.display=tab==='fluent'?'block':'none';
  var bs=document.getElementById('bayrak-search');
  if(bs)bs.style.display=tab==='bayrak'?'block':'none';
  if(tab==='fluent'&&!_fluentRendered)_renderFluent();
  if(tab==='drive')_loadDrive();
  if(tab==='bayrak'&&!_bayrakRendered)_renderBayrak();
}
function _pickEmoji(value,html){
  if(!_epTarget)return;
  var inp=document.getElementById(_epTarget);
  var btn=document.getElementById(_epTarget+'_btn');
  if(inp)inp.value=value;
  if(btn)btn.innerHTML=html||value||'❓';
  closeEmojiPicker();
}
function _pickDrive(btn){
  var n=btn.dataset.name,t=btn.dataset.thumb;
  _pickEmoji(n,'<img src="'+t+'" style="width:36px;height:36px;object-fit:contain">');
}
function pickFluent(btn){
  var e=btn.dataset.e,n=btn.dataset.n,s=btn.dataset.s;
  var url='https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/'+encodeURIComponent(n)+'/3D/'+s+'_3d.png';
  _pickEmoji(e,'<img src="'+url+'" style="width:36px;height:36px;object-fit:contain">');
}
var FLUENT_LABELS={"Activities":"⚽ Aktiviteler","Animals & Nature":"🦊 Hayvanlar & Doğa","Flags":"🏁 Bayraklar","Food & Drink":"🍎 Yiyecek & İçecek","Objects":"📦 Nesneler","People & Body":"👶 İnsanlar","Smileys & Emotion":"😊 Yüz & Duygular","Symbols":"🔣 Semboller","Travel & Places":"🌍 Seyahat & Mekanlar"};
var FLUENT_DATA={"Smileys & Emotion":[["👽","Alien","alien"],["👾","Alien monster","alien_monster"],["😠","Angry face","angry_face"],["👿","Angry face with horns","angry_face_with_horns"],["😰","Anxious face with sweat","anxious_face_with_sweat"],["😧","Anguished face","anguished_face"],["😲","Astonished face","astonished_face"],["💓","Beating heart","beating_heart"],["🖤","Black heart","black_heart"],["💙","Blue heart","blue_heart"],["💣","Bomb","bomb"],["💔","Broken heart","broken_heart"],["🤎","Brown heart","brown_heart"],["🤡","Clown face","clown_face"],["😖","Confounded face","confounded_face"],["😕","Confused face","confused_face"],["🤠","Cowboy hat face","cowboy_hat_face"],["🥶","Cold face","cold_face"],["💥","Collision","collision"],["😢","Crying face","crying_face"],["💨","Dashing away","dashing_away"],["😿","Crying cat","crying_cat"],["💫","Dizzy","dizzy"],["🫥","Dotted line face","dotted_line_face"],["😞","Disappointed face","disappointed_face"],["😓","Downcast face with sweat","downcast_face_with_sweat"],["🥹","Face holding back tears","face_holding_back_tears"],["🫤","Face with diagonal mouth","face_with_diagonal_mouth"],["👁️‍🗨️","Eye in speech bubble","eye_in_speech_bubble"],["🤮","Face vomiting","face_vomiting"],["😋","Face savoring food","face_savoring_food"],["😮","Face with open mouth","face_with_open_mouth"],["😷","Face with medical mask","face_with_medical_mask"],["🧐","Face with monocle","face_with_monocle"],["🤭","Face with hand over mouth","face_with_hand_over_mouth"],["😑","Expressionless face","expressionless_face"],["😱","Face screaming in fear","face_screaming_in_fear"],["🫣","Face with peeking eye","face_with_peeking_eye"],["😘","Face blowing a kiss","face_blowing_a_kiss"],["🤕","Face with head-bandage","face_with_head-bandage"],["🤯","Exploding head","exploding_head"],["😶","Face without mouth","face_without_mouth"],["😵‍💫","Face with spiral eyes","face_with_spiral_eyes"],["🤒","Face with thermometer","face_with_thermometer"],["😂","Face with tears of joy","face_with_tears_of_joy"],["😤","Face with steam from nose","face_with_steam_from_nose"],["🙄","Face with rolling eyes","face_with_rolling_eyes"],["💚","Green heart","green_heart"],["😄","Grinning face with smiling eyes","grinning_face_with_smiling_eyes"],["😸","Grinning cat with smiling eyes","grinning_cat_with_smiling_eyes"],["😃","Grinning face with big eyes","grinning_face_with_big_eyes"],["🩶","Grey heart","grey_heart"],["👺","Goblin","goblin"],["❤️‍🔥","Heart on fire","heart_on_fire"],["💗","Growing heart","growing_heart"],["🙂‍↔️","Head shaking horizontally","head_shaking_horizontally"],["😆","Grinning squinting face","grinning_squinting_face"],["🙂‍↕️","Head shaking vertically","head_shaking_vertically"],["❣️","Heart exclamation","heart_exclamation"],["😅","Grinning face with sweat","grinning_face_with_sweat"],["🙉","Hear-no-evil monkey","hear-no-evil_monkey"],["💟","Heart decoration","heart_decoration"],["😀","Grinning face","grinning_face"],["💝","Heart with ribbon","heart_with_ribbon"],["🥵","Hot face","hot_face"],["🕳️","Hole","hole"],["💘","Heart with arrow","heart_with_arrow"],["🤗","Hugging face","hugging_face"],["💯","Hundred points","hundred_points"],["😯","Hushed face","hushed_face"],["😵","Knocked-out face","knocked-out_face"],["💋","Kiss mark","kiss_mark"],["😽","Kissing cat","kissing_cat"],["😗","Kissing face","kissing_face"],["😙","Kissing face with smiling eyes","kissing_face_with_smiling_eyes"],["😚","Kissing face with closed eyes","kissing_face_with_closed_eyes"],["🩵","Light blue heart","light_blue_heart"],["🗨️","Left speech bubble","left_speech_bubble"],["💌","Love letter","love_letter"],["😭","Loudly crying face","loudly_crying_face"],["🤥","Lying face","lying_face"],["❤️‍🩹","Mending heart","mending_heart"],["🫠","Melting face","melting_face"],["🤑","Money-mouth face","money-mouth_face"],["🤢","Nauseated face","nauseated_face"],["😐","Neutral face","neutral_face"],["🤓","Nerd face","nerd_face"],["👹","Ogre","ogre"],["🧡","Orange heart","orange_heart"],["😣","Persevering face","persevering_face"],["😔","Pensive face","pensive_face"],["🥳","Partying face","partying_face"],["🥺","Pleading face","pleading_face"],["💩","Pile of poo","pile_of_poo"],["🩷","Pink heart","pink_heart"],["😡","Pouting face","pouting_face"],["😾","Pouting cat","pouting_cat"],["💜","Purple heart","purple_heart"],["💞","Revolving hearts","revolving_hearts"],["😌","Relieved face","relieved_face"],["🗯️","Right anger bubble","right_anger_bubble"],["❤️","Red heart","red_heart"],["🫡","Saluting face","saluting_face"],["🤖","Robot","robot"],["🤣","Rolling on the floor laughing","rolling_on_the_floor_laughing"],["😥","Sad but relieved face","sad_but_relieved_face"],["🫨","Shaking face","shaking_face"],["🙈","See-no-evil monkey","see-no-evil_monkey"],["🙂","Slightly smiling face","slightly_smiling_face"],["🙁","Slightly frowning face","slightly_frowning_face"],["😻","Smiling cat with heart-eyes","smiling_cat_with_heart-eyes"],["💀","Skull","skull"],["😍","Smiling face with heart-eyes","smiling_face_with_heart-eyes"],["😪","Sleepy face","sleepy_face"],["😴","Sleeping face","sleeping_face"],["😇","Smiling face with halo","smiling_face_with_halo"],["🤫","Shushing face","shushing_face"],["☠️","Skull and crossbones","skull_and_crossbones"],["😈","Smiling face with horns","smiling_face_with_horns"],["😎","Smiling face with sunglasses","smiling_face_with_sunglasses"],["🤧","Sneezing face","sneezing_face"],["😏","Smirking face","smirking_face"],["😊","Smiling face with smiling eyes","smiling_face_with_smiling_eyes"],["🥰","Smiling face with hearts","smiling_face_with_hearts"],["🥲","Smiling face with tear","smiling_face_with_tear"],["🙊","Speak-no-evil monkey","speak-no-evil_monkey"],["☺️","Smiling face","smiling_face"],["💖","Sparkling heart","sparkling_heart"],["🤩","Star-struck","star-struck"],["😝","Squinting face with tongue","squinting_face_with_tongue"],["💬","Speech balloon","speech_balloon"],["💦","Sweat droplets","sweat_droplets"],["🤔","Thinking face","thinking_face"],["💭","Thought balloon","thought_balloon"],["😫","Tired face","tired_face"],["💕","Two hearts","two_hearts"],["😒","Unamused face","unamused_face"],["🙃","Upside-down face","upside-down_face"],["🙀","Weary cat","weary_cat"],["😩","Weary face","weary_face"],["🤍","White heart","white_heart"],["😉","Winking face","winking_face"],["😜","Winking face with tongue","winking_face_with_tongue"],["🥴","Woozy face","woozy_face"],["💛","Yellow heart","yellow_heart"],["🥱","Yawning face","yawning_face"],["😟","Worried face","worried_face"],["💤","Zzz","zzz"],["🤐","Zipper-mouth face","zipper-mouth_face"],["🤪","Zany face","zany_face"]],
"People & Body":[["🫀","Anatomical heart","anatomical_heart"],["👶","Baby","baby"],["👼","Baby angel","baby_angel"],["🧑‍🎨","Artist","artist"],["👉","Backhand index pointing right","backhand_index_pointing_right"],["🦴","Bone","bone"],["🫦","Biting lip","biting_lip"],["🧠","Brain","brain"],["👦","Boy","boy"],["🤱","Breast feeding","breast_feeding"],["👤","Bust in silhouette","bust_in_silhouette"],["🤙","Call me hand","call_me_hand"],["🧒","Child","child"],["👏","Clapping hands","clapping_hands"],["👷","Construction worker","construction_worker"],["🧑‍🍳","Cook","cook"],["🤞","Crossed fingers","crossed_fingers"],["👂","Ear","ear"],["🦻","Ear with hearing aid","ear_with_hearing_aid"],["👁️","Eye","eye"],["👀","Eyes","eyes"],["🧑‍🏭","Factory worker","factory_worker"],["🙏","Folded hands","folded_hands"],["💪","Flexed biceps","flexed_biceps"],["🦶","Foot","foot"],["🖐️","Hand with fingers splayed","hand_with_fingers_splayed"],["🫶","Heart hands","heart_hands"],["🫰","Hand with index finger and thumb crossed","hand_with_index_finger_and_thumb_crossed"],["🧑‍⚕️","Health worker","health_worker"],["💂","Guard","guard"],["🤝","Handshake","handshake"],["🏇","Horse racing","horse_racing"],["🫵","Index pointing at the viewer","index_pointing_at_the_viewer"],["☝️","Index pointing up","index_pointing_up"],["🧑‍⚖️","Judge","judge"],["🫷","Leftwards pushing hand","leftwards_pushing_hand"],["🦵","Leg","leg"],["🫲","Leftwards hand","leftwards_hand"],["🤛","Left-facing fist","left-facing_fist"],["🤟","Love-you gesture","love-you_gesture"],["🫁","Lungs","lungs"],["👨‍🍳","Man cook","man_cook"],["👨‍🚒","Man firefighter","man_firefighter"],["🚴‍♂️","Man biking","man_biking"],["🕵️‍♂️","Man detective","man_detective"],["🙆‍♂️","Man gesturing ok","man_gesturing_ok"],["🧚‍♂️","Man fairy","man_fairy"],["💇‍♂️","Man getting haircut","man_getting_haircut"],["🧞‍♂️","Man genie","man_genie"],["👨‍🦱","Man curly hair","man_curly_hair"],["🤸‍♂️","Man cartwheeling","man_cartwheeling"],["🧝‍♂️","Man elf","man_elf"],["🧗‍♂️","Man climbing","man_climbing"],["👨‍🦲","Man bald","man_bald"],["🕺","Man dancing","man_dancing"],["🧏‍♂️","Man deaf","man_deaf"],["👨‍🌾","Man farmer","man_farmer"],["👨‍🏭","Man factory worker","man_factory_worker"],["👨‍🚀","Man astronaut","man_astronaut"],["🙍‍♂️","Man frowning","man_frowning"],["💆‍♂️","Man getting massage","man_getting_massage"],["🧔‍♂️","Man beard","man_beard"],["🤦‍♂️","Man facepalming","man_facepalming"],["🙅‍♂️","Man gesturing no","man_gesturing_no"],["👱‍♂️","Man blonde hair","man_blonde_hair"],["👷‍♂️","Man construction worker","man_construction_worker"],["⛹️‍♂️","Man bouncing ball","man_bouncing_ball"],["👨‍🎨","Man artist","man_artist"],["👨‍🍼","Man feeding baby","man_feeding_baby"],["🙇‍♂️","Man bowing","man_bowing"],["👨‍🔧","Man mechanic","man_mechanic"],["👨‍🦽‍➡️","Man in manual wheelchair facing right","man_in_manual_wheelchair_facing_right"],["👨‍🦽","Man in manual wheelchair","man_in_manual_wheelchair"],["🧙‍♂️","Man mage","man_mage"],["👨‍⚕️","Man health worker","man_health_worker"],["👨‍🦰","Man red hair","man_red_hair"],["👨‍💼","Man office worker","man_office_worker"],["🏃‍♂️","Man running","man_running"],["💂‍♂️","Man guard","man_guard"],["👨‍⚖️","Man judge","man_judge"],["👨‍✈️","Man pilot","man_pilot"],["🤹‍♂️","Man juggling","man_juggling"],["🤾‍♂️","Man playing handball","man_playing_handball"],["🤽‍♂️","Man playing water polo","man_playing_water_polo"],["🏃‍♂️‍➡️","Man running facing right","man_running_facing_right"],["🙎‍♂️","Man pouting","man_pouting"],["🙋‍♂️","Man raising hand","man_raising_hand"],["🚵‍♂️","Man mountain biking","man_mountain_biking"],["👮‍♂️","Man police officer","man_police_officer"],["🏋️‍♂️","Man lifting weights","man_lifting_weights"],["🧖‍♂️","Man in steamy room","man_in_steamy_room"],["🤵‍♂️","Man in tuxedo","man_in_tuxedo"],["🧎‍♂️","Man kneeling","man_kneeling"],["🧘‍♂️","Man in lotus position","man_in_lotus_position"],["🚣‍♂️","Man rowing boat","man_rowing_boat"],["🧎‍♂️‍➡️","Man kneeling facing right","man_kneeling_facing_right"],["👨‍🦼","Man in motorized wheelchair","man_in_motorized_wheelchair"],["🧜‍♂️","Man merpeople","man_merpeople"],["👨‍🦼‍➡️","Man in motorized wheelchair facing right","man_in_motorized_wheelchair_facing_right"],["🏌️‍♂️","Man golfing","man_golfing"],["🦹‍♂️","Man supervillain","man_supervillain"],["👨","Man","man"],["🏊‍♂️","Man swimming","man_swimming"],["👨‍🦯‍➡️","Man with white cane facing right","man_with_white_cane_facing_right"],["👨‍🦳","Man white hair","man_white_hair"],["🧛‍♂️","Man vampire","man_vampire"],["🚶‍♂️","Man walking","man_walking"],["🏄‍♂️","Man surfing","man_surfing"],["👨‍🎤","Man singer","man_singer"],["👯‍♂️","Man with bunny ears","man_with_bunny_ears"],["💁‍♂️","Man tipping hand","man_tipping_hand"],["🦸‍♂️","Man superhero","man_superhero"],["👰‍♂️","Man with veil","man_with_veil"],["🤼‍♂️","Man wrestling","man_wrestling"],["🤷‍♂️","Man shrugging","man_shrugging"],["👨‍🦯","Man with white cane","man_with_white_cane"],["🧟‍♂️","Man zombie","man_zombie"],["👳‍♂️","Man wearing turban","man_wearing_turban"],["👨‍🔬","Man scientist","man_scientist"],["👨‍🏫","Man teacher","man_teacher"],["👨‍💻","Man technologist","man_technologist"],["🚶‍♂️‍➡️","Man walking facing right","man_walking_facing_right"],["👨‍🎓","Man student","man_student"],["🧍‍♂️","Man standing","man_standing"],["🖕","Middle finger","middle_finger"],["🧑‍🔧","Mechanic","mechanic"],["🦿","Mechanical leg","mechanical_leg"],["🦾","Mechanical arm","mechanical_arm"],["🤶","Mrs claus","mrs_claus"],["👄","Mouth","mouth"],["🥷","Ninja","ninja"],["💅","Nail polish","nail_polish"],["🧑‍🎄","Mx claus","mx_claus"],["👴","Old man","old_man"],["👃","Nose","nose"],["👊","Oncoming fist","oncoming_fist"],["👵","Old woman","old_woman"],["🧓","Older person","older_person"],["👌","Ok hand","ok_hand"],["🧑‍💼","Office worker","office_worker"],["🤲","Palms up together","palms_up_together"],["👐","Open hands","open_hands"],["🫴","Palm up hand","palm_up_hand"],["🫳","Palm down hand","palm_down_hand"],["⛹️","Person bouncing ball","person_bouncing_ball"],["🧔","Person beard","person_beard"],["🚴","Person biking","person_biking"],["👱","Person blonde hair","person_blonde_hair"],["🧑‍🦲","Person bald","person_bald"],["🫂","People hugging","people_hugging"],["🧚","Person fairy","person_fairy"],["🧑‍🦽","Person in manual wheelchair","person_in_manual_wheelchair"],["🧎‍➡️","Person kneeling facing right","person_kneeling_facing_right"],["🧑‍🦼‍➡️","Person in motorized wheelchair facing right","person_in_motorized_wheelchair_facing_right"],["🤦","Person facepalming","person_facepalming"],["🙅","Person gesturing no","person_gesturing_no"],["🤹","Person juggling","person_juggling"],["🧖","Person in steamy room","person_in_steamy_room"],["🏋️","Person lifting weights","person_lifting_weights"],["🧑‍🦼","Person in motorized wheelchair","person_in_motorized_wheelchair"],["🧞","Person genie","person_genie"],["🧗","Person climbing","person_climbing"],["🛌","Person in bed","person_in_bed"],["🧑‍🦽‍➡️","Person in manual wheelchair facing right","person_in_manual_wheelchair_facing_right"],["💆","Person getting massage","person_getting_massage"],["🧑‍🦱","Person curly hair","person_curly_hair"],["🧎","Person kneeling","person_kneeling"],["🧑‍🍼","Person feeding baby","person_feeding_baby"],["🙆","Person gesturing ok","person_gesturing_ok"],["🧘","Person in lotus position","person_in_lotus_position"],["🙍","Person frowning","person_frowning"],["💇","Person getting haircut","person_getting_haircut"],["🤸","Person cartwheeling","person_cartwheeling"],["🕴️","Person in suit levitating","person_in_suit_levitating"],["🧝","Person elf","person_elf"],["🙇","Person bowing","person_bowing"],["🤵","Person in tuxedo","person_in_tuxedo"],["🏌️","Person golfing","person_golfing"],["🧏","Person deaf","person_deaf"],["🤺","Person fencing","person_fencing"],["🧙","Person mage","person_mage"],["🦹","Person supervillain","person_supervillain"],["🧑‍🦯","Person with white cane","person_with_white_cane"],["👲","Person with skullcap","person_with_skullcap"],["🧍","Person standing","person_standing"],["🧜","Person merpeople","person_merpeople"],["🚵","Person mountain biking","person_mountain_biking"],["👳","Person wearing turban","person_wearing_turban"],["🤽","Person playing water polo","person_playing_water_polo"],["👯","Person with bunny ears","person_with_bunny_ears"],["🧛","Person vampire","person_vampire"],["🚶‍➡️","Person walking facing right","person_walking_facing_right"],["🙋","Person raising hand","person_raising_hand"],["🏃‍➡️","Person running facing right","person_running_facing_right"],["🚣","Person rowing boat","person_rowing_boat"],["🫅","Person with crown","person_with_crown"],["🧑‍🦳","Person white hair","person_white_hair"],["🏄","Person surfing","person_surfing"],["💁","Person tipping hand","person_tipping_hand"],["🦸","Person superhero","person_superhero"],["🚶","Person walking","person_walking"],["🏃","Person running","person_running"],["🧑‍🦰","Person red hair","person_red_hair"],["🧑‍🦯‍➡️","Person with white cane facing right","person_with_white_cane_facing_right"],["🏊","Person swimming","person_swimming"],["👰","Person with veil","person_with_veil"],["🤷","Person shrugging","person_shrugging"],["🙎","Person pouting","person_pouting"],["🤾","Person playing handball","person_playing_handball"],["🛀","Person taking bath","person_taking_bath"],["🤌","Pinched fingers","pinched_fingers"],["🧑","Person","person"],["🤏","Pinching hand","pinching_hand"],["🤼","Person wrestling","person_wrestling"],["🧟","Person zombie","person_zombie"],["🧑‍✈️","Pilot","pilot"],["🫄","Pregnant person","pregnant_person"],["🤰","Pregnant woman","pregnant_woman"],["👸","Princess","princess"],["👮","Police officer","police_officer"],["🤴","Prince","prince"],["🫃","Pregnant man","pregnant_man"],["🙌","Raising hands","raising_hands"],["✊","Raised fist","raised_fist"],["✋","Raised hand","raised_hand"],["🤚","Raised back of hand","raised_back_of_hand"],["🫱","Rightwards hand","rightwards_hand"],["🤜","Right-facing fist","right-facing_fist"],["🫸","Rightwards pushing hand","rightwards_pushing_hand"],["🎅","Santa claus","santa_claus"],["🤳","Selfie","selfie"],["🧑‍🔬","Scientist","scientist"],["⛷️","Skier","skier"],["🤘","Sign of the horns","sign_of_the_horns"],["🧑‍🎤","Singer","singer"],["🏂","Snowboarder","snowboarder"],["🗣️","Speaking head","speaking_head"],["🧑‍🎓","Student","student"],["🧑‍🏫","Teacher","teacher"],["👍","Thumbs up","thumbs_up"],["👎","Thumbs down","thumbs_down"],["🧑‍💻","Technologist","technologist"],["👅","Tongue","tongue"],["🧌","Troll","troll"],["🦷","Tooth","tooth"],["✌️","Victory hand","victory_hand"],["🖖","Vulcan salute","vulcan_salute"],["👋","Waving hand","waving_hand"],["👩‍🍳","Woman cook","woman_cook"],["🧗‍♀️","Woman climbing","woman_climbing"],["👩‍🚀","Woman astronaut","woman_astronaut"],["💃","Woman dancing","woman_dancing"],["👩‍🎨","Woman artist","woman_artist"],["👩‍🦱","Woman curly hair","woman_curly_hair"],["🚴‍♀️","Woman biking","woman_biking"],["🧔‍♀️","Woman beard","woman_beard"],["🧏‍♀️","Woman deaf","woman_deaf"],["🤸‍♀️","Woman cartwheeling","woman_cartwheeling"],["👱‍♀️","Woman blonde hair","woman_blonde_hair"],["👩‍🦲","Woman bald","woman_bald"],["🙇‍♀️","Woman bowing","woman_bowing"],["👷‍♀️","Woman construction worker","woman_construction_worker"],["⛹️‍♀️","Woman bouncing ball","woman_bouncing_ball"],["🧎‍♀️‍➡️","Woman kneeling facing right","woman_kneeling_facing_right"],["🤦‍♀️","Woman facepalming","woman_facepalming"],["💆‍♀️","Woman getting massage","woman_getting_massage"],["👩‍🦼","Woman in motorized wheelchair","woman_in_motorized_wheelchair"],["🤵‍♀️","Woman in tuxedo","woman_in_tuxedo"],["🙆‍♀️","Woman gesturing ok","woman_gesturing_ok"],["🧝‍♀️","Woman elf","woman_elf"],["👩‍🦽","Woman in manual wheelchair","woman_in_manual_wheelchair"],["👩‍🏭","Woman factory worker","woman_factory_worker"],["👩‍🌾","Woman farmer","woman_farmer"],["🕵️‍♀️","Woman detective","woman_detective"],["🧎‍♀️","Woman kneeling","woman_kneeling"],["👩‍🍼","Woman feeding baby","woman_feeding_baby"],["👩‍🦽‍➡️","Woman in manual wheelchair facing right","woman_in_manual_wheelchair_facing_right"],["🏌️‍♀️","Woman golfing","woman_golfing"],["🧖‍♀️","Woman in steamy room","woman_in_steamy_room"],["👩‍⚕️","Woman health worker","woman_health_worker"],["🙍‍♀️","Woman frowning","woman_frowning"],["🤹‍♀️","Woman juggling","woman_juggling"],["💇‍♀️","Woman getting haircut","woman_getting_haircut"],["💂‍♀️","Woman guard","woman_guard"],["👩‍🚒","Woman firefighter","woman_firefighter"],["🏋️‍♀️","Woman lifting weights","woman_lifting_weights"],["🧘‍♀️","Woman in lotus position","woman_in_lotus_position"],["🧞‍♀️","Woman genie","woman_genie"],["🧚‍♀️","Woman fairy","woman_fairy"],["🙅‍♀️","Woman gesturing no","woman_gesturing_no"],["👩‍⚖️","Woman judge","woman_judge"],["🧙‍♀️","Woman mage","woman_mage"],["🙎‍♀️","Woman pouting","woman_pouting"],["🚶‍♀️‍➡️","Woman walking facing right","woman_walking_facing_right"],["👩‍💻","Woman technologist","woman_technologist"],["💁‍♀️","Woman tipping hand","woman_tipping_hand"],["🧛‍♀️","Woman vampire","woman_vampire"],["👩‍🏫","Woman teacher","woman_teacher"],["🦹‍♀️","Woman supervillain","woman_supervillain"],["👩‍🔧","Woman mechanic","woman_mechanic"],["🙋‍♀️","Woman raising hand","woman_raising_hand"],["🤽‍♀️","Woman playing water polo","woman_playing_water_polo"],["🤷‍♀️","Woman shrugging","woman_shrugging"],["🚵‍♀️","Woman mountain biking","woman_mountain_biking"],["🤾‍♀️","Woman playing handball","woman_playing_handball"],["🏃‍♀️‍➡️","Woman running facing right","woman_running_facing_right"],["👳‍♀️","Woman wearing turban","woman_wearing_turban"],["🦸‍♀️","Woman superhero","woman_superhero"],["🚣‍♀️","Woman rowing boat","woman_rowing_boat"],["👩‍✈️","Woman pilot","woman_pilot"],["🏄‍♀️","Woman surfing","woman_surfing"],["👩‍💼","Woman office worker","woman_office_worker"],["🏃‍♀️","Woman running","woman_running"],["👩‍🎓","Woman student","woman_student"],["👮‍♀️","Woman police officer","woman_police_officer"],["🧜‍♀️","Woman merpeople","woman_merpeople"],["👩‍🦰","Woman red hair","woman_red_hair"],["👩‍🔬","Woman scientist","woman_scientist"],["🚶‍♀️","Woman walking","woman_walking"],["🏊‍♀️","Woman swimming","woman_swimming"],["👩‍🎤","Woman singer","woman_singer"],["🧍‍♀️","Woman standing","woman_standing"],["👰‍♀️","Woman with veil","woman_with_veil"],["👩‍🦯‍➡️","Woman with white cane facing right","woman_with_white_cane_facing_right"],["✍️","Writing hand","writing_hand"],["🧕","Woman with headscarf","woman_with_headscarf"],["👯‍♀️","Woman with bunny ears","woman_with_bunny_ears"],["🧟‍♀️","Woman zombie","woman_zombie"],["👩","Woman","woman"],["👩‍🦳","Woman white hair","woman_white_hair"],["🤼‍♀️","Woman wrestling","woman_wrestling"],["👩‍🦯","Woman with white cane","woman_with_white_cane"]],
"Animals & Nature":[["🐜","Ant","ant"],["🐻","Bear","bear"],["🦫","Beaver","beaver"],["🦇","Bat","bat"],["🐦","Bird","bird"],["🦬","Bison","bison"],["🐗","Boar","boar"],["💐","Bouquet","bouquet"],["🐪","Camel","camel"],["🌵","Cactus","cactus"],["🦋","Butterfly","butterfly"],["🐔","Chicken","chicken"],["🐈","Cat","cat"],["🐿️","Chipmunk","chipmunk"],["🪸","Coral","coral"],["🐄","Cow","cow"],["🐮","Cow face","cow_face"],["🌳","Deciduous tree","deciduous_tree"],["🦗","Cricket","cricket"],["🦌","Deer","deer"],["🐊","Crocodile","crocodile"],["🕊️","Dove","dove"],["🫏","Donkey","donkey"],["🐶","Dog face","dog_face"],["🐬","Dolphin","dolphin"],["🐕","Dog","dog"],["🦅","Eagle","eagle"],["🐉","Dragon","dragon"],["🐘","Elephant","elephant"],["🐲","Dragon face","dragon_face"],["🪹","Empty nest","empty_nest"],["🌲","Evergreen tree","evergreen_tree"],["🐑","Ewe","ewe"],["🦩","Flamingo","flamingo"],["🦊","Fox","fox"],["🐸","Frog","frog"],["🍀","Four leaf clover","four_leaf_clover"],["🦍","Gorilla","gorilla"],["🦒","Giraffe","giraffe"],["🪿","Goose","goose"],["🐣","Hatching chick","hatching_chick"],["🦮","Guide dog","guide_dog"],["🐹","Hamster","hamster"],["🐎","Horse","horse"],["🌺","Hibiscus","hibiscus"],["🦛","Hippopotamus","hippopotamus"],["🌿","Herb","herb"],["🐝","Honeybee","honeybee"],["🦔","Hedgehog","hedgehog"],["🐴","Horse face","horse_face"],["🪻","Hyacinth","hyacinth"],["🦘","Kangaroo","kangaroo"],["🪼","Jellyfish","jellyfish"],["🐨","Koala","koala"],["🐞","Lady beetle","lady_beetle"],["🐆","Leopard","leopard"],["🍃","Leaf fluttering in wind","leaf_fluttering_in_wind"],["🦎","Lizard","lizard"],["🪷","Lotus","lotus"],["🦙","Llama","llama"],["🦁","Lion","lion"],["🦣","Mammoth","mammoth"],["🍁","Maple leaf","maple_leaf"],["🦠","Microbe","microbe"],["🐵","Monkey face","monkey_face"],["🫎","Moose","moose"],["🐁","Mouse","mouse"],["🐭","Mouse face","mouse_face"],["🦟","Mosquito","mosquito"],["🐒","Monkey","monkey"],["🪺","Nest with eggs","nest_with_eggs"],["🐙","Octopus","octopus"],["🦦","Otter","otter"],["🦧","Orangutan","orangutan"],["🌴","Palm tree","palm_tree"],["🐂","Ox","ox"],["🦉","Owl","owl"],["🦚","Peacock","peacock"],["🐧","Penguin","penguin"],["🐼","Panda","panda"],["🐾","Paw prints","paw_prints"],["🦜","Parrot","parrot"],["🐦‍🔥","Phoenix bird","phoenix_bird"],["🐷","Pig face","pig_face"],["🐽","Pig nose","pig_nose"],["🐖","Pig","pig"],["🪴","Potted plant","potted_plant"],["🐻‍❄️","Polar bear","polar_bear"],["🐩","Poodle","poodle"],["🐀","Rat","rat"],["🐰","Rabbit face","rabbit_face"],["🦝","Raccoon","raccoon"],["🐇","Rabbit","rabbit"],["🐏","Ram","ram"],["🦏","Rhinoceros","rhinoceros"],["🌹","Rose","rose"],["🏵️","Rosette","rosette"],["🐓","Rooster","rooster"],["🦈","Shark","shark"],["🌾","Sheaf of rice","sheaf_of_rice"],["☘️","Shamrock","shamrock"],["🦕","Sauropod","sauropod"],["🦂","Scorpion","scorpion"],["🦭","Seal","seal"],["🌱","Seedling","seedling"],["🐕‍🦺","Service dog","service_dog"],["🦥","Sloth","sloth"],["🦨","Skunk","skunk"],["🐍","Snake","snake"],["🐌","Snail","snail"],["🕸️","Spider web","spider_web"],["🐚","Spiral shell","spiral_shell"],["🐳","Spouting whale","spouting_whale"],["🕷️","Spider","spider"],["🦖","T-rex","t-rex"],["🌻","Sunflower","sunflower"],["🦢","Swan","swan"],["🐯","Tiger face","tiger_face"],["🐅","Tiger","tiger"],["🌷","Tulip","tulip"],["🐢","Turtle","turtle"],["🦃","Turkey","turkey"],["🐠","Tropical fish","tropical_fish"],["🐫","Two-hump camel","two-hump_camel"],["🦄","Unicorn","unicorn"],["🐃","Water buffalo","water_buffalo"],["💮","White flower","white_flower"],["🐋","Whale","whale"],["🥀","Wilted flower","wilted_flower"],["🪽","Wing","wing"],["🐺","Wolf","wolf"],["🪱","Worm","worm"],["🦓","Zebra","zebra"]],
"Food & Drink":[["🏺","Amphora","amphora"],["🍼","Baby bottle","baby_bottle"],["🥖","Baguette bread","baguette_bread"],["🥑","Avocado","avocado"],["🧃","Beverage box","beverage_box"],["🫐","Blueberries","blueberries"],["🥦","Broccoli","broccoli"],["🧋","Bubble tea","bubble_tea"],["🍞","Bread","bread"],["🥫","Canned food","canned_food"],["🧈","Butter","butter"],["🥢","Chopsticks","chopsticks"],["🍫","Chocolate bar","chocolate_bar"],["🧀","Cheese wedge","cheese_wedge"],["🥂","Clinking glasses","clinking_glasses"],["🍸","Cocktail glass","cocktail_glass"],["🥥","Coconut","coconut"],["🍻","Clinking beer mugs","clinking_beer_mugs"],["🍚","Cooked rice","cooked_rice"],["🍳","Cooking","cooking"],["🦀","Crab","crab"],["🍪","Cookie","cookie"],["🥒","Cucumber","cucumber"],["🍮","Custard","custard"],["🧁","Cupcake","cupcake"],["🥩","Cut of meat","cut_of_meat"],["🥤","Cup with straw","cup_with_straw"],["🥐","Croissant","croissant"],["🍡","Dango","dango"],["🍛","Curry rice","curry_rice"],["🍩","Doughnut","doughnut"],["🌽","Ear of corn","ear_of_corn"],["🍆","Eggplant","eggplant"],["🫓","Flatbread","flatbread"],["🫕","Fondue","fondue"],["🍥","Fish cake with swirl","fish_cake_with_swirl"],["🍟","French fries","french_fries"],["🧄","Garlic","garlic"],["🍽️","Fork and knife with plate","fork_and_knife_with_plate"],["🥠","Fortune cookie","fortune_cookie"],["🍤","Fried shrimp","fried_shrimp"],["🍇","Grapes","grapes"],["🥛","Glass of milk","glass_of_milk"],["🍏","Green apple","green_apple"],["🍔","Hamburger","hamburger"],["🌶️","Hot pepper","hot_pepper"],["🌭","Hot dog","hot_dog"],["🍯","Honey pot","honey_pot"],["☕","Hot beverage","hot_beverage"],["🧊","Ice","ice"],["🍨","Ice cream","ice_cream"],["🫙","Jar","jar"],["🥝","Kiwi fruit","kiwi_fruit"],["🔪","Kitchen knife","kitchen_knife"],["🥬","Leafy green","leafy_green"],["🍋‍🟩","Lime","lime"],["🍋","Lemon","lemon"],["🦞","Lobster","lobster"],["🍭","Lollipop","lollipop"],["🥭","Mango","mango"],["🍈","Melon","melon"],["🍖","Meat on bone","meat_on_bone"],["🧉","Mate","mate"],["🍄","Mushroom","mushroom"],["🥮","Moon cake","moon_cake"],["🍢","Oden","oden"],["🫒","Olive","olive"],["🦪","Oyster","oyster"],["🧅","Onion","onion"],["🥜","Peanuts","peanuts"],["🍐","Pear","pear"],["🫛","Pea pod","pea_pod"],["🥞","Pancakes","pancakes"],["🍑","Peach","peach"],["🍍","Pineapple","pineapple"],["🥧","Pie","pie"],["🍕","Pizza","pizza"],["🫗","Pouring liquid","pouring_liquid"],["🍲","Pot of food","pot_of_food"],["🍿","Popcorn","popcorn"],["🥨","Pretzel","pretzel"],["🥔","Potato","potato"],["🍗","Poultry leg","poultry_leg"],["🍎","Red apple","red_apple"],["🍙","Rice ball","rice_ball"],["🍘","Rice cracker","rice_cracker"],["🍶","Sake","sake"],["🍠","Roasted sweet potato","roasted_sweet_potato"],["🥪","Sandwich","sandwich"],["🧂","Salt","salt"],["🥘","Shallow pan of food","shallow_pan_of_food"],["🍧","Shaved ice","shaved_ice"],["🍰","Shortcake","shortcake"],["🦐","Shrimp","shrimp"],["🍝","Spaghetti","spaghetti"],["🍦","Soft ice cream","soft_ice_cream"],["🍜","Steaming bowl","steaming_bowl"],["🦑","Squid","squid"],["🥄","Spoon","spoon"],["🍓","Strawberry","strawberry"],["🍣","Sushi","sushi"],["🫔","Tamale","tamale"],["🌮","Taco","taco"],["🥡","Takeout box","takeout_box"],["🍊","Tangerine","tangerine"],["🥙","Stuffed flatbread","stuffed_flatbread"],["🫖","Teapot","teapot"],["🍵","Teacup without handle","teacup_without_handle"],["🍹","Tropical drink","tropical_drink"],["🥃","Tumbler glass","tumbler_glass"],["🍅","Tomato","tomato"],["🧇","Waffle","waffle"],["🍉","Watermelon","watermelon"],["🍷","Wine glass","wine_glass"]],
"Activities":[["🎟️","Admission tickets","admission_tickets"],["🥉","3rd place medal","3rd_place_medal"],["🏈","American football","american_football"],["🏀","Basketball","basketball"],["🎈","Balloon","balloon"],["🥊","Boxing glove","boxing_glove"],["🎳","Bowling","bowling"],["🎏","Carp streamer","carp_streamer"],["🎯","Bullseye","bullseye"],["♟️","Chess pawn","chess_pawn"],["🎄","Christmas tree","christmas_tree"],["♣️","Club suit","club_suit"],["🏏","Cricket game","cricket_game"],["🎊","Confetti ball","confetti_ball"],["🥌","Curling stone","curling_stone"],["🔮","Crystal ball","crystal_ball"],["🎣","Fishing pole","fishing_pole"],["🧨","Firecracker","firecracker"],["🎆","Fireworks","fireworks"],["🎲","Game die","game_die"],["🪬","Hamsa","hamsa"],["♥️","Heart suit","heart_suit"],["🎃","Jack-o-lantern","jack-o-lantern"],["⛸️","Ice skate","ice_skate"],["🏒","Ice hockey","ice_hockey"],["🃏","Joker","joker"],["🎎","Japanese dolls","japanese_dolls"],["🕹️","Joystick","joystick"],["🪢","Knot","knot"],["🥍","Lacrosse","lacrosse"],["🪁","Kite","kite"],["🀄","Mahjong red dragon","mahjong_red_dragon"],["🪄","Magic wand","magic_wand"],["🥋","Martial arts uniform","martial_arts_uniform"],["🪩","Mirror ball","mirror_ball"],["🎖️","Military medal","military_medal"],["🎑","Moon viewing ceremony","moon_viewing_ceremony"],["🧿","Nazar amulet","nazar_amulet"],["🪆","Nesting dolls","nesting_dolls"],["🎭","Performing arts","performing_arts"],["🎉","Party popper","party_popper"],["🪅","Piñata","piñata"],["🎍","Pine decoration","pine_decoration"],["🏓","Ping pong","ping_pong"],["🎱","Pool 8 ball","pool_8_ball"],["🧩","Puzzle piece","puzzle_piece"],["🧧","Red envelope","red_envelope"],["🎀","Ribbon","ribbon"],["🎗️","Reminder ribbon","reminder_ribbon"],["🎽","Running shirt","running_shirt"],["🏉","Rugby football","rugby_football"],["🪡","Sewing needle","sewing_needle"],["🎿","Skis","skis"],["🛷","Sled","sled"],["🎰","Slot machine","slot_machine"],["✨","Sparkles","sparkles"],["🥎","Softball","softball"],["♠️","Spade suit","spade_suit"],["⚽","Soccer ball","soccer_ball"],["🎇","Sparkler","sparkler"],["🏅","Sports medal","sports_medal"],["🎋","Tanabata tree","tanabata_tree"],["🎾","Tennis","tennis"],["🧵","Thread","thread"],["🧸","Teddy bear","teddy_bear"],["🎫","Ticket","ticket"],["🏆","Trophy","trophy"],["🎮","Video game","video_game"],["🏐","Volleyball","volleyball"],["🎐","Wind chime","wind_chime"],["🎁","Wrapped gift","wrapped_gift"],["🧶","Yarn","yarn"],["🪀","Yo-yo","yo-yo"]],
"Travel & Places":[["⚓","Anchor","anchor"],["✈️","Airplane","airplane"],["🚑","Ambulance","ambulance"],["🛬","Airplane arrival","airplane_arrival"],["🛫","Airplane departure","airplane_departure"],["🚗","Automobile","automobile"],["🚛","Articulated lorry","articulated_lorry"],["🏖️","Beach with umbrella","beach_with_umbrella"],["🛎️","Bellhop bell","bellhop_bell"],["🚲","Bicycle","bicycle"],["🌉","Bridge at night","bridge_at_night"],["🚌","Bus","bus"],["🏗️","Building construction","building_construction"],["🏕️","Camping","camping"],["🚅","Bullet train","bullet_train"],["🏰","Castle","castle"],["🌩️","Cloud with lightning","cloud_with_lightning"],["⛈️","Cloud with lightning and rain","cloud_with_lightning_and_rain"],["🌧️","Cloud with rain","cloud_with_rain"],["🏛️","Classical building","classical_building"],["🌆","Cityscape at dusk","cityscape_at_dusk"],["☁️","Cloud","cloud"],["🌨️","Cloud with snow","cloud_with_snow"],["🏙️","Cityscape","cityscape"],["🏪","Convenience store","convenience_store"],["🧭","Compass","compass"],["☄️","Comet","comet"],["🌙","Crescent moon","crescent_moon"],["🚧","Construction","construction"],["🚚","Delivery truck","delivery_truck"],["🌀","Cyclone","cyclone"],["🏚️","Derelict house","derelict_house"],["🏜️","Desert","desert"],["🕣","Eight-thirty","eight-thirty"],["🕚","Eleven oclock","eleven_oclock"],["🕗","Eight oclock","eight_oclock"],["💧","Droplet","droplet"],["🚒","Fire engine","fire_engine"],["🎡","Ferris wheel","ferris_wheel"],["🛸","Flying saucer","flying_saucer"],["🔥","Fire","fire"],["🌛","First quarter moon face","first_quarter_moon_face"],["🌫️","Fog","fog"],["🌁","Foggy","foggy"],["🕓","Four oclock","four_oclock"],["⛲","Fountain","fountain"],["🕟","Four-thirty","four-thirty"],["⛽","Fuel pump","fuel_pump"],["🌐","Globe with meridians","globe_with_meridians"],["🌎","Globe showing americas","globe_showing_americas"],["🌏","Globe showing asia-australia","globe_showing_asia-australia"],["🌍","Globe showing europe-africa","globe_showing_europe-africa"],["🌟","Glowing star","glowing_star"],["🚄","High-speed train","high-speed_train"],["🏥","Hospital","hospital"],["🏨","Hotel","hotel"],["⚡","High voltage","high_voltage"],["🛕","Hindu temple","hindu_temple"],["♨️","Hot springs","hot_springs"],["🚥","Horizontal traffic light","horizontal_traffic_light"],["🚁","Helicopter","helicopter"],["🛖","Hut","hut"],["🏘️","Houses","houses"],["⏳","Hourglass not done","hourglass_not_done"],["🏡","House with garden","house_with_garden"],["🏠","House","house"],["⌛","Hourglass done","hourglass_done"],["🏣","Japanese post office","japanese_post_office"],["🕋","Kaaba","kaaba"],["🏯","Japanese castle","japanese_castle"],["🛴","Kick scooter","kick_scooter"],["🌗","Last quarter moon","last_quarter_moon"],["🌜","Last quarter moon face","last_quarter_moon_face"],["🚈","Light rail","light_rail"],["🏩","Love hotel","love_hotel"],["🚂","Locomotive","locomotive"],["🧳","Luggage","luggage"],["🗾","Map of japan","map_of_japan"],["🕰️","Mantelpiece clock","mantelpiece_clock"],["🦽","Manual wheelchair","manual_wheelchair"],["🌌","Milky way","milky_way"],["🚇","Metro","metro"],["🚐","Minibus","minibus"],["🚝","Monorail","monorail"],["🏍️","Motorcycle","motorcycle"],["🕌","Mosque","mosque"],["🗻","Mount fuji","mount_fuji"],["🛣️","Motorway","motorway"],["🦼","Motorized wheelchair","motorized_wheelchair"],["⛰️","Mountain","mountain"],["🛵","Motor scooter","motor_scooter"],["🛥️","Motor boat","motor_boat"],["🚞","Mountain railway","mountain_railway"],["🚠","Mountain cableway","mountain_cableway"],["🌑","New moon","new_moon"],["🌚","New moon face","new_moon_face"],["🕘","Nine oclock","nine_oclock"],["🏞️","National park","national_park"],["🕤","Nine-thirty","nine-thirty"],["🌃","Night with stars","night_with_stars"],["🏢","Office building","office_building"],["🛢️","Oil drum","oil_drum"],["🕐","One oclock","one_oclock"],["🚖","Oncoming taxi","oncoming_taxi"],["🚘","Oncoming automobile","oncoming_automobile"],["🚍","Oncoming bus","oncoming_bus"],["🚔","Oncoming police car","oncoming_police_car"],["🕜","One-thirty","one-thirty"],["🛳️","Passenger ship","passenger_ship"],["🪂","Parachute","parachute"],["🛝","Playground slide","playground_slide"],["🛻","Pickup truck","pickup_truck"],["🏤","Post office","post_office"],["🚓","Police car","police_car"],["🚨","Police car light","police_car_light"],["🌈","Rainbow","rainbow"],["🚃","Railway car","railway_car"],["🛤️","Railway track","railway_track"],["🏎️","Racing car","racing_car"],["🛟","Ring buoy","ring_buoy"],["🛰️","Satellite","satellite"],["⛵","Sailboat","sailboat"],["🪨","Rock","rock"],["🎢","Roller coaster","roller_coaster"],["🛼","Roller skate","roller_skate"],["🪐","Ringed planet","ringed_planet"],["🚀","Rocket","rocket"],["⛩️","Shinto shrine","shinto_shrine"],["🕖","Seven oclock","seven_oclock"],["🚢","Ship","ship"],["🕢","Seven-thirty","seven-thirty"],["🌠","Shooting star","shooting_star"],["🏫","School","school"],["💺","Seat","seat"],["🛹","Skateboard","skateboard"],["🕡","Six-thirty","six-thirty"],["🕕","Six oclock","six_oclock"],["🛩️","Small airplane","small_airplane"],["⛄","Snowman without snow","snowman_without_snow"],["☃️","Snowman","snowman"],["❄️","Snowflake","snowflake"],["🏔️","Snow-capped mountain","snow-capped_mountain"],["⏱️","Stopwatch","stopwatch"],["🗽","Statue of liberty","statue_of_liberty"],["⭐","Star","star"],["🛑","Stop sign","stop_sign"],["🚙","Sport utility vehicle","sport_utility_vehicle"],["🏟️","Stadium","stadium"],["🚉","Station","station"],["🚤","Speedboat","speedboat"],["🌞","Sun with face","sun_with_face"],["🌦️","Sun behind rain cloud","sun_behind_rain_cloud"],["🚕","Taxi","taxi"],["🌅","Sunrise","sunrise"],["☀️","Sun","sun"],["🌇","Sunset","sunset"],["🌄","Sunrise over mountains","sunrise_over_mountains"],["🕍","Synagogue","synagogue"],["🌥️","Sun behind large cloud","sun_behind_large_cloud"],["🚟","Suspension railway","suspension_railway"],["⛅","Sun behind cloud","sun_behind_cloud"],["🌤️","Sun behind small cloud","sun_behind_small_cloud"],["🕒","Three oclock","three_oclock"],["⛺","Tent","tent"],["🕥","Ten-thirty","ten-thirty"],["🕙","Ten oclock","ten_oclock"],["🕞","Three-thirty","three-thirty"],["🌡️","Thermometer","thermometer"],["⏲️","Timer clock","timer_clock"],["🚊","Tram","tram"],["🌪️","Tornado","tornado"],["🚎","Trolleybus","trolleybus"],["🚜","Tractor","tractor"],["🗼","Tokyo tower","tokyo_tower"],["🚋","Tram car","tram_car"],["🚆","Train","train"],["☂️","Umbrella","umbrella"],["🚦","Vertical traffic light","vertical_traffic_light"],["🕛","Twelve oclock","twelve_oclock"],["☔","Umbrella with rain drops","umbrella_with_rain_drops"],["🌋","Volcano","volcano"],["🕑","Two oclock","two_oclock"],["🕧","Twelve-thirty","twelve-thirty"],["⛱️","Umbrella on ground","umbrella_on_ground"],["🕝","Two-thirty","two-thirty"],["🌔","Waxing gibbous moon","waxing_gibbous_moon"],["🌖","Waning gibbous moon","waning_gibbous_moon"],["🌘","Waning crescent moon","waning_crescent_moon"],["⌚","Watch","watch"],["🛞","Wheel","wheel"],["💒","Wedding","wedding"],["🌒","Waxing crescent moon","waxing_crescent_moon"],["🌊","Water wave","water_wave"],["🌬️","Wind face","wind_face"],["🪵","Wood","wood"],["🗺️","World map","world_map"]],
"Objects":[["⚗️","Alembic","alembic"],["🪗","Accordion","accordion"],["🩹","Adhesive bandage","adhesive_bandage"],["🎒","Backpack","backpack"],["🪓","Axe","axe"],["🩰","Ballet shoes","ballet_shoes"],["🧺","Basket","basket"],["🔕","Bell with slash","bell_with_slash"],["🔔","Bell","bell"],["📊","Bar chart","bar_chart"],["🧢","Billed cap","billed_cap"],["👙","Bikini","bikini"],["📘","Blue book","blue_book"],["🏹","Bow and arrow","bow_and_arrow"],["💼","Briefcase","briefcase"],["🪃","Boomerang","boomerang"],["🪣","Bucket","bucket"],["🧹","Broom","broom"],["⛓️‍💥","Broken chain","broken_chain"],["🗃️","Card file box","card_file_box"],["🕯️","Candle","candle"],["🪚","Carpentry saw","carpentry_saw"],["📷","Camera","camera"],["📉","Chart decreasing","chart_decreasing"],["💹","Chart increasing with yen","chart_increasing_with_yen"],["🚬","Cigarette","cigarette"],["🪑","Chair","chair"],["⛓️","Chains","chains"],["📈","Chart increasing","chart_increasing"],["🗜️","Clamp","clamp"],["🎬","Clapper board","clapper_board"],["📋","Clipboard","clipboard"],["📪","Closed mailbox with lowered flag","closed_mailbox_with_lowered_flag"],["⚰️","Coffin","coffin"],["🧥","Coat","coat"],["🪙","Coin","coin"],["👝","Clutch bag","clutch_bag"],["📫","Closed mailbox with raised flag","closed_mailbox_with_raised_flag"],["📕","Closed book","closed_book"],["🖍️","Crayon","crayon"],["💳","Credit card","credit_card"],["🛋️","Couch and lamp","couch_and_lamp"],["💽","Computer disk","computer_disk"],["🎛️","Control knobs","control_knobs"],["🖱️","Computer mouse","computer_mouse"],["👑","Crown","crown"],["⚔️","Crossed swords","crossed_swords"],["🩼","Crutch","crutch"],["🗡️","Dagger","dagger"],["🖥️","Desktop computer","desktop_computer"],["🪔","Diya lamp","diya_lamp"],["🧬","Dna","dna"],["💵","Dollar banknote","dollar_banknote"],["🔌","Electric plug","electric_plug"],["📀","Dvd","dvd"],["👗","Dress","dress"],["🛗","Elevator","elevator"],["🩸","Drop of blood","drop_of_blood"],["💶","Euro banknote","euro_banknote"],["✉️","Envelope","envelope"],["📩","Envelope with arrow","envelope_with_arrow"],["📁","File folder","file_folder"],["🎞️","Film frames","film_frames"],["🧯","Fire extinguisher","fire_extinguisher"],["🗄️","File cabinet","file_cabinet"],["🥿","Flat shoe","flat_shoe"],["🔦","Flashlight","flashlight"],["💎","Gem stone","gem_stone"],["🖋️","Fountain pen","fountain_pen"],["🎓","Graduation cap","graduation_cap"],["👓","Glasses","glasses"],["📗","Green book","green_book"],["🎧","Headphone","headphone"],["🔨","Hammer","hammer"],["🪮","Hair pick","hair_pick"],["🛠️","Hammer and wrench","hammer_and_wrench"],["🎸","Guitar","guitar"],["🪦","Headstone","headstone"],["👜","Handbag","handbag"],["⚒️","Hammer and pick","hammer_and_pick"],["👠","High-heeled shoe","high-heeled_shoe"],["🪝","Hook","hook"],["🥾","Hiking boot","hiking_boot"],["📥","Inbox tray","inbox_tray"],["🪪","Identification card","identification_card"],["📨","Incoming envelope","incoming_envelope"],["⌨️","Keyboard","keyboard"],["👖","Jeans","jeans"],["🔑","Key","key"],["🏷️","Label","label"],["👘","Kimono","kimono"],["🪜","Ladder","ladder"],["🥼","Lab coat","lab_coat"],["💡","Light bulb","light_bulb"],["🎚️","Level slider","level_slider"],["📒","Ledger","ledger"],["🔗","Link","link"],["💻","Laptop","laptop"],["🔒","Locked","locked"],["💄","Lipstick","lipstick"],["🧴","Lotion bottle","lotion_bottle"],["🪫","Low battery","low_battery"],["📢","Loudspeaker","loudspeaker"],["🖇️","Linked paperclips","linked_paperclips"],["🔐","Locked with key","locked_with_key"],["🧲","Magnet","magnet"],["🔎","Magnifying glass tilted right","magnifying_glass_tilted_right"],["🔍","Magnifying glass tilted left","magnifying_glass_tilted_left"],["🪘","Long drum","long_drum"],["🔏","Locked with pen","locked_with_pen"],["👞","Mans shoe","mans_shoe"],["🪇","Maracas","maracas"],["🪖","Military helmet","military_helmet"],["📝","Memo","memo"],["🪞","Mirror","mirror"],["📲","Mobile phone with arrow","mobile_phone_with_arrow"],["🗿","Moai","moai"],["🎤","Microphone","microphone"],["📣","Megaphone","megaphone"],["🔬","Microscope","microscope"],["💰","Money bag","money_bag"],["📱","Mobile phone","mobile_phone"],["🪤","Mouse trap","mouse_trap"],["🎥","Movie camera","movie_camera"],["💸","Money with wings","money_with_wings"],["🎹","Musical keyboard","musical_keyboard"],["📰","Newspaper","newspaper"],["🔇","Muted speaker","muted_speaker"],["🎶","Musical notes","musical_notes"],["🎵","Musical note","musical_note"],["👔","Necktie","necktie"],["🎼","Musical score","musical_score"],["📔","Notebook with decorative cover","notebook_with_decorative_cover"],["🩱","One-piece swimsuit","one-piece_swimsuit"],["📓","Notebook","notebook"],["🗝️","Old key","old_key"],["🔩","Nut and bolt","nut_and_bolt"],["📂","Open file folder","open_file_folder"],["💿","Optical disk","optical_disk"],["📬","Open mailbox with raised flag","open_mailbox_with_raised_flag"],["📭","Open mailbox with lowered flag","open_mailbox_with_lowered_flag"],["📤","Outbox tray","outbox_tray"],["📄","Page facing up","page_facing_up"],["📙","Orange book","orange_book"],["📦","Package","package"],["📟","Pager","pager"],["📖","Open book","open_book"],["📃","Page with curl","page_with_curl"],["🖌️","Paintbrush","paintbrush"],["✏️","Pencil","pencil"],["🖊️","Pen","pen"],["📎","Paperclip","paperclip"],["⛏️","Pick","pick"],["🪧","Placard","placard"],["🧫","Petri dish","petri_dish"],["💊","Pill","pill"],["💷","Pound banknote","pound_banknote"],["📯","Postal horn","postal_horn"],["📮","Postbox","postbox"],["🪠","Plunger","plunger"],["🖨️","Printer","printer"],["📿","Prayer beads","prayer_beads"],["👛","Purse","purse"],["📌","Pushpin","pushpin"],["🧾","Receipt","receipt"],["🪒","Razor","razor"],["📻","Radio","radio"],["⛑️","Rescue workers helmet","rescue_workers_helmet"],["💍","Ring","ring"],["🏮","Red paper lantern","red_paper_lantern"],["📍","Round pushpin","round_pushpin"],["🗞️","Rolled-up newspaper","rolled-up_newspaper"],["👟","Running shoe","running_shoe"],["📡","Satellite antenna","satellite_antenna"],["🧷","Safety pin","safety_pin"],["🦺","Safety vest","safety_vest"],["🥻","Sari","sari"],["🧻","Roll of paper","roll_of_paper"],["🪛","Screwdriver","screwdriver"],["✂️","Scissors","scissors"],["📜","Scroll","scroll"],["🛡️","Shield","shield"],["🛍️","Shopping bags","shopping_bags"],["🎷","Saxophone","saxophone"],["🧣","Scarf","scarf"],["🚿","Shower","shower"],["🛒","Shopping cart","shopping_cart"],["🩳","Shorts","shorts"],["🧦","Socks","socks"],["🧼","Soap","soap"],["🔊","Speaker high volume","speaker_high_volume"],["🔉","Speaker medium volume","speaker_medium_volume"],["📏","Straight ruler","straight_ruler"],["🗒️","Spiral notepad","spiral_notepad"],["🗓️","Spiral calendar","spiral_calendar"],["🧽","Sponge","sponge"],["🔈","Speaker low volume","speaker_low_volume"],["🩺","Stethoscope","stethoscope"],["👕","T-shirt","t-shirt"],["🕶️","Sunglasses","sunglasses"],["🎙️","Studio microphone","studio_microphone"],["💉","Syringe","syringe"],["🧪","Test tube","test_tube"],["🔭","Telescope","telescope"],["📺","Television","television"],["🚽","Toilet","toilet"],["🩴","Thong sandal","thong_sandal"],["☎️","Telephone","telephone"],["📆","Tear-off calendar","tear-off_calendar"],["📞","Telephone receiver","telephone_receiver"],["🪥","Toothbrush","toothbrush"],["🖲️","Trackball","trackball"],["📐","Triangular ruler","triangular_ruler"],["🧰","Toolbox","toolbox"],["🎺","Trumpet","trumpet"],["🎩","Top hat","top_hat"],["🎻","Violin","violin"],["🔓","Unlocked","unlocked"],["📹","Video camera","video_camera"],["📼","Videocassette","videocassette"],["🔫","Water pistol","water_pistol"],["🦯","White cane","white_cane"],["🗑️","Wastebasket","wastebasket"],["🪟","Window","window"],["👒","Womans hat","womans_hat"],["👢","Womans boot","womans_boot"],["🔧","Wrench","wrench"],["👡","Womans sandal","womans_sandal"],["🩻","X-ray","x-ray"],["👚","Womans clothes","womans_clothes"],["💴","Yen banknote","yen_banknote"]],
"Symbols":[["🆎","Ab button blood type","ab_button_blood_type"],["🅰️","A button blood type","a_button_blood_type"],["📶","Antenna bars","antenna_bars"],["🅱️","B button blood type","b_button_blood_type"],["♈","Aries","aries"],["▪️","Black small square","black_small_square"],["⚫","Black circle","black_circle"],["◼️","Black medium square","black_medium_square"],["🔲","Black square button","black_square_button"],["☣️","Biohazard","biohazard"],["◾","Black medium-small square","black_medium-small_square"],["🟦","Blue square","blue_square"],["🔆","Bright button","bright_button"],["🟤","Brown circle","brown_circle"],["🟫","Brown square","brown_square"],["♋","Cancer","cancer"],["✅","Check mark button","check_mark_button"],["🚸","Children crossing","children_crossing"],["✔️","Check mark","check_mark"],["🎦","Cinema","cinema"],["Ⓜ️","Circled m","circled_m"],["☑️","Check box with check","check_box_with_check"],["🔃","Clockwise vertical arrows","clockwise_vertical_arrows"],["🆒","Cool button","cool_button"],["🔄","Counterclockwise arrows button","counterclockwise_arrows_button"],["©️","Copyright","copyright"],["💱","Currency exchange","currency_exchange"],["❎","Cross mark button","cross_mark_button"],["❌","Cross mark","cross_mark"],["➰","Curly loop","curly_loop"],["🛃","Customs","customs"],["💠","Diamond with a dot","diamond_with_a_dot"],["🔅","Dim button","dim_button"],["‼️","Double exclamation mark","double_exclamation_mark"],["➿","Double curly loop","double_curly_loop"],["⬇️","Down arrow","down_arrow"],["➗","Divide","divide"],["🔽","Downwards button","downwards_button"],["✴️","Eight-pointed star","eight-pointed_star"],["⏏️","Eject button","eject_button"],["↙️","Down-left arrow","down-left_arrow"],["↘️","Down-right arrow","down-right_arrow"],["🔚","End arrow","end_arrow"],["⁉️","Exclamation question mark","exclamation_question_mark"],["⏪","Fast reverse button","fast_reverse_button"],["⏫","Fast up button","fast_up_button"],["⏩","Fast-forward button","fast-forward_button"],["⏬","Fast down button","fast_down_button"],["⚜️","Fleur-de-lis","fleur-de-lis"],["🟩","Green square","green_square"],["🟰","Heavy equals sign","heavy_equals_sign"],["⭕","Hollow red circle","hollow_red_circle"],["💲","Heavy dollar sign","heavy_dollar_sign"],["ℹ️","Information","information"],["🔠","Input latin uppercase","input_latin_uppercase"],["🈸","Japanese application button","japanese_application_button"],["♾️","Infinity","infinity"],["🆔","Id button","id_button"],["🔡","Input latin lowercase","input_latin_lowercase"],["🔣","Input symbols","input_symbols"],["🉑","Japanese acceptable button","japanese_acceptable_button"],["🔤","Input latin letters","input_latin_letters"],["🔢","Input numbers","input_numbers"],["🈲","Japanese prohibited button","japanese_prohibited_button"],["🔰","Japanese symbol for beginner","japanese_symbol_for_beginner"],["🈶","Japanese not free of charge button","japanese_not_free_of_charge_button"],["㊗️","Japanese congratulations button","japanese_congratulations_button"],["🈵","Japanese no vacancy button","japanese_no_vacancy_button"],["🈯","Japanese reserved button","japanese_reserved_button"],["🈴","Japanese passing grade button","japanese_passing_grade_button"],["🈷️","Japanese monthly amount button","japanese_monthly_amount_button"],["0️⃣","Keycap 0","keycap_0"],["🈹","Japanese discount button","japanese_discount_button"],["🈚","Japanese free of charge button","japanese_free_of_charge_button"],["🈳","Japanese vacancy button","japanese_vacancy_button"],["🈂️","Japanese service charge button","japanese_service_charge_button"],["㊙️","Japanese secret button","japanese_secret_button"],["🈺","Japanese open for business button","japanese_open_for_business_button"],["🈁","Japanese here button","japanese_here_button"],["🉐","Japanese bargain button","japanese_bargain_button"],["1️⃣","Keycap 1","keycap_1"],["3️⃣","Keycap 3","keycap_3"],["5️⃣","Keycap 5","keycap_5"],["🔟","Keycap 10","keycap_10"],["8️⃣","Keycap 8","keycap_8"],["7️⃣","Keycap 7","keycap_7"],["6️⃣","Keycap 6","keycap_6"],["2️⃣","Keycap 2","keycap_2"],["9️⃣","Keycap 9","keycap_9"],["🪯","Khanda","khanda"],["*️⃣","Keycap asterisk","keycap_asterisk"],["4️⃣","Keycap 4","keycap_4"],["#️⃣","Keycap hashtag","keycap_hashtag"],["🔶","Large orange diamond","large_orange_diamond"],["✝️","Latin cross","latin_cross"],["⏮️","Last track button","last_track_button"],["♌","Leo","leo"],["↔️","Left-right arrow","left-right_arrow"],["🔷","Large blue diamond","large_blue_diamond"],["♎","Libra","libra"],["⬅️","Left arrow","left_arrow"],["🛅","Left luggage","left_luggage"],["↪️","Left arrow curving right","left_arrow_curving_right"],["🚮","Litter in bin sign","litter_in_bin_sign"],["♂️","Male sign","male_sign"],["⚕️","Medical symbol","medical_symbol"],["🚹","Mens room","mens_room"],["📴","Mobile phone off","mobile_phone_off"],["🕎","Menorah","menorah"],["➖","Minus","minus"],["✖️","Multiply","multiply"],["🆕","New button","new_button"],["🔞","No one under eighteen","no_one_under_eighteen"],["⛔","No entry","no_entry"],["📛","Name badge","name_badge"],["⏭️","Next track button","next_track_button"],["📵","No mobile phones","no_mobile_phones"],["🚳","No bicycles","no_bicycles"],["🆖","Ng button","ng_button"],["🚯","No littering","no_littering"],["🕉️","Om","om"],["🚱","Non-potable water","non-potable_water"],["🅾️","O button blood type","o_button_blood_type"],["🆗","Ok button","ok_button"],["🔛","On! arrow","on!_arrow"],["🚭","No smoking","no_smoking"],["🚷","No pedestrians","no_pedestrians"],["⛎","Ophiuchus","ophiuchus"],["☦️","Orthodox cross","orthodox_cross"],["🟠","Orange circle","orange_circle"],["🟧","Orange square","orange_square"],["🅿️","P button","p_button"],["☮️","Peace symbol","peace_symbol"],["⏸️","Pause button","pause_button"],["〽️","Part alternation mark","part_alternation_mark"],["🛂","Passport control","passport_control"],["▶️","Play button","play_button"],["⏯️","Play or pause button","play_or_pause_button"],["♓","Pisces","pisces"],["🛐","Place of worship","place_of_worship"],["➕","Plus","plus"],["🚰","Potable water","potable_water"],["🚫","Prohibited","prohibited"],["🟪","Purple square","purple_square"],["🔴","Red circle","red_circle"],["♻️","Recycling symbol","recycling_symbol"],["🟣","Purple circle","purple_circle"],["⏺️","Record button","record_button"],["☢️","Radioactive","radioactive"],["🔘","Radio button","radio_button"],["®️","Registered","registered"],["➡️","Right arrow","right_arrow"],["⤴️","Right arrow curving up","right_arrow_curving_up"],["↩️","Right arrow curving left","right_arrow_curving_left"],["🔂","Repeat single button","repeat_single_button"],["🟥","Red square","red_square"],["🚻","Restroom","restroom"],["❗","Red exclamation mark","red_exclamation_mark"],["🔁","Repeat button","repeat_button"],["◀️","Reverse button","reverse_button"],["🔻","Red triangle pointed down","red_triangle_pointed_down"],["🔺","Red triangle","red_triangle"],["⤵️","Right arrow curving down","right_arrow_curving_down"],["❓","Red question mark","red_question_mark"],["♐","Sagittarius","sagittarius"],["♏","Scorpio","scorpio"],["🔸","Small orange diamond","small_orange_diamond"],["🔀","Shuffle tracks button","shuffle_tracks_button"],["🔹","Small blue diamond","small_blue_diamond"],["❇️","Sparkle","sparkle"],["🆘","Sos button","sos_button"],["🔜","Soon arrow","soon_arrow"],["⏹️","Stop button","stop_button"],["☪️","Star and crescent","star_and_crescent"],["✡️","Star of david","star_of_david"],["♉","Taurus","taurus"],["🔝","Top arrow","top_arrow"],["™️","Trade mark","trade_mark"],["🔱","Trident emblem","trident_emblem"],["⚧️","Transgender symbol","transgender_symbol"],["↖️","Up-left arrow","up-left_arrow"],["⬆️","Up arrow","up_arrow"],["🔼","Upwards button","upwards_button"],["↕️","Up-down arrow","up-down_arrow"],["🆙","Up! button","up!_button"],["↗️","Up-right arrow","up-right_arrow"],["🆚","Vs button","vs_button"],["📳","Vibration mode","vibration_mode"],["♍","Virgo","virgo"],["☸️","Wheel of dharma","wheel_of_dharma"],["〰️","Wavy dash","wavy_dash"],["❕","White exclamation mark","white_exclamation_mark"],["⚪","White circle","white_circle"],["🚾","Water closet","water_closet"],["⚠️","Warning","warning"],["♿","Wheelchair symbol","wheelchair_symbol"],["⬜","White large square","white_large_square"],["▫️","White small square","white_small_square"],["◽","White medium-small square","white_medium-small_square"],["◻️","White medium square","white_medium_square"],["🔳","White square button","white_square_button"],["🛜","Wireless","wireless"],["❔","White question mark","white_question_mark"],["🚺","Womens room","womens_room"],["🟡","Yellow circle","yellow_circle"],["☯️","Yin yang","yin_yang"],["🟨","Yellow square","yellow_square"]],
"Flags":[["🏴","Black flag","black_flag"],["🏁","Chequered flag","chequered_flag"],["🎌","Crossed flags","crossed_flags"],["🏴‍☠️","Pirate flag","pirate_flag"],["🏳️‍🌈","Rainbow flag","rainbow_flag"],["🏳️‍⚧️","Transgender flag","transgender_flag"],["🚩","Triangular flag","triangular_flag"],["🏳️","White flag","white_flag"]]};
var BAYRAK_LIST=[["AD","Andorra","Andorra"],["AE","Birleşik Arap Emirlikleri","United Arab Emirates"],["AF","Afganistan","Afghanistan"],["AG","Antigua ve Barbuda","Antigua and Barbuda"],["AI","Anguilla","Anguilla"],["AL","Arnavutluk","Albania"],["AM","Ermenistan","Armenia"],["AO","Angola","Angola"],["AQ","Antarktika","Antarctica"],["AR","Arjantin","Argentina"],["AS","Amerikan Samoası","American Samoa"],["AT","Avusturya","Austria"],["AU","Avustralya","Australia"],["AW","Aruba","Aruba"],["AX","Aland Adaları","Aland Islands"],["AZ","Azerbaycan","Azerbaijan"],["BA","Bosna-Hersek","Bosnia and Herzegovina"],["BB","Barbados","Barbados"],["BD","Bangladeş","Bangladesh"],["BE","Belçika","Belgium"],["BF","Burkina Faso","Burkina Faso"],["BG","Bulgaristan","Bulgaria"],["BH","Bahreyn","Bahrain"],["BI","Burundi","Burundi"],["BJ","Benin","Benin"],["BL","Saint Barthelemy","Saint Barthelemy"],["BM","Bermuda","Bermuda"],["BN","Brunei","Brunei"],["BO","Bolivya","Bolivia"],["BQ","Karayip Hollandası","Caribbean Netherlands"],["BR","Brezilya","Brazil"],["BS","Bahamalar","Bahamas"],["BT","Butan","Bhutan"],["BV","Bouvet Adası","Bouvet Island"],["BW","Botsvana","Botswana"],["BY","Belarus","Belarus"],["BZ","Belize","Belize"],["CA","Kanada","Canada"],["CC","Cocos Adaları","Cocos Islands"],["CD","Kongo Demokratik Cumhuriyeti","DR Congo"],["CF","Orta Afrika Cumhuriyeti","Central African Republic"],["CG","Kongo Cumhuriyeti","Republic of Congo"],["CH","İsviçre","Switzerland"],["CI","Fildişi Sahili","Ivory Coast"],["CK","Cook Adaları","Cook Islands"],["CL","Şili","Chile"],["CM","Kamerun","Cameroon"],["CN","Çin","China"],["CO","Kolombiya","Colombia"],["CR","Kosta Rika","Costa Rica"],["CU","Küba","Cuba"],["CV","Yeşil Burun Adaları","Cape Verde"],["CW","Curacao","Curacao"],["CX","Christmas Adası","Christmas Island"],["CY","Kıbrıs","Cyprus"],["CZ","Çekya","Czech Republic"],["DE","Almanya","Germany"],["DJ","Cibuti","Djibouti"],["DK","Danimarka","Denmark"],["DM","Dominika","Dominica"],["DO","Dominik Cumhuriyeti","Dominican Republic"],["DZ","Cezayir","Algeria"],["EC","Ekvador","Ecuador"],["EE","Estonya","Estonia"],["EG","Mısır","Egypt"],["EH","Batı Sahra","Western Sahara"],["ER","Eritre","Eritrea"],["ES","İspanya","Spain"],["ET","Etiyopya","Ethiopia"],["FI","Finlandiya","Finland"],["FJ","Fiji","Fiji"],["FK","Falkland Adaları","Falkland Islands"],["FM","Mikronezya","Micronesia"],["FO","Faroe Adaları","Faroe Islands"],["FR","Fransa","France"],["GA","Gabon","Gabon"],["GB","Birleşik Krallık","United Kingdom"],["GD","Grenada","Grenada"],["GE","Gürcistan","Georgia"],["GF","Fransız Guyanası","French Guiana"],["GG","Guernsey","Guernsey"],["GH","Gana","Ghana"],["GI","Cebelitarık","Gibraltar"],["GL","Grönland","Greenland"],["GM","Gambiya","Gambia"],["GN","Gine","Guinea"],["GP","Guadeloupe","Guadeloupe"],["GQ","Ekvator Ginesi","Equatorial Guinea"],["GR","Yunanistan","Greece"],["GS","Güney Georgia","South Georgia"],["GT","Guatemala","Guatemala"],["GU","Guam","Guam"],["GW","Gine-Bissau","Guinea-Bissau"],["GY","Guyana","Guyana"],["HK","Hong Kong","Hong Kong"],["HM","Heard Adası","Heard Island"],["HN","Honduras","Honduras"],["HR","Hırvatistan","Croatia"],["HT","Haiti","Haiti"],["HU","Macaristan","Hungary"],["ID","Endonezya","Indonesia"],["IE","İrlanda","Ireland"],["IL","İsrail","Israel"],["IM","Man Adası","Isle of Man"],["IN","Hindistan","India"],["IO","Britanya Hint Okyanusu Toprakları","British Indian Ocean Territory"],["IQ","Irak","Iraq"],["IR","İran","Iran"],["IS","İzlanda","Iceland"],["IT","İtalya","Italy"],["JE","Jersey","Jersey"],["JM","Jamaika","Jamaica"],["JO","Ürdün","Jordan"],["JP","Japonya","Japan"],["KE","Kenya","Kenya"],["KG","Kırgızistan","Kyrgyzstan"],["KH","Kamboçya","Cambodia"],["KI","Kiribati","Kiribati"],["KM","Komorlar","Comoros"],["KN","Saint Kitts ve Nevis","Saint Kitts and Nevis"],["KP","Kuzey Kore","North Korea"],["KR","Güney Kore","South Korea"],["KW","Kuveyt","Kuwait"],["KY","Cayman Adaları","Cayman Islands"],["KZ","Kazakistan","Kazakhstan"],["LA","Laos","Laos"],["LB","Lübnan","Lebanon"],["LC","Saint Lucia","Saint Lucia"],["LI","Lihtenştayn","Liechtenstein"],["LK","Sri Lanka","Sri Lanka"],["LR","Liberya","Liberia"],["LS","Lesoto","Lesotho"],["LT","Litvanya","Lithuania"],["LU","Lüksemburg","Luxembourg"],["LV","Letonya","Latvia"],["LY","Libya","Libya"],["MA","Fas","Morocco"],["MC","Monako","Monaco"],["MD","Moldova","Moldova"],["ME","Karadağ","Montenegro"],["MF","Saint Martin","Saint Martin"],["MG","Madagaskar","Madagascar"],["MH","Marshall Adaları","Marshall Islands"],["MK","Kuzey Makedonya","North Macedonia"],["ML","Mali","Mali"],["MM","Myanmar","Myanmar"],["MN","Moğolistan","Mongolia"],["MO","Makao","Macao"],["MP","Kuzey Mariana Adaları","Northern Mariana Islands"],["MQ","Martinik","Martinique"],["MR","Moritanya","Mauritania"],["MS","Montserrat","Montserrat"],["MT","Malta","Malta"],["MU","Mauritius","Mauritius"],["MV","Maldivler","Maldives"],["MW","Malavi","Malawi"],["MX","Meksika","Mexico"],["MY","Malezya","Malaysia"],["MZ","Mozambik","Mozambique"],["NA","Namibya","Namibia"],["NC","Yeni Kaledonya","New Caledonia"],["NE","Nijer","Niger"],["NF","Norfolk Adası","Norfolk Island"],["NG","Nijerya","Nigeria"],["NI","Nikaragua","Nicaragua"],["NL","Hollanda","Netherlands"],["NO","Norveç","Norway"],["NP","Nepal","Nepal"],["NR","Nauru","Nauru"],["NU","Niue","Niue"],["NZ","Yeni Zelanda","New Zealand"],["OM","Umman","Oman"],["PA","Panama","Panama"],["PE","Peru","Peru"],["PF","Fransız Polinezyası","French Polynesia"],["PG","Papua Yeni Gine","Papua New Guinea"],["PH","Filipinler","Philippines"],["PK","Pakistan","Pakistan"],["PL","Polonya","Poland"],["PM","Saint Pierre ve Miquelon","Saint Pierre and Miquelon"],["PN","Pitcairn Adaları","Pitcairn Islands"],["PR","Porto Riko","Puerto Rico"],["PS","Filistin","Palestine"],["PT","Portekiz","Portugal"],["PW","Palau","Palau"],["PY","Paraguay","Paraguay"],["QA","Katar","Qatar"],["RE","Reunion","Reunion"],["RO","Romanya","Romania"],["RS","Sırbistan","Serbia"],["RU","Rusya","Russia"],["RW","Ruanda","Rwanda"],["SA","Suudi Arabistan","Saudi Arabia"],["SB","Solomon Adaları","Solomon Islands"],["SC","Seyşeller","Seychelles"],["SD","Sudan","Sudan"],["SE","İsveç","Sweden"],["SG","Singapur","Singapore"],["SH","Saint Helena","Saint Helena"],["SI","Slovenya","Slovenia"],["SJ","Svalbard ve Jan Mayen","Svalbard and Jan Mayen"],["SK","Slovakya","Slovakia"],["SL","Sierra Leone","Sierra Leone"],["SM","San Marino","San Marino"],["SN","Senegal","Senegal"],["SO","Somali","Somalia"],["SR","Surinam","Suriname"],["SS","Güney Sudan","South Sudan"],["ST","Sao Tome ve Principe","Sao Tome and Principe"],["SV","El Salvador","El Salvador"],["SX","Sint Maarten","Sint Maarten"],["SY","Suriye","Syria"],["SZ","Esvatini","Eswatini"],["TC","Turks ve Caicos Adaları","Turks and Caicos Islands"],["TD","Çad","Chad"],["TF","Fransız Güney Toprakları","French Southern Territories"],["TG","Togo","Togo"],["TH","Tayland","Thailand"],["TJ","Tacikistan","Tajikistan"],["TK","Tokelau","Tokelau"],["TL","Doğu Timor","Timor-Leste"],["TM","Türkmenistan","Turkmenistan"],["TN","Tunus","Tunisia"],["TO","Tonga","Tonga"],["TR","Türkiye","Turkey"],["TT","Trinidad ve Tobago","Trinidad and Tobago"],["TV","Tuvalu","Tuvalu"],["TW","Tayvan","Taiwan"],["TZ","Tanzanya","Tanzania"],["UA","Ukrayna","Ukraine"],["UG","Uganda","Uganda"],["UM","ABD Uzak Adaları","US Minor Outlying Islands"],["US","Amerika Birleşik Devletleri","United States"],["UY","Uruguay","Uruguay"],["UZ","Özbekistan","Uzbekistan"],["VA","Vatikan","Vatican City"],["VC","Saint Vincent ve Grenadinler","Saint Vincent and the Grenadines"],["VE","Venezuela","Venezuela"],["VG","Britanya Virjin Adaları","British Virgin Islands"],["VI","ABD Virjin Adaları","US Virgin Islands"],["VN","Vietnam","Vietnam"],["VU","Vanuatu","Vanuatu"],["WF","Wallis ve Futuna","Wallis and Futuna"],["WS","Samoa","Samoa"],["XK","Kosova","Kosovo"],["YE","Yemen","Yemen"],["YT","Mayotte","Mayotte"],["ZA","Güney Afrika","South Africa"],["ZM","Zambiya","Zambia"],["ZW","Zimbabve","Zimbabwe"]];
function _bayrakCp(c){return[(0x1F1E6+c.charCodeAt(0)-65).toString(16),(0x1F1E6+c.charCodeAt(1)-65).toString(16)];}
function _bayrakEmoji(c){var cp=_bayrakCp(c);return String.fromCodePoint(parseInt(cp[0],16),parseInt(cp[1],16));}
function _bayrakUrl(c){var cp=_bayrakCp(c);return'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/'+cp.join('-')+'.png';}
function _renderBayrak(){
  _bayrakRendered=true;
  var c=document.getElementById('picker-bayrak');
  var h='<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:4px 0">';
  BAYRAK_LIST.forEach(function(b){
    var code=b[0],name=b[1],name_en=b[2].toLowerCase();
    var url=_bayrakUrl(code);
    var emoji=_bayrakEmoji(code);
    h+='<button type="button" class="e-btn" title="'+name+' ('+b[2]+')" data-code="'+code+'" data-name="'+name.toLowerCase()+'" data-name_en="'+name_en+'" data-emoji="'+emoji+'" data-url="'+url+'" onclick="_pickBayrak(this)"><img src="'+url+'" loading="lazy" style="width:32px;height:32px;object-fit:contain" onerror="this.parentNode.style.display=\'none\'"></button>';
  });
  h+='</div>';
  c.innerHTML=h;
}
function _searchBayrak(){
  var q=document.getElementById('bayrak-search').value.toLowerCase().trim();
  var c=document.getElementById('picker-bayrak');
  c.querySelectorAll('.e-btn[data-code]').forEach(function(b){
    var match=!q||b.dataset.name.indexOf(q)!==-1||b.dataset.name_en.indexOf(q)!==-1||b.dataset.code.toLowerCase()===q;
    b.style.display=match?'':'none';
  });
}
function _pickBayrak(btn){
  var emoji=btn.dataset.emoji,url=btn.dataset.url;
  _pickEmoji(emoji,'<img src="'+url+'" style="width:36px;height:36px;object-fit:contain">');
}
function _renderFluent(){
  _fluentRendered=true;
  var c=document.getElementById('picker-fluent');
  var h='';
  Object.keys(FLUENT_DATA).forEach(function(g){
    h+='<div class="fluent-cat-header" style="font-size:.72em;color:#9ca3af;margin:6px 0 3px">'+(FLUENT_LABELS[g]||g)+'</div><div class="picker-grid">';
    FLUENT_DATA[g].forEach(function(item){
      var e=item[0],n=item[1],s=item[2];
      var url='https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/'+encodeURIComponent(n)+'/3D/'+s+'_3d.png';
      h+='<button type="button" class="e-btn" title="'+n+'" data-e="'+e+'" data-n="'+n+'" data-s="'+s+'" onclick="pickFluent(this)"><img src="'+url+'" loading="lazy" style="width:32px;height:32px;object-fit:contain" onerror="this.remove()"></button>';
    });
    h+='</div>';
  });
  c.innerHTML=h;
}
function _searchFluent(){
  var q=document.getElementById('fluent-search').value.toLowerCase().trim();
  var c=document.getElementById('picker-fluent');
  var headers=c.querySelectorAll('.fluent-cat-header');
  var grids=c.querySelectorAll('.picker-grid');
  var buttons=c.querySelectorAll('.e-btn[data-s]');
  if(!q){
    headers.forEach(function(h){h.style.display='';});
    grids.forEach(function(g){g.style.display='';});
    buttons.forEach(function(b){b.style.display='';});
    return;
  }
  headers.forEach(function(h){h.style.display='none';});
  grids.forEach(function(g){g.style.display='block';});
  buttons.forEach(function(b){
    var match=b.dataset.s.indexOf(q.replace(/ /g,'_'))!==-1||(b.dataset.n||'').toLowerCase().indexOf(q)!==-1;
    b.style.display=match?'':'none';
  });
}
async function _loadDrive(){
  if(_driveLoaded)return;
  var c=document.getElementById('picker-drive');
  c.innerHTML='<div style="color:#9ca3af;padding:12px;text-align:center">⏳ Yükleniyor...</div>';
  try{
    var r=await fetch('/api/emojis');
    var d=await r.json();
    if(!d.ok){c.innerHTML='<div style="color:#fca5a5;padding:12px">❌ '+d.error+'</div>';return;}
    _driveLoaded=true;
    var h='<div class="picker-grid">';
    d.files.forEach(function(f){
      h+='<button type="button" class="e-btn" title="'+f.name+'" data-name="'+f.name+'" data-thumb="'+f.thumb+'" onclick="_pickDrive(this)"><img src="'+f.thumb+'" style="width:32px;height:32px;object-fit:contain"></button>';
    });
    h+='</div>';
    c.innerHTML=h;
  }catch(e){c.innerHTML='<div style="color:#fca5a5;padding:12px">❌ '+e.message+'</div>';}
}
function setCorrect(qi,j){
  for(var k=0;k<3;k++){
    var r=document.getElementById('q'+qi+'_row'+k);
    var b=document.getElementById('q'+qi+'_cb'+k);
    if(r)r.classList.remove('opt-correct');
    if(b){b.classList.remove('is-correct');b.textContent='○';}
  }
  var row=document.getElementById('q'+qi+'_row'+j);
  var btn=document.getElementById('q'+qi+'_cb'+j);
  if(row)row.classList.add('opt-correct');
  if(btn){btn.classList.add('is-correct');btn.textContent='✓ doğru';}
  var inp=document.getElementById('q'+qi+'_ca');
  if(inp)inp.value=j;
}

var selectedSurpriseBoxes={};
async function changeBoxApi(qi){
  var box=document.getElementById('q'+qi+'_sbimg');
  if(box)box.innerHTML='<div style="color:#9ca3af;padding:12px;text-align:center">⏳</div>';
  try{
    var r=await fetch('/api/random-surprise-box');
    var d=await r.json();
    if(!d.ok){if(box)box.innerHTML='<div style="color:#fca5a5;padding:8px">❌ '+d.error+'</div>';return;}
    selectedSurpriseBoxes[qi]=d.url;
    if(box)box.innerHTML='<img src="'+d.url+'" style="max-height:110px;max-width:100%;object-fit:contain;border-radius:8px">';
  }catch(e){
    if(box)box.innerHTML='<div style="color:#fca5a5;padding:8px">❌ '+e.message+'</div>';
  }
}

function playClick(){try{var c=new(window.AudioContext||window.webkitAudioContext)();var b=c.createBuffer(1,Math.ceil(c.sampleRate*0.04),c.sampleRate);var d=b.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-(i/d.length),3)*0.4;var s=c.createBufferSource();s.buffer=b;var g=c.createGain();g.gain.value=0.5;s.connect(g);g.connect(c.destination);s.start();setTimeout(function(){c.close();},200);}catch(e){}}

async function submit_(level, applyEdits){
  playClick();
  const allBtns=document.querySelectorAll(".sticky-btns button");
  allBtns.forEach(function(b){b.disabled=true;});
  const edits={};
  if(applyEdits){
    for(let i=0;i<N;i++){
      const isWyr=QUESTIONS[i]&&QUESTIONS[i].question_type==="would_you_rather";
      if(isWyr){
        edits[String(i)]={
          question_type:"would_you_rather",
          question_text:"Pick One!",
          visible_option:{
            label:val("q"+i+"_vl"),
            image_prompt:val("q"+i+"_vp"),
          },
          surprise_option:{
            label:val("q"+i+"_sl"),
            surprise_outcome:val("q"+i+"_so"),
            surprise_image_prompt:val("q"+i+"_sp"),
            surprise_is_good:chk("q"+i+"_sg"),
          },
          jess_reaction:val("q"+i+"_jr"),
          surprise_box_image_url:selectedSurpriseBoxes[i]||null,
          regen_visible_image:chk("q"+i+"_rv"),
          regen_surprise_image:chk("q"+i+"_rs"),
          regen_visible_stili:val("q"+i+"_stili_v")||"pixar_3d",
          regen_surprise_stili:val("q"+i+"_stili_s")||"pixar_3d",
          custom_visible_image:customImages["cv"+i]||null,
          custom_surprise_image:customImages["cs"+i]||null,
          custom_visible_video:customVideos["cvv"+i]||null,
          custom_surprise_video:customVideos["csv"+i]||null,
        };
      } else {
        edits[String(i)]={
          question_text:val("q"+i+"_qt"),
          options:[val("q"+i+"_o0"),val("q"+i+"_o1"),val("q"+i+"_o2")],
          correct_answer:parseInt(val("q"+i+"_ca"))||0,
          fun_fact:val("q"+i+"_ff"),
          image_prompt:val("q"+i+"_ip"),
          fun_fact_image_prompt:val("q"+i+"_fp"),
          option_flags:[val("q"+i+"_f0"),val("q"+i+"_f1"),val("q"+i+"_f2")],
          show_image:chk("q"+i+"_si"),
          image_show_mode:chk("q"+i+"_surp")?"surpriz":(chk("q"+i+"_flu")?"flu":"net"),
          fact_image_show_mode:chk("q"+i+"_fsurp")?"surpriz":(chk("q"+i+"_fflu")?"flu":"net"),
          regen_question_image:chk("q"+i+"_rq"),
          regen_fact_image:chk("q"+i+"_rf"),
          regen_question_stili:val("q"+i+"_stili_q")||"pixar_3d",
          regen_fact_stili:val("q"+i+"_stili_f")||"pixar_3d",
          custom_question_image:customImages["cq"+i]||null,
          custom_fact_image:customImages["cf"+i]||null,
          custom_question_video:customVideos["cqv"+i]||null,
          custom_fact_video:customVideos["cfv"+i]||null,
        };
      }
    }
    // Topic emojileri
    const te=[];
    for(let i=0;i<5;i++){const e=val("te_"+i);if(e)te.push(e);}
    if(te.length) edits.topic_emojis=te;
  }
  const msgs={
    "full+true":"Değişiklikler uygulanıyor, ses üretimi başlıyor...",
    "render_only+true":"Değişiklikler uygulanıyor, video render başlıyor...",
    "full+false":"Ses üretimi başlıyor (değişiklik uygulanmadı)...",
    "render_only+false":"Video render başlıyor (değişiklik uygulanmadı)...",
    "regen_only+true":"Değişiklikler uygulanıyor, form yeniden gönderilecek...",
  };
  const st=document.getElementById("status");
  st.style.display="block";st.className="";
  st.textContent="⏳ "+(msgs[level+"+"+applyEdits]||"Gönderiliyor...");
  try{
    const r=await fetch("/api/submit/"+JOB_ID,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({edits,approval_level:level,chat_id:CHAT_ID}),
    });
    const d=await r.json();
    if(d.ok){
      st.className="ok";
      st.textContent="✅ Gönderildi! Telegram'da bildirim alacaksın.";
      document.querySelectorAll(".sticky-btns button").forEach(b=>b.disabled=true);
    } else {
      st.className="err";st.textContent="❌ Hata: "+JSON.stringify(d);
    }
  }catch(e){st.className="err";st.textContent="❌ "+e.message;allBtns.forEach(function(b){b.disabled=false;});}
}


</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
}

function buildQuestionCard(q, i) {
  const {
    question_text = "", options = ["","",""], correct_answer = 0,
    fun_fact = "", image_prompt = "", fun_fact_image_prompt = "",
    question_image_url = null, fun_fact_image_url = null,
    show_image = true,
    image_show_mode = "net", fact_image_show_mode = "net",
    uploaded_video_url = null, uploaded_image_url = null,
    uploaded_fact_video_url = null, uploaded_fact_image_url = null,
    question_image_stili = "pixar_3d", fact_image_stili = "pixar_3d",
  } = q;
  const qStiliOpts = GORSEL_STILLERI_WORKER.map(s => `<option value="${s.v}"${question_image_stili === s.v ? " selected" : ""}>${s.l}</option>`).join("");
  const fStiliOpts = GORSEL_STILLERI_WORKER.map(s => `<option value="${s.v}"${fact_image_stili === s.v ? " selected" : ""}>${s.l}</option>`).join("");

  const flagInputs = (q.option_flags || ["","",""]).map((f, j) =>
    `<div class="emoji-cell"><button type="button" class="emoji-pick-btn" id="q${i}_f${j}_btn" onclick="editEmoji('q${i}_f${j}')">${esc(f)||"❓"}</button><input type="text" class="emoji-edit-inp" id="q${i}_f${j}" value="${esc(f)}" maxlength="8"><span class="emoji-hint">${["A","B","C"][j]}</span></div>`
  ).join("");

  const qImgContent = uploaded_video_url
    ? `<video src="${esc(uploaded_video_url)}" controls style="max-height:90px;width:100%;border-radius:6px"></video>`
    : (uploaded_image_url || question_image_url)
      ? `<img src="${esc(uploaded_image_url || question_image_url)}" alt="soru görseli">`
      : `<div class="no-img">Görsel yok</div>`;
  const fImgContent = uploaded_fact_video_url
    ? `<video src="${esc(uploaded_fact_video_url)}" controls style="max-height:90px;width:100%;border-radius:6px"></video>`
    : (uploaded_fact_image_url || fun_fact_image_url)
      ? `<img src="${esc(uploaded_fact_image_url || fun_fact_image_url)}" alt="fact görseli">`
      : `<div class="no-img">Görsel yok</div>`;

  // b) Şıklar yatayda; ✓ doğru SADECE correct_answer'da
  const optRows = options.map((o, j) =>
    `<div class="opt-row${correct_answer===j?" opt-correct":""}" id="q${i}_row${j}">` +
    `<span class="opt-lbl">${["A","B","C"][j]}</span>` +
    `<input type="text" id="q${i}_o${j}" value="${esc(o)}" placeholder="${["A","B","C"][j]}">` +
    `<button type="button" class="correct-btn${correct_answer===j?" is-correct":""}" id="q${i}_cb${j}" onclick="setCorrect(${i},${j})">${correct_answer===j?"✓ doğru":"○"}</button>` +
    `</div>`
  ).join("");

  return `<div class="card">
  <!-- a) Soru no + metin -->
  <div class="q-header" style="margin-bottom:8px">
    <span class="card-num" style="flex-shrink:0">Soru ${i + 1}</span>
    <textarea id="q${i}_qt" class="q-text">${esc(question_text)}</textarea>
  </div>
  <!-- b) Şıklar yan yana -->
  <div class="opts-list">${optRows}</div>
  <input type="hidden" id="q${i}_ca" value="${correct_answer}">
  <label class="lbl" style="margin-top:2px">Şık Emojileri <span style="color:#6b7280">(dokunarak değiştir)</span></label>
  <div class="emoji-row" style="margin-bottom:10px">${flagInputs}</div>
  <!-- c) Sol: Soru Görseli | Sağ: Prompt + butonlar -->
  <div class="row2" style="gap:10px;margin-bottom:10px">
    <div>
      <div style="font-size:.72em;color:#6b7280;margin-bottom:4px">📸 Soru Görseli</div>
      <div class="img-box" id="q${i}_qimg">${qImgContent}</div>
      <label style="display:flex;align-items:center;gap:5px;margin-top:6px;cursor:pointer">
        <input type="checkbox" id="q${i}_si" ${show_image?"checked":""} style="width:15px;height:15px;accent-color:#10b981;cursor:pointer">
        <span style="font-size:.76em;color:#d1d5db">Görseli göster <span style="color:#6b7280">(blur/açık)</span></span>
      </label>
      <label style="display:flex;align-items:center;gap:5px;margin-top:3px;cursor:pointer">
        <input type="checkbox" id="q${i}_flu" ${image_show_mode==="flu"?"checked":""} style="width:14px;height:14px;accent-color:#3b82f6;cursor:pointer">
        <span style="font-size:.75em;color:#93c5fd">🌫️ Flu göster</span>
      </label>
      <label style="display:flex;align-items:center;gap:5px;margin-top:2px;cursor:pointer">
        <input type="checkbox" id="q${i}_surp" ${image_show_mode==="surpriz"?"checked":""} style="width:14px;height:14px;accent-color:#f59e0b;cursor:pointer">
        <span style="font-size:.75em;color:#fcd34d">❓ Sürpriz kutu</span>
      </label>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <label class="lbl" style="margin:0">Soru görseli prompt</label>
      <textarea id="q${i}_ip" style="min-height:52px;flex:1">${esc(image_prompt)}</textarea>
      <div class="img-actions">
        <label class="btn-sm btn-upload" for="q${i}_cq_file">⬆ Yükle</label>
        <input type="file" id="q${i}_cq_file" accept="image/*" onchange="handleFileChange(this,'q${i}_qimg','cq${i}',false)">
        <label class="btn-sm btn-upload" style="border-color:#6366f1;color:#a5b4fc" for="q${i}_cqv_file">🎬 Video</label>
        <input type="file" id="q${i}_cqv_file" accept=".mp4,.mov,.webm" onchange="handleFileChange(this,'q${i}_qimg','cqv${i}',true)">
        <select id="q${i}_stili_q" style="padding:3px 5px;font-size:.76em;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:4px">${qStiliOpts}</select>
        <button type="button" class="btn-sm btn-regen" id="q${i}_rq_btn" onclick="toggleRegen('q${i}_rq','q${i}_rq_btn','cq${i}')">🔄 Yeniden Üret</button>
        <input type="checkbox" id="q${i}_rq" style="display:none">
      </div>
    </div>
  </div>
  <!-- d) Fun Fact tam genişlik -->
  <label class="lbl">Fun Fact</label>
  <textarea id="q${i}_ff" style="margin-bottom:10px">${esc(fun_fact)}</textarea>
  <!-- e) Sol: Fact Görseli | Sağ: Fact Prompt + butonlar -->
  <div class="row2" style="gap:10px">
    <div>
      <div style="font-size:.72em;color:#6b7280;margin-bottom:4px">🌟 Fact Görseli</div>
      <div class="img-box" id="q${i}_fimg">${fImgContent}</div>
      <label style="display:flex;align-items:center;gap:5px;margin-top:4px;cursor:pointer">
        <input type="checkbox" id="q${i}_fflu" ${fact_image_show_mode==="flu"?"checked":""} style="width:14px;height:14px;accent-color:#3b82f6;cursor:pointer">
        <span style="font-size:.75em;color:#93c5fd">🌫️ Flu göster</span>
      </label>
      <label style="display:flex;align-items:center;gap:5px;margin-top:2px;cursor:pointer">
        <input type="checkbox" id="q${i}_fsurp" ${fact_image_show_mode==="surpriz"?"checked":""} style="width:14px;height:14px;accent-color:#f59e0b;cursor:pointer">
        <span style="font-size:.75em;color:#fcd34d">❓ Sürpriz kutu</span>
      </label>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <label class="lbl" style="margin:0">Fact görseli prompt</label>
      <textarea id="q${i}_fp" style="min-height:52px;flex:1">${esc(fun_fact_image_prompt)}</textarea>
      <div class="img-actions">
        <label class="btn-sm btn-upload" for="q${i}_cf_file">⬆ Yükle</label>
        <input type="file" id="q${i}_cf_file" accept="image/*" onchange="handleFileChange(this,'q${i}_fimg','cf${i}',false)">
        <label class="btn-sm btn-upload" style="border-color:#6366f1;color:#a5b4fc" for="q${i}_cfv_file">🎬 Video</label>
        <input type="file" id="q${i}_cfv_file" accept=".mp4,.mov,.webm" onchange="handleFileChange(this,'q${i}_fimg','cfv${i}',true)">
        <select id="q${i}_stili_f" style="padding:3px 5px;font-size:.76em;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:4px">${fStiliOpts}</select>
        <button type="button" class="btn-sm btn-regen" id="q${i}_rf_btn" onclick="toggleRegen('q${i}_rf','q${i}_rf_btn','cf${i}')">🔄 Yeniden Üret</button>
        <input type="checkbox" id="q${i}_rf" style="display:none">
      </div>
    </div>
  </div>
</div>`;
}

function buildWyrCard(q, i) {
  const {
    question_text = "Hangisini tercih edersin?",
    visible_option = {},
    surprise_option = {},
    surprise_box_image_url: sbUrl = null,
    surprise_box_urls: sbUrls = [],
    jess_reaction = "",
  } = q;
  const { label: vLabel = "", image_url: vImgUrl = null, image_prompt: vPrompt = "", image_stili: vStili = "pixar_3d" } = visible_option;
  const { label: sLabel = "Sürpriz Kutu", surprise_outcome: sOutcome = "", surprise_image_url: sImgUrl = null, surprise_image_prompt: sPrompt = "", surprise_is_good: sGood = true, surprise_image_stili: sStili = "pixar_3d" } = surprise_option;
  const vStiliOpts = GORSEL_STILLERI_WORKER.map(s => `<option value="${s.v}"${vStili === s.v ? " selected" : ""}>${s.l}</option>`).join("");
  const sStiliOpts = GORSEL_STILLERI_WORKER.map(s => `<option value="${s.v}"${sStili === s.v ? " selected" : ""}>${s.l}</option>`).join("");

  const vImgContent = vImgUrl ? `<img src="${esc(vImgUrl)}" alt="visible" style="max-height:86px;max-width:100%;border-radius:8px">` : `<div class="no-img">Görsel yok</div>`;
  const sImgContent = sImgUrl ? `<img src="${esc(sImgUrl)}" alt="surprise" style="max-height:86px;max-width:100%;border-radius:8px">` : `<div class="no-img">Görsel yok</div>`;
  const sbImgContent = sbUrl ? `<img src="${esc(sbUrl)}" id="q${i}_sbimg_inner" alt="kutu" style="max-height:110px;max-width:100%;object-fit:contain;border-radius:8px">` : `<div class="no-img">Kutu yok</div>`;
  const sbUrlsJson = JSON.stringify(sbUrls);

  return `<div class="card">
  <div class="q-header" style="margin-bottom:8px">
    <span class="card-num" style="flex-shrink:0;background:#f59e0b">🤔 WYR ${i + 1}</span>
    <span class="q-text" style="font-weight:700;font-size:18px;color:#f59e0b;padding:6px 10px;display:inline-block">PICK ONE!</span>
  </div>
  <div class="row2" style="gap:10px;margin-bottom:10px">
    <div>
      <div style="font-size:.72em;color:#10b981;font-weight:700;margin-bottom:4px">✅ Görünür Seçenek</div>
      <div class="img-box" id="q${i}_vimg">${vImgContent}</div>
      <input type="text" id="q${i}_vl" value="${esc(vLabel)}" placeholder="Etiket" style="margin-top:6px;width:100%;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:6px;padding:6px 8px;font-size:.85em">
      <label class="lbl" style="margin-top:8px;margin-bottom:0">Görsel prompt</label>
      <textarea id="q${i}_vp" style="min-height:42px">${esc(vPrompt)}</textarea>
      <div class="img-actions">
        <label class="btn-sm btn-upload" for="q${i}_cv_file">⬆ Yükle</label>
        <input type="file" id="q${i}_cv_file" accept="image/*" onchange="handleFileChange(this,'q${i}_vimg','cv${i}',false)">
        <label class="btn-sm btn-upload" style="border-color:#6366f1;color:#a5b4fc" for="q${i}_cvv_file">🎬 Video</label>
        <input type="file" id="q${i}_cvv_file" accept=".mp4,.mov,.webm" onchange="handleFileChange(this,'q${i}_vimg','cvv${i}',true)">
        <select id="q${i}_stili_v" style="padding:3px 5px;font-size:.76em;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:4px">${vStiliOpts}</select>
        <button type="button" class="btn-sm btn-regen" id="q${i}_rv_btn" onclick="toggleRegen('q${i}_rv','q${i}_rv_btn','cv${i}')">🔄 Yeniden Üret</button>
        <input type="checkbox" id="q${i}_rv" style="display:none">
      </div>
    </div>
    <div>
      <div style="font-size:.72em;color:#f59e0b;font-weight:700;margin-bottom:4px">🎁 Sürpriz Seçenek</div>
      <div style="font-size:.68em;color:#9ca3af;margin-bottom:3px">📦 Kutu görseli (video'da soru sırasında görünür)</div>
      <div class="img-box" id="q${i}_sbimg" style="height:120px;margin-bottom:4px">${sbImgContent}</div>
      <button type="button" class="btn-sm" style="margin-bottom:8px;border-color:#a78bfa;color:#c4b5fd" onclick="changeBoxApi(${i})">🔄 Başka kutu</button>
      <div style="font-size:.68em;color:#9ca3af;margin-bottom:3px">🖼 Reveal görseli (açılınca görünür)</div>
      <div class="img-box" id="q${i}_simg">${sImgContent}</div>
      <input type="text" id="q${i}_sl" value="${esc(sLabel)}" placeholder="Kapalı etiket" style="margin-top:6px;width:100%;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:6px;padding:6px 8px;font-size:.85em">
      <input type="text" id="q${i}_so" value="${esc(sOutcome)}" placeholder="Açılınca ne çıkıyor?" style="margin-top:4px;width:100%;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:6px;padding:6px 8px;font-size:.85em">
      <label style="display:flex;align-items:center;gap:5px;margin-top:6px;cursor:pointer">
        <input type="checkbox" id="q${i}_sg" ${sGood?"checked":""} style="width:15px;height:15px;accent-color:#10b981">
        <span style="font-size:.76em;color:#d1d5db">İyi sürpriz</span>
      </label>
      <label class="lbl" style="margin-top:8px;margin-bottom:0">Görsel prompt</label>
      <textarea id="q${i}_sp" style="min-height:42px">${esc(sPrompt)}</textarea>
      <div class="img-actions">
        <label class="btn-sm btn-upload" for="q${i}_cs_file">⬆ Yükle</label>
        <input type="file" id="q${i}_cs_file" accept="image/*" onchange="handleFileChange(this,'q${i}_simg','cs${i}',false)">
        <label class="btn-sm btn-upload" style="border-color:#6366f1;color:#a5b4fc" for="q${i}_csv_file">🎬 Video</label>
        <input type="file" id="q${i}_csv_file" accept=".mp4,.mov,.webm" onchange="handleFileChange(this,'q${i}_simg','csv${i}',true)">
        <select id="q${i}_stili_s" style="padding:3px 5px;font-size:.76em;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:4px">${sStiliOpts}</select>
        <button type="button" class="btn-sm btn-regen" id="q${i}_rs_btn" onclick="toggleRegen('q${i}_rs','q${i}_rs_btn','cs${i}')">🔄 Yeniden Üret</button>
        <input type="checkbox" id="q${i}_rs" style="display:none">
      </div>
    </div>
  </div>
  <label class="lbl">Jess Reaksiyon</label>
  <textarea id="q${i}_jr" style="margin-bottom:0">${esc(jess_reaction)}</textarea>
</div>`;
}

// ─── POST / — Telegram Webhook ────────────────────────────────
async function handleTelegram(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  // Text komutları
  if (body.message?.text) {
    const text   = String(body.message.text).trim();
    const chatId = String(body.message.chat?.id || "");
    const lower  = text.toLowerCase();

    if (lower === "/start") {
      ctx.waitUntil(telegramMesajAt(chatId, `🦊 *GeniMini Tests Bot*\n\nMevcut komutlar:\n\n/konu\\_oner — Yeni içerik için konu önerileri gönder\n/uret — Özelleştirilmiş içerik üret (form)`, env));
      return new Response("OK", { status: 200 });
    }

    if (lower === "/konu_oner" || lower === "konu öner" || lower === "konu oner") {
      ctx.waitUntil(konuOnerTetikle(chatId, env));
      return new Response("OK", { status: 200 });
    }

    if (lower === "/uret" || lower.startsWith("/uret@")) {
      const formUrl = `https://telegram-to-github.murturhan.workers.dev/uret-form?chat_id=${chatId}`;
      // Markdown v1: URL'deki _ karakteri italic trigger olur — inline link [text](url) ile koruma
      ctx.waitUntil(telegramMesajAt(chatId, `🎬 *İçerik Üretici*\n\nKonu ve ayarları belirlemek için formu doldurun:\n[Formu Aç](${formUrl})`, env));
      return new Response("OK", { status: 200 });
    }
  }

  // Buton callback'leri (mevcut, değişmedi)
  if (body.callback_query) {
    const cb     = body.callback_query;
    const cbId   = cb.id;
    const chatId = String(cb.message?.chat?.id || "");
    const data   = cb.data || "";

    ctx.waitUntil(telegramCevapla(cbId, env));

    const parts = data.split(":");
    if (parts[0] === "quiz" && parts.length >= 4) {
      const format            = parts[1];
      // GECİCİ: Shorts desteklenmiyor
      if (format === "shorts") {
        ctx.waitUntil(telegramMesajAt(chatId, "⚠️ Shorts format şimdilik devre dışı. Lütfen Long seçin.", env));
        return new Response("OK", { status: 200 });
      }
      const tarih             = parts[2];
      const idx               = parts[3];
      const mode              = parts[4] || "full";
      const questionType      = parts[5] || "mc";
      const isTest            = mode === "test";
      const questionTypeEnv   = questionType === "wyr" ? "would_you_rather" : "multiple_choice";
      const tarihKisa         = tarih.replace(/\./g, "").slice(0, 6);
      const formatSuffix      = format === "shorts" ? "S" : "L";
      const jobId             = `${tarihKisa}${idx}${formatSuffix}`;

      ctx.waitUntil(
        githubDispatch("icerik_uret", {
          job_id:        jobId,
          tarih,
          index:         idx,
          chat_id:       chatId,
          video_format:  format,
          test_mode:     isTest,
          question_type: questionTypeEnv,
        }, env)
      );
    }
  }
  return new Response("OK", { status: 200 });
}

async function konuOnerTetikle(chatId, env) {
  try {
    await telegramMesajAt(chatId, `✓ Konu öneriler hazırlanıyor, birazdan gönderilecek...`, env);
    const res = await fetch(
      `${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/00-konu-oneri.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept":               "application/vnd.github+json",
          "Authorization":        `Bearer ${env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent":           "geniminitests-worker",
          "Content-Type":         "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: {} }),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error(`konuOnerTetikle hata: ${res.status} — ${txt.substring(0, 200)}`);
      await telegramMesajAt(chatId, `❌ Workflow tetiklenemedi: ${res.status}`, env);
    } else {
      console.log("✓ 00-konu-oneri.yml dispatched via /konu_oner");
    }
  } catch (e) {
    console.error("konuOnerTetikle hata:", e.message);
  }
}

async function telegramMesajAt(chatId, text, env) {
  if (!chatId) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      }
    );
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`telegramMesajAt API hata ${res.status}:`, err);
    }
  } catch (e) {
    console.error("telegramMesajAt hata:", e.message);
  }
}

async function telegramCevapla(callbackId, env) {
  try {
    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackId }),
      }
    );
  } catch (e) { console.error("answerCallbackQuery hatası:", e.message); }
}

async function githubDispatch(eventType, payload, env) {
  const res = await fetch(
    `${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
    {
      method: "POST",
      headers: {
        "Accept":               "application/vnd.github+json",
        "Authorization":        `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent":           "geniminitests-worker",
        "Content-Type":         "application/json",
      },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    console.error(`GitHub dispatch hatası [${eventType}]: ${res.status} — ${txt.substring(0, 300)}`);
  } else {
    console.log(`✓ Dispatched: ${eventType}`, JSON.stringify(payload));
  }
}

// ─── GET /?job=ID&stage=1 — İçerik Onay Sayfası (Parça 2) ────
async function handleContentApprovalPage(request, env, url) {
  const jobId = url.searchParams.get("job") || "";
  if (!jobId) return new Response("job parametresi eksik", { status: 400 });

  const mevcut = await issueVeriOku(jobId, env);
  if (!mevcut || !mevcut.data?.job) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:system-ui;background:#1a1a2e;color:#eee;padding:32px">
      <h2>❌ Job bulunamadı</h2><p>Job ID: <code>${esc(jobId)}</code></p>
      <p>01.5-icerik-onay henüz çalışmadı veya veri yok.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html;charset=utf-8" } }
    );
  }

  const job = mevcut.data.job;
  const { baslik = "", format = "", chat_id = "", topic_emojis = [], questions = [], konu = "" } = job;

  // Server-side kart render (JS render problemini bypass eder)
  const typeOptsHtml = (qtype) =>
    ['multiple_choice','would_you_rather'].map(k =>
      `<option value="${k}"${qtype === k ? ' selected' : ''}>${k === 'multiple_choice' ? 'Çoktan Seçmeli' : 'Hangisini Tercih Edersin'}</option>`
    ).join('');

  const imgSlotHtml = (i, slotKey, slotLabel, prompt, size, showMode, fluxChecked = true, currentStil = 'pixar_3d') => {
    return `<div class="img-slot"><div class="img-slot-title">🖼 ${esc(slotLabel)}${size ? `<span style="font-size:.72em;color:#6b7280;font-weight:400;margin-left:6px">${esc(size)}</span>` : ''}</div>` +
    `<label class="lbl">Görsel Prompt (FLUX için)</label>` +
    `<textarea id="q${i}_p_${slotKey}">${esc(prompt || '')}</textarea>` +
    `<div class="stil-row" style="display:flex;align-items:center;gap:6px;margin:5px 0"><label style="font-size:.74em;color:#9ca3af;flex-shrink:0">🎨 Stil:</label><select id="q${i}_s_${slotKey}" style="flex:1;padding:3px 6px;font-size:.8em;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:5px">${stilOptsServer(currentStil)}</select></div>` +
    `<div class="flux-row"><label><input type="checkbox" id="q${i}_flux_${slotKey}"${fluxChecked ? ' checked' : ''} style="accent-color:#f59e0b"> 🎨 FLUX ile üret</label></div>` +
    `<div class="preview-box" id="q${i}_prev_${slotKey}"><span style="color:#6b7280">Önizleme yok</span></div>` +
    `<div class="upload-row">` +
    `<label for="q${i}_fi_${slotKey}" class="btn-sm btn-upload" style="cursor:pointer">📁 Resim yükle</label>` +
    `<input type="file" id="q${i}_fi_${slotKey}" class="s1-file-inp" accept="image/*" onchange="s1FileChange(this,'q${i}_prev_${slotKey}','q${i}_flux_${slotKey}','${i}_${slotKey}',${i},'${slotKey}',false)">` +
    `<label for="q${i}_fiv_${slotKey}" class="btn-sm btn-video" style="cursor:pointer">🎬 Video yükle</label>` +
    `<input type="file" id="q${i}_fiv_${slotKey}" class="s1-file-inp" accept=".mp4,.mov,.webm" onchange="s1FileChange(this,'q${i}_prev_${slotKey}','q${i}_flux_${slotKey}','${i}_${slotKey}',${i},'${slotKey}',true)">` +
    `</div></div>`;
  };

  const mcCardHtml = (q, i) => {
    const opts = (q.options || ['','','']).map((o, j) => {
      const ltr = ['A','B','C'][j];
      const isCor = q.correct_answer === j;
      return `<div class="opt-row${isCor ? ' opt-correct' : ''}" id="q${i}_row${j}">` +
        `<span class="opt-lbl">${ltr}</span>` +
        `<input type="text" id="q${i}_o${j}" value="${esc(o)}" placeholder="Şık ${ltr}">` +
        `<button type="button" class="correct-btn${isCor ? ' is-correct' : ''}" id="q${i}_cb${j}" onclick="setCorrect1(${i},${j})">${isCor ? '✓ doğru' : '○'}</button>` +
        `</div>`;
    }).join('');
    return `<label class="lbl">Soru metni</label>` +
      `<textarea id="q${i}_qt">${esc(q.question_text || '')}</textarea>` +
      `<label class="lbl" style="margin-top:8px">Şıklar</label><div class="opts-list">${opts}</div>` +
      `<input type="hidden" id="q${i}_ca" value="${q.correct_answer || 0}">` +
      `<label class="lbl">Fun Fact</label>` +
      `<textarea id="q${i}_ff">${esc(q.fun_fact || '')}</textarea>` +
      imgSlotHtml(i, 'image', 'Soru Görseli', q.image_prompt, '1920x1080', q.show_image === false ? 'surpriz' : (q.image_show_mode || 'net'), q.flux_image !== false, q.question_image_stili || 'pixar_3d') +
      imgSlotHtml(i, 'fact_image', 'Fact Görseli', q.fun_fact_image_prompt, '1920x1080', q.fact_image_show_mode || 'net', q.flux_fact_image !== false, q.fact_image_stili || 'pixar_3d');
  };

  const wyrCardHtml = (q, i) => {
    const vis = q.visible_option || {};
    const sur = q.surprise_option || {};
    return `<div class="row2">` +
      `<div class="wyr-side"><div class="section-title">✅ Görünür Seçenek</div>` +
      `<label class="lbl">Etiket</label><input type="text" id="q${i}_vl" value="${esc(vis.label || '')}" placeholder="Görünür seçenek">` +
      imgSlotHtml(i, 'visible_image', 'Görünür Görsel', vis.image_prompt, '1920x1080', vis.show_mode || 'net', q.flux_visible_image !== false, vis.image_stili || 'pixar_3d') + `</div>` +
      `<div class="wyr-side"><div class="section-title">🎁 Sürpriz Seçenek</div>` +
      `<label class="lbl">Kapalı etiket</label><input type="text" id="q${i}_sl" value="${esc(sur.label || 'Surprise Box')}">` +
      `<label class="lbl">Açılınca ne çıkıyor?</label><input type="text" id="q${i}_so" value="${esc(sur.surprise_outcome || '')}">` +
      `<label style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer;font-size:.8em"><input type="checkbox" id="q${i}_sg"${sur.surprise_is_good !== false ? ' checked' : ''} style="accent-color:#10b981"> İyi sürpriz</label>` +
      imgSlotHtml(i, 'surprise_image', 'Sürpriz Reveal Görseli', sur.surprise_image_prompt, '1920x1080', sur.show_mode || 'net', q.flux_surprise_image !== false, sur.surprise_image_stili || 'pixar_3d') + `</div></div>` +
      `<label class="lbl">Jess Reaksiyon</label><textarea id="q${i}_jr">${esc(q.jess_reaction || '')}</textarea>`;
  };

  const S1_CARD_BG_SRV = ['rgba(255,248,225,0.07)','rgba(232,245,233,0.07)','rgba(252,228,236,0.07)','rgba(225,245,254,0.07)','rgba(255,243,224,0.07)'];
  const S1_CARD_BORDER_SRV = ['#FFF8E1','#E8F5E9','#FCE4EC','#E1F5FE','#FFF3E0'];
  const serverCards = questions.map((q, i) => {
    const isWyr = q.question_type === 'would_you_rather';
    const numBadge = isWyr
      ? `<span class="card-num wyr">🤔 WYR ${i + 1}</span>`
      : `<span class="card-num">Soru ${i + 1}</span>`;
    const moveUp = i > 0
      ? `<button type="button" class="move-btn" onclick="moveQ(${i},-1)">↑</button>`
      : `<button type="button" class="move-btn" disabled>↑</button>`;
    const moveDown = i < questions.length - 1
      ? `<button type="button" class="move-btn" onclick="moveQ(${i},1)">↓</button>`
      : `<button type="button" class="move-btn" disabled>↓</button>`;
    const header = `<div class="card-header">${numBadge}${moveUp}${moveDown}` +
      `<select class="type-sel" id="q${i}_type" onchange="changeType(${i},this.value)">${typeOptsHtml(q.question_type)}</select>` +
      `<button type="button" class="del-btn" onclick="deleteQ(${i})">🗑️ Sil</button></div>`;
    const inner = isWyr ? wyrCardHtml(q, i) : mcCardHtml(q, i);
    const bg = S1_CARD_BG_SRV[i % 5];
    const bl = S1_CARD_BORDER_SRV[i % 5];
    return `<div class="card" id="card${i}" style="background:${bg};border-left:3px solid ${bl}">${header}${inner}</div>`;
  }).join('\n');

  const REGISTRY_JS = JSON.stringify({
    multiple_choice: {
      label: "Çoktan Seçmeli",
      template: { question_type: "multiple_choice", question_text: "", options: ["","",""], correct_answer: 0, fun_fact: "", image_prompt: "", fun_fact_image_prompt: "" }
    },
    would_you_rather: {
      label: "Hangisini Tercih Edersin",
      template: { question_type: "would_you_rather", question_text: "Pick One!", visible_option: { label: "", image_prompt: "" }, surprise_option: { label: "Surprise Box", surprise_outcome: "", surprise_image_prompt: "", surprise_is_good: true }, jess_reaction: "" }
    }
  });

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>İçerik Onayı: ${esc(jobId)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#111827;color:#f3f4f6;padding:0 0 60px}
.topbar{background:#1f2937;padding:12px 16px;position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #374151;flex-wrap:wrap}
.topbar-left{display:flex;flex-direction:column;gap:4px;min-width:200px;flex:1}
.topbar h1{font-size:.95em;font-weight:700;color:#a78bfa}
.topbar .meta{font-size:.72em;color:#9ca3af}
.title-inp{width:100%;background:#111827;color:#f3f4f6;border:1px solid #4b5563;border-radius:6px;padding:5px 9px;font-size:.88em}
.sticky-btns{display:flex;gap:6px;flex-wrap:wrap}
.sticky-btns button{padding:7px 12px;border:none;border-radius:6px;font-weight:700;font-size:.78em;cursor:pointer;line-height:1.3}
.ba{background:#8b5cf6;color:#fff}.bb{background:#0ea5e9;color:#fff}.bc{background:#374151;color:#d1d5db;border:1px solid #4b5563}
button:hover{opacity:.88}
.cards{padding:12px 16px}
.card{background:#1f2937;border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid #374151}
.card-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.card-num{background:#8b5cf6;color:#fff;border-radius:6px;padding:2px 10px;font-size:.8em;font-weight:700;flex-shrink:0}
.card-num.wyr{background:#f59e0b}
.type-sel{background:#111827;color:#f3f4f6;border:1px solid #4b5563;border-radius:5px;padding:4px 8px;font-size:.8em;cursor:pointer}
.del-btn{margin-left:auto;padding:4px 10px;background:#7f1d1d;color:#fca5a5;border:none;border-radius:5px;font-size:.75em;cursor:pointer}
.del-btn:hover{background:#991b1b}
.deleted-card{opacity:.4;pointer-events:none}
.deleted-banner{background:#7f1d1d;color:#fca5a5;padding:4px 10px;border-radius:4px;font-size:.75em;text-align:center;margin-bottom:6px}
label.lbl{display:block;color:#9ca3af;font-size:.74em;margin:7px 0 3px}
textarea,input[type=text],input[type=number]{width:100%;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:6px;padding:6px 9px;font-size:.86em;resize:vertical;font-family:inherit}
textarea{min-height:52px}
.opts-list{display:flex;flex-direction:row;gap:5px;margin-bottom:6px}
.opt-row{flex:1;min-width:0;display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:6px;background:#111827;border:1px solid #374151}
.opt-row.opt-correct{border-color:#10b981;background:#022c22}
.opt-lbl{font-weight:700;color:#9ca3af;font-size:.85em;min-width:16px;text-align:center;flex-shrink:0}
.opt-row input[type=text]{flex:1;margin:0;min-width:0}
.correct-btn{padding:3px 6px;border:1px solid #374151;background:#374151;color:#6b7280;border-radius:4px;font-size:.72em;cursor:pointer;white-space:nowrap;flex-shrink:0}
.correct-btn.is-correct{background:#064e3b;color:#6ee7b7;border-color:#10b981;font-weight:700}
.img-slot{background:#0f172a;border-radius:8px;padding:10px;margin-top:8px;border:1px solid #1e293b}
.img-slot-title{font-size:.76em;color:#a78bfa;font-weight:700;margin-bottom:6px}
.flux-row{display:flex;align-items:center;gap:8px;margin:6px 0}
.flux-row label{font-size:.78em;color:#fcd34d;cursor:pointer;display:flex;align-items:center;gap:5px}
.upload-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.btn-sm{padding:4px 9px;border:1px solid #4b5563;background:#374151;color:#d1d5db;border-radius:5px;font-size:.76em;cursor:pointer;transition:transform 0.08s,box-shadow 0.08s}
.btn-sm:hover{background:#4b5563}
.btn-sm:active{transform:scale(0.93)!important;box-shadow:inset 0 2px 5px rgba(0,0,0,0.5)!important}
.btn-upload{border-color:#3b82f6;color:#93c5fd}
.btn-video{border-color:#6366f1;color:#a5b4fc}
.s1-file-inp{position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0}
.preview-box{min-height:100px;background:#0d1117;border-radius:6px;display:flex;align-items:center;justify-content:center;margin-top:5px;margin-bottom:5px;overflow:hidden;font-size:.74em;color:#6b7280;border:1px dashed #374151}
.preview-box img,.preview-box video{max-height:120px;max-width:100%;border-radius:5px;display:block}
.mode-row{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 4px}
.mode-lbl{display:flex;align-items:center;gap:4px;font-size:.78em;color:#d1d5db;cursor:pointer;padding:4px 8px;border-radius:5px;border:1px solid #374151;background:#111827}
.mode-lbl:has(input:checked){border-color:#a78bfa;background:#1e1b4b;color:#c4b5fd}
input[type=radio]{accent-color:#a78bfa;cursor:pointer}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#status{margin:10px 16px;padding:10px 14px;border-radius:8px;display:none;font-weight:600;font-size:.88em}
.ok{background:#064e3b;color:#6ee7b7}.err{background:#7f1d1d;color:#fca5a5}
.add-q-row{text-align:center;margin-top:10px}
.add-q-btn{padding:10px 24px;background:#374151;color:#d1d5db;border:2px dashed #4b5563;border-radius:8px;font-size:.9em;cursor:pointer}
.add-q-btn:hover{border-color:#8b5cf6;color:#a78bfa}
#type-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;align-items:center;justify-content:center}
.type-modal-inner{background:#1f2937;border-radius:12px;padding:20px;width:90%;max-width:340px;border:1px solid #374151}
.type-modal-inner h3{font-size:.95em;color:#f3f4f6;margin-bottom:12px}
.type-option-btn{display:block;width:100%;padding:10px 14px;margin-bottom:8px;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:8px;cursor:pointer;text-align:left;font-size:.86em}
.type-option-btn:hover{border-color:#8b5cf6;background:#1a1a2e}
.section-title{font-size:.75em;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin:10px 0 5px}
.wyr-side{border:1px solid #1e293b;border-radius:8px;padding:10px;margin-bottom:8px}
.move-btn{padding:2px 8px;background:#374151;color:#a78bfa;border:1px solid #4b5563;border-radius:4px;font-size:.8em;cursor:pointer;font-weight:700;line-height:1.4}
.move-btn:hover{background:#4b5563}
.move-btn:disabled{opacity:.28;cursor:default}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-left">
    <div class="topbar h1">🦊 GeniMini — İçerik Onayı (Aşama 1)</div>
    <div class="topbar meta">📋 <b>${esc(jobId)}</b> · ${esc(format)} · ${esc(konu)}</div>
    <input type="text" id="video_baslik" class="title-inp" value="${esc(baslik)}" placeholder="Video başlığı...">
  </div>
  <div class="sticky-btns">
    <button type="button" class="bc" onclick="submitAction('save_only')">💾 Sadece<br>Kaydet</button>
    <button type="button" class="ba" onclick="submitAction('stage2_flux')">🎨 Aşama 2'ye geç<br>(FLUX üret)</button>
    <button type="button" class="bb" onclick="submitAction('skip_stage2')">⏭️ Aşama 2'yi atla<br>(direkt ses+render)</button>
  </div>
</div>
<div id="status"></div>
<div class="cards" id="cards-container">
${serverCards}
</div>
<div class="add-q-row"><button type="button" class="add-q-btn" onclick="openTypeModal()">➕ Yeni soru ekle</button></div>
<div id="type-modal">
  <div class="type-modal-inner">
    <h3>Soru tipi seç</h3>
    <div id="type-modal-options"></div>
    <button type="button" onclick="closeTypeModal()" style="margin-top:4px;width:100%;padding:8px;background:#374151;color:#9ca3af;border:none;border-radius:6px;cursor:pointer">İptal</button>
  </div>
</div>
<script>
window.addEventListener('error',function(e){var s=document.getElementById('status');if(s){s.style.display='block';s.className='err';s.textContent='JS Hatasi: '+e.message+' (satir:'+e.lineno+')';}});
window.addEventListener('DOMContentLoaded',function(){var s=document.getElementById('status');if(s){s.style.display='block';s.className='ok';s.textContent='JS calisiyor. Resim yuklemek icin asagidaki "Resim yukle" butonuna tiklayin.';}});
const JOB_ID = ${JSON.stringify(jobId)};
const CHAT_ID = ${JSON.stringify(String(chat_id))};
const REGISTRY = ${REGISTRY_JS};
let QUESTIONS = ${JSON.stringify(questions).replace(/<\//g, '<\\/')};
const deletedIdx = new Set();
const uploadedUrls = {}; // key: "i_slot" → url
const s1VideoUrls = {}; // key: "i_slot" → video url (prob6 fix — ayri track)
const S1_CARD_BG=['rgba(255,248,225,0.07)','rgba(232,245,233,0.07)','rgba(252,228,236,0.07)','rgba(225,245,254,0.07)','rgba(255,243,224,0.07)'];
const S1_CARD_BORDER=['#FFF8E1','#E8F5E9','#FCE4EC','#E1F5FE','#FFF3E0'];
const STIL_OPTS=${JSON.stringify(GORSEL_STILLERI_WORKER)};
function stilOptsHtml(sel){sel=sel||'pixar_3d';return STIL_OPTS.map(s=>'<option value="'+s.v+'"'+(sel===s.v?' selected':'')+'>'+s.l+'</option>').join('');}

function esc1(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function val(id){const e=document.getElementById(id);return e?e.value:'';}
function chk(id){const e=document.getElementById(id);return e?e.checked:false;}

function renderAllCards(){
  const c=document.getElementById('cards-container');
  c.innerHTML='';
  QUESTIONS.forEach((q,i)=>{
    const div=document.createElement('div');
    div.innerHTML=buildCard(q,i);
    c.appendChild(div);
  });
}

function buildCard(q,i){
  const isWyr=q.question_type==='would_you_rather';
  const isDel=deletedIdx.has(i);
  const numBadge=isWyr?'<span class="card-num wyr">🤔 WYR '+(i+1)+'</span>':'<span class="card-num">Soru '+(i+1)+'</span>';
  const typeOpts=Object.entries(REGISTRY).map(([k,v])=>'<option value="'+k+'"'+(q.question_type===k?' selected':'')+'>'+esc1(v.label)+'</option>').join('');
  const moveUp=i>0?'<button type="button" class="move-btn" onclick="moveQ('+i+',-1)">↑</button>':'<button type="button" class="move-btn" disabled>↑</button>';
  const moveDown=i<QUESTIONS.length-1?'<button type="button" class="move-btn" onclick="moveQ('+i+',1)">↓</button>':'<button type="button" class="move-btn" disabled>↓</button>';
  const header='<div class="card-header">'+numBadge+moveUp+moveDown+'<select class="type-sel" id="q'+i+'_type" onchange="changeType('+i+',this.value)">'+typeOpts+'</select><button type="button" class="del-btn" onclick="deleteQ('+i+')">🗑️ Sil</button></div>';
  const delBanner=isDel?'<div class="deleted-banner">Bu soru silindi (kaydet butonu ile kalici olur)</div>':'';
  const cardCls='card'+(isDel?' deleted-card':'');
  const inner=isWyr?buildWyrFields(q,i):buildMcFields(q,i);
  const bg=S1_CARD_BG[i%5];const bl=S1_CARD_BORDER[i%5];
  return '<div class="'+cardCls+'" id="card'+i+'" style="background:'+bg+';border-left:3px solid '+bl+'">'+delBanner+header+inner+'</div>';
}

function buildMcFields(q,i){
  const opts=(q.options||['','','']).map((o,j)=>'<div class="opt-row'+(q.correct_answer===j?' opt-correct':'')+'" id="q'+i+'_row'+j+'"><span class="opt-lbl">'+['A','B','C'][j]+'</span><input type="text" id="q'+i+'_o'+j+'" value="'+esc1(o)+'" placeholder="Şık '+['A','B','C'][j]+'"><button type="button" class="correct-btn'+(q.correct_answer===j?' is-correct':'')+'" id="q'+i+'_cb'+j+'" onclick="setCorrect1('+i+','+j+')">'+(q.correct_answer===j?'✓ doğru':'○')+'</button></div>').join('');
  return '<label class="lbl">Soru metni</label>'
    +'<textarea id="q'+i+'_qt">'+esc1(q.question_text)+'</textarea>'
    +'<label class="lbl" style="margin-top:8px">Şıklar</label><div class="opts-list">'+opts+'</div>'
    +'<input type="hidden" id="q'+i+'_ca" value="'+(q.correct_answer||0)+'">'
    +'<label class="lbl">Fun Fact</label>'
    +'<textarea id="q'+i+'_ff">'+esc1(q.fun_fact)+'</textarea>'
    +buildImgSlot(i,'image','Soru Görseli',q.image_prompt,'1920x1080',q.image_show_mode||(q.show_image===false?'surpriz':'net'),q.flux_image!==false,q.question_image_stili||'pixar_3d')
    +buildImgSlot(i,'fact_image','Fact Görseli',q.fun_fact_image_prompt,'1920x1080',q.fact_image_show_mode||'net',q.flux_fact_image!==false,q.fact_image_stili||'pixar_3d');
}

function buildWyrFields(q,i){
  const vis=q.visible_option||{};
  const sur=q.surprise_option||{};
  return '<div class="row2">'
    +'<div class="wyr-side"><div class="section-title">✅ Görünür Seçenek</div>'
    +'<label class="lbl">Etiket</label><input type="text" id="q'+i+'_vl" value="'+esc1(vis.label||'')+'" placeholder="Görünür seçenek">'
    +buildImgSlot(i,'visible_image','Görünür Görsel',vis.image_prompt,'1920x1080',vis.show_mode||'net',q.flux_visible_image!==false,vis.image_stili||'pixar_3d')+'</div>'
    +'<div class="wyr-side"><div class="section-title">🎁 Sürpriz Seçenek</div>'
    +'<label class="lbl">Kapalı etiket</label><input type="text" id="q'+i+'_sl" value="'+esc1(sur.label||'Surprise Box')+'">'
    +'<label class="lbl">Açılınca ne çıkıyor?</label><input type="text" id="q'+i+'_so" value="'+esc1(sur.surprise_outcome||'')+'">'
    +'<label style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer;font-size:.8em"><input type="checkbox" id="q'+i+'_sg"'+(sur.surprise_is_good!==false?' checked':'')+' style="accent-color:#10b981"> İyi sürpriz</label>'
    +buildImgSlot(i,'surprise_image','Sürpriz Reveal Görseli',sur.surprise_image_prompt,'1920x1080',sur.show_mode||'net',q.flux_surprise_image!==false,sur.surprise_image_stili||'pixar_3d')+'</div></div>'
    +'<label class="lbl">Jess Reaksiyon</label><textarea id="q'+i+'_jr">'+esc1(q.jess_reaction||'')+'</textarea>';
}

function buildImgSlot(i,slotKey,slotLabel,prompt,size,showMode,fluxChecked,currentStil){
  if(fluxChecked===undefined)fluxChecked=true;
  if(!currentStil)currentStil='pixar_3d';
  const uploadKey=i+'_'+slotKey;
  const previewHtml=uploadedUrls[uploadKey]?'<img src="'+uploadedUrls[uploadKey]+'" style="max-height:80px;border-radius:5px">':'<span>Onizleme yok</span>';
  const sizeHtml=size?'<span style="font-size:.72em;color:#6b7280;font-weight:400;margin-left:6px">'+esc1(size)+'</span>':'';
  var prevId='q'+i+'_prev_'+slotKey;
  var fluxId='q'+i+'_flux_'+slotKey;
  var sq=String.fromCharCode(39);
  var onchgImg='s1FileChange(this,'+sq+prevId+sq+','+sq+fluxId+sq+','+sq+uploadKey+sq+','+i+','+sq+slotKey+sq+',false)';
  var onchgVid='s1FileChange(this,'+sq+prevId+sq+','+sq+fluxId+sq+','+sq+uploadKey+sq+','+i+','+sq+slotKey+sq+',true)';
  return '<div class="img-slot"><div class="img-slot-title">Gorsel: '+esc1(slotLabel)+sizeHtml+'</div>'+
    '<label class="lbl">Gorsel Prompt (FLUX icin)</label>'
    +'<textarea id="q'+i+'_p_'+slotKey+'">'+esc1(prompt||'')+'</textarea>'
    +'<div class="stil-row" style="display:flex;align-items:center;gap:6px;margin:5px 0"><label style="font-size:.74em;color:#9ca3af;flex-shrink:0">Stil:</label><select id="q'+i+'_s_'+slotKey+'" style="flex:1;padding:3px 6px;font-size:.8em;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:5px">'+stilOptsHtml(currentStil)+'</select></div>'
    +'<div class="flux-row"><label><input type="checkbox" id="q'+i+'_flux_'+slotKey+'"'+(fluxChecked?' checked':'')+' style="accent-color:#f59e0b"> FLUX ile uret</label></div>'
    +'<div class="preview-box" id="q'+i+'_prev_'+slotKey+'">'+previewHtml+'</div>'
    +'<div class="upload-row">'
    +'<label for="q'+i+'_fi_'+slotKey+'" class="btn-sm btn-upload" style="cursor:pointer">Resim yukle</label>'
    +'<input type="file" id="q'+i+'_fi_'+slotKey+'" class="s1-file-inp" accept="image/*" onchange="'+onchgImg+'">'
    +'<label for="q'+i+'_fiv_'+slotKey+'" class="btn-sm btn-video" style="cursor:pointer">Video yukle</label>'
    +'<input type="file" id="q'+i+'_fiv_'+slotKey+'" class="s1-file-inp" accept=".mp4,.mov,.webm" onchange="'+onchgVid+'">'
    +'</div>'
    +'</div>';
}

function setCorrect1(qi,j){
  for(let k=0;k<3;k++){
    const r=document.getElementById('q'+qi+'_row'+k);const b=document.getElementById('q'+qi+'_cb'+k);
    if(r)r.classList.remove('opt-correct');if(b){b.classList.remove('is-correct');b.textContent='○';}
  }
  const row=document.getElementById('q'+qi+'_row'+j);const btn=document.getElementById('q'+qi+'_cb'+j);
  if(row)row.classList.add('opt-correct');if(btn){btn.classList.add('is-correct');btn.textContent='✓ doğru';}
  const inp=document.getElementById('q'+qi+'_ca');if(inp)inp.value=j;
}

function replaceCard(i){
  var old=document.getElementById('card'+i);
  if(!old)return;
  var div=document.createElement('div');
  div.innerHTML=buildCard(QUESTIONS[i],i);
  old.parentNode.replaceChild(div.firstChild,old);
}

function changeType(i,newType){
  if(QUESTIONS[i].question_type===newType)return;
  if(!confirm('Bu sorunun icerigi silinecek ve yeni sablon yuklenecek. Onayliyor musun?')){
    document.getElementById('q'+i+'_type').value=QUESTIONS[i].question_type;return;
  }
  const tmpl=JSON.parse(JSON.stringify(REGISTRY[newType].template));
  tmpl.question_type=newType;
  QUESTIONS[i]=tmpl;
  deletedIdx.delete(i);
  replaceCard(i);
}

function deleteQ(i){
  if(!confirm('Bu soru silinecek. Onayliyor musun?'))return;
  deletedIdx.add(i);
  var card=document.getElementById('card'+i);
  if(card){
    card.className='card deleted-card';
    if(!card.querySelector('.deleted-banner')){
      var b=document.createElement('div');
      b.className='deleted-banner';
      b.textContent='Bu soru silindi (kaydet butonu ile kalici olur)';
      card.insertBefore(b,card.firstChild);
    }
  }
}

function openTypeModal(){
  const opts=document.getElementById('type-modal-options');
  var sq=String.fromCharCode(39);
  opts.innerHTML=Object.entries(REGISTRY).map(([k,v])=>'<button type="button" class="type-option-btn" onclick="addQuestion('+sq+k+sq+')">'+(k==='multiple_choice'?'📝':'🤔')+' '+esc1(v.label)+'</button>').join('');
  document.getElementById('type-modal').style.display='flex';
}
function closeTypeModal(){document.getElementById('type-modal').style.display='none';}
function addQuestion(type){
  const tmpl=JSON.parse(JSON.stringify(REGISTRY[type].template));
  tmpl.question_type=type;
  QUESTIONS.push(tmpl);
  closeTypeModal();
  var i=QUESTIONS.length-1;
  var cards=document.getElementById('cards-container');
  var div=document.createElement('div');
  div.innerHTML=buildCard(QUESTIONS[i],i);
  cards.appendChild(div.firstChild);
  setTimeout(()=>{cards.lastElementChild?.scrollIntoView({behavior:'smooth'});},100);
}

// item3: kart sıralama - i ve dir (-1 yukari, +1 asagi)
function moveQ(i,dir){
  var j=i+dir;
  if(j<0||j>=QUESTIONS.length)return;
  var tmp=QUESTIONS[i];QUESTIONS[i]=QUESTIONS[j];QUESTIONS[j]=tmp;
  // deletedIdx'i takas et
  var iDel=deletedIdx.has(i);var jDel=deletedIdx.has(j);
  deletedIdx.delete(i);deletedIdx.delete(j);
  if(iDel)deletedIdx.add(j);if(jDel)deletedIdx.add(i);
  // uploadedUrls ve s1VideoUrls key'lerini takas et
  var slotKeys=['image','fact_image','visible_image','surprise_image'];
  slotKeys.forEach(function(sk){
    var ki=String(i)+'_'+sk;var kj=String(j)+'_'+sk;
    var vi=uploadedUrls[ki];var vj=uploadedUrls[kj];
    delete uploadedUrls[ki];delete uploadedUrls[kj];
    if(vi!==undefined)uploadedUrls[kj]=vi;if(vj!==undefined)uploadedUrls[ki]=vj;
    var svi=s1VideoUrls[ki];var svj=s1VideoUrls[kj];
    delete s1VideoUrls[ki];delete s1VideoUrls[kj];
    if(svi!==undefined)s1VideoUrls[kj]=svi;if(svj!==undefined)s1VideoUrls[ki]=svj;
  });
  replaceCard(i);replaceCard(j);
  var dest=document.getElementById('card'+j);if(dest)dest.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// Stage=2 handleFileChange ile aynı pattern — previewId doğrudan parametre
function s1FileChange(inp, previewId, fluxId, uploadKey, soruIdx, slotKey, isVideo){
  var file=inp.files[0];if(!file)return;
  // ADIM 1: sync göster — fonksiyon çağrıldı mı?
  var st=document.getElementById('status');
  if(st){st.style.display='block';st.className='ok';st.textContent='Dosya seçildi: '+file.name+' (arıyor: '+previewId+')';}
  var prev=document.getElementById(previewId);
  if(!prev){
    if(st){st.className='err';st.textContent='HATA: element bulunamadı id='+previewId;}
    return;
  }
  // ADIM 2: URL.createObjectURL — senkron, callback yok
  try {
    var objUrl=URL.createObjectURL(file);
    if(isVideo){
      prev.innerHTML='<video src="'+objUrl+'" controls style="max-width:100%;max-height:120px;border-radius:6px"></video>';
    }else{
      prev.innerHTML='<img src="'+objUrl+'" style="max-width:100%;max-height:120px;border-radius:6px;display:block">';
    }
    if(st){st.className='ok';st.textContent='Onizleme hazir: '+file.name+' (Drive upload devam ediyor...)';}
    prev.scrollIntoView({behavior:'smooth',block:'nearest'});
  } catch(objErr) {
    if(st){st.className='err';st.textContent='createObjectURL hatasi: '+objErr.message;}
    prev.innerHTML='<span style="color:#fca5a5">Onizleme hatasi</span>';
  }
  var cb=document.getElementById(fluxId);if(cb)cb.checked=false;
  var fd=new FormData();fd.append('file',file);
  fetch('/api/upload-medya/'+JOB_ID+'/'+soruIdx+'/'+slotKey,{method:'POST',body:fd})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.ok){
        // prob6: video URL'i ayri tut (image URL ile karismasin)
        if(isVideo){
          s1VideoUrls[uploadKey]=d.url;
          delete uploadedUrls[uploadKey];
          var prev2=document.getElementById(previewId);
          if(prev2){
            prev2.innerHTML='<div style="padding:8px;color:#10b981;font-size:.8em;text-align:center">🎬 '+esc1(file.name.substring(0,24))+'<br><span style="color:#6b7280">Drive upload tamam</span></div>';
            var rmBtn2=document.createElement('button');
            rmBtn2.type='button';rmBtn2.className='btn-sm';
            rmBtn2.style.cssText='margin-top:4px;border-color:#ef4444;color:#fca5a5';
            rmBtn2.textContent='❌ Kaldır';
            (function(pId,uKey){rmBtn2.onclick=function(){s1ClearMedia(pId,uKey,true);};})(previewId,uploadKey);
            prev2.appendChild(rmBtn2);
          }
        }else{
          uploadedUrls[uploadKey]=d.url;
          // prob1: resim kaldır butonu (preview zaten data URL, sadece remove butonu ekle)
          var prevEl=document.getElementById(previewId);
          if(prevEl){var rmBtn=prevEl.querySelector('.s1-remove-btn');if(!rmBtn){var b=document.createElement('button');b.type='button';b.className='btn-sm s1-remove-btn';b.style.cssText='display:block;margin-top:4px;border-color:#ef4444;color:#fca5a5';b.textContent='❌ Kaldır';b.onclick=function(){s1ClearMedia(previewId,uploadKey,false);};prevEl.appendChild(b);}}
        }
        if(st){st.className='ok';st.textContent='Drive upload tamam: '+file.name;}
      }else{
        if(st){st.className='err';st.textContent='Drive yükleme hatası: '+(d.error||'bilinmeyen');}
      }
    })
    .catch(function(e){if(st){st.className='err';st.textContent='Upload ağ hatası: '+e.message;}});
  inp.value='';
}

function getMode(i,slotKey){
  const el=document.querySelector('input[name="q'+i+'_mode_'+slotKey+'"]:checked');
  return el?el.value:'net';
}

// prob1: stage=1 medya kaldır
function s1ClearMedia(previewId, uploadKey, isVideo){
  if(isVideo) delete s1VideoUrls[uploadKey]; else delete uploadedUrls[uploadKey];
  var prev=document.getElementById(previewId);
  if(prev) prev.innerHTML='<span style="color:#6b7280">Önizleme yok</span>';
  var fluxId=previewId.replace('_prev_','_flux_');
  var cb=document.getElementById(fluxId);if(cb)cb.checked=true;
}

function collectSorular(){
  const result=[];
  const letters=['A','B','C'];
  QUESTIONS.forEach((q,i)=>{
    if(deletedIdx.has(i))return;
    const isWyr=q.question_type==='would_you_rather';
    const qNum=result.length+1;
    if(isWyr){
      const visMode=getMode(i,'visible_image');
      const surMode=getMode(i,'surprise_image');
      result.push({
        ...q,
        question_type:'would_you_rather',
        question_text:'Pick One!',
        visible_option:{...(q.visible_option||{}),label:val('q'+i+'_vl'),image_prompt:val('q'+i+'_p_visible_image'),image_stili:val('q'+i+'_s_visible_image')||'pixar_3d',show_mode:visMode},
        surprise_option:{...(q.surprise_option||{}),label:val('q'+i+'_sl'),surprise_outcome:val('q'+i+'_so'),surprise_image_prompt:val('q'+i+'_p_surprise_image'),surprise_image_stili:val('q'+i+'_s_surprise_image')||'pixar_3d',surprise_is_good:chk('q'+i+'_sg'),show_mode:surMode},
        jess_reaction:val('q'+i+'_jr'),
        flux_visible_image:chk('q'+i+'_flux_visible_image'),
        flux_surprise_image:chk('q'+i+'_flux_surprise_image'),
        uploaded_visible_url:uploadedUrls[i+'_visible_image']||null,
        uploaded_surprise_url:uploadedUrls[i+'_surprise_image']||null,
      });
    }else{
      const qt=val('q'+i+'_qt');
      const opts=[val('q'+i+'_o0'),val('q'+i+'_o1'),val('q'+i+'_o2')];
      const ca=parseInt(val('q'+i+'_ca'))||0;
      const ff=val('q'+i+'_ff');
      const imgMode=getMode(i,'image');
      const factMode=getMode(i,'fact_image');
      const qaText='Question '+qNum+'. '+qt+' Is it '+opts.map((o,j)=>letters[j]+': '+o).join(', ')+'?';
      const aaText='The correct answer is '+letters[ca]+': '+opts[ca]+'! '+ff;
      result.push({
        ...q,
        question_type:'multiple_choice',
        question_text:qt,
        options:opts,
        correct_answer:ca,
        fun_fact:ff,
        // prob4: option_flags stage=1'de duzenlendi, collect et
        option_flags:[val('q'+i+'_f0'),val('q'+i+'_f1'),val('q'+i+'_f2')],
        image_prompt:val('q'+i+'_p_image'),
        fun_fact_image_prompt:val('q'+i+'_p_fact_image'),
        question_image_stili:val('q'+i+'_s_image')||'pixar_3d',
        fact_image_stili:val('q'+i+'_s_fact_image')||'pixar_3d',
        image_show_mode:imgMode,
        fact_image_show_mode:factMode,
        show_image:imgMode!=='surpriz', // backward compat
        question_audio_text:qaText,
        answer_audio_text:aaText,
        flux_image:chk('q'+i+'_flux_image'),
        flux_fact_image:chk('q'+i+'_flux_fact_image'),
        uploaded_image_url:uploadedUrls[i+'_image']||null,
        uploaded_fact_image_url:uploadedUrls[i+'_fact_image']||null,
        // prob6: video upload ayri track et
        uploaded_video_url:s1VideoUrls[i+'_image']||null,
        uploaded_fact_video_url:s1VideoUrls[i+'_fact_image']||null,
      });
    }
  });
  return result;
}

function playClick(){try{var c=new(window.AudioContext||window.webkitAudioContext)();var b=c.createBuffer(1,Math.ceil(c.sampleRate*0.04),c.sampleRate);var d=b.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-(i/d.length),3)*0.4;var s=c.createBufferSource();s.buffer=b;var g=c.createGain();g.gain.value=0.5;s.connect(g);g.connect(c.destination);s.start();setTimeout(function(){c.close();},200);}catch(e){}}

async function submitAction(action){
  playClick();
  const allBtns=document.querySelectorAll('.sticky-btns button');
  allBtns.forEach(function(b){b.disabled=true;});
  const st=document.getElementById('status');
  st.style.display='block';st.className='';
  st.textContent='⏳ Kaydediliyor...';
  try{
    const sorular=collectSorular();
    const silineenOriginalIndices=[...deletedIdx];
    const r=await fetch('/api/icerik-onay/'+JOB_ID,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({video_baslik:val('video_baslik'),sorular,action,chat_id:CHAT_ID,silinen_original_indices:silineenOriginalIndices}),
    });
    const d=await r.json();
    if(d.ok){
      if(d.saved){st.className='ok';st.textContent='Kaydedildi! Workflow tetiklenmedi.';}
      else{st.className='ok';st.textContent='Gonderildi! Telegram bildirimi bekleniyor.';document.querySelectorAll('.sticky-btns button').forEach(b=>b.disabled=true);}
    }else{st.className='err';st.textContent='Hata: '+JSON.stringify(d);}
  }catch(e){st.className='err';st.textContent='Hata: '+e.message;allBtns.forEach(function(b){b.disabled=false;});}
}

// Initial render server-side yapildi — JS yalnizca type change/delete/add sonrasi re-render
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
}

// ─── POST /api/icerik-onay/:id ──────────────────────────────────
async function handleIcerikOnay(request, env, url, ctx) {
  const jobId = url.pathname.split("/").pop();
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const {
    video_baslik = "",
    sorular = [],
    action = "stage2_flux",
    chat_id = "",
    silinen_original_indices = [],
  } = body;

  const mevcut = await issueVeriOku(jobId, env);
  if (mevcut) {
    // Structured stage=1 edits (02.7 okuyacak)
    const stage1Edits = {
      _stage1_meta: { stage: "1", action, video_baslik },
      sorular,
      silinen_original_indices,
    };
    const updated = {
      job: {
        ...(mevcut.data?.job || {}),
        baslik: video_baslik,
        questions: sorular,
      },
      edits: stage1Edits,
    };
    await issueGuncelle(mevcut.number, updated, env);

    // Drive questions.json ön-güncelleme (02.7'den önce)
    ctx.waitUntil(driveQuestionsGuncelle(mevcut.data?.job?.drive_folder_id, jobId, video_baslik, sorular, env));
  }

  const chatIdStr = String(chat_id || mevcut?.data?.job?.chat_id || "");

  // save_only: sadece kaydet, workflow tetikleme
  if (action === "save_only") {
    return json({ ok: true, saved: true });
  }

  // 02.7 üzerinden dispatch — 02.7 edits'i okur, uygular, sonraki workflow'u başlatır
  const actionLabel = action === "stage2_flux" ? "FLUX gorsel uretimi" : "ses+render";
  ctx.waitUntil(telegramMesajAt(chatIdStr, `⏳ *Icerik kaydedildi!* Simdi ${actionLabel} basliyor...\n\nJob: \`${jobId}\``, env));

  ctx.waitUntil(githubDispatch("degisiklik_uygula", {
    job_id: jobId,
    chat_id: chatIdStr,
    stage1_action: action,
    stage: "1",
  }, env));

  return json({ ok: true });
}

// Drive questions.json güncelle (SA ile, hata loglama, worker devam eder)
async function driveQuestionsGuncelle(driveFolderId, jobId, baslik, sorular, env) {
  if (!driveFolderId) { console.warn("driveQuestionsGuncelle: drive_folder_id yok"); return; }
  const saJson = env.GDRIVE_SERVICE_ACCOUNT_JSON;
  if (!saJson) { console.warn("driveQuestionsGuncelle: GDRIVE_SERVICE_ACCOUNT_JSON yok"); return; }
  try {
    const token = await getGDriveTokenRW(saJson);

    // 02-ses klasörünü bul veya oluştur
    const sesFolderRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'" + driveFolderId + "' in parents and name='02-ses' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id)&pageSize=1`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const sesData = await sesFolderRes.json();
    let sesFolderId = sesData.files?.[0]?.id;
    if (!sesFolderId) {
      const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "02-ses", mimeType: "application/vnd.google-apps.folder", parents: [driveFolderId] }),
      });
      const createData = await createRes.json();
      sesFolderId = createData.id;
      console.log(`✓ driveQuestionsGuncelle: 02-ses klasörü oluşturuldu: ${sesFolderId}`);
    }
    if (!sesFolderId) { console.warn("driveQuestionsGuncelle: 02-ses klasörü oluşturulamadı"); return; }

    // questions.json dosyasını bul
    const jsonRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'" + sesFolderId + "' in parents and name='questions.json' and trashed=false")}&fields=files(id)&pageSize=1`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const jsonData = await jsonRes.json();
    const fileId = jsonData.files?.[0]?.id;

    // Mevcut varsa içeriği oku, yoksa boş başla
    let existing = {};
    if (fileId) {
      const readRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );
      existing = await readRes.json().catch(() => ({}));
    }
    const updated = { ...existing, baslik, questions: sorular, job_id: jobId };
    const content = JSON.stringify(updated, null, 2);
    const boundary = "-------314159265358979323846";

    let updateRes;
    if (fileId) {
      // Güncelle
      const meta = JSON.stringify({ name: "questions.json", mimeType: "application/json" });
      const body2 = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
        { method: "PATCH", headers: { "Authorization": `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body: body2 }
      );
    } else {
      // Yoksa oluştur
      const meta = JSON.stringify({ name: "questions.json", mimeType: "application/json", parents: [sesFolderId] });
      const body2 = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      updateRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body: body2 }
      );
    }

    if (!updateRes.ok) {
      const txt = await updateRes.text();
      console.warn(`driveQuestionsGuncelle: ${fileId ? 'güncelleme' : 'oluşturma'} hatası ${updateRes.status}: ${txt.substring(0, 200)}`);
    } else {
      console.log(`✓ Drive questions.json ${fileId ? 'güncellendi' : 'oluşturuldu'} (02-ses)`);
    }
  } catch (e) {
    console.error("driveQuestionsGuncelle hata:", e.message);
  }
}

// ─── POST /api/upload-medya/:job_id/:soru_idx/:slot_key ──────────
async function handleUploadMedya(request, env, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  // /api/upload-medya/:job_id/:soru_idx/:slot_key
  const jobId = parts[2];
  const soruIdx = parts[3];
  const slotKey = parts[4];
  if (!jobId || soruIdx === undefined || !slotKey) {
    return json({ ok: false, error: "Geçersiz path" }, 400);
  }

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return json({ ok: false, error: "OAuth secrets eksik: GOOGLE_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN Worker secrets'a eklenmeli" }, 500);
  }

  let formData;
  try { formData = await request.formData(); } catch { return json({ ok: false, error: "multipart form parse hatası" }, 400); }
  const file = formData.get("file");
  if (!file) return json({ ok: false, error: "file alanı yok" }, 400);

  // Job'dan drive_folder_id al
  const mevcut = await issueVeriOku(jobId, env);
  if (!mevcut?.data?.job?.drive_folder_id) {
    return json({ ok: false, error: "Job bulunamadı veya drive_folder_id yok" }, 404);
  }
  const driveFolderId = mevcut.data.job.drive_folder_id;

  try {
    const token = await getOAuthToken(env);

    // 01-gorseller alt klasörünü bul
    const gorselRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'" + driveFolderId + "' in parents and name='01-gorseller' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id)&pageSize=1`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const gorselData = await gorselRes.json();
    let gorselFolderId = gorselData.files?.[0]?.id;

    // Klasör yoksa oluştur
    if (!gorselFolderId) {
      const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "01-gorseller", mimeType: "application/vnd.google-apps.folder", parents: [driveFolderId] }),
      });
      const createData = await createRes.json();
      gorselFolderId = createData.id;
    }

    if (!gorselFolderId) return json({ ok: false, error: "01-gorseller klasörü oluşturulamadı" }, 500);

    // Dosyayı yükle
    const fileBuffer = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";
    const ext = file.name ? file.name.split(".").pop() : "bin";
    // gorsel-NN naming so 02.5 can discover via /^gorsel-(\d+)-/ pattern
    const soruIdxInt = parseInt(soruIdx) || 0;
    const gorselNum = (slotKey === "image" || slotKey === "visible_image") ? (2 * soruIdxInt + 1) : (2 * soruIdxInt + 2);
    const filename = `gorsel-${String(gorselNum).padStart(2, "0")}-stage1-${Date.now()}.${ext}`;

    const boundary2 = "upload-boundary-123456";
    const metaJson = JSON.stringify({ name: filename, parents: [gorselFolderId] });
    const enc = new TextEncoder();
    const metaPart = enc.encode(`--${boundary2}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary2}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const endPart = enc.encode(`\r\n--${boundary2}--`);
    const combined = new Uint8Array(metaPart.byteLength + fileBuffer.byteLength + endPart.byteLength);
    combined.set(metaPart, 0);
    combined.set(new Uint8Array(fileBuffer), metaPart.byteLength);
    combined.set(endPart, metaPart.byteLength + fileBuffer.byteLength);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary2}` },
        body: combined,
      }
    );
    if (!uploadRes.ok) {
      const txt = await uploadRes.text();
      return json({ ok: false, error: `Drive yükleme hatası ${uploadRes.status}: ${txt.substring(0, 200)}` }, 500);
    }
    const uploadData = await uploadRes.json();
    const fileId = uploadData.id;

    // Public yap
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });

    // prob6: video icin download URL (+confirm=t large file bypass), gorsel icin thumbnail URL
    const isVideoMime = mimeType.startsWith("video/") || /\.(mp4|mov|webm|avi)$/i.test(ext);
    const driveUrl = isVideoMime
      ? `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`
      : `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    return json({ ok: true, url: driveUrl, file_id: fileId, is_video: isVideoMime });

  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

// OAuth refresh token ile access token al (upload için — SA quota yok)
async function getOAuthToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `client_id=${encodeURIComponent(env.GOOGLE_OAUTH_CLIENT_ID)}&client_secret=${encodeURIComponent(env.GOOGLE_OAUTH_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(env.GOOGLE_OAUTH_REFRESH_TOKEN)}&grant_type=refresh_token`,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OAuth token hatasi ${res.status}: ${txt.substring(0, 200)}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error("OAuth: access_token gelmedi");
  return data.access_token;
}

// SA token — write scope (drive full)
async function getGDriveTokenRW(saJson) {
  const sa  = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const b64url = s => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));
  const sigInput = `${header}.${payload}`;
  const pem    = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const derBuf = Uint8Array.from(atob(pem), c => c.charCodeAt(0)).buffer;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", derBuf, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(sigInput));
  let sigStr = "";
  new Uint8Array(sigBuf).forEach(b => { sigStr += String.fromCharCode(b); });
  const jwt = `${sigInput}.${b64url(sigStr)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt,
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`${tokenRes.status} ${t.substring(0, 200)}`);
  }
  const td = await tokenRes.json();
  if (!td.access_token) throw new Error("access_token yok (RW): " + JSON.stringify(td).substring(0, 200));
  return td.access_token;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── GET /uret-form — İçerik üretim formu ────────────────────────
async function handleUretForm(request, env, url) {
  const chatId = (url.searchParams.get("chat_id") || "").replace(/[^0-9\-]/g, "");
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GeniMini — İçerik Üret</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#111827;color:#f3f4f6;padding:20px;max-width:580px;margin:0 auto}
h1{font-size:1.2em;color:#a78bfa;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.card{background:#1f2937;border-radius:12px;padding:18px;margin-bottom:14px;border:1px solid #374151}
.lbl{display:block;color:#9ca3af;font-size:.78em;margin-bottom:5px;margin-top:10px}
.lbl:first-child{margin-top:0}
textarea,input[type=number],select{width:100%;background:#111827;color:#f3f4f6;border:1px solid #374151;border-radius:6px;padding:7px 10px;font-size:.9em;font-family:inherit;resize:vertical}
textarea{min-height:80px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.total-note{font-size:.75em;color:#6b7280;margin-top:8px}
.total-note b{color:#a78bfa}
.chk-row{display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer;font-size:.9em;color:#d1d5db}
.chk-row input[type=checkbox]{width:18px;height:18px;accent-color:#8b5cf6;cursor:pointer;flex-shrink:0}
.btn{display:block;width:100%;padding:12px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;font-size:1em;font-weight:700;cursor:pointer;margin-top:16px;transition:opacity .15s}
.btn:hover{opacity:.88}.btn:disabled{opacity:.45;cursor:default}
#status{margin-top:10px;padding:10px;border-radius:6px;display:none;font-size:.85em;line-height:1.4}
.ok{background:#064e3b;color:#6ee7b7}.err{background:#7f1d1d;color:#fca5a5}
</style>
</head>
<body>
<h1>🦊 GeniMini &mdash; İçerik Üret</h1>
<div class="card">
  <label class="lbl">Konu (Topic)</label>
  <textarea id="konu" placeholder="Örn: Dinosaurs, Ocean Animals, Space Exploration, Ancient Egypt..."></textarea>
</div>
<div class="card">
  <label class="lbl">Soru Tipi Dağılımı</label>
  <div class="row2">
    <div>
      <label class="lbl">📝 Çoktan Seçmeli (MC)</label>
      <input type="number" id="mc_count" value="15" min="0" max="25" oninput="updateTotal()">
    </div>
    <div>
      <label class="lbl">🤔 Would You Rather (WYR)</label>
      <input type="number" id="wyr_count" value="0" min="0" max="25" oninput="updateTotal()">
    </div>
  </div>
  <p class="total-note">Toplam: <b id="total_soru">15</b> soru</p>
</div>
<div class="card">
  <label class="lbl">Dil / Language</label>
  <select id="dil">
    <option value="English" selected>🇬🇧 English</option>
    <option value="Turkish">🇹🇷 Turkish</option>
    <option value="Spanish">🇪🇸 Spanish</option>
    <option value="French">🇫🇷 French</option>
    <option value="German">🇩🇪 German</option>
    <option value="Arabic">🇸🇦 Arabic</option>
  </select>
</div>
<div class="card">
  <label class="lbl">Görsel Stili</label>
  <select id="gorsel_stili">
    ${stilOptsServer("pixar_3d")}
  </select>
</div>
<div class="card">
  <label class="lbl">Sahne Seçenekleri</label>
  <label class="chk-row"><input type="checkbox" id="include_intro" checked> 🎬 İntro sahnesi olsun</label>
  <label class="chk-row"><input type="checkbox" id="include_outro" checked> 🏆 Outro sahnesi olsun</label>
</div>
<button class="btn" id="btn-submit" onclick="submitForm()">🚀 İçerik Üret</button>
<div id="status"></div>
<script>
const CHAT_ID='${chatId}';
function updateTotal(){
  var mc=parseInt(document.getElementById('mc_count').value)||0;
  var wyr=parseInt(document.getElementById('wyr_count').value)||0;
  document.getElementById('total_soru').textContent=mc+wyr;
}
async function submitForm(){
  var konu=document.getElementById('konu').value.trim();
  var mc=parseInt(document.getElementById('mc_count').value)||0;
  var wyr=parseInt(document.getElementById('wyr_count').value)||0;
  var dil=document.getElementById('dil').value;
  var gorsel_stili=document.getElementById('gorsel_stili').value;
  var include_intro=document.getElementById('include_intro').checked;
  var include_outro=document.getElementById('include_outro').checked;
  var st=document.getElementById('status');
  if(!konu){st.style.display='block';st.className='err';st.textContent='Konu boş bırakılamaz!';return;}
  if(mc+wyr===0){st.style.display='block';st.className='err';st.textContent='En az 1 soru girilmeli!';return;}
  var btn=document.getElementById('btn-submit');
  btn.disabled=true;btn.textContent='⏳ Gönderiliyor...';
  st.style.display='block';st.className='';st.textContent='⏳ Gönderiliyor...';
  try{
    var r=await fetch('/uret-form-submit',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({konu,mc_count:mc,wyr_count:wyr,n_soru:mc+wyr,dil,gorsel_stili,chat_id:CHAT_ID,include_intro,include_outro})});
    var d=await r.json();
    if(d.ok){
      st.className='ok';
      st.textContent='✓ Üretim başlatıldı! Job ID: '+d.job_id+' — Telegram bildirimi gelecek.';
    }else{
      st.className='err';st.textContent='Hata: '+(d.error||'bilinmeyen');
      btn.disabled=false;btn.textContent='🚀 İçerik Üret';
    }
  }catch(e){
    st.className='err';st.textContent='Ağ hatası: '+e.message;
    btn.disabled=false;btn.textContent='🚀 İçerik Üret';
  }
}
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
}

// ─── POST /uret-form-submit — Form submit → workflow dispatch ─────
async function handleUretFormSubmit(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const { konu, mc_count, wyr_count, n_soru, dil, gorsel_stili, chat_id, include_intro, include_outro } = body;
  if (!konu || !chat_id) return json({ ok: false, error: "konu ve chat_id zorunlu" }, 400);

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const jobId = `U${yy}${mm}${dd}${String(Date.now()).slice(-4)}L`;
  const tarih = `${dd}.${mm}.20${yy}`;

  const mcN = parseInt(mc_count) || 0;
  const wyrN = parseInt(wyr_count) || 0;
  const totalN = parseInt(n_soru) || (mcN + wyrN) || 10;
  const soruTipiJson = JSON.stringify({ multiple_choice: mcN, would_you_rather: wyrN });
  const questionType = wyrN > 0 && mcN === 0 ? "would_you_rather" : "multiple_choice";

  // Dispatch senkron (ctx.waitUntil değil) — hata response'a ve Telegram'a yansısın
  let dispatchStatus = 0;
  let dispatchErrBody = "";
  try {
    const wfRes = await fetch(
      `${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/01-icerik-uret.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept":               "application/vnd.github+json",
          "Authorization":        `Bearer ${env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent":           "geniminitests-worker",
          "Content-Type":         "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            job_id:         jobId,
            tarih,
            index:          "0",
            chat_id:        String(chat_id),
            video_format:   "long",
            test_mode:      "false",
            question_type:  questionType,
            konu_override:  konu,
            n_soru:         String(totalN),
            soru_tipi_json: soruTipiJson,
            dil:            dil || "English",
            include_intro:  (include_intro !== false) ? "true" : "false",
            include_outro:  (include_outro !== false) ? "true" : "false",
            gorsel_stili:   gorsel_stili || "pixar_3d",
          },
        }),
      }
    );
    dispatchStatus = wfRes.status;
    if (!wfRes.ok) {
      dispatchErrBody = (await wfRes.text().catch(() => "")).substring(0, 200);
      console.error(`01-icerik-uret dispatch hatasi ${dispatchStatus}:`, dispatchErrBody);
    } else {
      console.log(`✓ 01-icerik-uret workflow_dispatch: job=${jobId}`);
    }
  } catch (e) {
    dispatchStatus = -1;
    dispatchErrBody = e.message;
    console.error("01-icerik-uret dispatch exception:", e.message);
  }

  if (dispatchStatus === 204) {
    ctx.waitUntil(telegramMesajAt(String(chat_id),
      `Icerik uretiliyor!\n\nKonu: ${konu}\nSoru: ${totalN} (MC:${mcN} WYR:${wyrN})\nDil: ${dil || "English"}\nStil: ${gorsel_stili || "pixar_3d"}\n\nJob ID: ${jobId}\n\nHazir olunca link gelecek...`, env));
    return json({ ok: true, job_id: jobId });
  } else {
    ctx.waitUntil(telegramMesajAt(String(chat_id),
      `HATA: Workflow dispatch basarisiz!\nStatus: ${dispatchStatus}\n${dispatchErrBody}\n\nJob ID: ${jobId}`, env));
    return json({ ok: false, job_id: jobId, dispatch_status: dispatchStatus, error: dispatchErrBody });
  }
}
