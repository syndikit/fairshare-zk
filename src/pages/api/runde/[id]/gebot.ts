import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

interface RundeJSON {
  id: string;
  adminToken: string;
  encTeilnehmerBlob: string;
  gebote: Array<{ emojiHmac: string; encGebot: string }>;
}

const ID_FORMAT = /^[a-z0-9]{8}$/;
// ECDH-Format: <ephemPubKey>.<iv>.<ciphertext> — drei Base64url-Teile
const GEBOT_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DATA_DIR = join(process.cwd(), 'data', 'runden');

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
  if (typeof b.emojiHmac !== 'string' || b.emojiHmac.length === 0) {
    return new Response(JSON.stringify({ error: 'emojiHmac fehlt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (typeof b.encGebot !== 'string' || !GEBOT_FORMAT.test(b.encGebot)) {
    return new Response(JSON.stringify({ error: 'encGebot fehlt oder hat ungültiges Format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isCorrection = b.isCorrection === true;
  const { emojiHmac, encGebot } = b as { emojiHmac: string; encGebot: string };

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

  runde.gebote.push({ emojiHmac, encGebot });
  await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(runde, null, 2), 'utf-8');

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
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

  if (typeof b.emojiHmac !== 'string' || b.emojiHmac.length === 0) {
    return new Response(JSON.stringify({ error: 'emojiHmac fehlt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof b.adminToken !== 'string' || b.adminToken.length === 0) {
    return new Response(JSON.stringify({ error: 'adminToken fehlt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { emojiHmac, adminToken } = b as { emojiHmac: string; adminToken: string };

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

  // Timing-safe Vergleich gegen Timing-Angriffe
  const tokenA = Buffer.from(adminToken);
  const tokenB = Buffer.from(runde.adminToken);
  const tokenMatch =
    tokenA.length === tokenB.length && timingSafeEqual(tokenA, tokenB);

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

  await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(runde, null, 2), 'utf-8');

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};