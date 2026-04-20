export function formatEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function zeigeFeedback(
  elId: string,
  text: string,
  typ: 'rot' | 'gruen' | 'amber'
) {
  const el = document.getElementById(elId)!;
  el.textContent = text;
  el.classList.remove('hidden');
}

export function versteckeFeedback(elId: string) {
  const el = document.getElementById(elId)!;
  el.classList.add('hidden');
  el.textContent = '';
}