// BACKUP: handleContentApprovalPage — worker.js'ten ayıklandı
// REV 035/06JUN26 tarihli worker.js state'i
// Bu dosya referans amaçlıdır, production'da kullanılmaz.

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

  const imgSlotHtml = (i, slotKey, slotLabel, prompt, size, showMode) => {
    const sm = showMode || 'flu';
    const radioName = `q${i}_mode_${slotKey}`;
    const radios = ['net','flu','surpriz'].map(v => {
      const labels = {net:'🖼️ Net göster', flu:'🌫️ Flu göster', surpriz:'❓ Sürpriz kutu'};
      return `<label class="mode-lbl"><input type="radio" name="${radioName}" value="${v}"${sm===v?' checked':''}> ${esc(labels[v])}</label>`;
    }).join('');
    return `<div class="img-slot"><div class="img-slot-title">🖼 ${esc(slotLabel)}${size ? `<span style="font-size:.72em;color:#6b7280;font-weight:400;margin-left:6px">${esc(size)}</span>` : ''}</div>` +
    `<div class="mode-row">${radios}</div>` +
    `<label class="lbl">Görsel Prompt (FLUX için)</label>` +
    `<textarea id="q${i}_p_${slotKey}">${esc(prompt || '')}</textarea>` +
    `<div class="flux-row"><label><input type="checkbox" id="q${i}_flux_${slotKey}" checked style="accent-color:#f59e0b"> 🎨 FLUX ile üret</label></div>` +
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
      imgSlotHtml(i, 'image', 'Soru Görseli', q.image_prompt, '1920x1080', q.show_image === false ? 'surpriz' : (q.image_show_mode || 'flu')) +
      imgSlotHtml(i, 'fact_image', 'Fact Görseli', q.fun_fact_image_prompt, '1920x1080', q.fact_image_show_mode || 'flu');
  };

  const wyrCardHtml = (q, i) => {
    const vis = q.visible_option || {};
    const sur = q.surprise_option || {};
    return `<div class="row2">` +
      `<div class="wyr-side"><div class="section-title">✅ Görünür Seçenek</div>` +
      `<label class="lbl">Etiket</label><input type="text" id="q${i}_vl" value="${esc(vis.label || '')}" placeholder="Görünür seçenek">` +
      imgSlotHtml(i, 'visible_image', 'Görünür Görsel', vis.image_prompt, '1920x1080', vis.show_mode || 'flu') + `</div>` +
      `<div class="wyr-side"><div class="section-title">🎁 Sürpriz Seçenek</div>` +
      `<label class="lbl">Kapalı etiket</label><input type="text" id="q${i}_sl" value="${esc(sur.label || 'Surprise Box')}">` +
      `<label class="lbl">Açılınca ne çıkıyor?</label><input type="text" id="q${i}_so" value="${esc(sur.surprise_outcome || '')}">` +
      `<label style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer;font-size:.8em"><input type="checkbox" id="q${i}_sg"${sur.surprise_is_good !== false ? ' checked' : ''} style="accent-color:#10b981"> İyi sürpriz</label>` +
      imgSlotHtml(i, 'surprise_image', 'Sürpriz Reveal Görseli', sur.surprise_image_prompt, '1920x1080', sur.show_mode || 'net') + `</div></div>` +
      `<label class="lbl">Jess Reaksiyon</label><textarea id="q${i}_jr">${esc(q.jess_reaction || '')}</textarea>`;
  };

  // ... (serverCards, REGISTRY_JS, html template — worker.js satir 1076-1457 arasi)
  // Tam HTML icin worker.js satirlari 996-1457'ye bakin.
}
