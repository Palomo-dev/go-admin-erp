/// <reference types="jest" />
/**
 * Comisiones agrupadas por vendedor (Figma 1012:87993) y pago por lotes
 * (1012:89017): agrupación, totales por moneda (nunca sumados), filas de la
 * tabla con grupos plegados, pestañas ↔ estado, número del asiento y las
 * claves de texto en los 4 idiomas.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ESTADO_DE_PESTANA,
  PAGO_LOTE_MAX,
  REASON_MAX,
  agruparPorVendedor,
  claveVendedor,
  enLotes,
  filasDeTabla,
  numeroAsiento,
  pestanaDeEstado,
  totalesPorMoneda,
  type FilaAgrupable,
} from '../comisionesModel';

const c = (id: string, p: Partial<FilaAgrupable> = {}): FilaAgrupable => ({
  id,
  payee_id: 'u-1',
  payee_name: 'Vendedora A',
  payee_type: 'employee',
  base_amount: 100000,
  commission_amount: 5000,
  currency: 'COP',
  status: 'accrued',
  ...p,
});

describe('agrupar por vendedor', () => {
  const filas = [
    c('1'),
    c('2', { payee_id: 'u-2', payee_name: 'Vendedor B', commission_amount: 40000, base_amount: 350000 }),
    c('3', { status: 'paid' }),
    c('4', { currency: 'USD', commission_amount: 10, base_amount: 200 }),
    c('5', { payee_id: null, payee_name: 'Aliado externo', payee_type: 'third_party' }),
  ];

  it('un grupo por vendedor, en el orden en que aparece', () => {
    const grupos = agruparPorVendedor(filas, 'COP');
    expect(grupos.map((g) => g.nombre)).toEqual(['Vendedora A', 'Vendedor B', 'Aliado externo']);
    expect(grupos[0].filas.map((f) => f.id)).toEqual(['1', '3', '4']);
    // «Pagar» del grupo solo paga lo pendiente.
    expect(grupos[0].pendientes.map((f) => f.id)).toEqual(['1', '4']);
  });

  it('los totales van por moneda, la base primero, y nunca se suman entre monedas', () => {
    const [a] = agruparPorVendedor(filas, 'COP');
    expect(a.totales).toEqual([
      { moneda: 'COP', base: 200000, comision: 10000 },
      { moneda: 'USD', base: 200, comision: 10 },
    ]);
    expect(totalesPorMoneda([c('x', { currency: null })], 'COP')).toEqual([{ moneda: 'COP', base: 100000, comision: 5000 }]);
  });

  it('sin id, el vendedor se identifica por tipo y nombre', () => {
    expect(claveVendedor({ payee_id: null, payee_name: ' Aliado ', payee_type: 'third_party' })).toBe('nombre:third_party:aliado');
    expect(claveVendedor({ payee_id: 'u-9', payee_name: 'X', payee_type: 'employee' })).toBe('id:u-9');
  });

  it('las filas de la tabla: cabecera del grupo y sus comisiones; plegado solo la cabecera', () => {
    const grupos = agruparPorVendedor(filas, 'COP');
    const todas = filasDeTabla(grupos, new Set());
    expect(todas.map((f) => f.id)).toEqual(['g:id:u-1', '1', '3', '4', 'g:id:u-2', '2', 'g:nombre:third_party:aliado externo', '5']);
    const plegadas = filasDeTabla(grupos, new Set(['id:u-1']));
    expect(plegadas.map((f) => f.id)).toEqual(['g:id:u-1', 'g:id:u-2', '2', 'g:nombre:third_party:aliado externo', '5']);
  });
});

describe('pago por lotes, pestañas y asiento', () => {
  it('lotes de 200, el tope de la ruta bulk-pay', () => {
    const ids = Array.from({ length: 450 }, (_, i) => String(i));
    expect(enLotes(ids).map((l) => l.length)).toEqual([200, 200, 50]);
    expect(PAGO_LOTE_MAX).toBe(200);
    expect(enLotes([])).toEqual([]);
  });
  it('pestaña ↔ estado de la API', () => {
    expect(ESTADO_DE_PESTANA.porPagar).toBe('accrued');
    expect(pestanaDeEstado('paid')).toBe('pagadas');
    expect(pestanaDeEstado('all')).toBe('todas');
  });
  it('número del asiento: comprobante o #id', () => {
    expect(numeroAsiento({ id: 9408, comprobante_prefijo: 'CC-', comprobante_numero: 12 })).toBe('CC-12');
    expect(numeroAsiento({ id: 9408, comprobante_prefijo: null, comprobante_numero: null })).toBe('#9408');
  });
  it('el motivo tiene tope en la UI', () => {
    expect(REASON_MAX).toBe(500);
  });
});

describe('textos en 4 idiomas', () => {
  const RAIZ = path.resolve(__dirname, '../../../../..');
  const leer = (l: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${l}.json`), 'utf8')).finanzasComisiones;
  const claves = (o: Record<string, unknown>, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]));

  it('es, en, fr y pt tienen exactamente las mismas claves', () => {
    const es = claves(leer('es')).sort();
    for (const l of ['en', 'fr', 'pt']) expect(claves(leer(l)).sort()).toEqual(es);
  });

  it('cada clave literal de las pantallas existe', () => {
    const es = new Set(claves(leer('es')));
    const archivos: Record<string, Record<string, string>> = {
      'src/app/app/finanzas/comisiones/page.tsx': { t: '' },
      'src/components/finanzas/comisiones/ComisionesList.tsx': { t: '' },
      'src/components/finanzas/comisiones/ComisionesSummary.tsx': { t: 'cifras.' },
      'src/components/finanzas/comisiones/ComisionesFilters.tsx': { t: 'filtros.', tOrigen: 'origen.' },
      'src/components/finanzas/comisiones/PagarComisionesDialog.tsx': { t: 'pagar.' },
    };
    const faltan: string[] = [];
    for (const [f, mapa] of Object.entries(archivos)) {
      const src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
      for (const [fn, pre] of Object.entries(mapa)) {
        for (const m of src.matchAll(new RegExp(`\\b${fn}\\('([a-zA-Z0-9_.]+)'`, 'g'))) if (!es.has(pre + m[1])) faltan.push(`${f}: ${pre}${m[1]}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it('las claves dinámicas también existen', () => {
    const es = new Set(claves(leer('es')));
    const dinamicas = [
      ...['sale', 'invoice_sale', 'invoice_purchase', 'opportunity'].map((x) => `origen.${x}`),
      ...['devengada', 'pagada', 'clawback', 'rechazada', 'cancelada', 'porPagar', 'sinPendientes'].map((x) => `estado.${x}`),
      ...['porPagar', 'pagadas', 'canceladas', 'todas'].flatMap((x) => [`vacio.${x}.titulo`, `vacio.${x}.descripcion`]),
      'plegar',
      'desplegar',
    ];
    expect(dinamicas.filter((k) => !es.has(k))).toEqual([]);
  });

  it('ningún archivo de la pantalla usa clases dark: ni colores crudos', () => {
    for (const f of [
      'src/app/app/finanzas/comisiones/page.tsx',
      'src/components/finanzas/comisiones/ComisionesList.tsx',
      'src/components/finanzas/comisiones/ComisionesSummary.tsx',
      'src/components/finanzas/comisiones/ComisionesFilters.tsx',
      'src/components/finanzas/comisiones/PagarComisionesDialog.tsx',
      'src/components/finanzas/comisiones/CuentaPagoComision.tsx',
    ]) {
      const src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
      expect({ f, dark: /\bdark:/.test(src), crudo: /\b(?:bg|text|border)-(?:gray|blue|red|green|amber)-\d/.test(src) }).toEqual({ f, dark: false, crudo: false });
    }
  });
});
