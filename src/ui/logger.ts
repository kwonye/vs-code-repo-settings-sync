import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../constants';

export class Logger implements vscode.Disposable {
  private static instance: Logger;
  private readonly outputChannel: vscode.OutputChannel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public info(message: string, ...args: unknown[]): void {
    this.log('INFO', message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.log('WARN', message, ...args);
  }

  public error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      this.log('ERROR', `${message}: ${error.message}\n${error.stack ?? ''}`);
    } else if (error !== undefined) {
      this.log('ERROR', `${message}: ${JSON.stringify(error)}`);
    } else {
      this.log('ERROR', message);
    }
  }

  public show(preserveFocus = true): void {
    this.outputChannel.show(preserveFocus);
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', message: string, ...args: unknown[]): void {
    const time = new Date().toLocaleTimeString();
    const formattedArgs = args.length > 0 ? ` ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}` : '';
    this.outputChannel.appendLine(`[${time}] [${level}] ${message}${formattedArgs}`);
  }
}
