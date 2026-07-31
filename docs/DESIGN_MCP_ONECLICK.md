# 一键接入的扩展面 — 待 Ocean 批

2026-07-31。起因:Ocean 批准把 **Claude Code 加成第一等公民**,并要求
「其他热门的 AI 工具用相应方法加进来,用户使用方法尽可能简单」。

本文档只解决一个问题:**哪些客户端能做到「一个按钮」,哪些做不到,做不到的那些给什么**。
外部事实(谁支持 MCP、配置文件在哪)全部于 2026-07-31 联网查证,来源列在末尾——
这类事实会过期,下次动这块前重查一遍。

---

## 0. 待拍板(三个)

1. **要不要支持 ChatGPT 桌面版 / Codex**?它是唯一一个用 **TOML** 的,
   而且是除 Claude 外装机量最大的那个。做它要么**引一个 TOML 依赖**(硬规则 2 需你批),
   要么手写 TOML 追加(见 §3)。**我的建议:引 `toml` crate 做,值这个钱。**
2. **国内客户端(Cherry Studio / DeepChat 等)只给「复制配置」够不够**?
   它们的 MCP 配置在应用自己的库里,没有可合并的公开配置文件——**技术上做不了一键**。
3. **五个已实现的客户端里,没装的要不要显示**?现在显示成灰色「未检测到」。
   五行里 Ocean 机器上只有三行是亮的。

---

## 1. 已做(本批次已实现,`mcp.rs` + `McpConfig.tsx`)

一个按钮写进对方配置文件,写前备份 `.bak`,只碰 `spool` 这一个键。

| 客户端 | 配置文件 | 键 | 装没装看什么 |
|---|---|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers` | 那个目录 |
| **Claude Code**(新) | `~/.claude.json` | `mcpServers`(顶层 = user scope) | **那个文件** |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | `~/.cursor` |
| **VS Code**(新) | `~/Library/Application Support/Code/User/mcp.json` | **`servers`** | 那个目录 |
| **Windsurf**(新) | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | 那个目录 |

**两个不能想当然的地方**:
- **VS Code 的键叫 `servers`,不是 `mcpServers`**。写错了不会报错,客户端只是当没看见。
- **Claude Code 的「装了」是一个文件,不是目录**,而且条目里带 `"type": "stdio"`。
  这两点是拿 `claude mcp add --scope user` 在临时 HOME 里跑一遍、看它自己写出什么确认的
  (2026-07-31,`~/.claude.json` 顶层 `mcpServers`,条目 `{type, command, args, env}`)。
  **以后再加客户端,都该用这个办法验,别照着博客写。**
- `~/.claude.json` 同时存着 Claude Code 自己的一大堆状态(onboarding、每个项目的设置)。
  我们只 merge 一个键 + 先备份;测试里专门断言了那些状态原样存活。

## 2. 差一步就能做:ChatGPT 桌面版 / Codex CLI

**结论:能做,但要 TOML。** 查证结果:ChatGPT 网页版**只支持远程 MCP**(HTTPS 端点),
本地 stdio 一律不行;但 **ChatGPT 桌面版与 Codex CLI、IDE 扩展共用同一份配置**,
那份配置**支持本地 stdio**,位置是 `~/.codex/config.toml`:

```toml
[mcp_servers.spool]
command = "/Applications/Spool.app/Contents/MacOS/spool"
args = ["--mcp"]
```

三条路:
- **A(建议)**:引 `toml` crate(`toml_edit` 更好——它保留注释和格式,
  merge 一个表不会把用户文件重排)。**需要 Ocean 批依赖。**
- **B**:手写字符串追加。文件不存在就写整段;存在就检测有没有 `[mcp_servers.spool]`,
  没有就 append。**不推荐**:一旦用户已经手写过这个表,我们要么重复要么得做半个解析器。
- **C**:不做,归到「复制配置」那条路。

## 3. 做不了一键的:GUI 配置型客户端

Cherry Studio、DeepChat 这类(国内用得多)把 MCP 服务器存在应用自己的存储里,
没有可合并的公开配置文件——**外部程序改不了,只能用户在界面里粘**。
它们都支持 stdio,所以 Spool 接得上,只是接法是「复制一段 JSON → 粘进对方的设置页」。

**给它们的东西**:设置页已经有的「复制配置」按钮(`mcp_exe_path` 生成,指向当前二进制)。
建议再补一句话:「你的 AI 工具不在上面?复制这段配置,粘进它的 MCP 设置里。」
—— 这就是 Ocean 要的「尽可能简单」在做不到一键时的下限。

## 4. 明确不做

- **远程/HTTP 传输**:Spool 是本机 stdio 服务,不出网(memory `mcp-first-pivot`)。
  要支持只认远程的客户端(ChatGPT 网页版)就得起 HTTP 服务或用 `mcp-remote` 桥——
  **和「本体零出网」的承诺直接冲突,不做**。
- **替用户装 `mcp-remote` 之类的中转**:同上,而且引第三方运行时。

---

## 来源(2026-07-31 查证)

- ChatGPT/Codex 的 MCP 配置与 stdio 支持:<https://learn.chatgpt.com/docs/extend/mcp>
- VS Code 的 mcp.json 位置与 `servers` 结构:<https://code.visualstudio.com/docs/copilot/chat/mcp-servers>
- Windsurf 的 `~/.codeium/windsurf/mcp_config.json`:<https://docs.windsurf.com/windsurf/cascade/mcp>
- Claude Code 的 user scope:实机跑 `claude mcp add --scope user`(比文档更可信)
- MCP 客户端生态总览:<https://modelcontextprotocol.io/clients>
