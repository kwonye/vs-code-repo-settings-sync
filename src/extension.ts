import * as vscode from 'vscode';
import { COMMANDS, CONFIG_SECTION } from './constants';
import { AuthManager } from './auth/authManager';
import { StatusBarManager } from './ui/statusBar';
import { SyncManager } from './sync/syncManager';
import { Logger } from './ui/logger';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = Logger.getInstance();
  logger.info('Repo Settings Sync extension activating...');

  const authManager = new AuthManager(context.secrets);
  const statusBar = new StatusBarManager();
  const syncManager = new SyncManager(context, authManager, statusBar);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.TURN_ON_SYNC, async () => {
      await syncManager.turnOnSync();
    }),
    vscode.commands.registerCommand(COMMANDS.TURN_OFF_SYNC, async () => {
      await syncManager.turnOffSync();
    }),
    vscode.commands.registerCommand(COMMANDS.SYNC_NOW, async () => {
      await syncManager.syncNow();
    }),
    vscode.commands.registerCommand(COMMANDS.DOWNLOAD_SETTINGS, async () => {
      await syncManager.downloadSettings();
    }),
    vscode.commands.registerCommand(COMMANDS.UPLOAD_SETTINGS, async () => {
      await syncManager.uploadSettings();
    }),
    vscode.commands.registerCommand(COMMANDS.SET_TOKEN, async () => {
      await authManager.promptForToken();
    }),
    vscode.commands.registerCommand(COMMANDS.SHOW_LOG, () => {
      logger.show();
    }),
    vscode.commands.registerCommand('repoSettingsSync.showMenu', async () => {
      await statusBar.showQuickMenu();
    })
  );

  // Watch configuration updates
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        logger.info('Configuration changed, re-initializing sync manager.');
        syncManager.initialize().catch((err) => logger.error('Re-initialization error', err));
      }
    })
  );

  // Add services to subscriptions
  context.subscriptions.push(statusBar, syncManager, logger);

  // Initialize sync manager
  await syncManager.initialize();

  logger.info('Repo Settings Sync extension successfully activated.');
}

export function deactivate(): void {
  const logger = Logger.getInstance();
  logger.info('Repo Settings Sync extension deactivating.');
}
