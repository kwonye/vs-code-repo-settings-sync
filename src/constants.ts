export const EXTENSION_ID = 'repo-settings-sync';
export const EXTENSION_NAME = 'Repo Settings Sync';
export const CONFIG_SECTION = 'repoSettingsSync';

export const COMMANDS = {
  TURN_ON_SYNC: 'repoSettingsSync.turnOnSync',
  TURN_OFF_SYNC: 'repoSettingsSync.turnOffSync',
  SYNC_NOW: 'repoSettingsSync.syncNow',
  DOWNLOAD_SETTINGS: 'repoSettingsSync.downloadSettings',
  UPLOAD_SETTINGS: 'repoSettingsSync.uploadSettings',
  SET_TOKEN: 'repoSettingsSync.setToken',
  SHOW_LOG: 'repoSettingsSync.showLog'
} as const;

export const SECRET_KEYS = {
  GITHUB_TOKEN: 'repoSettingsSync.githubToken'
} as const;

export const STORAGE_KEYS = {
  LAST_REMOTE_COMMIT_SHA: 'repoSettingsSync.lastRemoteCommitSha',
  LAST_SYNCED_TIMESTAMP: 'repoSettingsSync.lastSyncedTimestamp',
  LAST_SYNCED_FILES_HASH: 'repoSettingsSync.lastSyncedFilesHash',
  IS_SYNC_ENABLED: 'repoSettingsSync.isSyncEnabled'
} as const;

export const REPO_FILES = {
  SETTINGS: 'settings.json',
  KEYBINDINGS: 'keybindings.json',
  EXTENSIONS: 'extensions.json',
  SNIPPETS_DIR: 'snippets',
  METADATA: 'sync-meta.json'
} as const;

export const DEFAULT_BRANCH = 'main';
export const DEFAULT_POLL_INTERVAL_MINUTES = 5;
export const LOCAL_DEBOUNCE_DELAY_MS = 5000;
