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
const EMOJI_HMAC = 'abc123';

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
});
