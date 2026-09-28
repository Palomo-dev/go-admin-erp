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

// 2026-09-24 (rediseño de ventas y cartera, P15): `cuentas-por-cobrar/service.ts`
// se retiró. El listado nuevo pasa por `GET /api/cartera` → `fn_cxc_listado`:
// el filtro «Cliente» solo acepta un uuid (el texto va a la búsqueda) y el
// estado vivo (parciales vencidas incluidas) lo calcula la base.
describe('Guardarraíles de cartera', () => {
  const listado = fs.readFileSync(path.join(SRC, 'lib/finanzas/cartera/listadoCartera.ts'), 'utf8');
  const sql = fs.readFileSync(path.join(SRC, '..', 'supabase/migrations/20260924081336_listados_facturas_venta_y_cartera.sql'), 'utf8');

  test('el filtro «Cliente» solo pasa un uuid; el texto va a la búsqueda', () => {
    expect(listado).toMatch(/cliente/);
    expect(listado).toMatch(/UUID|uuid/);
  });

  test('las vencidas salen del estado vivo, no del estado guardado', () => {
    expect(sql).toMatch(/fn_cxc_estado_vivo|dias_vencida|estado_vivo/);
  });

  test('ninguna pantalla de cartera escribe accounts_receivable (lo hacen los disparadores)', () => {
    const carpetas = ['components/finanzas/cuentas-por-cobrar', 'components/finanzas/cartera', 'lib/finanzas/cartera', 'lib/services/cartera'];
    const archivos = (dir: string): string[] =>
      fs.readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? archivos(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []);
    for (const f of carpetas.flatMap(archivos)) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8')).not.toMatch(/from\('accounts_receivable'\)\s*\.(update|insert|upsert|delete)\(/);
    }
  });
});
