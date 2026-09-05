import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

export class PathResolver {
  /**
   * Resolves the root VS Code User directory according to the operating system and editor flavor.
   */
  public static getUserDataDir(): string {
    const appName = vscode.env.appName.toLowerCase();
    let folderName = 'Code';

    if (appName.includes('insiders')) {
      folderName = 'Code - Insiders';
    } else if (appName.includes('codium')) {
      folderName = 'VSCodium';
    }

    const platform = process.platform;
    const home = os.homedir();

    if (platform === 'darwin') {
      return path.join(home, 'Library', 'Application Support', folderName, 'User');
    } else if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, folderName, 'User');
    } else {
      // Linux / Unix
      const configDir = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      return path.join(configDir, folderName, 'User');
    }
  }

  public static getSettingsPath(): string {
    return path.join(this.getUserDataDir(), 'settings.json');
  }

  public static getKeybindingsPath(): string {
    return path.join(this.getUserDataDir(), 'keybindings.json');
  }

  public static getSnippetsDir(): string {
    return path.join(this.getUserDataDir(), 'snippets');
  }
}
