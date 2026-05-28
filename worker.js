// REV 009/28MAY26 - onay sayfası yeni düzen + emoji picker
/**
 * Cloudflare Worker — telegram-to-github
 *
 * Storage: GitHub Issues (GITHUB_TOKEN kullanır, KV gerekmez)
 *
 * Rotalar:
 *   POST /                  → Telegram webhook
 *   POST /api/job/:id       → Job verisini GitHub Issue'ya yaz
 *   GET  /?job=ID           → Onay sayfası HTML
 *   POST /api/submit/:id    → Form submit → edits yaz + GitHub dispatch
 *   GET  /api/edits/:id     → Editleri dön (02.7 için)
 *
 * Secrets: GITHUB_TOKEN, TELEGRAM_BOT_TOKEN
 */

const REPO_OWNER = "murturhan";
const REPO_NAME  = "bilgisok-otomasyon";

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
    if (method === "POST" && path.startsWith("/api/submit/")) {
      return handleSubmit(request, env, url, ctx);
    }
    if (method === "GET" && url.searchParams.has("job")) {
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
  const apiKey   = env.GDRIVE_API_KEY || "";
  if (!folderId) return json({ ok: false, error: "GDRIVE_EMOJI_FOLDER_ID secret eksik" });
  if (!apiKey)   return json({ ok: false, error: "GDRIVE_API_KEY secret eksik" });
  const q      = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,thumbnailLink,mimeType)");
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&key=${apiKey}&pageSize=100&orderBy=name`
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
  const qCards = questions.map((q, i) => buildQuestionCard(q, i)).join("\n");

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
.btn-sm{padding:5px 10px;border:1px solid #4b5563;background:#374151;color:#d1d5db;border-radius:5px;font-size:.78em;cursor:pointer}
.btn-sm:hover{background:#4b5563}
.btn-upload{border-color:#3b82f6;color:#93c5fd}
.btn-regen{border-color:#f59e0b;color:#fcd34d}
input[type=file]{display:none}
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
.opts-list{display:flex;flex-direction:column;gap:5px;margin-bottom:8px}
.opt-row{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:6px;background:#111827;border:1px solid #374151}
.opt-row.opt-correct{border-color:#10b981;background:#022c22}
.opt-lbl{font-weight:700;color:#9ca3af;font-size:.85em;min-width:18px;text-align:center}
.opt-row input[type=text]{flex:1;margin:0}
.correct-btn{padding:3px 8px;border:1px solid #374151;background:#374151;color:#6b7280;border-radius:4px;font-size:.75em;cursor:pointer;white-space:nowrap;flex-shrink:0}
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
    <button class="b1" onclick="submit_('full',true)">✅ Değiştir<br>+ Ses + Render</button>
    <button class="b2" onclick="submit_('render_only',true)">🎬 Değiştir<br>+ Sadece Render</button>
    <button class="b3" onclick="submit_('full',false)">▶ Ses + Render<br>(değişiklik yok)</button>
    <button class="b4" onclick="submit_('render_only',false)">⚡ Sadece Render<br>(değişiklik yok)</button>
    <button class="b5" onclick="submit_('regen_only',true)">🔄 Değiştir<br>+ Tekrar Göster</button>
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
        <button type="button" class="tab-btn active-tab" id="tab-twemoji" onclick="switchPickerTab('twemoji')">🌐 Twemoji</button>
        <button type="button" class="tab-btn" id="tab-drive" onclick="switchPickerTab('drive')">📁 Özel Emojiler</button>
      </div>
      <button type="button" onclick="closeEmojiPicker()" style="background:none;border:none;color:#9ca3af;font-size:1.3em;cursor:pointer;padding:2px 6px">✕</button>
    </div>
    <div id="picker-twemoji" style="overflow-y:auto;max-height:55vh"></div>
    <div id="picker-drive" style="display:none;overflow-y:auto;max-height:55vh"></div>
  </div>
</div>
<script>
const JOB_ID = ${JSON.stringify(jobId)};
const CHAT_ID = ${JSON.stringify(String(chat_id))};
const N = ${questions.length};
const customImages = {};

function val(id){const e=document.getElementById(id);return e?e.value:"";}
function chk(id){const e=document.getElementById(id);return e?e.checked:false;}

function triggerUpload(inputId){document.getElementById(inputId).click();}

function handleFileUpload(inputId, previewId, key){
  const inp=document.getElementById(inputId);
  inp.onchange=function(){
    const file=inp.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=function(e){
      customImages[key]=e.target.result;
      const box=document.getElementById(previewId);
      box.innerHTML='<img src="'+e.target.result+'" style="width:100%;border-radius:8px"><span class="preview-badge">✓ Yüklendi</span>';
    };
    reader.readAsDataURL(file);
  };
}

function toggleRegen(checkId, btnId, key){
  const cb=document.getElementById(checkId);
  cb.checked=!cb.checked;
  const btn=document.getElementById(btnId);
  btn.style.background=cb.checked?'#78350f':'';
  btn.style.color=cb.checked?'#fef3c7':'';
  if(cb.checked) delete customImages[key];
}

var _epTarget=null,_driveLoaded=false;
function editEmoji(inputId){
  _epTarget=inputId;
  document.getElementById('emoji-picker-modal').style.display='flex';
  switchPickerTab('twemoji');
}
function closeEmojiPicker(){
  document.getElementById('emoji-picker-modal').style.display='none';
  _epTarget=null;
}
function switchPickerTab(tab){
  ['twemoji','drive'].forEach(function(t){
    document.getElementById('picker-'+t).style.display=t===tab?'block':'none';
    document.getElementById('tab-'+t).classList.toggle('active-tab',t===tab);
  });
  if(tab==='twemoji'&&!document.getElementById('picker-twemoji').innerHTML)_renderTwemoji();
  if(tab==='drive')_loadDrive();
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
function _renderTwemoji(){
  var SETS=[
    {l:'🦊 Hayvanlar',e:['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🦆','🦅','🦉','🦇','🐺','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🦕','🐙','🐠','🐟','🐬','🐋','🦈','🐊','🦓','🐘','🦒','🦔','🐇','🦝','🦘','🐫']},
    {l:'🌿 Doğa',e:['🌿','🌱','🌲','🌳','🌴','🌵','🌾','🍀','🍁','🍂','🍃','🌺','🌸','🍄','🌊','⛰','🏔']},
    {l:'⭐ Semboller',e:['⭐','🌟','💫','✨','🌙','☀','🌈','⚡','🔥','❄','💧','🌎','🏆','🥇','🎉','🎊','🎈','🎁']},
  ];
  var h='';
  SETS.forEach(function(s){
    h+='<div style="font-size:.72em;color:#9ca3af;margin:6px 0 3px">'+s.l+'</div><div class="picker-grid">';
    s.e.forEach(function(e){h+='<button type="button" class="e-btn" data-e="'+e+'" onclick="_pickEmoji(this.dataset.e,this.dataset.e)">'+e+'</button>';});
    h+='</div>';
  });
  document.getElementById('picker-twemoji').innerHTML=h;
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
    if(b)b.classList.remove('is-correct');
  }
  var row=document.getElementById('q'+qi+'_row'+j);
  var btn=document.getElementById('q'+qi+'_cb'+j);
  if(row)row.classList.add('opt-correct');
  if(btn)btn.classList.add('is-correct');
  var inp=document.getElementById('q'+qi+'_ca');
  if(inp)inp.value=j;
}

async function submit_(level, applyEdits){
  const edits={};
  if(applyEdits){
    for(let i=0;i<N;i++){
      edits[String(i)]={
        question_text:val("q"+i+"_qt"),
        options:[val("q"+i+"_o0"),val("q"+i+"_o1"),val("q"+i+"_o2")],
        correct_answer:parseInt(val("q"+i+"_ca"))||0,
        fun_fact:val("q"+i+"_ff"),
        image_prompt:val("q"+i+"_ip"),
        fun_fact_image_prompt:val("q"+i+"_fp"),
        option_flags:[val("q"+i+"_f0"),val("q"+i+"_f1"),val("q"+i+"_f2")],
        show_image:chk("q"+i+"_si"),
        regen_question_image:chk("q"+i+"_rq"),
        regen_fact_image:chk("q"+i+"_rf"),
        custom_question_image:customImages["cq"+i]||null,
        custom_fact_image:customImages["cf"+i]||null,
      };
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
  }catch(e){st.className="err";st.textContent="❌ "+e.message;}
}

// File upload listener'larını bağla
for(let i=0;i<N;i++){
  handleFileUpload("q"+i+"_cq_file","q"+i+"_qimg","cq"+i);
  handleFileUpload("q"+i+"_cf_file","q"+i+"_fimg","cf"+i);
}
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

function buildQuestionCard(q, i) {
  const {
    question_text = "", options = ["","",""], correct_answer = 0,
    fun_fact = "", image_prompt = "", fun_fact_image_prompt = "",
    question_image_url = null, fun_fact_image_url = null,
    show_image = true,
  } = q;

  const flagInputs = (q.option_flags || ["","",""]).map((f, j) =>
    `<div class="emoji-cell"><button type="button" class="emoji-pick-btn" id="q${i}_f${j}_btn" onclick="editEmoji('q${i}_f${j}')">${esc(f)||"❓"}</button><input type="text" class="emoji-edit-inp" id="q${i}_f${j}" value="${esc(f)}" maxlength="8"><span class="emoji-hint">${["A","B","C"][j]}</span></div>`
  ).join("");

  const qImgContent = question_image_url
    ? `<img src="${esc(question_image_url)}" alt="soru görseli">`
    : `<div class="no-img">Görsel yok</div>`;
  const fImgContent = fun_fact_image_url
    ? `<img src="${esc(fun_fact_image_url)}" alt="fact görseli">`
    : `<div class="no-img">Görsel yok</div>`;

  const optRows = options.map((o, j) =>
    `<div class="opt-row${correct_answer===j?" opt-correct":""}" id="q${i}_row${j}">` +
    `<span class="opt-lbl">${["A","B","C"][j]}</span>` +
    `<input type="text" id="q${i}_o${j}" value="${esc(o)}" placeholder="${["A","B","C"][j]}">` +
    `<button type="button" class="correct-btn${correct_answer===j?" is-correct":""}" id="q${i}_cb${j}" onclick="setCorrect(${i},${j})">✓ doğru</button>` +
    `</div>`
  ).join("");

  return `<div class="card">
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer">
    <input type="checkbox" id="q${i}_si" ${show_image ? "checked" : ""} style="width:18px;height:18px;accent-color:#10b981;cursor:pointer">
    <span style="font-size:.82em;color:#d1d5db">📸 Görseli göster <span style="color:#6b7280">(soru sırasında blur, cevapla açılır)</span></span>
  </label>
  <div class="q-header">
    <span class="card-num" style="flex-shrink:0">Soru ${i + 1}</span>
    <textarea id="q${i}_qt" class="q-text">${esc(question_text)}</textarea>
  </div>
  <div class="opts-list">${optRows}</div>
  <input type="hidden" id="q${i}_ca" value="${correct_answer}">
  <label class="lbl" style="margin-top:4px">Şık Emojileri <span style="color:#6b7280">(dokunarak değiştir)</span></label>
  <div class="emoji-row">${flagInputs}</div>
  <label class="lbl">Fun Fact</label>
  <textarea id="q${i}_ff">${esc(fun_fact)}</textarea>
  <div class="row2" style="gap:8px;margin-top:10px">
    <div>
      <label class="lbl">Soru görseli prompt</label>
      <textarea id="q${i}_ip" style="min-height:38px">${esc(image_prompt)}</textarea>
      <div style="font-size:.75em;color:#9ca3af;margin:4px 0 3px">📸 Soru Görseli</div>
      <div class="img-box" id="q${i}_qimg">${qImgContent}</div>
      <div class="img-actions">
        <button type="button" class="btn-sm btn-upload" onclick="triggerUpload('q${i}_cq_file')">⬆ Yükle</button>
        <input type="file" id="q${i}_cq_file" accept="image/*">
        <button type="button" class="btn-sm btn-regen" id="q${i}_rq_btn" onclick="toggleRegen('q${i}_rq','q${i}_rq_btn','cq${i}')">🔄 Yeniden Üret</button>
        <input type="checkbox" id="q${i}_rq" style="display:none">
      </div>
    </div>
    <div>
      <label class="lbl">Fact görseli prompt</label>
      <textarea id="q${i}_fp" style="min-height:38px">${esc(fun_fact_image_prompt)}</textarea>
      <div style="font-size:.75em;color:#9ca3af;margin:4px 0 3px">🌟 Fact Görseli</div>
      <div class="img-box" id="q${i}_fimg">${fImgContent}</div>
      <div class="img-actions">
        <button type="button" class="btn-sm btn-upload" onclick="triggerUpload('q${i}_cf_file')">⬆ Yükle</button>
        <input type="file" id="q${i}_cf_file" accept="image/*">
        <button type="button" class="btn-sm btn-regen" id="q${i}_rf_btn" onclick="toggleRegen('q${i}_rf','q${i}_rf_btn','cf${i}')">🔄 Yeniden Üret</button>
        <input type="checkbox" id="q${i}_rf" style="display:none">
      </div>
    </div>
  </div>
</div>`;
}

// ─── POST / — Telegram Webhook ────────────────────────────────
async function handleTelegram(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  if (body.callback_query) {
    const cb     = body.callback_query;
    const cbId   = cb.id;
    const chatId = String(cb.message?.chat?.id || "");
    const data   = cb.data || "";

    ctx.waitUntil(telegramCevapla(cbId, env));

    const parts = data.split(":");
    if (parts[0] === "quiz" && parts.length >= 4) {
      const format       = parts[1];
      const tarih        = parts[2];
      const idx          = parts[3];
      const mode         = parts[4] || "full";
      const isTest       = mode === "test";
      const tarihKisa    = tarih.replace(/\./g, "").slice(0, 6);
      const formatSuffix = format === "shorts" ? "S" : "L";
      const jobId        = `${tarihKisa}${idx}${formatSuffix}`;

      ctx.waitUntil(
        githubDispatch("icerik_uret", {
          job_id:       jobId,
          tarih,
          index:        idx,
          chat_id:      chatId,
          video_format: format,
          test_mode:    isTest,
        }, env)
      );
    }
  }
  return new Response("OK", { status: 200 });
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
