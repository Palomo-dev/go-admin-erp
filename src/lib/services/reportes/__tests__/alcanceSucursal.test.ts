// ============================================================================
// Reportes — alcance de sucursal
// ============================================================================
// Regla del dueño (2026-09-29): el reporte se filtra por la sucursal del
// selector, y el consolidado —y los reportes de toda la organización— solo los
// ve quien tiene acceso a todas las sucursales. La base lo exige en cada
// `fn_reporte_*` (`reporte_exigir_alcance_sucursal`); aquí se fija que la UI y
// el catálogo digan lo mismo:
//   - un reporte `alcance: 'sucursal'` usa `branchId` al consultar (si no lo
//     usara, un gerente de una sede vería las demás);
//   - uno `alcance: 'organizacion'` no lo usa (y por eso se bloquea sin acceso
//     total, en vez de mostrar datos de sedes ajenas);
//   - `sucursalDeReportes` nunca devuelve el consolidado sin acceso total.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { reportePermitido, sucursalDeReportes } from '../alcanceSucursal';
import type { ReportDefinition } from '../types';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const DIR_MODULOS = path.join(__dirname, '..', 'modulos');

function todasLasDefiniciones(): ReportDefinition[] {
  return fs
    .readdirSync(DIR_MODULOS)
    .filter((f) => f.endsWith('Reports.ts'))
    .flatMap((f) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const modulo = require(path.join(DIR_MODULOS, f)) as Record<string, unknown>;
      return Object.values(modulo).filter(Array.isArray).flat() as ReportDefinition[];
    });
}

/** Cuerpo de `fetch` sin su lista de parámetros. */
function cuerpoDeFetch(def: ReportDefinition): string {
  const fuente = def.fetch.toString();
  const cierre = fuente.indexOf(')');
  return fuente.slice(cierre + 1);
}

describe('catálogo: alcance coherente con el uso de branchId', () => {
  const definiciones = todasLasDefiniciones();

  test('el catálogo trae las 69 definiciones y todas declaran alcance', () => {
    expect(definiciones.length).toBe(69);
    const sinAlcance = definiciones.filter((d) => d.alcance !== 'sucursal' && d.alcance !== 'organizacion');
    expect(sinAlcance.map((d) => d.id)).toEqual([]);
  });

  test("los de alcance 'sucursal' filtran por branchId", () => {
    const noFiltran = definiciones.filter((d) => d.alcance === 'sucursal' && !/\bbranchId\b/.test(cuerpoDeFetch(d)));
    expect(noFiltran.map((d) => d.id)).toEqual([]);
  });

  test("los de alcance 'organizacion' no usan branchId", () => {
    const usan = definiciones.filter((d) => d.alcance === 'organizacion' && /\bbranchId\b/.test(cuerpoDeFetch(d)));
    expect(usan.map((d) => d.id)).toEqual([]);
  });
});

describe('sucursalDeReportes', () => {
  test('con acceso total respeta el selector, consolidado incluido', () => {
    expect(sucursalDeReportes(true, null, 5)).toBeNull();
    expect(sucursalDeReportes(true, 5, 5)).toBe(5);
  });

  test('sin acceso total, «Todas» se reduce a la sucursal elegida', () => {
    expect(sucursalDeReportes(false, null, 5)).toBe(5);
    expect(sucursalDeReportes(false, 7, 5)).toBe(7);
  });
});

describe('reportePermitido', () => {
  test('sin acceso total solo pasan los de sucursal', () => {
    expect(reportePermitido({ alcance: 'sucursal' }, false)).toBe(true);
    expect(reportePermitido({ alcance: 'organizacion' }, false)).toBe(false);
    expect(reportePermitido({ alcance: 'organizacion' }, true)).toBe(true);
  });
});
