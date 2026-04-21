// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatEur, zeigeFeedback, versteckeFeedback } from './ui';

describe('formatEur', () => {
  it('formatiert ganzen Betrag mit zwei Dezimalstellen', () => {
    expect(formatEur(100)).toBe('100,00 €');
  });

  it('formatiert 0 korrekt', () => {
    expect(formatEur(0)).toBe('0,00 €');
  });

  it('formatiert Betrag mit Dezimalstellen korrekt', () => {
    expect(formatEur(9.99)).toBe('9,99 €');
  });

  it('formatiert vierstelligen Betrag mit Tausenderpunkt', () => {
    expect(formatEur(1234.56)).toBe('1.234,56 €');
  });
});

describe('zeigeFeedback / versteckeFeedback', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
    el.id = 'feedback';
    el.classList.add('hidden');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  it('zeigeFeedback setzt Text und entfernt hidden-Klasse', () => {
    zeigeFeedback('feedback', 'Alles gut', 'gruen');
    expect(el.textContent).toBe('Alles gut');
    expect(el.classList.contains('hidden')).toBe(false);
  });

  it('versteckeFeedback fügt hidden-Klasse hinzu und leert Text', () => {
    el.textContent = 'Fehlermeldung';
    el.classList.remove('hidden');
    versteckeFeedback('feedback');
    expect(el.classList.contains('hidden')).toBe(true);
    expect(el.textContent).toBe('');
  });

  it('zeigeFeedback gefolgt von versteckeFeedback hinterlässt leeres Element', () => {
    zeigeFeedback('feedback', 'Hinweis', 'amber');
    versteckeFeedback('feedback');
    expect(el.textContent).toBe('');
    expect(el.classList.contains('hidden')).toBe(true);
  });
});
