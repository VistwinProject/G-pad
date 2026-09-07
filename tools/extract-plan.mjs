/* =========================================================================
   一次性前處理：把「一層切平面」的 BIM 模型壓成 Pad 用的 `js/plan-data.js`
   —— 迷你平面圖的底圖（模型的**俯視圖**）＋ 主展示端的五條逃生動線。

   Pad 這個 repo **刻意零套件、零模型檔** —— 平板不該為了畫一張小平面圖
   去載 three.js 和一顆 16MB 的模型。所以在這裡先把模型正射投影壓成 2D 輪廓，
   烤成一支幾十 KB 的 js 就好。

   怎麼壓成俯視圖：只留**朝上的三角形**（頂面），把相鄰三角形共用的邊成對消掉，
   剩下的邊接成封閉的輪廓線。一個閉合實體從上面看到的形狀就是它頂面的輪廓，
   所以抽出來的是**精確的正射俯視投影**，不是近似。

   ⚠️ 不要用凸包代替。牆、柱這種方盒子凸包剛好等於輪廓，但樓板的外框是凹的
      （建物有缺角），凸包會把缺角補起來，圖上就多一條橫貫整層的假牆。
   ⚠️ 門窗開口、樓板的洞會自己變成獨立的輪廓線，不必特別處理 ——
      補起來的話圖上就沒有出入口了。

   ⚠️ 兩個來源都在**主展示端那邊**，不在這個 repo 裡：
        模型 C:/Users/USER/Desktop/vb/一層切平面/切平面.gltf   （restyle-flat.mjs 的同一份來源）
        動線 ../fire-golden-30s/models/routes-home.json         （首頁跑的那一份，含樓梯）
      模型或動線改了才需要重跑；平常不用。

   用法：node tools/extract-plan.mjs
   ========================================================================= */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const GLTF   = 'C:/Users/USER/Desktop/vb/一層切平面/切平面.gltf';
// ⚠️ 要用 routes-**home**.json，不是 routes.json。
//    首頁（大螢幕真的在跑動線的那一頁）載的是 home 這一份，它每條動線在住戶這一層走完之後
//    還會**往下走樓梯**；routes.json 是第一頁那顆切平面模型用的，最後一段不一樣。
//    Pad 要跟大螢幕的小人同步，就得用大螢幕實際在跑的那一份。
const ROUTES = 'C:/Users/USER/Desktop/coding/網頁/fire-golden-30s/models/routes-home.json';
const OUT    = fileURLToPath(new URL('../js/plan-data.js', import.meta.url));

/* 哪些東西要進底圖，以及它們在圖上算哪一層。
   ⚠️ 玻璃欄杆是彎的、又佔了全模型 94% 的三角形，抽出來會是一堆碎輪廓，
      平面圖本來也不太需要它，所以不收。 */
const LAYERS = [
  { key: 'slab',  re: /RC樓板|結構樓板/,        label: '樓板' },
  { key: 'wall',  re: /外牆|RC內部牆|輕隔間牆/,  label: '牆' },
  { key: 'core',  re: /核心筒/,                  label: '核心筒' },
  { key: 'col',   re: /柱子/,                    label: '柱' },
  { key: 'stair', re: /樓梯/,                    label: '樓梯' },
  { key: 'win',   re: /窗框/,                    label: '窗框' },
];
const MIN_AREA = 0.02;     // m²，比這小的輪廓在圖上只是雜點

const g = JSON.parse(await readFile(GLTF, 'utf8'));
const acc = g.accessors, bvs = g.bufferViews;
if (g.nodes.some((n) => n.matrix || n.translation || n.rotation || n.scale)) {
  throw new Error('節點有 transform，頂點不能直接當世界座標用');   // 這份來源沒有，變了要改這裡
}
const bufs = g.buffers.map((b) => {
  if (!b.uri?.startsWith('data:')) throw new Error('buffer 不是內嵌的');
  return Buffer.from(b.uri.split(',')[1], 'base64');
});

