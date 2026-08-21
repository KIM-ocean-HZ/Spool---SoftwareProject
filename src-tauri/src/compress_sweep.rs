//! 第二轮压缩实测台（WORKPLAN-2026-08-20 §9.6.3，方案在 `docs/Deepseek-API-compress-test.md` §2）。
//!
//! # 为什么是这个形状
//!
//! 第一轮那 12 次是 Ocean 一次一次手点出来的，于是每一格只有 1–4 个样本，而同一格能差
//! 25 个百分点 —— **两次对照不叫对照**。这一轮要的是「至少 5 次 / 格，报中位数 + 最小–最大」，
//! 手点跑不出来。
//!
//! ⛔ **不走 GUI 自动化。** `spool-ai` 的契约是 stdin 进 JSON、stdout 出一行 JSON，
//! 所以这里直接喂它，绕开整个界面。这台机器上合成鼠标键盘已经踩过三类坑
//! （窗口重叠、点到别人窗口、HID tap 看不见合成事件），而那三类坑一个都不会告诉你它踩了。
//!
//! ⚠️ **量的必须是产品本身**：pack 走 `mcp::get_pack_text`，提示词走
//! `mcp::compress_messages_for_api`，请求走 `api_engine::sidecar_request`，
//! 起进程走 `api_engine::spawn_sidecar`。**这里一份都不另外拼。**
//!
//! ⛔ **只读库**，⛔ **串行**，⛔ **每次都留原文**（信封 + 压缩稿全文），
//! ⛔ **失败也记**（失败分类正是为这个做的）。
//!
//! # 跑法
//!
//! ```text
//! SPOOL_SWEEP_PLAN=/path/plan.json SPOOL_SWEEP_OUT=/path/out \
//!   cargo test --lib compress_sweep::run_the_sweep -- --ignored --nocapture
//! ```
//!
//! `plan.json` 是一个数组，每一项 `{"label","thread","range","level","reasoning","repeats"}`。
//! 计划放在文件里而不是写死在这儿，是因为分阶段跑（A/B/C）之间要看着结果决定下一步，
//! 而重编一次 Rust 要几分钟。
//!
//! ⚠️ 用的是 Ocean 自己的 key 和额度（从 `app_config_dir()/api-key` 读）。这件事写在这里，
//! 不藏在代码里。

use std::io::Write;

#[derive(serde::Deserialize)]
struct Step {
    label: String,
    thread: String,
    /// ⭐ **口径校准的结论**（2026-08-21，见 `Deepseek-API-compress-test.md` §2.4）。
    ///
    /// 界面上按「压缩」时送出去的是 **TS 渲染器**产出的**剪贴板形态** pack，而
    /// `mcp::get_pack_text` 给的是 **MCP 形态**——两者的差别不是渲染器，是那段
    /// `## How to Read This Context` + `## Notation` 表头（宣发那份 **6,594 字符**，
    /// 占整份的 56%）。表头按第 1 条规则要**一字不改照抄**，所以它进不进来，
    /// 直接决定「压完剩百分之几」这个数字——而那个数字正是要拿去改 `LEVEL_HINTS` 的。
    ///
    /// 所以这一轮喂的是**剪贴板形态**：给出文件路径就读文件，留空才回落到 Rust 渲染器。
    #[serde(default)]
    pack_file: String,
    #[serde(default = "all_range")]
    range: String,
    level: String,
    /// 这一步发哪一份提示词：`""`/`"compress"` = 产品现行的压缩提示词，
    /// `"stale"` = 下面那份**候选**的作废检测提示词（WORKPLAN §9.10 第三轮）。
    #[serde(default)]
    mode: String,
    /// 「思考力度」：`""` = 不发这个参数，`"off"` = 明确关掉，其余原样发。
    #[serde(default)]
    reasoning: String,
    #[serde(default = "one")]
    repeats: u32,
}

fn all_range() -> String {
    "all".to_string()
}
fn one() -> u32 {
    1
}

fn env_path(k: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var(k).unwrap_or_else(|_| panic!("{k} must be set")))
}

