# 情人节限定版 —— 设计与落地记录

> 分支：**`valentine-edition`**（从 `main` = `5189c7b` 开出）
> 日期：2026-08-19（Ocean 提的，为 2026-08-20 情人节）
> 铁律：**不能影响已经发布的 v0.5.0。** 怎么做到的见 §1。
>
> ⚠️ **这份是设计与取证（做了什么、为什么这么做）。「还欠什么」在
> `docs/HANDOFF-2026-08-19.md`** —— 那份是下一窗的开工面，记着 Ocean 2026-08-19 明确
> 「本窗口不做」的两件：**情人节弹窗要用花做背景**、**119 处死类名单开分支修**。

---

## 0. Ocean 要的东西，逐条

| # | 原话 | 落点 |
|---|---|---|
| 1 | 重构颜色选择和特殊字体的设计，**正常文字不变，功能不变** | `styles/tokens.css` · `styles/fonts.css` |
| 2 | 版本可以随便调整（切换情人节 / 经典，中英文都支持） | `lib/theme.ts` · 设置 → 通用 →「外观」 |
| 3 | 背景放一张 `.png` 图片 | `assets/valentine-background.png` · `styles/global.css` |
| 4 | 字体按情人节主题找，**不能太花哨** | Cormorant Garamond（§3） |
| 5 | 左边栏线轴改成粉色爱心慢慢变大，**25 帧**；缠满的记录也变小爱心 | `Sidebar/HeartMeter.tsx` |
| 6 | 点左上角 logo（**只有英文**）→ 震动一下 → 变成 Gwen | `Sidebar/Wordmark.tsx` |
| 7 | 连续工作超过一小时弹窗让用户休息（**规则要我改成更合理的**） | `lib/breakReminder.ts` |
| 8 | 注意 win 和 Mac 同步 | §6 |

另外两条当窗问 Ocean 拍的：

- **休息提醒和 Gwen 彩蛋只在情人节版**，经典版一个字节都不变。
- **装完默认打开是经典版**，要看情人节得自己去设置里切。

---

## 1. 「不影响已发布版本」是怎么保证的

不是靠小心，是靠**结构上不可能**：

1. **经典版不是一个主题，它就是原来那份代码。** 现在的 v0.5.0 配色写在 `tokens.css` 的裸
   `:root` 里，**一个字都没动**。情人节的东西全部关在 `:root[data-theme='valentine'] { … }`
   里面。所以经典版走的是和发布版完全同一条 CSS 路径。
2. **默认值是 `classic`。** 装这个构建上去，不打开设置，看到的就是原来的界面。
3. **不是两个构建，是一个设置。** 两个主题都在同一个二进制里，没有 `#[cfg]`、没有条件编译、
   没有第二个要签名公证上传的包。
4. **不动数据库。** 主题存在 `settings.json`（`theme` 键），**schema 版本没变，没有迁移**。
   拿发布版打开同一个库照样能用（它会忽略这个不认识的键）。

⚠️ 三处会被经典版走到的改动，逐条说清它为什么不改变经典版的样子：

| 改了什么 | 为什么 | 经典版为什么不变 |
|---|---|---|
| 两个边栏加一个 `rail-wash` 类名 | 情人节要把边栏染成薄荷色当画框 | **经典版里没有任何规则匹配这个类名**。原来的 `bg-paper-2/40` **一个字没动，还挂在元素上**。只有 `[data-theme='valentine'] .rail-wash` 这一条会盖它 |
| 加载画面的 `#faf7f0` / `Fraunces` → `var(--paper)` / `var(--font-serif)` | 写死奶油色会让情人节版每次启动闪一下 | token 的值就是这两个原来的字面值 |
| logo 从 `Sidebar/index.tsx` 挪进 `Wordmark.tsx` | 彩蛋要有地方住 | 经典版渲染的是**原来那个 `<h1>`**，没有 button、没有 handler、没有 state |

⚠️ 第一条本来打算写成「把 `bg-paper-2/40` 换成一个 `--rail-wash` token，两个主题各给一个值」，
**中途改掉了**：Tailwind v3 对「颜色是 CSS 变量 + 透明度修饰符」这个组合到底编译成什么，不是能
凭印象断定的事——而这条铁律是「发布版的颜色一个色阶都不许挪」。现在这个写法让经典版**在结构上
不可能变**，而不是「算下来应该等价」。