/** 讀一支 accessor（只用得到 VEC3 float 的頂點和純量的索引） */
function read(ai) {
  const a = acc[ai], bv = bvs[a.bufferView], buf = bufs[bv.buffer];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out = [];
  if (a.type === 'VEC3') {
    const stride = bv.byteStride || 12;
    for (let i = 0; i < a.count; i++) {
      const o = base + i * stride;
      out.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]);
    }
    return out;
  }
  const size = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType];
  const get = { 1: 'getUint8', 2: 'getUint16', 4: 'getUint32' }[size];
  const stride = bv.byteStride || size;
  for (let i = 0; i < a.count; i++) out.push(dv[get](base + i * stride, true));
  return out;
}

/* ---------- 節點 → 分類 ---------- */
const parent = new Map();
g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
function chain(i) {
  const out = [];
  for (let k = i; k !== undefined; k = parent.get(k)) if (g.nodes[k].name) out.push(g.nodes[k].name);
  return out.join(' / ');
}

/* ---------- 幾何 ---------- */
const area = (poly) => Math.abs(poly.reduce((s, q, i) => {
  const r = poly[(i + 1) % poly.length];
  return s + (q[0] * r[1] - r[0] * q[1]);
}, 0)) / 2;

/**
 * 朝上的三角形（頂點索引三元組）→ 封閉輪廓線。
 * 內部的邊會被相鄰的三角形以相反方向各用一次，成對消掉；剩下的就是輪廓。
 */
function outlines(tris, pos) {
  const open = new Map();                           // "p,q" → q
  for (const [a, b, c] of tris) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const rev = `${q},${p}`;
      if (open.has(rev)) open.delete(rev);          // 和鄰居共用的邊，一起消掉
      else open.set(`${p},${q}`, q);
    }
  }
  const next = new Map();                           // 起點 → 可以接下去的終點們
  for (const [k, q] of open) {
    const p = +k.slice(0, k.indexOf(','));
    if (!next.has(p)) next.set(p, []);
    next.get(p).push(q);
  }
  const loops = [];
  for (const start of next.keys()) {
    while (next.get(start).length) {
      const loop = [start];
      let v = next.get(start).pop();
      for (let guard = 0; v !== start && guard < 10000; guard++) {
        loop.push(v);
        const outs = next.get(v);
        if (!outs?.length) break;                   // 鏈斷了：幾何有破面，這一圈丟掉
        v = outs.pop();
      }
      if (v === start && loop.length >= 3) loops.push(loop);
    }
  }
  return loops.map((loop) => loop.map((i) => [pos[i][0], pos[i][2]]));   // 投影：丟掉 y
}

/* ---------- 主流程 ---------- */
const shapes = [];
const stats = new Map();

g.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  const layer = LAYERS.find((l) => l.re.test(chain(i)));
  if (!layer) return;

  for (const pr of g.meshes[n.mesh].primitives ?? []) {
    if (pr.mode !== undefined && pr.mode !== 4) continue;          // 只吃三角形
    const pos = read(pr.attributes.POSITION);
    const idx = pr.indices !== undefined ? read(pr.indices) : pos.map((_, k) => k);

    // 只留朝上的面。法線 = (b-a)×(c-a)，取它的 y 分量
    const up = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]];
      const uy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (uy > 1e-9) up.push([idx[t], idx[t + 1], idx[t + 2]]);
    }
    for (const loop of outlines(up, pos)) {
      if (area(loop) < MIN_AREA) continue;
      shapes.push({ key: layer.key, poly: loop.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) });
      stats.set(layer.label, (stats.get(layer.label) ?? 0) + 1);
    }
  }
});

// 去掉完全重複的輪廓（重疊的構件會抽出一樣的形狀）
const seen = new Set();
const kept = shapes.filter((s) => {
  const k = s.key + '|' + s.poly.map((p) => p.join()).join(';');
  return seen.has(k) ? false : (seen.add(k), true);
});

