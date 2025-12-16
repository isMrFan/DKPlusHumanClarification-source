import * as vscode from 'vscode';

import { activate as activateHc, deactivate as deactivateHc } from './hc-extension';
import { activate as activateUi, deactivate as deactivateUi } from './ui-helper';

// Wrapper activate that composes:
// 1) Human Clarification (original extension logic, compiled JS)
// 2) UI Helper commands (local prompt reader)
export async function activate(context: vscode.ExtensionContext) {
  await Promise.resolve(activateHc(context));
  await Promise.resolve(activateUi(context));
}

export function deactivate() {
  try { deactivateHc(); } catch { }
  try { deactivateUi(); } catch { }
}
