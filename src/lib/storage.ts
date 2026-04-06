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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
