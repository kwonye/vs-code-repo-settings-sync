import { describe, it, expect } from 'bun:test';
import { COMMANDS, REPO_FILES, CONFIG_SECTION, DEFAULT_POLL_INTERVAL_MINUTES } from '../src/constants';

describe('Constants', () => {
  it('has all expected command identifiers', () => {
    expect(COMMANDS.TURN_ON_SYNC).toBe('repoSettingsSync.turnOnSync');
    expect(COMMANDS.TURN_OFF_SYNC).toBe('repoSettingsSync.turnOffSync');
    expect(COMMANDS.SYNC_NOW).toBe('repoSettingsSync.syncNow');
    expect(COMMANDS.DOWNLOAD_SETTINGS).toBe('repoSettingsSync.downloadSettings');
    expect(COMMANDS.UPLOAD_SETTINGS).toBe('repoSettingsSync.uploadSettings');
    expect(COMMANDS.SET_TOKEN).toBe('repoSettingsSync.setToken');
    expect(COMMANDS.SHOW_LOG).toBe('repoSettingsSync.showLog');
  });

  it('defines correct repository file layout names', () => {
    expect(REPO_FILES.SETTINGS).toBe('settings.json');
    expect(REPO_FILES.KEYBINDINGS).toBe('keybindings.json');
    expect(REPO_FILES.EXTENSIONS).toBe('extensions.json');
    expect(REPO_FILES.SNIPPETS_DIR).toBe('snippets');
    expect(REPO_FILES.METADATA).toBe('sync-meta.json');
  });

  it('has correct configuration section and defaults', () => {
    expect(CONFIG_SECTION).toBe('repoSettingsSync');
    expect(DEFAULT_POLL_INTERVAL_MINUTES).toBe(5);
  });
});
