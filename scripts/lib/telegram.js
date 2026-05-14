/**
 * Telegram bildirim helper
 */

import axios from "axios";

const { TELEGRAM_BOT_TOKEN } = process.env;

export async function telegram(chatId, text) {
  if (!chatId) {
    console.warn("Telegram: chat_id boş, mesaj atılmadı.");
    return;
  }
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: chatId, text: text, parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("Telegram error:", e.message);
  }
}
