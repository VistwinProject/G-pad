/* =========================================================================
   迷你平面圖：把 plan-data.js 的底圖（模型俯視圖）和動線算成一張 SVG 的幾何。

   座標怎麼轉：模型是 (x, z)，樓層很長（約 17.6m × 40.3m，直的），
   直接畫會是一條又高又窄的圖，塞不進卡片。所以**整張轉 90°**：
       畫面 X = z - z最小        （長邊變成橫的）
       畫面 Y = x最大 - x        （轉 90° 不是鏡射；行列式為正，左右沒有顛倒）
   ⚠️ 鏡射會害住戶把左右走反，寧可圖轉得醜一點也不能翻面。

   **五條動線共用同一個裁切框**（整層樓）。以前是照每條動線的範圍各裁一塊，
   結果每條的比例尺都不一樣 —— 換一條動線，同一道牆忽粗忽細、圖忽大忽小。
   固定成一個框之後，五條看起來就是同一張圖上的五條路。
   ========================================================================= */
import { BOUNDS, PLAN, ROUTES } from './plan-data.js';

const PAD_M = 1;          // 建物四周留一點邊，不要貼著卡片
const ASPECT = 2.25;      // 裁切框的長寬比，配合卡片的形狀

const toX = (z) => z - BOUNDS.z[0];
const toY = (x) => BOUNDS.x[1] - x;
const W = toX(BOUNDS.z[1]);
const H = toY(BOUNDS.x[0]);

/** 沒有 route 編號時的代表動線：A 用動線 1、B 用動線 4（跟主展示端的分組一致） */
const FALLBACK = { A: 0, B: 3 };

/** 底圖每一層轉成一條 path。整張圖是固定的，只算一次就好 —— 換動線只是換 viewBox。 */
const BASE = Object.fromEntries(Object.entries(PLAN).map(([key, polys]) => [
  key,
  polys.map((poly) => poly.map(([x, z], i) =>
    `${i ? 'L' : 'M'}${toX(z).toFixed(2)} ${toY(x).toFixed(2)}`).join('') + 'Z').join(''),
]));

/* 整層樓 + 四周留邊，再撐成 ASPECT —— 五條動線都用這一個框。
   ⚠️ 長寬比一定要**正好**是 ASPECT，而且要跟 .plan__box 的 aspect-ratio 一致：
      不一致的話 SVG 會在盒子裡留邊，疊在圖上用百分比定位的「起點 / X出口」標籤
      就會對不到點上。 */
const BOX = (() => {
  let [x0, x1] = [-PAD_M, W + PAD_M];
  let [y0, y1] = [-PAD_M, H + PAD_M];
  const w = x1 - x0, h = y1 - y0;
  if (w / h < ASPECT) {                                   // 太窄 → 左右補
    const want = h * ASPECT, c = (x0 + x1) / 2;
    [x0, x1] = [c - want / 2, c + want / 2];
  } else {                                                // 太扁 → 上下補
    const want = w / ASPECT, c = (y0 + y1) / 2;
    [y0, y1] = [c - want / 2, c + want / 2];
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
})();

const VIEW_BOX = `${BOX.x0.toFixed(2)} ${BOX.y0.toFixed(2)} ${BOX.w.toFixed(2)} ${BOX.h.toFixed(2)}`;
/** 圖上的點 → 裁切框裡的百分比（標籤和小人是 HTML，疊在 SVG 上面） */
const pct = ([a, b]) => ({ x: ((a - BOX.x0) / BOX.w) * 100, y: ((b - BOX.y0) / BOX.h) * 100 });

/**
 * @param {number} routeIdx 主展示端送來的動線編號（0 起算，-1 代表還沒挑）
 * @param {'A'|'B'} exit     建議出口，routeIdx 不合法時用來挑代表動線
 * @returns 給 SVG 用的幾何；動線資料不存在就回 null（呼叫端要把圖藏起來）
 */
export function planFor(routeIdx, exit) {
  const idx = ROUTES[routeIdx] ? routeIdx : FALLBACK[exit];
  const route = ROUTES[idx];
  if (!route) return null;

  const pts = route.pts.map(([x, z]) => [toX(z), toY(x)]);
  const start = pts[0], end = pts.at(-1);

  // 這一層那一段的累積長度，走小人的時候要用
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const floorLen = cum.at(-1);

  /**
   * 小人走到哪。tau 是大螢幕那條動線的進度（0～1，**含樓梯那一段**）。
   *
   * 只取**在這一層的那段時間**：俯視圖畫不出垂直動線，樓梯間那一段本來就沒東西可看。
   * 所以小人照真實速度沿走廊走，在大螢幕的人踏進樓梯間的同一刻抵達樓層出口
   * （約全程的 41～59%），之後就站在出口等 —— 那時候人確實已經在樓梯間了。
   *
   * ⚠️ 所以要乘 route.total（含樓梯的全長）再夾到 floorLen，不是直接乘 floorLen。
   *    直接乘 floorLen 的話小人會被拉慢成「整段跑完才到」，位置和大螢幕對不上：
   *    大螢幕的人已經在下樓梯，這邊的人還在走廊上晃。
   */
  function walk(tau) {
    const s = Math.min(Math.max(tau, 0) * route.total, floorLen);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const f = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
    const p = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
               pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];

    // 走過的畫實線、還沒走的畫虛線，所以要從小人腳下把折線切成兩段。
    // ⚠️ 兩段各自算，不要用同一條線疊 dasharray 蓋 —— 兩條線的邊緣會露出鋸齒。
    const path = (arr) => (arr.length < 2 ? ''
      : arr.map(([a, b], k) => `${k ? 'L' : 'M'}${a.toFixed(2)} ${b.toFixed(2)}`).join(''));
    // ⚠️ 兩頭都要判「長度是不是 0」而不是「有沒有點」。走到底時 pts.slice(i) 還會剩
    //    最後那個點，跟小人腳下是同一個位置 —— 湊成一條零長度的線，round linecap
    //    會在出口上畫出一顆多餘的圓點。
    return {
      at: pct(p),
      passed: s > 0 ? path([...pts.slice(0, i), p]) : '',
      ahead: s < floorLen ? path([p, ...pts.slice(i)]) : '',
      remain: Math.max(0, floorLen - s),        // 還要走幾公尺才到樓層出口
      arrived: s >= floorLen,                   // 已經到樓層出口（大螢幕那邊正在下樓梯）
    };
  }

  return {
    viewBox: VIEW_BOX,                          // 五條動線共用，換動線不會忽大忽小
    base: BASE,
    route: pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(2)} ${b.toFixed(2)}`).join(''),
    start: pct(start), end: pct(end),
    length: route.floor,
    name: route.name,
    walk,
  };
}