### 1.1 ⚠️⚠️ 顺带查出来一个既存缺陷（**本窗没有修，也不该顺手修**）

因为上面那份谨慎，去翻了编译出来的 CSS，结果是：

> **`bg-paper-2/40` 编译出来是「什么都没有」。**

Tailwind v3 **没法**给「值是裸 `var(--…)` 的颜色」加透明度修饰符——而
`tailwind.config.js` 里**每一个**颜色都是这么定义的。所以它直接把这条工具类丢掉了：类名挂在
元素上，但没有任何规则匹配它。取证（`dist/assets/main-*.css`）：

- 含 `paper-2` 的选择器只有三条，**没有一条带 `/40`**；
- 整份 CSS 里带转义斜杠的颜色类**零条**（只有 `left-1\/2` 这种布局类，无关）；
- **零处** `color-mix` 兜底。

**影响面：`src/` 里有大约 100 处这样的类**（`bg-paper-2/40`×16、`bg-paper-2/30`×14、
`bg-accent/10`×13、`bg-ink/30`×9、`text-muted/70`×8 …）。也就是说：

- **左右两个边栏从发布起就是透明的**，露出下面的 `.paper-bg`。奶油色盖奶油色，所以没人看出来。
- **所有弹窗的遮罩（`bg-ink/30`）都是透明的**，看起来像有遮罩只是因为卡片本身不透明。
- 一大堆 hover 底色、淡边框是不生效的。

⚠️ **本窗只做了一件事**：新写的休息弹窗**不建在这条坏路上**——它的遮罩是写死的
`rgba(58,42,53,.32)`，注释里记了原因。既存那 100 处**一处没动**：修它们会同时改变发布版在
一百个地方的观感，那是单独一件事，要 Ocean 单独拍。

⭐ 通则（和 `HANDOFF` 里那条 `None` 的教训同源）：**一个静默降级成「什么都不输出」的构建步骤，
出错时看起来就像答对了。** 这次是靠「不敢相信等价，去读编译产物」才撞见的。

---

### 1.2 ⚠️⚠️ 浮窗的主题是**推**进去的，不是它自己读的（2026-08-19 第二窗修）

Ocean 装完第一版之后当场发现：**「捕捉浮窗仍然是classic的ui啊，没有变化，撤销也是」**。
属实，而且**和花底无关**——浮窗从第一版起就没拿到过 `theme`，一直坐在 store 的默认值
（`classic`）上，所以 `useAppliedTheme()` 在那边每次都把 `classic` 写回 `<html>`。

**根源是主题被接到了一条对这个窗口不存在的路上，而且两处同时不成立：**

| # | 当初的假设 | 实际 |
|---|---|---|
| 1 | 「主窗 `update()` 里那句 `emit('settings:changed')` 会广播到每个窗口」 | 浮窗从 **2026-08-01 起是独立进程**（`src-tauri/src/overlay.rs`），Tauri 事件**跨不过进程边界** |
| 2 | 「浮窗自己会读同一个 `settings.json`」 | `capabilities/overlay.json` 只给了 `core:default`，**没有 `store:` 权限**，`Store.load('settings.json')` 必然失败，被 `catch` 吞掉 |

⚠️⚠️ **这两句假设当时是白纸黑字写在注释里的**（`useTheme.ts`、`lib/theme.ts`、
`CaptureOverlay.tsx` 三处），所以**照着注释读代码的人不会再去问「这个窗口凭什么读得到」**。
⭐ 和 [[mcp-tool-routing-required]] 是同一类：**把功能接在一条根本不会被走到的路上，本地毫无
症状**——编译过、tsc 过、448 条测试全绿，唯一的症状是一张奶油色卡片浮在别人的应用上面。
注释已经按实际改掉了，三处都改。

**修法不发明新机制，走这个窗口已经在用的那条**：语言就是 Rust 每次 show 之前读
`settings.json` 推进来的（`ui_language` → `overlay:language`）。主题现在同样推
（`ui_theme` → `overlay:theme`），两者合并成一个 `settings_string(app, key)`。

- ⚠️ **emit 在内容事件之前**，而卡片在内容到达之前渲染的是 `null`——Tauri 对同一个窗口
  是按序投递的，所以第一帧就已经是对的，**没有 classic→情人节的闪**，不需要额外的握手。
