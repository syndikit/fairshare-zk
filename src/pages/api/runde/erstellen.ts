import type { APIRoute } from 'astro';
import { writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';

interface RundeJSON {
  id: string;
  adminToken: string;
  encTeilnehmerBlob: string;
  gebote: Array<{ emojiHmac: string; encGebot: string }>;
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

async function cleanupAlteRunden(dataDir: string): Promise<void> {
  try {
    const files = await readdir(dataDir);
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(dataDir, file);
      try {
        const { mtimeMs } = await stat(filePath);
        if (now - mtimeMs > SIX_MONTHS_MS) {
          await unlink(filePath);
        }
      } catch (err) {
        console.error('[cleanup] Datei übersprungen:', filePath, err);
      }
    }
  } catch (err) {
    console.error('[cleanup] readdir fehlgeschlagen:', dataDir, err);
  }
}

function generateId(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

const BLOB_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DATA_DIR = join(process.cwd(), 'data', 'runden');

export const POST: APIRoute = async ({ request }) => {
  void cleanupAlteRunden(DATA_DIR);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger JSON-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).encTeilnehmerBlob !== 'string' ||
    !BLOB_FORMAT.test((body as Record<string, unknown>).encTeilnehmerBlob as string)
  ) {
    return new Response(JSON.stringify({ error: 'encTeilnehmerBlob fehlt oder hat ungültiges Format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { encTeilnehmerBlob } = body as { encTeilnehmerBlob: string };

  if (encTeilnehmerBlob.length > 10_000) {
    return new Response(JSON.stringify({ error: 'encTeilnehmerBlob zu lang' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const id = generateId(8);
  const adminToken = generateId(16);

  const runde: RundeJSON = {
    id,
    adminToken,
    encTeilnehmerBlob,
    gebote: [],
  };

  await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(runde, null, 2), 'utf-8');

  return new Response(JSON.stringify({ id, adminToken }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
