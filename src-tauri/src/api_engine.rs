//! 形态 C 的接线端（WORKPLAN-2026-08-20 §6.2 / §6.4.1 / §9 第 4 步）。
//!
//! 这个文件负责的只有一件事：**把请求交给 `spool-ai` 子进程，把信封收回来。**
//! 它自己**一个 socket 都不开**，也没有任何 HTTP/TLS 依赖——`src-tauri/Cargo.toml` 里
//! 一个都没有，`cargo tree` 可以当场验。出网发生在另一个可执行文件里，那是 §6.2 选形态 C
//! 而不是形态 A 的**全部理由**：主进程「不发网络请求」因此仍然是能被外人验证的架构性质，
//! 而不是一句意图承诺。
//!
//! ⛔ **不要把 ureq / reqwest 之类的东西加进主 crate**，哪怕只是「放着不用」。
//!
//! # 和引擎槽（形态 B）的关系
//!
//! 形态 B（`engine.rs`：用户自己装的 claude / codex / gemini）**没有被取代**，两条路并行：
//! B 一分钱不花、一个 key 不填，C 是给不想装 CLI 的人的第二条路。所以这里**不复用**
//! `engine.rs` 的串行队列——它守的是「两个 CLI 同时经 MCP 往库里写」这个竞争，而这条路
//! **一个字都不往库里写**（§9 第 4 步：先不接 `supersedes` 写入），没有那个竞争要守。
//! 它自己的并发闸在下面 `RUNNING`。

use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::mcp::{compress_messages_for_api, split_cuts, CompressLevel};

/// 一次只跑一个。和 `engine.rs` 一样，闸在 Rust 这边而不是只在 JS 队列里——第二个窗口
/// 或者一次手工 invoke 否则就能起第二个进程，而取消按钮只握得住一个。
static RUNNING: AtomicBool = AtomicBool::new(false);
/// 取消是从另一个线程来的（命令跑在阻塞线程上），只能靠这个把子进程的句柄递过去。
static CHILD: Mutex<Option<Arc<Mutex<Option<Child>>>>> = Mutex::new(None);
/// ⛔⛔ **是用户按了「停下」，不是出事了**（2026-08-23，Ocean 撞到）。
///
/// 他按下停下之后，屏幕上弹的是：**「找不到负责联网的那个小程序（spool-ai）。
/// 重装一次 Spool 应该能修好。」** —— 一个让人去重装软件的建议，而他只是点了停止。
///
/// 病根：取消把子进程杀了，于是 stdout 是空的，而「stdout 空」这条路只有一种解释
/// （子进程死在产出信封之前 = 装坏了）。**取消走的是同一条路，于是被诊断成装坏了。**
/// ⚠️ 少了这个标志就分辨不出来 —— 两种情况在 stdout 上长得一模一样。
static CANCELLED: AtomicBool = AtomicBool::new(false);

/// ⚠️ 上限 2026-08-20 从 15 分钟提到 30 分钟，因为「几十秒的调用」这个前提是错的。
///
/// 实测：一份 26,615 字符的 pack，V4-Flash 跑到 180 秒**还没写完**就被掐了，
/// 而那一次 DeepSeek 已经计了 ¥0.08 —— 钱花了，一个字没拿到。会思考的模型要先想再写，
/// 输出又和输入一个量级，几分钟是正常的，不是卡住。
///
/// 现在流式了，所以「还在正常生成」和「真的卡死」在界面上分得开（字数一直在涨），
/// 这个上限只是最后一道闸，不再兼职「判断它是不是卡住了」。
fn clamp_timeout(secs: u64) -> u64 {
    secs.clamp(10, 1800)
}

/// 找 `spool-ai`。
///
/// 装机后它就躺在主程序旁边（Tauri 的 `externalBin` 会把它放进 `Contents/MacOS/`，
/// 并且跟主程序一起签名/公证）。开发时它在 sidecar crate 自己的 target 里。
///
/// ⚠️ 两条都是**固定位置**，不查 PATH。PATH 上的同名程序是别人的东西，
/// 而我们要往它 stdin 里写一个 API key。
fn sidecar_path() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let name = if cfg!(windows) { "spool-ai.exe" } else { "spool-ai" };
    if let Some(dir) = exe.parent() {
        let beside = dir.join(name);
        if beside.is_file() {
            return Ok(beside);
        }
    }
    // 开发时：`cargo build` 在 sidecar crate 里产出的那个。debug 优先，因为开发时改的是它。
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("sidecar/target");
    for profile in ["debug", "release"] {
        let p = here.join(profile).join(name);
        if p.is_file() {
            return Ok(p);
        }
    }
    Err(format!(
        "the AI sidecar ({name}) was not found beside Spool — reinstall, or run `cargo build` in src-tauri/sidecar"
    ))
}

/// 界面拿到的东西。失败也走这里，**不走 `Err`**——§6.2 约束 4：
/// 「超时、余额不足、限流都要在界面上说出来」，而一个 `Err(String)` 在界面上只会变成
/// 一句「失败了」。`kind` 让界面能分别说话，`message` 是给「详情」的原文。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressOutcome {
    pub ok: bool,
    /// 压缩稿本体（已经把「这次删了什么」那一段切掉）。失败时为空。
    pub text: String,
    /// 模型自己交代的「这一次删/合并了哪几类东西」。
    /// ⚠️ `None` 是有意义的一种结果：它**没说**。界面必须把这件事说出来，不能显示成「什么都没删」。
    pub cuts: Option<String>,
    pub kind: Option<String>,
    pub message: Option<String>,
    pub status: Option<u16>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// ⚠️ `None` = **这家端点没报缓存命中**，不是「一次都没命中」。
    /// §6.2 那个「一到三分钱」全建立在缓存上，而那是估算；把「不知道」显示成 0 会让实测说谎。
    pub cached_input_tokens: Option<u64>,
    /// 「思考」烧掉的 token。⚠️ 它们按**输出价**计费（最贵的那一档），而 §6.2 那张成本表
    /// 是按「2,000 输出」算的。单独一栏，否则这笔钱看不出花在了哪儿。
    pub reasoning_tokens: Option<u64>,
    pub ms: u128,
    /// 端点回报的实际模型名——按次付费的时候，「我以为在用 Flash」和「实际在用 Pro」差 3 倍。
    pub model: Option<String>,
}

impl CompressOutcome {
    fn failed(kind: &str, message: String, status: Option<u16>) -> Self {
        Self {
            ok: false,
            text: String::new(),
            cuts: None,
            kind: Some(kind.to_string()),
            message: Some(message),
            status,
            input_tokens: 0,
            output_tokens: 0,
            cached_input_tokens: None,
            reasoning_tokens: None,
            ms: 0,
            model: None,
        }
    }
}

/// 压一份 pack。
///
/// ⚠️ `api_key` 从前端传进来，在这里**只做一件事**：写进子进程的 stdin。
/// 它不进 argv（`ps` 能看到任何进程的完整命令行）、不进环境变量（子进程的环境在 macOS 上
/// 也可被同用户读到）、不进日志、不进错误信息。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn compress_pack_via_api(
    app: tauri::AppHandle,
    pack_text: String,
    level: String,
    base_url: String,
    api_key: String,
    model: String,
    reasoning: String,
    timeout_secs: u64,
) -> Result<CompressOutcome, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("a compression run is already in flight".into());
    }
    let out = tauri::async_runtime::spawn_blocking(move || {
        run_blocking(&app, pack_text, level, base_url, api_key, model, reasoning, timeout_secs)
    })
    .await;
    RUNNING.store(false, Ordering::SeqCst);
    *CHILD.lock().unwrap() = None;
    match out {
        Ok(o) => Ok(o),
        Err(e) => Ok(CompressOutcome::failed("internal", e.to_string(), None)),
    }
}

#[allow(clippy::too_many_arguments)]
fn run_blocking(
    app: &tauri::AppHandle,
    pack_text: String,
    level: String,
    base_url: String,
    api_key: String,
    model: String,
    reasoning: String,
    timeout_secs: u64,
) -> CompressOutcome {
    // 提示词跟着 app 的语言走，和 MCP 那条路每次请求重读一次是同一个做法。
    if let Ok(dir) = tauri::Manager::path(app).app_config_dir() {
        crate::mcp::refresh_lang(&dir);
    }
    let level = match CompressLevel::parse(&level) {
        Some(l) => l,
        // 设置里存了个不认识的值（settings.json 是可以手改的，见 DESIGN_LIBRARY_TRANSFER）。
        // 掉回最保守那档，不要因此让一次压缩失败。
        None => CompressLevel::Conservative,
    };
    let (system, user) = compress_messages_for_api(&pack_text, level);

    let bin = match sidecar_path() {
        Ok(p) => p,
        Err(e) => return CompressOutcome::failed("no_sidecar", e, None),
    };
    let timeout_secs = clamp_timeout(timeout_secs);
    let request = sidecar_request(&base_url, &api_key, &model, &system, &user, &reasoning, timeout_secs);
    let payload = match serde_json::to_vec(&request) {
        Ok(v) => v,
        Err(e) => return CompressOutcome::failed("internal", e.to_string(), None),
    };
    spawn_sidecar_with(&bin, payload, timeout_secs, Some(app.clone()))
}

