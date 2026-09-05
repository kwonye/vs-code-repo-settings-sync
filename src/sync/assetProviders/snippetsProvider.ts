import * as fs from 'fs/promises';
import * as path from 'path';
import { PathResolver } from '../pathResolver';
import { Logger } from '../../ui/logger';

export class SnippetsProvider {
  private readonly logger = Logger.getInstance();

  public async readLocal(): Promise<Record<string, string>> {
    const snippetsDir = PathResolver.getSnippetsDir();
    const result: Record<string, string> = {};

    try {
      const entries = await fs.readdir(snippetsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.code-snippets'))) {
          const fullPath = path.join(snippetsDir, entry.name);
          const content = await fs.readFile(fullPath, 'utf-8');
          result[entry.name] = content;
        }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== 'ENOENT') {
        this.logger.error(`Error reading snippets directory at ${snippetsDir}`, err);
      }
    }

    return result;
  }

  public async writeLocal(snippets: Record<string, string>): Promise<void> {
    const snippetsDir = PathResolver.getSnippetsDir();
    await fs.mkdir(snippetsDir, { recursive: true });

    for (const [filename, content] of Object.entries(snippets)) {
      const filePath = path.join(snippetsDir, filename);
      await fs.writeFile(filePath, content, 'utf-8');
    }
    this.logger.info(`Updated local snippets (${Object.keys(snippets).length} files) in ${snippetsDir}`);
  }
}
