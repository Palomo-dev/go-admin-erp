/**
 * Política del producto (dueño, 2026-11-07): ningún módulo tiene reportes
 * propios; todos viven en el módulo Reportes (`/app/reportes/...`).
 *
 * El menú de Finanzas llegó a listar 14 reportes contables, varios duplicados
 * con los del módulo Reportes. Las rutas viejas redirigen
 * (`src/lib/services/reportes/redireccionesFinanzas.ts`); este test impide que
 * vuelvan al menú.
 *
 * Excepción documentada (dueño, 2026-11-07, decisión 1 de
 * `docs/implementacion/FINANZAS-R3-PLAN.md`): «Mayor contable»
 * (`/app/finanzas/contabilidad/mayor-contable`) vuelve al menú de Contabilidad
 * como página de trabajo —elegir una cuenta, ver sus movimientos con saldo
 * corrido y abrir cada asiento—. No es un reporte duplicado: el reporte «Mayor
 * por cuenta» sigue en Reportes (exportar, programar, cierres) y los dos pintan
 * el mismo componente sobre la misma función (`ReportesContablesService.getLedger`).
 * El libro diario como informe, el auxiliar y los estados siguen solo en Reportes.
 */
import { CATALOGO_NAV } from '../catalog';

const RUTAS_DE_REPORTE = [
  /\/app\/finanzas\/reportes(\/|$)/,
  /\/app\/finanzas\/reporte-categorias$/,
  /\/app\/finanzas\/contabilidad\/(libro-diario|auxiliar-tercero|balance-comprobacion|estado-resultados|balance-general)$/,
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

describe('excepción: el mayor contable es página de trabajo', () => {
  it('está en el menú de Contabilidad de Finanzas, y solo ahí', () => {
    const conMayor = CATALOGO_NAV.flatMap((m) =>
      m.paginas.filter((p) => p.href === '/app/finanzas/contabilidad/mayor-contable').map((p) => ({ modulo: m.codigo, grupo: p.grupo })),
    );
    expect(conMayor).toEqual([{ modulo: 'finance', grupo: 'Contabilidad' }]);
  });
});
