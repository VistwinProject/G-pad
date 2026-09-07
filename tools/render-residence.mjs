/* =========================================================================
   一次性前處理（第 1 步／共 2 步）：把「一層切平面」的 BIM 模型投影成
   軸測線稿的**線段清單**，給第 2 步（tools/draw-residence.ps1）畫成圖。
   產出就是雲端宅邸 App 那一頁的主視覺 assets/residence.jpg。

   為什麼分兩步：解析 16MB 的 gltf 要用 node，但 Windows 上沒有裝任何繪圖套件，
   所以畫圖那一步交給 PowerShell 的 System.Drawing（.NET 內建，零安裝）。

   線稿怎麼來的：只留**特徵邊**（feature edge）——
     · 只被一個三角形用到的邊（輪廓、開口）
     · 被兩個三角形共用、但兩邊法線夾角大於 THRESHOLD 的邊（轉角）
   共平面的內部切線會被濾掉，所以方盒子只剩 12 條邊，看起來就是建築線稿，
   不是密密麻麻的三角網。

   用法：node tools/render-residence.mjs > <線段檔>
   ========================================================================= */
import { readFile } from 'node:fs/promises';

const GLTF = 'C:/Users/USER/Desktop/vb/一層切平面/切平面.gltf';

/* 要畫哪些構件。⚠️ 玻璃欄杆不收 —— 它是曲面、佔了全模型 94% 的三角形，
   特徵邊會炸出上萬條曲線雜訊，把建築的線條蓋掉。它的底座和立柱是方的，收。 */
const KEEP = /外牆|RC內部牆|輕隔間牆|柱子|核心筒|樓梯|RC樓板|結構樓板|窗框|格柵|欄杆支撐|玻璃欄杆底座|Layer 06/;
const SKIP = /玻璃欄杆$|玻璃欄杆\s/;

const THRESHOLD = Math.cos(18 * Math.PI / 180);   // 法線夾角大於 18° 才算轉角
const QUANT = 1000;                               // 頂點量化：0.001m，用來合併重複點

/* 視角：從角落斜上方看下去，跟原本設計稿那張建物同一個調性 */
const YAW = 34 * Math.PI / 180;
const PITCH = 26 * Math.PI / 180;

const g = JSON.parse(await readFile(GLTF, 'utf8'));
const acc = g.accessors, bvs = g.bufferViews;
if (g.nodes.some((n) => n.matrix || n.translation || n.rotation || n.scale)) {
  throw new Error('節點有 transform，頂點不能直接當世界座標用');
}
const bufs = g.buffers.map((b) => Buffer.from(b.uri.split(',')[1], 'base64'));

function read(ai) {
  const a = acc[ai], bv = bvs[a.bufferView], buf = bufs[bv.buffer];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out = [];
  if (a.type === 'VEC3') {
    const st = bv.byteStride || 12;
    for (let i = 0; i < a.count; i++) {
      const o = base + i * st;
      out.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]);
    }
    return out;
  }
  const size = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType];
  const get = { 1: 'getUint8', 2: 'getUint16', 4: 'getUint32' }[size];
  const st = bv.byteStride || size;
  for (let i = 0; i < a.count; i++) out.push(dv[get](base + i * st, true));
  return out;
}

const parent = new Map();
g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
const chain = (i) => {
  const o = [];
  for (let k = i; k !== undefined; k = parent.get(k)) if (g.nodes[k].name) o.push(g.nodes[k].name);
  return o.join(' / ');
};

/* ---------- 收集特徵邊 ---------- */
const key = (p) => `${Math.round(p[0] * QUANT)},${Math.round(p[1] * QUANT)},${Math.round(p[2] * QUANT)}`;
const edges = new Map();      // "a|b" → { a, b, n:[法線…] }

function addTri(A, B, C) {
  const u = [B[0]-A[0], B[1]-A[1], B[2]-A[2]];
  const v = [C[0]-A[0], C[1]-A[1], C[2]-A[2]];
  let n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const L = Math.hypot(...n);
  if (L < 1e-12) return;                                  // 退化三角形
  n = n.map((c) => c / L);
  for (const [P, Q] of [[A,B],[B,C],[C,A]]) {
    const kp = key(P), kq = key(Q);
    if (kp === kq) continue;
    const k = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
    let e = edges.get(k);
    if (!e) edges.set(k, (e = { a: kp < kq ? P : Q, b: kp < kq ? Q : P, n: [] }));
    e.n.push(n);
  }
}

let tris = 0;
g.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  const c = chain(i);
  if (!KEEP.test(c) || SKIP.test(c)) return;
  for (const pr of g.meshes[n.mesh].primitives ?? []) {
    if (pr.mode !== undefined && pr.mode !== 4) continue;
    const pos = read(pr.attributes.POSITION);
    const idx = pr.indices !== undefined ? read(pr.indices) : pos.map((_, k) => k);
    for (let t = 0; t < idx.length; t += 3) {
      addTri(pos[idx[t]], pos[idx[t+1]], pos[idx[t+2]]);
      tris++;
    }
  }
});

const keep = [];
for (const e of edges.values()) {
  if (e.n.length === 1) { keep.push(e); continue; }        // 邊界／開口
  // 任兩個相鄰面的夾角只要夠大就是轉角
  let sharp = false;
  for (let i = 0; i < e.n.length && !sharp; i++)
    for (let j = i + 1; j < e.n.length; j++) {
      const d = Math.abs(e.n[i][0]*e.n[j][0] + e.n[i][1]*e.n[j][1] + e.n[i][2]*e.n[j][2]);
      if (d < THRESHOLD) { sharp = true; break; }
    }
  if (sharp) keep.push(e);
}

/* ---------- 軸測投影 ---------- */
const cy = Math.cos(YAW), sy = Math.sin(YAW);
const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
const project = ([x, y, z]) => {
  const X = x * cy - z * sy;
  const Z = x * sy + z * cy;
  return [X, Z * sp - y * cp];        // 螢幕座標（y 之後再翻）
};

const segs = keep.map((e) => [...project(e.a), ...project(e.b)]);
const xs = segs.flatMap((s) => [s[0], s[2]]);
const ys = segs.flatMap((s) => [s[1], s[3]]);
const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };

process.stdout.write(JSON.stringify({
  bbox: bb,
  count: segs.length,
  segs: segs.map((s) => s.map((v) => +v.toFixed(3))),
}));
process.stderr.write(
  `三角形 ${tris}、邊 ${edges.size}、特徵邊 ${keep.length}\n` +
  `投影範圍 ${(bb.x1-bb.x0).toFixed(1)} x ${(bb.y1-bb.y0).toFixed(1)}` +
  `（長寬比 ${((bb.x1-bb.x0)/(bb.y1-bb.y0)).toFixed(3)}）\n`);
