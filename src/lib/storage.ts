const STORAGE_KEY = 'fairshare_runden';

export interface LocalRunde {
  id: string;
  name: string;
  hinzugefuegtAm: string;
  teilnehmerLink: string;
  adminLink?: string;
  slots?: Array<{ label: string; gewichtung: number; anzahl: number }>;
}

export function getRunden(): LocalRunde[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Ungültiges Format in localStorage');
  return parsed;
}

export function saveRunde(runde: LocalRunde): void {
  const runden = getRunden();
  const idx = runden.findIndex((r) => r.id === runde.id);

  if (idx === -1) {
    runden.push(runde);
  } else {
    const existing = runden[idx];
    // Upgrade: neuer Eintrag hat adminLink, bestehender nicht → überschreiben
    if (runde.adminLink && !existing.adminLink) {
      runden[idx] = runde;
    }
    // Downgrade ignorieren: bestehender hat adminLink, neuer nicht → nichts tun
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(runden));
}

export function deleteRunde(id: string): void {
  const runden = getRunden().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runden));
}

export function clearRunden(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveGebotLokal(rundenId: string, emojiId: string, slotLabel: string): void {
  const key = `fairshare-gebot-${rundenId}`;
  let gebote: Array<{ emojiId: string; slotLabel: string }> = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) gebote = JSON.parse(raw);
  } catch { /* ignore */ }
  if (!gebote.some((g) => g.emojiId === emojiId)) {
    gebote.push({ emojiId, slotLabel });
    localStorage.setItem(key, JSON.stringify(gebote));
  }
}

export function getGebotSlot(rundenId: string, emojiId: string): string | null {
  try {
    const raw = localStorage.getItem(`fairshare-gebot-${rundenId}`);
    if (!raw) return null;
    const gebote: Array<{ emojiId: string; slotLabel: string }> = JSON.parse(raw);
    return gebote.find((g) => g.emojiId === emojiId)?.slotLabel ?? null;
  } catch {
    return null;
  }
}

export function exportJson(): string {
  return JSON.stringify(getRunden(), null, 2);
}

export function importJson(json: string): void {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Ungültiges Format: kein Array');
  for (const entry of parsed) {
    if (typeof entry?.id !== 'string' || typeof entry?.teilnehmerLink !== 'string') {
      throw new Error('Ungültiges Format: Einträge fehlen Pflichtfelder');
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
}