/// 一次跑完计划里的每一步。结果按行追加进 `<out>/runs.jsonl`，压缩稿全文单独存文件。
///
/// ⚠️ 追加而不是覆盖：一轮跑几个小时，中间任何一次崩掉，已经花掉的钱不能跟着没。
#[test]
#[ignore = "spends real money against a real endpoint; run with --ignored"]
fn run_the_sweep() {
    let plan_path = env_path("SPOOL_SWEEP_PLAN");
    let out_dir = env_path("SPOOL_SWEEP_OUT");
    std::fs::create_dir_all(out_dir.join("texts")).expect("could not make the output dir");

    let plan: Vec<Step> = serde_json::from_str(
        &std::fs::read_to_string(&plan_path).expect("could not read the plan"),
    )
    .expect("the plan is not valid JSON");

    // key 从磁盘读，和 app 用的是同一个文件。⛔ 不打印它，任何情况下都不。
    let key_path = crate::mcp::app_data_dir().expect("no app data dir").join("api-key");
    let api_key = std::fs::read_to_string(&key_path)
        .expect("no api-key file — fill it in Spool's settings first")
        .trim()
        .to_string();
    assert!(!api_key.is_empty(), "the api-key file is empty");

    // 端点和模型从 settings.json 读，同样是 app 在用的那一份 —— 实测要跟着产品的默认走。
    let settings: serde_json::Value = std::fs::read_to_string(
        crate::mcp::app_data_dir().unwrap().join("settings.json"),
    )
    .ok()
    .and_then(|s| serde_json::from_str(&s).ok())
    .unwrap_or_else(|| serde_json::json!({}));
    let model = settings
        .get("apiModel")
        .and_then(|v| v.as_str())
        .unwrap_or("deepseek-v4-flash")
        .to_string();
    let base_url = settings
        .get("apiBaseUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("https://api.deepseek.com")
        .to_string();
    // 上限拉满（30 分钟）。第一轮有一次 279 秒才写完，而掐断 = 钱花了、一个字没拿到。
    let timeout_secs = 1800u64;

    let bin = crate::api_engine::sidecar_path_for_test()
        .expect("build it first: cargo build --release --manifest-path src-tauri/sidecar/Cargo.toml");
    eprintln!("sweep: sidecar = {bin:?}, model = {model}, {} steps", plan.len());

    let mut n = 0usize;
    for step in &plan {
        // pack 每一步重新取一次：库是只读打开的，但项目内容在跑的过程中可能被人改动，
        // 而「这一次压的到底是什么」必须以当次为准。
        let (title, pack) = if step.pack_file.is_empty() {
            match crate::mcp::sweep_pack_text(&step.thread, &step.range) {
                Ok(v) => v,
                Err(e) => panic!("could not build the pack for {}: {e}", step.thread),
            }
        } else {
            let text = std::fs::read_to_string(&step.pack_file)
                .unwrap_or_else(|e| panic!("could not read {}: {e}", step.pack_file));
            (step.thread.clone(), text)
        };
        for i in 1..=step.repeats {
            n += 1;
            let level = crate::mcp::CompressLevel::parse(&step.level)
                .unwrap_or_else(|| panic!("unknown level {}", step.level));
            let (system, user) = match step.mode.as_str() {
                "" | "compress" => crate::mcp::compress_messages_for_api(&pack, level),
                "stale" => stale_messages(&pack, ""),
                "stale-v1" => stale_messages(&pack, "v1"),
                "stale-v2" => stale_messages(&pack, "v2"),
                other => panic!("unknown mode {other}"),
            };
            let started = std::time::SystemTime::now();
            let at = chrono_ish(started);
            eprintln!(
                "sweep [{n}] {} · {} · {} · rep {i}/{} · pack {} chars …",
                step.label,
                if step.mode.is_empty() { "compress" } else { &step.mode },
                if step.reasoning.is_empty() { "默认" } else { &step.reasoning },
                step.repeats,
                pack.chars().count()
            );
            let outcome = crate::api_engine::compress_for_test(
                &bin,
                &base_url,
                &api_key,
                &model,
                &system,
                &user,
                &step.reasoning,
                timeout_secs,
            );

            // 压缩稿全文：⛔ 只存汇总数字的话，事后想复查「它到底删了什么」就没有素材。
            let stem = format!("{n:03}-{}-{}-{}", sanitize(&step.label), step.level, i);
            if outcome.ok {
                let _ = std::fs::write(out_dir.join("texts").join(format!("{stem}.out.txt")), &outcome.text);
            }
            // 原文每个（项目 × 范围）只存一次，它在一轮里是同一份。
            let pack_file = out_dir.join("texts").join(format!("pack-{}-{}.txt", sanitize(&title), step.range));
            if !pack_file.exists() {
                let _ = std::fs::write(&pack_file, &pack);
            }

            let row = serde_json::json!({
                "n": n,
                "at": at,
                "label": step.label,
                "project": title,
                "range": step.range,
                "level": step.level,
                "mode": if step.mode.is_empty() { "compress" } else { &step.mode },
                "reasoning": step.reasoning,
                "rep": i,
                "of": step.repeats,
                "model_asked": model,
                "pack_chars": pack.chars().count(),
                "pack_bytes": pack.len(),
                "ok": outcome.ok,
                "kind": outcome.kind,
                "message": outcome.message,
                "status": outcome.status,
                "out_chars": outcome.text.chars().count(),
                "input_tokens": outcome.input_tokens,
                "output_tokens": outcome.output_tokens,
                "cached_input_tokens": outcome.cached_input_tokens,
                "reasoning_tokens": outcome.reasoning_tokens,
                "ms": outcome.ms,
                "model_reported": outcome.model,
                "cuts": outcome.cuts,
                "text_file": if outcome.ok { serde_json::json!(format!("texts/{stem}.out.txt")) } else { serde_json::Value::Null },
            });
            let mut f = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(out_dir.join("runs.jsonl"))
                .expect("could not open runs.jsonl");
            writeln!(f, "{row}").expect("could not write a row");
            eprintln!(
                "         → {} · {} chars ({}%) · {} tok out · {} ms{}",
                if outcome.ok { "ok" } else { "FAILED" },
                outcome.text.chars().count(),
                (outcome.text.chars().count() * 100) / pack.chars().count().max(1),
                outcome.output_tokens,
                outcome.ms,
                outcome.kind.as_deref().map(|k| format!(" · {k}")).unwrap_or_default(),
            );
            // 串行，之间留几秒 —— 不要把限流测成失败。
            std::thread::sleep(std::time::Duration::from_secs(5));
        }
    }
    eprintln!("sweep: {n} runs written to {out_dir:?}");
}

/// ISO 8601（UTC）。这个 crate 没有 chrono，而实测记录里没有时间就没法对价目表的高峰/闲时。
fn chrono_ish(t: std::time::SystemTime) -> String {
    let secs = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe { libc::gmtime_r(&secs, &mut tm) };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        tm.tm_year + 1900,
        tm.tm_mon + 1,
        tm.tm_mday,
        tm.tm_hour,
        tm.tm_min,
        tm.tm_sec
    )
}

