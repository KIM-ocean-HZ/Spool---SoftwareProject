#!/usr/bin/env python3
# Full-window mockups of the app, for Ocean to compare.
#
# 2026-08-11 round 2 — 左边栏五段统一 (HANDOFF §0.10 ②). Four windows, one file each so he
# can flip between them rather than scroll one tall image:
#   0  现状 —— 变体 D 已落地，五段还是三种写法（对照用）
#   A  五段一律灰色小标题，所有项目行左边缘对齐，工作区里的项目不再缩进
#   B  工作区保留衬线名字 + 缩进，最近/聚焦仍是灰色小标题
#   C  五段一律衬线大标题
#
# A/B/C share every other change (one left edge, one row height, no section rules, one
# vertical rhythm) — the ONLY difference between them is the section-label typography, which
# is the one fork he has to pick.
#
# ⚠️ Hand-copied markup. If it disagrees with the components, suspect THIS file (§9.5).
# ⚠️ Its content is a literal copy of a 已快照 library — it never touches the real DB.
import pathlib
import sys

FONTS = pathlib.Path("/Users/hzjin/Desktop/Knote/src/assets/fonts").resolve()
SIDEBAR = 260  # lib/layout.ts SIDEBAR_WIDTH — sheets may override it to try a wider rail
WIN_W, WIN_H = 1240, 780
OUT = pathlib.Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "/private/tmp/claude-501/-Users-hzjin-Desktop-Knote/"
    "c375f8c0-87e2-4a64-90d6-ab319e26c54c/scratchpad"
)

# ── the spool meter, copied from SpoolMeter.tsx ──────────────────────────────
CY, AXLE, FULL = 18, 4.5, 14
COIL_X = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]


def meter(level=6, steps=20):
    f = (AXLE + (level / steps) * (FULL - AXLE)) / FULL if level > 0 else 0
    coils = "".join(
        f'<line x1="{x}" y1="{CY-FULL}" x2="{x}" y2="{CY+FULL}" stroke="var(--accent)"'
        ' stroke-width="1.4" stroke-linecap="round" opacity="0.85"/>'
        for x in COIL_X
    )
    return (
        '<svg viewBox="0 0 40 36" width="40" height="36" class="meter">'
        f'<rect x="6" y="{CY-AXLE}" width="28" height="{AXLE*2}" rx="1" fill="var(--line)"/>'
        f'<g style="transform:translateY({CY}px) scaleY({f}) translateY(-{CY}px)">{coils}</g>'
        '<rect x="3" y="2" width="4" height="32" rx="2" fill="var(--line-strong)"/>'
        '<rect x="33" y="2" width="4" height="32" rx="2" fill="var(--line-strong)"/></svg>'
    )


# 变体 D as landed: a hairline frame, no fill of its own.
PANEL = (
    '<div class="panel framed">'
    '<div class="p-head">' + meter() + '<div class="p-col">'
    '<span class="f">你捕捉了 34 条</span>'
    '<div class="p-l2"><span class="f">还差 66 条缠满</span></div>'
    "</div></div>"
    '<div class="p-today"><span class="f">今天读了 2 条</span>'
    '<span class="f">写了 128 字</span></div>'
    "</div>"
)


# ── icons (lucide paths, 12/14px) ───────────────────────────────────────────
def ico(d, size=12, cls="ic"):
    return (
        f'<svg class="{cls}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none"'
        f' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        f' stroke-linejoin="round">{d}</svg>'
    )


I_GRID = ico('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>')
I_CAL = ico('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4M17 14h-6"/>')
I_CHEV = ico('<path d="m6 9 6 6 6-6"/>')
I_CHEV10 = ico('<path d="m6 9 6 6 6-6"/>', 10)
I_PLUS = ico('<path d="M12 5v14M5 12h14"/>')
I_SEARCH = ico('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', 14)
I_GEAR = ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.43.65.79.79H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 14)
I_CLOSE = ico('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M16 15l-3-3 3-3"/>', 14)
I_OPEN = ico('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18M8 9l3 3-3 3"/>', 14)
I_DAYS = ico('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>')


# ── sidebar pieces ──────────────────────────────────────────────────────────
def row(label, icon="", right="", active=False):
    a = " active" if active else ""
    return (
        f'<li class="row{a}">{"<span class=\'mark\'></span>" if active else ""}'
        f'<div class="row-in">{icon}'
        f'<span class="row-t">{label}</span>{right}</div></li>'
    )


CAPTURING = '<span class="cap">捕捉中<span class="dot"></span></span>'
DUE = '<span class="due">剩 42 天</span>'

