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

function groupTitleFor(templateKey: 'clarification' | 'contact' | 'feedback'): string {
  switch (templateKey) {
    case 'clarification':
      return '澄清';
    case 'contact':
      return '联系用户';
    case 'feedback':
      return '反馈';
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

function getPreferredViewColumn(): vscode.ViewColumn {
  const configured = vscode.workspace.getConfiguration().get<string>('humanClarification.webview.viewColumn', 'active');
  return configured === 'beside' ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
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
  context: vscode.ExtensionContext,
  input: ToolInputCommon,
  templateKey: 'clarification' | 'contact' | 'feedback'
): Promise<string> {
  const templates = getTemplates(templateKey);
  const uiTitle = uiTitleFor(templateKey);
  const panel = vscode.window.createWebviewPanel(
    'humanClarification.prompt',
    uiTitle,
    getPreferredViewColumn(),
    { enableScripts: true, retainContextWhenHidden: false }
  );

  const nonce = getNonce();
  const question = input.question ?? '';
  const inputContext = input.context ?? '';
  const placeholder = input.placeholder ?? '';

  const templatesJson = JSON.stringify(templates);
  const dataJson = JSON.stringify({
    question,
    inputContext,
    placeholder,
    templateKey,
    groupTitle: groupTitleFor(templateKey),
  });

  panel.webview.html = `<!DOCTYPE html>
<html lang="zh-cn">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DK-Plus-AI</title>
  <style>
    :root {
      --accent: #4cc2ff;
      --accent-soft: rgba(76, 194, 255, 0.16);
      --panel: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
      --panel-alt: color-mix(in srgb, var(--vscode-editor-background) 82%, var(--accent-soft));
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background:
        radial-gradient(circle at top right, rgba(76, 194, 255, 0.12), transparent 32%),
        linear-gradient(180deg, color-mix(in srgb, var(--vscode-editor-background) 94%, #061722), var(--vscode-editor-background));
      margin: 0;
      padding: 18px;
    }
    .frame {
      position: relative;
      border: 1px solid color-mix(in srgb, var(--vscode-editorWidget-border) 70%, var(--accent));
      background: var(--panel);
      padding: 16px;
      border-radius: 14px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(10px);
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .subtitle {
      font-size: 12px;
      opacity: 0.85;
      margin: 4px 0 0;
      letter-spacing: 0.3px;
    }
    .badge {
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--vscode-editorWidget-border));
      background: var(--accent-soft);
      color: var(--vscode-foreground);
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    .step {
      display: none;
      animation: fadeUp 140ms ease;
    }
    .step.active { display: block; }
    .stack { display: grid; gap: 12px; }
    .muted { opacity: 0.78; font-size: 12px; }
    .panel {
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 12px;
      padding: 12px;
      background: var(--panel-alt);
    }
    .panelTitle {
      font-size: 12px;
      font-weight: 600;
      margin: 0 0 8px;
      letter-spacing: 0.2px;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .grid {
      display: grid;
      gap: 12px;
    }
    .quickGrid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    select, textarea {
      width: 100%;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    textarea { min-height: 168px; resize: vertical; line-height: 1.5; }
    button {
      color: var(--vscode-button-foreground);
      background: linear-gradient(180deg, color-mix(in srgb, var(--vscode-button-background) 86%, white), var(--vscode-button-background));
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 999px;
      padding: 7px 14px;
      cursor: pointer;
      transition: transform 120ms ease, opacity 120ms ease, border-color 120ms ease;
    }
    button:hover { transform: translateY(-1px); }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 90%, transparent);
      border: 1px solid var(--vscode-editorWidget-border);
    }
    button.ghost {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px dashed color-mix(in srgb, var(--accent) 42%, var(--vscode-editorWidget-border));
    }
    button:disabled { opacity: 0.55; cursor: default; transform: none; }
    .toolbar { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; margin: 8px 0 0; }
    .toolbarActions { display: flex; gap: 8px; flex-wrap: wrap; }
    .count {
      min-width: 56px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: color-mix(in srgb, var(--vscode-foreground) 72%, var(--accent));
    }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .chip {
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--vscode-editorWidget-border));
      background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--accent-soft));
      color: var(--vscode-foreground);
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview {
      white-space: pre-wrap;
      min-height: 96px;
      line-height: 1.55;
      word-break: break-word;
    }
    .notice {
      min-height: 18px;
      color: color-mix(in srgb, var(--accent) 70%, var(--vscode-foreground));
      font-size: 12px;
    }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
    .empty { opacity: 0.55; font-size: 12px; }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="header">
      <div>
        <div class="brand">DK-Plus-AI 提问</div>
        <div class="subtitle">${escapeHtml(uiTitle)}</div>
      </div>
      <div class="badge">${escapeHtml(groupTitleFor(templateKey))} 工作台</div>
    </div>
    <div id="step0" class="step">
      <div class="stack">
        <div class="muted">步骤 1/2：选择模板（可选），系统会实时预览最终提问内容。</div>
        <div class="panel">
          <div class="panelTitle">模板选择</div>
          <select id="templateSelect"></select>
        </div>
        <div class="panel">
          <div class="panelTitle">模板预览</div>
          <div id="preview" class="preview"></div>
        </div>
      </div>
    </div>
    <div id="step1" class="step">
      <div class="stack">
        <div class="muted">步骤 2/2：填写你的回复并直接提交。</div>
        <div class="panel">
          <div class="panelTitle">原始请求</div>
          <div class="preview">${escapeHtml(question)}${inputContext ? `\n\n---\n\n${escapeHtml(inputContext)}` : ''}</div>
        </div>
        <div class="panel">
          <div class="row">
            <div class="panelTitle" style="margin: 0;">输入回复</div>
            <div id="charCount" class="count">0 字</div>
          </div>
          <textarea id="answer" placeholder="${escapeHtml(placeholder)}"></textarea>
        </div>
      </div>
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
      const charCount = $('charCount');
      const back = $('back');
      const next = $('next');
      const submit = $('submit');
      const cancel = $('cancel');

      function applyTemplate(tpl, text) {
        return String(tpl).split('{{INPUT_CONTENT}}').join(text);
      }

      function updatePreview() {
        const selected = templates.find(item => item.name === selectedTemplateName);
        preview.textContent = selected ? applyTemplate(selected.template, data.question) : data.question;
      }

      function buildSubmitValue() {
        const raw = String(answer.value || '');
        const selected = templates.find(item => item.name === selectedTemplateName);
        return selected ? applyTemplate(selected.template, raw) : raw;
      }

      function updateComposer() {
        const text = String(answer.value || '');
        charCount.textContent = text.length + ' 字';
        submit.disabled = text.trim().length === 0;
      }

      function renderTemplateOptions() {
        templateSelect.innerHTML = '';
        if (templates.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = '当前没有可用模板';
          templateSelect.appendChild(option);
          templateSelect.disabled = true;
          updatePreview();
          return;
        }
        for (const template of templates) {
          const option = document.createElement('option');
          option.value = template.name;
          option.textContent = template.name;
          templateSelect.appendChild(option);
        }
        if (!templates.some(item => item.name === selectedTemplateName)) {
          selectedTemplateName = templates[0].name;
        }
        templateSelect.value = selectedTemplateName;
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
        updateComposer();
      }

      templateSelect?.addEventListener('change', () => {
        selectedTemplateName = templateSelect.value;
        updatePreview();
      });

      answer.addEventListener('input', () => {
        updateComposer();
      });

      answer.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !submit.disabled) {
          event.preventDefault();
          submit.click();
        }
      });

      back.addEventListener('click', () => {
        if (templates.length > 0) {
          step = 0;
          render();
        }
      });

      next.addEventListener('click', () => {
        step = 1;
        render();
      });

      cancel.addEventListener('click', () => {
        vscode.postMessage({
          type: 'cancel',
        });
      });

      submit.addEventListener('click', () => {
        vscode.postMessage({
          type: 'submit',
          value: buildSubmitValue(),
        });
      });

      renderTemplateOptions();
      updatePreview();
      updateComposer();
      render();
    </script>
  </div>
</body>
</html>`;

  return await new Promise<string>((resolve) => {
    let settled = false;

    const sub = panel.webview.onDidReceiveMessage(async (msg) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }

      if (msg.type === 'submit') {
        settled = true;
        resolve(String(msg.value ?? ''));
        panel.dispose();
        return;
      }

      if (msg.type === 'cancel') {
        settled = true;
        resolve('');
        panel.dispose();
      }
    });

    const disposeSub = panel.onDidDispose(() => {
      sub.dispose();
      disposeSub.dispose();
      if (!settled) {
        resolve('');
      }
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

  // Try to wire up upstream Human Clarification 1.1.8 features (webview + LM tools + HTTP server)
  let upstreamToolsRegistered = false;
  try {
    const hcRoot = path.join(context.extensionPath, 'justwe9517.human-clarification-1.1.8');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webviewModule = require(path.join(hcRoot, 'out', 'webviewManager.js')) as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const toolsModule = require(path.join(hcRoot, 'out', 'tools', 'toolRegistry.js')) as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serverModule = require(path.join(hcRoot, 'out', 'server', 'httpServer.js')) as any;

    const ClarificationWebviewManager = webviewModule?.ClarificationWebviewManager;
    const ToolRegistry = toolsModule?.ToolRegistry;
    const CopilotHttpServer = serverModule?.CopilotHttpServer;

    if (ClarificationWebviewManager && ToolRegistry) {
      const hcContextLike = { extensionPath: hcRoot, subscriptions: context.subscriptions };
      const webviewManager = new ClarificationWebviewManager(hcContextLike);
      const toolRegistry = new ToolRegistry(context, {
        webviewManager,
        outputChannel: output,
      });
      toolRegistry.registerAll();
      upstreamToolsRegistered = true;
      context.subscriptions.push({ dispose: () => toolRegistry.dispose() });
    }

    if (CopilotHttpServer) {
      const httpServer = new CopilotHttpServer(output);
      context.subscriptions.push(
        vscode.commands.registerCommand('humanClarification.server.start', async () => {
          await httpServer.start();
        }),
        vscode.commands.registerCommand('humanClarification.server.stop', async () => {
          await httpServer.stop();
        }),
        vscode.commands.registerCommand('humanClarification.server.toggle', async () => {
          await httpServer.toggle();
        }),
        { dispose: () => httpServer.dispose() }
      );

      // Fire and forget; no need to await here.
      void httpServer.autoStartIfConfigured();
    }
  } catch (err) {
    output.appendLine('Failed to initialize upstream Human Clarification features: ' + String(err));
  }

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

  const disposables: vscode.Disposable[] = [
    vscode.lm.registerTool<DkPlusAskInput>('dkplus_ask', {
      invoke: async (options, token) => {
        const result = await dkplusAskAi(context, options.input, token);
        output.appendLine('dkplus_ask invoked');
        return result;
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
    output,
  ];

  // If upstream tools failed to register (e.g. missing folder), fall back to
  // the built-in simple webview implementation for clarification/contact/feedback.
  if (!upstreamToolsRegistered) {
    disposables.push(
      vscode.lm.registerTool<ToolInputCommon>('request_user_clarification', {
        invoke: async (options, _token) => {
          const answer = await askUserFreeTextWebview(context, options.input, 'clarification');
          return asTextResult(answer);
        },
      }),
      vscode.lm.registerTool<ToolInputCommon>('request_contact_user', {
        invoke: async (options, _token) => {
          const answer = await askUserFreeTextWebview(context, options.input, 'contact');
          return asTextResult(answer);
        },
      }),
      vscode.lm.registerTool<ToolInputCommon>('request_user_feedback', {
        invoke: async (options, _token) => {
          const answer = await askUserFreeTextWebview(context, options.input, 'feedback');
          return asTextResult(answer);
        },
      })
    );
  }

  context.subscriptions.push(...disposables);
}

export function deactivate() { }
