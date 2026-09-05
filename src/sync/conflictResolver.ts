import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../ui/logger';

export type ConflictAction = 'keep_local' | 'take_remote' | 'manual_merge' | 'cancel';

export class ConflictResolver {
  private readonly logger = Logger.getInstance();
  private readonly storageUri: vscode.Uri;

  constructor(storageUri: vscode.Uri) {
    this.storageUri = storageUri;
  }

  /**
   * Prompts user to resolve a detected conflict between local and remote settings.
   */
  public async promptConflictResolution(itemLabel = 'Settings'): Promise<ConflictAction> {
    this.logger.warn(`Conflict detected for ${itemLabel}: both local and remote have changed.`);

    const selection = await vscode.window.showWarningMessage(
      `Repo Settings Sync: Conflict detected in ${itemLabel}. Remote repository and local files have both changed.`,
      { modal: true },
      'Keep Local (Overwrite Remote)',
      'Take Remote (Overwrite Local)',
      'Merge Manually (Diff View)'
    );

    if (selection === 'Keep Local (Overwrite Remote)') {
      return 'keep_local';
    } else if (selection === 'Take Remote (Overwrite Local)') {
      return 'take_remote';
    } else if (selection === 'Merge Manually (Diff View)') {
      return 'manual_merge';
    } else {
      return 'cancel';
    }
  }

  /**
   * Opens VS Code's side-by-side diff editor showing remote on the left and local on the right.
   */
  public async openDiffEditor(localFilePath: string, remoteContent: string, title = 'Remote ↔ Local'): Promise<void> {
    try {
      const tempDir = path.join(this.storageUri.fsPath, 'conflicts');
      await fs.mkdir(tempDir, { recursive: true });

      const fileName = path.basename(localFilePath);
      const remoteTempPath = path.join(tempDir, `remote_${Date.now()}_${fileName}`);
      await fs.writeFile(remoteTempPath, remoteContent, 'utf-8');

      const leftUri = vscode.Uri.file(remoteTempPath);
      const rightUri = vscode.Uri.file(localFilePath);

      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${title} (${fileName})`);
      vscode.window.showInformationMessage(
        'Inspect and edit the local file on the right. When finished, run "Repo Settings Sync: Sync Now".'
      );
    } catch (err) {
      this.logger.error('Failed to open diff editor for conflict', err);
      vscode.window.showErrorMessage('Failed to open diff editor.');
    }
  }
}
