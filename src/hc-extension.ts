import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

type ToolInputCommon = {
  question: string;
  context?: string;
  placeholder?: string;
};

type WriteReportInput = {
  content: string;
  title?: string;
};

type DkPlusAskInput = {
  prompt: string;
  context?: string;
  placeholder?: string;
};

type ReadReportInput = {
  path: string;
};

type TemplateItem = { name: string; template: string };

function uiTitleFor(templateKey: 'clarification' | 'contact' | 'feedback'): string {
  switch (templateKey) {
    case 'clarification':
      return '澄清（dkplus）';
    case 'contact':
      return '联系用户（dkplus）';
    case 'feedback':
      return '反馈（dkplus）';
  }
}

function stripToolDirectives(prompt: string): string {
  return prompt
    .replace(/#tool:[^\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toolRefToToolName(ref: string): string | undefined {
  // ref is the part after #tool: e.g. dkplus.dkplushumanclarification/requestUserFeedback
  const parts = ref.split('/');
  const last = parts[parts.length - 1];
  switch (last) {
    case 'requestUserClarification':
      return 'request_user_clarification';
    case 'requestContactUser':
      return 'request_contact_user';
    case 'requestUserFeedback':
      return 'request_user_feedback';
    case 'writeReport':
      return 'write_report';
    case 'readReport':
      return 'read_report';
    case 'dkplusAsk':
      return 'dkplus_ask';
    default:
      return undefined;
  }
}

function extractToolRefs(prompt: string): string[] {
  const refs: string[] = [];
  const re = /#tool:([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

function buildToolInput(toolName: string, userText: string): any {
  switch (toolName) {
    case 'request_user_clarification':
    case 'request_contact_user':
    case 'request_user_feedback':
      return { question: userText };
    case 'dkplus_ask':
      return { prompt: userText };
    case 'write_report':
      return { content: userText };
    case 'read_report':
      return { path: userText };
    default:
      return { question: userText };
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function sanitizeFileComponent(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function getWorkspaceRoot(): vscode.Uri | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri;
}

function getReportsRoot(context: vscode.ExtensionContext): vscode.Uri {
  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    return vscode.Uri.joinPath(workspaceRoot, '.hc');
  }
  return vscode.Uri.joinPath(context.globalStorageUri, '.hc');
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

function getTemplates(configKey: 'clarification' | 'contact' | 'feedback'): TemplateItem[] {
  const key = `humanClarification.templates.${configKey}`;
  const items = vscode.workspace.getConfiguration().get<TemplateItem[]>(key, []);
  return Array.isArray(items) ? items.filter(x => x && typeof x.name === 'string' && typeof x.template === 'string') : [];
}

async function pickTemplate(configKey: 'clarification' | 'contact' | 'feedback'): Promise<TemplateItem | undefined> {
  const templates = getTemplates(configKey);
  if (templates.length === 0) return undefined;

  if (templates.length === 1) return templates[0];

  const picked = await vscode.window.showQuickPick(
    templates.map(t => ({ label: t.name, description: configKey, detail: t.template })),
    { placeHolder: '选择一个模板（可选）' }
  );
  if (!picked) return undefined;
  return templates.find(t => t.name === picked.label);
}

function applyTemplate(template: string, inputContent: string): string {
  return template.split('{{INPUT_CONTENT}}').join(inputContent);
}

async function askUserFreeTextWebview(
  input: ToolInputCommon,
  templateKey: 'clarification' | 'contact' | 'feedback'
): Promise<string> {
  const templates = getTemplates(templateKey);

  const uiTitle = uiTitleFor(templateKey);

  const panel = vscode.window.createWebviewPanel(
    'humanClarification.prompt',
    uiTitle,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false }
  );

  const nonce = getNonce();
  const question = input.question ?? '';
  const context = input.context ?? '';
  const placeholder = input.placeholder ?? '';

  const templatesJson = JSON.stringify(templates);
  const dataJson = JSON.stringify({ question, context, placeholder, templateKey });

  panel.webview.html = `<!DOCTYPE html>
<html lang="zh-cn">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DK-Plus-AI</title>
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 18px; }

    .frame {
      position: relative;
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
      padding: 14px;
    }
    .frame::before,
    .frame::after {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      border-color: var(--vscode-editorWidget-border);
      border-style: solid;
    }
    .frame::before {
      top: -1px;
      left: -1px;
      border-width: 2px 0 0 2px;
    }
    .frame::after {
      bottom: -1px;
      right: -1px;
      border-width: 0 2px 2px 0;
    }

    .header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 10px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
    }
    .brand { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: 0.6px; }
    .subtitle { font-size: 12px; opacity: 0.9; margin: 0; letter-spacing: 0.4px; }

    .muted { opacity: 0.85; font-size: 12px; letter-spacing: 0.6px; }
    .box { border: 1px solid var(--vscode-editorWidget-border); border-radius: 2px; padding: 10px; margin: 10px 0; background: var(--vscode-editor-background); }
    .box.hud { border-left-width: 3px; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    select, textarea, input { width: 100%; box-sizing: border-box; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px; }
    textarea { min-height: 150px; resize: vertical; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; padding: 6px 12px; cursor: pointer; letter-spacing: 0.3px; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-editorWidget-border); }
    button:disabled { opacity: 0.6; cursor: default; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .step { display: none; }
    .step.active { display: block; }
  </style>
</head>
<body>
  <div class="frame">
    <div class="header">
      <div>
        <div class="brand">DK-Plus-AI 提问</div>
        <div class="subtitle">${escapeHtml(uiTitle)}</div>
      </div>
      <div class="muted">HUD</div>
    </div>
  <div id="step0" class="step">
    <div class="muted">步骤 1/2：选择模板（可选）</div>
    <div class="box hud">
      <div class="row">
        <div style="flex: 1 1 240px;">模板</div>
      </div>
      <select id="templateSelect"></select>
      <div class="muted" style="margin-top: 8px;">预览（模板应用到 question 上）：</div>
      <div id="preview" class="box hud" style="white-space: pre-wrap;"></div>
    </div>
  </div>

  <div id="step1" class="step">
    <div class="muted">步骤 2/2：填写你的回复</div>
    <div class="box hud" style="white-space: pre-wrap;">${escapeHtml(question)}${context ? `\n\n---\n\n${escapeHtml(context)}` : ''}</div>
    <textarea id="answer" placeholder="${escapeHtml(placeholder)}"></textarea>
  </div>

  <div class="actions">
    <button id="cancel" class="secondary">取消</button>
    <button id="back" class="secondary">上一步</button>
    <button id="next">下一步</button>
    <button id="submit">提交</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const templates = ${templatesJson};
    const data = ${dataJson};

    let step = templates.length > 0 ? 0 : 1;
    let selectedTemplateName = templates.length > 0 ? templates[0].name : '';

    const $ = (id) => document.getElementById(id);
    const step0 = $('step0');
    const step1 = $('step1');
    const templateSelect = $('templateSelect');
    const preview = $('preview');
    const answer = $('answer');
    const back = $('back');
    const next = $('next');
    const submit = $('submit');
    const cancel = $('cancel');

    function applyTemplate(tpl, input) {
      return String(tpl).split('{{INPUT_CONTENT}}').join(input);
    }

    function updatePreview() {
      const t = templates.find(x => x.name === selectedTemplateName);
      preview.textContent = t ? applyTemplate(t.template, data.question) : data.question;
    }

    function renderTemplateOptions() {
      templateSelect.innerHTML = '';
      for (const t of templates) {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
        templateSelect.appendChild(opt);
      }
      if (templates.length > 0) templateSelect.value = selectedTemplateName;
      updatePreview();
    }

    function render() {
      step0.classList.toggle('active', step === 0);
      step1.classList.toggle('active', step === 1);

      back.style.display = step === 0 ? 'none' : 'inline-block';
      next.style.display = step === 0 ? 'inline-block' : 'none';
      submit.style.display = step === 1 ? 'inline-block' : 'none';

      if (step === 1) {
        setTimeout(() => answer.focus(), 0);
      }
    }

    templateSelect?.addEventListener('change', () => {
      selectedTemplateName = templateSelect.value;
      updatePreview();
    });

    back.addEventListener('click', () => {
      if (templates.length > 0) step = 0;
      render();
    });

    next.addEventListener('click', () => {
      step = 1;
      render();
    });

    cancel.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    submit.addEventListener('click', () => {
      vscode.postMessage({ type: 'submit', value: answer.value ?? '' });
    });

    if (templates.length > 0) {
      renderTemplateOptions();
    }
    render();
  </script>
  </div>
</body>
</html>`;

  return await new Promise<string>((resolve) => {
    const sub = panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'submit') {
        resolve(String(msg.value ?? ''));
        panel.dispose();
      } else if (msg?.type === 'cancel') {
        resolve('');
        panel.dispose();
      }
    });

    const disposeSub = panel.onDidDispose(() => {
      sub.dispose();
      disposeSub.dispose();
      resolve('');
    });
  });
}

function asTextResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

function asJsonResult(value: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([vscode.LanguageModelDataPart.json(value)]);
}

async function dkplusAskAi(context: vscode.ExtensionContext, input: DkPlusAskInput, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
  const originalPrompt = input?.prompt ?? '';
  const extraContext = (input?.context ?? '').trim();
  const composedPrompt = extraContext ? `${originalPrompt}\n\n---\n\n${extraContext}` : originalPrompt;

  // IMPORTANT: LM requests must be triggered by user action. Confirm/edit via input box first.
  const confirmedPrompt = await vscode.window.showInputBox({
    title: 'AI dkPlus提问',
    prompt: '确认/编辑将要发送给 AI 的提问内容',
    value: composedPrompt,
    placeHolder: input?.placeholder,
    ignoreFocusOut: true,
  });

  if (!confirmedPrompt) {
    return asTextResult('');
  }

  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  const model = models[0] ?? (await vscode.lm.selectChatModels())[0];
  if (!model) {
    return asJsonResult({ error: 'No chat models available.' });
  }

  let promptTokens: number | undefined;
  try {
    promptTokens = await model.countTokens(confirmedPrompt, token);
  } catch {
    // ignore token counting failures
  }

  try {
    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(confirmedPrompt)],
      { justification: 'Answer a user question via dkplus_ask tool.' },
      token
    );

    let text = '';
    for await (const chunk of response.text) {
      text += chunk;
    }

    const answer = text.trim();

    let answerTokens: number | undefined;
    try {
      answerTokens = await model.countTokens(answer, token);
    } catch {
      // ignore token counting failures
    }

    return asJsonResult({
      answer,
      tokens: {
        prompt: promptTokens,
        answer: answerTokens,
      },
      model: {
        id: model.id,
        name: model.name,
        vendor: model.vendor,
        family: model.family,
        version: model.version,
      },
    });
  } catch (e) {
    return asJsonResult({ error: String(e) });
  }
}