- ⚠️ `show` / `notice` / `undo` **三种走的是同一个 handler**，所以 Ocean 说的「撤销也是」
  一并修好。
- ⚠️ 前端收到之后过一层 `themeOrDefault`：`settings.json` 是能手改的，一个不认识的名字写到
  `<html>` 上会一条样式都匹配不上——一张半涂色的卡片浮在别人的应用上面。

**守卫**（`src/lib/capture/overlayProtocol.test.ts`，两条）：两侧事件名一致 + 主题和语言
仍然在同一个 handler 里推。**验过它会红**：把那个 emit 删掉，第二条当场失败。
（这个 bug 之前对所有检查都是隐形的，所以这条守卫的价值就是把它变成看得见的。）

⚠️ **推论，给以后加东西的人**：**浮窗要跟随的任何设置，都必须由 Rust 在 show 前推进去。**
它读不到 `settings.json`，也收不到主窗的任何广播。目前推的是两个：语言、主题。

---

## 2. 配色

Ocean 给的：blush `#f6b7c9` · rose `#f29bb6` · deep rose `#e66d98` · mint `#c9f2e6` ·
deep berry `#3a2a35`，并且指定了角色（花瓣用 blush/rose、mint 做叶子和背景雾气和小画框、
deep berry 留给细线和小字）。

**每一档都是量出来的，不是看着顺眼。** Ocean 那句「文字需要看得清」是硬指标：

| token | 情人节 | 对比度 vs 纸 | 发布版同档 |
|---|---|---|---|
| `--paper` | `#fdf8f5` | — | `#faf7f0` |
| `--ink` | `#3a2a35`（deep berry 原色） | 12.75 | 16.24 |
| `--ink-2` | `#594051` | 8.75 | 8.78 |
| `--muted` | `#9f7a93` | 3.51 | 3.42 |
| `--accent` | `#ae325e` | **5.83** | 4.69 |
| `--accent-2` | `#8a2549` | 8.16 | 6.63 |
| `--status-active` | `#377260`（mint 压深） | 5.33 | — |

⚠️ **`--paper` 是量出来的，不是挑出来的**：`#fdf8f5` 就是背景图正中间的颜色。面板是用这个色
铺在图上面的，值错了就等于给每个面板画一个看得见的方框。**换图必须重新取色。**

⚠️ **两个 token 不是他给的原色，原因都是能不能看清，不是审美**：

1. `--accent` 是把 `#e66d98` 按同一个色相（339°）压暗、降饱和得到的。**`#e66d98` 自己对纸只有
   2.84 : 1**，撑不住小字——而 `--accent` 一个 token 同时要当小字（「这颗心填满了」）、2px 的选中
   条、和 `::selection` 的填充色。原色没被浪费：**爱心就是用它画的**。
2. `--muted` / `--ink-2` 是 deep berry 提亮，这样灰阶是「berry 灰」而不是一种外来的暖灰。

⚠️ **搁置（琥珀）和紧急（砖红）故意没改。** 它们必须一眼能和玫瑰色的 `--accent` 分开——一个满
是玫瑰色的页面配玫瑰色的「紧急」，等于「紧急」什么都没说。两个在新纸上仍是 4.44 / 5.40。

**mint 用在三个地方**（对应他说的 leaves / background haze / small framing elements）：
左右两个边栏的底色（画框）、`--block-active-bg` 定位提示（雾气）、`--status-active`（叶子）。

---

## 3. 字体

**Cormorant Garamond**（可变字重 + 斜体，OFL，和其他三个字体一样打进包里，不联网）。

- 怎么选的：**把 Cormorant Garamond 和 EB Garamond 的字标并排渲染出来比**，不是照名气挑。
  Ocean 要「偏古典、典雅」+「不能太花哨」。Cormorant 是 Garamond 复刻——笔画对比高、古典比例、
  零装饰。EB Garamond 是两者里更结实的那个，在字标尺寸下读起来更像教科书而不是典雅。
- ⚠️ **只换 `--font-serif`（字标和标题）。`--font-ui` 两个主题都是 Geist** ——Ocean:「正常文字
  不变」。所以真正**被读**的正文，一个字都没换字体。
- ⚠️ 加了一条 `:root[data-theme='valentine'] .font-serif { font-weight: 500 }`。Cormorant 的
  400 按别家标准算 Light，在 11px 的工作区标签上太细。一条主题内的规则一次修好全部 17 个调用点。