/// 递给 `spool-ai` 的那个请求。
///
/// ⚠️ **拆出来是为了让第二轮实测量的是产品本身**（WORKPLAN §9.6.3）。自动化实测台
/// 绕开界面直接喂子进程，如果它自己另拼一份请求，测出来的就是那份脚本，不是 Spool。
/// 两边共用这一个函数，参数一旦改了，实测跟着改。
fn sidecar_request(
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    reasoning: &str,
    timeout_secs: u64,
) -> serde_json::Value {
    serde_json::json!({
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        // 「思考力度」：空 = 什么都不发（用服务端默认），`off` = 明确关掉，其余原样发出去。
        // ⚠️ 不在这里校验取值 —— 合法取值文档里没有，端点才是权威，而它答一次不要钱。
        "reasoning_effort": if reasoning == "off" || reasoning.is_empty() { serde_json::Value::Null } else { serde_json::json!(reasoning) },
        "thinking_disabled": reasoning == "off",
        "system": system,
        "user": user,
        // ⚠️ 故意不发 `max_output_tokens`。2026-08-20 实测：V4-Flash 会思考,思考和正文
        // 共用同一个输出额度,按原文长度折算出来的那个「够用」的数字把正文整个掐掉了
        // ——回来的 `content` 是空字符串,界面上看起来像「接口不兼容」。
        // 猜一个更大的又会被服务端顶回来。所以不猜:让服务端用它自己的上限。
        // 子进程自己也要有超时，否则它可能比我们活得久。
        // 比外层短一点，好让它有机会把一个说人话的 timeout 信封写出来，
        // 而不是被我们杀掉之后只剩「进程没了」。
        "timeout_secs": timeout_secs.saturating_sub(5).max(10),
    })
}

/// 起子进程、喂 stdin、收信封。
///
/// 拆出来是为了**能被验证**：这一段（找到二进制、起进程、把 key 从 stdin 递进去、
/// 拿回一个分类过的信封）是形态 C 的全部机械部分,而它不需要任何 Tauri 类型。
/// 下面 `the_whole_chain_answers`（`--ignored`,要联网）跑的就是它。
fn spawn_sidecar(bin: &std::path::Path, payload: Vec<u8>, timeout_secs: u64) -> CompressOutcome {
    spawn_sidecar_with(bin, payload, timeout_secs, None)
}

/// 进度事件的名字。前端 `listen` 它。
pub const PROGRESS_EVENT: &str = "compress://progress";

fn spawn_sidecar_with(
    bin: &std::path::Path,
    payload: Vec<u8>,
    timeout_secs: u64,
    app: Option<tauri::AppHandle>,
) -> CompressOutcome {
    let mut cmd = Command::new(bin);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    // 环境清空：这个子进程要的东西全部从 stdin 进来。清掉也顺便保证它读不到
    // 用户环境里可能存在的别的家 API key。
    cmd.env_clear();
    #[cfg(unix)]
    {
        // 自成进程组，取消/超时能把它整棵带走——和 engine.rs 同一个做法。
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                if libc::setpgid(0, 0) == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    // ⚠️ 每次起子进程之前清一次 —— 上一次的取消不能算在这一次头上。
    CANCELLED.store(false, Ordering::SeqCst);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return CompressOutcome::failed("no_sidecar", format!("could not start {bin:?} — {e}"), None)
        }
    };
    let mut stdin = child.stdin.take();
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();

    if let Some(s) = stdin.as_mut() {
        // 写完就关，子进程读到 EOF 才会开始干活。
        let _ = s.write_all(&payload);
    }
    drop(stdin);
    // payload 里有 key。
    drop(payload);

    // 两个读线程：stdout 是信封，stderr 只在「连信封都产不出来」时才有东西。
    // 分开读是因为任何一个管道写满都会把子进程卡死。
    let out_h = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(s) = stdout.as_mut() {
            let _ = s.read_to_string(&mut buf);
        }
        buf
    });
    // ⚠️ stderr 是**逐行**读的，不是等进程结束再一把读完。
    //
    // 2026-08-20 Ocean 报的那条：「压缩时根本不会给反馈，用户不知道有没有连接成功」。
    // 这条路是不流式的，一个会思考的模型可以一分钟不吭声，界面上只有一个转圈——
    // 分不出「还在等」和「根本没连上」。子进程现在会在发出请求、开始收结果时各写一行，
    // 这个线程把它们即时转成事件送到界面。
    let err_h = std::thread::spawn(move || {
        let mut buf = String::new();
        let Some(s) = stderr.take() else { return buf };
        let reader = std::io::BufReader::new(s);
        for line in std::io::BufRead::lines(reader) {
            let Ok(line) = line else { break };
            // 进度行是一个对象（阶段 + 已思考多少字 + 已写多少字），整块转发给界面。
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                if v.get("stage").is_some() {
                    if let Some(app) = app.as_ref() {
                        use tauri::Emitter;
                        let _ = app.emit(PROGRESS_EVENT, v);
                    }
                    continue;
                }
            }
            // 不是进度行——那就是真的出事了，留着当报错详情。
            buf.push_str(&line);
            buf.push('\n');
        }
        buf
    });

    let handle = Arc::new(Mutex::new(Some(child)));
    *CHILD.lock().unwrap() = Some(handle.clone());
    let timed_out = wait_or_kill(&handle, Duration::from_secs(timeout_secs));
    let stdout = out_h.join().unwrap_or_default();
    let stderr = err_h.join().unwrap_or_default();

    // ⛔ **这一条必须排在「stdout 是空的」前面。** 取消之后 stdout 本来就是空的，
    // 排在后面就永远走不到 —— 那正是「按停下 → 叫我重装 Spool」的成因。
    if CANCELLED.swap(false, Ordering::SeqCst) {
        return CompressOutcome::failed("cancelled", "stopped by the user".into(), None);
    }
    if timed_out {
        return CompressOutcome::failed(
            "timeout",
            format!("The sidecar did not answer within {timeout_secs} seconds and was stopped."),
            None,
        );
    }
    if stdout.trim().is_empty() {
        // 子进程死在了产出信封之前。stderr 里没有 key（子进程从不回显请求）。
        let detail = if stderr.trim().is_empty() { "no output".into() } else { stderr.trim().to_string() };
        return CompressOutcome::failed("no_sidecar", format!("The sidecar said nothing — {detail}"), None);
    }
    parse_envelope(&stdout)
}

