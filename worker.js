// REV 003/27MAY26 - GitHub Issues storage (KV yerine), tam onay sayfası
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
  const { topic = "", format = "", baslik = "", questions = [], chat_id = "" } = job;
  const qCards = questions.map((q, i) => buildQuestionCard(q, i)).join("\n");

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Onay: ${esc(jobId)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#e0e0e0;padding:12px}
h1{font-size:1.3em;margin-bottom:4px}
.meta{color:#aaa;font-size:.85em;margin-bottom:16px}
.card{background:#16213e;border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid #1e2d5a}
.ch{color:#e94560;font-weight:700;font-size:1em;margin-bottom:10px}
img{max-width:100%;border-radius:6px;margin:6px 0;display:block}
label{display:block;color:#aaa;font-size:.78em;margin:8px 0 2px}
textarea,input[type=text],select{width:100%;background:#0a1628;color:#e0e0e0;border:1px solid #2a3f6f;border-radius:5px;padding:7px;font-size:.9em;resize:vertical}
textarea{min-height:60px}
.opts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.rrow{display:flex;align-items:center;gap:8px;margin:6px 0}
.rrow input[type=checkbox]{width:16px;height:16px;cursor:pointer}
.rrow label{margin:0;font-size:.85em;color:#ccc}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 8px}
button{padding:12px 18px;border:none;border-radius:8px;font-weight:700;font-size:.95em;cursor:pointer;transition:.2s}
.b-full{background:#e94560;color:#fff}
.b-regen{background:transparent;color:#e94560;border:2px solid #e94560}
.b-render{background:#533483;color:#fff}
button:hover{opacity:.85}
#status{margin-top:12px;padding:12px;border-radius:8px;display:none}
.ok{background:#0d3b0d;color:#4caf50}
.err{background:#3b0d0d;color:#f44336}
code{background:#222;padding:2px 6px;border-radius:4px;font-size:.85em}
</style>
</head>
<body>
<div style="background:#16213e;border-radius:10px;padding:14px;margin-bottom:14px">
  <h1>🦊 GeniMini Tests — Onay</h1>
  <div class="meta">Job: <code>${esc(jobId)}</code> &nbsp;|&nbsp; Format: ${esc(format)} &nbsp;|&nbsp; ${questions.length} soru</div>
  <div style="font-weight:600;color:#fff">${esc(topic)}</div>
  ${baslik ? `<div style="color:#aaa;font-size:.9em;margin-top:4px">${esc(baslik)}</div>` : ""}
</div>
<form id="frm" onsubmit="return false">
${qCards}
<div class="btns">
  <button type="button" class="b-full" onclick="submit_('full')">✅ Onayla → Ses Üret</button>
  <button type="button" class="b-regen" onclick="submit_('regen_only')">🔄 Değiştir → Tekrar İncele</button>
  <button type="button" class="b-render" onclick="submit_('render_only')">🎬 Onayla → Direkt Render</button>
</div>
<div id="status"></div>
</form>
<script>
const JOB_ID = ${JSON.stringify(jobId)};
const CHAT_ID = ${JSON.stringify(String(chat_id))};
const N = ${questions.length};
function val(id){const e=document.getElementById(id);return e?e.value:"";}
function chk(id){const e=document.getElementById(id);return e?e.checked:false;}
async function submit_(level){
  const edits={};
  for(let i=0;i<N;i++){
    edits[String(i)]={
      question_text:val("q"+i+"_qt"),
      options:[val("q"+i+"_o0"),val("q"+i+"_o1"),val("q"+i+"_o2")],
      correct_answer:parseInt(val("q"+i+"_ca"))||0,
      fun_fact:val("q"+i+"_ff"),
      image_prompt:val("q"+i+"_ip"),
      fun_fact_image_prompt:val("q"+i+"_fp"),
      regen_question_image:chk("q"+i+"_rq"),
      regen_fact_image:chk("q"+i+"_rf"),
    };
  }
  const st=document.getElementById("status");
  st.style.display="block";st.className="";st.textContent="⏳ Gönderiliyor...";
  try{
    const r=await fetch("/api/submit/"+JOB_ID,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({edits,approval_level:level,chat_id:CHAT_ID}),
    });
    const d=await r.json();
    if(d.ok){st.className="ok";st.textContent="✅ Gönderildi! Telegram'da bildirim alacaksın.";}
    else{st.className="err";st.textContent="❌ Hata: "+JSON.stringify(d);}
  }catch(e){st.className="err";st.textContent="❌ "+e.message;}
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
  } = q;
  const optInputs = options.map((o, j) =>
    `<input type="text" id="q${i}_o${j}" value="${esc(o)}">`
  ).join("");
  const caOpts = options.map((o, j) =>
    `<option value="${j}" ${correct_answer === j ? "selected" : ""}>${["A","B","C"][j]}: ${esc(o)}</option>`
  ).join("");
  return `<div class="card">
  <div class="ch">Soru ${i + 1}</div>
  ${question_image_url ? `<img src="${esc(question_image_url)}" alt="Q${i+1}">` : ""}
  <label>Soru metni</label>
  <textarea id="q${i}_qt">${esc(question_text)}</textarea>
  <label>Şıklar (A / B / C)</label>
  <div class="opts">${optInputs}</div>
  <label>Doğru cevap</label>
  <select id="q${i}_ca">${caOpts}</select>
  <label>Fun Fact</label>
  <textarea id="q${i}_ff">${esc(fun_fact)}</textarea>
  ${fun_fact_image_url ? `<img src="${esc(fun_fact_image_url)}" alt="Fact${i+1}">` : ""}
  <label>Soru görseli prompt</label>
  <textarea id="q${i}_ip">${esc(image_prompt)}</textarea>
  <div class="rrow"><input type="checkbox" id="q${i}_rq"><label for="q${i}_rq">Soru görselini yeniden üret</label></div>
  <label>Fact görseli prompt</label>
  <textarea id="q${i}_fp">${esc(fun_fact_image_prompt)}</textarea>
  <div class="rrow"><input type="checkbox" id="q${i}_rf"><label for="q${i}_rf">Fact görselini yeniden üret</label></div>
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
