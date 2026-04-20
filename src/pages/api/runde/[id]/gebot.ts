import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual, createHash } from 'node:crypto';

interface RundeJSON {
  id: string;
  adminToken: string;
  encTeilnehmerBlob: string;
  gebote: Array<{ emojiHmac: string; encGebot: string }>;
}

const ID_FORMAT = /^[a-z0-9]{8}$/;
const EMOJI_HMAC_FORMAT = /^[A-Za-z0-9_-]{43}$/;
// ECDH-Format: <ephemPubKey>.<iv>.<ciphertext> — drei Base64url-Teile
const GEBOT_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data', 'runden');

const locks = new Map<string, Promise<void>>();

function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const current = locks.get(id) ?? Promise.resolve();
  const next = current.then(() => fn(), () => fn());
  const voidNext = next.then(() => {}, () => {});
  locks.set(id, voidNext);
  voidNext.finally(() => { if (locks.get(id) === voidNext) locks.delete(id); });
  return next;
}

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;

  if (!id || !ID_FORMAT.test(id)) {
    return new Response(JSON.stringify({ error: 'Ungültige Runden-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger JSON-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const b = body as Record<string, unknown>;
  if (typeof b.emojiHmac !== 'string' || !EMOJI_HMAC_FORMAT.test(b.emojiHmac)) {
    return new Response(JSON.stringify({ error: 'emojiHmac fehlt oder hat ungültiges Format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (typeof b.encGebot !== 'string' || !GEBOT_FORMAT.test(b.encGebot) || b.encGebot.length > 1_000) {
    return new Response(JSON.stringify({ error: 'encGebot fehlt oder hat ungültiges Format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isCorrection = b.isCorrection === true;
  const { emojiHmac, encGebot } = b as { emojiHmac: string; encGebot: string };

  return withLock(id, async () => {
    let runde: RundeJSON;
    try {
      const raw = await readFile(join(DATA_DIR, `${id}.json`), 'utf-8');
      runde = JSON.parse(raw) as RundeJSON;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Response(JSON.stringify({ error: 'Runde nicht gefunden' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }

    const exists = runde.gebote.some((g) => g.emojiHmac === emojiHmac);

    if (isCorrection) {
      if (!exists) {
        return new Response(
          JSON.stringify({ error: 'Kein Gebot mit dieser Emoji-ID gefunden' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } else {
      if (exists) {
        return new Response(
          JSON.stringify({ error: 'Gebot mit dieser Emoji-ID bereits vorhanden' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (isCorrection) {
      const idx = runde.gebote.findIndex((g) => g.emojiHmac === emojiHmac);
      runde.gebote[idx] = { emojiHmac, encGebot };
    } else {
      runde.gebote.push({ emojiHmac, encGebot });
    }
    try {
      await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(runde, null, 2), 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOSPC') {
        return new Response(JSON.stringify({ error: 'Kein Speicherplatz verfügbar' }), {
          status: 507,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Fehler beim Speichern' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const { id } = params;

  if (!id || !ID_FORMAT.test(id)) {
    return new Response(JSON.stringify({ error: 'Ungültige Runden-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger JSON-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const b = body as Record<string, unknown>;

  if (typeof b.emojiHmac !== 'string' || !EMOJI_HMAC_FORMAT.test(b.emojiHmac)) {
    return new Response(JSON.stringify({ error: 'emojiHmac fehlt oder hat ungültiges Format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof b.adminToken !== 'string' || b.adminToken.length !== 16) {
    return new Response(JSON.stringify({ error: 'adminToken fehlt oder hat ungültiges Format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { emojiHmac, adminToken } = b as { emojiHmac: string; adminToken: string };

  return withLock(id, async () => {
    let runde: RundeJSON;
    try {
      const raw = await readFile(join(DATA_DIR, `${id}.json`), 'utf-8');
      runde = JSON.parse(raw) as RundeJSON;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Response(JSON.stringify({ error: 'Runde nicht gefunden' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }

    const tokenMatch = timingSafeEqual(
      createHash('sha256').update(adminToken).digest(),
      createHash('sha256').update(runde.adminToken).digest(),
    );

    if (!tokenMatch) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const vorher = runde.gebote.length;
    runde.gebote = runde.gebote.filter((g) => g.emojiHmac !== emojiHmac);

    if (runde.gebote.length === vorher) {
      return new Response(JSON.stringify({ error: 'Gebot nicht gefunden' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(runde, null, 2), 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOSPC') {
        return new Response(JSON.stringify({ error: 'Kein Speicherplatz verfügbar' }), {
          status: 507,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Fehler beim Speichern' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
};
