/* =========================================================================
   住戶端 Pad
   主要工作：連上 /ws，收到狀態就換畫面。
   ⚠️ 另外有**兩個手動操作**會反過來送出去（待機頁點一下、警報頁往上滑），
      主展示端收到會跟著換頁。所以 Pad 已經不是純粹的「只收不送」了，見下面的 drive()。

   四種版面（body[data-view]）：
     idle   —— 待機：鎖屏式的時間 + 居家狀態 + 三張狀態卡
     alarm  —— 火災警報：待機頁的鎖屏轉成紅色 + 一則警報通知
     app    —— 雲端宅邸 App：主展示端在首頁待機時，從警報頁向上滑動帶出來
     plain  —— 燈號 + 大字（只剩結語頁在用）
     notice —— 「前往 X 出口」的疏散提示：出口、迷你平面圖、小人、剩餘距離

   跟大螢幕「跑同一個節拍」怎麼做（倒數的秒數、動線上小人的位置）：
     主展示端在狀態裡多送一段 anim = { kind, t0, dur }（開始的時間、要跑幾秒），
     外加送出當下的 now。這邊算：
         已經跑了多久 = (now - t0) + (本機現在 - 收到的那一刻)
     ⚠️ 用 now - t0 而不是「本機現在 - t0」—— t0 是**大螢幕那台**的時鐘，
        兩台的時鐘不會一樣，直接相減會差好幾秒甚至好幾分鐘。
     ⚠️ 收到之後就自己用 rAF 跑，不要等對方每一格送。區域網路也會抖，
        每一格送反而更不順。主展示端每秒補推一次，長時間的漂移它會拉回來。
   ========================================================================= */
import { createSync } from './sync.js';
import { planFor } from './plan.js';

const $ = (id) => document.getElementById(id);
const els = {
  body: document.body,
  link: $('link'), batt: $('batt'),
  toast: $('toast'),
  actGuide: $('act-guide'),                    // App 頁：逃生指引
  nPlay: $('n-play'), nNext: $('n-next'),      // 出口頁：展示 ／ 切換
  // idle
  clkH: $('clk-h'), clkM: $('clk-m'), clkDate: $('clk-date'),
  // plain
  kicker: $('kicker'), title: $('title'), sub: $('sub'),
  // alarm（鎖屏式的時間，跟待機頁同一個時鐘）
  aH: $('a-h'), aM: $('a-m'), aDate: $('a-date'),
  // app（狀態列左邊那個小時間）
  barTime: $('bar-time'),
  // app（主視覺那張圖的框，可以上下滑）
  pic: document.querySelector('.app__pic'),
  // 手動操作要掛事件的兩個版面
  idleSec: document.querySelector('.pad__idle'),
  alarmSec: document.querySelector('.pad__alarm'),
  // notice
  lead: $('n-lead'), exit: $('n-exit'), why: $('n-why'), dist: $('n-dist'),
  walker: $('n-walker'), meLabel: $('n-me-label'),
  plan: $('n-plan'), halo: $('n-halo'), line: $('n-line'), ahead: $('n-ahead'),
  base: { slab: $('pb-slab'), wall: $('pb-wall'), core: $('pb-core'), col: $('pb-col'), stair: $('pb-stair'), win: $('pb-win') },
  me: $('n-me'), goal: $('n-goal'), goalName: $('n-goal-name'), goalFlow: $('n-goal-flow'),
  foot: $('foot'),
};

/* 四個場景各自要顯示什麼。exit 是主展示端算好的建議出口（'A' / 'B'）。
   state 決定配色和動畫（css 的 body[data-state]）：
     safe 藍 / alarm 紅 / guide 藍 / clear 綠 */
