export function logError(msg: string, context?: Record<string, unknown>): void {
  process.stderr.write(
    JSON.stringify({ level: 'error', msg, ...context, ts: new Date().toISOString() }) + '\n',
  );
}
