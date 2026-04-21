import {
  importPartKey,
  importAdminPubKey,
  importHmacKey,
  decrypt,
  encryptGebot,
  hmac,
} from '../lib/crypto';
import { EMOJIS, generiereEmojiId } from '../lib/solidarisch';
import { saveRunde, saveGebotLokal, getGebotSlot } from '../lib/storage';
import { zeigeFeedback, versteckeFeedback, formatEur } from '../lib/ui';

// EMOJIS is imported to ensure it is included in the module graph
void EMOJIS;

interface TeilnehmerBlob {
  rundeName: string;
  gesamtkosten: number;
  adminPubKey: string;
  hmacKey: string;
  slots: { label: string; gewichtung: number; anzahl: number; standardgebot?: number }[];
  dreiGebotModus?: boolean;
}

export async function initGebot(): Promise<void> {
  function zeigeFehler(msg: string) {
    document.getElementById('zustand-laden')!.classList.add('hidden');
    document.getElementById('zustand-formular')!.classList.add('hidden');
    document.getElementById('zustand-fehler')!.classList.remove('hidden');
    document.getElementById('fehler-text')!.textContent = msg;
  }

  // Fragment auslesen
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const partKeyB64 = params.get('pk');

  if (!partKeyB64) {
    zeigeFehler(
      'Kein Schlüssel im Link gefunden. Bitte verwende den vollständigen Teilnehmer-Link.',
    );
    return;
  }

  // Original-URL sichern bevor Fragment entfernt wird
  const originalUrl = window.location.href;

  // Fragment aus History entfernen
  history.replaceState(null, '', window.location.pathname);

  // Runden-ID aus URL
  const rundenId = window.location.pathname.split('/').filter(Boolean).pop()!;

  // Blob laden
  let blobData: { encTeilnehmerBlob: string; gebote: unknown[] };
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

  // Schlüssel importieren + entschlüsseln
  let blob: TeilnehmerBlob;
  try {
    const partKey = await importPartKey(partKeyB64);
    blob = JSON.parse(await decrypt(partKey, blobData.encTeilnehmerBlob)) as TeilnehmerBlob;
  } catch {
    zeigeFehler('Entschlüsselung fehlgeschlagen. Ist der Link vollständig?');
    return;
  }

  const adminPubKey = await importAdminPubKey(blob.adminPubKey);
  const hmacKey = await importHmacKey(blob.hmacKey);

  // Runde im localStorage speichern (Teilnehmer:in)
  saveRunde({
    id: rundenId,
    name: blob.rundeName,
    hinzugefuegtAm: new Date().toISOString(),
    teilnehmerLink: originalUrl,
  });

  // Richtwert berechnen
  const summeGewichtungen = blob.slots.reduce(
    (s, slot) => s + slot.gewichtung * slot.anzahl,
    0,
  );
  const rawRichtwert = summeGewichtungen > 0 ? blob.gesamtkosten / summeGewichtungen : 0;

  // Seite befüllen
  document.getElementById('runde-name')!.textContent = blob.rundeName;
  document.getElementById('gesamtkosten')!.textContent = formatEur(blob.gesamtkosten);

  // localStorage-Helfer: speichert welche Slots von diesem Gerät bereits geboten wurden
  function lsKey(label: string) {
    return `fairshare-slot-${rundenId}-${encodeURIComponent(label)}`;
  }
  function slotBereitsGeboten(label: string): boolean {
    return localStorage.getItem(lsKey(label)) === '1';
  }
  function slotAlsGebotenMarkieren(label: string) {
    localStorage.setItem(lsKey(label), '1');
  }

  // Hilfsfunktion: Slot-Auswahl-Radios in einen Container rendern
  function renderSlotAuswahl(containerId: string, nameAttr: string) {
    const container = document.getElementById(containerId)!;
    blob.slots.forEach((slot, idx) => {
      const richtwertSlot = Math.ceil(rawRichtwert * slot.gewichtung * 100) / 100;
      const bereitsGeboten = slotBereitsGeboten(slot.label);
      const label = document.createElement('label');
      label.className =
        'flex items-center gap-3 bg-surface-raised border border-border rounded-lg p-3 cursor-pointer hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-success-subtle dark:has-[:checked]:bg-green-950/40 transition-colors';
      label.innerHTML = `
          <input type="radio" name="${nameAttr}" value="${idx}" class="accent-brand" ${idx === 0 ? 'checked' : ''} />
          <span class="flex-1">
            <span class="text-sm font-medium text-fg-strong">${slot.label}</span>
            <span class="text-xs text-fg-muted ml-2">Richtwert: ${formatEur(richtwertSlot)}</span>
            ${bereitsGeboten && nameAttr === 'slot' ? '<span class="text-success-fg ml-1 text-xs">✓ abgegeben</span>' : ''}
          </span>
        `;
      container.appendChild(label);
    });
  }

  renderSlotAuswahl('slot-auswahl', 'slot');
  renderSlotAuswahl('slot-auswahl-korrektur', 'slot-korrektur');

  // Betrag-Feld + Richtwert-Hinweis bei Slot-Wechsel aktualisieren
  function betragFeldAktualisieren(slotIdx: number, betragId: string, hinweisId: string) {
    const slot = blob.slots[slotIdx];
    if (!slot) return;
    const richtwertSlot = Math.ceil(rawRichtwert * slot.gewichtung * 100) / 100;
    const betragInput = document.getElementById(betragId) as HTMLInputElement;
    const hinweis = document.getElementById(hinweisId)!;
    if (slot.standardgebot !== undefined) {
      betragInput.value = slot.standardgebot.toFixed(2);
      hinweis.textContent = `Standardgebot: ${formatEur(slot.standardgebot)} · Richtwert: ${formatEur(richtwertSlot)}`;
    } else {
      betragInput.value = '';
      hinweis.textContent = `Richtwert für diesen Slot: ${formatEur(richtwertSlot)}`;
    }
  }

  document.getElementById('slot-auswahl')!.addEventListener('change', (e) => {
    const radio = e.target as HTMLInputElement;
    if (radio.name === 'slot') {
      betragFeldAktualisieren(parseInt(radio.value, 10), 'betrag', 'betrag-richtwert-hinweis');
      // Slot gewechselt → Duplikat-Warnung auf Abbrechen-Zustand zurücksetzen
      const duplikatWarnung = document.getElementById('duplikat-warnung')!;
      if (!duplikatWarnung.classList.contains('hidden')) {
        document.getElementById('duplikat-schritt1')!.classList.remove('hidden');
        document.getElementById('duplikat-schritt2')!.classList.add('hidden');
        duplikatWarnung.classList.add('hidden');
      }
    }
  });
  document.getElementById('slot-auswahl-korrektur')!.addEventListener('change', (e) => {
    const radio = e.target as HTMLInputElement;
    if (radio.name === 'slot-korrektur') betragFeldAktualisieren(parseInt(radio.value, 10), 'korrektur-betrag', 'korrektur-richtwert-hinweis');
  });

  betragFeldAktualisieren(0, 'betrag', 'betrag-richtwert-hinweis');
  betragFeldAktualisieren(0, 'korrektur-betrag', 'korrektur-richtwert-hinweis');

  // Tab-Steuerung
  const tabAbgeben = document.getElementById('tab-abgeben') as HTMLButtonElement;
  const tabKorrigieren = document.getElementById('tab-korrigieren') as HTMLButtonElement;
  const panelAbgeben = document.getElementById('panel-abgeben')!;
  const panelKorrigieren = document.getElementById('panel-korrigieren')!;

  function zeigeTab(tab: 'abgeben' | 'korrigieren') {
    const istAbgeben = tab === 'abgeben';
    tabAbgeben.classList.toggle('border-brand', istAbgeben);
    tabAbgeben.classList.toggle('text-brand', istAbgeben);
    tabAbgeben.classList.toggle('border-transparent', !istAbgeben);
    tabAbgeben.classList.toggle('text-fg-muted', !istAbgeben);
    tabKorrigieren.classList.toggle('border-brand', !istAbgeben);
    tabKorrigieren.classList.toggle('text-brand', !istAbgeben);
    tabKorrigieren.classList.toggle('border-transparent', istAbgeben);
    tabKorrigieren.classList.toggle('text-fg-muted', istAbgeben);
    panelAbgeben.classList.toggle('hidden', !istAbgeben);
    panelKorrigieren.classList.toggle('hidden', istAbgeben);
  }

  tabAbgeben.addEventListener('click', () => zeigeTab('abgeben'));
  tabKorrigieren.addEventListener('click', () => zeigeTab('korrigieren'));

  // Formular anzeigen
  document.getElementById('zustand-laden')!.classList.add('hidden');
  const zustandFormular = document.getElementById('zustand-formular')!;
  zustandFormular.classList.remove('hidden');
  zustandFormular.classList.add('animate-fade-in');

  // Drei-Gebot-Modus: UI umschalten
  const dreiGebotModus = blob.dreiGebotModus === true;
  document.getElementById('betrag-einzel')!.classList.toggle('hidden', dreiGebotModus);
  document.getElementById('betrag-drei')!.classList.toggle('hidden', !dreiGebotModus);
  document.getElementById('korrektur-betrag-einzel')!.classList.toggle('hidden', dreiGebotModus);
  document.getElementById('korrektur-betrag-drei')!.classList.toggle('hidden', !dreiGebotModus);

  // Korrektur-Tab einblenden falls bereits geboten
  if (blob.slots.some(s => slotBereitsGeboten(s.label))) {
    document.getElementById('tab-korrigieren')!.classList.remove('hidden');
  }

  // ── Tab 1: Gebot abgeben ──────────────────────────────────────────────────
  const gebotForm = document.getElementById('gebot-form') as HTMLFormElement;
  const gebotBtn = document.getElementById('gebot-btn') as HTMLButtonElement;
  const duplikatWarnung = document.getElementById('duplikat-warnung') as HTMLDivElement;
  const duplikatAbbrechen = document.getElementById('duplikat-abbrechen') as HTMLButtonElement;
  const duplikatWeiter = document.getElementById('duplikat-weiter') as HTMLButtonElement;
  const duplikatSchritt1 = document.getElementById('duplikat-schritt1') as HTMLDivElement;
  const duplikatSchritt2 = document.getElementById('duplikat-schritt2') as HTMLDivElement;
  const duplikatKorrigieren = document.getElementById('duplikat-korrigieren') as HTMLButtonElement;
  const duplikatBestaetigen = document.getElementById('duplikat-bestaetigen') as HTMLButtonElement;

  function zeigeBestaetigung(emojiId: string, istKorrektur: boolean) {
    const emojiAnzeige = document.getElementById('emoji-anzeige')!;
    emojiAnzeige.textContent = emojiId;
    emojiAnzeige.classList.add('animate-pop-in');
    document.getElementById('bestaetigung-titel')!.textContent = istKorrektur ? 'Gebot korrigiert' : 'Gebot abgegeben';
    document.getElementById('bestaetigung-text')!.textContent = istKorrektur
      ? 'Dein Gebot wurde erfolgreich ersetzt. Deine Emoji-ID bleibt dieselbe.'
      : 'Speichere sie — du brauchst sie, um dein Gebot zu korrigieren und deinen Eintrag in der Auswertung wiederzufinden.';
    document.getElementById('zustand-formular')!.classList.add('hidden');
    const zustandBestaetigung = document.getElementById('zustand-bestaetigung')!;
    zustandBestaetigung.classList.remove('hidden');
    zustandBestaetigung.classList.add('animate-fade-in');
  }

  // Kernfunktion: Gebot tatsächlich einreichen (mit Auto-Retry bei Emoji-Kollision)
  async function gebot_einreichen() {
    versteckeFeedback('gebot-fehler');
    duplikatWarnung.classList.add('hidden');
    gebotBtn.disabled = true;
    gebotBtn.textContent = 'Verschlüssele…';

    try {
      const selectedIdx = parseInt(
        (gebotForm.querySelector('input[name="slot"]:checked') as HTMLInputElement).value,
        10,
      );
      const selectedSlot = blob.slots[selectedIdx];

      let payload: object;
      if (dreiGebotModus) {
        const betragMin = parseFloat((document.getElementById('betrag-min') as HTMLInputElement).value.replace(',', '.'));
        const betragMittel = parseFloat((document.getElementById('betrag-mittel') as HTMLInputElement).value.replace(',', '.'));
        const betragMax = parseFloat((document.getElementById('betrag-max') as HTMLInputElement).value.replace(',', '.'));
        if (isNaN(betragMin) || isNaN(betragMittel) || isNaN(betragMax) || betragMin <= 0 || betragMittel <= 0 || betragMax <= 0) {
          zeigeFeedback('gebot-fehler', 'Bitte alle drei Beträge ausfüllen.', 'rot');
          return;
        }
        if (betragMin > betragMittel || betragMittel > betragMax) {
          zeigeFeedback('gebot-fehler', 'Die Beträge müssen aufsteigend sein: Min ≤ Mittel ≤ Max.', 'rot');
          return;
        }
        payload = { slotLabel: selectedSlot.label, gewichtung: selectedSlot.gewichtung, betragMin, betragMittel, betragMax };
      } else {
        const betrag = parseFloat((gebotForm.querySelector('#betrag') as HTMLInputElement).value.replace(',', '.'));
        if (!betrag || betrag <= 0) {
          zeigeFeedback('gebot-fehler', 'Bitte einen gültigen Betrag eingeben.', 'rot');
          return;
        }
        payload = { slotLabel: selectedSlot.label, gewichtung: selectedSlot.gewichtung, betrag };
      }

      let emojiId: string;
      let emojiHmac: string;
      let encGebot: string;
      let res: Response;
      let versuche = 0;

      // Auto-Retry bei zufälliger Emoji-ID-Kollision (max. 3 Versuche)
      do {
        versuche++;
        emojiId = generiereEmojiId();
        emojiHmac = await hmac(hmacKey, emojiId);
        encGebot = await encryptGebot(adminPubKey, JSON.stringify({ emojiId, ...payload }));
        res = await fetch(`/api/runde/${rundenId}/gebot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emojiHmac, encGebot }),
        });
      } while (res.status === 409 && versuche < 3);

      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        zeigeFeedback('gebot-fehler', error ?? 'Fehler beim Speichern', 'rot');
        return;
      }

      slotAlsGebotenMarkieren(selectedSlot.label);
      saveGebotLokal(rundenId, emojiId!, selectedSlot.label);
      document.getElementById('tab-korrigieren')!.classList.remove('hidden');
      zeigeBestaetigung(emojiId!, false);
    } catch (err) {
      zeigeFeedback('gebot-fehler', 'Unerwarteter Fehler. Bitte versuche es erneut.', 'rot');
      console.error(err);
    } finally {
      gebotBtn.disabled = false;
      gebotBtn.textContent = 'Gebot abgeben';
    }
  }

  gebotForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedIdx = parseInt(
      (gebotForm.querySelector('input[name="slot"]:checked') as HTMLInputElement).value,
      10,
    );
    const selectedSlot = blob.slots[selectedIdx];

    if (slotBereitsGeboten(selectedSlot.label)) {
      duplikatWarnung.classList.remove('hidden');
      return;
    }

    await gebot_einreichen();
  });

  function duplikatZuruecksetzen() {
    duplikatSchritt1.classList.remove('hidden');
    duplikatSchritt2.classList.add('hidden');
    duplikatWarnung.classList.add('hidden');
  }

  duplikatAbbrechen.addEventListener('click', () => {
    duplikatZuruecksetzen();
  });
  duplikatWeiter.addEventListener('click', () => {
    duplikatSchritt1.classList.add('hidden');
    duplikatSchritt2.classList.remove('hidden');
  });
  duplikatKorrigieren.addEventListener('click', () => {
    duplikatZuruecksetzen();
    tabKorrigieren.classList.remove('hidden');
    zeigeTab('korrigieren');
    document.getElementById('korrektur-emoji')?.focus();
  });
  duplikatBestaetigen.addEventListener('click', async () => {
    duplikatZuruecksetzen();
    await gebot_einreichen();
  });

  // Korrektur-Link (immer sichtbar, öffnet Korrektur-Tab)
  document.getElementById('korrektur-link-btn')!.addEventListener('click', () => {
    tabKorrigieren.classList.remove('hidden');
    zeigeTab('korrigieren');
    document.getElementById('korrektur-emoji')?.focus();
  });

  // ── Tab 2: Gebot korrigieren ──────────────────────────────────────────────
  const korrekturForm = document.getElementById('korrektur-form') as HTMLFormElement;
  const korrekturBtn = document.getElementById('korrektur-btn') as HTMLButtonElement;
  const korrekturEmojiInput = document.getElementById('korrektur-emoji') as HTMLInputElement;
  const korrekturSlotHinweis = document.getElementById('korrektur-slot-hinweis')!;

  function aktualisiereKorrekturSlot() {
    const emojiId = korrekturEmojiInput.value.trim();
    const bekannterSlot = emojiId ? getGebotSlot(rundenId, emojiId) : null;
    const radios = korrekturForm.querySelectorAll<HTMLInputElement>('input[name="slot-korrektur"]');

    if (bekannterSlot) {
      const slotIdx = blob.slots.findIndex((s) => s.label === bekannterSlot);
      if (slotIdx < 0) {
        radios.forEach((r) => { r.disabled = false; });
        korrekturSlotHinweis.textContent = 'Dein ursprünglicher Slot existiert nicht mehr — bitte wähle einen Slot.';
        korrekturSlotHinweis.className = 'text-xs text-warning-fg mt-1';
        return;
      }
      radios.forEach((r, i) => {
        r.checked = i === slotIdx;
        r.disabled = true;
      });
      korrekturSlotHinweis.textContent = `Slot aus deinem ursprünglichen Gebot: ${bekannterSlot}`;
      korrekturSlotHinweis.className = 'text-xs text-brand mt-1';
      if (!dreiGebotModus) betragFeldAktualisieren(slotIdx, 'korrektur-betrag', 'korrektur-richtwert-hinweis');
    } else {
      radios.forEach((r) => { r.disabled = false; });
      if (emojiId) {
        korrekturSlotHinweis.textContent = 'Gebot auf diesem Gerät nicht gefunden — wähle denselben Slot wie beim ursprünglichen Gebot.';
        korrekturSlotHinweis.className = 'text-xs text-warning-fg mt-1';
      } else {
        korrekturSlotHinweis.textContent = '';
        korrekturSlotHinweis.className = '';
      }
    }
  }

  korrekturEmojiInput.addEventListener('input', aktualisiereKorrekturSlot);

  korrekturForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    versteckeFeedback('korrektur-fehler');
    korrekturBtn.disabled = true;
    korrekturBtn.textContent = 'Verschlüssele…';

    try {
      const emojiId = (document.getElementById('korrektur-emoji') as HTMLInputElement).value.trim();
      const selectedIdx = parseInt(
        (korrekturForm.querySelector('input[name="slot-korrektur"]:checked') as HTMLInputElement).value,
        10,
      );
      const selectedSlot = blob.slots[selectedIdx];

      let korrekturPayload: object;
      if (dreiGebotModus) {
        const betragMin = parseFloat((document.getElementById('korrektur-betrag-min') as HTMLInputElement).value.replace(',', '.'));
        const betragMittel = parseFloat((document.getElementById('korrektur-betrag-mittel') as HTMLInputElement).value.replace(',', '.'));
        const betragMax = parseFloat((document.getElementById('korrektur-betrag-max') as HTMLInputElement).value.replace(',', '.'));
        if (isNaN(betragMin) || isNaN(betragMittel) || isNaN(betragMax) || betragMin <= 0 || betragMittel <= 0 || betragMax <= 0) {
          zeigeFeedback('korrektur-fehler', 'Bitte alle drei Beträge ausfüllen.', 'rot');
          return;
        }
        if (betragMin > betragMittel || betragMittel > betragMax) {
          zeigeFeedback('korrektur-fehler', 'Die Beträge müssen aufsteigend sein: Min ≤ Mittel ≤ Max.', 'rot');
          return;
        }
        korrekturPayload = { slotLabel: selectedSlot.label, gewichtung: selectedSlot.gewichtung, betragMin, betragMittel, betragMax };
      } else {
        const betrag = parseFloat((document.getElementById('korrektur-betrag') as HTMLInputElement).value.replace(',', '.'));
        if (isNaN(betrag) || betrag <= 0) {
          zeigeFeedback('korrektur-fehler', 'Bitte einen gültigen Betrag eingeben.', 'rot');
          return;
        }
        korrekturPayload = { slotLabel: selectedSlot.label, gewichtung: selectedSlot.gewichtung, betrag };
      }

      const emojiHmac = await hmac(hmacKey, emojiId);
      const encGebot = await encryptGebot(adminPubKey, JSON.stringify({ emojiId, ...korrekturPayload }));

      const res = await fetch(`/api/runde/${rundenId}/gebot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emojiHmac, encGebot, isCorrection: true }),
      });

      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        zeigeFeedback(
          'korrektur-fehler',
          res.status === 404 ? 'Emoji-ID nicht gefunden — Tippfehler?' : error ?? 'Fehler beim Speichern',
          'rot'
        );
        return;
      }

      zeigeBestaetigung(emojiId, true);
    } catch (err) {
      zeigeFeedback('korrektur-fehler', 'Unerwarteter Fehler. Bitte versuche es erneut.', 'rot');
      console.error(err);
    } finally {
      korrekturBtn.disabled = false;
      korrekturBtn.textContent = 'Gebot ersetzen';
    }
  });
}