const VIEW = {
  // 待機頁的文案全部寫在 index.html 裡（含天氣和三張狀態卡那些寫死的展示值），
  // 這邊只要切版面；會動的只有時鐘和電量。
  intro: () => ({ view: 'idle', state: 'safe' }),
  golden30: () => ({ view: 'alarm', state: 'alarm' }),
  // aiRoute 下面還分三種：還沒開始跑 / 跑動線中 / 已抵達出口。
  // ⚙ 還沒開始跑的時候**不要隨便報一個出口** —— 那時候主展示端還沒挑動線，
  //   報了就是假資訊；實際現場住戶看到錯的出口是會出事的。
  //   所以沒有 exit 就顯示雲端宅邸 App 那一頁（主展示端此時也正停在首頁待機），
  //   平面圖和小人整個不畫。
  aiRoute: (s) => {
    if (!s.exit) return { view: 'app', state: 'safe' };
    const done = s.phase === 'cleared';
    return {
      view: 'notice', state: done ? 'clear' : 'guide', exit: s.exit, route: s.route, done,
      lead: done ? '已抵達' : '請前往',
      why: done
        ? `您已抵達 ${s.exit} 出口，已離開危險區域`
        : `${s.exit} 出口目前較暢通，已為你更新疏散方向`,
      flow: done ? '已抵達' : '暢通',
    };
  },
  outro: () => ({
    state: 'clear', kicker: '疏散完成', title: '已離開危險區域',
    sub: '您目前位於安全區域，請留在原地等候通知',
  }),
};

/** 把點放到平面圖上，並決定標籤往哪邊長 ——
    貼著邊界的點要往圖的內側長，不然字會跑到平面圖外面去。 */
function place(el, pt) {
  el.style.left = `${pt.x}%`;
  el.style.top = `${pt.y}%`;
  el.dataset.h = pt.x > 74 ? 'r' : pt.x < 26 ? 'l' : 'c';   // 靠右／靠左／居中
  el.dataset.v = pt.y > 55 ? 't' : 'b';                     // 在下半部就往上長
}

/* ---------------------------------------------------------- 跟大螢幕對時
   anim 是「現在正在跑的那段動畫」：kind（倒數／動線）、要跑幾秒、以及**本機**的基準點。
   收到狀態時把大螢幕的 (now - t0) 當成「已經跑了多久」，之後用 performance.now() 自己往前推。 */
let anim = null;
let raf = 0;
let tick = 0;

const elapsed = () => anim ? anim.at0 + (performance.now() - anim.base) / 1000 : 0;

function setAnim(s) {
  const a = s?.anim;
  if (!a || !(a.dur > 0)) { anim = null; return; }
  const at0 = Math.max(0, ((s.now ?? a.t0) - a.t0) / 1000);
  // 主展示端每秒補推一次同一段動畫。差得不多就不要重設基準 ——
  // 每秒把時間軸拉一下，畫面上就是每秒抽一下。差太多（晚連上、睡醒）才拉回來。
  if (anim && anim.kind === a.kind && anim.t0 === a.t0 && Math.abs(elapsed() - at0) < 0.25) return;
  anim = { kind: a.kind, t0: a.t0, dur: a.dur, at0, base: performance.now() };
}

let plan = null;          // 目前這條動線的幾何（planFor 的結果）
let planDone = false;     // 已經抵達出口

/** 小人走到哪 + 剩餘距離。tau 是大螢幕那條動線的進度（含樓梯的全程）。 */
function paintWalker() {
  if (!plan) return;
  const tau = planDone ? 1
    : anim?.kind === 'route' ? Math.min(1, elapsed() / anim.dur)
    : 0;                                   // 還沒收到動畫資訊：先擺在起點，別亂跑
  const w = plan.walk(tau);
  els.walker.style.left = `${w.at.x}%`;
  els.walker.style.top = `${w.at.y}%`;
  // 到樓層出口了（大螢幕那邊還在下樓梯）：站著呼吸，讓人看得出是「到了」不是「卡住」
  els.walker.dataset.arrived = w.arrived ? '1' : '0';
  els.walker.hidden = false;
  // 走過的實線 + 光暈、還沒走的虛線
  els.halo.setAttribute('d', w.passed);
  els.line.setAttribute('d', w.passed);
  els.ahead.setAttribute('d', w.ahead);
  els.dist.textContent = String(Math.round(w.remain));
  // 小人出現之後，起點那顆就不該再叫「您的位置」—— 人已經不在那裡了
  els.meLabel.textContent = tau > 0 ? '起點' : '您的位置';
}

