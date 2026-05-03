import {
  generatePartKey,
  generateAdminKeyPair,
  generateHmacKey,
  encrypt,
  exportKey,
} from '../lib/crypto';
import { detectAndParse } from '../lib/basis-import';
import type { ImportSlot } from '../lib/basis-import';
import { saveRunde } from '../lib/storage';
import { zeigeFeedback, versteckeFeedback, formatEur } from '../lib/ui';

export function initNeu(): void {
  function formatBetrag(n: number): string {
    return n.toFixed(2).replace('.', ',');
  }
  function parseGeld(s: string): number {
    return parseFloat(s.replace(',', '.'));
  }

  const form = document.getElementById('runde-form') as HTMLFormElement;
  const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
  const formBereich = document.getElementById('form-bereich') as HTMLDivElement;
  const ergebnisBereich = document.getElementById('ergebnis-bereich') as HTMLDivElement;
  const slotsContainer = document.getElementById('slots-container') as HTMLDivElement;
  const ausgabenLink = document.getElementById('ausgaben-link') as HTMLButtonElement;

  // Zähler für eindeutige Radio-Button-Namen
  let slotCounter = 1;
  let ausgabenSichtbar = false;

  function setzeAusgabenSichtbarkeit(sichtbar: boolean) {
    slotsContainer.querySelectorAll<HTMLDivElement>('.ausgaben-inline').forEach((zeile) => {
      zeile.classList.toggle('hidden', !sichtbar);
    });
    ausgabenLink.textContent = sichtbar ? 'Ausgaben ausblenden' : '+ Ausgaben erfassen';
    ausgabenLink.setAttribute('aria-expanded', String(sichtbar));
  }

  ausgabenLink.addEventListener('click', () => {
    ausgabenSichtbar = !ausgabenSichtbar;
    setzeAusgabenSichtbarkeit(ausgabenSichtbar);
  });

  function aktualisiereEntfernenButtons() {
    const btns = slotsContainer.querySelectorAll<HTMLButtonElement>('.slot-entfernen');
    btns.forEach((btn) => {
      btn.classList.toggle('hidden', btns.length <= 1);
    });
  }

  function aktualisiereRichtwert() {
    const gesamtkosten = parseGeld(
      (form.querySelector('#gesamtkosten') as HTMLInputElement).value,
    );
    if (!gesamtkosten || gesamtkosten <= 0) return;

    const slotEls = [...slotsContainer.querySelectorAll<HTMLDivElement>('.slot-eintrag')];
    const summeGewichtungen = slotEls.reduce((s, el) => {
      const g = parseFloat((el.querySelector('[name="gewichtung[]"]') as HTMLInputElement).value) || 0;
      const a = parseInt((el.querySelector('[name="anzahl[]"]') as HTMLInputElement).value) || 0;
      return s + g * a;
    }, 0);
    if (summeGewichtungen <= 0) return;

    const rawRichtwert = gesamtkosten / summeGewichtungen;

    slotEls.forEach((el) => {
      const g = parseFloat((el.querySelector('[name="gewichtung[]"]') as HTMLInputElement).value) || 1;
      const richtwertSlot = Math.ceil(rawRichtwert * g * 100) / 100;

      const stdInput = el.querySelector<HTMLInputElement>('[name="standardgebot[]"]');
      if (stdInput && stdInput.dataset.auto === 'true') {
        stdInput.value = formatBetrag(richtwertSlot);
      }

      const richtwertAnzeige = el.querySelector<HTMLSpanElement>('.standardgebot-richtwert');
      if (richtwertAnzeige) {
        richtwertAnzeige.textContent = `Richtwert: ${formatEur(richtwertSlot)}`;
      }
    });
  }

  document.getElementById('gesamtkosten')!.addEventListener('input', aktualisiereRichtwert);

  form.addEventListener('blur', (e) => {
    const t = e.target as HTMLInputElement;
    if (!['gesamtkosten', 'ausgaben[]', 'standardgebot[]'].includes(t.name)) return;
    if (t.value === '') return;
    const v = parseFloat(t.value.replace(',', '.'));
    if (isNaN(v) || v < 0) { t.value = ''; return; }
    t.value = formatBetrag(v);
  }, true);

  const presetNamen: Record<string, string> = { '1.0': 'Erwachsen', '0.75': 'Ermäßigt', '0.25': 'Kind' };
  function aktualisierePresetPlaceholder(slotEl: HTMLElement) {
    const labelInput = slotEl.querySelector<HTMLInputElement>('[name="label[]"]');
    if (!labelInput) return;
    const radio = slotEl.querySelector<HTMLInputElement>('.slot-gewichtung-radio:checked');
    labelInput.placeholder = presetNamen[radio?.value ?? ''] ?? 'Beitrag';
  }

  slotsContainer.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'standardgebot[]') {
      target.dataset.auto = 'false';
    } else if (target.name === 'anzahl[]') {
      aktualisiereRichtwert();
    } else if (target.classList.contains('slot-gewichtung-manuell')) {
      // Manuell-Eingabe → hidden input aktualisieren
      const eintrag = target.closest('.slot-eintrag') as HTMLDivElement;
      const hiddenInput = eintrag.querySelector<HTMLInputElement>('[name="gewichtung[]"]');
      if (hiddenInput && target.value) {
        hiddenInput.value = target.value.replace(',', '.');
        aktualisiereRichtwert();
      }
    }
  });

  slotsContainer.addEventListener('blur', (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.classList.contains('slot-gewichtung-manuell') || target.readOnly) return;
    const v = parseFloat(target.value.replace(',', '.'));
    if (isNaN(v) || v <= 0) {
      target.value = '';
      const eintrag = target.closest('.slot-eintrag') as HTMLDivElement;
      const hiddenInput = eintrag?.querySelector<HTMLInputElement>('[name="gewichtung[]"]');
      if (hiddenInput) hiddenInput.value = '';
    }
  }, true);

  slotsContainer.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;

    // Gewichtungs-Radio
    if (target.classList.contains('slot-gewichtung-radio')) {
      const eintrag = target.closest('.slot-eintrag') as HTMLDivElement;
      const hiddenInput = eintrag.querySelector<HTMLInputElement>('[name="gewichtung[]"]');
      const manuellInput = eintrag.querySelector<HTMLInputElement>('.slot-gewichtung-manuell');
      aktualisierePresetPlaceholder(eintrag);
      if (target.value === 'manuell') {
        if (manuellInput) {
          manuellInput.readOnly = false;
          manuellInput.classList.remove('opacity-50', 'cursor-not-allowed');
          if (hiddenInput && manuellInput.value) hiddenInput.value = manuellInput.value;
        }
      } else {
        if (manuellInput) {
          manuellInput.value = target.value;
          manuellInput.readOnly = true;
          manuellInput.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (hiddenInput) hiddenInput.value = target.value;
        aktualisiereRichtwert();
      }
      return;
    }

    // Standardgebot-Checkbox
    if (!target.classList.contains('standardgebot-checkbox')) return;
    const eintrag = target.closest('.slot-eintrag') as HTMLDivElement;
    const eingabe = eintrag.querySelector('.standardgebot-eingabe') as HTMLDivElement;
    const stdInput = eintrag.querySelector<HTMLInputElement>('[name="standardgebot[]"]');
    if (target.checked) {
      eingabe.classList.remove('hidden');
    } else {
      eingabe.classList.add('hidden');
      if (stdInput) {
        stdInput.value = '';
        stdInput.dataset.auto = 'true';
      }
    }
  });

  // Slot entfernen (delegiert)
  slotsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('slot-entfernen')) return;
    const eintrag = target.closest('.slot-eintrag') as HTMLDivElement;
    eintrag.remove();
    aktualisiereEntfernenButtons();
  });

  // ---------------------------------------------------------------------------
  // Power-Menü
  // ---------------------------------------------------------------------------

  const powerMenuBtn = document.getElementById('power-menu-btn')!;
  const powerMenu = document.getElementById('power-menu')!;

  function openPowerMenu() {
    powerMenu.classList.remove('hidden');
    powerMenuBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', closePowerMenuOnOutsideClick);
  }

  function closePowerMenu() {
    powerMenu.classList.add('hidden');
    document.getElementById('import-info-popover')?.classList.add('hidden');
    powerMenuBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', closePowerMenuOnOutsideClick);
  }

  function closePowerMenuOnOutsideClick(e: MouseEvent) {
    if (!powerMenuBtn.contains(e.target as Node) && !powerMenu.contains(e.target as Node)) {
      closePowerMenu();
    }
  }

  powerMenuBtn.addEventListener('click', () => {
    powerMenu.classList.contains('hidden') ? openPowerMenu() : closePowerMenu();
  });

  // ---------------------------------------------------------------------------
  // Datei-Import (Splid oder Basis-Format)
  // ---------------------------------------------------------------------------

  const splidFileInput = document.getElementById('splid-file') as HTMLInputElement;

  document.getElementById('splid-import-btn')!.addEventListener('click', () => {
    closePowerMenu();
    splidFileInput.click();
  });

  document.getElementById('import-info-btn')!.addEventListener('click', () => {
    document.getElementById('import-info-popover')!.classList.toggle('hidden');
  });

  splidFileInput.addEventListener('change', async () => {
    const file = splidFileInput.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const result = await detectAndParse(buffer, file.name);

      if (result.format === 'splid') {
        (form.querySelector('#rundeName') as HTMLInputElement).value = result.rundenname;
      }
      (form.querySelector('#gesamtkosten') as HTMLInputElement).value = formatBetrag(result.gesamtkosten);

      const alleSlots = slotsContainer.querySelectorAll<HTMLDivElement>('.slot-eintrag');
      alleSlots.forEach((s, i) => { if (i > 0) s.remove(); });

      const ersterSlot = slotsContainer.querySelector('.slot-eintrag') as HTMLDivElement;

      function befuelleSlot(slotEl: HTMLDivElement, slot: ImportSlot) {
        (slotEl.querySelector('[name="label[]"]') as HTMLInputElement).value = slot.name;
        (slotEl.querySelector('[name="ausgaben[]"]') as HTMLInputElement).value = formatBetrag(slot.ausgaben);
        setzeGewichtungRadio(slotEl, slot.gewichtung);
        (slotEl.querySelector('[name="anzahl[]"]') as HTMLInputElement).value = String(slot.anzahl);
        if (slot.standardgebot !== undefined) {
          const checkbox = slotEl.querySelector<HTMLInputElement>('.standardgebot-checkbox');
          const eingabe = slotEl.querySelector<HTMLDivElement>('.standardgebot-eingabe');
          const stdInput = slotEl.querySelector<HTMLInputElement>('[name="standardgebot[]"]');
          if (checkbox) checkbox.checked = true;
          if (eingabe) eingabe.classList.remove('hidden');
          if (stdInput) {
            stdInput.value = formatBetrag(slot.standardgebot);
            stdInput.dataset.auto = 'false';
          }
        }
      }

      befuelleSlot(ersterSlot, result.slots[0]);

      for (let i = 1; i < result.slots.length; i++) {
        const vorlage = slotsContainer.querySelector('.slot-eintrag') as HTMLDivElement;
        const klon = vorlage.cloneNode(true) as HTMLDivElement;
        const uid = `gw-slot-${slotCounter++}`;
        klon.querySelectorAll<HTMLInputElement>('.slot-gewichtung-radio').forEach(r => { r.name = uid; });
        befuelleSlot(klon, result.slots[i]);
        aktualisierePresetPlaceholder(klon);
        slotsContainer.appendChild(klon);
      }

      aktualisiereEntfernenButtons();
      ausgabenSichtbar = true;
      setzeAusgabenSichtbarkeit(true);
      aktualisiereRichtwert();

      const namen = result.slots.map(s => s.name).join(', ');
      const einheit = result.format === 'splid' ? 'Personen' : 'Slots';
      zeigeFeedback('splid-erfolg', `${result.slots.length} ${einheit} importiert: ${namen}`, 'gruen');
    } catch (err) {
      zeigeFeedback('splid-fehler', (err as Error).message, 'rot');
    }

    splidFileInput.value = '';
  });

  // ---------------------------------------------------------------------------
  // Slot hinzufügen
  // ---------------------------------------------------------------------------

  document.getElementById('slot-hinzufuegen')!.addEventListener('click', () => {
    const vorlage = slotsContainer.querySelector('.slot-eintrag') as HTMLDivElement;
    const klon = vorlage.cloneNode(true) as HTMLDivElement;

    // Felder zurücksetzen
    const uid = `gw-slot-${slotCounter++}`;
    klon.querySelectorAll<HTMLInputElement>('.slot-gewichtung-radio').forEach((r, i) => {
      r.name = uid;
      r.checked = i === 0; // Erwachsen vorauswählen
    });
    klon.querySelectorAll<HTMLInputElement>('input[name="label[]"]').forEach(el => { el.value = ''; });
    klon.querySelectorAll<HTMLInputElement>('input[name="anzahl[]"]').forEach(el => { el.value = '1'; });
    klon.querySelectorAll<HTMLInputElement>('input[name="ausgaben[]"]').forEach(el => { el.value = ''; });
    klon.querySelectorAll<HTMLInputElement>('[name="gewichtung[]"]').forEach(el => { el.value = '1'; });
    // Gewichtung-Feld: Erwachsen vorauswählen → readonly + ausgegraut
    klon.querySelectorAll<HTMLInputElement>('.slot-gewichtung-manuell').forEach(el => {
      el.value = '1';
      el.readOnly = true;
      el.classList.add('opacity-50', 'cursor-not-allowed');
    });

    // Standardgebot zurücksetzen
    const stdCheckbox = klon.querySelector<HTMLInputElement>('.standardgebot-checkbox');
    if (stdCheckbox) stdCheckbox.checked = false;
    const stdEingabe = klon.querySelector<HTMLDivElement>('.standardgebot-eingabe');
    if (stdEingabe) stdEingabe.classList.add('hidden');
    const stdInput = klon.querySelector<HTMLInputElement>('[name="standardgebot[]"]');
    if (stdInput) { stdInput.value = ''; stdInput.dataset.auto = 'true'; }
    const richtwertAnzeige = klon.querySelector<HTMLSpanElement>('.standardgebot-richtwert');
    if (richtwertAnzeige) richtwertAnzeige.textContent = '';

    // Ausgaben-Inline entsprechend aktuellem Zustand
    const ausgabenInline = klon.querySelector('.ausgaben-inline') as HTMLDivElement;
    ausgabenInline.classList.toggle('hidden', !ausgabenSichtbar);

    // Details schließen für neuen Slot
    const details = klon.querySelector<HTMLDetailsElement>('.slot-erweitert-details');
    if (details) details.open = false;

    aktualisierePresetPlaceholder(klon);
    slotsContainer.appendChild(klon);
    klon.classList.add('animate-slide-down');
    aktualisiereEntfernenButtons();
    aktualisiereRichtwert();
  });

  // ---------------------------------------------------------------------------
  // Runde wiederholen (Vorausfüllen aus sessionStorage)
  // ---------------------------------------------------------------------------

  function setzeGewichtungRadio(slotEl: HTMLDivElement, gewichtung: number) {
    const hiddenInput = slotEl.querySelector<HTMLInputElement>('[name="gewichtung[]"]');
    if (hiddenInput) hiddenInput.value = String(gewichtung);

    // Passendes Radio auswählen oder Manuell
    const presets = ['1.0', '0.75', '0.25'];
    const matchingValue = presets.find(v => Math.abs(parseFloat(v) - gewichtung) < 0.001);
    if (matchingValue) {
      const radio = slotEl.querySelector<HTMLInputElement>(`.slot-gewichtung-radio[value="${matchingValue}"]`);
      if (radio) radio.checked = true;
      const manuellInput = slotEl.querySelector<HTMLInputElement>('.slot-gewichtung-manuell');
      if (manuellInput) {
        manuellInput.value = matchingValue;
        manuellInput.readOnly = true;
        manuellInput.classList.add('opacity-50', 'cursor-not-allowed');
      }
    } else {
      const manuellRadio = slotEl.querySelector<HTMLInputElement>('.slot-gewichtung-radio[value="manuell"]');
      const manuellInput = slotEl.querySelector<HTMLInputElement>('.slot-gewichtung-manuell');
      if (manuellRadio) manuellRadio.checked = true;
      if (manuellInput) {
        manuellInput.value = String(gewichtung);
        manuellInput.readOnly = false;
        manuellInput.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }
  }

  const wiederholenRaw = sessionStorage.getItem('rundeWiederholen');
  if (wiederholenRaw) {
    sessionStorage.removeItem('rundeWiederholen');
    try {
      const config = JSON.parse(wiederholenRaw) as {
        name: string;
        kosten: number;
        slots: { label: string; gewichtung: number; anzahl: number; standardgebot?: number }[];
      };

      (form.querySelector('#rundeName') as HTMLInputElement).value = config.name;
      (form.querySelector('#gesamtkosten') as HTMLInputElement).value = formatBetrag(config.kosten);

      function befuelleWiederholSlot(
        slotEl: HTMLDivElement,
        slot: { label: string; gewichtung: number; anzahl: number; standardgebot?: number },
      ) {
        const presetNamenWiederhol: Record<string, string> = { 'Erwachsen': '', 'Ermäßigt': '', 'Kind': '', 'Beitrag': '' };
        // Labels die reine Preset-Namen sind, als leer behandeln (Preset-Name wird beim Absenden wieder gesetzt)
        (slotEl.querySelector('[name="label[]"]') as HTMLInputElement).value =
          (slot.label in presetNamenWiederhol) ? '' : slot.label;
        (slotEl.querySelector('[name="anzahl[]"]') as HTMLInputElement).value = String(slot.anzahl);
        setzeGewichtungRadio(slotEl, slot.gewichtung);

        const checkbox = slotEl.querySelector<HTMLInputElement>('.standardgebot-checkbox')!;
        const eingabe = slotEl.querySelector<HTMLDivElement>('.standardgebot-eingabe')!;
        const stdInput = slotEl.querySelector<HTMLInputElement>('[name="standardgebot[]"]')!;

        if (slot.standardgebot !== undefined) {
          checkbox.checked = true;
          eingabe.classList.remove('hidden');
          stdInput.value = formatBetrag(slot.standardgebot);
          stdInput.dataset.auto = 'false';
        } else {
          checkbox.checked = false;
          eingabe.classList.add('hidden');
          stdInput.value = '';
          stdInput.dataset.auto = 'true';
        }
      }

      slotsContainer.querySelectorAll<HTMLDivElement>('.slot-eintrag').forEach((s, i) => {
        if (i > 0) s.remove();
      });

      const ersterSlot = slotsContainer.querySelector('.slot-eintrag') as HTMLDivElement;
      befuelleWiederholSlot(ersterSlot, config.slots[0]);
      aktualisierePresetPlaceholder(ersterSlot);

      for (let i = 1; i < config.slots.length; i++) {
        const klon = ersterSlot.cloneNode(true) as HTMLDivElement;
        const uid = `gw-slot-${slotCounter++}`;
        klon.querySelectorAll<HTMLInputElement>('.slot-gewichtung-radio').forEach(r => { r.name = uid; });
        slotsContainer.appendChild(klon);
        befuelleWiederholSlot(klon, config.slots[i]);
        aktualisierePresetPlaceholder(klon);
      }

      aktualisiereEntfernenButtons();
      aktualisiereRichtwert();
    } catch {
      // Ungültiger sessionStorage-Eintrag — ignorieren
    }
  }

  // Kopieren
  function kopieren(inputId: string) {
    const el = document.getElementById(inputId) as HTMLInputElement;
    navigator.clipboard.writeText(el.value);
  }
  document.getElementById('copy-teilnehmer')!.addEventListener('click', () => kopieren('teilnehmer-link'));
  document.getElementById('copy-admin')!.addEventListener('click', () => kopieren('admin-link'));

  // Formular absenden
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    versteckeFeedback('fehler');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verschlüssele…';

    try {
      const rundeName = (form.querySelector('#rundeName') as HTMLInputElement).value.trim();
      const gesamtkosten = parseGeld(
        (form.querySelector('#gesamtkosten') as HTMLInputElement).value,
      );

      if (!gesamtkosten || gesamtkosten <= 0 || !isFinite(gesamtkosten)) {
        zeigeFeedback('fehler', 'Bitte gib gültige Gesamtkosten ein.', 'rot');
        return;
      }

      const labels = [...slotsContainer.querySelectorAll<HTMLDivElement>('.slot-eintrag')].map((slotEl) => {
        const labelEl = slotEl.querySelector<HTMLInputElement>('[name="label[]"]');
        const labelVal = labelEl?.value.trim() ?? '';
        if (labelVal) return labelVal;
        const checkedRadio = slotEl.querySelector<HTMLInputElement>('.slot-gewichtung-radio:checked');
        return presetNamen[checkedRadio?.value ?? ''] ?? 'Beitrag';
      });
      const gewichtungen = [...form.querySelectorAll<HTMLInputElement>('[name="gewichtung[]"]')].map(
        (el) => parseFloat(el.value),
      );
      const anzahlen = [...form.querySelectorAll<HTMLInputElement>('[name="anzahl[]"]')].map(
        (el) => parseInt(el.value, 10),
      );

      const slotEintraege = [...slotsContainer.querySelectorAll<HTMLDivElement>('.slot-eintrag')];
      const slots = labels.map((label, i) => {
        const ausgabenRaw = ausgabenSichtbar
          ? (slotEintraege[i]?.querySelector('[name="ausgaben[]"]') as HTMLInputElement)?.value
          : undefined;
        const ausgaben = ausgabenRaw ? parseGeld(ausgabenRaw) : undefined;
        const stdCheckbox = slotEintraege[i]?.querySelector<HTMLInputElement>('.standardgebot-checkbox');
        const stdRaw = stdCheckbox?.checked
          ? (slotEintraege[i]?.querySelector<HTMLInputElement>('[name="standardgebot[]"]'))?.value
          : undefined;
        const standardgebot = stdRaw ? parseGeld(stdRaw) : undefined;
        return {
          label,
          gewichtung: gewichtungen[i],
          anzahl: anzahlen[i],
          ...(ausgaben !== undefined && isFinite(ausgaben) ? { ausgaben } : {}),
          ...(standardgebot !== undefined && isFinite(standardgebot) && standardgebot > 0
            ? { standardgebot }
            : {}),
        };
      });

      // Slots zusammenführen: gleiche Label + Gewichtung → anzahl aufaddieren
      const slotMap = new Map<string, typeof slots[0]>();
      for (const slot of slots) {
        const key = `${slot.label}__${slot.gewichtung}`;
        if (slotMap.has(key)) {
          slotMap.get(key)!.anzahl += slot.anzahl;
        } else {
          slotMap.set(key, { ...slot });
        }
      }

      // Labels nur umbenennen wenn dasselbe Label mit mehreren Gewichtungen vorkommt
      const labelGewichtungen = new Map<string, Set<number>>();
      for (const slot of slotMap.values()) {
        if (!labelGewichtungen.has(slot.label)) labelGewichtungen.set(slot.label, new Set());
        labelGewichtungen.get(slot.label)!.add(slot.gewichtung);
      }

      const finalSlots = [...slotMap.values()].map((slot) => {
        const hatMehrere = (labelGewichtungen.get(slot.label)?.size ?? 1) > 1;
        return {
          ...slot,
          label: hatMehrere ? `${slot.label} - Faktor ${slot.gewichtung}` : slot.label,
        };
      });

      // Schlüssel generieren
      const partKey = await generatePartKey();
      const { publicKey: adminPubKey, privateKey: adminPrivKey } = await generateAdminKeyPair();
      const hmacKey = await generateHmacKey();

      const dreiGebotModus =
        (document.getElementById('drei-gebot-toggle') as HTMLInputElement)?.checked ?? false;

      // Blob zusammenstellen + verschlüsseln
      const blob = {
        rundeName,
        gesamtkosten,
        adminPubKey: await exportKey(adminPubKey),
        hmacKey: await exportKey(hmacKey),
        slots: finalSlots,
        dreiGebotModus,
      };
      const encTeilnehmerBlob = await encrypt(partKey, JSON.stringify(blob));

      // API-Aufruf
      const res = await fetch('/api/runde/erstellen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encTeilnehmerBlob }),
      });

      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        zeigeFeedback('fehler', error ?? 'Unbekannter Fehler', 'rot');
        return;
      }

      const { id, adminToken } = (await res.json()) as { id: string; adminToken: string };

      const partKeyB64 = await exportKey(partKey);
      const adminPrivKeyB64 = await exportKey(adminPrivKey);

      const origin = window.location.origin;
      const teilnehmerLink = `${origin}/runde/${id}#pk=${partKeyB64}`;
      const adminLink = `${origin}/runde/${id}/admin/${adminToken}#pk=${partKeyB64}&bk=${adminPrivKeyB64}`;

      saveRunde({
        id,
        name: rundeName,
        hinzugefuegtAm: new Date().toISOString(),
        teilnehmerLink,
        adminLink,
        slots: slots.map(({ label, gewichtung, anzahl }) => ({ label, gewichtung, anzahl })),
      });

      (document.getElementById('teilnehmer-link') as HTMLInputElement).value = teilnehmerLink;
      (document.getElementById('admin-link') as HTMLInputElement).value = adminLink;
      (document.getElementById('teilnehmer-link-oeffnen') as HTMLAnchorElement).href = teilnehmerLink;
      (document.getElementById('admin-link-oeffnen') as HTMLAnchorElement).href = adminLink;
      formBereich.classList.add('hidden');
      ergebnisBereich.classList.remove('hidden');
      ergebnisBereich.classList.add('animate-fade-in');
    } catch (err) {
      zeigeFeedback('fehler', 'Fehler beim Erstellen der Runde. Bitte versuche es erneut.', 'rot');
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Runde erstellen';
    }
  });
}
