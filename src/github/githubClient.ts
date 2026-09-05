import { Octokit } from '@octokit/rest';
import { Logger } from '../ui/logger';

export interface RemoteFile {
  path: string;
  content: string;
}

export class GitHubClient {
  private readonly octokit: Octokit;
  private readonly logger = Logger.getInstance();

  constructor(octokit: Octokit) {
    this.octokit = octokit;
  }

  /**
   * Checks whether a repository exists and is accessible.
   */
  public async checkRepoExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.get({ owner, repo });
      return true;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Creates a private repository for the authenticated user.
   */
  public async createPrivateRepo(name: string, description = 'VS Code Settings Sync repository'): Promise<{ owner: string; repo: string; defaultBranch: string }> {
    this.logger.info(`Creating private repository: ${name}`);
    const { data } = await this.octokit.rest.repos.createForAuthenticatedUser({
      name,
      description,
      private: true,
      auto_init: true
    });

    return {
      owner: data.owner.login,
      repo: data.name,
      defaultBranch: data.default_branch || 'main'
    };
  }

  /**
   * Gets the latest commit SHA for a branch, or null if the branch or repo is empty.
   */
  public async getLatestCommitSha(owner: string, repo: string, branch: string): Promise<string | null> {
    try {
      const { data: refData } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`
      });
      return refData.object.sha;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        // Check if repo has any branches or is empty
        try {
          const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo });
          if (repoData.default_branch && repoData.default_branch !== branch) {
            const { data: defaultRef } = await this.octokit.rest.git.getRef({
              owner,
              repo,
              ref: `heads/${repoData.default_branch}`
            });
            return defaultRef.object.sha;
          }
        } catch {
          // ignore
        }
        return null;
      }
      throw err;
    }
  }

  /**
   * Fetches all files currently stored in the repository branch.
   * Returns a map of relative path -> string content.
   */
  public async fetchAllFiles(owner: string, repo: string, branch: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    const commitSha = await this.getLatestCommitSha(owner, repo, branch);
    if (!commitSha) {
      return files;
    }

    try {
      // 1. Get commit to find tree SHA
      const { data: commit } = await this.octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: commitSha
      });

      // 2. Get full recursive tree
      const { data: treeData } = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: commit.tree.sha,
        recursive: 'true'
      });

      // 3. For all blob items that match settings, keybindings, extensions, or snippets/*
      for (const item of treeData.tree) {
        if (item.type === 'blob' && item.path && item.sha) {
          const isTarget =
            item.path === 'settings.json' ||
            item.path === 'keybindings.json' ||
            item.path === 'extensions.json' ||
            item.path === 'sync-meta.json' ||
            item.path.startsWith('snippets/');

          if (isTarget) {
            const { data: blob } = await this.octokit.rest.git.getBlob({
              owner,
              repo,
              file_sha: item.sha
            });
            const content = Buffer.from(blob.content, blob.encoding as BufferEncoding).toString('utf-8');
            files.set(item.path, content);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Failed to fetch files from ${owner}/${repo}@${branch}`, err);
      throw err;
    }

    return files;
  }

  /**
   * Commits multiple files atomically using the GitHub Git Data API (Blobs -> Tree -> Commit -> Ref update).
   */
  public async commitFiles(
    owner: string,
    repo: string,
    branch: string,
    files: Map<string, string>,
    commitMessage: string
  ): Promise<string> {
    this.logger.info(`Starting atomic commit of ${files.size} files to ${owner}/${repo}@${branch}`);

    // Ensure repo has at least one commit so we have a base ref
    let baseCommitSha = await this.getLatestCommitSha(owner, repo, branch);
    if (!baseCommitSha) {
      this.logger.info(`Branch heads/${branch} not found. Creating initial seed commit.`);
      const { data: initData } = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'README.md',
        message: 'Initial settings sync repository',
        content: Buffer.from('# VS Code Settings\n\nSynchronized with Repo Settings Sync.\n').toString('base64'),
        branch
      });
      baseCommitSha = initData.commit.sha!;
    }

    // 1. Get base commit to get base tree
    const { data: baseCommit } = await this.octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: baseCommitSha
    });

    // 2. Create blobs for each file
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];

    for (const [path, content] of files.entries()) {
      const { data: blob } = await this.octokit.rest.git.createBlob({
        owner,
        repo,
        content,
        encoding: 'utf-8'
      });
      treeEntries.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }

    // 3. Create tree referencing base tree
    const { data: newTree } = await this.octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.tree.sha,
      tree: treeEntries
    });

    // 4. Create commit
    const { data: newCommit } = await this.octokit.rest.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [baseCommitSha]
    });

    // 5. Update branch ref
    await this.octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
      force: false
    });

    this.logger.info(`Successfully pushed commit: ${newCommit.sha.substring(0, 7)}`);
    return newCommit.sha;
  }
}
