/**
 * FairShare ZK — Solidarische Berechnungslogik + Emoji-IDs
 *
 * Alle Funktionen sind synchron und side-effect-frei (außer generiereEmojiId).
 * Keine Krypto-Operationen hier — nur Arithmetik und Emoji-Auswahl.
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface Slot {
  label: string;
  gewichtung: number;
  anzahl: number;
}

export interface Gebot {
  emojiId: string;
  slotLabel: string;
  gewichtung: number;
  betrag: number;
}

export interface GebotErgebnis {
  emojiId: string;
  slotLabel: string;
  gewichtung: number;
  gebot: number;
  anteil: number;
  solidarischerBeitrag: number;
  differenz: number;
}

export interface Auswertung {
  richtwert: number;
  gesamtkosten: number;
  summeGebote: number;
  summeBeitraege: number;
  fehlbetrag: number;
  ueberschuss: number;
  ergebnisse: GebotErgebnis[];
}

// ---------------------------------------------------------------------------
// Emoji-ID
// ---------------------------------------------------------------------------

export const EMOJIS: readonly string[] = [
  '🌟', '🎉', '🦋', '🌈', '🐼', '🚀', '🌺', '🦄', '🎸', '🌊',
  '🦊', '🌙', '⭐', '🌻', '🦁', '🎨', '🌸', '🐬', '🎭', '🌴',
  '🦅', '🎪', '🌹', '🐳', '🎯', '🌞', '🦉', '🎵', '🌿', '🐙',
  '🎠', '🌄', '🦜', '🐘', '🌏', '🦚', '🎡', '🌠', '🐓', '🦩',
  '🌋', '🦢', '🎢', '🌬', '🐦', '🎲', '🌜', '🦝', '🎷', '🌝',
];

/** Generiert eine zufällige Emoji-ID aus 3 Emojis (50³ = 125.000 Kombinationen). */
export function generiereEmojiId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return [
    EMOJIS[bytes[0] % EMOJIS.length],
    EMOJIS[bytes[1] % EMOJIS.length],
    EMOJIS[bytes[2] % EMOJIS.length],
  ].join('');
}

// ---------------------------------------------------------------------------
// Berechnungslogik
// ---------------------------------------------------------------------------

/**
 * Berechnet den Richtwert pro Gewichtseinheit.
 * Nenner = Summe der Gewichtungen aller eingegangenen Gebote.
 */
export function berechneRichtwert(gesamtkosten: number, gebote: Gebot[]): number {
  if (gebote.length === 0) throw new Error('Keine Gebote vorhanden');
  const summeGewichtungen = gebote.reduce((sum, g) => sum + g.gewichtung, 0);
  return gesamtkosten / summeGewichtungen;
}

/**
 * Berechnet den solidarischen Beitrag für ein einzelnes Gebot.
 * - Wer weniger als seinen Anteil bietet, zahlt nur das Gebot.
 * - Wer mehr bietet, wird auf den Anteil reduziert.
 */
export function berechneBeitrag(gebot: Gebot, richtwert: number): GebotErgebnis {
  const anteil = gebot.gewichtung * richtwert;
  const solidarischerBeitrag = gebot.betrag <= anteil ? gebot.betrag : anteil;
  const differenz = gebot.betrag - solidarischerBeitrag;
  return {
    emojiId: gebot.emojiId,
    slotLabel: gebot.slotLabel,
    gewichtung: gebot.gewichtung,
    gebot: gebot.betrag,
    anteil,
    solidarischerBeitrag,
    differenz,
  };
}

/**
 * Vollständige Auswertung einer Runde.
 * Wirft bei leerer Gebote-Liste oder ungültigen Gesamtkosten.
 */
export function berechneAuswertung(gesamtkosten: number, gebote: Gebot[]): Auswertung {
  if (gesamtkosten <= 0) throw new Error('Gesamtkosten müssen größer als 0 sein');
  if (gebote.length === 0) throw new Error('Keine Gebote vorhanden');

  const richtwert = berechneRichtwert(gesamtkosten, gebote);
  const ergebnisse = gebote.map((g) => berechneBeitrag(g, richtwert));

  const summeGebote = gebote.reduce((sum, g) => sum + g.betrag, 0);
  const summeBeitraege = ergebnisse.reduce((sum, e) => sum + e.solidarischerBeitrag, 0);

  const fehlbetrag = Math.max(0, gesamtkosten - summeBeitraege);
  const ueberschuss = Math.max(0, summeBeitraege - gesamtkosten);

  return {
    richtwert,
    gesamtkosten,
    summeGebote,
    summeBeitraege,
    fehlbetrag,
    ueberschuss,
    ergebnisse,
  };
}