/// 轮询等待，因为 `Child::wait` 拿不到超时，而取消要能从另一个线程插进来。
/// 返回 true = 是我们把它杀掉的。
fn wait_or_kill(handle: &Arc<Mutex<Option<Child>>>, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        {
            let mut guard = handle.lock().unwrap();
            let Some(child) = guard.as_mut() else {
                // 被 cancel 拿走并杀掉了。
                return false;
            };
            match child.try_wait() {
                Ok(Some(_)) => return false,
                Ok(None) => {}
                Err(_) => return false,
            }
        }
        if std::time::Instant::now() >= deadline {
            let mut guard = handle.lock().unwrap();
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn parse_envelope(stdout: &str) -> CompressOutcome {
    let line = stdout.trim();
    let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
        return CompressOutcome::failed(
            "bad_response",
            format!("The sidecar's answer was not JSON: {}", clip(line)),
            None,
        );
    };
    if v.get("ok").and_then(|b| b.as_bool()) != Some(true) {
        return CompressOutcome::failed(
            v.get("kind").and_then(|s| s.as_str()).unwrap_or("http"),
            v.get("message").and_then(|s| s.as_str()).unwrap_or("").to_string(),
            v.get("status").and_then(|n| n.as_u64()).map(|n| n as u16),
        );
    }
    let raw = v.get("text").and_then(|s| s.as_str()).unwrap_or("");
    let (text, cuts) = split_cuts(raw);
    let usage = v.get("usage");
    let n = |k: &str| usage.and_then(|u| u.get(k)).and_then(|x| x.as_u64());
    CompressOutcome {
        ok: true,
        text,
        cuts,
        kind: None,
        message: None,
        status: None,
        input_tokens: n("input_tokens").unwrap_or(0),
        output_tokens: n("output_tokens").unwrap_or(0),
        cached_input_tokens: n("cached_input_tokens"),
        reasoning_tokens: n("reasoning_tokens"),
        ms: v.get("ms").and_then(|x| x.as_u64()).unwrap_or(0) as u128,
        model: v.get("model").and_then(|s| s.as_str()).map(|s| s.to_string()),
    }
}

fn clip(s: &str) -> String {
    if s.chars().count() <= 300 {
        return s.to_string();
    }
    format!("{}…", s.chars().take(300).collect::<String>())
}

/// 取消。和 `engine.rs::request_cancel` 一样：没在跑也算成功——用户按的是一个已经结束的东西。
#[tauri::command]
pub fn compress_cancel() -> bool {
    let guard = CHILD.lock().unwrap();
    let Some(handle) = guard.as_ref() else { return false };
    let mut child = handle.lock().unwrap();
    let Some(c) = child.as_mut() else { return false };
    // ⚠️ **先立旗再动手。** 杀掉之后那个正在等的线程随时会醒过来去看这个标志 ——
    // 顺序反过来就有一条缝，缝里它仍然会把「用户按了停下」诊断成「装坏了」。
    CANCELLED.store(true, Ordering::SeqCst);
    let _ = c.kill();
    let _ = c.wait();
    *child = None;
    true
}

/// 设置页要能说「找到了 / 没找到」，而不是等到用户点了压缩才报错。
#[tauri::command]
pub fn compress_sidecar_present() -> bool {
    sidecar_path().is_ok()
}

// ---------------------------------------------------------------------------------------
// D-a · 重复度探针（2026-08-22，Ocean）
// ---------------------------------------------------------------------------------------
//
// 实测四轮之后最要紧的一条：**压多少主要取决于这个项目里有多少重复，不取决于你选哪一档。**
// （同一组设置换个项目差 33 个百分点；三个档位在同一个项目上的中位数统计上分不开。）
// 那句话原来只是写在界面上的一行提示 —— 它是对的，但它把一个没解决的问题丢给了用户：
// **他没法在花钱之前知道自己这个项目有没有重复。**
//
// 这个探针就是那句提示的解药：**压之前先在本地算一遍。** 只读、纯本地、不出网、不花钱。
//
// ⚠️⚠️ **走的是 `find_similar_blocks` 那一套**（字符三元组 Jaccard ≥ 0.6）。
// ⛔ **绝不另立第二套口径**：用户在界面上看到的「有几组重复」和别的 AI 通过 MCP 看到的
// 必须是同一个数。两套口径各自都对、各自都能自洽，唯一的症状是两边开始悄悄说不一样的话。

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateProbe {
    /// 近重复的组数。
    pub groups: u64,
    /// 这些组里**可以并掉**的块数（每组保留一块）—— 用户要的是这个数，不是组数。
    pub extra_blocks: u64,
    /// 真的看过多少块。⚠️ 撞上 `SIMILAR_SCAN_CAP` 的时候老块没被看过。
    pub scanned_blocks: u64,
}

fn probe_from(v: &serde_json::Value) -> DuplicateProbe {
    let extra_blocks = v["groups"].as_array().map_or(0, |gs| {
        gs.iter()
            .map(|g| g["blocks"].as_array().map_or(0, |b| b.len().saturating_sub(1)) as u64)
            .sum()
    });
    DuplicateProbe {
        groups: v["total_groups"].as_u64().unwrap_or(0),
        extra_blocks,
        scanned_blocks: v["scanned_blocks"].as_u64().unwrap_or(0),
    }
}

/// 这个项目里有多少重复。⚠️ 算不出来就返回 Err —— 界面于是**不显示这一行**，⛔ 不编一个数。
// ⚠️ `(async)`：开库 + 一趟近重复扫描（`busy_timeout` 自己就有 2 秒），⛔ 不能占主线程。
#[tauri::command(async)]
pub fn compress_duplicate_probe(thread_id: String) -> Result<DuplicateProbe, String> {
    let dir = crate::mcp::app_data_dir().ok_or_else(|| "no app data dir".to_string())?;
    let conn = crate::mcp::open_db(&dir)?;
    let raw = crate::mcp::find_similar_blocks_json(&conn, Some(&thread_id), None, Some(30))?;
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(probe_from(&v))
}

// ---------------------------------------------------------------------------------------
// API key 存哪儿
//
// ⛔ **不存 settings.json，这一条是硬的。** 两个理由，任何一个单独都成立：
//
// 1. 这个仓库已经就同一件事做过判断了。`settingsStore.ts` 里的 `LEGACY_AI_KEYS` 会在每次
//    启动时**主动擦掉** settings.json 里遗留的 `groqKey` / `geminiKey`，注释原话是
//    「plaintext API keys and must not linger on disk once nothing reads them」。现在再往
//    同一个文件里塞一个明文 key，等于把当初专门清掉的东西请回来。
// 2. settings.json 是**会跟着人走**的：`breakReminder.ts` 里写着它「hand-editable and
//    travels between builds (DESIGN_LIBRARY_TRANSFER)」。一个会被导出、被拷到另一台机器、
//    被贴进 issue 的文件，不该装着一把能花钱的钥匙。
//
// ⭐⭐ **2026-08-23：挪进系统钥匙串了**（E3 的前置，Ocean 在三档里选的 `security-framework`）。
//
// 在此之前是「app_config_dir 下一个 0600 的文件」——那是个**够用的临时方案**，当时的目的是
// 先让 Ocean 看见压缩质量。它挡得住「settings.json 被拷走」，⛔ **挡不住「同一个账号下的
// 别的程序去读它」**：0600 防的是别的用户，而在一台个人电脑上，威胁本来就在同一个账号里。
//
// ⚠️ **`security-framework` 不碰网络**，所以 §4.2 那条护栏（主进程不发网络请求，外人能当场验）
// 仍然成立。⛔ 每次动 `Cargo.toml` 都要再跑一次：
//   cargo tree -e normal | grep -iE "ureq|rustls|reqwest|hyper|openssl"   # 必须是空的
//
// ⛔ **只有 macOS 走钥匙串。** Windows 继续用 0600 文件（那边还没签名，不是当前战场），
// 换跨平台的 `keyring` 会把 dbus/secret-service 拖进依赖树 —— 那一档被明确否了。

/// 钥匙串里那一条的名字。⚠️ 两个都别改：改了等于用户的 key 凭空消失，
/// 而钥匙串里还躺着一条谁也读不到的旧记录。
#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "com.oceanjin.spool";
#[cfg(target_os = "macos")]
const KEYCHAIN_ACCOUNT: &str = "api-key";

fn key_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = tauri::Manager::path(app).app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("api-key"))
}

/// 老地方那个 0600 文件里还有没有 key。⚠️ 只在 macOS 上用来做一次性搬家。
fn legacy_file_key(app: &tauri::AppHandle) -> Option<String> {
    let path = key_path(app).ok()?;
    let key = std::fs::read_to_string(&path).ok()?.trim().to_string();
    if key.is_empty() { None } else { Some(key) }
}

#[cfg(target_os = "macos")]
mod keychain {
    use super::{KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE};
    use security_framework::passwords as pw;

    pub fn save(key: &str) -> Result<(), String> {
        pw::set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, key.as_bytes())
            .map_err(|e| e.to_string())
    }

    pub fn load() -> Option<String> {
        // ⚠️ 读不到有两种：没存过，和用户在钥匙串弹窗上点了「不允许」。
        // 两种都当成「没有」——⛔ 不在这儿弹二次提示，界面上那句「你还没填 key」已经够了。
        let bytes = pw::get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).ok()?;
        let s = String::from_utf8(bytes).ok()?.trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    }

    pub fn delete() {
        let _ = pw::delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    }
}

/// 一次性搬家：老地方那个文件里有 key、而钥匙串里没有 → 搬进去，然后**删掉文件**。
///
/// ⚠️ **删文件是这件事的重点**，不是收尾：留着的话，挪进钥匙串就只是多了一份拷贝，
/// 原来那份仍然躺在磁盘上任人读 —— 那等于什么都没做。
/// ⛔ 写钥匙串失败就**不删**：宁可两份都在，也不能把用户唯一那把钥匙弄丢。
#[cfg(target_os = "macos")]
fn migrate_key_into_keychain(app: &tauri::AppHandle) {
    if keychain::load().is_some() {
        // 钥匙串里已经有了 —— 老文件如果还在，它是搬家没删干净的残留，清掉。
        if let Ok(path) = key_path(app) {
            let _ = std::fs::remove_file(path);
        }
        return;
    }
    let Some(key) = legacy_file_key(app) else { return };
    if keychain::save(&key).is_ok() {
        if let Ok(path) = key_path(app) {
            let _ = std::fs::remove_file(path);
        }
    }
}

