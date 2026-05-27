# GeniMini Tests - Çalışma Kuralları

## DEĞİŞMEZ KURALLAR
- İteratif geliştirme: çalışan yapıya DOKUNMA
- Ne işe yaradığını bilmediğin script/fonksiyon/dosyayı SİLME, RENAME ETME, TAŞIMA
- Önce dosyanın ne yaptığını oku ve anla. Belirsizse kullanıcıya sor
- Sadece istenen değişikliği yap. "İyileştirme" adıyla başka şey değiştirme
- Refactor yapma. Format değiştirme. Import sırasını oynatma
- Şüpheli bir şey görürsen değiştirmeden önce SOR

## REV KURALI
- Her değiştirilen dosyanın en üstüne REV satırı koy/güncelle
- Format: // REV NNN/DDMMMYY - <kısa aciklama>
- HTML için: <!-- REV ... -->
- YML için: # REV ...
- JSON için: description alanına göm
- NNN: 3 haneli sıra numarası (eski + 1)
- DDMMMYY: 26MAY26 formatı

## TÜRKÇE
- Konuşma Türkçe, kod yorumları İngilizce/Türkçe karışık olabilir
- Telegram mesajları İngilizce (kanal İngilizce)

## TEST
- Kullanıcı test modu kullanıyor: TEST_MODE=true ile 1 soru üretir
- Render uzun sürüyor, test modu hızlı feedback için

## CLOUDFLARE ROTATION
- 6 hesap var: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (1. hesap)
- CLOUDFLARE_ACCOUNT_ID_2..._6 + CLOUDFLARE_API_TOKEN_2..._6 (2-6. hesaplar)
- scripts/lib/cloudflare.js içindeki fluxRotationCagri() round-robin + 429/quota fallback yapar
- Bu dosyaya DOKUNMA, çalışıyor.

## ONAY GEREKTİRMEYEN İŞLER
- Kullanıcı bir prompt'ta görev listesi verdiğinde HER ADIM için ayrı onay isteme
- Tüm listeyi yap, sonunda toplu rapor ver
- Sadece şu durumlarda dur ve sor:
  * Belirsiz bir şey var (hangi dosya, hangi davranış)
  * Çalışan yapıyı bozabilecek bir karar
  * Kullanıcının daha önce belirtmediği yeni bir şey eklenmesi gerekiyor
- Diğer her şey için: yap, geç, raporla.
