import {
  importPartKey,
  importAdminPrivKey,
  decrypt,
  decryptGebot,
} from '../lib/crypto';
import {
  berechneAuswertung,
  berechneAusgleich,
  ermittleDreiGebotStatus,
  dreiGebotZuGebote,
  type Gebot,
  type GebotErgebnis,
  type DreiGebotTriple,
} from '../lib/solidarisch';
import { formatEur } from '../lib/ui';

interface TeilnehmerBlob {
  rundeName: string;
  gesamtkosten: number;
  adminPubKey: string;
  hmacKey: string;
  slots: { label: string; gewichtung: number; anzahl: number; ausgaben?: number; standardgebot?: number }[];
  dreiGebotModus?: boolean;
}

interface RawGebotPayload {
  emojiId: string;
  slotLabel: string;
  gewichtung: number;
  betrag?: number;
  betragMin?: number;
  betragMittel?: number;
  betragMax?: number;
  istStandard?: boolean;
}

export async function initAdmin(): Promise<void> {
  function zeigeFehler(msg: string) {
    document.getElementById('zustand-laden')!.classList.add('hidden');
    document.getElementById('zustand-fehler')!.classList.remove('hidden');
    document.getElementById('fehler-text')!.textContent = msg;
  }

  function zeigeBanner(text: string, farbe: 'green' | 'amber' | 'red') {
    const banner = document.getElementById('status-banner')!;
    const farbenKlassen: Record<string, string> = {
      green: 'bg-success-subtle border border-success-outline text-success-fg',
      amber: 'bg-amber-subtle border border-amber-outline text-amber-fg',
      red:   'bg-danger-subtle border border-danger-outline text-danger-fg',
    };
    banner.className = `rounded-xl px-4 py-3 text-sm font-medium print:hidden ${farbenKlassen[farbe]}`;
    banner.textContent = text;
    banner.classList.remove('hidden');
  }

  // Fragment auslesen
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const partKeyB64 = params.get('pk');
  const adminPrivKeyB64 = params.get('bk');

  if (!partKeyB64 || !adminPrivKeyB64) {
    zeigeFehler('Admin-Link unvollständig (pk oder bk fehlt). Bitte verwende den vollständigen Admin-Link.');
    return;
  }

  // Fragment aus History entfernen
  history.replaceState(null, '', window.location.pathname);

  // Runden-ID aus URL: /runde/{id}/admin/{token}
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const rundenId = pathParts[1];
  const adminToken = pathParts[3]; // /runde/{id}/admin/{token}

  // Blob + Gebote laden
  let blobData: { encTeilnehmerBlob: string; gebote: Array<{ emojiHmac: string; encGebot: string }> };
  try {
    const res = await fetch(`/api/runde/${rundenId}/blob`);
    if (!res.ok) {
      zeigeFehler('Runde nicht gefunden.');
      return;
    }
    blobData = await res.json();
  } catch {
    zeigeFehler('Fehler beim Laden der Runde.');
    return;
  }

  // Schlüssel importieren
  let partKey: CryptoKey, adminPrivKey: CryptoKey;
  try {
    [partKey, adminPrivKey] = await Promise.all([
      importPartKey(partKeyB64),
      importAdminPrivKey(adminPrivKeyB64),
    ]);
  } catch {
    zeigeFehler('Schlüssel im Admin-Link sind ungültig.');
    return;
  }

  // Blob entschlüsseln
  let blob: TeilnehmerBlob;
  try {
    blob = JSON.parse(await decrypt(partKey, blobData.encTeilnehmerBlob)) as TeilnehmerBlob;
  } catch {
    zeigeFehler('Blob-Entschlüsselung fehlgeschlagen. Falscher Schlüssel?');
    return;
  }

  // Deduplizierung: pro emojiHmac das neueste Gebot behalten (Korrekturen überschreiben alte)
  const latestByHmac = new Map<string, { emojiHmac: string; encGebot: string }>();
  for (const g of blobData.gebote) latestByHmac.set(g.emojiHmac, g);
  const dedupGebote = [...latestByHmac.values()];

  // Gebote entschlüsseln
  const dreiGebotModus = blob.dreiGebotModus === true;
  const geboteWithHmac: Array<{ emojiHmac: string; gebot: Gebot }> = [];
  const dreiGebotTriples: DreiGebotTriple[] = [];

  for (const { emojiHmac, encGebot } of dedupGebote) {
    try {
      const raw = JSON.parse(await decryptGebot(adminPrivKey, encGebot)) as RawGebotPayload;
      if (raw.betragMin !== undefined && raw.betragMittel !== undefined && raw.betragMax !== undefined) {
        dreiGebotTriples.push({
          emojiId: raw.emojiId, slotLabel: raw.slotLabel, gewichtung: raw.gewichtung,
          betragMin: raw.betragMin, betragMittel: raw.betragMittel, betragMax: raw.betragMax,
        });
      }
      // Für Anzeige und Vollständigkeits-Check immer als Gebot (betrag irrelevant bis Auswertung)
      geboteWithHmac.push({ emojiHmac, gebot: { emojiId: raw.emojiId, slotLabel: raw.slotLabel, gewichtung: raw.gewichtung, betrag: raw.betrag ?? (raw.betragMittel ?? 0) } });
    } catch { /* korruptes Gebot überspringen */ }
  }
  const gebote = geboteWithHmac.map(({ gebot }) => gebot);

  // Nur Slots OHNE standardgebot brauchen echte Gebote
  const totalErwartet = blob.slots
    .filter((s) => s.standardgebot === undefined)
    .reduce((s, slot) => s + slot.anzahl, 0);

  // Für allesDa nur Gebote für Slots ohne standardgebot zählen —
  // echte Gebote für Slots mit standardgebot (z.B. Kind 1 überschreibt Auto) sind ok und ignorierbar
  const labelsOhneStandard = new Set(
    blob.slots.filter((s) => s.standardgebot === undefined).map((s) => s.label),
  );
  const geboteOhneStandard = gebote.filter((g) => labelsOhneStandard.has(g.slotLabel));
  const allesDa = geboteOhneStandard.length === totalErwartet;

  // Duplikat-Check: Gebote pro Slot zählen und gegen slot.anzahl prüfen
  const zuVieleProSlot = blob.slots
    .filter((s) => s.standardgebot === undefined)
    .map((slot) => ({
      label: slot.label,
      eingegangen: gebote.filter((g) => g.slotLabel === slot.label).length,
      erwartet: slot.anzahl,
    }))
    .filter((s) => s.eingegangen > s.erwartet);
  const hatDuplikate = zuVieleProSlot.length > 0;

  // Synthetische Gebote für Slots mit standardgebot (fehlende Plätze auffüllen)
  const alleGebote: Gebot[] = [...gebote];
  for (const slot of blob.slots) {
    if (slot.standardgebot === undefined) continue;
    const echteDesSlots = gebote.filter((g) => g.slotLabel === slot.label).length;
    const fehlende = slot.anzahl - echteDesSlots;
    for (let i = 0; i < fehlende; i++) {
      alleGebote.push({
        emojiId: '—',
        slotLabel: slot.label,
        gewichtung: slot.gewichtung,
        betrag: slot.standardgebot,
        istStandard: true,
      });
    }
  }

  // Kopfdaten immer anzeigen
  document.getElementById('runde-name')!.textContent = blob.rundeName;
  document.getElementById('kz-gesamtkosten')!.textContent = formatEur(blob.gesamtkosten);

  // Duplikat-Warnung anzeigen (vor Berechnung)
  if (hatDuplikate) {
    const liste = document.getElementById('duplikat-liste')!;
    for (const s of zuVieleProSlot) {
      const li = document.createElement('li');
      li.textContent = `Slot „${s.label}": ${s.eingegangen} Gebote erhalten, ${s.erwartet} erwartet (+${s.eingegangen - s.erwartet})`;
      liste.appendChild(li);
    }
    document.getElementById('duplikat-box')!.classList.remove('hidden');
  }

  // Drei-Gebot-Modus: Status ermitteln und Gebote für Berechnung konvertieren
  let dreiGebotStatus: ReturnType<typeof ermittleDreiGebotStatus> | null = null;
  let geboteFuerBerechnung = alleGebote;
  if (dreiGebotModus && allesDa && dreiGebotTriples.length > 0) {
    dreiGebotStatus = ermittleDreiGebotStatus(blob.gesamtkosten, dreiGebotTriples);
    const konvertiert = dreiGebotZuGebote(dreiGebotStatus, dreiGebotTriples);
    // Standard-Slots weiterhin ergänzen
    const standardGebote = alleGebote.filter((g) => g.istStandard);
    geboteFuerBerechnung = [...konvertiert, ...standardGebote];
  }

  // Auswertung berechnen (nur wenn Gebote vorhanden)
  const auswertung = geboteFuerBerechnung.length > 0
    ? berechneAuswertung(blob.gesamtkosten, geboteFuerBerechnung, blob.slots)
    : null;

  // Richtwert für Anzeige + "fehlt"-Zeilen
  const summeAlleGewichtungen = blob.slots.reduce((s, sl) => s + sl.gewichtung * sl.anzahl, 0);
  const rawRichtwert = blob.gesamtkosten / summeAlleGewichtungen;
  document.getElementById('kz-richtwert')!.textContent = auswertung
    ? formatEur(auswertung.richtwert)
    : formatEur(Math.ceil(rawRichtwert * 100) / 100);
  // Summe Beiträge nur zeigen wenn kein Fehlbetrag (sonst rekonstruierbar)
  if (auswertung && auswertung.fehlbetrag <= 0.005) {
    document.getElementById('kz-summe-beitraege')!.textContent = formatEur(auswertung.summeBeitraege);
  }

  // Splid-Ausgaben-Map aufbauen (slotLabel → ausgaben)
  const ausgabenMap = new Map<string, number>();
  for (const slot of blob.slots) {
    if (slot.ausgaben !== undefined) ausgabenMap.set(slot.label, slot.ausgaben);
  }
  const hatSplidDaten = ausgabenMap.size > 0;

  // Ergebnisse nach Slot gruppieren für positionsbasierte Darstellung
  const ergebnisseBySlot = new Map<string, GebotErgebnis[]>();
  if (auswertung) {
    for (const e of auswertung.ergebnisse) {
      if (!ergebnisseBySlot.has(e.slotLabel)) ergebnisseBySlot.set(e.slotLabel, []);
      ergebnisseBySlot.get(e.slotLabel)!.push(e);
    }
  }

  // Container befüllen — alle Slot-Positionen (geboten / auto / fehlt)
  const slotsContainer = document.getElementById('slots-container')!;

  // Beiträge nur anzeigen wenn Runde vollständig, keine Duplikate, kein Fehlbetrag
  const zeigeBeitraege = allesDa && !hatDuplikate && auswertung !== null && auswertung.fehlbetrag <= 0.005;

  for (const slot of blob.slots) {
    const slotErgebnisse = ergebnisseBySlot.get(slot.label) ?? [];
    const richtwertAnteil = Math.ceil(slot.gewichtung * rawRichtwert * 100) / 100;
    const ausgaben = ausgabenMap.get(slot.label) ?? 0;

    const slotGeboteWithHmac = geboteWithHmac.filter(
      ({ gebot }) => gebot.slotLabel === slot.label && !gebot.istStandard,
    );

    const eingegangen = slotGeboteWithHmac.length;
    const erwartet = slot.anzahl;
    const autoAnzahl = slot.standardgebot !== undefined ? Math.max(0, erwartet - eingegangen) : 0;
    const zuViele = eingegangen > erwartet;
    const vollstaendig = (eingegangen + autoAnzahl) === erwartet;
    const autoVollstaendig = vollstaendig && autoAnzahl > 0;

    // Slot-Karte
    const karte = document.createElement('div');
    karte.className = 'border border-border rounded-xl overflow-hidden bg-surface-raised';

    // Slot-Header-Farbe
    const headerBg = zuViele
      ? 'bg-danger-subtle border-b border-danger-outline'
      : vollstaendig
        ? 'bg-success-subtle border-b border-success-outline'
        : 'bg-warning-subtle border-b border-warning-outline';
    const headerTextFarbe = zuViele
      ? 'text-danger-fg'
      : vollstaendig
        ? 'text-success-fg'
        : 'text-warning-fg';
    const headerIcon = zuViele ? '⚠️' : vollstaendig ? '✓' : '○';

    karte.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-1.5 ${headerBg}">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
            <span class="text-sm font-semibold ${headerTextFarbe} shrink-0">${slot.label}</span>
            <span class="text-xs text-fg-muted shrink-0">Faktor ${slot.gewichtung}x · ~${formatEur(richtwertAnteil)}</span>
          </div>
          <span class="text-xs font-semibold ${headerTextFarbe} shrink-0">${headerIcon} ${eingegangen}/${erwartet}${autoVollstaendig ? ' (auto)' : ''}</span>
        </div>
        <div class="slot-zeilen divide-y divide-border"></div>
      `;

    const zeilenContainer = karte.querySelector<HTMLDivElement>('.slot-zeilen')!;

    // Echte Gebote
    for (const { emojiHmac, gebot: g } of slotGeboteWithHmac) {
      const e = zeigeBeitraege ? slotErgebnisse.find((r) => r.emojiId === g.emojiId) : null;
      const zeile = document.createElement('div');
      zeile.className = 'flex flex-col px-3 py-1';
      zeile.dataset.emojiHmac = emojiHmac;
      zeile.innerHTML = `
          <div class="flex items-center gap-2 w-full">
            <span class="text-base w-16 shrink-0">${g.emojiId}</span>
            <span class="text-xs bg-success-tinted text-success-fg rounded px-1.5 py-0.5 font-medium shrink-0">geboten</span>
            ${zeigeBeitraege && e ? `
              <span class="hidden sm:inline text-xs text-fg-faint shrink-0">Beitrag</span>
              <span class="hidden sm:inline text-sm font-semibold text-fg shrink-0">${formatEur(e.solidarischerBeitrag)}</span>
            ` : ''}
            ${zeigeBeitraege && e && hatSplidDaten ? `
              <span class="hidden sm:inline text-xs text-fg-faint shrink-0">Ausgaben</span>
              <span class="hidden sm:inline text-xs font-semibold text-fg shrink-0">${formatEur(ausgaben)}</span>
              <span class="hidden sm:inline text-xs text-fg-faint shrink-0">Noch zu zahlen</span>
              <span class="hidden sm:inline text-xs font-semibold ${(e.solidarischerBeitrag - ausgaben) > 0.005 ? 'text-danger-fg' : 'text-success-fg'} shrink-0">${(e.solidarischerBeitrag - ausgaben) > 0 ? '+' : ''}${formatEur(e.solidarischerBeitrag - ausgaben)}</span>
            ` : ''}
            <span class="ml-auto"><button class="loeschen-btn w-6 h-6 flex items-center justify-center rounded-full text-fg-ghost hover:text-danger-fg hover:bg-danger-subtle transition-colors" data-emoji-hmac="${emojiHmac}" data-slot="${slot.label}" aria-label="Gebot löschen">×</button></span>
          </div>
          ${zeigeBeitraege && e ? `
            <div class="flex flex-col gap-0.5 pl-[4.5rem] sm:hidden pb-1">
              <div class="flex justify-between items-baseline">
                <span class="text-xs text-fg-faint">Beitrag</span>
                <span class="text-sm font-semibold text-fg">${formatEur(e.solidarischerBeitrag)}</span>
              </div>
              ${hatSplidDaten ? `
                <div class="flex justify-between items-baseline">
                  <span class="text-xs text-fg-faint">Ausgaben</span>
                  <span class="text-xs font-semibold text-fg">${formatEur(ausgaben)}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-xs text-fg-faint">Noch zu zahlen</span>
                  <span class="text-xs font-semibold ${(e.solidarischerBeitrag - ausgaben) > 0.005 ? 'text-danger-fg' : 'text-success-fg'}">${(e.solidarischerBeitrag - ausgaben) > 0 ? '+' : ''}${formatEur(e.solidarischerBeitrag - ausgaben)}</span>
                </div>
              ` : ''}
            </div>
          ` : ''}
        `;
      zeilenContainer.appendChild(zeile);
    }

    // Auto-Gebote
    if (slot.standardgebot !== undefined) {
      const standardErgebnisse = slotErgebnisse.filter((r) => r.istStandard);
      for (let i = 0; i < autoAnzahl; i++) {
        const e = zeigeBeitraege ? (standardErgebnisse[i] ?? null) : null;
        const nochZuZahlen = e ? e.solidarischerBeitrag - ausgaben : 0;
        const zeile = document.createElement('div');
        zeile.className = 'flex flex-col px-3 py-1';
        zeile.innerHTML = `
            <div class="flex items-center gap-2 w-full">
              <span class="text-base w-16 shrink-0 text-fg-ghost">—</span>
              <span class="text-xs bg-success-tinted text-success-fg rounded px-1.5 py-0.5 font-medium shrink-0">auto</span>
              ${e ? `
                <span class="hidden sm:inline text-xs text-fg-faint shrink-0">Beitrag</span>
                <span class="hidden sm:inline text-sm font-semibold text-fg shrink-0">${formatEur(e.solidarischerBeitrag)}</span>
              ` : ''}
              ${e && hatSplidDaten ? `
                <span class="hidden sm:inline text-xs text-fg-faint shrink-0">Ausgaben</span>
                <span class="hidden sm:inline text-xs font-semibold text-fg shrink-0">${formatEur(ausgaben)}</span>
                <span class="hidden sm:inline text-xs text-fg-faint shrink-0">Noch zu zahlen</span>
                <span class="hidden sm:inline text-xs font-semibold ${nochZuZahlen > 0.005 ? 'text-danger-fg' : 'text-success-fg'} shrink-0">${nochZuZahlen > 0 ? '+' : ''}${formatEur(nochZuZahlen)}</span>
              ` : ''}
            </div>
            ${e ? `
              <div class="flex flex-col gap-0.5 pl-[4.5rem] sm:hidden pb-1">
                <div class="flex justify-between items-baseline">
                  <span class="text-xs text-fg-faint">Beitrag</span>
                  <span class="text-sm font-semibold text-fg">${formatEur(e.solidarischerBeitrag)}</span>
                </div>
                ${hatSplidDaten ? `
                  <div class="flex justify-between items-baseline">
                    <span class="text-xs text-fg-faint">Ausgaben</span>
                    <span class="text-xs font-semibold text-fg">${formatEur(ausgaben)}</span>
                  </div>
                  <div class="flex justify-between items-baseline">
                    <span class="text-xs text-fg-faint">Noch zu zahlen</span>
                    <span class="text-xs font-semibold ${nochZuZahlen > 0.005 ? 'text-danger-fg' : 'text-success-fg'}">${nochZuZahlen > 0 ? '+' : ''}${formatEur(nochZuZahlen)}</span>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          `;
        zeilenContainer.appendChild(zeile);
      }
    }

    // Fehlende Gebote
    const fehlend = Math.max(0, erwartet - eingegangen - autoAnzahl);
    for (let i = 0; i < fehlend; i++) {
      const zeile = document.createElement('div');
      zeile.className = 'flex items-center gap-2 px-3 py-1';
      zeile.innerHTML = `
          <span class="text-base w-16 shrink-0 text-fg-ghost">—</span>
          <span class="text-xs bg-surface-elevated text-fg-muted rounded px-1.5 py-0.5 shrink-0">fehlt</span>
        `;
      zeilenContainer.appendChild(zeile);
    }

    slotsContainer.appendChild(karte);
  } // ← schließt for (const slot of blob.slots)


  slotsContainer.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.loeschen-btn');
    if (!btn) return;

    const emojiHmac = btn.dataset.emojiHmac!;

    btn.disabled = true;
    btn.textContent = '…';

    const res = await fetch(`/api/runde/${rundenId}/gebot`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emojiHmac, adminToken }),
    });

    if (res.ok) {
      const zeile = btn.closest<HTMLDivElement>('[data-emoji-hmac]')!;
      zeile.style.transition = 'opacity 200ms, transform 200ms';
      zeile.style.opacity = '0';
      zeile.style.transform = 'translateX(8px)';
      setTimeout(async () => {
        slotsContainer.innerHTML = '';
        await initAdmin();
      }, 220);
    } else {
      btn.disabled = false;
      btn.textContent = '×';
      const err = await res.json() as { error?: string };
      alert(err.error ?? 'Löschen fehlgeschlagen.');
    }
  });

  // Ausgleichszahlungen (nur wenn vollständig, kein Fehlbetrag, keine Duplikate, Ausgaben vorhanden)
  if (allesDa && !hatDuplikate && auswertung && auswertung.fehlbetrag <= 0.005 && ausgabenMap.size > 0) {
    const zahlungen = berechneAusgleich(auswertung.ergebnisse, ausgabenMap);
    if (zahlungen.length > 0) {
      // Hilfsmaps: emojiId → slotLabel (für Namensanzeige statt Emoji-ID)
      const emojiZuLabel = new Map<string, string>();
      for (const e of auswertung.ergebnisse) {
        if (!e.istStandard) emojiZuLabel.set(e.emojiId, e.slotLabel);
      }
      const liste = document.getElementById('ausgleich-liste')!;
      zahlungen.forEach((z, idx) => {
        const zeile = document.createElement('div');
        const vonLabel = emojiZuLabel.get(z.von) ?? z.von;
        const anLabel = emojiZuLabel.get(z.an) ?? z.an;
        zeile.className = `grid items-center gap-x-3 text-sm${idx < zahlungen.length - 1 ? ' pb-2 border-b border-border' : ''}`;
        zeile.style.gridTemplateColumns = '1fr auto 1fr auto';
        zeile.innerHTML = `
            <span class="text-fg-secondary text-right">${vonLabel}</span>
            <span class="text-fg-faint">→</span>
            <span class="text-fg-secondary">${anLabel}</span>
            <span class="font-semibold text-fg text-right">${formatEur(z.betrag)}</span>
          `;
        liste.appendChild(zeile);
      });
      document.getElementById('ausgleich-section')!.classList.remove('hidden');
    }
  }

  // Beitrag-Spalten einblenden wenn vollständig, keine Duplikate, kein Fehlbetrag
  if (allesDa && !hatDuplikate && auswertung && auswertung.fehlbetrag <= 0.005) {
    document.querySelectorAll('.vollstaendig-spalte').forEach((el) => el.classList.remove('hidden'));
    if (!hatSplidDaten) {
      document.querySelectorAll('.splid-spalte').forEach((el) => el.classList.add('hidden'));
    }
    if (hatSplidDaten) {
      document.querySelectorAll('.emoji-spalte').forEach((el) => el.classList.add('hidden'));
    }
  }

  // Status-Banner + Statuszeile
  // Gesamtbild: alle Slots zählen; Auto-Slots gelten als bereits erledigt
  const totalAlle = blob.slots.reduce((s, sl) => s + sl.anzahl, 0);
  const autoAnzahlGesamt = blob.slots
    .filter((s) => s.standardgebot !== undefined)
    .reduce((s, sl) => s + sl.anzahl, 0);
  const erledigt = autoAnzahlGesamt + geboteOhneStandard.length;
  const ausstehend = totalAlle - erledigt;

  if (hatDuplikate) {
    zeigeBanner('Auswertung pausiert — Doppelgebote bitte klären.', 'amber');
    document.getElementById('gebote-anzahl')!.textContent =
      `${geboteOhneStandard.length} von ${totalErwartet} Geboten eingegangen`;
  } else if (allesDa) {
    const fehlbetragVorhanden = auswertung && auswertung.fehlbetrag > 0.005;
    if (fehlbetragVorhanden) {
      zeigeBanner(`Fehlbetrag: ${formatEur(auswertung!.fehlbetrag)} — Runde muss wiederholt werden.`, 'red');
    } else if (dreiGebotStatus) {
      const statusTexte: Record<string, string> = {
        gruen: '🟢 Grün — Minimalgebote decken die Kosten. Auswertung mit Minimalgeboten.',
        gelb:  '🟡 Gelb — Erst mittlere Gebote decken die Kosten. Auswertung mit mittleren Geboten.',
        rot:   '🔴 Rot — Erst Maximalgebote decken die Kosten. Auswertung mit Maximalgeboten.',
        kritisch: '⚫ Kritisch — Selbst Maximalgebote reichen nicht. Auswertung mit Maximalgeboten als Näherung.',
      };
      const bannerFarbe = dreiGebotStatus === 'gruen' ? 'green' : dreiGebotStatus === 'kritisch' ? 'red' : 'amber';
      zeigeBanner(statusTexte[dreiGebotStatus], bannerFarbe);
    } else {
      zeigeBanner('Alle Beiträge vollständig. Auswertung abgeschlossen.', 'green');
    }
    document.getElementById('gebote-anzahl')!.textContent = '';
  } else {
    zeigeBanner(`${ausstehend} von ${totalAlle} Beiträge ausstehend.`, 'amber');
    document.getElementById('gebote-anzahl')!.textContent = '';
  }

  document.getElementById('zustand-laden')!.classList.add('hidden');
  document.getElementById('zustand-auswertung')!.classList.remove('hidden');

  // Runde wiederholen: Slot-Konfiguration in sessionStorage speichern und zu /neu navigieren
  document.getElementById('wiederholen-btn')!.addEventListener('click', () => {
    sessionStorage.setItem('rundeWiederholen', JSON.stringify({
      name: blob.rundeName,
      kosten: blob.gesamtkosten,
      slots: blob.slots.map(({ label, gewichtung, anzahl, standardgebot }) => ({
        label,
        gewichtung,
        anzahl,
        ...(standardgebot !== undefined ? { standardgebot } : {}),
      })),
    }));
    location.href = '/neu';
  });
}