fn sanitize(s: &str) -> String {
    s.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect()
}

/// 不花钱的一步：把这一轮要用的几份 pack 有多大打出来。
///
/// ⚠️ 口径校准的第一半就在这里 —— 第一轮是界面跑的（**TS 渲染器**），这一轮是 Rust 那套，
/// 而 §7 红线写着两者**故意不一致**。字符数对不上，就说明两轮不能直接并排比，
/// 报告里必须写明。第二半是 `input_tokens`，那个要真跑一次才有。
#[test]
#[ignore = "reads the real library; run with --ignored"]
fn print_pack_sizes() {
    for name in ["宣发", "申请规划", "Flux"] {
        match crate::mcp::sweep_pack_text(name, "all") {
            Ok((title, pack)) => {
                println!(
                    "{title}: {} chars / {} bytes / {} lines",
                    pack.chars().count(),
                    pack.len(),
                    pack.lines().count()
                );
                if let Ok(dir) = std::env::var("SPOOL_SWEEP_DUMP") {
                    let _ = std::fs::write(std::path::Path::new(&dir).join(format!("rust-pack-{title}.txt")), &pack);
                }
            }
            Err(e) => println!("{name}: ERROR {e}"),
        }
    }
}

// ---------------------------------------------------------------------------------------
// 候选提示词：作废检测（WORKPLAN §9.10 第三轮，2026-08-21 Ocean 提的方向）
//
// ⚠️⚠️ **这一份是候选，不是产品。** 它故意放在实测台里而不是 `mcp.rs`：这一轮跑的目的
// 正是决定该不该做它，跑完发现不值就整段删掉 —— 产品里不该先长出一个还没批准的功能。
// 一旦定了要做，它要挪进 `mcp.rs` 挨着 `compress_messages_for_api`，用 `t!` 补上英文，
// 并纳入那个「两份提示词必须同义」的同步测试。
//
// # 它和压缩的区别，一句话
//
// 压缩输出一份**重写过的文本**（风险：丢了日期看不出来）；这一份输出一组**指针**
// （第 X 条被第 Y 条取代），**一个字都不改写**。所以它的失败是看得见的：指错了，
// 用户一眼就否掉。
//
// # 三条闸门，写死在提示词里
//
// 1. 两处引文必须**逐字**存在于原 pack —— Spool 拿回去精确比对，对不上的整条丢掉。
//    ⭐ 这是「不需要模型配合的机械闸门」在这个功能上的对应物，而且比 `missingNumbers`
//    好使：提议只有几行，比对是精确的，不是模糊的。
// 2. ⛔ 只许提议**整条**作废。允许「条目内删几句」就退化成压缩，失败又变回不可见的。
// 3. ⛔ 宁可漏不可错 —— 一次错误的作废会让一条正确的结论从今后每一份 pack 里消失，
//    而 `mcp.rs` 那条红线（AI 不许写 supersedes，整条作废只有用户能定）正是为这个立的。
//
// ⚠️ 中文单语。产品化时才补英文 —— 这一轮量的是 Ocean 自己的库（`resolvedLanguage=zh`），
// 而多写一份英文只会让「候选」看起来像已经定了。
fn stale_messages(pack_text: &str, variant: &str) -> (String, String) {
    let base = match variant {
        "" | "v0" => STALE_SYSTEM,
        "v1" => STALE_SYSTEM_V1,
        "v2" => STALE_SYSTEM_V2,
        other => panic!("unknown stale variant {other}"),
    };
    let system = base.replace("{rule}", crate::mcp::material_rule());
    (system, crate::mcp::fenced_material(pack_text))
}