// ⚠️⚠️ `(async)`（2026-08-27，查「键盘假死三十秒」查到这儿）：这三条**都要读钥匙串**
// （`SecItemCopyMatching`），而钥匙串是会长时间阻塞的 —— 同一个二进制重新签过之后系统要重新
// 验一次签，实测 **60–75 秒**；屏幕锁着的时候那个授权框弹不出来，于是**无限期**卡住
// （两个数都在记忆 `isolated-verify-workflow` §35 里，是这个仓库自己量过的）。
// 不带 `(async)` 的命令是在 IPC 回调里就地跑的，而 macOS 上那个回调派发在主线程 ⇒
// 卡多久，整个窗口就冻多久，键盘一个字也进不去，而别的 app 一切正常。
// ⛔ 别把这三条改回同步。理由和 `ai_engine_status` / `probe_browser_automation` 是同一条。
#[tauri::command(async)]
pub fn api_key_save(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let key = key.trim();
    #[cfg(target_os = "macos")]
    {
        // 清空 = 从钥匙串里删掉那一条，不是存一个空串。
        if key.is_empty() {
            keychain::delete();
        } else {
            keychain::save(key)?;
        }
        // 老文件不该再存在。⚠️ 用户可能是从一个没走过搬家那一步的旧版本升上来的。
        if let Ok(path) = key_path(&app) {
            let _ = std::fs::remove_file(path);
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let path = key_path(&app)?;
        if key.is_empty() {
            // 清空 = 删掉文件，不是写一个空文件。
            let _ = std::fs::remove_file(&path);
            return Ok(());
        }
        std::fs::write(&path, key).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            // 0600。⚠️ 写完再改权限有一个短暂的窗口，但 app_config_dir 本身就是 0700，
            // 同一个账号之外的人进不来。
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }
}

/// 读 key —— **钥匙串优先，读不到再回落到老那个 0600 文件**。
///
/// ⭐⭐ **拆出来不需要 `AppHandle`，是为了让实测台和产品读的是同一把钥匙。**
/// ⚠️⚠️ 2026-08-23 装机的时候当场撞到的：实测台原来直接读
/// `app_data_dir()/api-key`，而 key 挪进钥匙串那一步会**把那个文件删掉** ——
/// 于是「Ocean 打开一次设置页」和「连夜实测还跑不跑得起来」被绑在了一起，
/// ⛔ 而且失败会发生在他睡着以后。
///
/// ⚠️ macOS 上 `app_config_dir()` 和 `app_data_dir()` 都是
/// `~/Library/Application Support/<identifier>`，所以两边指的是同一个文件。
pub(crate) fn read_api_key() -> String {
    #[cfg(target_os = "macos")]
    if let Some(k) = keychain::load() {
        return k;
    }
    let Some(dir) = crate::mcp::app_data_dir() else {
        return String::new();
    };
    std::fs::read_to_string(dir.join("api-key")).unwrap_or_default().trim().to_string()
}

#[tauri::command(async)]
pub fn api_key_load(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        migrate_key_into_keychain(&app);
        // ⚠️ 走 `read_api_key()`（钥匙串优先、回落到文件）而不是只读钥匙串：
        // 万一钥匙串那一下写失败了，老文件是**故意没删**的，产品照样该能用。
        Ok(read_api_key())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let path = key_path(&app)?;
        Ok(std::fs::read_to_string(&path).unwrap_or_default().trim().to_string())
    }
}

/// 设置页只想知道「填没填」，不需要把 key 拿到前端去。
///
/// ⚠️ macOS 上这一条**会读一次钥匙串**（`SecItemCopyMatching`）。同一个签名身份下
/// 不弹窗；⛔ 换了签名身份（比如从公证版换成 dev build）系统会当成另一个程序来问，
/// 那一次会弹一个「允许访问钥匙串」的框 —— 那是对的，不是 bug。
#[tauri::command(async)]
pub fn api_key_present(app: tauri::AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        migrate_key_into_keychain(&app);
        keychain::load().is_some()
    }
    #[cfg(not(target_os = "macos"))]
    {
        key_path(&app).map(|p| p.is_file()).unwrap_or(false)
    }
}

// ---------------------------------------------------------------------------------------
// 第二轮实测台的入口（WORKPLAN §9.6.3）。⚠️ `#[cfg(test)]` —— 发布构建里没有这两个函数。
//
// 存在的理由只有一条：**实测量的必须是产品本身**。所以实测台不自己找二进制、不自己拼请求、
// 不自己起进程 —— 它借的就是上面那三样（`sidecar_path` / `sidecar_request` / `spawn_sidecar`）。
// 哪天请求里多一个参数，实测跟着变；否则跑出来的数字描述的是那个脚本，不是 Spool。
// ---------------------------------------------------------------------------------------

#[cfg(test)]
pub(crate) fn sidecar_path_for_test() -> Result<std::path::PathBuf, String> {
    sidecar_path()
}

