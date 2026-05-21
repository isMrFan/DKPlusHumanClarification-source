# DKPlusHumanClarification

## 作者 / Author

isMrFan

<https://github.com/isMrFan>

## 中文（使用说明）

这个扩展主要解决两类问题：

- Copilot Chat 工具（澄清/联系用户/反馈 + 报告读写 + AI 提问）
- 辅助命令：读取本地 Copilot Prompt Files（你自己的 `.prompt.md/.agent.md` 文件）

### 1) 最快上手：在 Copilot Chat 里用 @dkplus 调工具

安装扩展并重载 VS Code 后：

1. 打开 Copilot Chat
2. 直接发消息（推荐写法）：`@dkplus #tool:<工具引用> 你的内容`

常用写法：

- 反馈（弹出你的 Feedback Webview）：
  - `@dkplus #tool:dkplus.dkplushumanclarification/requestUserFeedback 请评价一下当前实现是否符合预期？`
- 澄清（弹出 Clarification Webview）：
  - `@dkplus #tool:dkplus.dkplushumanclarification/requestUserClarification 你希望输入输出格式是什么？`
- 联系用户（弹出 Contact Webview）：
  - `@dkplus #tool:dkplus.dkplushumanclarification/requestContactUser 我需要你确认是否允许我继续下一步。`
- AI 提问（dkplusAsk，会触发用户确认后再请求模型）：
  - `@dkplus #tool:dkplus.dkplushumanclarification/dkplusAsk 用一句话总结这个需求。`
- 报告写入/读取：
  - 写：`@dkplus #tool:dkplus.dkplushumanclarification/writeReport 这里是一段要保存的总结内容...`
  - 读：`@dkplus #tool:dkplus.dkplushumanclarification/readReport .hc/xxx.md`

补充说明：

- 为了“稳定触发工具并弹 UI”，建议始终使用 `@dkplus ...`。
- `.hc/` 目录用于保存/读取 report（由 write/read report 工具使用）。

### 2) 可用工具（给 Copilot 调用）

- `requestUserClarification`（澄清）
- `requestContactUser`（联系用户）
- `requestUserFeedback`（反馈）
- `writeReport`（写入报告）
- `readReport`（读取报告）
- `dkplusAsk`（AI 提问）

### 3) 命令（命令面板）

- `Get Local Copilot Prompt Files`：列出你本地 Prompt Files 目录
- `Read Local File`：读取指定本地文件内容

### 4) 使用内置 sample-prompts（推荐）

扩展仓库自带一组示例 Prompt 文件，用来把 dkplus 工具收敛成更稳定、更顺手的工作流。

#### 4.1 首次安装后的自动引导

从 0.7.8 开始，扩展首次激活时会自动把缺失的 sample-prompts 复制到你的用户 Prompt 目录，不再要求你手动复制示例文件。

默认用户 Prompt 目录（Windows）：

- `C:\Users\<你的用户名>\AppData\Roaming\Code\User\prompts`

你也可以通过扩展入口直接打开：

- 命令面板：`打开 DKPlus 快速入口`
- 或点击状态栏里的 `DKPlus`

如果你想重新同步示例文件，仍然可以手动执行：

- `复制 Sample Prompts 到用户目录`

#### 4.2 sample-prompts 分别做什么

- `Principle.agent.md`
  - 提供一套更短、更强的 dkplus 路由规则。
  - 默认要求澄清/联系/反馈/报告都走 `dkplus.dkplushumanclarification/...`。
  - 明确会话结束前必须调用 `requestUserFeedback`。
- `runCode.prompt.md`
  - 进入“直接执行”的编码模式。
  - 强调从具体锚点开始、形成可证伪假设、做最小修改、优先做局部验证。
- `runCodeSubagent.prompt.md`
  - 用于编排子代理。
  - 要求子代理也遵守 dkplus 工具路由，并以实现任务为目标，而不是停在泛泛分析。
- `settings.json`
  - 提供更适合真实工程场景的一组模板。
  - 已内置 implement、debug、review、plan、constraints、repro 等更强模板。

#### 4.3 在 Copilot Chat 里使用这些 Prompt

1. 打开 Copilot Chat 面板。

2. 在会话顶部（或新建会话时）选择你用户 Prompt 目录中的 Prompt。

- 可选 `Principle` 作为 agent/规则入口。
- 可选 `runCode` 或 `runCodeSubagent` 作为任务启动模板。

1. 然后像平时一样输入任务即可。

- Prompt 会帮你始终使用 `@dkplus #tool:dkplus.dkplushumanclarification/...` 这套工具。
- Prompt 会让代理在结束前一定通过你的插件 UI 跟你确认或反馈。

#### 4.4 推荐组合

- 日常直接编码：`Principle` + `runCode`
- 复杂任务分派：`Principle` + `runCodeSubagent`
- 想要更专业的澄清/反馈话术：导入 `sample-prompts/settings.json` 中的模板

---

## English (Usage)

This extension mainly provides:

- Copilot Chat tools (clarification/contact/feedback + report read/write + AI ask)
- Helper commands to read local Copilot Prompt Files (`.prompt.md/.agent.md`)

### 1) Quick start: invoke tools via @dkplus in Copilot Chat

After installing and reloading VS Code:

1. Open Copilot Chat
2. Send a message (recommended): `@dkplus #tool:<toolRef> your text`

Common examples:

- Feedback (opens Feedback Webview):
  - `@dkplus #tool:dkplus.dkplushumanclarification/requestUserFeedback Please review whether the current implementation meets expectations.`
- Clarification (opens Clarification Webview):
  - `@dkplus #tool:dkplus.dkplushumanclarification/requestUserClarification What input/output format do you want?`
- Contact user (opens Contact Webview):
  - `@dkplus #tool:dkplus.dkplushumanclarification/requestContactUser Please confirm whether I may proceed to the next step.`
- AI ask (dkplusAsk; will prompt for confirmation first):
  - `@dkplus #tool:dkplus.dkplushumanclarification/dkplusAsk Summarize the requirement in one sentence.`
- Reports:
  - Write: `@dkplus #tool:dkplus.dkplushumanclarification/writeReport This is a summary to save...`
  - Read: `@dkplus #tool:dkplus.dkplushumanclarification/readReport .hc/xxx.md`

Notes:

- For reliable tool execution + UI popups, always use `@dkplus ...`.
- Reports are stored/read from `.hc/`.

### 4) Using the bundled sample-prompts

Starting from 0.7.8, the extension automatically copies missing sample prompts into your user prompts directory on first activation. You no longer need to manually copy them for the default onboarding flow.

Recommended combinations:

- `Principle` + `runCode` for direct implementation work
- `Principle` + `runCodeSubagent` for orchestrated subagent work
- `settings.json` for reusable professional templates across clarification, contact, and feedback flows

### 2) Tools

- `requestUserClarification`
- `requestContactUser`
- `requestUserFeedback`
- `writeReport`
- `readReport`
- `dkplusAsk`

### 3) Commands

- `Get Local Copilot Prompt Files`
- `Read Local File`

## License

See [LICENSE](LICENSE).
