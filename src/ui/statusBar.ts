import * as vscode from 'vscode';
import { COMMANDS, EXTENSION_NAME } from '../constants';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflict' | 'disabled';

export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private lastSyncedTime: Date | null = null;
  private currentStatus: SyncStatus = 'disabled';

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'repoSettingsSync.showMenu';
    this.updateDisplay();
    this.item.show();
  }

  public setStatus(status: SyncStatus, lastSynced?: Date): void {
    this.currentStatus = status;
    if (lastSynced !== undefined) {
      this.lastSyncedTime = lastSynced;
    }
    this.updateDisplay();
  }

  public setLastSyncedTime(date: Date): void {
    this.lastSyncedTime = date;
    this.updateDisplay();
  }

  private updateDisplay(): void {
    switch (this.currentStatus) {
      case 'syncing':
        this.item.text = '$(sync~spin) Syncing Settings';
        this.item.tooltip = `${EXTENSION_NAME}: Synchronizing with GitHub...`;
        this.item.backgroundColor = undefined;
        break;
      case 'idle':
        this.item.text = '$(cloud-check) Settings Synced';
        const timeStr = this.lastSyncedTime ? this.getRelativeTimeString(this.lastSyncedTime) : 'recently';
        this.item.tooltip = `${EXTENSION_NAME}: Last synced ${timeStr}. Click for sync options.`;
        this.item.backgroundColor = undefined;
        break;
      case 'conflict':
        this.item.text = '$(warning) Sync Conflict';
        this.item.tooltip = `${EXTENSION_NAME}: Sync conflict detected. Click to resolve.`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'error':
        this.item.text = '$(error) Sync Error';
        this.item.tooltip = `${EXTENSION_NAME}: Sync failed. Click to view logs.`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      case 'disabled':
      default:
        this.item.text = '$(cloud-slash) Settings Sync Off';
        this.item.tooltip = `${EXTENSION_NAME}: Settings Sync is turned off. Click to configure.`;
        this.item.backgroundColor = undefined;
        break;
    }
  }

  private getRelativeTimeString(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      return 'just now';
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    return date.toLocaleDateString();
  }

  public async showQuickMenu(): Promise<void> {
    const isEnabled = this.currentStatus !== 'disabled';
    const items: vscode.QuickPickItem[] = [];

    if (!isEnabled) {
      items.push({
        label: '$(cloud-upload) Turn on Settings Sync...',
        description: 'Sign in to GitHub and configure sync repository',
        detail: COMMANDS.TURN_ON_SYNC
      });
    } else {
      items.push(
        {
          label: '$(sync) Sync Now',
          description: 'Synchronize changes with GitHub repository',
          detail: COMMANDS.SYNC_NOW
        },
        {
          label: '$(cloud-download) Download Settings (Replace Local)',
          description: 'Overwrite local configuration with remote repository',
          detail: COMMANDS.DOWNLOAD_SETTINGS
        },
        {
          label: '$(cloud-upload) Upload Settings (Replace Remote)',
          description: 'Overwrite remote repository with local configuration',
          detail: COMMANDS.UPLOAD_SETTINGS
        },
        {
          label: '$(key) Update GitHub Token',
          description: 'Change or enter a new GitHub Personal Access Token',
          detail: COMMANDS.SET_TOKEN
        },
        {
          label: '$(cloud-slash) Turn off Settings Sync',
          description: 'Stop synchronizing settings to GitHub',
          detail: COMMANDS.TURN_OFF_SYNC
        }
      );
    }

    items.push({
      label: '$(output) Show Sync Log',
      description: 'View extension output and diagnostic logs',
      detail: COMMANDS.SHOW_LOG
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${EXTENSION_NAME} Menu`
    });

    if (selected && selected.detail) {
      await vscode.commands.executeCommand(selected.detail);
    }
  }

  public dispose(): void {
    this.item.dispose();
  }
}
