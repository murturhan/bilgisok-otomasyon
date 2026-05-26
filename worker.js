// REV 001/26MAY26 - yeni callback formatı quiz:format:tarih:idx:mode, test_mode + job_id desteği
/**
 * Cloudflare Worker — Telegram Webhook Handler
 *
 * Telegram'dan gelen inline button callback'lerini alır,
 * GitHub Actions 01-icerik-uret.yml'ı dispatch eder.
 *
 * Callback formatı:
 *   Eski: quiz:format:tarih:idx         (mode yok = full kabul edilir)
 *   Yeni: quiz:format:tarih:idx:mode    (mode = "full" veya "test")
 *
 * Env variables (Cloudflare secrets):
 *   TELEGRAM_BOT_TOKEN
 *   WORKFLOW_DISPATCH_TOKEN   (GitHub PAT, workflow:write yetkisi)
 */

const GITHUB_REPO_OWNER = "murturhan";
const GITHUB_REPO_NAME  = "bilgisok-otomasyon";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    if (body.callback_query) {
      const cb      = body.callback_query;
      const cbId    = cb.id;
      const chatId  = String(cb.message?.chat?.id || "");
      const data    = cb.data || "";

      // Callback hemen onaylanmalı (Telegram 10s timeout)
      ctx.waitUntil(telegramCevapla(cbId, env));

      // quiz:format:tarih:idx[:mode]
      const parts = data.split(":");
      if (parts[0] === "quiz" && parts.length >= 4) {
        const format = parts[1];              // "shorts" | "long"
        const tarih  = parts[2];              // "26.05.2026"
        const idx    = parts[3];              // "0" | "1" | "2"
        const mode   = parts[4] || "full";    // "full" | "test"
        const isTest = mode === "test";

        // 00-konu-oneri.js ile aynı job_id türetme mantığı
        const tarihKisa    = tarih.replace(/\./g, "").slice(0, 6); // "260526"
        const formatSuffix = format === "shorts" ? "S" : "L";
        const jobId        = `${tarihKisa}${idx}${formatSuffix}`;

        ctx.waitUntil(
          workflowDispatch({ jobId, tarih, idx, chatId, format, isTest }, env)
        );

        return new Response("OK", { status: 200 });
      }
    }

    return new Response("OK", { status: 200 });
  },
};

// ─── Telegram callback onayı ──────────────────────────────────
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
  } catch (e) {
    console.error("answerCallbackQuery hatası:", e.message);
  }
}

// ─── GitHub Actions dispatch ──────────────────────────────────
async function workflowDispatch({ jobId, tarih, idx, chatId, format, isTest }, env) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`,
    {
      method: "POST",
      headers: {
        "Accept":               "application/vnd.github+json",
        "Authorization":        `Bearer ${env.WORKFLOW_DISPATCH_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent":           "geniminitests-worker",
        "Content-Type":         "application/json",
      },
      body: JSON.stringify({
        event_type: "icerik_uret",
        client_payload: {
          job_id:       jobId,
          tarih:        tarih,
          index:        idx,
          chat_id:      chatId,
          video_format: format,
          test_mode:    isTest,
        },
      }),
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    console.error(`GitHub dispatch hatası: ${res.status} — ${txt.substring(0, 300)}`);
  } else {
    console.log(`✓ Dispatched: job=${jobId} format=${format} test=${isTest}`);
  }
}
