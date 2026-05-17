# Spool · 思簿

> 长期项目的上下文中枢。把零散信息瞬间归到项目脉络，需要时一键打包成可粘贴的简报。

## 一句话定位

LLM 不记得你的项目，每开一个新对话都要重新解释上下文——**思簿把"重新解释"压缩成"一次粘贴"**。

## 核心循环：捕捉 → 脉络 → 打包

- **捕捉（Capture）**：全局快捷键 `⌘⇧C`，沿用 `⌘C` 肌肉记忆——剪贴板内容秒级写入当前脉络
- **脉络（Thread）**：工作区 → 脉络两级结构；脉络下是按时间排列的信息块
- **打包（Pack）**：一键把整条脉络组装成 Markdown 简报，粘进 AI 对话即可瞬间唤回上下文

## 六条不可妥协的原则

1. 捕捉零摩擦——一键、零决策
2. 本地优先、默认隐私
3. 脉络是日志，不是聊天
4. 检索是确定性的——打包是纯函数，AI 永远不挡道
5. **AI 是图书管理员，不是作者**：只做摘要 / 分类建议，不替你写内容
6. 两级结构，进度跟着上下文走（没有无限嵌套，没有独立 dashboard）

## 技术栈

Tauri 2.0 + React 18 + TypeScript + Vite + Tailwind + Zustand + SQLite（含 FTS5 全文搜索）

## AI 编排（全部免费档可用）

| 档 | 模型 | 用途 | 限额 |
|---|---|---|---|
| Fast | Groq Llama 3.3 70B | 捕捉分类建议 | 14400/天 |
| Quality | Gemini 2.5 Flash | 脉络状态 / 结论摘要 | 1500/天 |
| Local | Ollama Qwen3 8B | 隐私模式 / 离线 | 无限 |

三家自动降级；隐私模式强制走本地；**AI 永远是装饰，缺席不影响捕捉、打包、搜索**。

## 开发

```bash
npm install
source $HOME/.cargo/env
npm run tauri dev
```

打包：

```bash
npm run tauri build
```

## 完整计划

- 中文：[`PLAN.md`](./PLAN.md)
- English：[`PLAN_EN.md`](./PLAN_EN.md)（实现工作的依据文档）

## 获取 API Key

- Groq: <https://console.groq.com>
- Gemini: <https://aistudio.google.com/apikey>
- Ollama: <https://ollama.com> → `ollama pull qwen3:8b`（可选，隐私模式才需要）

## License

Ocean