#[cfg(test)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn compress_for_test(
    bin: &std::path::Path,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    reasoning: &str,
    timeout_secs: u64,
    // 🆕 第六轮阶段 2（T3）：**故意**给一个小到不够用的输出上限，把回复掐断。
    // `None` = 什么都不加，⭐ 也就是产品那条路，一个字节都不差。
    //
    // ⚠️⚠️ **为什么在这里加，而不是加进 `sidecar_request`**：那个函数是**和产品共用**的
    // （见它上面那段注释），改它的签名就等于改产品发出去的请求。而这里是 `#[cfg(test)]`，
    // 发布构建里根本没有这个函数 —— ⛔ 实测台要的这个旋钮，碰不到用户那条路。
    max_output_tokens: Option<u32>,
) -> CompressOutcome {
    let timeout_secs = clamp_timeout(timeout_secs);
    let mut request =
        sidecar_request(base_url, api_key, model, system, user, reasoning, timeout_secs);
    if let Some(cap) = max_output_tokens {
        request["max_output_tokens"] = serde_json::json!(cap);
    }
    let payload = match serde_json::to_vec(&request) {
        Ok(v) => v,
        Err(e) => return CompressOutcome::failed("internal", e.to_string(), None),
    };
    spawn_sidecar(bin, payload, timeout_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- 余额（X 批，2026-08-26）----

    #[test]
    fn a_balance_envelope_keeps_the_amount_as_a_string() {
        // ⛔ 不许在任何一层折算成浮点：`"25.50"` 过一次 f64 就可能变成 25.499999。
        let b = parse_balance(r#"{"ok":true,"currency":"CNY","total":"25.50","usable":true}"#);
        assert!(b.ok);
        assert_eq!(b.total, "25.50");
        assert_eq!(b.currency, "CNY");
        assert!(b.usable);
    }

    #[test]
    fn an_endpoint_that_does_not_report_a_balance_is_not_an_error() {
        // ⭐ 「这家不报余额」和「查失败了」必须分得开 —— 界面上是两句不同的话，
        // ⛔ 而两者都不许显示成 0。
        let b = parse_balance(
            r#"{"ok":false,"kind":"unsupported","message":"no /user/balance","status":404}"#,
        );
        assert!(!b.ok);
        assert_eq!(b.kind.as_deref(), Some("unsupported"));
    }

    #[test]
    fn a_refused_key_is_reported_as_auth_not_as_a_missing_feature() {
        let b = parse_balance(r#"{"ok":false,"kind":"auth","message":"401","status":401}"#);
        assert_eq!(b.kind.as_deref(), Some("auth"));
    }

    #[test]
    fn garbage_from_the_balance_query_is_a_visible_failure() {
        let b = parse_balance("<html>gateway error</html>");
        assert!(!b.ok);
        assert_eq!(b.kind.as_deref(), Some("bad_response"));
        assert!(b.total.is_empty());
    }

    #[test]
    fn a_failure_envelope_keeps_the_kind_so_the_ui_can_say_which_one() {
        let o = parse_envelope(r#"{"ok":false,"kind":"quota","message":"out of balance","status":402}"#);
        assert!(!o.ok);
        assert_eq!(o.kind.as_deref(), Some("quota"));
        assert_eq!(o.status, Some(402));
    }

    // §6.2 约束 4：退回未压缩版而不告诉用户，是这个项目最怕的一类 bug。
    #[test]
    fn garbage_on_stdout_is_a_visible_failure_not_an_empty_success() {
        let o = parse_envelope("<html>gateway error</html>");
        assert!(!o.ok);
        assert_eq!(o.kind.as_deref(), Some("bad_response"));
    }

    #[test]
    fn a_success_envelope_carries_the_numbers_the_ledger_needs() {
        let o = parse_envelope(
            r#"{"ok":true,"text":"PACK","usage":{"input_tokens":30000,"output_tokens":2000,"cached_input_tokens":27000},"model":"deepseek-chat","ms":8123}"#,
        );
        assert!(o.ok);
        assert_eq!(o.input_tokens, 30000);
        assert_eq!(o.cached_input_tokens, Some(27000));
        assert_eq!(o.model.as_deref(), Some("deepseek-chat"));
    }

    // 「这家没报缓存命中」必须留成 None。显示成 0 就等于宣称一次都没命中，
    // 而第 5 步要拿这个数字去推翻或坐实 §6.2 的估算。
    #[test]
    fn an_endpoint_that_reports_no_cache_field_stays_unknown() {
        let o = parse_envelope(
            r#"{"ok":true,"text":"PACK","usage":{"input_tokens":100,"output_tokens":10},"model":"m","ms":1}"#,
        );
        assert_eq!(o.cached_input_tokens, None);
    }

    #[test]
    fn the_cuts_section_is_split_off_the_pack() {
        let o = parse_envelope(
            r##"{"ok":true,"text":"# Project Context\n\nbody\n⟦SPOOL:CUTS⟧\n- merged two repeats\n⟦/SPOOL:CUTS⟧","usage":{},"model":"m","ms":1}"##,
        );
        assert!(o.ok);
        assert!(!o.text.contains("SPOOL:CUTS"));
        assert!(o.text.ends_with("body"));
        assert_eq!(o.cuts.as_deref(), Some("- merged two repeats"));
    }

    // 模型没写那一段时，界面要能说「它没说自己删了什么」——所以这里必须是 None，
    // 不能编一句「无」出来。
    #[test]
    fn a_model_that_never_said_what_it_cut_leaves_cuts_unknown() {
        let (pack, cuts) = split_cuts("# Project Context\n\nbody");
        assert_eq!(pack, "# Project Context\n\nbody");
        assert_eq!(cuts, None);
    }

    // 整条链子：找到二进制 → 起进程 → 把请求(含 key)从 stdin 递进去 → 拿回分类过的信封。
    //
    // ⚠️ `--ignored`,因为它**真的会联网**（打到 api.deepseek.com），而这个项目的测试
    // 平时必须能离线跑完。跑法：
    //
    //     cargo test --lib the_whole_chain_answers -- --ignored --nocapture
    //
    // 用的是一个假 key,所以**不花钱**,期望结果就是 `auth`。这条能过就说明形态 C 的机械
    // 部分是通的;还没被证明的只剩一件事：**一次成功的压缩长什么样**——那个需要真 key。
    #[test]
    #[ignore = "reaches the network; run with --ignored"]
    fn the_whole_chain_answers() {
        let bin = sidecar_path().expect("build it first: cargo build --manifest-path src-tauri/sidecar/Cargo.toml");
        let payload = serde_json::to_vec(&serde_json::json!({
            "base_url": "https://api.deepseek.com",
            "api_key": "sk-deliberately-not-a-real-key",
            "model": "deepseek-chat",
            "system": "s",
            "user": "u",
            "timeout_secs": 30,
        }))
        .unwrap();
        let out = spawn_sidecar(&bin, payload, 60);
        println!("kind={:?} status={:?} message={:?}", out.kind, out.status, out.message);
        assert!(!out.ok);
        assert_eq!(out.kind.as_deref(), Some("auth"), "expected the endpoint to reject a bogus key");
        assert_eq!(out.status, Some(401));
    }

    // D-a：探针读的是 `find_similar_blocks` 的输出。⚠️ 用户要的是「能并掉几块」——
    // 每组保留一块，所以是 members - 1，不是 members。写成 members 界面上那个数会虚高。
    #[test]
    fn probe_counts_blocks_that_can_be_merged_away() {
        let v = serde_json::json!({
            "scanned_blocks": 45,
            "total_groups": 2,
            "groups": [
                { "blocks": [{}, {}, {}] },
                { "blocks": [{}, {}] },
            ],
        });
        assert_eq!(
            probe_from(&v),
            DuplicateProbe { groups: 2, extra_blocks: 3, scanned_blocks: 45 }
        );
    }

    #[test]
    fn probe_reads_zero_when_nothing_repeats() {
        let v = serde_json::json!({ "scanned_blocks": 12, "total_groups": 0, "groups": [] });
        assert_eq!(probe_from(&v).extra_blocks, 0);
    }

    #[test]
    fn timeouts_are_clamped_at_both_ends() {
        assert_eq!(clamp_timeout(1), 10);
        // ⚠️ 上限 2026-08-20 从 900 提到 1800（实测：26,615 字符那份 180 秒还没写完就被掐，
        // 而那一次已经计费）。这条断言当时忘了跟着改，直到 08-21 才发现。
        assert_eq!(clamp_timeout(99_999), 1800);
        assert_eq!(clamp_timeout(120), 120);
    }
}

// ---------------------------------------------------------------------------------------
// E3 · 作废检测接产品（COMPRESS-UX-R2-2026-08-22 §7 / WORKPLAN §2.E3）
// ---------------------------------------------------------------------------------------
//
// 60 次实测早就判定「可以接」，而产品里一行都没接 —— 提示词只活在 `compress_sweep.rs`，
// 那个模块是 `#[cfg(test)]` 的。这一段是它进出货路径的那条命令。
//
// ⚠️⚠️ **这里最要紧的不是发请求，是回来之后那道闸。**
//
// 模型报的每一条都带两句引文（旧块里证明它作废的那一句、新块里取代它的那一句），
// 提示词第 2 条明写「必须逐字连续出现，Spool 会拿它们回去精确比对，对不上的整条丢掉」。
// ⛔ **那句话必须是真的**：一条引文对不上的提议，意味着模型在**指一句它自己编的话**，
// 而用户要凭这句话决定退不退一个块。
//
// 折叠规则和第四轮那个 `gate.py` 逐字同源（§6.1 口径 1）：
//   * 只折叠**标点**的全角/半角，⛔ **数字和日期一个都不折叠**；
//   * 折叠表每一项都是**单字符对单字符**，所以折叠不改变长度 ——
//     于是「有没有因为折叠放进本该被拒的」是可逐字打印的清单，不是一句保证；
//   * `…` **故意不在表里**：提示词明写「不许用省略号」，所以它是破规矩，不是重打。

/// 全角 → 半角，**只有标点**。⛔ 数字一个都不在这儿：全角 ０-９ 故意不折叠，
/// 重打成半角数字必须报出来。⚠️ 每一项都必须是单字符对单字符（长度守恒）。
fn fold_char(c: char) -> char {
    match c {
        '，' | '、' => ',',
        '。' | '．' => '.',
        '；' => ';',
        '：' => ':',
        '！' => '!',
        '？' => '?',
        '（' => '(',
        '）' => ')',
        '《' => '<',
        '》' => '>',
        '【' => '[',
        '】' => ']',
        '“' | '”' | '「' | '」' | '『' | '』' => '"',
        '‘' | '’' => '\'',
        '—' | '–' | '－' | '﹣' | '‐' => '-',
        '／' => '/',
        '＼' => '\\',
        '｜' => '|',
        '～' => '~',
        '％' => '%',
        '＃' => '#',
        '＆' => '&',
        '＊' => '*',
        '＋' => '+',
        '＝' => '=',
        '＄' => '$',
        '　' => ' ',
        other => other,
    }
}

fn fold(s: &str) -> Vec<char> {
    s.chars().map(fold_char).collect()
}

/// ⭐ T4(2026-08-23,第五轮实测)——**引文只有一把尺子。**
///
/// 存进库的 `corrected_quote` 是过了上面那道闸的,而闸**折叠标点**才放行;
/// 渲染那一侧原来用的是 `content.contains(quote)`,**不折叠**。
/// ⛔ 平常不咬人,但「先接受一条更正、之后再压缩这个项目」会咬:压缩顺手把全角标点
/// 换成半角(实测那一份换掉 46%),R1 之后压缩稿写回 `content` —— 于是那句引文从此
/// 对不上,**pack 里那行「更正了哪一句」退回只报块号,而且不报任何错**。
///
/// ⚠️ 和 TS 那边 `lib/blocks/quoteFold.ts` 是同一条规则,两边各写一遍(和表头双份同一类)。
pub(crate) fn quote_is_in_block(content: &str, quote: &str) -> bool {
    if quote.is_empty() {
        return false;
    }
    if content.contains(quote) {
        return true;
    }
    let (fc, fq) = (fold(content), fold(quote));
    !fq.is_empty() && fq.len() <= fc.len() && fc.windows(fq.len()).any(|w| w == fq.as_slice())
}

/// 一句引文在一块里的下落。⚠️ 只有 `Verbatim` 和 `Retyped` 能留下来。
#[derive(PartialEq, Debug)]
enum Quoted {
    /// 一字不差。
    Verbatim,
    /// 只差标点（每一处都在折叠表里，⛔ 两边都不是数字）。破了「逐字」，但没改内容。
    Retyped,
    /// ⛔ 折叠后能对上，但**有一处动的是数字** —— 整条丢掉。
    Digits,
    /// ⛔ 折叠后仍然对不上，或者块里根本没有 —— 整条丢掉。
    Absent,
}

fn locate(quote: &str, block: &str) -> Quoted {
    if quote.is_empty() {
        return Quoted::Absent;
    }
    if block.contains(quote) {
        return Quoted::Verbatim;
    }
    let fb = fold(block);
    let fq = fold(quote);
    if fq.is_empty() || fq.len() > fb.len() {
        return Quoted::Absent;
    }
    let Some(at) = fb.windows(fq.len()).position(|w| w == fq.as_slice()) else {
        return Quoted::Absent;
    };
    // 回到**原文**取同样长度的一段，逐字符比 —— 折叠长度守恒，所以这一步对得齐。
    let raw: Vec<char> = block.chars().skip(at).take(fq.len()).collect();
    for (a, b) in quote.chars().zip(raw.iter().copied()) {
        if a == b {
            continue;
        }
        if a.is_ascii_digit() || b.is_ascii_digit() || a.is_numeric() || b.is_numeric() {
            return Quoted::Digits;
        }
        if fold_char(a) != fold_char(b) {
            return Quoted::Absent;
        }
    }
    Quoted::Retyped
}

/// 把一份 pack 按块首行切开 → `编号 → 那一块全文`。
/// ⚠️ 和 `compress.ts::ENTRY_RE`、`gate.py::blocks_of` 同一条规则。
fn blocks_of(pack: &str) -> std::collections::HashMap<i64, String> {
    let mut out: std::collections::HashMap<i64, String> = std::collections::HashMap::new();
    let mut cur: Option<i64> = None;
    let mut buf: Vec<&str> = Vec::new();
    for line in pack.lines() {
        let head = crate::mcp::entry_seq(line);
        if let Some(seq) = head {
            if let Some(c) = cur {
                out.entry(c).or_insert_with(|| buf.join("\n"));
            }
            cur = Some(seq);
            buf = vec![line];
        } else if cur.is_some() {
            buf.push(line);
        }
    }
    if let Some(c) = cur {
        out.entry(c).or_insert_with(|| buf.join("\n"));
    }
    out
}

/// 一条提议。⚠️ 编号是**块自己的 `#N`**，不是它在 pack 里排第几。
#[derive(serde::Serialize, Clone, Debug)]
pub struct StaleProposal {
    pub stale_seq: i64,
    pub by_seq: i64,
    pub why: String,
    pub quote_stale: String,
    pub quote_new: String,
    /// `true` = 两句引文里至少有一句是「只差标点的重打」。
    /// ⚠️ **界面要说出来**：它确实破了「逐字」，只是没改内容。
    pub retyped: bool,
}

/// ⛔ 没过闸、被整条丢掉的那一条 —— **连它说了什么一起交出去**。
///
/// ⚠️⚠️ **2026-08-23（Ocean 真手指验收第 8 条）：原来这里只回一个数。**
/// 界面于是只能写「另有 1 条被丢掉了 —— 它给的引文在块里对不上，Spool 不拿它给你看」，
/// 而他读到的是「我的项目有问题，但 Spool 不告诉我是哪儿」。他的原话：
/// **「不允许这样的情况发生。」**
///
/// ⭐ 病根不在措辞，在**这个结构里根本没有可给的东西**：丢掉的那几条连内容都没带回来。
/// 所以整条带回来 —— 它没过闸不是「不能看」，是**不能当成事实去动库**。
/// ⚠️ 界面上要摆得很清楚：这几条是**AI 自己没说对**，⛔ 不是用户的项目出了问题。
#[derive(serde::Serialize, Clone, Debug)]
pub struct StaleDropped {
    /// 它说的旧块编号。⚠️ 可能根本不是这份 pack 里的编号，甚至可能没说 —— 那时候是 `null`。
    pub stale_seq: Option<i64>,
    pub by_seq: Option<i64>,
    pub why: String,
    pub quote_stale: String,
    pub quote_new: String,
    /// 为什么没过闸。⚠️ 界面按它挑话说，⛔ 别在界面里另判一遍。
    /// `no_seq` 没说是哪两块 · `no_block` 编号不在这份 pack 里 · `same_block` 指到了自己 ·
    /// `quote_stale` / `quote_new` 那一句在块里找不到。
    pub reason: &'static str,
}

#[derive(serde::Serialize)]
pub struct StaleScan {
    /// 请求本身的信封（成功没成功、花了多少、多久）。和压缩那条路共用一套。
    pub outcome: CompressOutcome,
    /// ⚠️ **过了闸的**才在这儿。
    pub proposals: Vec<StaleProposal>,
    /// ⛔ 引文对不上、被整条丢掉的那几条。⚠️ **必须报出来**：模型提了 5 条只留下 2 条
    /// 和它本来就只提了 2 条，是两件完全不同的事。⭐ 而且要带上它到底说了什么。
    pub dropped: Vec<StaleDropped>,
}

/// 从模型那一坨输出里把 JSON 数组抠出来。⚠️ 提示词说了不要代码块标记，
/// 但一个只在「它守规矩时」才work的解析器，等于把守规矩当成了前提。
fn json_array_slice(text: &str) -> &str {
    let t = text.trim();
    match (t.find('['), t.rfind(']')) {
        (Some(a), Some(b)) if b > a => &t[a..=b],
        _ => "[]",
    }
}

/// 逐条过闸。⛔ 一条引文对不上就整条丢掉 —— 提示词里那句承诺必须是真的。
///
/// ⚠️ 丢掉的那几条**连内容一起带出去**（`StaleDropped`）：闸挡住的是「拿它去动库」，
/// ⛔ 不是「不让用户知道 AI 说过什么」。见 `StaleDropped` 上面那段。
fn gate_proposals(raw: &str, pack: &str) -> (Vec<StaleProposal>, Vec<StaleDropped>) {
    let blocks = blocks_of(pack);
    let parsed: Vec<serde_json::Value> =
        serde_json::from_str(json_array_slice(raw)).unwrap_or_default();
    let mut kept = Vec::new();
    let mut dropped: Vec<StaleDropped> = Vec::new();
    for item in parsed {
        let stale_seq = item.get("stale").and_then(serde_json::Value::as_i64);
        let by_seq = item.get("by").and_then(serde_json::Value::as_i64);
        let str_of = |k: &str| {
            item.get(k).and_then(serde_json::Value::as_str).unwrap_or_default().to_string()
        };
        // ⛔⛔ **引文一个字符都不许动**（首尾空白也算）：这道闸的全部意义是「它引的那句话
        // 逐字出现在那一块里」，而 `locate` 认的就是这个字符串。⚠️ 顺手 `.trim()` 一下
        // 会把闸放宽一点点，而且**放宽之后测试照样是绿的** —— 只有 `why` 是给人读的，
        // 它才 trim（原来就是这样，⛔ 别把两者调换）。
        let why = str_of("why").trim().to_string();
        let (qs, qn) = (str_of("quote_stale"), str_of("quote_new"));
        let drop = |reason: &'static str| StaleDropped {
            stale_seq,
            by_seq,
            why: why.clone(),
            quote_stale: qs.clone(),
            quote_new: qn.clone(),
            reason,
        };
        let (Some(stale_seq), Some(by_seq)) = (stale_seq, by_seq) else {
            dropped.push(drop("no_seq"));
            continue;
        };
        if stale_seq == by_seq {
            dropped.push(drop("same_block"));
            continue;
        }
        // ⛔ 指到 pack 里没有的编号 —— 整条丢掉。
        let (Some(old), Some(new)) = (blocks.get(&stale_seq), blocks.get(&by_seq)) else {
            dropped.push(drop("no_block"));
            continue;
        };
        let (a, b) = (locate(&qs, old), locate(&qn, new));
        let ok = |q: &Quoted| matches!(q, Quoted::Verbatim | Quoted::Retyped);
        if !ok(&a) {
            dropped.push(drop("quote_stale"));
            continue;
        }
        if !ok(&b) {
            dropped.push(drop("quote_new"));
            continue;
        }
        kept.push(StaleProposal {
            stale_seq,
            by_seq,
            why,
            quote_stale: qs,
            quote_new: qn,
            retyped: a == Quoted::Retyped || b == Quoted::Retyped,
        });
    }
    (kept, dropped)
}

/// ⭐ S2(2026-08-24)——MCP 那一侧提「整条取代」时走的**同一道闸**。
///
/// ⛔⛔ **这是一个转发，不是第二份实现。** 它调的就是 `locate` ——E3 花钱扫那一遍
/// 用的那一个。§2.S2 写死了:「界面上放行的和 Rust 放行的必须是同一批」,
/// 抄一份出来,两条路就会在某一次改动之后悄悄分叉,而分叉的那一天没有任何症状。
///
/// `Some(retyped)` = 放行(`retyped` = 只差标点的重打,界面要说出来);
/// `None` = 整条丢掉(引文对不上,或者**动的是数字**)。
///
/// ⚠️⚠️ **输入一个字符都不许动,首尾空白也算** —— 顺手 `.trim()` 一下会把闸放宽一点点,
/// 而且**放宽之后测试照样是绿的**。
pub(crate) fn quote_passes(quote: &str, block: &str) -> Option<bool> {
    match locate(quote, block) {
        Quoted::Verbatim => Some(false),
        Quoted::Retyped => Some(true),
        Quoted::Digits | Quoted::Absent => None,
    }
}

/// 实测台用的口子：⛔ 只是把 `gate_proposals` 原样露出来，**不是另一份实现**。
/// 阶段 4 的复算必须过产品这一道闸，抄一份出来量到的就不是产品了。
#[cfg(test)]
pub(crate) fn gate_proposals_for_test(raw: &str, pack: &str) -> (Vec<StaleProposal>, Vec<StaleDropped>) {
    gate_proposals(raw, pack)
}

/// 查一遍这份 pack 里有没有被后面的块整条取代的旧块。
///
/// ⚠️ 和压缩共用同一把「正在跑」的锁：两件事都要起 `spool-ai`，而这台机器上同时跑两个
/// 只会让两边都变慢，还把「这一次花了多少」搅在一起。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn stale_scan_via_api(
    app: tauri::AppHandle,
    pack_text: String,
    base_url: String,
    api_key: String,
    model: String,
    reasoning: String,
    timeout_secs: u64,
) -> Result<StaleScan, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("a run is already in flight".into());
    }
    let pack_for_gate = pack_text.clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        if let Ok(dir) = tauri::Manager::path(&app).app_config_dir() {
            crate::mcp::refresh_lang(&dir);
        }
        let (system, user) = crate::mcp::stale_messages_for_api(&pack_text);
        let bin = match sidecar_path() {
            Ok(p) => p,
            Err(e) => return CompressOutcome::failed("no_sidecar", e, None),
        };
        let timeout_secs = clamp_timeout(timeout_secs);
        let request =
            sidecar_request(&base_url, &api_key, &model, &system, &user, &reasoning, timeout_secs);
        let payload = match serde_json::to_vec(&request) {
            Ok(v) => v,
            Err(e) => return CompressOutcome::failed("internal", e.to_string(), None),
        };
        spawn_sidecar_with(&bin, payload, timeout_secs, Some(app.clone()))
    })
    .await;
    RUNNING.store(false, Ordering::SeqCst);
    *CHILD.lock().unwrap() = None;
    let outcome = match out {
        Ok(o) => o,
        Err(e) => CompressOutcome::failed("internal", e.to_string(), None),
    };
    let (proposals, dropped) = if outcome.ok {
        gate_proposals(&outcome.text, &pack_for_gate)
    } else {
        (Vec::new(), Vec::new())
    };
    Ok(StaleScan { outcome, proposals, dropped })
}

