import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs/promises mock — muss vor dem Import des Handlers stehen
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

// ---------------------------------------------------------------------------
// Hilfe: Request-Objekt bauen
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/runde/abc12345/gebot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRunde(gebote: Array<{ emojiHmac: string; encGebot: string }>) {
  return JSON.stringify({
    id: 'abc12345',
    adminToken: 'tok',
    encTeilnehmerBlob: 'iv.ct',
    gebote,
  });
}

const VALID_ENC_GEBOT = 'ephemKey.iv123.cipher';
// 43-char base64url string — matches HMAC-SHA256 output length
const EMOJI_HMAC = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/runde/[id]/gebot', () => {
  let handler: (ctx: { params: { id: string }; request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    // Handler nach jedem Reset neu importieren, damit Mocks greifen
    const mod = await import('./gebot?t=' + Date.now());
    handler = mod.POST as typeof handler;
  });

  it('neues Gebot wird hinzugefügt (kein Duplikat)', async () => {
    mockReadFile.mockResolvedValue(makeRunde([]));

    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT }),
    });

    expect(res.status).toBe(200);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(written.gebote).toHaveLength(1);
    expect(written.gebote[0]).toEqual({ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT });
  });

  it('neues Gebot mit bereits vorhandener emojiHmac gibt 409', async () => {
    mockReadFile.mockResolvedValue(
      makeRunde([{ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT }]),
    );

    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT }),
    });

    expect(res.status).toBe(409);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('Korrektur ersetzt vorhandenes Gebot — Array-Länge bleibt 1', async () => {
    const oldEnc = 'oldKey.oldIv.oldCt';
    mockReadFile.mockResolvedValue(
      makeRunde([{ emojiHmac: EMOJI_HMAC, encGebot: oldEnc }]),
    );

    const newEnc = 'newKey.newIv.newCt';
    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: newEnc, isCorrection: true }),
    });

    expect(res.status).toBe(200);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(written.gebote).toHaveLength(1);
    expect(written.gebote[0]).toEqual({ emojiHmac: EMOJI_HMAC, encGebot: newEnc });
  });

  it('Korrektur ohne vorhandenes Gebot gibt 404', async () => {
    mockReadFile.mockResolvedValue(makeRunde([]));

    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT, isCorrection: true }),
    });

    expect(res.status).toBe(404);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('mehrfache Korrekturen lassen Array-Länge bei 1', async () => {
    const enc1 = 'k1.iv1.ct1';
    const enc2 = 'k2.iv2.ct2';
    const enc3 = 'k3.iv3.ct3';

    // Erste Korrektur
    mockReadFile.mockResolvedValueOnce(
      makeRunde([{ emojiHmac: EMOJI_HMAC, encGebot: enc1 }]),
    );
    await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: enc2, isCorrection: true }),
    });

    const afterFirst = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(afterFirst.gebote).toHaveLength(1);

    // Zweite Korrektur
    mockReadFile.mockResolvedValueOnce(
      makeRunde([{ emojiHmac: EMOJI_HMAC, encGebot: enc2 }]),
    );
    await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: enc3, isCorrection: true }),
    });

    const afterSecond = JSON.parse(mockWriteFile.mock.calls[1][1]);
    expect(afterSecond.gebote).toHaveLength(1);
    expect(afterSecond.gebote[0].encGebot).toBe(enc3);
  });

  it('emojiHmac zu kurz gibt 400', async () => {
    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: 'zuKurz', encGebot: VALID_ENC_GEBOT }),
    });
    expect(res.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('emojiHmac mit ungültigem Zeichen gibt 400', async () => {
    const invalidHmac = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA!';
    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: invalidHmac, encGebot: VALID_ENC_GEBOT }),
    });
    expect(res.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('encGebot über 1000 Zeichen gibt 400', async () => {
    const longGebot = `${'A'.repeat(500)}.${'B'.repeat(100)}.${'C'.repeat(401)}`;
    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: longGebot }),
    });
    expect(res.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('writeFile ENOSPC gibt 507', async () => {
    mockReadFile.mockResolvedValue(makeRunde([]));
    const enospc = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    mockWriteFile.mockRejectedValue(enospc);

    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT }),
    });

    expect(res.status).toBe(507);
    const body = await res.json();
    expect(body.error).toBe('Kein Speicherplatz verfügbar');
  });

  it('writeFile generischer Fehler gibt 503', async () => {
    mockReadFile.mockResolvedValue(makeRunde([]));
    mockWriteFile.mockRejectedValue(new Error('EIO'));

    const res = await handler({
      params: { id: 'abc12345' },
      request: makeRequest({ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Fehler beim Speichern');
  });
});

describe('DELETE /api/runde/[id]/gebot', () => {
  let handler: (ctx: { params: { id: string }; request: Request }) => Promise<Response>;

  const ADMIN_TOKEN = 'abcdef1234567890'; // 16 Zeichen

  function makeRundeWithToken(gebote: Array<{ emojiHmac: string; encGebot: string }>) {
    return JSON.stringify({
      id: 'abc12345',
      adminToken: ADMIN_TOKEN,
      encTeilnehmerBlob: 'iv.ct',
      gebote,
    });
  }

  function makeDeleteRequest(body: unknown): Request {
    return new Request('http://localhost/api/runde/abc12345/gebot', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    const mod = await import('./gebot?t=' + Date.now());
    handler = mod.DELETE as typeof handler;
  });

  it('writeFile ENOSPC bei DELETE gibt 507', async () => {
    mockReadFile.mockResolvedValue(
      makeRundeWithToken([{ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT }]),
    );
    const enospc = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    mockWriteFile.mockRejectedValue(enospc);

    const res = await handler({
      params: { id: 'abc12345' },
      request: makeDeleteRequest({ emojiHmac: EMOJI_HMAC, adminToken: ADMIN_TOKEN }),
    });

    expect(res.status).toBe(507);
    const body = await res.json();
    expect(body.error).toBe('Kein Speicherplatz verfügbar');
  });

  it('writeFile generischer Fehler bei DELETE gibt 503', async () => {
    mockReadFile.mockResolvedValue(
      makeRundeWithToken([{ emojiHmac: EMOJI_HMAC, encGebot: VALID_ENC_GEBOT }]),
    );
    mockWriteFile.mockRejectedValue(new Error('EIO'));

    const res = await handler({
      params: { id: 'abc12345' },
      request: makeDeleteRequest({ emojiHmac: EMOJI_HMAC, adminToken: ADMIN_TOKEN }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Fehler beim Speichern');
  });
});
