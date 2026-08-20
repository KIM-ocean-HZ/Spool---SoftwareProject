//! `spool-ai` — Spool 里**唯一**会打开 socket 的那个进程（WORKPLAN-2026-08-20 §6.2，形态 C）。
//!
//! # 契约
//!
//! stdin 收一个 JSON 请求（读到 EOF 为止），stdout 吐**一行** JSON 信封，然后退出。
//! 没有别的输入通道，没有别的输出通道。
//!
//! ## ⚠️ key 只走 stdin，永远不走 argv
//!
//! `ps aux` 在 macOS 和 Windows 上都能看到**任何用户**进程的完整命令行。key 一旦出现在 argv
//! 里，同一台机器上的任何程序都能读到它。所以请求整体（包括 key）从 stdin 进来，而且这个进程
//! 从不把 key 打回 stdout 或 stderr —— 包括报错的时候。
//!
//! ## ⚠️ 失败必须可见（§6.2 设计约束 4）
//!
//! 这个进程**永远返回 exit code 0**，只要它成功地产出了一个信封。超时、余额不足、限流、key 不
//! 对、网断了，全部作为 `{"ok":false,"kind":…}` 返回。理由写在 §6.2 里：
//! 「唯一症状是沉默的失败」是这个项目最怕的一类 bug —— 如果失败走的是「非零退出码 + 空输出」，
//! 调用方能拿到的只有一个数字，界面上就只能写「失败了」，而用户需要知道的是**为什么**。
//! 非零退出码只留给一种情况：连信封都产不出来（stdin 不是合法 JSON）。
//!
//! ## ⚠️ 只接受 https
//!
//! `base_url` 是可配置的（DeepSeek / 硅基流动 / 任何 OpenAI 兼容端点都行），但明文 http 会把
//! key 原样发到线上。这里直接拒绝，不给「我知道我在干什么」的开关。

use serde::{Deserialize, Serialize};
use std::io::Read;
use std::time::{Duration, Instant};

/// 从 stdin 进来的请求。
#[derive(Deserialize)]
struct Request {
    /// 端点根地址，例如 `https://api.deepseek.com`。末尾有没有 `/` 都行。
    base_url: String,
    api_key: String,
    model: String,
    /// 系统提示。放在最前面，因为它是**每次都一样**的那一截 —— 见 `messages` 那里的注释。
    system: String,
    /// 这一次要压的东西。
    user: String,
    /// ⚠️ `None` = **不发这个字段**，让服务端用它自己的上限。
    ///
    /// 2026-08-20 实测踩到的坑：DeepSeek V4-Flash 是**会思考的模型**，思考产生的 token
    /// 和正文共用同一个额度。给了一个自以为够用的 `max_tokens`(按原文长度折算的),
    /// 结果它把额度全花在 `reasoning_content` 上,`content` 回来是**空字符串**——
    /// 界面上看起来像「接口不兼容」,实际上是我们自己把它掐断的。
    ///
    /// 猜一个更大的数同样不行:猜高了会被服务端以 400 顶回来。所以干脆不猜——**不发**。
    /// 花销由超时和账单兜底,而账单正是这一步要测的东西。
    ///
    /// ⚠️ `#[serde(default)]` 不能省。serde 对 `Option<T>` 的默认行为是**字段仍然必须出现**
    /// (只是允许它是 null),少了这一行,调用方不发这个字段就会被判成「请求不是合法 JSON」。
    #[serde(default)]
    max_output_tokens: Option<u32>,
    timeout_secs: u64,
}

/// 吐到 stdout 的信封。`ok` 是判别字段，两种形态的字段不重叠。
#[derive(Serialize)]
#[serde(untagged)]
enum Envelope {
    Ok {
        ok: bool,
        text: String,
        usage: Usage,
        model: String,
        /// 墙上时间，毫秒。界面要拿它跟「一次实时 web 运行」对照（§6.2）。
        ms: u128,
    },
    Err {
        ok: bool,
        /// 界面按这个分类说人话；`message` 是给「详情」用的原文。
        kind: &'static str,
        message: String,
        /// HTTP 状态码，没有就是 null。
        status: Option<u16>,
    },
}

