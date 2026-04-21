import { describe, it, expect } from 'vitest';
import { GET } from './health';

describe('GET /api/health', () => {
  it('gibt 200 mit status ok zurück', async () => {
    const res = GET({} as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