PINNED = '<ul class="pinned">' + row("项目管理", I_GRID) + row("周回顾", I_CAL) + "</ul>"

# RECENT_MAX = 3 (Ocean 2026-08-11: 「最近现在是四个项目，去掉一个」)
RECENT = row("saaa", right=CAPTURING) + row("申请规划", active=True) + row("表")
FOCUS = row("Flux", right=DUE)
WS = [
    ("升学", [row("申请规划", active=True), row("回顾"), row("无标题"),
              row("欢迎使用 Spool"), row("让 AI 用上你的 Spool")]),
    ("Spool", [row("saaa", right=CAPTURING), row("表"), row("无标题")]),
    ("Flux", [row("Flux", right=DUE)]),
]


# ── 现状: three different section styles (RecentSection / FocusSection / WorkspaceGroup) ──
def old_section(label, rows):
    return f'<div class="sect"><div class="sect-l">{label}</div><ul>{rows}</ul></div>'


def old_group(title, threads):
    return (
        f'<div class="grp"><div class="grp-h">{I_CHEV}'
        f'<span class="grp-t">{title}</span></div>'
        f'<ul class="grp-l">{"".join(threads)}</ul></div>'
    )


REST_NOW = (
    old_section("最近", RECENT)
    + old_section("聚焦", FOCUS)
    + "".join(old_group(t, ths) for t, ths in WS)
)


# ── A / B / C: one section shape, one left edge, no rules ───────────────────
def new_section(label, rows, serif=False, chevron=False, indent=False, rule=False):
    """Every section in A/B/C is this: a label row, then rows. Nothing else varies.

    The collapse chevron follows the name instead of preceding it — a chevron in front
    pushes the label off the one left edge the whole rail is now built on, which is the
    thing being fixed; parked at the far right it reads as unattached to the name.
    """
    chev = f'<span class="nchev">{I_CHEV10}</span>' if chevron else ""
    return (
        f'<div class="nsect{" ruled" if rule else ""}">'
        f'<div class="nsect-l{" serif" if serif else ""}">'
        f'<span class="nsect-t">{label}</span>{chev}</div>'
        f'<ul class="nlist{" indent" if indent else ""}">{rows}</ul></div>'
    )


def rest_new(style):
    base = style[0]
    serif_ws = base in ("B", "C")
    serif_sys = base == "C"
    indent = base == "B"
    # 2026-08-11 Ocean, on picking A: 「在最近和聚焦下面加一条线」. Two readings — a rule under
    # each of the two, or one rule closing the pair off from the workspaces below — so both
    # are drawn rather than guessed at (§1-decies 教训 1).
    return (
        new_section("最近", RECENT, serif=serif_sys, rule=style == "A1")
        + new_section("聚焦", FOCUS, serif=serif_sys, rule=style in ("A1", "A2"))
        + "".join(
            new_section(t, "".join(ths), serif=serif_ws, chevron=True, indent=indent)
            for t, ths in WS
        )
    )


FOOTER = (
    '<footer class="foot"><button class="fbtn">' + I_PLUS + "<span>工作区</span></button>"
    '<div class="fright">' + I_SEARCH + I_GEAR + "</div></footer>"
)


def sidebar(style):
    rest = REST_NOW if style == "now" else rest_new(style)
    return (
        f'<aside class="rail {"now" if style == "now" else "unified"}">'
        '<header class="r-head"><h1>Spool<span class="zh">思簿</span></h1>'
        f'<span class="collapse">{I_CLOSE}</span></header>'
        f'<div class="r-scroll">{PINNED}{PANEL}{rest}</div>'
        f"{FOOTER}</aside>"
    )


# ── centre column (his real 〈申请规划〉) ────────────────────────────────────
def block(seq, time, source, note, body):
    note_html = f'<div class="b-note">{note}</div>' if note else ""
    cls = "b-body quoted" if note else "b-body"
    return (
        '<article class="blk">'
        f'<div class="b-meta"><span class="seq">{seq}</span>'
        f'<time>{time}</time><span class="src">{source}</span></div>'
        f'{note_html}<div class="{cls}">{body}</div></article>'
    )