function paintNow() {
  if (els.body.dataset.view === 'notice') paintWalker();
}

function frame() {
  raf = anim ? requestAnimationFrame(frame) : 0;
  paintNow();
}

/**
 * 有動畫在跑才開，跑完就收掉 —— 平板會擺一整天，待機頁沒必要一直醒著。
 * ⚠️ rAF 負責小人走得順，但**不能只靠它**：瀏覽器在背景、沒有合成、或省電模式下
 *    可能一格都不發（我們在預覽視窗就遇到 600ms 內 0 格），那時候畫面會整個定住。
 *    所以另外掛一個慢的計時器兜底；就算 rAF 沒動，倒數和小人至少還會一格一格走。
 */
const TICK_MS = 250;
function pump() {
  // 只有動線的小人需要每一格重畫。倒數的 anim 照收（主展示端還是會送），
  // 但新版警報頁沒有顯示秒數，所以不用為它開迴圈。
  if (!anim || anim.kind !== 'route') {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (tick) { clearInterval(tick); tick = 0; }
    return;
  }
  if (!raf) raf = requestAnimationFrame(frame);
  if (!tick) tick = setInterval(paintNow, TICK_MS);
}

/** 把「前往 X 出口」那頁填好。平面圖沒資料就整張不畫（寧可少畫也不要畫錯的路）。 */
function fillNotice(v) {
  els.lead.textContent = v.lead;
  els.exit.textContent = v.exit;
  els.why.textContent = v.why;
  els.goalName.textContent = `${v.exit} 出口`;
  els.goalFlow.textContent = v.flow;

  plan = planFor(Number.isInteger(v.route) ? v.route : -1, v.exit);
  planDone = !!v.done;
  els.plan.closest('.ncard').hidden = !plan;
  els.walker.hidden = !plan;
  if (!plan) { els.dist.textContent = '—'; return; }

  els.plan.setAttribute('viewBox', plan.viewBox);
  // 底圖整張是固定的，換動線只是換 viewBox；這裡照樣寫一次，省得漏掉第一次的初始化
  for (const [key, el] of Object.entries(els.base)) el.setAttribute('d', plan.base[key] ?? '');
  place(els.me, plan.start);
  place(els.goal, plan.end);
  paintWalker();
}

/* ---------------------------------------------------------- 警報跳出來的那一下
   ⚠️ 只在**進入**警報頁的那一次震，不能每次 render 都震 ——
      主展示端每秒補推一次狀態，每次都震的話平板會一直抖個不停。
   ⚠️ navigator.vibrate 要瀏覽器先拿到「使用者互動過」才會生效（沒互動過直接回 false），
      而且桌機根本沒有震動硬體。所以同時配一個同樣短促的視覺效果（通知卡彈入 +
      版面輕敲一下），那些情況下它就是唯一看得出來的提示。

   觸感回饋那種震動：短促、清脆的三下，不是警報器那種長長的嗡嗡聲。
   數字是毫秒，[震, 停, 震, 停, 震] —— 每下都在 30ms 上下，手上感覺得到但不吵。 */
const ALARM_BUZZ = [30, 60, 30, 60, 45];
let lastView = null;
let buzzTimer = null;

/**
 * 震一下。
 * ⚠️ 這是整個專案**唯一**碰震動硬體的地方。iOS Safari 根本沒有 navigator.vibrate，
 *    之後包成 App 要換成 Capacitor 的 Haptics 外掛時，只要改這一個函式，
 *    其他地方（buzz / render）都不用動。
 */
function haptic(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* 不支援就算了，還有視覺效果 */ }
}

