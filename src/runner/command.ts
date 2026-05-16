import { execa } from 'execa';

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type CommandOptions = {
  cwd: string;
  timeoutMs: number;
};

export async function runCommand(cmd: string, opts: CommandOptions): Promise<CommandResult> {
  try {
    const result = await execa(cmd, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs,
      shell: true,
      reject: false,
    });
    return {
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      timedOut: Boolean(result.timedOut),
    };
    // reject:false handles exit/timeout/signal; catch is for spawn-time failures (invalid options, etc).
  } catch (err: unknown) {
    const e = err as { timedOut?: boolean; exitCode?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof e.exitCode === 'number' ? e.exitCode : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(err),
      timedOut: Boolean(e.timedOut),
    };
  }
}