BLOCKS = (
    block(23, "08/10 17:06", "Codex · MCP — 用户确认的项目进度",
          "更新申请材料中的产品完成状态，避免继续把已交付成果写成计划。",
          "<b>更正：Spool 的跨平台版本与宣传视频已完成</b><br>Spool 的 Mac 版本、Windows 版本以及 "
          "desktop 全球平台宣传视频均已完成。自此在简历、作品集、申请文书和技术讲解中，应作为已完成的"
          "可交付成果表述，并以可访问链接、发布记录或视频作为证据；不再标注为 planned 或 in progress。")
    + block(22, "08/10 15:58", "Codex · MCP",
            "用于调整 Spool 证据材料的收尾排期。", "spool差不多20号之后要结束了")
    + block(21, "08/10 15:58", "Codex · MCP — 用户原文", None,
            "1.flux大概在8月二十号之后开始动工；2.spool差不多20号之后要结束了")
    + block(20, "08/09 21:07", "Codex · MCP — CMU MHCI 与 MSLE 官方 FAQ · 2026-08-09",
            "排除把其他 CMU 项目的例外误当成 MHCI 先例，避免为不满足资格的项目投入材料时间。",
            "<b>CMU MHCI：L24 不能视为可用例外</b><br>CMU MHCI 目前公布的英语门槛是 TOEFL iBT 总分"
            "至少 100，且每个小分至少 25。库内没有可核验的「MHCI 单项 24 仍录取」记录。")
)

CENTRE = (
    '<main class="centre">'
    '<header class="c-head">'
    '<div class="c-title-row"><span class="c-title">申请规划</span>'
    '<span class="pill accent">打包 ⌘⇧P</span>'
    '<span class="pill">一键问 AI</span><span class="pill">跟进</span>'
    '<span class="pill">⋯</span></div>'
    '<div class="c-sum">Fall 2027 美国专业型硕士：15 所主名单加推荐第 16 所 MIIAS；当前优先完成 '
    'Spool 证据包、GRE Quant 167+、机器人事实包、FLUX 演示与推荐人确认。</div>'
    '<div class="c-meta"><span class="tab on">进行中</span><span class="sl">/</span>'
    '<span class="tab">已完成</span>'
    f'<span class="c-date">{I_DAYS}<span class="mono">未设截止</span></span>'
    '<span class="c-n">23 块 · 41,208 字</span></div>'
    "</header>"
    f'<div class="c-feed">{BLOCKS}</div>'
    '<div class="c-comp"><span class="ph">写点什么，或按 ⌘⇧空格 从别处捕捉…</span></div>'
    "</main>"
)


def css(sidebar_w=SIDEBAR, centre_top=0):
    """centre_top pushes the whole centre column down — 2026-08-11 Ocean:
    「工作区顶部栏下移，和左边的价值面板对齐」."""
    return CSS_TMPL.replace("__SIDEBAR__", str(sidebar_w)).replace(
        "__CENTRE_TOP__", str(centre_top)
    )


