/**
 * Política del producto (dueño, 2026-11-07): ningún módulo tiene reportes
 * propios; todos viven en el módulo Reportes (`/app/reportes/...`).
 *
 * El menú de Finanzas llegó a listar 14 reportes contables, varios duplicados
 * con los del módulo Reportes. Las rutas viejas redirigen
 * (`src/lib/services/reportes/redireccionesFinanzas.ts`); este test impide que
 * vuelvan al menú.
 */
import { CATALOGO_NAV } from '../catalog';

const RUTAS_DE_REPORTE = [
  /\/app\/finanzas\/reportes(\/|$)/,
  /\/app\/finanzas\/reporte-categorias$/,
  /\/app\/finanzas\/contabilidad\/(mayor-contable|libro-diario|auxiliar-tercero|balance-comprobacion|estado-resultados|balance-general)$/,
  /\/app\/finanzas\/contabilidad\/informes\//,
];

describe('los reportes solo están en el módulo Reportes', () => {
  it('ningún módulo distinto de Reportes enlaza una página de reporte en el menú', () => {
    const fuera = CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => ({ modulo: m.codigo, href: p.href }))).filter(
      ({ href }) => RUTAS_DE_REPORTE.some((r) => r.test(href)),
    );
    expect(fuera).toEqual([]);
  });
});