function isUriInside(child: vscode.Uri, parent: vscode.Uri): boolean {
  const childPath = path.resolve(child.fsPath);
  const parentPath = path.resolve(parent.fsPath);
  return childPath === parentPath || childPath.startsWith(parentPath + path.sep);
}

async function writeReport(context: vscode.ExtensionContext, input: WriteReportInput): Promise<{ id: string; path: string } | { error: string }> {
  const reportsRoot = getReportsRoot(context);
  await ensureDir(reportsRoot);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const titlePart = input.title ? `-${sanitizeFileComponent(input.title)}` : '';
  const fileName = `${stamp}${titlePart}.md`;
  const reportUri = vscode.Uri.joinPath(reportsRoot, fileName);
  const content = input.content ?? '';
  await vscode.workspace.fs.writeFile(reportUri, Buffer.from(content, 'utf8'));

  return { id: fileName, path: reportUri.fsPath };
}

async function readReport(context: vscode.ExtensionContext, input: ReadReportInput): Promise<string | { error: string }> {
  if (!input?.path) return '';

  const reportsRoot = getReportsRoot(context);
  await ensureDir(reportsRoot);

  const candidate = path.isAbsolute(input.path)
    ? vscode.Uri.file(input.path)
    : vscode.Uri.joinPath(reportsRoot, input.path);

  if (!isUriInside(candidate, reportsRoot)) {
    return { error: 'Refusing to read outside of .hc reports directory.' };
  }

  try {
    const bytes = await vscode.workspace.fs.readFile(candidate);
    return Buffer.from(bytes).toString('utf8');
  } catch (e) {
    return { error: `Failed to read report: ${String(e)}` };
  }
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Human Clarification');

  // Chat participant so users can type: @dkplus #tool:... to actually invoke tools.
  const participant = vscode.chat.createChatParticipant('dkplus.dkplushumanclarification.dkplus', async (request, _ctx, response, token) => {
    try {
      const toolRefs = request.toolReferences?.map(r => r.name) ?? [];
      const inlineRefs = extractToolRefs(request.prompt);

      // Prefer inline #tool directives (because they encode extId/toolReferenceName)
      const toolNamesFromInline = inlineRefs
        .map(toolRefToToolName)
        .filter((x): x is string => typeof x === 'string');

      // Also allow direct toolReferences name if the UI attached tools
      const toolNames = [...toolNamesFromInline, ...toolRefs].filter(Boolean);

      if (toolNames.length === 0) {
        response.markdown('请在消息里附加一个工具引用，例如：\n\n- `#tool:dkplus.dkplushumanclarification/requestUserFeedback 你的问题`\n- `#tool:dkplus.dkplushumanclarification/dkplusAsk 你的问题`');
        return;
      }

      const userText = stripToolDirectives(request.prompt);

      for (const toolName of toolNames) {
        response.progress(`Invoking tool: ${toolName}`);
        const toolResult = await vscode.lm.invokeTool(toolName, {
          toolInvocationToken: request.toolInvocationToken,
          input: buildToolInput(toolName, userText),
        }, token);

        // Render tool result parts as markdown/plain
        let combined = '';
        for (const part of toolResult.content) {
          const maybeText = part as any;
          if (maybeText && typeof maybeText.value === 'string') {
            combined += maybeText.value;
          }
        }
        if (combined) {
          response.markdown(combined);
        } else {
          response.markdown('（工具已执行，但没有返回可显示的文本内容）');
        }
      }
    } catch (e) {
      response.markdown(`工具调用失败：${String(e)}`);
    }
  });

  // Icon shown next to @dkplus in Copilot Chat UI.
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png');
  context.subscriptions.push(participant);

  context.subscriptions.push(
    vscode.lm.registerTool<DkPlusAskInput>('dkplus_ask', {
      invoke: async (options, token) => {
        const result = await dkplusAskAi(context, options.input, token);
        output.appendLine('dkplus_ask invoked');
        return result;
      },
    }),
    vscode.lm.registerTool<ToolInputCommon>('request_user_clarification', {
      invoke: async (options, _token) => {
        const answer = await askUserFreeTextWebview(options.input, 'clarification');
        return asTextResult(answer);
      },
    }),
    vscode.lm.registerTool<ToolInputCommon>('request_contact_user', {
      invoke: async (options, _token) => {
        const answer = await askUserFreeTextWebview(options.input, 'contact');
        return asTextResult(answer);
      },
    }),
    vscode.lm.registerTool<ToolInputCommon>('request_user_feedback', {
      invoke: async (options, _token) => {
        const answer = await askUserFreeTextWebview(options.input, 'feedback');
        return asTextResult(answer);
      },
    }),
    vscode.lm.registerTool<ReadReportInput>('read_report', {
      invoke: async (options, _token) => {
        const result = await readReport(context, options.input);
        if (typeof result === 'string') return asTextResult(result);
        return asJsonResult(result);
      },
    }),
    vscode.lm.registerTool<WriteReportInput>('write_report', {
      invoke: async (options, _token) => {
        const result = await writeReport(context, options.input);
        return asJsonResult(result);
      },
    }),
    vscode.commands.registerCommand('humanClarification.test.writeReport', async () => {
      const title = await vscode.window.showInputBox({ title: 'write_report', prompt: '标题（可选）', ignoreFocusOut: true });
      const content = await vscode.window.showInputBox({ title: 'write_report', prompt: '内容', ignoreFocusOut: true });
      if (content === undefined) return;
      const result = await writeReport(context, { content, title: title || undefined });
      output.appendLine(`writeReport result: ${JSON.stringify(result)}`);
      vscode.window.showInformationMessage('write_report 已写入');
    }),
    vscode.commands.registerCommand('humanClarification.test.feedback', async () => {
      const feedback = await vscode.window.showInputBox({ title: 'Feedback', prompt: '请输入反馈', ignoreFocusOut: true });
      if (feedback === undefined) return;
      output.appendLine(`Feedback: ${feedback}`);
      vscode.window.showInformationMessage('收到反馈');
    }),
    output
  );
}

export function deactivate() { }