/// ⚠️ `cached_input_tokens` 是这一整件事里最重要的一个数字。
///
/// §6.2 那个「一到三分钱」的账，整个建立在「pack 是确定性的，所以前缀天然命中缓存」上。
/// **那是一个估算，从来没有被实测过。** 这个字段就是去实测它的探针 —— §9 第 5 步要往案例账本
/// 里追的那一行「实测 vs 估算」，比的就是它。
///
/// DeepSeek 在 `usage` 里给 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。别家
/// OpenAI 兼容端点大多没有这两个字段，那时候 `cached_input_tokens` 就是 `None`，界面必须说
/// 「这家没报缓存命中」，**而不是当成 0** —— 把「不知道」显示成「一次都没命中」会让实测直接说谎。
#[derive(Serialize, Default)]
struct Usage {
    input_tokens: u64,
    output_tokens: u64,
    cached_input_tokens: Option<u64>,
    /// 「思考」烧掉的 token，单独报。
    ///
    /// ⚠️ 这一栏会直接动摇 §6.2 那个成本估算：那张表按「30,000 输入 + **2,000 输出**」算的，
    /// 而一个会思考的模型可能先烧掉几千个思考 token,它们**按输出价计费**(最贵的那一档)。
    /// 混在 `output_tokens` 里就看不出这笔钱花在哪儿了。`None` = 这家没报。
    reasoning_tokens: Option<u64>,
}

fn main() {
    let mut raw = String::new();
    if std::io::stdin().read_to_string(&mut raw).is_err() {
        // 连 stdin 都读不下来 —— 这是调用方的 bug，不是一次失败的压缩。
        eprintln!("spool-ai: could not read the request from stdin");
        std::process::exit(2);
    }
    let req: Request = match serde_json::from_str(&raw) {
        Ok(r) => r,
        Err(e) => {
            // ⚠️ 只说解析在哪一步坏了，不回显 raw —— raw 里有 key。
            eprintln!("spool-ai: the request on stdin is not valid JSON ({e})");
            std::process::exit(2);
        }
    };
    // raw 里有 key，用完就地清掉，别让它在这个进程的内存里多待。
    drop(raw);

    let envelope = run(req);
    // 一行 JSON。调用方读整个 stdout，所以这里不需要分隔符，但保持单行让日志好看。
    match serde_json::to_string(&envelope) {
        Ok(s) => println!("{s}"),
        Err(e) => {
            eprintln!("spool-ai: could not serialise the envelope ({e})");
            std::process::exit(2);
        }
    }
}

/// 一行 JSON 到 stderr。⚠️ 这里永远不会出现请求内容,更不会出现 key。
fn progress(stage: &str) {
    eprintln!("{{\"stage\":\"{stage}\"}}");
}

fn err(kind: &'static str, message: impl Into<String>, status: Option<u16>) -> Envelope {
    Envelope::Err { ok: false, kind, message: message.into(), status }
}