/* 從警報頁進到 App 那一頁時，讓警報頁**往上滑出去**，像手機解鎖。
   ⚠️ 只有這一個方向要滑。主展示端每秒補推一次狀態，每次都滑一遍會很吵；
      其他換頁也不需要，直接切就好。 */
const SWIPE_MS = 580;
let swipeTimer = null;

function swipe(from, to) {
  // 進到 App 那一頁時把主視覺那張圖捲回預設位置。
  // ⚠️ 0.22 不是隨便挑的：對到屋頂花園和頂樓那幾層，那一段最好看。
  //    現場是自動輪播，上次有人滑到一半的話下次進來要回到這裡。
  if (to === 'app' && from !== 'app' && els.pic) {
    els.pic.scrollTop = Math.max(0, els.pic.scrollHeight - els.pic.clientHeight) * 0.22;
  }
  if (from === 'alarm' && to === 'app') {
    els.body.classList.add('is-swipe');
    clearTimeout(swipeTimer);
    swipeTimer = setTimeout(() => els.body.classList.remove('is-swipe'), SWIPE_MS);
    return;
  }
  // ⚠️ 換到別的版面就要把滑動狀態立刻收掉。動畫還沒跑完就換頁的話，
  //    .is-swipe 會把警報頁強制 display 出來、絕對定位疊在新畫面上面。
  //    （心跳重推同一頁 from === to，那時候不能收，不然動畫會被打斷。）
  if (from !== to) {
    clearTimeout(swipeTimer);
    els.body.classList.remove('is-swipe');
  }
}

function buzz(view) {
  if (view === lastView) return;                // 心跳重推同一個狀態，不要重震
  lastView = view;
  if (view !== 'alarm') return;
  haptic(ALARM_BUZZ);
  els.body.classList.remove('is-buzz');
  void els.body.offsetWidth;                    // 強制重排，同一個 class 才能再觸發一次動畫
  els.body.classList.add('is-buzz');
  // ⚠️ 收尾要有兩條路：animationend 正常情況會來，但動畫被關掉
  //    （prefers-reduced-motion）或分頁沒在合成時根本不會觸發，class 就永遠留著。
  clearTimeout(buzzTimer);
  buzzTimer = setTimeout(() => els.body.classList.remove('is-buzz'), 800);
}
document.addEventListener('animationend', (e) => {
  if (e.animationName === 'padTap') els.body.classList.remove('is-buzz');
});

function render(s) {
  const make = VIEW[s?.scene] ?? VIEW.intro;
  const v = make(s ?? {});
  setAnim(s);
  const was = els.body.dataset.view;                 // 換之前是哪一頁，滑動要靠它判斷方向
  els.body.dataset.state = v.state;
  els.body.dataset.view = v.view ?? 'plain';
  swipe(was, els.body.dataset.view);
  if (v.view === 'notice') fillNotice(v);
  else if (v.view !== 'idle' && v.view !== 'alarm') {
    els.kicker.textContent = v.kicker;
    els.title.textContent = v.title;
    els.sub.textContent = v.sub;
  }
  buzz(els.body.dataset.view);
  pump();
}

/* ------------------------------------------------------ 待機頁／警報頁的時鐘
   ⚠️ 對齊到「下一分鐘」再排下一次，不要每秒跑一輪 —— 平板會擺一整天，
      沒必要為了一個不顯示秒數的鐘每秒喚醒一次。
   ⚠️ setTimeout 在平板睡著時會被凍住，所以回到前景要立刻補畫一次，
      不然螢幕會亮出一個停在幾小時前的時間。 */
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
let clockTimer = null;

