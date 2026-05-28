// fluent-emoji-mapping-uret.js
// Kullanım: node scripts/fluent-emoji-mapping-uret.js
// Çıktı: remotion/src/data/fluent-emoji-map.json
// microsoft/fluentui-emoji assets klasöründen tüm metadata.json'ları çekip
// { "🦊": { name, slug, group, keywords, unicode } } formatında JSON üretir.

import https from "https";
import fs    from "fs";
import path  from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    https.get({ host: opts.host, path: opts.pathname + opts.search, headers: { "User-Agent": "fluent-emoji-mapper/1.0" } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error(`Parse hatası (${url}): ${e.message} — body: ${d.slice(0,100)}`)); }
      });
    }).on("error", reject);
  });
}

async function main() {
  const OUT = path.join(__dirname, "../remotion/src/data/fluent-emoji-map.json");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  // 1) Tüm dosya ağacını çek
  process.stdout.write("GitHub tree API'den dosya listesi alınıyor...\n");
  const tree = await fetchJson(
    "https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1"
  );

  const metaPaths = tree.tree
    .filter(f => f.type === "blob" && /^assets\/.+\/metadata\.json$/.test(f.path))
    .map(f => f.path);

  process.stdout.write(`${metaPaths.length} metadata dosyası bulundu. jsDelivr'dan çekiliyor...\n`);

  // 2) Batch fetch (30 paralel)
  const BATCH = 30;
  const mapping = {};
  let done = 0;

  for (let i = 0; i < metaPaths.length; i += BATCH) {
    const batch = metaPaths.slice(i, i + BATCH);
    await Promise.all(batch.map(async (p) => {
      const url = `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/${p.replace(/ /g, "%20")}`;
      try {
        const meta = await fetchJson(url);
        if (meta.glyph && meta.unicode) {
          const parts     = p.split("/");
          const folderName = parts.slice(1, -1).join("/"); // "assets/{name}/metadata.json" → "{name}"
          const slug       = folderName.toLowerCase().replace(/ /g, "_");
          mapping[meta.glyph] = {
            name:     folderName,
            slug:     slug,
            group:    meta.group    || "Other",
            keywords: meta.keywords || [],
            unicode:  meta.unicode,
          };
        }
      } catch (e) {
        // Silent skip — non-critical
      }
    }));
    done += batch.length;
    process.stdout.write(`  ${done}/${metaPaths.length} işlendi\r`);
  }

  process.stdout.write(`\n${Object.keys(mapping).length} emoji mapping oluşturuldu.\n`);
  fs.writeFileSync(OUT, JSON.stringify(mapping, null, 2));
  process.stdout.write(`Yazıldı: ${OUT}\n`);
}

main().catch(e => { console.error("HATA:", e.message); process.exit(1); });
