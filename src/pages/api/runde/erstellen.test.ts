import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs/promises mock — muss vor dem Import des Handlers stehen
// ---------------------------------------------------------------------------

const mockWriteFile = vi.fn();
const mockReaddir = vi.fn();
const mockUnlink = vi.fn();
const mockStat = vi.fn();

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  readdir: mockReaddir,
  unlink: mockUnlink,
  stat: mockStat,
}));

// ---------------------------------------------------------------------------
// Hilfe
// ---------------------------------------------------------------------------

// Valides Format: base64url.base64url
const VALID_BLOB = 'aGVsbG8.d29ybGQ';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/runde/erstellen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/runde/erstellen', () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    const mod = await import('./erstellen?t=' + Date.now());
    handler = mod.POST as typeof handler;
  });

  it('happy path: valider Body gibt id (8 Zeichen) und adminToken (16 Zeichen) zurück', async () => {
    const res = await handler({ request: makeRequest({ encTeilnehmerBlob: VALID_BLOB }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
    expect(body.id).toHaveLength(8);
    expect(/^[a-z0-9]{8}$/.test(body.id)).toBe(true);
    expect(typeof body.adminToken).toBe('string');
    expect(body.adminToken).toHaveLength(16);
    expect(mockWriteFile).toHaveBeenCalledOnce();
  });

  it('geschriebene Datei enthält korrekte Rundenstruktur', async () => {
    await handler({ request: makeRequest({ encTeilnehmerBlob: VALID_BLOB }) });
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(written.encTeilnehmerBlob).toBe(VALID_BLOB);
    expect(written.gebote).toEqual([]);
    expect(typeof written.adminToken).toBe('string');
    expect(typeof written.id).toBe('string');
  });

  it('kein encTeilnehmerBlob → 400', async () => {
    const res = await handler({ request: makeRequest({}) });
    expect(res.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('encTeilnehmerBlob mit ungültigem Format (kein Punkt) → 400', async () => {
    const res = await handler({ request: makeRequest({ encTeilnehmerBlob: 'keinPunktFormat' }) });
    expect(res.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('encTeilnehmerBlob zu lang (> 10.000 Zeichen) → 400', async () => {
    const tooLong = 'A'.repeat(5001) + '.' + 'B'.repeat(5001);
    const res = await handler({ request: makeRequest({ encTeilnehmerBlob: tooLong }) });
    expect(res.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('kein JSON-Body → 400', async () => {
    const req = new Request('http://localhost/api/runde/erstellen', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'kein json',
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('writeFile ENOSPC → 507', async () => {
    const enospc = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    mockWriteFile.mockRejectedValue(enospc);
    const res = await handler({ request: makeRequest({ encTeilnehmerBlob: VALID_BLOB }) });
    expect(res.status).toBe(507);
    const body = await res.json();
    expect(body.error).toBe('Kein Speicherplatz verfügbar');
  });

  it('writeFile generischer Fehler → 503', async () => {
    mockWriteFile.mockRejectedValue(new Error('EIO'));
    const res = await handler({ request: makeRequest({ encTeilnehmerBlob: VALID_BLOB }) });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Fehler beim Speichern');
  });
});

describe('cleanupAlteRunden (fire-and-forget)', () => {
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    const mod = await import('./erstellen?t=' + Date.now());
    handler = mod.POST as typeof handler;
  });

  async function triggerAndFlush() {
    await handler({ request: makeRequest({ encTeilnehmerBlob: VALID_BLOB }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('überspringt Nicht-JSON-Dateien', async () => {
    mockReaddir.mockResolvedValue(['runde.json', 'readme.txt', '.gitkeep']);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() });

    await triggerAndFlush();

    expect(mockStat).toHaveBeenCalledTimes(1);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('löscht JSON-Dateien älter als 6 Monate', async () => {
    mockReaddir.mockResolvedValue(['alte-runde.json']);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - SIX_MONTHS_MS - 1 });
    mockUnlink.mockResolvedValue(undefined);

    await triggerAndFlush();

    expect(mockUnlink).toHaveBeenCalledOnce();
  });

  it('lässt Dateien jünger als 6 Monate unangetastet', async () => {
    mockReaddir.mockResolvedValue(['neue-runde.json']);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - SIX_MONTHS_MS + 1000 });

    await triggerAndFlush();

    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('ignoriert stat/unlink-Fehler und macht weiter', async () => {
    mockReaddir.mockResolvedValue(['runde.json']);
    mockStat.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    await triggerAndFlush();

    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('ignoriert readdir-Fehler — Handler gibt trotzdem 200', async () => {
    mockReaddir.mockRejectedValue(new Error('EACCES'));

    const res = await handler({ request: makeRequest({ encTeilnehmerBlob: VALID_BLOB }) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(res.status).toBe(200);
    expect(mockWriteFile).toHaveBeenCalledOnce();
  });
});
