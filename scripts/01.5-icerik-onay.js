// REV 001/04JUN26 - içerik onay aşaması: Telegram ile onay linki gönder (Parça 1/4)

import { jobGuncelle } from "./lib/google.js";
import { telegram } from "./lib/telegram.js";

const {
  JOB_ID,
  VIDEO_FORMAT,
  TARIH,
  CHAT_ID,
  WORKER_URL,
} = process.env;

const FORMAT = VIDEO_FORMAT || "long";

async function main() {
  if (!JOB_ID) throw new Error("JOB_ID env değişkeni zorunlu");
  if (!CHAT_ID) throw new Error("CHAT_ID env değişkeni zorunlu");

  console.log(`01.5-icerik-onay: JOB_ID=${JOB_ID}, FORMAT=${FORMAT}`);

  // Job durumunu güncelle: görsel üretim bekliyor (onay bekleniyor anlamında)
  await jobGuncelle(JOB_ID, { gorsel_status: "icerik_onay_bekleniyor" });
  console.log("✓ Job durumu güncellendi: icerik_onay_bekleniyor");

  // Onay sayfası URL (Parça 2'de worker deploy edilince aktif olacak)
  const workerBase = WORKER_URL || "https://bilgisok-worker.murturhan.workers.dev";
  const onayUrl = `${workerBase}/?job=${JOB_ID}&stage=1`;

  await telegram(
    CHAT_ID,
    `📝 *İçerik hazır! Aşama 1 onayı bekleniyor.*\n\n` +
    `🆔 \`${JOB_ID}\`\n\n` +
    `👉 [İçerik Onay Sayfası](${onayUrl})\n\n` +
    `_Onay sayfasında içeriği gözden geçirip görsel üretimini başlatabilirsiniz._`
  );

  console.log(`✓ İçerik onay link gönderildi: ${onayUrl}`);
}

main().catch((err) => {
  console.error("HATA:", err.message);
  console.error(err.stack);
  process.exit(1);
});
