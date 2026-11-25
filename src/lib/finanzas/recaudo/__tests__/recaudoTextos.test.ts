/**
 * Textos del encargo «Recaudo por medio de pago» en es, en, fr y pt (namespace `recaudoMedio` y
 * los atajos nuevos del kit): mismas claves en los cuatro idiomas y cada clave literal que usan
 * las pantallas existe.
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../../../../..');
const leer = (l: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${l}.json`), 'utf8')) as Record<string, Record<string, unknown>>;
const claves = (o: Record<string, unknown>, pre = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]));

describe('textos del recaudo por medio en 4 idiomas', () => {
  const es = leer('es');

  it('es, en, fr y pt tienen las mismas claves de recaudoMedio', () => {
    const base = claves(es.recaudoMedio).sort();
    for (const l of ['en', 'fr', 'pt']) expect(claves(leer(l).recaudoMedio).sort()).toEqual(base);
  });

  it('los atajos nuevos del kit y de Pedidos online existen en los 4 idiomas', () => {
    for (const l of ['es', 'en', 'fr', 'pt']) {
      const m = leer(l) as Record<string, Record<string, Record<string, unknown>>>;
      for (const k of ['semana', 'estaSemana', 'fecha', 'rangoCorto']) expect(typeof m.kit.rango[k]).toBe('string');
      for (const k of ['week', 'month']) {
        expect(typeof m.pedidosOnlineListado.periodos[k]).toBe('string');
        expect(typeof m.pedidosOnlineListado.comparacion[k]).toBe('string');
      }
    }
  });

  it('cada clave literal de las pantallas existe', () => {
    const todas = new Set(claves(es.recaudoMedio));
    const pantallas: [string, string, string][] = [
      ['src/app/app/pos/pedidos-online/page.tsx', 'tRec', ''],
      ['src/components/pos/ventas/VentasPage.tsx', 'tRec', ''],
      ['src/components/finanzas/tesoreria/compartido/ListaTesoreria.tsx', 'tRec', ''],
      ['src/components/finanzas/recaudo/FiltroConteo.tsx', 't', 'filtro.'],
      ['src/components/finanzas/recaudo/useMediosRecaudo.ts', 't', 'medios.'],
      ['src/components/finanzas/procesadores-pago/CobrosProcesadores.tsx', 'tx', 'cobros.'],
      ['src/components/finanzas/procesadores-pago/CobrosProcesadores.tsx', 'tm', ''],
      ['src/components/finanzas/procesadores-pago/TarifaProcesadorDialog.tsx', 'tx', 'tarifa.'],
      ['src/components/finanzas/procesadores-pago/ProcesadoresPagoPage.tsx', 'tRec', 'cobros.'],
    ];
    const faltan: string[] = [];
    for (const [archivo, fn, prefijo] of pantallas) {
      const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
      for (const m of src.matchAll(new RegExp(`\\b${fn}\\('([a-zA-Z0-9_.]+)'`, 'g'))) if (!todas.has(`${prefijo}${m[1]}`)) faltan.push(`${archivo}: ${prefijo}${m[1]}`);
    }
    expect(faltan).toEqual([]);
  });
});
