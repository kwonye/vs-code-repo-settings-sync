import { describe, it, expect } from 'bun:test';
import * as crypto from 'crypto';

describe('Settings Merge Logic', () => {
  it('correctly performs two-way dictionary merge prioritizing local over remote', () => {
    const remoteSettings = {
      'editor.fontSize': 14,
      'editor.tabSize': 4,
      'workbench.colorTheme': 'Default Dark+'
    };

    const localSettings = {
      'editor.fontSize': 16, // modified locally
      'files.autoSave': 'afterDelay' // added locally
    };

    // Merge: remote base + local overrides
    const merged = { ...remoteSettings, ...localSettings };

    expect(merged['editor.fontSize']).toBe(16);
    expect(merged['editor.tabSize']).toBe(4);
    expect(merged['workbench.colorTheme']).toBe('Default Dark+');
    expect(merged['files.autoSave']).toBe('afterDelay');
  });

  it('correctly merges extension lists without duplicates', () => {
    const remoteExtensions = [
      { id: 'esbenp.prettier-vscode' },
      { id: 'dbaeumer.vscode-eslint' }
    ];

    const localExtensions = [
      { id: 'dbaeumer.vscode-eslint' },
      { id: 'golang.go' }
    ];

    const extMap = new Map<string, { id: string }>();
    for (const ext of [...remoteExtensions, ...localExtensions]) {
      extMap.set(ext.id.toLowerCase(), ext);
    }

    const merged = Array.from(extMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    expect(merged).toHaveLength(3);
    expect(merged.map((e) => e.id)).toEqual([
      'dbaeumer.vscode-eslint',
      'esbenp.prettier-vscode',
      'golang.go'
    ]);
  });

  it('computes stable deterministic hash for file sets regardless of map insertion order', () => {
    const computeHash = (files: Map<string, string>) => {
      const hash = crypto.createHash('sha256');
      const sortedKeys = Array.from(files.keys()).sort();
      for (const key of sortedKeys) {
        hash.update(key);
        hash.update(files.get(key) || '');
      }
      return hash.digest('hex');
    };

    const map1 = new Map<string, string>([
      ['settings.json', '{"a": 1}'],
      ['keybindings.json', '[]']
    ]);

    const map2 = new Map<string, string>([
      ['keybindings.json', '[]'],
      ['settings.json', '{"a": 1}']
    ]);

    expect(computeHash(map1)).toBe(computeHash(map2));
  });
});
