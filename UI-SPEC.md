# UI 規格書 — 火災黃金30秒 / 雲端宅邸

這份文件是**從實際畫面量出來的**（不是抄 CSS），涵蓋五個畫面上所有的文字、字體、字級、字重、字距和顏色。

- 量測基準：**1920 × 1080**，`rem = 16px`
- 量測日期：2026-09-03
- 量測方式：瀏覽器裡對每個含文字的元素讀 `getComputedStyle`

---

## 0. 全域

### 0.1 字體

| 用途 | 字體 | 載入的字重 |
| --- | --- | --- |
| 中文、一般文字 | **Noto Sans TC** | 400 / 500 / 700 / 900 |
| 數字、英文標籤 | **Oswald** | 300 / 400 / 500 / 600 / 700 |

完整 fallback：`"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`
（Google Fonts CDN 載入，離線環境要自己備字型檔）

### 0.2 rem 的算法

```css
html{ font-size:max(8px, min(.8333vw, 1.4814vh)) }   /* 1920×1080 時 = 16px */
```

**整個版面是等比縮放的** —— 取寬高較小者換算，所以 4:3 或直式螢幕會自動縮小。
下面所有字級都以 `rem` 為準，px 只是 1920×1080 下的換算值。

⚠️ Pad **不吃這一條**（而且程式在另一個 repo：VistwinProject/G-pad）。見 §5。

### 0.3 ⚠️ 編輯模式的縮放會再乘一次

四個看板頁的每個區塊都是可拖曳縮放的物件（按 `E` 進編輯模式），縮放值存在 `layout*.json`。
**畫面上實際看到的字級 = 下表的 rem × 該物件的 scale。**

| 頁 | 物件 | scale |
| --- | --- | --- |
| 第一頁 | hero 1.609 / timerRing 1.663 / timerFoot 2.409 / sideHead 2.547 / phase1~3 ≈1.58 / act1~4 1.30 / warn 1.204 / stage 1.038 / actsTitle 1 / sideTag 1 |  |
| 首頁 | homeBrand 1.55 / homeTagline 3.53 / homeSub 1.081 / homeStatus 1.599 / homeGuideTitle 2.183 / homeAct1~3 1.2 / homeStage 0.904 / 兩顆按鈕 1 |  |
| 前言＋結語（共用一份） | introEyebrow 0.786 / introRoll 0.822 / introPlan 1.887 / introLogo 0.91 |  |

例：首頁的 `.home__sub` CSS 是 `0.454rem`（7.3px），但它在 `homeTagline` 裡、外框放大 3.53 倍，
所以螢幕上大約是 **26px**。

### 0.4 色票（`:root`，藍色主題）

| 變數 | 值 | 用在哪 |
| --- | --- | --- |
| `--bg-0` | `#020912` | 最深的底 |
| `--bg-1` | `#061527` | 漸層中段 |
| `--bg-2` | `#0a2038` | 漸層亮段 |
| `--brand` | `#2f9dff` | 主色藍 |
| `--brand-hi` | `#74d4ff` | 亮藍（標題、數字、重點字） |
| `--brand-line` | `rgba(47,157,255,.22)` | 框線 |
| `--brand-soft` | `rgba(47,157,255,.13)` | 光暈 |
| `--ink` | `#eaf6ff` | 主要文字 |
| `--ink-2` | `rgba(213,238,255,.66)` | 次要文字 |
| `--ink-3` | `rgba(178,213,245,.38)` | 說明文字 |
| `--red` | `#ff4a3d` | 警示 / 起火點 |
| `--amber` | `#ffb42e` | 注意 / 警語 |
| `--exit` | `#3dffa0` | 安全出口（**語意色，綠色主題下也不變**） |
| `--stage-0/1/2` | `#74d4ff` / `#ffb42e` / `#ff4a3d` | 倒數三個時段 |
| `--m-wall` | `#123049` | 3D 牆 |
| `--m-slab` | `#e4efff` | 3D 樓板 |
| `--m-edge` | `#74d4ff` | 3D 框線 |
| `--m-fog` | `#031020` | 3D 霧 |
| `--m-floor` | `#0a1c30` | 3D 地面 |
| `--m-shade` | `#4d6a86` | 通關變白時的陰影色 |
| `--ease` | `cubic-bezier(.22,.61,.36,1)` | 全站緩動 |