/* ---------- 動線 ----------
   每條動線在住戶這一層走完之後會往下走樓梯。平面圖只畫得出**這一層**那一段，
   但大螢幕的小人是沿著**整條（含樓梯）**等速跑的，所以兩個長度都要留著：
     floor —— 這一層那一段的長度，就是 Pad 顯示的「剩餘距離」
     total —— 含樓梯的全長，用來把大螢幕的進度換算成小人走到哪
   ⚠️ 位置是 min(進度 × total, floor)：小人照真實速度走，走到樓層出口就停著等
      （俯視圖沒有垂直動線，樓梯那一段畫不出來）。兩個都會用到，見 UI-SPEC §5.5。 */
const raw = JSON.parse(await readFile(ROUTES, 'utf8')).routes;
const len3 = (p) => p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i-1][0], q[1] - p[i-1][1], q[2] - p[i-1][2]) : 0, 0);
const len = (pts) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);

const routes = raw.map((r) => {
  const top = Math.max(...r.points.map((p) => p[1]));      // 住戶這一層的樓板高度
  let n = 0;
  while (n < r.points.length && r.points[n][1] === top) n++;   // 前 n 個點是這一層的水平段
  const pts = r.points.slice(0, n).map(([x, , z]) => [+x.toFixed(2), +z.toFixed(2)]);
  return { name: r.name, pts, floor: +len(pts).toFixed(2), total: +len3(r.points).toFixed(2) };
});

/* ---------- 烤成 js ---------- */
const all = kept.flatMap((s) => s.poly);
const bx = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
const bz = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
const byKey = (k) => kept.filter((s) => s.key === k).map((s) => s.poly);

const body = `/* 這支檔案是 tools/extract-plan.mjs 產生的，**不要手改** ——
   改了下次重跑就被蓋掉。要動平面圖請改模型或那支工具。
   來源：一層切平面的 BIM 模型（正射俯視投影）＋ 主展示端 models/routes-home.json 的五條動線。
   座標是模型的世界座標 (x, z)，單位公尺；怎麼轉成畫面座標見 js/plan.js。 */

/** 建物範圍 [min, max]，公尺 */
export const BOUNDS = { x: [${bx[0]}, ${bx[1]}], z: [${bz[0]}, ${bz[1]}] };

/** 底圖：模型俯視圖的輪廓，依圖層分開（畫的順序＝樓板→牆→核心筒→柱→樓梯→窗框）。
    每一圈是 [[x,z], …]，可以直接當 SVG 的一段 subpath 用；洞會是獨立的一圈。 */
export const PLAN = {
${LAYERS.map((l) => `  ${l.key}: ${JSON.stringify(byKey(l.key))},`).join('\n')}
};

/** 五條逃生動線，跟主展示端的「動線 1～5」同一份資料、同一個順序。
      pts   這一層的水平段（平面圖畫得出來的就是這一段）
      floor 這一段的長度（公尺）＝「剩餘距離」，小人的進度也是照這一段算
      total 含樓梯的全長（公尺）＝ 大螢幕的小人實際跑的距離，換算進度要用它 */
export const ROUTES = [
${routes.map((r) => `  { name: '${r.name}', floor: ${r.floor}, total: ${r.total}, pts: ${JSON.stringify(r.pts)} },`).join('\n')}
];
`;
await writeFile(OUT, body, 'utf8');
console.log(`底圖 ${kept.length} 圈輪廓 → ${OUT}  (${(Buffer.byteLength(body) / 1024).toFixed(1)} KB)`);
console.log([...stats.entries()].map(([k, v]) => `  ${k}: ${v}`).join('\n'));
console.log(`建物範圍 x ${bx.join('～')} / z ${bz.join('～')}`);
routes.forEach((r) => console.log(`  ${r.name}  這層 ${r.floor}m ／ 含樓梯 ${r.total}m  ${r.pts.length} 點`));
