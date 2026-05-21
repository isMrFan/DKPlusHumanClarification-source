import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

function getUserPromptsDir(): string {
    const userDataPath = process.env.APPDATA ||
        (process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support')
            : path.join(os.homedir(), '.config'));

    const preferredFolder = (vscode && vscode.env && typeof vscode.env.appName === 'string' && vscode.env.appName.includes('Insiders'))
        ? 'Code - Insiders'
        : 'Code';

    return path.join(userDataPath, preferredFolder, 'User', 'prompts');
}

function getWorkspaceReportsDir(context: vscode.ExtensionContext): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return folder ? vscode.Uri.joinPath(folder, '.hc') : vscode.Uri.joinPath(context.globalStorageUri, '.hc');
}

async function revealUri(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('revealFileInOS', uri);
}

async function ensureFolderAndReveal(folderPath: string): Promise<void> {
    await fs.promises.mkdir(folderPath, { recursive: true });
    await revealUri(vscode.Uri.file(folderPath));
}

function getSamplePromptsDir(context: vscode.ExtensionContext): string {
    return path.join(context.extensionPath, 'sample-prompts');
}

async function getSetupStatus(context: vscode.ExtensionContext): Promise<{
    promptsDir: string;
    promptsDirExists: boolean;
    missingSampleFiles: string[];
    hasPrincipleAgent: boolean;
}> {
    const promptsDir = getUserPromptsDir();
    const samplePromptsDir = getSamplePromptsDir(context);
    const promptsDirExists = fs.existsSync(promptsDir);
    const sampleFiles = fs.existsSync(samplePromptsDir)
        ? (await fs.promises.readdir(samplePromptsDir)).filter(file => file.endsWith('.prompt.md') || file.endsWith('.agent.md'))
        : [];
    const existingFiles = promptsDirExists ? new Set(await fs.promises.readdir(promptsDir)) : new Set<string>();
    const missingSampleFiles = sampleFiles.filter(file => !existingFiles.has(file));

    return {
        promptsDir,
        promptsDirExists,
        missingSampleFiles,
        hasPrincipleAgent: existingFiles.has('Principle.agent.md')
    };
}

async function copySamplePrompts(
    context: vscode.ExtensionContext,
    options?: { overwrite?: boolean }
): Promise<{ copied: number; total: number; }> {
    const promptsDir = getUserPromptsDir();
    const samplePromptsDir = getSamplePromptsDir(context);
    await fs.promises.mkdir(promptsDir, { recursive: true });

    if (!fs.existsSync(samplePromptsDir)) {
        return { copied: 0, total: 0 };
    }

    const sampleFiles = (await fs.promises.readdir(samplePromptsDir)).filter(file => file.endsWith('.prompt.md') || file.endsWith('.agent.md') || file === 'settings.json');
    let copied = 0;
    for (const file of sampleFiles) {
        const target = path.join(promptsDir, file);
        if (!options?.overwrite && fs.existsSync(target)) {
            continue;
        }

        await fs.promises.copyFile(path.join(samplePromptsDir, file), target);
        copied += 1;
    }
    return { copied, total: sampleFiles.length };
}

async function ensureFirstRunBootstrap(context: vscode.ExtensionContext): Promise<{ copied: number; total: number; }> {
    const key = 'humanClarification.bootstrap.version';
    const version = '0.8.0';
    if (context.globalState.get<string>(key) === version) {
        return { copied: 0, total: 0 };
    }

    const result = await copySamplePrompts(context, { overwrite: false });
    await context.globalState.update(key, version);
    return result;
}

async function showOnboarding(context: vscode.ExtensionContext): Promise<void> {
    const key = 'humanClarification.onboarding.version';
    const version = '0.8.0';
    if (context.globalState.get<string>(key) === version) {
        return;
    }

    const bootstrap = await ensureFirstRunBootstrap(context);

    const message = bootstrap.total > 0
        ? (bootstrap.copied > 0
            ? `DKPlus 已就绪，已自动复制 ${bootstrap.copied} 个示例文件到用户 Prompt 目录。`
            : 'DKPlus 已就绪，所需示例文件已经在用户 Prompt 目录中。')
        : 'DKPlus 已就绪。';

    const action = await vscode.window.showInformationMessage(
        message,
        '打开快速入口',
        '打开 Prompt 目录',
        '稍后'
    );

    if (action === '打开快速入口') {
        await vscode.commands.executeCommand('humanClarification.quickAccess');
    }

    if (action === '打开 Prompt 目录') {
        await vscode.commands.executeCommand('humanClarification.openPromptsFolder');
    }

    await context.globalState.update(key, version);
}