- ⚠️ 中文回退加了 `'SimSun'` ——Windows 上没有 Songti SC（§6）。

---

## 4. 背景图

`assets/valentine-background.png` —— Ocean 给的水彩牡丹（源文件在 `docs/background/`，
⚠️ **那个文件名开头有一个空格**）。1672 × 941，压到 256 色（RMSE 1.72，肉眼无差）后
**1.86 MB → 936 KB**。

**上面那层纸色罩是中心加权的，三个数都是量出来的**：

Ocean 自己的 brief 里写了「soften edges with lighter washes so the illustration stays airy」，
和「文字需要看得清」在这里是同一个方向。字在窗口中间，花在四个角上，所以：

- 阅读区（中心）罩到 **95%** 不透明
- 边缘降到 **74%**，让花留着

**把图上每个像素都算过一遍的最坏情况**：`--ink` 最低 **8.96 : 1**；小字 `--muted` 掉到 3 : 1
以下的面积只有阅读区的 **0.8%**（右下角牡丹里最深的那几笔线，别处都没有）。

⚠️ **换图必须重新算**——一张中心是深色的图会把字压在下面，这层罩子是唯一挡在中间的东西。

### 4.1 捕捉浮窗上的那朵花（2026-08-19 第二窗）

Ocean:「**弹窗需要使用 background.png 里面花的图片来当背景**」，并当窗点名
**「弹窗我指的是捕捉浮窗」** —— 也就是双击 ⌥ 弹出来那张卡（`src/overlay/CaptureOverlay.tsx`，
独立窗口、独立 bundle、只 import `tokens.css`）。

**⚠️⚠️ 照抄主窗那行 `center / cover` 会用两种不同的方式失败**，而且两种都长得像「背景图没生效」：

1. 画的花全在四个角，中间（x 30%~70%）几乎是纯色纸——`--paper` 就是从那儿取的。
   一张**又高又窄**的卡片 `cover` 居中，取到的正好是那块空白，**一朵花都没有**。
2. 这张卡片恰好是**又宽又矮**的（340 × 约 214），于是 `cover` 干的是反面的事：把**整幅四角
   构图**缩到五分之一塞进卡片，四个角各一小团糊，谁也认不出是花。

所以卡片只拿**一朵**牡丹，按主窗上差不多的尺寸，摆进这张卡**唯一不放字的那块地方**。

**三个数，都是量出来的：**

| 参数 | 值 | 为什么是这个数 |
|---|---|---|
| `background-size` | `800px auto` | 图缩到 800 宽时高 450，右下那朵牡丹落在 **≈150px**，正是它在主窗里的观感尺寸 |
| `background-position` | `right 0 bottom -60px` | 图的下沿压到卡片下沿**再往下 60px**，卡片取到的是图的第 185~390 行：那朵牡丹＋上面的花苞和叶子，同时把花心最深的那几笔**推出下边缘** |
| 罩子 | `to bottom right`，`0.97 / 0.93 / 0.68` | 和主窗同一个思路（中心加权），只是改成沿对角线：起字的那头 0.97，花所在的右下角 0.68 |

**⚠️ 这次的量是在真 WKWebView 渲染上做的，不是在模型上做的。** 用
`scripts/wk-snapshot.m` 把**编译产物里的那份 CSS** 和卡片原样渲染出来，再逐像素算
（同 §4 的算法）。顺带校了一次模型：Python 模拟与 WebKit 渲染 **平均差 0.21/255，最大 4** ——
所以下面这组数就是 app 里会发生的事。

| 卡片上真正有字的区域 | 色阶 | 最坏对比度 | 低于门槛的面积 |
|---|---|---|---|
| 标题（14px） | `--ink` | **12.01 : 1** | 0% |
| 出处行（10px 等宽） | `--muted` | **3.14 : 1** | 0%（门槛 3:1） |
| 批注框里的字（12px） | `--ink-2` | **6.70 : 1** | 0% |
| 批注框的占位符档 | `--muted` | 2.68 : 1 | **0.65%** |
| 底栏两个图标 | `--muted` | 3.28 : 1 | 0% |

