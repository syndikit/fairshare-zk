function serializeErr(err: unknown): unknown {
  if (err instanceof Error) {
    return { message: err.message, code: (err as NodeJS.ErrnoException).code };
  }
  return err;
}

export function logError(msg: string, context?: Record<string, unknown>): void {
  const { err, ...rest } = context ?? {};
  process.stderr.write(
    JSON.stringify({
      level: 'error',
      msg,
      ...rest,
      ...(err !== undefined && { err: serializeErr(err) }),
      ts: new Date().toISOString(),
    }) + '\n',
  );
}