fn run(req: Request) -> Envelope {
    let base = req.base_url.trim().trim_end_matches('/');
    if !base.starts_with("https://") {
        return err(
            "bad_config",
            "The endpoint must start with https:// — over plain http your API key would go out in the clear.",
            None,
        );
    }
    if req.api_key.trim().is_empty() {
        return err("bad_config", "No API key was given.", None);
    }
    let url = format!("{base}/chat/completions");

    // ⚠️ system 在前、user 在后，而这个顺序是**钱**，不是风格问题。
    //
    // 前缀缓存按「从第一个 token 开始，逐字相同的那一截」计费。system 这一截每次调用都一模一样，
    // user 那一截每次都不同 —— 反过来放的话，第一个 token 就不同了，整个请求全部按未命中计价，
    // §6.2 那个 30 倍直接归零。
    //
    // ⚠️⚠️ 但即使这样排，前缀也**没有 §6.2 估的那么长**：pack 正文的第一段就是
    // 「Generated by Spool on <日期>. N blocks total.」（`src/lib/pack/templates.ts` 的
    // PACK_HEADER）—— 换一天、或者项目多了一块，这一行就变了，它后面那一大片静态表头也就跟着
    // 全部未命中。所以能稳定命中的只有 system 这一截。**这正是第 5 步要去实测的东西**，别在
    // 实测出来之前就照着估算的数字对外说话。
    let mut body = serde_json::json!({
        "model": req.model,
        "messages": [
            { "role": "system", "content": req.system },
            { "role": "user", "content": req.user },
        ],
        // 不流式：这个动作的产物是一整份压缩稿，要并排核对，逐字蹦出来没有意义，
        // 而流式会把错误处理变成两条路（HTTP 层的错 + 流里的错）。
        "stream": false,
        // 压缩是搬运不是创作。低温让「一字不改地照抄骨架」这条规则更可能被守住。
        "temperature": 0.2,
    });
    if let Some(n) = req.max_output_tokens {
        body["max_tokens"] = serde_json::json!(n);
    }

    let timeout = Duration::from_secs(req.timeout_secs.clamp(10, 900));
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        // 这个进程只会连一个地址然后退出，连接池没有意义。
        .max_idle_connections(0)
        // ⚠️ 关掉「非 2xx 直接变成 Error」这个默认行为，这条不是风格问题。
        //
        // 默认那条路给回来的只有一个状态码，**厂商写在响应体里的那句解释会被丢掉**。
        // 而第一次配置时最可能撞上的错就是这一类：模型名写错了、账号还没实名、
        // 这个 key 没有开通这个模型 —— 它们全是 400，状态码本身什么也没说，
        // 有用的那句话全在响应体里。关掉之后每一条错误路径都能把厂商原话带回界面。
        .http_status_as_error(false)
        .build()
        .into();

    // 进度。⚠️ 走 **stderr**,因为 stdout 是信封的地盘(调用方整块读)。
    //
    // 为什么要有这个:这条路是**不流式**的,而一个会思考的模型可能一分钟不吭声。
    // 界面上如果只有一个转圈,用户分不出「还在等」和「根本没连上」——2026-08-20 Ocean
    // 报的正是这一条。至少要让「请求已经发出去了」这件事是可见的。
    progress("sending");
    let started = Instant::now();
    let resp = agent
        .post(&url)
        .header("Authorization", &format!("Bearer {}", req.api_key))
        .header("Content-Type", "application/json")
        .send_json(&body);
    let ms = started.elapsed().as_millis();

    let mut resp = match resp {
        Ok(r) => r,
        Err(ureq::Error::Timeout(_)) => {
            return err(
                "timeout",
                format!("The model did not answer within {} seconds.", timeout.as_secs()),
                None,
            )
        }
        Err(e) => {
            // 连不上、DNS、TLS。⚠️ `e` 里不含 key（key 在 header 里，不在 URL 里）。
            return err("network", format!("Could not reach {base} — {e}"), None);
        }
    };

    progress("reading");
    let status = resp.status().as_u16();
    let text = match resp.body_mut().read_to_string() {
        Ok(t) => t,
        Err(e) => return err("bad_response", format!("Could not read the reply — {e}"), Some(status)),
    };
    let parsed: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => {
            return err(
                "bad_response",
                format!("The endpoint answered with something that is not JSON: {}", clip(&text)),
                Some(status),
            )
        }
    };
    envelope_from_body(&parsed, status, &text, &req.model, ms)
}