**主窗同一个数是 0.8%**，所以这张卡不比它所属的那页更差。（`完成` 按钮和**聚焦时**的批注框
各自有不透明底色，不落在图上；卡片 body 是 `pr-14`，所以正文永远越不过 x=284——右边那一竖条
本来就没有字，花就开在那儿。）

**⚠️ 提示（notice）和撤销（undo）两条**（同一个窗口的另外两种状态）**故意没有加。**
它们只有 40~56px 高，一行 `--muted` 的字**从左顶到右**，正好铺在唯一能放花的地方。量过：
`重做` 那个按钮的字会有 **7%** 的面积掉到 3 : 1 以下。那就是「把花开在字底下」，
是 Ocean 那句「文字需要看得清」明确排除掉的做法。它们保持素净的玫瑰色卡片。
**要不要给它们也来一层更淡的，是 Ocean 的一句话的事**（加个类名 + 一条更重的罩子）。

**经典版为什么不可能受影响**：`capture-bloom` 和 `rail-wash` 一样是个**空标记类**，
唯一匹配它的规则住在 `[data-theme='valentine']` 里面。取证不是靠读代码：把这个类挂在一个
空 div 上、**黑底**渲染两遍，`classic` 那张**整张是纯黑**（这个类一个像素都没画），
`valentine` 那张是花。

编译产物核对（`dist/assets/overlay-*.css`）：

```
:root[data-theme=valentine] .capture-bloom{background-color:var(--paper);background-image:
linear-gradient(to bottom right,#fdf8f5f7,#fdf8f5ed,#fdf8f5ad),url(/assets/valentine-background-LcX1h9T-.png);
background-position:0 0,right 0 bottom -60px;background-size:auto,800px auto;background-repeat:no-repeat,no-repeat}
```

- 三个 alpha 原样落地（`f7`=0.97 / `ed`=0.93 / `ad`=0.68）✅
- 四值 `background-position` **没有被压缩器改坏** ✅（所以写的是 longhand：`background`
  简写扛不动三值/四值的 position）
- 背景图**还是同一个文件**（`valentine-background-LcX1h9T-.png`）：主窗那份 CSS 和浮窗这份
  引用同一个哈希，Vite 没有复制第二份 —— **包大小零增长** ✅

改前改后对照图：`docs/screenshots/valentine-capture-bloom-2026-08-19.png`（左经典 / 右情人节，
WKWebView 真渲染）。

---

## 5. 休息提醒 —— 规则改在哪

Ocean 给的规则：「判断连续工作需要用户在固定时间段里打开 spool，并放在最前端窗口，**或者**用户
正在使用 spool，中间间隔不超过五分钟」，并且明确要我理解后**改成更合理的**。

改了三处，逐条说为什么：

1. **「最前端」和「正在使用」从「或」改成「且」。** 照字面的「或」有个洞：人去吃饭了，窗口在
   最前面摆一个小时，提醒就会对着空桌子弹出来——而且它是在**什么都没量到**的情况下弹的，弹窗里
   那句「你已经专注一个小时了」就是假话。他那五分钟宽限正好让「且」变得公平：**不动鼠标看一段长
   的块，照样算工作**，因为五分钟的静止是在读，不是不在。
2. **切走别的 app 不清零，只是暂停。** 五分钟宽限必须同时管「在 Spool 里坐着不动」和「离开
   Spool」——不然每瞟一眼浏览器就把一小时清零了。**在别的 app 里复制一下再回来，本来就是这个产品
   的主循环**（整条捕捉路径），罚它的规则在重度使用的一天里永远到不了一小时。
3. **累计的是「活跃时长」，不是「墙上过了多久」。** 五分钟以内的空档被原谅，但**不计入**：走开
   四分钟走两次，不该换来八分钟的「专注」。弹窗声称的是在桌前的时间，那就量那个。

⚠️ **还有一条防线是他没提但必须有的：合上笔记本。** 14:00 合盖 20:00 打开，会送来一个「过了六
小时」的 tick，窗口还在最前面、`lastInputAt` 按算术也还在宽限内——**用「开始时间戳」的写法会在
掀盖那一瞬间告诉用户「你已经专注六个小时了」**。所以计时是**一个个 tick 累加的，每个 tick 最多
只能记一个 tick 的时长**，睡眠再长也只贡献 30 秒，下一个 tick 就被宽限判定抓住。