// ---------------------------------------------------------------------------------------
// 余额 —— 2026-08-26，Ocean：「能不能拿到用户的 api 剩余额度，目前使用 api 摩擦还是比较大，
// 用户需要反复查看余额，但是尽可能保住不出网叙事。」
//
// ⭐ **「不出网叙事」没被推翻，因为它走的还是同一个子进程、同一个用户自己填的端点。**
// 那句话现在的形状是「只有 spool-ai 会出去，而且只在你要它出去的时候」——查一次余额
// 是用户点的，或者一次已经出过网的运行刚结束时顺带的，⛔ 没有定时轮询。
// ⛔ 哪天有人想给它加个定时器，那才是真的推翻，要先问 Ocean。
//
// ⚠️ **它只对认得的那几家有效**，见 sidecar 里 `balance()` 的注释：余额不是 OpenAI 兼容
// 协议的一部分。问不到的时候界面要说「这家不报余额」，⛔ 不许显示 0。

/// 余额查询的结果。⚠️ 和 `CompressOutcome` 分开一个类型，是因为它**没有** token、没有
/// 花了多久、没有模型名 —— 挤进那个结构里只会多出六个永远是 0 的字段。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceOutcome {
    pub ok: bool,
    /// 币种（`CNY` / `USD` …）。失败时为空。
    pub currency: String,
    /// ⚠️ **原样的十进制字符串**，⛔ 不是数字：钱经过一次二进制浮点就可能变成 25.499999。
    /// 界面只把它印出来。
    pub total: String,
    /// 厂商说的「这个账号现在还能不能调用」。
    pub usable: bool,
    /// `unsupported` = 这家不报余额。⛔ 界面要把它和「查失败了」分开说。
    pub kind: Option<String>,
    pub message: Option<String>,
    pub status: Option<u16>,
}

