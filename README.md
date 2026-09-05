# Repo Settings Sync

[![CI](https://github.com/kwonye/vs-code-repo-settings-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/kwonye/vs-code-repo-settings-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Repo Settings Sync** seamlessly synchronizes your VS Code configuration to any GitHub repository. It gives you complete ownership and git version control over your settings, keybindings, snippets, and extensions while matching the seamless background experience of VS Code's built-in Settings Sync.

---

## Features

- 🔄 **Automatic Background Sync**: Debounces and syncs local changes automatically, and periodically pulls remote updates.
- 🛡️ **Smart Conflict Resolution**: When both your local configuration and the remote repository have changed, choose **Keep Local**, **Take Remote**, or **Merge Manually** in a side-by-side diff view.
- 🔑 **Flexible GitHub Authentication**: Sign in with 1-click via VS Code's native GitHub account or enter a Personal Access Token (PAT) stored securely in `SecretStorage`.
- 📁 **Clean Git Repository Layout**: Stores settings as plain, human-readable files directly at the repository root (`settings.json`, `keybindings.json`, `extensions.json`, `snippets/`).
- ⚡ **Silent Extension Sync**: Automatically installs extensions in the background that are present in your repository list.
- 🏷️ **Automatic Repo Creation**: Specify any repository name (e.g. `username/vscode-settings`); if it doesn't exist, the extension creates it as a private repository automatically.
- 📊 **Status Bar & Quick Menu**: Monitor sync status at a glance and access instant actions (Sync Now, Download, Upload, Logs) directly from the status bar.

---

## Repository Structure

Your target GitHub repository is organized cleanly:

```
my-vscode-settings/
├── settings.json       # User settings
├── keybindings.json    # Keyboard shortcuts
├── extensions.json     # Installed extensions list
├── snippets/           # User code snippets
│   ├── typescript.json
│   └── python.json
└── sync-meta.json      # Sync metadata (timestamp, machine ID, platform)
```

---

## Quickstart

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
   ```
   Repo Settings Sync: Turn on Settings Sync...
   ```
   *(Or click the `Settings Sync Off` indicator in the bottom-right status bar).*

2. Choose your authentication method:
   - **Sign in with GitHub** (1-click native OAuth)
   - **Enter Personal Access Token (PAT)** (Classic PAT with `repo` scope or Fine-Grained PAT with Read/Write repository access).

3. Enter your repository name (e.g., `your-username/vscode-settings`).
   - If the repository does not exist, you will be prompted to create it automatically as a private repository.

4. If the repository already contains settings from another machine:
   - **Merge**: Combines local and remote settings, keeping local values on conflicts.
   - **Replace Local**: Overwrites your local machine with remote settings.
   - **Replace Remote**: Overwrites the repository with your local machine's settings.

5. You're done! Your settings are now automatically synced in the background.

---

## Extension Commands

| Command | Identifier | Description |
| :--- | :--- | :--- |
| **Turn on Settings Sync...** | `repoSettingsSync.turnOnSync` | Start the interactive setup wizard |
| **Turn off Settings Sync** | `repoSettingsSync.turnOffSync` | Disable synchronization on this device |
| **Sync Now** | `repoSettingsSync.syncNow` | Trigger an immediate two-way synchronization |
| **Download Settings** | `repoSettingsSync.downloadSettings` | Force download settings and replace local files |
| **Upload Settings** | `repoSettingsSync.uploadSettings` | Force upload local configuration and replace remote |
| **Set GitHub PAT** | `repoSettingsSync.setToken` | Enter or update your GitHub Personal Access Token |
| **Show Sync Log** | `repoSettingsSync.showLog` | Open the diagnostic output channel |

---

## Extension Settings

| Setting | Default | Description |
| :--- | :--- | :--- |
| `repoSettingsSync.repository` | `""` | Target GitHub repository in `owner/repo` format |
| `repoSettingsSync.branch` | `"main"` | Git branch used for storing settings |
| `repoSettingsSync.autoSync` | `true` | Automatically sync changes in the background |
| `repoSettingsSync.syncIntervalMinutes` | `5` | Polling frequency in minutes to check for remote updates |
| `repoSettingsSync.syncKeybindings` | `true` | Synchronize keyboard shortcuts |
| `repoSettingsSync.syncSnippets` | `true` | Synchronize user snippets |
| `repoSettingsSync.syncExtensions` | `true` | Synchronize installed extensions and auto-install missing |

---

## Marketplace Publishing Guide (GitHub Actions)

This repository includes a turnkey CI/CD pipeline for the Visual Studio Code Marketplace:

1. **Create Publisher**:
   - Visit the [VS Code Marketplace Management Portal](https://marketplace.visualstudio.com/manage).
   - Create a publisher matching `kwonye`.

2. **Generate Personal Access Token (PAT)**:
   - Navigate to [Azure DevOps](https://dev.azure.com/).
   - Create a PAT with Organization set to **All accessible organizations** and Scope set to **Marketplace > Manage**.

3. **Add Secret to GitHub**:
   - In your GitHub repository, go to **Settings > Secrets and variables > Actions**.
   - Add a repository secret named `VSCE_PAT` containing your Azure DevOps PAT.
   - *(Optional)* Add `OVSX_PAT` to publish to the Open VSX Registry as well.

4. **Release**:
   - Push a git tag to publish automatically:
     ```bash
     git tag v0.1.0
     git push origin v0.1.0
     ```
   - The `.github/workflows/publish.yml` workflow will test, package the `.vsix`, publish to the marketplace, and attach the `.vsix` to the GitHub Release.

---

## Development

Built with [Bun](https://bun.sh) and TypeScript:

```bash
# Install dependencies
bun install

# Run typechecker
bun run typecheck

# Run unit tests
bun test

# Build extension bundle
bun run build

# Watch mode during development
bun run watch

# Package .vsix
bun run package
```

---

## License

[MIT](LICENSE) © 2026 kwonye