规则写成了一个没有 timer、没有 store、没有 DOM 的纯 reducer（`lib/breakReminder.ts`），
所以这些边界（正好五分钟、睡了六小时）是**测试钉住的，不是靠人坐在机器前等一小时看一次**。

### 5.1 为什么这里可以用弹窗

产品有一条明文铁律反对弹窗（首日价值二期 拍板 4：「never a dialog … it would fire while the
user was in another app」）。**这两个反对理由是被回答了，不是被无视**：

1. **它不可能弹到别的 app 上。** 「在最前端」是这个计时器**成立的前提**，所以它到点的时候，用户
   一定正在看 Spool。满轴提醒做不到这个保证——捕捉什么时候来是没法预料的。
2. **它说的不是库的事，是人的事。** 别的提示都是「东西在哪就在哪说一句」，那条规则成立是因为
   **有个「东西」可以让这句话挨着**。这一条讲的是人，而页面上没有一个地方是「人在的地方」。在块
   流里写一行「歇一会儿」，等于写了一行会被滑过去的字。

---

## 6. Windows / Mac 同步

**没有任何平台专属代码。** 主题是 CSS token + 一个 `<html>` 上的属性 + `settings.json` 里一个
键；字体是打进包的，两边一模一样。逐条核对：

| 项 | 情况 |
|---|---|
| 字体 | 打包在 `src/assets/fonts/`，两个平台加载同一份 ttf |
| 中文衬线回退 | mac 走 `Songti SC` / `STSong`，Windows 走 **`SimSun`**（新加的） |
| 背景图 | Vite 打包成同源资源，CSP `img-src 'self'` 两边都过 |
| 主题落地 | `document.documentElement.setAttribute` —— 和平台无关 |
| 休息提醒 | `document.hasFocus()` + DOM 事件，WKWebView 和 WebView2 都有 |
| 弹窗 | 纯 React，不碰原生窗口 |
| 爱心 / 字标 | 内联 SVG + CSS keyframes，缩放走单个 `<g>` 的 `transform`（唯一在两个引擎里表现一致的做法） |
| Rust 侧 | **一行没改** |

⚠️ **Windows 安装包要在 Windows 机器上打。** 这一窗只在 Mac 上构建验证过。

---

## 7. 验证

| 项 | 开工前基线 | 本窗 |
|---|---|---|
| Vitest | 38 文件 / **430** | 40 文件 / **448**（+2 文件 / +18 条，全是新写的） |
| TypeScript `tsc -b` | clean | **clean** |
| `i18n-check` | `(none missing)` | **`(none missing)`** |
| `npm run build` | 通过 | **通过**，字体和背景图都进了包 |
| `git diff --check` | clean | **clean** |
| `SCHEMA_VERSION` | 23 | **23（没动，所以装机不会跑迁移）** |
| Rust `cargo test` | 72（旧记录） | **99 passed / 0 failed**（只有既存 `updated_at` warning） |
| `src-tauri/**` | — | **零 diff（Rust 一行没改）** |

编译产物核对（`dist/assets/`）：

- `[data-theme=valentine] .rail-wash{background-color:var(--rail-wash)}` 在 `main-*.css` 里 ✅
- `[data-theme=valentine] .font-serif{font-weight:500}` 在 **`main-*.css` 和 `overlay-*.css` 两份里都有** ✅
  （这就是为什么字重规则放在 `fonts.css`——浮窗不 import `global.css`）
- 背景图打包成 `valentine-background-LcX1h9T-.png`（959 KB），CSS 里引用的是这个同源路径 ✅
- 两个 Cormorant ttf 都在包里 ✅
- 含 `paper-2` 的选择器仍是原来那三条，**没有新增也没有改动** ✅（§1.1）

### 7.1 换装记录（2026-08-19 01:05–01:12，按 [[isolated-verify-workflow]] §21/§27 走）

- 手动备份：`spool.before-valentine-20260819-010726.db`（2.7 MB）+
  `settings.json.before-valentine-20260819-010503`。
- ⚠️ **签名踩到 §21② 那个坑，并按它的规程避开了**：现装的 `/Applications/Spool.app` 是
  **发布证书**（`Developer ID Application: Hanze JIN`）签的，而默认构建出来是 **`Spool Dev`** 自签。
  直接装自签的那份 = macOS 认成另一个 app = **已授的输入监听/辅助功能当场失效**。
  所以用 `APPLE_SIGNING_IDENTITY=...` 重新构建了一次（**没改 `tauri.conf.json`**，git 保持干净）。