impl BalanceOutcome {
    fn failed(kind: &str, message: String, status: Option<u16>) -> Self {
        Self {
            ok: false,
            currency: String::new(),
            total: String::new(),
            usable: false,
            kind: Some(kind.to_string()),
            message: Some(message),
            status,
        }
    }
}

fn parse_balance(stdout: &str) -> BalanceOutcome {
    let line = stdout.trim();
    let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
        return BalanceOutcome::failed(
            "bad_response",
            format!("The sidecar's answer was not JSON: {}", clip(line)),
            None,
        );
    };
    if v.get("ok").and_then(|b| b.as_bool()) != Some(true) {
        return BalanceOutcome::failed(
            v.get("kind").and_then(|s| s.as_str()).unwrap_or("http"),
            v.get("message").and_then(|s| s.as_str()).unwrap_or("").to_string(),
            v.get("status").and_then(|n| n.as_u64()).map(|n| n as u16),
        );
    }
    let pick = |k: &str| v.get(k).and_then(|s| s.as_str()).unwrap_or("").to_string();
    BalanceOutcome {
        ok: true,
        currency: pick("currency"),
        total: pick("total"),
        usable: v.get("usable").and_then(|b| b.as_bool()).unwrap_or(true),
        kind: None,
        message: None,
        status: None,
    }
}

/// 问一句余额。
///
/// ⛔⛔ **不占 `RUNNING` 那个闸。** 那个闸是给「一次只跑一个模型调用」用的，而这一条
/// 既不花钱也不吃额度（一次 GET），⚠️ 更要紧的是：「跑完顺带刷一次」这个用法**必然**
/// 发生在一次运行刚结束的那一刻。让它去抢那个闸，就是让它在最该刷新的时候刷不了。
///
/// ⚠️ 超时不从设置里读：一次 GET 二十秒还没回话，那不是「模型在想」，是这条路不通
/// （sidecar 那边写死 20 秒，这里给它一点余量收尾）。
#[tauri::command]
pub async fn api_balance(
    base_url: String,
    api_key: String,
) -> Result<BalanceOutcome, String> {
    let out = tauri::async_runtime::spawn_blocking(move || {
        let bin = match sidecar_path() {
            Ok(p) => p,
            Err(e) => return BalanceOutcome::failed("no_sidecar", e, None),
        };
        let request = serde_json::json!({
            "kind": "balance",
            "base_url": base_url,
            "api_key": api_key,
            // ⚠️ 这三个是请求结构里的必填字段，查余额那条路一个都不读 —— 但少一个，
            // 子进程会把整个请求判成「不是合法 JSON」并非零退出。
            "model": "",
            "system": "",
            "user": "",
            "timeout_secs": 25u64,
        });
        let payload = match serde_json::to_vec(&request) {
            Ok(v) => v,
            Err(e) => return BalanceOutcome::failed("internal", e.to_string(), None),
        };
        // ⛔ 不走 `spawn_sidecar_with`：那条会把子进程的句柄挂进 `CHILD`，而 `CHILD`
        // 是「停下」按钮瞄准的地方 —— 一次查余额挂上去，就会把用户正在跑的那次压缩
        // 从取消按钮底下顶掉。这条路自己起、自己收。
        match run_balance_child(&bin, payload) {
            Ok(stdout) => parse_balance(&stdout),
            Err(e) => BalanceOutcome::failed("internal", e, None),
        }
    })
    .await;
    Ok(match out {
        Ok(o) => o,
        Err(e) => BalanceOutcome::failed("internal", e.to_string(), None),
    })
}

/// 起一次子进程、喂 stdin、等它退出。⚠️ 二十五秒是硬上限：子进程自己 20 秒就会写一个
/// timeout 信封出来，这里只是兜住「它连信封都没写出来」的情况。
fn run_balance_child(bin: &std::path::Path, payload: Vec<u8>) -> Result<String, String> {
    use std::io::Write;
    let mut child = Command::new(bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .ok_or_else(|| "no stdin on the sidecar".to_string())?
        .write_all(&payload)
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

// ---------------------------------------------------------------------------------------
// 周回顾走这条路 —— 2026-08-25，Ocean：「CLI 只支持 codex 和 claude，这两个模型太贵了
// （gemini 的能力有限，且额度少），加入 deepseek 的周总结，总结的 model 可以让用户自行选择」。
//
// ⭐ 「模型自行选择」**这一半本来就有**：设置里那个「模型」输入框（`ApiEngineConfig.tsx`）
// 写的就是 `apiModel`，默认 `deepseek-v4-flash`，端点也是用户自己填的。
// ⇒ 这一段补的只是「周回顾也能走这条路」，⛔ 不是又发明一套模型设置。
//
// ⚠️ 和压缩 / 过期检测的**唯一**区别：材料是在 Rust 这边自己开库拼的
// （`weekly_material_for_api`），不从前端接 —— 跨全库的东西前端手上没有。
//
// ⛔ 这条路一个字都不往库里写。回顾正文回给前端，由前端按老路子记进 `engine_runs`，
// 存不存成块仍然是用户的事（和形态 B 那条一样）。
#[tauri::command]
pub async fn weekly_review_via_api(
    app: tauri::AppHandle,
    since_days: Option<i64>,
    base_url: String,
    api_key: String,
    model: String,
    reasoning: String,
    timeout_secs: u64,
) -> Result<CompressOutcome, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("a run is already in flight".into());
    }
    let out = tauri::async_runtime::spawn_blocking(move || {
        if let Ok(dir) = tauri::Manager::path(&app).app_config_dir() {
            crate::mcp::refresh_lang(&dir);
        }
        // ⚠️ 拼材料失败要当成一次失败的运行回出去，⛔ 不是 panic，也不是空材料硬发 ——
        // 空材料发出去只会换回一段编的回顾，而钱已经花了。
        let (digest, fresh) = match crate::mcp::weekly_material_for_api(since_days) {
            Ok(m) => m,
            Err(e) => return CompressOutcome::failed("internal", e, None),
        };
        let (system, user) = crate::mcp::weekly_messages_for_api(&digest, &fresh);
        let bin = match sidecar_path() {
            Ok(p) => p,
            Err(e) => return CompressOutcome::failed("no_sidecar", e, None),
        };
        let timeout_secs = clamp_timeout(timeout_secs);
        let request =
            sidecar_request(&base_url, &api_key, &model, &system, &user, &reasoning, timeout_secs);
        let payload = match serde_json::to_vec(&request) {
            Ok(v) => v,
            Err(e) => return CompressOutcome::failed("internal", e.to_string(), None),
        };
        spawn_sidecar_with(&bin, payload, timeout_secs, Some(app.clone()))
    })
    .await;
    RUNNING.store(false, Ordering::SeqCst);
    *CHILD.lock().unwrap() = None;
    Ok(match out {
        Ok(o) => o,
        Err(e) => CompressOutcome::failed("internal", e.to_string(), None),
    })
}