function tickClock() {
  const t = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const hh = pad2(t.getHours()), mm = pad2(t.getMinutes()), wd = WEEKDAY[t.getDay()];
  // 待機頁和警報頁是同一套鎖屏骨架，時間和日期的寫法也一樣
  const date = `${t.getMonth() + 1}月${t.getDate()}日 星期${wd}`;
  els.clkH.textContent = els.aH.textContent = hh;
  els.clkM.textContent = els.aM.textContent = mm;
  els.clkDate.textContent = els.aDate.textContent = date;
  els.barTime.textContent = `${hh}:${mm}`;

  clearTimeout(clockTimer);
  clockTimer = setTimeout(tickClock, 60000 - (t.getSeconds() * 1000 + t.getMilliseconds()) + 50);
}
tickClock();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tickClock();
  pump();          // 平板睡醒：計時器被凍住了，重開並立刻補畫一次
  paintNow();
});

/* 電量。拿不到就維持 index.html 裡的預設值（部分瀏覽器沒有這個 API，
   或者在 http:// 下不給），不要因此讓狀態列空一塊。 */
(async () => {
  try {
    const b = await navigator.getBattery?.();
    if (!b) return;
    const paint = () => {
      els.batt.querySelector('b').textContent = `${Math.round(b.level * 100)}%`;
      els.batt.style.setProperty('--lv', b.level);
    };
    paint();
    b.addEventListener('levelchange', paint);
  } catch { /* 沒有 Battery API，用預設值 */ }
})();

const sync = createSync({
  role: 'pad',
  // 要連哪一台大螢幕：純瀏覽器用網址的 ?server=（不設這個變數）；
  // 包成 App（Capacitor）之後沒有 query string 可以帶，由外面先設好 window.PAD_SERVER。
  host: window.PAD_SERVER ?? null,
  onState: render,
  onStatus: (ok) => {
    els.link.dataset.ok = ok ? '1' : '0';
    els.link.querySelector('b').textContent = ok ? '已連線' : '連線中…';
  },
});

/* ---------------------------------------------------------------- 手動操作
   待機頁**點一下** → 火災警報；警報頁**往上滑** → 雲端宅邸 App。

   ⚠️ 這兩個操作會 sync.send() 出去，轉播站併進共用狀態、再轉給主展示端，
      主展示端就跟著換頁（見 G-main 的 onState）。Pad 本來是「只收不送」，
      這是刻意打破的 —— 現在誰動都會帶著對方走。
   ⚠️ 一定要送**完整一組**欄位，不能只送 scene。轉播站是 {...state, ...msg} 併起來的，
      只送 scene 的話舊的 exit / phase 會留在共用狀態裡：切到 aiRoute 而 exit 還是 'A'
      的話，Pad 會跑去顯示「前往 A 出口」，不是 App 那一頁。
   ⚠️ 送出去的同時**本機先換**，不要等一趟來回 —— 區域網路也有幾十毫秒，
      手指離開螢幕畫面卻沒反應，感覺就像沒點到。 */
const DRIVE = {
  alarm: { scene: 'golden30', phase: 'idle', route: -1, exit: null, anim: null },
  app:   { scene: 'aiRoute',  phase: 'idle', route: -1, exit: null, anim: null },
};

/* 在畫面上跳一行字，兩秒多之後自己收掉。
   ⚠️ 只在**手動操作**沒連上的時候用。不要拿它去報一般的斷線 ——
      現場網路抖一下 sync.js 自己會重連，跳字反而更吵。 */
let toastTimer = null;
function toast(html) {
  if (!els.toast) return;
  els.toast.innerHTML = html;
  els.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), 2600);
}

function drive(target) {
  const msg = DRIVE[target];
  if (!msg) return;
  const payload = { ...msg, now: Date.now() };
  /* ⚠️ 沒連上大螢幕就要**在畫面上**講出來，不能只寫 console。
     下面那行 render() 會讓本機畫面照樣換頁，看起來像成功了，但其實沒送出去；
     而這三頁的狀態列刻意藏了「已連線」的字（要像手機鎖屏），斷線只剩一個小圖示在閃。
     兩件事加起來就會變成「大螢幕沒跟著動」的誤判 —— 所以這裡一定要跳字。 */
  if (!sync.isOpen()) {
    toast('<b>沒有連上大螢幕</b><br>網址要帶 ?server=大螢幕IP:5280');
    console.warn('[pad] 沒有連上大螢幕，這一下只會改本機畫面。檢查網址的 ?server=');
  }
  sync.send(payload);
  render(payload);
}