export function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel('Human Clarification (UI Helper)');
    output.appendLine('UI Helper active');

    const getPromptsDisposable = vscode.commands.registerCommand('humanClarification.getLocalPrompts', async () => {
        try {
            const promptsDir = getUserPromptsDir();

            if (!fs.existsSync(promptsDir)) {
                return [];
            }

            const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.prompt.md'));

            const results = files.map(f => ({
                name: f.replace('.prompt.md', ''),
                fullPath: path.join(promptsDir, f),
                relativePath: `~/prompts/${f}`,
                source: 'user'
            }));

            return results;
        } catch (err) {
            output.appendLine('Error reading local prompts: ' + String(err));
            return [];
        }
    });

    const readFileDisposable = vscode.commands.registerCommand('humanClarification.readLocalFile', async (filePath: string) => {
        try {
            if (!filePath) {
                output.appendLine('readLocalFile called with empty filePath');
                return '';
            }

            output.appendLine(`Reading local file: ${filePath}`);

            if (!fs.existsSync(filePath)) {
                output.appendLine(`File not found: ${filePath}`);
                return '';
            }

            const content = fs.readFileSync(filePath, 'utf8');
            output.appendLine(`Successfully read ${content.length} characters from ${filePath}`);
            return content;
        } catch (err) {
            output.appendLine('Error reading local file: ' + String(err));
            return '';
        }
    });

    const openSamplePromptsDisposable = vscode.commands.registerCommand('humanClarification.openSamplePrompts', async () => {
        const samplePromptsUri = vscode.Uri.joinPath(context.extensionUri, 'sample-prompts');
        await revealUri(samplePromptsUri);
    });

    const openReportsFolderDisposable = vscode.commands.registerCommand('humanClarification.openReportsFolder', async () => {
        const reportsUri = getWorkspaceReportsDir(context);
        await vscode.workspace.fs.createDirectory(reportsUri);
        await revealUri(reportsUri);
    });

    const openPromptsFolderDisposable = vscode.commands.registerCommand('humanClarification.openPromptsFolder', async () => {
        await ensureFolderAndReveal(getUserPromptsDir());
    });

    const copySamplePromptsDisposable = vscode.commands.registerCommand('humanClarification.copySamplePrompts', async () => {
        const result = await copySamplePrompts(context, { overwrite: true });
        vscode.window.showInformationMessage(`已复制 ${result.copied} 个示例文件到用户 Prompt 目录`);
    });

    const onboardingDisposable = vscode.commands.registerCommand('humanClarification.onboarding', async () => {
        const status = await getSetupStatus(context);
        const picked = await vscode.window.showQuickPick([
            { label: '复制 sample-prompts 到用户目录', description: status.missingSampleFiles.length > 0 ? `还缺少 ${status.missingSampleFiles.length} 个示例文件` : '示例文件已齐全，可重复覆盖更新' },
            { label: '打开用户 Prompt 目录', description: status.promptsDirExists ? '用户 Prompt 目录已存在' : '当前目录还不存在，打开时会自动创建' },
            { label: '打开内置 Sample Prompts', description: status.hasPrincipleAgent ? 'Principle.agent.md 已就绪' : 'Principle.agent.md 还未复制到用户目录' },
            { label: '复制一条可直接使用的 @dkplus 指令', description: '复制到剪贴板后即可粘贴到 Copilot Chat' },
            { label: '打开 DKPlus 快速入口', description: '查看扩展提供的常用入口' },
        ], {
            title: `DKPlus 首次使用引导${status.hasPrincipleAgent ? ' · agent 已就绪' : ' · agent 待复制'}`,
            placeHolder: '选择一步先做，完成后就能更顺手地开始使用',
        });

        if (!picked) {
            return;
        }

        if (picked.label === '复制 sample-prompts 到用户目录') {
            await vscode.commands.executeCommand('humanClarification.copySamplePrompts');
            return;
        }

        if (picked.label === '打开用户 Prompt 目录') {
            await vscode.commands.executeCommand('humanClarification.openPromptsFolder');
            return;
        }

        if (picked.label === '打开内置 Sample Prompts') {
            await vscode.commands.executeCommand('humanClarification.openSamplePrompts');
            return;
        }

        if (picked.label === '打开 DKPlus 快速入口') {
            await vscode.commands.executeCommand('humanClarification.quickAccess');
            return;
        }

        const snippet = '@dkplus #tool:dkplus.dkplushumanclarification/requestUserClarification 你希望输入输出格式是什么？';
        await vscode.env.clipboard.writeText(snippet);
        vscode.window.showInformationMessage('已复制一条可直接使用的 @dkplus 指令');
    });

    const quickAccessDisposable = vscode.commands.registerCommand('humanClarification.quickAccess', async () => {
        const status = await getSetupStatus(context);
        const picked = await vscode.window.showQuickPick([
            { label: '首次使用引导', description: status.hasPrincipleAgent ? 'sample-prompts 已基本就绪' : '建议先完成 prompts/agent 设置' },
            { label: '复制 sample-prompts 到用户目录', description: status.missingSampleFiles.length > 0 ? `还缺少 ${status.missingSampleFiles.length} 个示例文件` : '重新同步示例文件到用户目录' },
            { label: '打开示例 Prompts', description: '查看扩展内置 sample-prompts' },
            { label: '打开用户 Prompt 目录', description: '查看或创建你的 Code/User/prompts 目录' },
            { label: '打开报告目录', description: '查看 .hc 报告文件夹' },
            { label: '浏览本地 Prompt Files', description: '列出用户 prompts 目录中的 .prompt.md 文件' },
            { label: '复制反馈工具示例', description: '把 @dkplus 调用示例复制到剪贴板' },
        ], {
            title: 'DKPlus 快速入口',
            placeHolder: '选择一个常用操作',
        });

        if (!picked) {
            return;
        }

        if (picked.label === '打开示例 Prompts') {
            await vscode.commands.executeCommand('humanClarification.openSamplePrompts');
            return;
        }

        if (picked.label === '复制 sample-prompts 到用户目录') {
            await vscode.commands.executeCommand('humanClarification.copySamplePrompts');
            return;
        }

        if (picked.label === '首次使用引导') {
            await vscode.commands.executeCommand('humanClarification.onboarding');
            return;
        }

        if (picked.label === '打开用户 Prompt 目录') {
            await vscode.commands.executeCommand('humanClarification.openPromptsFolder');
            return;
        }

        if (picked.label === '打开报告目录') {
            await vscode.commands.executeCommand('humanClarification.openReportsFolder');
            return;
        }

        if (picked.label === '复制反馈工具示例') {
            const snippet = '@dkplus #tool:dkplus.dkplushumanclarification/requestUserFeedback 请评价一下当前实现是否符合预期？';
            await vscode.env.clipboard.writeText(snippet);
            vscode.window.showInformationMessage('已复制 DKPlus 工具示例到剪贴板');
            return;
        }

        const prompts = await vscode.commands.executeCommand<Array<{ name: string; fullPath: string }>>('humanClarification.getLocalPrompts');
        if (!prompts || prompts.length === 0) {
            vscode.window.showInformationMessage('当前没有发现本地 Prompt Files');
            return;
        }

        const filePicked = await vscode.window.showQuickPick(
            prompts.map(item => ({ label: item.name, description: item.fullPath })),
            { title: '选择一个本地 Prompt File', placeHolder: '打开文件进行查看' }
        );

        if (!filePicked?.description) {
            return;
        }

        const doc = await vscode.workspace.openTextDocument(filePicked.description);
        await vscode.window.showTextDocument(doc, { preview: false });
    });

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    statusBar.name = 'DKPlus';
    statusBar.text = '$(sparkle) DKPlus';
    statusBar.tooltip = 'DKPlus 快速入口：示例 prompts、报告目录、Prompt Files、工具调用示例';
    statusBar.command = 'humanClarification.quickAccess';
    statusBar.show();

    void showOnboarding(context);

    context.subscriptions.push(
        getPromptsDisposable,
        readFileDisposable,
        openSamplePromptsDisposable,
        openReportsFolderDisposable,
        openPromptsFolderDisposable,
        copySamplePromptsDisposable,
        onboardingDisposable,
        quickAccessDisposable,
        statusBar,
        output
    );
}

export function deactivate() { }
