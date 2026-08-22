# 修 —— 119 处带透明度的类名一直没生效（2026-08-19）

> ✅ **已完成并合并 —— 这份是档案，不要照它开工。**
> `fix/tailwind-alpha`（`5cb3517`）**已经并进 `main`**（`git merge-base --is-ancestor` 复核过），
> 并作为 **v0.6.0** 的「Fixed: translucent surfaces were not translucent」发布出去了。
> ⚠️ Ocean 实机看过之后的判决是**两条边栏回退、其余保留**，判决记录在 `5cb3517`。
> 当前开工面是 `docs/archive/BACKLOG-2026-08-19.md`。
>
> 【以下为当时的原始记录】**分支 `fix/tailwind-alpha`，从 `main`（`5189c7b`）开的，没推、没合。**
> 起因当时写在 `docs/archive/HANDOFF-2026-08-19.md §2`（那份已重排，现在没有这一节了），Ocean 的原话是
> 「那 100 处死类名，**建一个分支去实现，没问题再合并**」。这份是这条分支上做了什么、
> 量到了什么、以及**合并前还欠什么**。
>
> ⚠️ 情人节支线（`valentine-edition`）不在这条分支上，两边的关系见 §6.1。

---

## 0. 一句话

代码里有 119 处写着「半透明」的样式（弹窗背后的暗色、边栏的奶油底、鼠标划过的淡底色……），
**从来没有出现在发布版里**——不是写错了，是构建工具把它们整条丢掉了，而且不报错。
这条分支把工具修好，让它们照代码本来的样子生效。

---

## 1. 病因（已确证）

`tailwind.config.js` 里每个颜色都写成 `'var(--paper)'` 这种**完整颜色**的形式。
Tailwind v3 **没法**往一个已经装着完整颜色的 CSS 变量里再注入 alpha 通道，
于是遇到 `bg-ink/30` 这类带斜杠的类，**它不报错，直接把整条规则丢掉**。
构建全绿、tsc 全绿、测试全绿，什么都不说——所以它能一直躺着。

---

## 2. 改了什么（两个文件，`src/**` 的组件一个字没动）

**`src/styles/tokens.css`** —— 上 Tailwind 的那八个颜色，每个拆成**两个** token：

```css
--paper-rgb:  250 247 240;          /* 裸通道值，给 Tailwind 注 alpha 用 */
--paper:      rgb(var(--paper-rgb)); /* 包好的完整颜色，直接 var(--paper) 的地方照旧 */
```

**两个都必须留着**，缺哪个坏哪边：只留完整颜色就是现在这个 bug；只留通道值，
`tokens.css` / `global.css` / `fonts.css` 里一大堆**直接**写 `var(--paper)` 的地方会全部失效。
（`--paper-edge`、`--accent-2`、状态色等不上 Tailwind 的 token 没动，仍是 hex。）

**`tailwind.config.js`** —— 八个颜色改成 `rgb(var(--x-rgb) / <alpha-value>)`。

两个文件里都写了注释说明为什么是这个形状，免得以后有人「顺手化简」回去。

---

## 3. 取证（编译产物，不是读代码）

```bash
npm run build && cd dist/assets
for c in 'bg-ink\/30' 'hover\:bg-paper-2\/60' 'bg-accent\/10' 'bg-paper-2\/40' \
         'text-muted\/70' 'ring-accent\/50' 'border-accent\/60' 'bg-accent\/15'; do
  printf '%-26s hits=%s\n' "$c" "$(grep -F -c "$c" main-*.css)"
done
```

| | 改前 | 改后 |
|---|---|---|
| 八个抽样 | 全部 `hits=0` | **全部 `hits=1`** |
| 编译出来长什么样 | （整条规则不存在） | `.bg-ink\/30{background-color:rgb(var(--ink-rgb) / .3)}` |
| 不带斜杠的基础类 | `rgb(var(--tw-bg-opacity…))` | 同左，**没变坏** |

浮窗那份 `overlay-*.css` 同样恢复（`border-accent/20`…`bg-accent/10` 全在）。

---

## 4. 测试（`main` 基线，本机实测）

| | 结果 |
|---|---|
| Vitest | **430 / 430**，38 文件（改前在同一棵树上跑也是 430，没退） |
| tsc | clean（`npm run build` 里的 `tsc -b`） |
| cargo | **99 passed** |
| i18n | `(none missing)` |
| 官网视觉基线 | 不受影响，`site/` 不用 Tailwind，没重跑 |

---

## 5. 实机改前改后 —— 给 Ocean 看的

**图：`docs/screenshots/tailwind-alpha-before-after-2026-08-19.png`**（四组，左改前右改后）

不是渲染图、不是效果图：两份**真的 app**，同一台机器、同一个演示库、同样的窗口大小，
一份用改前的 CSS 编的，一份用改后的，逐一截屏。

⚠️ **真库全程没碰**：两份都是 `com.oceanjin.spool.verify` 身份的隔离构建，数据在
`…/Application Support/com.oceanjin.spool.verify`（`scripts/seed-demo-library.sh` 种的演示库）。
截完复核过真库：**v23 · 12 / 39 / 186 / 9，与今早一字不差**，21 个 `--mcp` 子进程一个没动。

量出来的（截图逐像素，不是估的）：