// ⚠️ 原始字符串，不走 `format!` —— 里面全是 JSON 的花括号和引号，转义一次就没人看得懂了，
// 而这段字是这一轮实测的**被测对象本身**：它必须和发出去的一模一样，肉眼可校。
const STALE_SYSTEM: &str = r#"你是一个上下文审阅工具。用户下一条消息里是一份由 Spool 生成的项目上下文简报。

⛔ 你的任务不是压缩,也不是总结。**一个字都不要改写简报里的内容。**

你只找一件事:简报里**已经被后面的条目整条取代**的旧条目 —— 结论被推翻了、方案被换掉了、名单被重新定过了、数据被放弃了。

# 规则
1. 只输出一个 JSON 数组。数组里每一项长这样:
   {"stale": 旧条目编号, "by": 新条目编号, "why": "一句话,不超过 40 字", "quote_stale": "旧条目里能证明它已经作废的一句原文", "quote_new": "新条目里取代它的那一句原文"}
2. ⛔ quote_stale 和 quote_new 必须是简报里**逐字连续**出现的片段 —— 不许改一个标点、不许用省略号、不许把两处拼起来。Spool 会拿它们回去精确比对,对不上的整条丢掉,所以编一句出来只会浪费你自己的这一条。
3. ⛔ 只提议**整条**作废。一个条目里只有几句过时、其余仍然成立的,**不要提议** —— 那种情况不归你管。
4. ⛔ 拿不准就不提议。宁可漏,不可错:一次错误的作废会让一条正确的结论从今后每一份简报里消失,而用户不会发现。
5. 编号写简报里 `#12` 那种编号,只写数字。
6. 一条都没找到就输出 `[]`。不要前言,不要解释,不要代码块标记,只输出那个 JSON 数组。
7. {rule}"#;