另有綠色主題 `:root[data-theme="green"]`，以及紅（`red`）／綠（`green`）兩個情境配色，
切換時 `--brand` 系列整組換掉，`--exit` / `--red` / `--amber` 這些語意色不變。

---

## 1. 前言頁（按 `A`）

四角 HUD 框角 + 底部刻度 + ANLB 字標。三段文字**疊在同一個位置往上滾動輪替**，每段 5 秒。

| 元素 | 文字 | 字體 | 字級 | 字重 | 字距 | 顏色 |
| --- | --- | --- | --- | --- | --- | --- |
| `.intro__chip` | 前言 · INTRO | Noto Sans TC | 1.2rem / 19.2px | 500 | .26em | `--brand-hi` |
| `.intro__title` 左段 | 意外發生 | Noto Sans TC | 3.57rem / 57.1px | 700 | .086em | `--brand-hi` |
| `.intro__title` `<em>` | 每一秒 | Noto Sans TC | **5.1rem / 81.6px** | 700 | .06em | `--brand-hi` |
| `.intro__title` 右段 | 都是關鍵 | Noto Sans TC | 3.57rem / 57.1px | 700 | .086em | `--brand-hi` |
| `.intro__lead` | 從即時感知到智慧引導，讓安全更早一步。 | Noto Sans TC | 1.864rem / 29.8px | 400 | .08em | `--ink-2` |
| `.intro__sign` | **寶鋪**讓每一秒，都多一分安心。 | Noto Sans TC | 1.791rem / 28.7px | 400 | .55em | `--brand-hi` 70% |

- 主標行高 1.3，三段**對齊基線**；左右兩段是 `font-size:.7em`（相對中間那段）
- 輪播三段**底部對齊**（`align-items:flex-end`）
- ⚠️ 副標和結語的字級被 `--lead-k:.981` / `--sign-k:1.3775` 補償過 —— 三段本來是各自獨立的物件、
  各有各的縮放，併成一個輪播框之後共用外框的 0.822，這兩個係數把原本看到的大小補回來
- ANLB 字標：`assets/anlb-neon.png`，`opacity .6`，框寬 `14.4rem`（字標本身約是框寬的 90.7%）

---

## 2. 火災黃金30秒（按 `Esc`，開機第二頁）