/// 响应体 → 信封。
///
/// 单独一个函数是为了**能被测试钉住**：这里判的每一条都是 2026-08-20 实测撞出来的
/// （厂商的错误原话、思考吃光额度、被 max_tokens 截断），而它们只靠一个假 key 是撞不出来的。
fn envelope_from_body(
    parsed: &serde_json::Value,
    status: u16,
    raw: &str,
    asked_model: &str,
    ms: u128,
) -> Envelope {
    // 厂商写在响应体里的那句解释,优先于我们自己那句通用的。
    // ⚠️ 也覆盖了「200 里包一个 error 对象」这种兼容端点的写法。
    if let Some(msg) = parsed.get("error").and_then(api_error_message) {
        return err(classify(status), msg, Some(status));
    }
    if status >= 400 {
        // 有响应体但里面没有 error 字段。带上原文,别只报一个数字。
        return err(classify(status), format!("{} — {}", http_message(status), clip(raw)), Some(status));
    }
    let content = parsed
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty());
    let Some(content) = content else {
        // ⚠️ 2026-08-20 实测踩到的那一条：正文空的,但 `reasoning_content` 里塞满了思考过程。
        //
        // 这**不是**「接口不兼容」,而这个区分很重要——它决定用户下一步该干什么:
        // 一个是「换个接口」,一个是「别把额度掐死在思考上」。原来那句笼统的
        // 「对方回来的东西看不懂」把人指向了完全错误的方向。
        let thought = parsed
            .pointer("/choices/0/message/reasoning_content")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let finish = parsed
            .pointer("/choices/0/finish_reason")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if let Some(thought) = thought {
            return err(
                "thought_only",
                format!(
                    "The model spent the whole reply thinking and wrote no briefing (finish_reason: {}). Its thinking began: {}",
                    if finish.is_empty() { "not reported" } else { finish },
                    clip(thought)
                ),
                Some(status),
            );
        }
        if finish == "length" {
            return err(
                "truncated",
                "The reply was cut off by the output-token limit before anything usable came back.".to_string(),
                Some(status),
            );
        }
        return err(
            "bad_response",
            format!("The reply had no message content: {}", clip(raw)),
            Some(status),
        );
    };

    Envelope::Ok {
        ok: true,
        text: content.to_string(),
        usage: read_usage(parsed.get("usage")),
        model: parsed.get("model").and_then(|v| v.as_str()).unwrap_or(asked_model).to_string(),
        ms,
    }
}

/// `usage` 缺字段就是缺，不要拿 0 填 —— 见 `Usage::cached_input_tokens` 上的注释。
fn read_usage(u: Option<&serde_json::Value>) -> Usage {
    let Some(u) = u else { return Usage::default() };
    let n = |k: &str| u.get(k).and_then(|v| v.as_u64());
    Usage {
        input_tokens: n("prompt_tokens").unwrap_or(0),
        output_tokens: n("completion_tokens").unwrap_or(0),
        // DeepSeek 的名字。OpenAI 自己走 `prompt_tokens_details.cached_tokens`，也认一下，
        // 因为「OpenAI 兼容」的端点抄的往往是后者。
        cached_input_tokens: n("prompt_cache_hit_tokens")
            .or_else(|| u.pointer("/prompt_tokens_details/cached_tokens").and_then(|v| v.as_u64())),
        reasoning_tokens: u
            .pointer("/completion_tokens_details/reasoning_tokens")
            .and_then(|v| v.as_u64()),
    }
}

fn api_error_message(e: &serde_json::Value) -> Option<String> {
    if let Some(s) = e.as_str() {
        return Some(s.to_string());
    }
    e.get("message").and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// 状态码 → 界面上说哪一句话。这三类（key 不对 / 余额不足 / 限流）是 §6.2 点名要求
/// 「要在界面上说出来」的。
fn classify(code: u16) -> &'static str {
    match code {
        401 | 403 => "auth",
        402 => "quota",
        429 => "rate_limit",
        500..=599 => "upstream",
        _ => "http",
    }
}

fn http_message(code: u16) -> String {
    match classify(code) {
        "auth" => "The endpoint rejected the API key.".into(),
        "quota" => "The account is out of balance.".into(),
        "rate_limit" => "Rate limited — too many requests just now.".into(),
        "upstream" => format!("The provider had a server-side error (HTTP {code})."),
        _ => format!("The endpoint answered HTTP {code}."),
    }
}

