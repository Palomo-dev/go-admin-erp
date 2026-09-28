/**
 * L19 (docs/implementacion/POS-PLAN.md §2.2): con un diálogo Radix abierto
 * (variantes, cobro, caja) el escaneo no llega al carrito. `dialogOpen` se
 * exportó de `src/hooks/useHardwareBarcodeScanner.ts` sin cambiarla; aquí
 * se prueba con un documento simulado que evalúa el selector real.
 */
import { dialogOpen } from '@/hooks/useHardwareBarcodeScanner';

type Nodo = { role: string; state: string };

/** Documento mínimo: resuelve `[role="x"][data-state="y"]` separados por coma. */
function documento(nodos: Nodo[]): Pick<Document, 'querySelector'> {
  return {
    querySelector: ((selector: string) => {
      const alternativas = selector.split(',').map((s) => s.trim());
      const coincide = nodos.find((n) =>
        alternativas.some((alt) => {
          const role = /\[role="([^"]+)"\]/.exec(alt)?.[1];
          const state = /\[data-state="([^"]+)"\]/.exec(alt)?.[1];
          return n.role === role && n.state === state;
        }));
      return (coincide ?? null) as unknown as Element | null;
    }) as Document['querySelector'],
  };
}

describe('escaneo con un diálogo abierto (L19)', () => {
  it('un diálogo o un alertdialog ABIERTOS bloquean el escaneo', () => {
    expect(dialogOpen(documento([{ role: 'dialog', state: 'open' }]))).toBe(true);
    expect(dialogOpen(documento([{ role: 'alertdialog', state: 'open' }]))).toBe(true);
  });

  it('cerrados (o ninguno), el escaneo pasa', () => {
    expect(dialogOpen(documento([]))).toBe(false);
    expect(dialogOpen(documento([{ role: 'dialog', state: 'closed' }, { role: 'menu', state: 'open' }]))).toBe(false);
  });
});