| 元素 | 文字 | 字體 | 字級 | 字重 | 字距 | 顏色 |
| --- | --- | --- | --- | --- | --- | --- |
| `.hero__zh` | 火災黃金**30**秒 | Noto Sans TC | 3.5rem / 56px | 700 | .02em | `--ink` |
| `.hero__num` | 30（在 `.hero__zh` 裡） | **Oswald** | 5.67rem / 90.7px | 600 | −.01em | `--brand-hi` |
| `.hero__en` | THE GOLDEN 30 SECONDS | **Oswald** | 1.35rem / 21.6px | 400 | .30em | `--ink-2` |
| `.hero__tag` | 關鍵時刻，決定生死 | Noto Sans TC | 1.06rem / 17px | 500 | .14em | `--ink-2` |
| `.stage__label` | 3D MODEL / 逃生動線 | **Oswald** | .72rem / 11.5px | 400 | .24em | `--ink-3` |
| `.stage__hint` | 拖曳 **.glb / .gltf** 檔案到此處載入模型 | Noto Sans TC | .72rem / 11.5px | 400 / 500 | .06em | `--ink-3` / `--ink-2` |
| `#stage-progress` | 0%（載入中） | **Oswald** | .9rem / 14.4px | 400 | .20em | `--brand-hi` |
| `.legend li` | 起火點 · 安全出口 | Noto Sans TC | .72rem / 11.5px | 400 | .08em | `--ink-3` |
| `.timer__value` | **30**（倒數數字） | **Oswald** | 8.4rem / 134.4px | 500 | 0 | `--brand-hi`（時段變色） |
| `.timer__value i` | 秒 | Noto Sans TC | 2.016rem / 32.3px | 700 | 0 | 同上 |
| `.timer__caption` | 黃金逃生時間 | Noto Sans TC | .92rem / 14.7px | 400 | .34em | `--brand-hi` |
| `.timer__foot` | 把握 **30** 秒，安全逃生！ | Noto Sans TC | 1.02rem / 16.3px | 500 | .10em | `--ink-2` |
| `.timer__foot b` | 30 | **Oswald** | 1.183rem / 18.9px | 500 | .086em | `--brand-hi` |
| `.acts__title` | 正確應對，提升生存機率 | Noto Sans TC | 1.12rem / 17.9px | 600 | .12em | `--ink` |
| `.act b` ×4 | 立即警報 / 保持冷靜 / 關門阻煙 / 安全集合 | Noto Sans TC | .9rem / 14.4px | 700 | .10em | `--ink` |
| `.act__sub` ×4 | 按下警報器通報 / 循著標示逃生 / 隔絕火勢蔓延 / 等待消防救援 | Noto Sans TC | .7rem / 11.2px | 400 | .04em | `--ink-3` |
| `.side-head h2` | 每一秒都很關鍵 | Noto Sans TC | 1.62rem / 25.9px | 700 | .06em | `--brand-hi`（時段變色） |
| `.side-head p` | 火勢與濃煙擴散極快\<br\>把握逃生時機 | Noto Sans TC | .8rem / 12.8px | 400 | .06em | `--ink-3` |
| `.phase__t` ×3 | 0-10 / 10-20 / 20-30 | **Oswald** | 1.55rem / 24.8px | 500 | .02em | `--brand-hi` |
| `.phase__t i` | 秒 | Noto Sans TC | .899rem / 14.4px | 700 | .034em | `--brand-hi` |
| `.phase__d` ×3 | 火災初期，立即警覺\<br\>尋找最近逃生路線 / 火勢快速擴大\<br\>濃煙開始蔓延 / 能見度下降，吸入濃煙\<br\>易造成嚴重傷害 | Noto Sans TC | .78rem / 12.5px | 400 | .03em | `--ink-3` |
| `.warn__text` | 火災無情，預防先行；設備完善，守護生命 | Noto Sans TC | .92rem / 14.7px | 500 | .20em | `--amber` |

**倒數時段變色**：0-10 秒 `--stage-0` 藍 → 10-20 秒 `--stage-1` 黃 → 20-30 秒 `--stage-2` 紅，
「30」和「每一秒都很關鍵」兩處會跟著換色。

---

## 3. 首頁 / 逃生動線示範（按 `Enter`）

