// 極簡靜態伺服器（ES Module 需要 http:// 才能載入）
// 用法：node server.mjs [port]
//
// ⚠️ 這台**不做同步**，只負責把 Pad 的頁面送出去。
//    WebSocket 轉播站在主展示端那個 repo（VistwinProject/G-main）的 server.mjs ——
//    現場只跑那一台，Pad 用網址參數連過去：
//      http://<這台的 IP>:5281/?server=<主展示端的 IP>:5280
//    這邊如果也開一個轉播站，兩台就變成各自為政的兩座孤島，反而同步不到。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// 預設 5281，跟主展示端的 5280 錯開 —— 兩台跑在同一部筆電上時才不會搶埠
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5281);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^[/\\]+/, '');
  const file = join(ROOT, rel);

  if (!file.startsWith(ROOT)) {              // 擋 ../ 跳出專案目錄
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow',   // 擋搜尋引擎索引（連非 HTML 檔一起擋）
    }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
});

/** 列出這台機器在區域網路上的 IP，方便平板直接輸入 */
function lanURLs() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal) out.push(`http://${n.address}:${PORT}`);
    }
  }
  return out;
}

server.listen(PORT, () => {
  console.log(`serving ${ROOT} → http://localhost:${PORT}`);
  const urls = lanURLs();
  if (urls.length) {
    console.log('\n平板開這個網址（把 <主展示端的 IP> 換成跑 G-main 那台的位址）：');
    for (const u of urls) console.log(`  ${u}/?server=<主展示端的 IP>:5280`);
  }
  console.log('');
});