CSS_TMPL = f"""
@font-face {{ font-family:'Geist'; src:url('file://{FONTS}/Geist[wght].ttf'); font-weight:100 900; }}
@font-face {{ font-family:'Fraunces'; src:url('file://{FONTS}/Fraunces[SOFT,WONK,opsz,wght].ttf'); font-weight:100 900; }}
@font-face {{ font-family:'Fraunces'; src:url('file://{FONTS}/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf'); font-weight:100 900; font-style:italic; }}
@font-face {{ font-family:'GeistMono'; src:url('file://{FONTS}/GeistMono[wght].ttf'); font-weight:100 900; }}
:root {{
  --paper:#faf7f0; --paper-2:#f3eee2; --ink:#1c1a16; --ink-2:#4a463d; --muted:#8c8576;
  --line:#e6dfcc; --line-strong:#d6cdb3; --accent:#b45309; --accent-soft:#fef3c7;
  --parked:#a8632c;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:24px; background:#efe9dc; color:var(--ink);
  font-family:'Geist',-apple-system,'PingFang SC',sans-serif; -webkit-font-smoothing:antialiased; }}
figure {{ margin:0; }}
figcaption {{ font-size:13px; color:#5c564a; margin-bottom:8px; font-weight:500; }}
.win {{ width:{WIN_W}px; height:{WIN_H}px; display:flex; overflow:hidden;
  border-radius:10px; background:
   radial-gradient(circle at 20% 0%, rgba(180,83,9,0.04), transparent 40%),
   radial-gradient(circle at 100% 100%, rgba(180,83,9,0.03), transparent 35%), var(--paper);
  box-shadow:0 10px 34px -14px rgba(60,40,10,0.45); }}

/* ── left rail ───────────────────────────────────────── */
.rail {{ width:__SIDEBAR__px; flex:none; display:flex; flex-direction:column;
  border-right:1px solid var(--line); background:rgba(243,238,226,0.4); }}
.r-head {{ display:flex; align-items:flex-start; justify-content:space-between;
  gap:8px; padding:20px 20px 24px 20px; }}
.r-head h1 {{ margin:0; font-family:'Fraunces',serif; font-weight:400; font-size:1.875rem;
  line-height:2.25rem; letter-spacing:-0.025em; }}
.r-head .zh {{ font-family:'Fraunces',serif; font-style:italic; font-size:1.125rem;
  color:var(--muted); margin-left:0.5rem; }}
.collapse {{ color:var(--muted); margin-top:10px; padding:4px; }}
/* ⚠️ min-height:0 or the rail's content pushes the footer out of the window — a flexbox
   artifact of the mock, not of the app (the real one scrolls). */
.r-scroll {{ flex:1; min-height:0; overflow:hidden; padding:0 8px 16px 8px; }}

/* every clickable row in the rail, in every variant */
.pinned {{ list-style:none; margin:0; padding:0; }}
.row {{ position:relative; list-style:none; border-radius:6px; padding:6px 12px; }}
.row.active {{ background:var(--paper-2); }}
.mark {{ position:absolute; left:0; top:6px; bottom:6px; width:2px;
  border-radius:0 2px 2px 0; background:var(--accent); }}
.row-in {{ display:flex; align-items:center; gap:8px; }}
.row-t {{ min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:0.875rem; line-height:1.25rem; }}
.ic {{ flex:none; color:var(--muted); }}
.cap {{ flex:none; display:flex; align-items:center; gap:4px; font-size:10.5px; color:var(--accent); }}
.dot {{ width:6px; height:6px; border-radius:99px; background:var(--accent); }}
.due {{ flex:none; font-size:10px; color:var(--parked); font-family:'GeistMono',monospace; }}
.foot {{ flex:none; display:flex; align-items:center; justify-content:space-between;
  border-top:1px solid var(--line); padding:12px 16px; }}
.fbtn {{ display:flex; align-items:center; gap:4px; font-size:0.75rem; color:var(--muted);
  background:none; border:0; padding:4px; }}
.fright {{ display:flex; align-items:center; gap:4px; color:var(--muted); }}

/* ── 现状 only: three section styles ─────────────────── */
.sect {{ margin-bottom:4px; border-bottom:1px solid var(--line); padding:0 8px 8px 8px; }}
.sect-l {{ padding:8px 12px 4px 12px; font-size:10.5px; letter-spacing:0.025em; color:var(--muted); }}
.sect ul {{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }}
.grp {{ margin-bottom:6px; border-radius:6px; }}
.grp-h {{ display:flex; align-items:center; gap:4px; padding:4px 8px; }}
.grp-t {{ min-width:0; flex:1; font-family:'Fraunces',serif; font-size:1rem; }}
.grp-l {{ list-style:none; margin:0; padding:0 0 4px 20px; display:flex; flex-direction:column; gap:2px; }}
.rail.now .pinned {{ margin-bottom:4px; }}

/* ── A / B / C: one section shape ────────────────────── */
.nsect {{ margin-top:14px; }}
/* The rule spans the scroll box edge to edge, which is exactly where the value panel's
   frame sits — so the two lines in the rail share one left and one right edge. */
.nsect.ruled {{ border-bottom:1px solid var(--line); padding-bottom:12px; }}
.nsect-l {{ display:flex; align-items:center; gap:6px; padding:0 12px 4px 12px;
  font-size:10.5px; letter-spacing:0.025em; color:var(--muted); }}
.nsect-l.serif {{ font-family:'Fraunces',serif; font-size:1rem; letter-spacing:0;
  color:var(--ink); padding-bottom:2px; }}
.nsect-t {{ min-width:0; flex:0 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.nchev {{ flex:none; display:flex; color:var(--muted); }}
.nlist {{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }}
.nlist.indent {{ padding-left:14px; }}
.rail.unified .panel {{ margin:10px 0 0 0; }}

/* ── the value panel — 变体 D as landed (frame, no fill) ─ */
.panel {{ margin-bottom:8px; padding:8px 12px; }}
.panel.framed {{ border:1px solid var(--line); border-radius:6px; }}
.p-head {{ display:flex; align-items:center; gap:12px; }}
.meter {{ flex:none; }}
.p-col {{ display:flex; min-width:0; flex:1; flex-direction:column; row-gap:2px; line-height:1.375; }}
.p-l2 {{ display:flex; align-items:center; gap:8px; }}
.f {{ white-space:nowrap; font-size:11px; color:var(--ink-2); }}
.p-today {{ margin-top:8px; display:flex; align-items:baseline; column-gap:12px;
  border-top:1px solid var(--line); padding-top:6px; }}

/* ── centre ──────────────────────────────────────────── */
.centre {{ min-width:0; flex:1; display:flex; flex-direction:column; overflow:hidden;
  padding-top:__CENTRE_TOP__px; }}
.c-head {{ flex:none; border-bottom:1px solid var(--line); padding:12px 24px; }}
.c-title-row {{ display:flex; align-items:center; gap:12px; }}
.c-title {{ min-width:0; flex:1; font-family:'Fraunces',serif; font-size:1.5rem; }}
.pill {{ flex:none; border:1px solid var(--line); background:var(--paper); border-radius:99px;
  padding:4px 10px; font-size:0.75rem; color:var(--muted); }}
.pill.accent {{ border-color:rgba(180,83,9,0.6); background:var(--accent-soft); color:var(--accent);
  font-weight:500; }}
.c-sum {{ margin-top:6px; font-size:0.75rem; font-style:italic; color:var(--muted);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.c-meta {{ margin-top:10px; display:flex; align-items:center; gap:12px; font-size:0.75rem;
  color:var(--muted); }}
.tab {{ border-radius:99px; padding:2px 8px; }}
.tab.on {{ background:var(--paper-2); color:var(--ink); }}
.sl {{ color:rgba(140,133,118,0.4); }}
.c-date {{ display:flex; align-items:center; gap:6px; }}
.mono {{ font-family:'GeistMono',monospace; font-size:11px; }}
.c-n {{ margin-left:auto; font-family:'GeistMono',monospace; font-size:11px; }}
.c-feed {{ flex:1; overflow:hidden; padding:10px 20px; }}
.blk {{ border-radius:6px; padding:12px 14px; }}
.b-meta {{ display:flex; align-items:center; gap:8px; margin-bottom:4px;
  font-size:10px; color:var(--muted); }}
.b-meta time {{ font-family:'GeistMono',monospace; }}
.seq {{ display:inline-flex; height:13px; min-width:13px; align-items:center;
  justify-content:center; border-radius:99px; border:1px solid currentColor; padding:0 3px 0 3px;
  font-family:'GeistMono',monospace; font-size:9px; line-height:1; }}
.src {{ font-size:10px; }}
.b-note {{ margin-bottom:6px; font-size:15px; font-weight:500; line-height:1.55; color:var(--ink); }}
.b-body {{ font-size:15px; line-height:1.65; color:var(--ink); }}
.b-body.quoted {{ font-size:13.5px; color:var(--ink-2); }}
.c-comp {{ flex:none; border-top:1px solid var(--line); padding:14px 24px 18px 24px; }}
.ph {{ font-size:0.875rem; color:rgba(140,133,118,0.55); }}
.rail-open {{ flex:none; align-self:flex-start; margin:6px; padding:6px; color:var(--muted); }}
"""


