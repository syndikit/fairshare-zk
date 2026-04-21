import { describe, it, expect, vi, afterEach } from 'vitest';
import { logError } from './log';

describe('logError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('schreibt JSON mit level, msg und ts auf stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logError('etwas ist schiefgelaufen');
    const output = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(output.level).toBe('error');
    expect(output.msg).toBe('etwas ist schiefgelaufen');
    expect(typeof output.ts).toBe('string');
  });

  it('serialisiert Error-Instanzen zu message und code', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    logError('Datei fehlt', { id: 'abc', err });
    const output = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(output.err).toEqual({ message: 'ENOENT', code: 'ENOENT' });
    expect(output.id).toBe('abc');
  });

  it('gibt Nicht-Error-Werte unverändert weiter', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logError('unbekannter Fehler', { err: 'nur ein String' });
    const output = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(output.err).toBe('nur ein String');
  });
});
