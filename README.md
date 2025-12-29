# DKPlusHumanClarification

## 作者 / Authors

| 作者 | GitHub |
| --- | --- |
| isMrFan | https://github.com/isMrFan |
| bugfix2020 | https://github.com/bugfix2020 |
| Real-Mabin | https://github.com/fanfanyiyun |
## 中文（使用说明）

这个扩展提供两类能力：
- Copilot Chat 工具（澄清/联系用户/反馈 + 报告读写 + AI 提问）
- 辅助命令：读取本地 Copilot Prompt Files（你自己的 `.prompt.md/.chatmode.md` 文件）

### 1) 最快上手：在 Copilot Chat 里用 @dkplus 调工具

安装扩展并 Reload 后：
1. 打开 Copilot Chat
2. 直接发消息（推荐写法）：`@dkplus #tool:<工具引用> 你的内容`

示例：
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

说明：
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

扩展仓库自带了一些示例 Prompt 文件，帮你把 dkplus 工具“固化”为一个稳定的工作流程。

#### 4.1 拷贝 sample-prompts 到用户目录

1. 在本仓库中找到目录：`sample-prompts/`
	- `Principle.chatmode.md`
	- `runCode.prompt.md`
	- `runCodeSubagent.prompt.md`
2. 打开你的 VS Code 用户 Prompt 目录（Windows）：
	- `C:\Users\\<你的用户名>\\AppData\\Roaming\\Code\\User\\prompts`
	- 例如你本机是：`C:\Users\\10388\\AppData\\Roaming\\Code\\User\\prompts`
3. 将 `sample-prompts/` 下这几个文件复制到上面的 `prompts` 目录中。

> 说明：如果 `prompts` 目录不存在，可以手动创建一个。

#### 4.2 这三个 Prompt 分别做什么

- `Principle.chatmode.md`
  - 定义了一整套「原则库」，并**强制要求**：
	 - 澄清/联系/反馈/报告一律使用 `dkplus.dkplushumanclarification/...` 工具；
	 - 会话结束前必须调用 `requestUserFeedback` 工具向你汇报。
- `runCode.prompt.md`
  - 启动一个“编码代理”，并要求它在需要时通过 `requestContactUser` 等工具联系你。
  - frontmatter 里的 `tools:[...]` 已经锁定到你的扩展 ID。
- `runCodeSubagent.prompt.md`
  - 作为“编排/总控”Prompt：
	 - 用 `#tool:runSubagent` 拉起子代理（编码代理）；
	 - 要求子代理和编排器都通过 `dkplus.dkplushumanclarification/requestContactUser` 和你保持沟通。

#### 4.3 在 Copilot Chat 里使用这些 Prompt

1. 打开 Copilot Chat 面板。
2. 在会话顶部（或新建会话时）选择你刚复制的 Prompt，例如：
	- 选择 `Principle.chatmode` 作为 chatmode（规则/宪法）。
	- 或选择 `runCode` / `runCodeSubagent` 作为任务启动模板。
3. 然后像平时一样输入指令即可，Prompt 会帮你：
	- 始终使用 `@dkplus #tool:dkplus.dkplushumanclarification/...` 这套工具；
	- 让代理在结束前一定通过你的插件 UI 跟你确认/反馈。

---

## English (Usage)

This extension provides:
- Copilot Chat tools (clarification/contact/feedback + report read/write + AI ask)
- Helper commands to read local Copilot Prompt Files (`.prompt.md/.chatmode.md`)

### 1) Quick start: invoke tools via @dkplus in Copilot Chat

After installing and reloading VS Code:
1. Open Copilot Chat
2. Send a message (recommended): `@dkplus #tool:<toolRef> your text`

Examples:
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
