// REV 002/19SEP26 - Markdown 400 hatasinda duz metinle YENIDEN DENE, chat_id env yedegi, hata gorunur
/**
 * Telegram bildirim helper
 *
 * NEDEN DEĞİŞTİ (18EYL26 U2609180754L):
 * 07-video-montaj başarısız oldu (exit code 1, catch bloğu çalıştı) ama Telegram'a
 * HİÇBİR mesaj gelmedi. Sebep: mesajlar `parse_mode: "Markdown"` ile gönderiliyordu;
 * ffmpeg/Remotion hata metinleri `_ * [ ] ( ) \` karakterleriyle dolu olduğu için
 * Telegram 400 "can't parse entities" döndürüyor, eski kod bunu sadece console'a
 * yazıp sessizce geçiyordu. Kullanıcı hiçbir şey görmüyordu.
 *
 * Artık: Markdown reddedilirse AYNI mesaj parse_mode OLMADAN tekrar gönderilir.
 * Hata mesajı kaybolmaz.
 */

import axios from "axios";

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

const API = (metot) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${metot}`;
const TELEGRAM_MAX = 4096;

function govdeOzeti(e) {
  const d = e?.response?.data;
  if (!d) return e?.message || String(e);
  try { return JSON.stringify(d).substring(0, 300); } catch (_) { return String(d).substring(0, 300); }
}

/**
 * Telegram mesajı gönder.
 * 1) Önce Markdown ile dener (mevcut mesajların biçimi korunur)
 * 2) Markdown ayrıştırma hatası (400) alırsa AYNI metni parse_mode'suz tekrar gönderir
 * 3) chatId boşsa TELEGRAM_CHAT_ID env'ine düşer
 *
 * @returns {Promise<boolean>} gönderildi mi
 */
export async function telegram(chatId, text) {
  const hedef = String(chatId || TELEGRAM_CHAT_ID || "").trim();
  if (!hedef) {
    console.error("⛔ Telegram: chat_id YOK (TELEGRAM_CHAT_ID env de tanımlı değil) — mesaj GÖNDERİLEMEDİ:");
    console.error(`   ${String(text || "").substring(0, 300)}`);
    return false;
  }
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("⛔ Telegram: TELEGRAM_BOT_TOKEN yok — mesaj GÖNDERİLEMEDİ.");
    return false;
  }

  const govde = String(text || "").substring(0, TELEGRAM_MAX);

  // 1) Markdown
  try {
    await axios.post(API("sendMessage"), {
      chat_id: hedef, text: govde, parse_mode: "Markdown", disable_web_page_preview: true,
    });
    return true;
  } catch (e) {
    const status = e?.response?.status;
    console.warn(`⚠ Telegram (Markdown) başarısız — HTTP ${status || "?"}: ${govdeOzeti(e)}`);

    // 2) Markdown ayrıştırma hatası → DÜZ METİN ile tekrar dene.
    //    Hata mesajları `_ * [` içerdiği için burası çok sık devreye girer.
    try {
      await axios.post(API("sendMessage"), {
        chat_id: hedef, text: govde, disable_web_page_preview: true,
      });
      console.log("✓ Telegram düz metin olarak gönderildi (Markdown reddedilmişti)");
      return true;
    } catch (e2) {
      console.error(`⛔ Telegram DÜZ METİN de başarısız — HTTP ${e2?.response?.status || "?"}: ${govdeOzeti(e2)}`);
      console.error(`   Gönderilemeyen mesaj: ${govde.substring(0, 300)}`);
      return false;
    }
  }
}

/**
 * ÖLÜMCÜL HATA bildirimi — Markdown biçimlendirmesi HİÇ kullanılmaz.
 * Hata metinleri özel karakter dolu; biçimlendirme denemek mesajı kaybettiriyor.
 */
export async function telegramHata(chatId, baslik, hata) {
  const mesaj = `${baslik}\n\n${String(hata || "").substring(0, 3000)}`;
  const hedef = String(chatId || TELEGRAM_CHAT_ID || "").trim();
  if (!hedef || !TELEGRAM_BOT_TOKEN) {
    console.error(`⛔ Telegram HATA bildirimi gönderilemedi (chat_id/token yok):\n${mesaj.substring(0, 500)}`);
    return false;
  }
  try {
    await axios.post(API("sendMessage"), {
      chat_id: hedef, text: mesaj.substring(0, TELEGRAM_MAX), disable_web_page_preview: true,
    });
    return true;
  } catch (e) {
    console.error(`⛔ Telegram HATA bildirimi başarısız — HTTP ${e?.response?.status || "?"}: ${govdeOzeti(e)}`);
    console.error(`   Gönderilemeyen: ${mesaj.substring(0, 500)}`);
    return false;
  }
}
