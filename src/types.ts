export type StackInfo = {
  framework: 'next' | 'unknown';
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  scripts: Record<string, string>;
  dependencies: string[];
  hasLockfile: boolean;
  hasEnvExample: boolean;
  usesNeon: boolean;
};

export type CheckContext = {
  repoPath: string;
  stack: StackInfo;
};

export type Finding = {
  checkId: string;
  severity: 'blocker' | 'warning' | 'pass';
  title: string;
  detail: string;
  evidence?: string;
};

export type Check<D = unknown> = (ctx: CheckContext, deps?: D) => Promise<Finding[]>;

export type Reporter = {
  start: (step: string) => void;
  done: (step: string, findings: Finding[], durationMs: number) => void;
};

export type Report = {
  verdict: 'ship' | 'do-not-ship';
  score: number;
  blockers: Finding[];
  warnings: Finding[];
  passed: Finding[];
  summary: string;
  fixOrder: string[];
  generatedAt: string;
};
