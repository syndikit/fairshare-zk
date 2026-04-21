import { describe, it, expect } from 'vitest';
import { formatEur } from './ui';

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
