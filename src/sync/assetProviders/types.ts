export interface SyncPayload {
  settings?: string;
  keybindings?: string;
  extensions?: string;
  snippets?: Record<string, string>; // filename -> content
  metadata?: string;
}

export interface SyncMetadata {
  lastSyncTimestamp: number;
  lastCommitSha: string;
  machineId: string;
  platform: string;
  vscodeVersion: string;
}
