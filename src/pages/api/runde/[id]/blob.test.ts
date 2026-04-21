import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs/promises mock — muss vor dem Import des Handlers stehen
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

// ---------------------------------------------------------------------------
// Hilfe
// ---------------------------------------------------------------------------

function makeRunde() {
  return JSON.stringify({
    id: 'abc12345',
    adminToken: 'tok1234567890abc',
    encTeilnehmerBlob: 'iv123.cipher456',
    gebote: [{ emojiHmac: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', encGebot: 'k.iv.ct' }],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/runde/[id]/blob', () => {
  let handler: (ctx: { params: { id: string } }) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('./blob?t=' + Date.now());
    handler = mod.GET as typeof handler;
  });

  it('happy path: existierende Datei gibt encTeilnehmerBlob und gebote zurück', async () => {
    mockReadFile.mockResolvedValue(makeRunde());
    const res = await handler({ params: { id: 'abc12345' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.encTeilnehmerBlob).toBe('iv123.cipher456');
    expect(body.gebote).toHaveLength(1);
  });

  it('gibt adminToken und id nicht zurück (Zero-Knowledge)', async () => {
    mockReadFile.mockResolvedValue(makeRunde());
    const res = await handler({ params: { id: 'abc12345' } });
    const body = await res.json();
    expect(body.adminToken).toBeUndefined();
    expect(body.id).toBeUndefined();
  });

  it('unbekannte ID (ENOENT) → 404', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(enoent);
    const res = await handler({ params: { id: 'unbekann' } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Runde nicht gefunden');
  });

  it('ungültige ID (zu lang) → 400', async () => {
    const res = await handler({ params: { id: 'toolongid' } });
    expect(res.status).toBe(400);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('ungültige ID (Großbuchstaben) → 400', async () => {
    const res = await handler({ params: { id: 'ABC12345' } });
    expect(res.status).toBe(400);
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
