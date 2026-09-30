// ============================================================================
// Catálogo v2 — grupos y filtros que no mienten
// ============================================================================
// La lista «Filtros además del periodo» y el visor habilitan solo los filtros
// que declara cada reporte. Declarar uno que la consulta no aplica deja al
// usuario creyendo que filtró. Aquí se exige lo que se puede comprobar en el
// código: la sucursal va con el alcance, la franja exige consultar por
// instantes y el comparativo exige que el resultado dependa del periodo.
// ============================================================================

import { GRUPOS, getAllReportes, getGrupos, getReporteById } from '../reportesCatalogo';
import type { ReportDefinition } from '../types';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

function cuerpoDeFetch(def: ReportDefinition): string {
  const fuente = def.fetch.toString();
  return fuente.slice(fuente.indexOf(')') + 1);
}

const TODOS = getAllReportes();

describe('catálogo v2', () => {
  test('cada reporte tiene grupo conocido', () => {
    const ids = new Set(GRUPOS.map((g) => g.id));
    expect(TODOS.filter((r) => !ids.has(r.grupo)).map((r) => r.id)).toEqual([]);
  });

  test('los ids no se repiten', () => {
    const ids = TODOS.map((r) => r.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  test("«sucursal» se declara si y solo si el alcance es de sucursal", () => {
    const mal = TODOS.filter((r) => r.filtros.includes('sucursal') !== (r.alcance === 'sucursal'));
    expect(mal.map((r) => r.id)).toEqual([]);
  });

  test('«franja» solo en reportes que consultan por instantes', () => {
    const mal = TODOS.filter((r) => r.filtros.includes('franja') && !/rangoDelPeriodo|franjaDelPeriodo/.test(cuerpoDeFetch(r)));
    expect(mal.map((r) => r.id)).toEqual([]);
  });

  test('«comparativo» solo si el resultado depende del periodo', () => {
    const mal = TODOS.filter(
      (r) => r.filtros.includes('comparativo') && !/rangoDelPeriodo|franjaDelPeriodo|periodo\.fecha(Inicio|Fin)/.test(cuerpoDeFetch(r)),
    );
    expect(mal.map((r) => r.id)).toEqual([]);
  });

  test('los alias apuntan a un reporte listado', () => {
    for (const r of TODOS.filter((d) => d.alias)) {
      const destino = getReporteById(r.alias!.destino);
      expect(destino).toBeDefined();
      expect(destino!.alias).toBeUndefined();
      expect(destino!.grupo).toBe(r.grupo);
    }
  });
});

describe('getGrupos', () => {
  test('sin módulos activos solo quedan los reportes core; el resto sale bloqueado', () => {
    const grupos = getGrupos([]);
    const disponibles = grupos.flatMap((g) => g.reportes);
    expect(new Set(disponibles.map((r) => r.modulo))).toEqual(new Set(['organizations', 'clientes', 'roles']));
    expect(grupos.find((g) => g.grupo.id === 'contabilidad')!.bloqueados.length).toBeGreaterThan(0);
  });

  test('con el módulo activo el grupo se desbloquea y los alias no se listan', () => {
    const compras = getGrupos(['finance', 'inventory']).find((g) => g.grupo.id === 'compras')!;
    expect(compras.bloqueados).toEqual([]);
    expect(compras.reportes.map((r) => r.id)).toContain('retenciones-practicadas');
    expect(compras.reportes.map((r) => r.id)).not.toContain('retenciones-por-proveedor');
  });

  test('memberships abre el grupo de membresías (alias de gym)', () => {
    const membresias = getGrupos(['memberships']).find((g) => g.grupo.id === 'membresias')!;
    expect(membresias.reportes.length).toBe(3);
  });

  test('los grupos verticales son los cuatro que se contratan aparte', () => {
    expect(GRUPOS.filter((g) => g.vertical).map((g) => g.id)).toEqual(['hoteleria', 'parqueadero', 'membresias', 'transporte']);
  });
});
