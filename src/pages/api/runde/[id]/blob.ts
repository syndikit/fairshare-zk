import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ID_FORMAT = /^[a-z0-9]{8}$/;
const DATA_DIR = join(process.cwd(), 'data', 'runden');

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id || !ID_FORMAT.test(id)) {
    return new Response(JSON.stringify({ error: 'Ungültige Runden-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let raw: string;
  try {
    raw = await readFile(join(DATA_DIR, `${id}.json`), 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Response(JSON.stringify({ error: 'Runde nicht gefunden' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }

  const runde = JSON.parse(raw) as {
    encTeilnehmerBlob: string;
    gebote: Array<{ emojiHmac: string; encGebot: string }>;
  };

  return new Response(
    JSON.stringify({ encTeilnehmerBlob: runde.encTeilnehmerBlob, gebote: runde.gebote }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