- 装前核对：identifier `com.oceanjin.spool`（不是 `.verify`）、`codesign --verify --deep --strict` 通过。
- 旧版**挪走没删**：`~/Desktop/Spool-old-20260819-prevalentine.app` —— 这就是**回滚路径**。
- `--mcp` 子进程（20 个，别的 AI 客户端起的）**一个没杀**；只按 pid 杀了构建目录里那个
  22:53 起的过期 GUI。
- 装后核对：库 **v23 · 12/39/186/9，和装前一字不差**；**没有新的 `pre-migration` 快照**
  （最新那份仍是 08-17 的 v22）——证明**没有跑过迁移**；CPU 稳定 **0.0%**（排除白屏，
  见 §28）；`lsof` 有 20 个 `spool.db` fd；stderr 零报错。
- 情人节那条路也单独冒烟过：把 `theme` 写成 `valentine` 重启 → 挂载正常、0.0% CPU、零报错、
  库不变；**验完把 `settings.json` 还原了**，所以现在 `theme` 键**不存在** = 默认经典。

⚠️⚠️ **一条要先说清楚的、和本窗无关的既存问题**：启动日志里有

```
[double-tap] Input Monitoring NOT granted
[double-tap] Accessibility NOT granted
```

**这不是换装弄坏的。** 用**原来那份发布构建**放回**同一个路径**做了 A/B，它打出**一模一样的两行**。
也就是说这两个授权在换装之前就已经不在了（很可能是因为最近日常跑的是构建目录里那份
`Spool Dev` 签名的 app，TCC 的授权绑在那个签名上）。恢复办法在
`PermissionBanner` 的 denied 态第二行写着，也见 [[isolated-verify-workflow]] §6。

⚠️ 我拿不到系统 TCC 库（要 sudo / 完全磁盘访问），所以是用 A/B 而不是读授权表判定的。

---

## 8. 给 Ocean 的验收步骤

装完打开，**默认是经典版**，应该和你现在用的一模一样。

### 8.1 先确认经典版没被弄坏

- ☐ 打开 Spool，界面是**原来的奶油色**，字标是原来的字体
- ☐ 左边栏那个**线轴**还在，数字对得上
- ☐ 点左上角的「Spool」→ **什么都不该发生**（经典版没这个彩蛋）
- ☐ 随便复制点东西，双击 ⌥ → 捕捉浮窗是**原来的奶油色**

### 8.2 切到情人节版

设置（右上角齿轮）→ **通用** → 语言下面那一行叫 **「外观」** → 点 **「情人节」**。

- ☐ **不用重启**，界面立刻变成粉色，背景出现水彩花
- ☐ 花在**四个角**上，**中间写字的地方是干净的**
- ☐ 左右两个边栏是**淡薄荷绿**的，不是粉的
- ☐ 左边栏项目名、日期这些小字，**看得清**（这一条你觉得哪儿不清楚就告诉我，我有量过的数）
- ☐ 标题字体变了（一个古典的衬线体），**正文的字没变**

### 8.3 爱心

- ☐ 左边栏原来线轴的位置，现在是一个**粉色爱心**，外面套一个浅色的爱心轮廓
- ☐ 爱心的**大小**对得上你捕捉的条数（越多越大）
- ☐ 如果你已经攒满过 100 条，「还差…」那一行后面是**小爱心**，不是小线轴
- ☐ 捕捉几条，爱心**慢慢变大**（一步是 4 条，一步大概是这个记号的 4%，别指望一下就看出来）

### 8.4 Gwen

- ☐ 点左上角的 **「Spool」**（那个英文词）
- ☐ 它**先抖一下**，然后**变成 Gwen**
- ☐ 旁边的「思簿」两个字**留在原地**（只有英文换）
- ☐ 再点一下 → 抖一下 → 变回 Spool
- ☐ 关掉 Spool 再打开 → 又是 Spool（**故意不记住的**，理由在 `Wordmark.tsx` 里）

### 8.5 捕捉浮窗

