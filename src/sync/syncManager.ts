import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { AuthManager } from '../auth/authManager';
import { GitHubClient } from '../github/githubClient';
import { PathResolver } from './pathResolver';
import { SettingsProvider } from './assetProviders/settingsProvider';
import { KeybindingsProvider } from './assetProviders/keybindingsProvider';
import { SnippetsProvider } from './assetProviders/snippetsProvider';
import { ExtensionsProvider } from './assetProviders/extensionsProvider';
import { ConflictResolver } from './conflictResolver';
import { StatusBarManager } from '../ui/statusBar';
import { Logger } from '../ui/logger';
import {
  CONFIG_SECTION,
  DEFAULT_BRANCH,
  DEFAULT_POLL_INTERVAL_MINUTES,
  LOCAL_DEBOUNCE_DELAY_MS,
  REPO_FILES,
  STORAGE_KEYS
} from '../constants';

export class SyncManager implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly authManager: AuthManager;
  private readonly statusBar: StatusBarManager;
  private readonly conflictResolver: ConflictResolver;
  private readonly logger = Logger.getInstance();

  private readonly settingsProvider = new SettingsProvider();
  private readonly keybindingsProvider = new KeybindingsProvider();
  private readonly snippetsProvider = new SnippetsProvider();
  private readonly extensionsProvider = new ExtensionsProvider();

  private pollTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private disposables: vscode.Disposable[] = [];
  private isSyncing = false;

  constructor(
    context: vscode.ExtensionContext,
    authManager: AuthManager,
    statusBar: StatusBarManager
  ) {
    this.context = context;
    this.authManager = authManager;
    this.statusBar = statusBar;
    this.conflictResolver = new ConflictResolver(context.globalStorageUri);
  }

  public async initialize(): Promise<void> {
    const isEnabled = this.context.globalState.get<boolean>(STORAGE_KEYS.IS_SYNC_ENABLED, false);
    if (isEnabled) {
      const lastSyncedTime = this.context.globalState.get<number>(STORAGE_KEYS.LAST_SYNCED_TIMESTAMP);
      this.statusBar.setStatus('idle', lastSyncedTime ? new Date(lastSyncedTime) : undefined);
      this.startWatchers();
      this.startPolling();

      // Trigger initial sync check in background
      this.syncNow().catch((err) => this.logger.error('Startup sync failed', err));
    } else {
      this.statusBar.setStatus('disabled');
    }
  }

  /**
   * Interactive wizard to turn on Settings Sync.
   */
  public async turnOnSync(): Promise<void> {
    // 1. Authenticate
    let auth = await this.authManager.getSession();
    if (!auth) {
      auth = await this.authManager.promptLogin();
      if (!auth) {
        return;
      }
    }

    const githubClient = new GitHubClient(auth.octokit);

    // 2. Select / input repository
    const defaultRepoName = 'vscode-settings';
    const suggestedFullName = `${auth.username}/${defaultRepoName}`;

    const repoInput = await vscode.window.showInputBox({
      title: 'Target GitHub Repository',
      prompt: 'Enter the repository in owner/repo format. If it does not exist, a private repository will be created.',
      value: suggestedFullName,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || !value.includes('/')) {
          return 'Repository must be in "owner/repo" format (e.g. username/vscode-settings)';
        }
        return null;
      }
    });

    if (!repoInput) {
      return;
    }

    const [owner, repo] = repoInput.split('/');
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const branch = config.get<string>('branch', DEFAULT_BRANCH);

    // 3. Check if repo exists
    const exists = await githubClient.checkRepoExists(owner, repo);
    if (!exists) {
      const createConfirm = await vscode.window.showInformationMessage(
        `Repository ${owner}/${repo} does not exist. Would you like to create it as a private repository?`,
        'Create Private Repo',
        'Cancel'
      );
      if (createConfirm !== 'Create Private Repo') {
        return;
      }

      await githubClient.createPrivateRepo(repo, 'VS Code Settings Sync repository');
      vscode.window.showInformationMessage(`Created private repository https://github.com/${owner}/${repo}`);
    }

    // 4. Save configuration
    await config.update('repository', `${owner}/${repo}`, vscode.ConfigurationTarget.Global);
    await this.context.globalState.update(STORAGE_KEYS.IS_SYNC_ENABLED, true);

    // 5. Check if remote repo has existing settings
    const remoteFiles = await githubClient.fetchAllFiles(owner, repo, branch);
    const hasRemoteSettings = remoteFiles.size > 0 && remoteFiles.has(REPO_FILES.SETTINGS);

    if (hasRemoteSettings) {
      const action = await vscode.window.showInformationMessage(
        `Repository ${owner}/${repo} already contains settings. What would you like to do?`,
        { modal: true },
        'Merge (Combine Local & Remote)',
        'Replace Local (Download from GitHub)',
        'Replace Remote (Upload from this device)'
      );

      if (action === 'Replace Local (Download from GitHub)') {
        await this.downloadSettings();
      } else if (action === 'Replace Remote (Upload from this device)') {
        await this.uploadSettings();
      } else if (action === 'Merge (Combine Local & Remote)') {
        await this.performMerge(remoteFiles, githubClient, owner, repo, branch);
      } else {
        return;
      }
    } else {
      // First upload
      await this.uploadSettings();
    }

    this.startWatchers();
    this.startPolling();
    vscode.window.showInformationMessage(`Repo Settings Sync is now active with ${owner}/${repo}!`);
  }

  /**
   * Turns off sync and stops all watchers.
   */
  public async turnOffSync(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to turn off Repo Settings Sync on this device?',
      'Turn Off',
      'Cancel'
    );

    if (confirm !== 'Turn Off') {
      return;
    }

    this.stopWatchers();
    this.stopPolling();
    await this.context.globalState.update(STORAGE_KEYS.IS_SYNC_ENABLED, false);
    this.statusBar.setStatus('disabled');
    vscode.window.showInformationMessage('Repo Settings Sync has been turned off.');
  }

  /**
   * Triggers two-way synchronization.
   */
  public async syncNow(): Promise<void> {
    if (this.isSyncing) {
      this.logger.info('Sync already in progress, skipping request.');
      return;
    }

    const isEnabled = this.context.globalState.get<boolean>(STORAGE_KEYS.IS_SYNC_ENABLED, false);
    if (!isEnabled) {
      return;
    }

    const auth = await this.authManager.getSession();
    if (!auth) {
      this.statusBar.setStatus('error');
      this.logger.error('No authenticated GitHub session available.');
      return;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const repoFullName = config.get<string>('repository');
    const branch = config.get<string>('branch', DEFAULT_BRANCH);

    if (!repoFullName || !repoFullName.includes('/')) {
      this.statusBar.setStatus('error');
      this.logger.error('Invalid repository configuration.');
      return;
    }

    const [owner, repo] = repoFullName.split('/');
    const githubClient = new GitHubClient(auth.octokit);

    this.isSyncing = true;
    this.statusBar.setStatus('syncing');

    try {
      const remoteHeadSha = await githubClient.getLatestCommitSha(owner, repo, branch);
      const lastKnownSha = this.context.globalState.get<string>(STORAGE_KEYS.LAST_REMOTE_COMMIT_SHA);
      const lastFilesHash = this.context.globalState.get<string>(STORAGE_KEYS.LAST_SYNCED_FILES_HASH);

      const localFiles = await this.collectLocalFiles();
      const currentLocalHash = this.computeHash(localFiles);

      const remoteChanged = remoteHeadSha !== null && remoteHeadSha !== lastKnownSha;
      const localChanged = lastFilesHash !== undefined && currentLocalHash !== lastFilesHash;

      this.logger.info(`Sync check: remoteChanged=${remoteChanged}, localChanged=${localChanged}`);

      if (remoteChanged && localChanged) {
        // Conflict!
        this.statusBar.setStatus('conflict');
        const resolution = await this.conflictResolver.promptConflictResolution('Settings');

        if (resolution === 'keep_local') {
          await this.executeUpload(githubClient, owner, repo, branch, localFiles, currentLocalHash);
        } else if (resolution === 'take_remote') {
          await this.executeDownload(githubClient, owner, repo, branch, remoteHeadSha);
        } else if (resolution === 'manual_merge') {
          const remoteFiles = await githubClient.fetchAllFiles(owner, repo, branch);
          const remoteSettings = remoteFiles.get(REPO_FILES.SETTINGS) || '{}';
          await this.conflictResolver.openDiffEditor(PathResolver.getSettingsPath(), remoteSettings);
          return;
        } else {
          // Cancelled
          return;
        }
      } else if (remoteChanged) {
        // Only remote changed, pull down
        await this.executeDownload(githubClient, owner, repo, branch, remoteHeadSha);
      } else if (localChanged || !lastKnownSha) {
        // Only local changed (or initial state), push up
        await this.executeUpload(githubClient, owner, repo, branch, localFiles, currentLocalHash);
      } else {
        // Nothing changed
        this.logger.info('No changes detected locally or remotely.');
      }

      const now = new Date();
      await this.context.globalState.update(STORAGE_KEYS.LAST_SYNCED_TIMESTAMP, now.getTime());
      this.statusBar.setStatus('idle', now);
    } catch (err) {
      this.statusBar.setStatus('error');
      this.logger.error('Sync failed', err);
      vscode.window.showErrorMessage(`Repo Settings Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Force download settings from remote and overwrite local files.
   */
  public async downloadSettings(): Promise<void> {
    const auth = await this.authManager.getSession();
    if (!auth) {
      vscode.window.showErrorMessage('Not authenticated with GitHub.');
      return;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const repoFullName = config.get<string>('repository');
    const branch = config.get<string>('branch', DEFAULT_BRANCH);
    if (!repoFullName) {
      vscode.window.showErrorMessage('No repository configured.');
      return;
    }

    const [owner, repo] = repoFullName.split('/');
    const githubClient = new GitHubClient(auth.octokit);

    this.statusBar.setStatus('syncing');
    try {
      const remoteHeadSha = await githubClient.getLatestCommitSha(owner, repo, branch);
      if (!remoteHeadSha) {
        vscode.window.showWarningMessage('Remote repository is empty.');
        this.statusBar.setStatus('idle');
        return;
      }

      await this.executeDownload(githubClient, owner, repo, branch, remoteHeadSha);
      const now = new Date();
      await this.context.globalState.update(STORAGE_KEYS.LAST_SYNCED_TIMESTAMP, now.getTime());
      this.statusBar.setStatus('idle', now);
      vscode.window.showInformationMessage('Successfully downloaded settings from GitHub.');
    } catch (err) {
      this.statusBar.setStatus('error');
      this.logger.error('Download settings failed', err);
      vscode.window.showErrorMessage('Failed to download settings.');
    }
  }

  /**
   * Force upload local settings and overwrite remote repository.
   */
  public async uploadSettings(): Promise<void> {
    const auth = await this.authManager.getSession();
    if (!auth) {
      vscode.window.showErrorMessage('Not authenticated with GitHub.');
      return;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const repoFullName = config.get<string>('repository');
    const branch = config.get<string>('branch', DEFAULT_BRANCH);
    if (!repoFullName) {
      vscode.window.showErrorMessage('No repository configured.');
      return;
    }

    const [owner, repo] = repoFullName.split('/');
    const githubClient = new GitHubClient(auth.octokit);

    this.statusBar.setStatus('syncing');
    try {
      const localFiles = await this.collectLocalFiles();
      const localHash = this.computeHash(localFiles);
      await this.executeUpload(githubClient, owner, repo, branch, localFiles, localHash);

      const now = new Date();
      await this.context.globalState.update(STORAGE_KEYS.LAST_SYNCED_TIMESTAMP, now.getTime());
      this.statusBar.setStatus('idle', now);
      vscode.window.showInformationMessage('Successfully uploaded local settings to GitHub.');
    } catch (err) {
      this.statusBar.setStatus('error');
      this.logger.error('Upload settings failed', err);
      vscode.window.showErrorMessage('Failed to upload settings.');
    }
  }

  private async executeDownload(
    githubClient: GitHubClient,
    owner: string,
    repo: string,
    branch: string,
    commitSha: string
  ): Promise<void> {
    this.logger.info(`Executing download from ${owner}/${repo}@${branch} (SHA: ${commitSha})`);
    const remoteFiles = await githubClient.fetchAllFiles(owner, repo, branch);
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    // 1. Settings
    const settingsContent = remoteFiles.get(REPO_FILES.SETTINGS);
    if (settingsContent) {
      await this.settingsProvider.writeLocal(settingsContent);
    }

    // 2. Keybindings
    if (config.get<boolean>('syncKeybindings', true)) {
      const keybindingsContent = remoteFiles.get(REPO_FILES.KEYBINDINGS);
      if (keybindingsContent) {
        await this.keybindingsProvider.writeLocal(keybindingsContent);
      }
    }

    // 3. Snippets
    if (config.get<boolean>('syncSnippets', true)) {
      const snippets: Record<string, string> = {};
      for (const [filePath, content] of remoteFiles.entries()) {
        if (filePath.startsWith('snippets/')) {
          const filename = filePath.replace('snippets/', '');
          snippets[filename] = content;
        }
      }
      if (Object.keys(snippets).length > 0) {
        await this.snippetsProvider.writeLocal(snippets);
      }
    }

    // 4. Extensions
    if (config.get<boolean>('syncExtensions', true)) {
      const extContent = remoteFiles.get(REPO_FILES.EXTENSIONS);
      if (extContent) {
        await this.extensionsProvider.syncMissingExtensions(extContent);
      }
    }

    // Record state
    const localFiles = await this.collectLocalFiles();
    const localHash = this.computeHash(localFiles);
    await this.context.globalState.update(STORAGE_KEYS.LAST_REMOTE_COMMIT_SHA, commitSha);
    await this.context.globalState.update(STORAGE_KEYS.LAST_SYNCED_FILES_HASH, localHash);
  }

  private async executeUpload(
    githubClient: GitHubClient,
    owner: string,
    repo: string,
    branch: string,
    localFiles: Map<string, string>,
    localHash: string
  ): Promise<void> {
    this.logger.info(`Executing upload to ${owner}/${repo}@${branch}`);

    // Add metadata file
    const metadata = {
      lastSyncTimestamp: Date.now(),
      machineId: vscode.env.machineId,
      platform: process.platform,
      vscodeVersion: vscode.version
    };
    localFiles.set(REPO_FILES.METADATA, JSON.stringify(metadata, null, 2));

    const commitMessage = `Sync settings from ${process.platform} (${vscode.env.machineId.substring(0, 8)})`;
    const newCommitSha = await githubClient.commitFiles(owner, repo, branch, localFiles, commitMessage);

    await this.context.globalState.update(STORAGE_KEYS.LAST_REMOTE_COMMIT_SHA, newCommitSha);
    await this.context.globalState.update(STORAGE_KEYS.LAST_SYNCED_FILES_HASH, localHash);
  }

  private async performMerge(
    remoteFiles: Map<string, string>,
    githubClient: GitHubClient,
    owner: string,
    repo: string,
    branch: string
  ): Promise<void> {
    this.logger.info('Performing initial 2-way merge of local and remote settings');
    const localFiles = await this.collectLocalFiles();

    // 1. Merge settings.json (shallow key merge: local keys take precedence if existing, remote adds new keys)
    const localSettingsStr = localFiles.get(REPO_FILES.SETTINGS) || '{}';
    const remoteSettingsStr = remoteFiles.get(REPO_FILES.SETTINGS) || '{}';
    try {
      const localJson = JSON.parse(localSettingsStr);
      const remoteJson = JSON.parse(remoteSettingsStr);
      const mergedJson = { ...remoteJson, ...localJson };
      const mergedSettingsStr = JSON.stringify(mergedJson, null, 2);
      await this.settingsProvider.writeLocal(mergedSettingsStr);
      localFiles.set(REPO_FILES.SETTINGS, mergedSettingsStr);
    } catch {
      this.logger.warn('Could not parse settings.json as JSON, keeping local version.');
    }

    // 2. Merge extensions (union of extensions)
    const localExtStr = localFiles.get(REPO_FILES.EXTENSIONS) || '[]';
    const remoteExtStr = remoteFiles.get(REPO_FILES.EXTENSIONS) || '[]';
    try {
      const localExtList: Array<{ id: string }> = JSON.parse(localExtStr);
      const remoteExtList: Array<{ id: string }> = JSON.parse(remoteExtStr);
      const extMap = new Map<string, { id: string }>();
      for (const e of [...remoteExtList, ...localExtList]) {
        extMap.set(e.id.toLowerCase(), e);
      }
      const mergedExtList = Array.from(extMap.values()).sort((a, b) => a.id.localeCompare(b.id));
      const mergedExtStr = JSON.stringify(mergedExtList, null, 2);
      localFiles.set(REPO_FILES.EXTENSIONS, mergedExtStr);
      await this.extensionsProvider.syncMissingExtensions(mergedExtStr);
    } catch {
      this.logger.warn('Could not merge extensions list, keeping local version.');
    }

    // 3. Merge snippets (remote snippets added to local if missing)
    for (const [filePath, content] of remoteFiles.entries()) {
      if (filePath.startsWith('snippets/') && !localFiles.has(filePath)) {
        localFiles.set(filePath, content);
      }
    }
    const snippetsToWrite: Record<string, string> = {};
    for (const [filePath, content] of localFiles.entries()) {
      if (filePath.startsWith('snippets/')) {
        snippetsToWrite[filePath.replace('snippets/', '')] = content;
      }
    }
    await this.snippetsProvider.writeLocal(snippetsToWrite);

    // Commit merged result to remote
    const localHash = this.computeHash(localFiles);
    await this.executeUpload(githubClient, owner, repo, branch, localFiles, localHash);
  }

  private async collectLocalFiles(): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    // Settings
    const settings = await this.settingsProvider.readLocal();
    if (settings !== null) {
      files.set(REPO_FILES.SETTINGS, settings);
    }

    // Keybindings
    if (config.get<boolean>('syncKeybindings', true)) {
      const keybindings = await this.keybindingsProvider.readLocal();
      if (keybindings !== null) {
        files.set(REPO_FILES.KEYBINDINGS, keybindings);
      }
    }

    // Snippets
    if (config.get<boolean>('syncSnippets', true)) {
      const snippets = await this.snippetsProvider.readLocal();
      for (const [name, content] of Object.entries(snippets)) {
        files.set(`snippets/${name}`, content);
      }
    }

    // Extensions
    if (config.get<boolean>('syncExtensions', true)) {
      const extensions = this.extensionsProvider.getSerializedInstalledExtensions();
      files.set(REPO_FILES.EXTENSIONS, extensions);
    }

    return files;
  }

  private computeHash(files: Map<string, string>): string {
    const hash = crypto.createHash('sha256');
    const sortedKeys = Array.from(files.keys()).sort();
    for (const key of sortedKeys) {
      hash.update(key);
      hash.update(files.get(key) || '');
    }
    return hash.digest('hex');
  }

  private startWatchers(): void {
    this.stopWatchers();
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    if (!config.get<boolean>('autoSync', true)) {
      return;
    }

    const userDataDir = PathResolver.getUserDataDir();
    const settingsPattern = new vscode.RelativePattern(userDataDir, 'settings.json');
    const keybindingsPattern = new vscode.RelativePattern(userDataDir, 'keybindings.json');
    const snippetsPattern = new vscode.RelativePattern(userDataDir, 'snippets/*.{json,code-snippets}');

    const watcher1 = vscode.workspace.createFileSystemWatcher(settingsPattern);
    const watcher2 = vscode.workspace.createFileSystemWatcher(keybindingsPattern);
    const watcher3 = vscode.workspace.createFileSystemWatcher(snippetsPattern);

    const onFileChange = () => this.triggerDebouncedSync();

    watcher1.onDidChange(onFileChange);
    watcher1.onDidCreate(onFileChange);
    watcher2.onDidChange(onFileChange);
    watcher2.onDidCreate(onFileChange);
    watcher3.onDidChange(onFileChange);
    watcher3.onDidCreate(onFileChange);
    watcher3.onDidDelete(onFileChange);

    this.fileWatchers.push(watcher1, watcher2, watcher3);

    // Watch extension installs / uninstalls
    const extSub = vscode.extensions.onDidChange(() => {
      this.logger.info('Extension change detected, scheduling sync.');
      this.triggerDebouncedSync();
    });
    this.disposables.push(extSub);

    this.logger.info('File system watchers started for local settings.');
  }

  private stopWatchers(): void {
    for (const watcher of this.fileWatchers) {
      watcher.dispose();
    }
    this.fileWatchers = [];
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private triggerDebouncedSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.logger.info('Debounce period elapsed, executing automatic sync.');
      this.syncNow().catch((err) => this.logger.error('Debounced sync failed', err));
    }, LOCAL_DEBOUNCE_DELAY_MS);
  }

  private startPolling(): void {
    this.stopPolling();
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const intervalMinutes = config.get<number>('syncIntervalMinutes', DEFAULT_POLL_INTERVAL_MINUTES);
    const intervalMs = Math.max(intervalMinutes, 1) * 60 * 1000;

    this.logger.info(`Starting background polling timer: every ${intervalMinutes} minute(s).`);
    this.pollTimer = setInterval(() => {
      this.syncNow().catch((err) => this.logger.error('Background poll sync failed', err));
    }, intervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  public dispose(): void {
    this.stopWatchers();
    this.stopPolling();
  }
}