def page(style, caption, sidebar_w=SIDEBAR, centre_top=0):
    return (
        '<meta charset="utf-8"><style>' + css(sidebar_w, centre_top) + "</style>"
        f'<figure><figcaption>{caption}</figcaption>'
        f'<div class="win">{sidebar(style)}{CENTRE}'
        f'<div class="rail-open">{I_OPEN}</div></div></figure>'
    )


# 2026-08-11 round 3 — 「左侧边栏做宽一点」+「工作区顶部栏下移，和左边的价值面板对齐」.
# 对齐有两种读法，两种都画出来(台账 §3.29):顶边对齐 vs 两条横线接成一条。
WIDE = 300
SHEETS = [
    ("mock-wide", "A2", f"① 只把左边栏加宽到 {WIDE}px，工作区顶部栏不动（对照用）", WIDE, 0),
    ("mock-align-top", "A2",
     f"② 左边栏 {WIDE}px + 工作区顶部栏下移到「顶边和价值面板的顶边齐」", WIDE, 154),
    ("mock-align-rule", "A2",
     f"③ 左边栏 {WIDE}px + 工作区顶部栏下移到「它那条横线和价值面板的底边接成一条」",
     WIDE, 129),
    ("mock-a2", "A2", "A2（现在装着的这一版，260px）—— 五段一律灰色小标题、项目行一条左边缘、"
                      "只在聚焦下面一条线；最近 3 条"),
]

OUT.mkdir(parents=True, exist_ok=True)
for sheet in SHEETS:
    name, style, caption = sheet[0], sheet[1], sheet[2]
    p = OUT / f"{name}.html"
    p.write_text(page(style, caption, *sheet[3:]), encoding="utf-8")
    print(p)