| 元素 | 文字 | 字體 | 字級 | 字重 | 字距 | 顏色 |
| --- | --- | --- | --- | --- | --- | --- |
| `.home__name` | 雲端宅邸 | Noto Sans TC | 3.5rem / 56px | 700 | .06em | `--ink` |
| `.home__sub` | AI 預見風險，安全先行一步 | Noto Sans TC | .454rem / 7.3px | 400 | .06em | `--ink-3` |
| `.stage__label` | CLOUD RESIDENCE / 智慧安全系統 | **Oswald** | .72rem / 11.5px | 400 | .24em | `--ink-3` |
| `.home__tagline b` ×3 | 即時感知 / 動態判斷 / 智慧分流 | Noto Sans TC | .92rem / 14.7px | 500 | .14em | 待機時依序亮紅／黃／綠 |
| `.home__tagline em` | ×（分隔） | Noto Sans TC | .662rem / 10.6px | 500 | .194em | `--brand-hi`，opacity .5 |
| `.home__status b` ×4 | 火源位置 / 煙霧擴散 / A出口 / B出口 | Noto Sans TC | .95rem / 15.2px | 500 | .10em | `--ink` |
| `.home__status i` ×4 | 已辨識 / 低風險 / 壅塞 / 暢通 | Noto Sans TC | .6rem / 9.6px | 500 | .10em | `--red` 62% / `--exit` 62% |
| 按鈕 1 `b` | 展示逃生動線 | Noto Sans TC | 1.2rem / 19.2px | 700 | .16em | `--ink` |
| 按鈕 1 `i` | ROUTE DEMO | **Oswald** | .7rem / 11.2px | 400 | .26em | `--ink-3` |
| 按鈕 2 `b` | 切換逃生動線 | Noto Sans TC | 1.2rem / 19.2px | 700 | .16em | `--ink` |
| 按鈕 2 `i` | SWITCH ROUTE | **Oswald** | .7rem / 11.2px | 400 | .26em | `--ink-3` |
| `.home__clear b` | 恭喜通關 | Noto Sans TC | 3.2rem / 51.2px | 700 | .30em | `--ink` |
| `.home__clear i` | SAFELY EVACUATED | **Oswald** | .9rem / 14.4px | 400 | .30em | `--brand-hi` |
| `.home__act b` ×3 | 立即警報 / 逃生路線 / 安全法規 | Noto Sans TC | .9rem / 14.4px | 700 | .10em | `--ink` |
| `.home__guide-title` | **[新大樓名稱]** 智慧安全指南 | Noto Sans TC | 1.5rem / 24px | 700 | .06em | `--ink`（大樓名 `--brand-hi`） |
| `.home__guide-slogan` | 每一秒都關鍵，安全逃生，守護生命！ | Noto Sans TC | .92rem / 14.7px | 500 | .20em | `--brand-hi` |

**狀態面板會跟著情境變**：

| 情境 | 火源位置 | 煙霧擴散 | A出口 | B出口 |
| --- | --- | --- | --- | --- |
| 待機（藍） | 已辨識（紅） | 低風險（綠） | 壅塞（紅） | 暢通（綠） |
| 跑動線 1/2/3（紅） | 已辨識 | 低風險 | **暢通（綠）** | **壅塞（紅）** |
| 跑動線 4/5（紅） | 已辨識 | 低風險 | 壅塞 | 暢通 |
| 通關（綠） | **已遠離火源（綠）** | 低風險 | **暢通** | **暢通** |

---

## 4. 結語頁（按 `O`）

版面和字級**完全沿用前言頁那一套**（`.intro__*` 是兩頁共用的 class，版面也共用 `layout-intro.json`）。
只有文案不同：

| 元素 | 文字 | 字級 |
| --- | --- | --- |
| `.intro__chip` | 結語 · OUTRO | 1.2rem / 19.2px |
| `.intro__title` 左段 | 預見風險才能 | 3.57rem / 57.1px |
| `.intro__title` `<em>` | **領先** | 5.1rem / 81.6px |
| `.intro__title` 右段 | 危險一步 | 3.57rem / 57.1px |
| `.intro__lead` | 從感知、判斷到引導，讓 AI 守護每一個回家的日常。 | 1.9rem / 30.4px |
| `.intro__sign` | **寶鋪**以智慧守護家的每一秒。 | 1.3rem / 20.8px |

字體、字重、字距、顏色都跟前言頁一致（見第 1 節）。
⚠️ 結語的 `.intro__sign` 是 1.3rem、前言是 1.791rem —— 差別來自前言那邊的 `--sign-k` 補償係數。

---

## 5. 住戶端 Pad（`pad.html`）

**版面鎖在實機的長寬比**：寬 17.75 : 高 24.97（直向）。視窗比例不對就自動留邊，
所以在筆電瀏覽器上看到的排版跟平板上一模一樣。

**rem 的算法跟看板不一樣**：`clamp(11px, 盒子寬度 × .022, 26px)`。
基準是**盒子的寬度**不是 vmin —— 視窗變寬時 vmin 會跟著變大，但盒子被長寬比綁住沒變大，
字就會撐爆版面。