// ---------------------------------------------------------------------------------------
// 提示词变体（WORKPLAN §9.11 阶段 3）：打**召回**，这是第三轮量出来的已知弱点。
//
// 第三轮的数字：正确答案两条，十五次里**只有 2 次两条都找到**；11 条提议里 8 条指同一块。
// ⛔ 而「多跑两次」补不上 —— 拿归档免费算过：任取 3 次求并集也只有 6/10 的把握找全。
// 所以要改的是提示词，不是跑的次数。
//
// 两个变体各自赌一个**不同的病因**，⭐ 这是它们存在的意义 —— 跑完不管谁赢，都能反过来
// 说清楚上一轮那个召回问题到底是什么：
//
//   V1：漏报是**没看全**（它扫到一半就作答了）→ 保留第 4 条，另外要求逐条扫描；
//   V2：漏报是**不敢说**（第 4 条「宁可漏不可错」调过头了）→ 让它把拿不准的也列出来，
//       标 `confidence: low`，由用户筛。
//
// ⛔ **判定要两个数一起看**：召回涨了、**且假阳性仍然是 0**，才算这个变体赢。
// 只涨召回不看假阳性，就是把这个功能变成压缩那种「看不见的失败」。
//
// ⚠️ **为什么是整段复制，不是模板拼接**：上面那段注释说过，这些字是**被测对象本身**，
// 必须肉眼可校。把三份提示词拆成「公共部分 + 差异槽」之后,任何人想知道 V2 到底发出去
// 的是什么,都得在脑子里做一次字符串替换 —— 而这一轮的结论正是建立在「发出去的到底是
// 哪几个字」上面的。重复三份换来的是:**diff 一眼就能看出只差那一条**。
const STALE_SYSTEM_V1: &str = r#"你是一个上下文审阅工具。用户下一条消息里是一份由 Spool 生成的项目上下文简报。

⛔ 你的任务不是压缩,也不是总结。**一个字都不要改写简报里的内容。**

你只找一件事:简报里**已经被后面的条目整条取代**的旧条目 —— 结论被推翻了、方案被换掉了、名单被重新定过了、数据被放弃了。

# 规则
1. 只输出一个 JSON 数组。数组里每一项长这样:
   {"stale": 旧条目编号, "by": 新条目编号, "why": "一句话,不超过 40 字", "quote_stale": "旧条目里能证明它已经作废的一句原文", "quote_new": "新条目里取代它的那一句原文"}
2. ⛔ quote_stale 和 quote_new 必须是简报里**逐字连续**出现的片段 —— 不许改一个标点、不许用省略号、不许把两处拼起来。Spool 会拿它们回去精确比对,对不上的整条丢掉,所以编一句出来只会浪费你自己的这一条。
3. ⛔ 只提议**整条**作废。一个条目里只有几句过时、其余仍然成立的,**不要提议** —— 那种情况不归你管。
4. ⛔ 拿不准就不提议。宁可漏,不可错:一次错误的作废会让一条正确的结论从今后每一份简报里消失,而用户不会发现。
5. ⭐ 作答之前,**把每一个条目从头到尾过一遍**,一条都不要跳过。对每一条问一句:后面有没有哪一条把它整个替换掉了?简报里靠后的条目往往会同时取代前面**好几条**,所以找到一条之后不要就此收手,继续把剩下的条目扫完。
6. 编号写简报里 `#12` 那种编号,只写数字。
7. 一条都没找到就输出 `[]`。不要前言,不要解释,不要代码块标记,只输出那个 JSON 数组。
8. {rule}"#;

const STALE_SYSTEM_V2: &str = r#"你是一个上下文审阅工具。用户下一条消息里是一份由 Spool 生成的项目上下文简报。

⛔ 你的任务不是压缩,也不是总结。**一个字都不要改写简报里的内容。**

你只找一件事:简报里**已经被后面的条目整条取代**的旧条目 —— 结论被推翻了、方案被换掉了、名单被重新定过了、数据被放弃了。

# 规则
1. 只输出一个 JSON 数组。数组里每一项长这样:
   {"stale": 旧条目编号, "by": 新条目编号, "why": "一句话,不超过 40 字", "quote_stale": "旧条目里能证明它已经作废的一句原文", "quote_new": "新条目里取代它的那一句原文", "confidence": "high" 或 "low"}
2. ⛔ quote_stale 和 quote_new 必须是简报里**逐字连续**出现的片段 —— 不许改一个标点、不许用省略号、不许把两处拼起来。Spool 会拿它们回去精确比对,对不上的整条丢掉,所以编一句出来只会浪费你自己的这一条。
3. ⛔ 只提议**整条**作废。一个条目里只有几句过时、其余仍然成立的,**不要提议** —— 那种情况不归你管。
4. ⭐ 拿不准的**也要列出来**,把 confidence 标成 "low";有把握的标 "high"。作废不会自动执行 —— 每一条都要用户点头,所以列一条拿不准的,代价只是用户多看一眼;而漏掉一条,用户永远不会知道。
5. 编号写简报里 `#12` 那种编号,只写数字。
6. 一条都没找到就输出 `[]`。不要前言,不要解释,不要代码块标记,只输出那个 JSON 数组。
7. {rule}"#;
