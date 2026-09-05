import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import { SECRET_KEYS } from '../constants';
import { Logger } from '../ui/logger';

export interface AuthSession {
  octokit: Octokit;
  username: string;
  authType: 'pat' | 'oauth';
}

export class AuthManager {
  private readonly secretStorage: vscode.SecretStorage;
  private readonly logger = Logger.getInstance();

  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  /**
   * Retrieves an authenticated Octokit instance and username using either stored PAT or VS Code OAuth session.
   */
  public async getSession(): Promise<AuthSession | null> {
    // 1. Try personal access token first
    const token = await this.secretStorage.get(SECRET_KEYS.GITHUB_TOKEN);
    if (token) {
      try {
        const octokit = new Octokit({ auth: token });
        const { data: user } = await octokit.rest.users.getAuthenticated();
        return {
          octokit,
          username: user.login,
          authType: 'pat'
        };
      } catch (err) {
        this.logger.warn('Stored Personal Access Token appears invalid or expired.');
      }
    }

    // 2. Try VS Code GitHub OAuth session
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
      if (session) {
        const octokit = new Octokit({ auth: session.accessToken });
        const { data: user } = await octokit.rest.users.getAuthenticated();
        return {
          octokit,
          username: user.login,
          authType: 'oauth'
        };
      }
    } catch (err) {
      this.logger.warn('Could not retrieve VS Code GitHub session', err);
    }

    return null;
  }

  /**
   * Prompts the user to authenticate either via VS Code native OAuth or entering a PAT.
   */
  public async promptLogin(): Promise<AuthSession | null> {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(github) Sign in with GitHub',
          description: 'Use VS Code native GitHub account (Recommended)',
          id: 'oauth'
        },
        {
          label: '$(key) Enter Personal Access Token (PAT)',
          description: 'Paste a fine-grained or classic token with repo access',
          id: 'pat'
        }
      ],
      {
        placeHolder: 'Select how you would like to authenticate with GitHub'
      }
    );

    if (!choice) {
      return null;
    }

    if (choice.id === 'oauth') {
      try {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
        if (session) {
          const octokit = new Octokit({ auth: session.accessToken });
          const { data: user } = await octokit.rest.users.getAuthenticated();
          vscode.window.showInformationMessage(`Signed in to GitHub as ${user.login}`);
          return { octokit, username: user.login, authType: 'oauth' };
        }
      } catch (err) {
        this.logger.error('Failed to authenticate with GitHub OAuth', err);
        vscode.window.showErrorMessage('GitHub sign-in failed. You can also try entering a Personal Access Token.');
      }
    } else {
      const token = await this.promptForToken();
      if (token) {
        return this.getSession();
      }
    }

    return null;
  }

  /**
   * Prompts user to input a GitHub PAT and stores it securely.
   */
  public async promptForToken(): Promise<string | null> {
    const token = await vscode.window.showInputBox({
      title: 'GitHub Personal Access Token',
      prompt: 'Enter a GitHub PAT with "repo" scope',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx'
    });

    if (!token || token.trim().length === 0) {
      return null;
    }

    const trimmed = token.trim();
    try {
      const octokit = new Octokit({ auth: trimmed });
      const { data: user } = await octokit.rest.users.getAuthenticated();
      await this.secretStorage.store(SECRET_KEYS.GITHUB_TOKEN, trimmed);
      vscode.window.showInformationMessage(`Successfully authenticated as GitHub user: ${user.login}`);
      return trimmed;
    } catch (err) {
      this.logger.error('Invalid GitHub token', err);
      vscode.window.showErrorMessage('The provided GitHub token is invalid or does not have permissions. Please try again.');
      return null;
    }
  }

  /**
   * Clears stored credentials.
   */
  public async clearCredentials(): Promise<void> {
    await this.secretStorage.delete(SECRET_KEYS.GITHUB_TOKEN);
  }
}
