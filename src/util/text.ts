export function lastNLines(s: string, n: number): string {
  return s.split('\n').slice(-n).join('\n');
}