/* ── 三顆按鈕：請大螢幕跑逃生動線 ────────────────────────────────────────
   App 頁「逃生指引」＝隨機挑一條；出口頁「▶ 展示」＝重跑這一條、「⇄ 切換」＝換一條。
   對應大螢幕的 playRouteDemo(repeat)，也就是它畫面上那兩顆同名的按鈕。

   ⚠️ 這裡跟 drive() 不一樣：**故意不做本機的樂觀渲染**。
      因為「挑到第幾條、要跑幾秒」只有大螢幕算得出來（它才有 tower 模型的動線長度），
      Pad 自己先猜一條就會跟大螢幕跑不同的路線和進度 —— 小人對時的前提是
      路線的決定權只有一個地方。所以這裡只送指令，畫面等大螢幕推回來的狀態再換。

   ⚠️ 指令要帶一個**不重複的序號**（cmdId）。轉播站是把狀態存起來、誰連上就補送一份，
      沒有序號的話大螢幕每次重連都會把最後那個指令再執行一次
      —— 重新整理大螢幕就會莫名自己開始跑動線。大螢幕那邊靠序號變了才執行（見 js/main.js）。 */
const CMD_LOCK = 900;                             // ms，送出後鎖住按鈕的時間
let cmdSeq = 0;
const cmdTag = Math.random().toString(36).slice(2, 8);   // 這台 Pad 的識別，避免兩台的序號撞號

function command(cmd, btns = []) {
  if (!sync.isOpen()) {
    toast('<b>沒有連上大螢幕</b><br>網址要帶 ?server=大螢幕IP:5280');
    console.warn('[pad] 沒有連上大螢幕，逃生動線的指令送不出去');
    return;
  }
  cmdSeq += 1;
  sync.send({
    scene: 'aiRoute',                             // 大螢幕先切到首頁，動線才有舞台
    cmd,
    cmdId: cmdTag + '-' + cmdSeq,
    now: Date.now(),
  });
  /* 送出後短暫鎖住按鈕：大螢幕收到之後會先黑一下再起跑，這段期間畫面沒反應，
     不鎖的話很容易連按好幾下、送出一串指令。 */
  for (const b of btns) if (b) b.disabled = true;
  setTimeout(() => { for (const b of btns) if (b) b.disabled = false; }, CMD_LOCK);
}

const routeBtns = () => [els.nPlay, els.nNext];
els.actGuide?.addEventListener('click', () => command('route-next'));   // 隨機挑一條
els.nPlay?.addEventListener('click', () => command('route-play', routeBtns()));
els.nNext?.addEventListener('click', () => command('route-next', routeBtns()));

// 待機頁：點一下就進警報
els.idleSec?.addEventListener('click', () => drive('alarm'));

/* 警報頁：往上滑進 App。
   ⚠️ 用 pointer 事件，滑鼠拖曳和手指滑動同一套程式碼就都能用。
   ⚠️ 要有最小距離門檻，不然手指按下去時的一點抖動就會誤觸。 */
const SWIPE_MIN = 40;                             // px，要滑超過這個距離才算
let swipeFrom = null;
els.alarmSec?.addEventListener('pointerdown', (e) => { swipeFrom = e.clientY; });
els.alarmSec?.addEventListener('pointerup', (e) => {
  if (swipeFrom !== null && swipeFrom - e.clientY >= SWIPE_MIN) drive('app');
  swipeFrom = null;
});
els.alarmSec?.addEventListener('pointercancel', () => { swipeFrom = null; });

render(null);                                   // 還沒收到之前先給待機畫面

// 給現場除錯用：__pad.render({scene:'aiRoute', phase:'running', exit:'A', route:0})
// 可以直接假裝收到狀態（只改這台的畫面，不會送回主展示端）
Object.assign(window, { __pad: { render, sync } });