#[cfg(test)]
mod stale_gate_tests {
    use super::*;

    const PACK: &str = "# Project Context: 申请规划\n\
\n\
## Full Record (chronological)\n\
\n\
#2 [2026-08-01 09:00 · from Claude] 名单定稿：15 所，含 UMich MSI。\n\
#21 [2026-08-09 21:07 · from Claude] 名单重定：移出 UMich MSI，加入 CMU MSAII（16 个月）。\n";

    /// ⚠️ 下面这些断言只关心「丢了几条」，所以这里把丢掉的那一堆折成一个数。
    /// ⛔ 别把它当成产品那条路 —— 产品拿的是整条（`StaleDropped`），界面要摆出来给人看。
    fn gate(items: &str) -> (Vec<StaleProposal>, usize) {
        let (kept, dropped) = gate_proposals(items, PACK);
        (kept, dropped.len())
    }

    #[test]
    fn a_verbatim_pair_gets_through() {
        let (kept, dropped) = gate(
            r#"[{"stale":2,"by":21,"why":"名单重定","quote_stale":"含 UMich MSI","quote_new":"移出 UMich MSI"}]"#,
        );
        assert_eq!(dropped, 0);
        assert_eq!(kept.len(), 1);
        assert!(!kept[0].retyped);
        assert_eq!(kept[0].stale_seq, 2);
        assert_eq!(kept[0].by_seq, 21);
    }

    // ⛔ 这一条是整道闸存在的理由：提示词向模型承诺「对不上的整条丢掉」，
    //    那句承诺必须是真的 —— 否则用户要凭一句模型自己编的话决定退不退一个块。
    #[test]
    fn an_invented_quote_takes_the_whole_item_with_it() {
        let (kept, dropped) = gate(
            r#"[{"stale":2,"by":21,"why":"x","quote_stale":"这句话原文里根本没有","quote_new":"移出 UMich MSI"}]"#,
        );
        assert_eq!(kept.len(), 0);
        assert_eq!(dropped, 1);
    }

    // 只差标点的重打放行，但**必须报出来** —— 它确实破了「逐字」，只是没改内容。
    #[test]
    fn punctuation_retyped_gets_through_and_says_so() {
        let (kept, _) = gate(
            r#"[{"stale":2,"by":21,"why":"x","quote_stale":"名单定稿:15 所,含 UMich MSI","quote_new":"移出 UMich MSI"}]"#,
        );
        assert_eq!(kept.len(), 1);
        assert!(kept[0].retyped, "重打了标点却没报出来");
    }

    // ⛔⛔ 数字一个都不折叠。改一个数字就是改了内容，整条丢掉。
    #[test]
    fn a_retyped_digit_is_never_folded_away() {
        let (kept, dropped) = gate(
            r#"[{"stale":2,"by":21,"why":"x","quote_stale":"名单定稿：16 所","quote_new":"移出 UMich MSI"}]"#,
        );
        assert_eq!(kept.len(), 0, "改了数字的引文放进来了");
        assert_eq!(dropped, 1);
    }

    // ⭐⭐ T4(2026-08-23,第五轮实测):**闸门和渲染器必须是同一把尺子。**
    //
    // 实测撞到的那一条:一条更正进库的时候引文是逐字对得上的;之后这个项目被压缩过一次,
    // 压缩把 `个：UCLA` 改写成 `个:UCLA`(那一份换掉了 46% 的全角标点),R1 之后
    // 压缩稿写回 `content` —— 于是 pack 里那行「更正了哪一句」退回只报块号,
    // 屏幕上那句高亮消失,**而界面不报任何错**。
    #[test]
    fn the_renderer_locates_a_quote_the_gate_would_have_let_through() {
        let after_compression = "第一批三个:UCLA,CMU,UMich.";
        let quote = "第一批三个：UCLA";
        assert!(!after_compression.contains(quote), "这条测试的前提没了");
        assert!(quote_is_in_block(after_compression, quote));
    }

    // ⛔ 反过来那一半:尺子松到「什么都能对上」就成了假高亮。
    #[test]
    fn a_quote_that_is_really_gone_stays_gone() {
        assert!(!quote_is_in_block("名单里只有 UCLA。", "名单里只有 CMU。"));
        assert!(!quote_is_in_block("随便什么", ""));
        // 数字仍然不折叠 —— 15 所和 16 所不是同一句话。
        assert!(!quote_is_in_block("名单定稿：15 所", "名单定稿:16 所"));
    }

    // ⚠️ 省略号故意不在折叠表里：提示词明写「不许用省略号」，用了就是破规矩。
    #[test]
    fn an_ellipsis_is_breaking_the_rule_not_retyping() {
        let (kept, dropped) =
            gate(r#"[{"stale":2,"by":21,"why":"x","quote_stale":"名单定稿：15 所…MSI","quote_new":"移出 UMich MSI"}]"#);
        assert_eq!(kept.len(), 0);
        assert_eq!(dropped, 1);
    }

    #[test]
    fn a_block_number_the_pack_does_not_have_is_dropped() {
        let (kept, dropped) =
            gate(r#"[{"stale":99,"by":21,"why":"x","quote_stale":"含 UMich MSI","quote_new":"移出 UMich MSI"}]"#);
        assert_eq!(kept.len(), 0);
        assert_eq!(dropped, 1);
    }

    // 模型没守「不要代码块标记」那一条也要解析得出来 —— 一个只在它守规矩时才 work
    // 的解析器，等于把守规矩当成了前提。
    #[test]
    fn a_fenced_answer_still_parses() {
        let (kept, _) = gate(
            "```json\n[{\"stale\":2,\"by\":21,\"why\":\"x\",\"quote_stale\":\"含 UMich MSI\",\"quote_new\":\"移出 UMich MSI\"}]\n```",
        );
        assert_eq!(kept.len(), 1);
    }

    // ⭐ 2026-08-23（Ocean 第 8 条「不允许 Spool 不告诉我」）：丢掉的那一条要**带着内容**
    // 回来，而且要说得出它是**哪一步**没过 —— 界面靠这个字段挑话说。
    #[test]
    fn a_dropped_item_comes_back_with_what_it_said() {
        let (kept, dropped) = gate_proposals(
            r#"[{"stale":2,"by":21,"why":"名单重定","quote_stale":"这句话原文里根本没有","quote_new":"移出 UMich MSI"}]"#,
            PACK,
        );
        assert_eq!(kept.len(), 0);
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].reason, "quote_stale");
        assert_eq!(dropped[0].stale_seq, Some(2));
        assert_eq!(dropped[0].by_seq, Some(21));
        assert_eq!(dropped[0].why, "名单重定");
        assert_eq!(dropped[0].quote_stale, "这句话原文里根本没有");
    }

    #[test]
    fn a_number_the_pack_does_not_have_says_which_step_failed() {
        let (_, dropped) = gate_proposals(
            r#"[{"stale":99,"by":21,"why":"x","quote_stale":"含 UMich MSI","quote_new":"移出 UMich MSI"}]"#,
            PACK,
        );
        assert_eq!(dropped[0].reason, "no_block");
    }

    #[test]
    fn nothing_found_is_a_normal_answer() {
        let (kept, dropped) = gate("[]");
        assert_eq!(kept.len(), 0);
        assert_eq!(dropped, 0);
    }

    #[test]
    fn entry_lines_are_read_the_same_way_the_ts_side_reads_them() {
        assert_eq!(crate::mcp::entry_seq("#12 [2026-08-01] x"), Some(12));
        assert_eq!(crate::mcp::entry_seq("📌 💭 #7 [2026-08-01] x"), Some(7));
        assert_eq!(crate::mcp::entry_seq("🗜 #6 [2026-08-01] x"), Some(6));
        // 正文里的 `#12` 不是条目头行。
        assert_eq!(crate::mcp::entry_seq("见 #12 那一条"), None);
        assert_eq!(crate::mcp::entry_seq("#12 没有方括号"), None);
    }
}
