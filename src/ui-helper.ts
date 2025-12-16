import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel('Human Clarification (UI Helper)');
    output.appendLine('UI Helper active');

    const getPromptsDisposable = vscode.commands.registerCommand('humanClarification.getLocalPrompts', async () => {
        try {
            const userDataPath = process.env.APPDATA ||
                (process.platform === 'darwin'
                    ? path.join(os.homedir(), 'Library', 'Application Support')
                    : path.join(os.homedir(), '.config'));

            const preferredFolder = (vscode && vscode.env && typeof vscode.env.appName === 'string' && vscode.env.appName.includes('Insiders'))
                ? 'Code - Insiders'
                : 'Code';

            const promptsDir = path.join(userDataPath, preferredFolder, 'User', 'prompts');

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

    context.subscriptions.push(getPromptsDisposable, readFileDisposable, output);
}

export function deactivate() {}
