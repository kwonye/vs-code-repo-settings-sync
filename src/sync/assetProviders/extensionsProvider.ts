import * as vscode from 'vscode';
import { Logger } from '../../ui/logger';

export interface ExtensionEntry {
  id: string;
  version?: string;
}

export class ExtensionsProvider {
  private readonly logger = Logger.getInstance();

  public getInstalledUserExtensions(): ExtensionEntry[] {
    const userExtensions: ExtensionEntry[] = [];

    for (const ext of vscode.extensions.all) {
      const packageJSON = ext.packageJSON;
      const isBuiltin = packageJSON ? packageJSON.isBuiltin === true : false;
      const isSelf = ext.id.toLowerCase() === 'kwonye.repo-settings-sync';

      if (!isBuiltin && !isSelf) {
        userExtensions.push({
          id: ext.id.toLowerCase(),
          version: packageJSON?.version
        });
      }
    }

    // Sort by id for stable diffs
    userExtensions.sort((a, b) => a.id.localeCompare(b.id));
    return userExtensions;
  }

  public getSerializedInstalledExtensions(): string {
    const list = this.getInstalledUserExtensions();
    return JSON.stringify(list, null, 2);
  }

  /**
   * Installs any extensions present in remote list that are not yet installed locally.
   */
  public async syncMissingExtensions(remoteJson: string): Promise<void> {
    try {
      const remoteList: Array<ExtensionEntry | string> = JSON.parse(remoteJson);
      const installed = new Set(this.getInstalledUserExtensions().map((e) => e.id.toLowerCase()));

      for (const item of remoteList) {
        const extId = typeof item === 'string' ? item.toLowerCase() : item.id.toLowerCase();
        if (!installed.has(extId)) {
          this.logger.info(`Auto-installing missing extension in background: ${extId}`);
          try {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', extId);
          } catch (installErr) {
            this.logger.warn(`Could not auto-install extension ${extId}`, installErr);
          }
        }
      }
    } catch (err) {
      this.logger.error('Failed to parse remote extensions list for sync', err);
    }
  }
}