- ☐ 在情人节版下，复制点东西，双击 ⌥ → **浮窗也是粉色的**（不用重启，它是另一个窗口，会自己跟上）
- ☐ 浮窗**右下角开着一朵水彩牡丹**，右上角有个花苞（就是背景图里那朵）
- ☐ **左边那一半是干净的纸**：捕到的那句话、下面那行小小的出处，都不压在花上
- ☐ 中间那个「留一句想法…」的框，**打字进去看得清**
- ☐ 对照图（如果你想先看长什么样，不用装）：`docs/screenshots/valentine-capture-bloom-2026-08-19.png`
- ☐ 「剪贴板为空」那种提示条、和撤销那条，**故意没有花**（一行字从左顶到右，花只会压在字底下）——
  你要是想要它们也带一点，说一声，是加一个类名的事

### 8.6 中英文

- ☐ 设置 → 语言 → **English** → 上面每一条再看一眼，**没有一处漏成中文**
- ☐ 「外观」那一行变成 **Appearance**，两个按钮是 **Classic / Valentine's**

### 8.7 休息提醒（这条要花一小时，可以放到最后）

规则：**Spool 在最前面 + 五分钟内你动过（打字/点/滚/移鼠标）**，这样累计满一小时才弹。
中间切去别的 app **五分钟以内**不清零，超过五分钟从零开始。走开的那几分钟**不算**进去。

- ☐ 用一个小时（正常用就行，中间切去别的 app 几下没关系）→ 弹出一张卡，标题**「歇一会儿」**
- ☐ 卡上有一个粉色小爱心
- ☐ 按 **Esc** 或点「好，去休息」→ 关掉
- ☐ 关掉之后**不会**过 30 秒又弹一次（它是**满一小时才弹一次**）
- ☐ 切回**经典版** → 这个提醒**不该再出现**（只在情人节版）

---

## 9. 改了哪些文件

**新增**

```
src/lib/theme.ts                       主题是什么（不 import 任何东西，见文件头）
src/hooks/useTheme.ts                  读当前主题 / 写到 <html>
src/lib/breakReminder.ts               休息判定（纯 reducer）
src/lib/breakReminder.test.ts
src/lib/theme.test.ts
src/hooks/useBreakReminder.ts           把事件喂给 reducer
src/components/BreakReminder.tsx        那张卡
src/components/Sidebar/HeartMeter.tsx   爱心 25 帧 + 小爱心
src/components/Sidebar/Wordmark.tsx     字标 + Gwen 彩蛋
src/assets/valentine-background.png
src/assets/fonts/CormorantGaramond[wght].ttf
src/assets/fonts/CormorantGaramond-Italic[wght].ttf
src/assets/fonts/OFL-CormorantGaramond.txt
docs/DESIGN_VALENTINE_EDITION.md
```

**改动**

```
src/styles/tokens.css              情人节调色板
src/styles/fonts.css               Cormorant Garamond 两个 @font-face + .font-serif 字重
                                   （字重放这儿是因为浮窗只 import tokens.css，不 import global.css）
src/styles/global.css              背景图 + 边栏薄荷罩 + 两个动画
src/stores/settingsStore.ts        theme 键（+ 读入时校验）
src/lib/blocks/spoolProgress.ts    spoolState 加 steps 参数；HEART_STEPS = 25
src/lib/blocks/spoolProgress.test.ts
src/lib/i18n/index.ts              新字符串的英文
src/App.tsx                        useAppliedTheme / BreakReminder / 加载画面走 token
src/overlay/CaptureOverlay.tsx     useAppliedTheme；捕捉卡片挂 capture-bloom 标记类；
                                   收 overlay:theme（§1.2 那个 bug 的修法）
src/lib/capture/overlayProtocol.ts OVERLAY_THEME_EVENT
src/lib/capture/overlayProtocol.test.ts  守卫：两侧事件名 + 主题仍和语言一起推
src-tauri/src/overlay.rs           ui_theme() + THEME_EVENT，每次 show 前推给浮窗
src/hooks/useTheme.ts              注释改成实话（原来那句是 bug 的根源）
src/lib/theme.ts                   同上
src/overlay/style.css              捕捉卡片上的那朵花（§4.1）——浮窗不 import global.css，
                                   所以规则住在这儿
src/components/Sidebar/index.tsx   用 Wordmark；边栏用 --rail-wash
src/components/Sidebar/SpoolCard.tsx  按主题选爱心还是线轴
src/components/RightRail/index.tsx    边栏用 --rail-wash
src/components/Settings/GeneralConfig.tsx  「外观」开关
```