| 看哪儿 | 改前 | 改后 |
|---|---|---|
| 左栏空白处 | rgb(248,243,236) | rgb(245,241,232) ← 多了 40% 奶油底 |
| 弹窗背后（左栏那块） | rgb(238,234,224) | **rgb(174,171,163)** ← 30% 暗色罩子 |
| 正文纸面 | rgb(250,247,241) | rgb(250,247,241) ← **一点没变** |
| 鼠标划过的那一行 | 与邻行差 1/255 | 与邻行差 4/255（很淡） |

整窗有变化的像素 19.4%，其中**左栏占 67%**；正文区只剩 3.5%，全是**几条淡边框**
（笔记之间的分隔线、草稿框的框线）——就是 `border-line/40`、`border-line/60` 这些
本来就写着、以前没生效的。

§2.5 预告的四条，实机对上了三条半：

1. ✅ **弹窗背后压上 30% 暗色** —— 设置弹窗实拍（另外 8 个同理，同一个类）。
2. 🔸 **鼠标划过出现淡底色** —— 出现了，但因为整条左栏也变深，**差别很淡**（4/255）。
3. ✅ **左右两个边栏多出 40% 奶油底** —— 这条最显眼，就是图②。**不是改坏了**：
   `bg-paper-2/40` 一直挂在那两个 `<aside>` 上，只是从来没编译出来过。
4. ✅ **淡边框开始出现** —— 正文区那 3.5% 就是它们。

---

## 6. ✅ 合并前欠的两件（2026-08-19 已做，在情人节那侧）

### 6.1 情人节那套 token 要一起改

`valentine-edition` 里 `[data-theme='valentine']` 那套 token 还是老形状（完整颜色）。
这条分支是从 `main` 开的，上面**根本没有**那个主题块，所以改不到。
**两边合并的时候必须补上**——否则修完只有经典版的透明度活过来，情人节版还是死的。

顺带：`valentine-edition` 里那条 `:root[data-theme='valentine'] .rail-wash{…}` 是
「原类不动、只加覆盖」写法。§2 生效后**经典版**边栏拿到 40% 奶油（图②），
**情人节版**仍被 `.rail-wash` 盖成薄荷色——两边都对，但要再看一眼经典版是不是要的样子。

### 6.2 `BreakReminder.tsx` 的内联遮罩改回 `bg-ink/30`

那处写死的 `rgba(58,42,53,.32)` 是当时绕开这个 bug 用的。合并之后应该改回
`bg-ink/30`，跟其它 9 个弹窗一致，**并把文件里解释「为什么是内联」的那段注释一起更新**。
它在情人节分支上，所以也留到合并那一步。

---

## 7. ✅ Ocean 的判决（2026-08-19，实机看过之后）

**装机让他看了**（发布证书、原 identifier，库 v23·12/39/186/9 装前装后未变，
双击 ⌥ 仍是 `HID/active`）。他的原话：

> 「左栏……**这个我不要，右栏现在也是这个状态，回退**；其他全部保留，分支合并」

所以：

- **两条边栏**（`Sidebar/index.tsx`、`RightRail/index.tsx`）的 `bg-paper-2/40` **删掉**，
  两条栏回到发布版一直以来的样子（透明、透出 `.paper-bg`）。两个文件里都留了注释，
  **别再加回来**。⚠️ 是删类名，不是靠继续让 Tailwind 丢规则——那样另外 117 处也一起还回去了。
- **其余全部保留**：9 个弹窗背后的 30% 暗色、hover 淡底色、淡边框、`ring-accent/50` 焦点圈。
- **合并**：`fix/tailwind-alpha` → `main`；情人节那侧（§6.1 / §6.2 两件已做）
  → `valentine-edition`。**都没有推。**

⚠️ 情人节版的两条边栏不受这次回退影响：那是 `.rail-wash` 那条独立规则画的薄荷色，
和 `bg-paper-2/40` 没有关系。

---

## 8. 复现这份对照的办法（下一窗要重拍就照这个）

1. `bash scripts/seed-demo-library.sh` —— 种隔离演示库（只写 verify 目录）。
2. `src-tauri/tauri.conf.json` 的 identifier 临时改 `com.oceanjin.spool.verify`，
   `npm run tauri build -- --bundles app`，把 `.app` 拷走；`git stash` 掉本分支这两个文件、
   再编一次，得到「改前」那份；`git stash pop`；**改回 identifier**。
3. 启动一律 `open -a <绝对路径>`，**别按 bundle id**（桌面上还有别的同 id 拷贝，见
   `HANDOFF-2026-08-19.md §3`）。
4. ⚠️⚠️ **截图/驱动一律按窗口 id，别按 AX、别按坐标猜**。本机正式版和隔离版的窗口
   **默认落在同一个位置同一个大小**（100,50 / 1600×1000），而且两个进程都叫 `spool`——
   `System Events` 的 `every process whose unix id is <pid>` **会返回错的那个**：
   本窗照它去挪窗口，挪到的是 Ocean 正在用的那一个（已挪回原位）。
   可靠的做法是 `CGWindowListCopyWindowInfo` 拿 `kCGWindowNumber`
   （`scripts/zorder.c` 那套），然后 `screencapture -x -o -l<winid>`，
   点击前先用 zorder 确认自己排在第 0 位。