⚠️ 盒子寬度低於 500px 或高於 1182px 時 rem 會**碰到 clamp 的上下限**，
   版面就不再等比縮放了。實機（820～1024px 寬）落在範圍內，不受影響。

下表的 px 是 **820 × 1180**（盒子 820 × 1153.5、rem ≈ 18px）下的值。

### 5.1 固定的部分

| 元素 | 文字 | 字體 | 字級 | 字重 | 字距 | 顏色 |
| --- | --- | --- | --- | --- | --- | --- |
| `.pad__brand` | 住戶端 · RESIDENT | **Oswald** | .82rem / 14.8px | 400 | .22em | `--ink-3` |
| `.pad__link b` | 已連線 / 連線中… | Noto Sans TC | .78rem / 14.1px | 700 | .14em | `--ink-2`（斷線轉紅閃爍） |
| `.pad__kicker` | 依狀態 | Noto Sans TC | 1.05rem / 18.9px | 500 | .34em | 依狀態 |
| `.pad__title` | 依狀態 | Noto Sans TC | **4.6rem / 83px** | 700 | .06em | `--ink` |
| `.pad__sub` | 依狀態 | Noto Sans TC | 1.24rem / 22.4px | 400 | .10em | `--ink-2` |
| `.pad__foot` | 火災無情 · 預防先行 | Noto Sans TC | .82rem / 14.8px | 400 | .30em | `--ink-3` |

### 5.2 四個狀態的文案

| 場景 | 狀態色 | kicker | title | sub |
| --- | --- | --- | --- | --- |
| `intro` | `safe` 藍 `--brand-hi` | 系統待機中 | **安全** | 住戶端連線正常，目前無異常 |
| `golden30` | `alarm` 紅 `--red` | 偵測到火災 | **請立即疏散** | 黃金 30 秒，請保持冷靜、循指示離開 |
| `aiRoute`（跑動線中） | `guide` 琥珀 `--amber` | AI 智慧分流 | **請前往 X 出口** | 已為您避開火源與濃煙，沿指引前進 |
| `aiRoute`（還沒開始） | `guide` 琥珀 | AI 智慧分流 | **正在規劃路線** | 即時感知火源位置，馬上為您指定最安全的出口 |
| `aiRoute`（已通關） | `clear` 綠 `--exit` | AI 智慧分流 | **已抵達 X 出口** | 您已離開危險區域 |
| `outro` | `clear` 綠 | 疏散完成 | **已離開危險區域** | 您目前位於安全區域，請留在原地等候通知 |

### 5.3 逃生指引（只有 `aiRoute` 顯示）

三個步驟卡片：

| 步驟 | 文字 | 字級 |
| --- | --- | --- |
| 1 | 目前位置 | .92rem / 16.6px，400，.08em |
| 2 | 沿走廊前進 | 同上 |
| 3 | **X 出口**（目標，反白） | 1.15rem / 20.7px，700，.06em |

步驟編號用 Oswald .9rem / 16.2px，底色 `--ink-3`（第三步是狀態色）。

---

## 6. 快捷鍵

| 鍵 | 去哪 |
| --- | --- |
| `A` | 前言頁 |
| `Esc` | 火災黃金30秒 |
| `Enter` | 首頁 |
| `O` | 結語頁 |
| `B` | 回藍色介面（不在首頁就先進首頁） |
| `R` | 重置倒數（只在黃金30秒那頁） |
| `E` | 編輯模式（拖曳／縮放版面，存進 `layout*.json`） |

---

## 7. 這份文件怎麼更新

不要手改。改完 UI 之後在瀏覽器 console 跑一次量測（對每個含文字的元素讀 `getComputedStyle`，
記下 `fontFamily` / `fontSize` / `fontWeight` / `letterSpacing` / `color`），再對照更新這裡的表格。
**字級一律以 `rem` 為準**，px 只是 1920×1080 的換算，而且還要再乘上 §0.3 的物件 scale。