/// 报错里回显对方的原文时截断 —— 一个坏掉的端点可能吐一整页 HTML。
fn clip(s: &str) -> String {
    let s = s.trim();
    if s.chars().count() <= 300 {
        return s.to_string();
    }
    format!("{}…", s.chars().take(300).collect::<String>())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(base: &str, key: &str) -> Request {
        Request {
            base_url: base.into(),
            api_key: key.into(),
            model: "deepseek-chat".into(),
            system: "s".into(),
            user: "u".into(),
            max_output_tokens: Some(16),
            timeout_secs: 30,
        }
    }

    fn kind_of(e: &Envelope) -> &'static str {
        match e {
            Envelope::Err { kind, .. } => kind,
            Envelope::Ok { .. } => "ok",
        }
    }

    // 明文 http 会把 key 发到线上。这条必须在**发出请求之前**就拦下来。
    #[test]
    fn plain_http_is_refused_before_anything_is_sent() {
        assert_eq!(kind_of(&run(req("http://api.example.com", "sk-x"))), "bad_config");
    }

    #[test]
    fn an_empty_key_is_refused_before_anything_is_sent() {
        assert_eq!(kind_of(&run(req("https://api.example.com", "   "))), "bad_config");
    }

    // §6.2 约束 4 点名的三类，界面要分别说话，所以它们不能塌成同一个 kind。
    #[test]
    fn the_three_failures_the_ui_must_name_are_kept_apart() {
        assert_eq!(classify(401), "auth");
        assert_eq!(classify(402), "quota");
        assert_eq!(classify(429), "rate_limit");
        assert_ne!(classify(402), classify(429));
    }

    // 「这家端点没报缓存命中」和「一次都没命中」是两件事。把前者显示成后者，第 5 步的实测就说谎了。
    #[test]
    fn a_missing_cache_field_stays_unknown_rather_than_zero() {
        let u = read_usage(Some(&serde_json::json!({
            "prompt_tokens": 100, "completion_tokens": 20
        })));
        assert_eq!(u.input_tokens, 100);
        assert_eq!(u.cached_input_tokens, None);
    }

    #[test]
    fn deepseeks_cache_field_is_read() {
        let u = read_usage(Some(&serde_json::json!({
            "prompt_tokens": 100, "completion_tokens": 20, "prompt_cache_hit_tokens": 64
        })));
        assert_eq!(u.cached_input_tokens, Some(64));
    }

    // 「OpenAI 兼容」的端点抄的常常是 OpenAI 那套字段名。
    #[test]
    fn the_openai_spelling_of_the_cache_field_is_read_too() {
        let u = read_usage(Some(&serde_json::json!({
            "prompt_tokens": 100,
            "completion_tokens": 20,
            "prompt_tokens_details": { "cached_tokens": 32 }
        })));
        assert_eq!(u.cached_input_tokens, Some(32));
    }

    // 2026-08-20 实测：V4-Flash 把整个回复都用来思考了,content 是空字符串。
    // 那不是「接口不兼容」,把它报成 bad_response 会把人指向换接口,而正确的动作是别掐额度。
    #[test]
    fn a_reply_that_is_all_thinking_says_so_instead_of_blaming_the_endpoint() {
        let body = serde_json::json!({
            "model": "deepseek-v4-flash",
            "choices": [{
                "index": 0,
                "finish_reason": "length",
                "message": { "role": "assistant", "content": "", "reasoning_content": "Let me analyze this task carefully." }
            }]
        });
        let e = envelope_from_body(&body, 200, "", "m", 1);
        assert_eq!(kind_of(&e), "thought_only");
    }

    #[test]
    fn a_truncated_reply_with_no_thinking_is_named_as_truncated() {
        let body = serde_json::json!({
            "choices": [{ "index": 0, "finish_reason": "length", "message": { "content": "" } }]
        });
        assert_eq!(kind_of(&envelope_from_body(&body, 200, "", "m", 1)), "truncated");
    }

    // 「思考」按输出价计费,而 §6.2 那张成本表是按「2000 输出」算的。
    // 混进 output_tokens 里就看不出这笔钱花在哪儿。
    #[test]
    fn thinking_tokens_are_reported_on_their_own() {
        let u = read_usage(Some(&serde_json::json!({
            "prompt_tokens": 100,
            "completion_tokens": 4200,
            "completion_tokens_details": { "reasoning_tokens": 4000 }
        })));
        assert_eq!(u.output_tokens, 4200);
        assert_eq!(u.reasoning_tokens, Some(4000));
    }

    #[test]
    fn a_page_of_html_from_a_broken_endpoint_is_clipped() {
        let long = "x".repeat(5000);
        assert!(clip(&long).chars().count() <= 301);
    }
}
