/* =========================================================================
   兩台裝置的即時同步（主展示端 ⇄ Pad）
   走 WebSocket，接到 server.mjs 的 /ws。**不用 localStorage** ——
   localStorage 只在同一台瀏覽器裡有效，跨裝置根本傳不過去。

   用法：
     const sync = createSync({ role:'display', onState(s){...}, onStatus(ok){...} });
     sync.send({ scene:'golden30', route:2, exit:'A' });

   ⚠️ 斷線會**自己重連**（1.5 秒一次），現場網路抖一下不用重整頁面。
   ⚠️ 一連上 server 就會把「目前狀態」推過來，所以 Pad 晚開機、重整、
      或中途斷線重連，都會立刻對上主展示端的畫面，不需要主控端再按一次。

   要連到哪一台：
     預設是**誰送出這個頁面就連回誰**（一台筆電跑 server.mjs、兩邊都連它，最單純）。
     主展示端和 Pad 拆成兩個站、各自部署的時候，Pad 那邊要指定主機：
       http://<pad 的網址>/?server=192.168.0.12:5280
     ⚠️ 指定過的位址**不會記起來**，現場請把帶參數的網址直接加成平板的書籤。
        故意不用 localStorage 存 —— 記住一個舊的 IP 比每次貼網址更難查。

     ⚠️ 包成 App（Capacitor）之後上面兩條都不管用 —— 頁面是從 app 包裡開的，
        沒有 query string，location.host 也是 app 自己的位址、不是大螢幕的。
        那種情況由呼叫端直接把 host 傳進來（Pad 是讀 window.PAD_SERVER，見 js/pad.js）。
   ========================================================================= */
export function createSync({ role = 'pad', host: at = null, onState = null, onStatus = null } = {}) {
  // ?server=host:port 可以指定主機；沒帶就連回送出這個頁面的那一台
  const host = at || new URLSearchParams(location.search).get('server') || location.host;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws?role=${role}`;
  let ws = null;
  let retry = null;

  function open() {
    clearTimeout(retry);
    try { ws = new WebSocket(url); } catch { schedule(); return; }

    ws.onopen = () => {
      onStatus?.(true);
      /* 一連上就問轉播站「現在是什麼狀態」，它會把存著的那份推回來。
         ⚠️ 這裡**兩種角色都問**，不要讓主展示端改成「把自己最後送出的狀態補送回去」。
            同步是**雙向**的（Pad 也會操作），補送等於「誰後重連誰說話」——
            主展示端網路抖一下重連，就會把 Pad 剛剛切的頁蓋回去，現場看起來像自己跳回去。
            轉播站存的那份才是兩邊共同的狀態，重連的人要去**跟上它**，不是覆蓋它。
         ⚠️ 也不用擔心主展示端自己往前跑的那幾頁會漏掉：它每次 goto 都會推一次，
            動畫進行中還有 1 秒一次的 HEARTBEAT，轉播站那份頂多舊 1 秒就被刷新。 */
      ws.send(JSON.stringify({ type: 'hello' }));
    };
    ws.onmessage = (e) => {
      let s; try { s = JSON.parse(e.data); } catch { return; }
      if (s && typeof s === 'object' && !s.type) onState?.(s);
    };
    ws.onclose = () => { onStatus?.(false); schedule(); };
    ws.onerror = () => { try { ws.close(); } catch { /* 已經關了 */ } };
  }

  function schedule() {
    clearTimeout(retry);
    retry = setTimeout(open, 1500);
  }

  function send(obj) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    // 沒連上就丟掉這一份。重連時會用 hello 去跟轉播站要目前狀態（見 onopen）。
  }

  open();
  return { send, isOpen: () => ws?.readyState === WebSocket.OPEN };
}
