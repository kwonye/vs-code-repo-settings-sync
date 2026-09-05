import * as fs from 'fs/promises';
import * as path from 'path';
import { PathResolver } from '../pathResolver';
import { Logger } from '../../ui/logger';

export class KeybindingsProvider {
  private readonly logger = Logger.getInstance();

  public async readLocal(): Promise<string | null> {
    const filePath = PathResolver.getKeybindingsPath();
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'ENOENT') {
        return null;
      }
      this.logger.error(`Error reading keybindings file at ${filePath}`, err);
      return null;
    }
  }

  public async writeLocal(content: string): Promise<void> {
    const filePath = PathResolver.getKeybindingsPath();
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    this.logger.info(`Updated local keybindings at ${filePath}`);
  }
}
