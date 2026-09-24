/**
 * Cuentas por cobrar (POS y Finanzas): filtro «Cliente» y parciales vencidas.
 *
 * Antes (verificado en la BD el 2026-09-23):
 * - el texto del filtro «Cliente» iba a `customer_id_filter uuid` →
 *   22P02 «invalid input syntax for type uuid» y la lista entera fallaba;
 * - 57 cuentas `partial` con vencimiento pasado y saldo > 0 no salían en
 *   «Vencidas», ni en el KPI ni en Recordatorios.
 */
import * as fs from 'fs';
import * as path from 'path';
import { estadoVivoCxC, filtroClienteCxC, tocaRecordatorio } from '@/lib/finanzas/cxcFiltros';

const SRC = path.resolve(__dirname, '..', '..');

describe('filtroClienteCxC', () => {
  test('texto → búsqueda por nombre, nunca al parámetro uuid', () => {
    expect(filtroClienteCxC('Ana Gómez')).toEqual({ customer_id_filter: null, customer_search: 'Ana Gómez' });
    expect(filtroClienteCxC('  ana ')).toEqual({ customer_id_filter: null, customer_search: 'ana' });
  });

  test('uuid (selector de cliente) → filtro por id', () => {
    const id = '3852a174-db17-477e-9c0c-cbd1cb09e431';
    expect(filtroClienteCxC(id)).toEqual({ customer_id_filter: id, customer_search: null });
  });

  test('vacío → sin filtro', () => {
    expect(filtroClienteCxC('')).toEqual({ customer_id_filter: null, customer_search: null });
    expect(filtroClienteCxC(undefined)).toEqual({ customer_id_filter: null, customer_search: null });
  });

  test('un uuid mal formado es texto, no rompe la consulta', () => {
    expect(filtroClienteCxC('3852a174-xxxx').customer_id_filter).toBeNull();
  });
});

describe('estadoVivoCxC', () => {
  test('una parcial vencida se muestra como vencida con sus días', () => {
    expect(estadoVivoCxC({ status: 'partial', status_efectivo: 'overdue', days_overdue: 0, dias_vencida: 12 }))
      .toEqual({ status: 'overdue', days_overdue: 12 });
  });

  test('sin campos vivos (RPC anterior) usa lo guardado', () => {
    expect(estadoVivoCxC({ status: 'current', days_overdue: 4 })).toEqual({ status: 'current', days_overdue: 4 });
  });

  test('un estado efectivo desconocido no se cuela', () => {
    expect(estadoVivoCxC({ status: 'paid', status_efectivo: 'raro', dias_vencida: 0 })).toEqual({ status: 'paid', days_overdue: 0 });
  });
});

describe('tocaRecordatorio', () => {
  const ahora = new Date('2026-09-23T15:00:00Z');
  test('nunca enviado o hace 3 días o más → sí', () => {
    expect(tocaRecordatorio(null, ahora)).toBe(true);
    expect(tocaRecordatorio('2026-09-20T15:00:00Z', ahora)).toBe(true);
  });
  test('hace menos de 3 días → no', () => {
    expect(tocaRecordatorio('2026-09-21T15:00:00Z', ahora)).toBe(false);
  });
});

describe('Guardarraíles de cartera', () => {
  const service = fs.readFileSync(path.join(SRC, 'components/finanzas/cuentas-por-cobrar/service.ts'), 'utf8');

  test('el texto del filtro «Cliente» no va directo al parámetro uuid', () => {
    expect(service).not.toMatch(/customer_id_filter:\s*filtros\.cliente/);
    expect(service).toMatch(/filtroClienteCxC\(filtros\.cliente\)/);
  });

  test('recordatorios no filtran por el estado guardado (dejaba fuera las parciales vencidas)', () => {
    const recordatorios = service.slice(service.indexOf('static async obtenerCuentasParaRecordatorio'), service.indexOf('static async aplicarAbono'));
    expect(recordatorios).not.toMatch(/\.eq\('status',\s*'overdue'\)/);
    expect(recordatorios).toMatch(/estado: 'overdue'/);
  });

  test('el servicio no escribe balance ni status de accounts_receivable (lo hacen los disparadores)', () => {
    const updates = service.split(/\.from\('accounts_receivable'\)/).slice(1).map((b) => b.slice(0, b.indexOf(';')));
    for (const u of updates) {
      if (/\.update\(/.test(u)) {
        expect(u).not.toMatch(/\bbalance\s*:|\bstatus\s*:/);
      }
    }
  });
});
