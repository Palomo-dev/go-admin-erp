// ============================================================================
// Finanzas no tiene reportes propios: todos viven en el centro de reportes.
// ============================================================================
// Cada pantalla vieja de reportes de Finanzas redirige a un reporte del
// catálogo, del grupo que corresponde. Los informes que el visor pinta con su
// componente propio existen en el registro, y los que no tienen tabla quedan
// fuera de cierres, envíos, documentos y del asistente.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAllReportes, getReporteById, getReportesPermitidos } from '../reportesCatalogo';
import { REDIRECCIONES_FINANZAS, destinoReporteFinanzas, type RutaViejaFinanzas } from '../redireccionesFinanzas';
import { ReporteSinTablaError } from '../modulos/estadosFinancierosReports';
import { agruparCategorias, filaCategoriaDeBanco, filaCategoriaDeCaja } from '@/lib/finanzas/categoriasTesoreria';
import type { PeriodoCierre } from '../types';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const RUTAS = Object.keys(REDIRECCIONES_FINANZAS) as RutaViejaFinanzas[];
const PERIODO: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-11-01', fechaFin: '2026-11-30', etiqueta: 'Noviembre' };

describe('rutas viejas de Finanzas', () => {
  test.each(RUTAS)('%s redirige a un reporte del catálogo en su grupo', (ruta) => {
    const url = new URL(destinoReporteFinanzas(ruta), 'http://x');
    const [, app, reportes, grupo, reporte] = url.pathname.split('/');
    expect(`${app}/${reportes}`).toBe('app/reportes');
    expect(['contabilidad', 'finanzas']).toContain(grupo);
    if (reporte) {
      const def = getReporteById(reporte);
      expect(def).toBeDefined();
      expect(def!.grupo).toBe(grupo);
      expect(def!.alias).toBeUndefined();
    }
  });

  test.each(RUTAS)('la página de %s redirige en el servidor con su propia ruta', (ruta) => {
    const pagina = leer(`src${ruta.replace('/app/', '/app/app/')}/page.tsx`);
    expect(pagina).toContain("import { redirect } from 'next/navigation';");
    expect(pagina).toContain(`destinoReporteFinanzas('${ruta}', await searchParams)`);
    expect(pagina).not.toMatch(/['"]use client['"]/);
  });

  test('el centro de Finanzas lleva a la lista del grupo', () => {
    expect(destinoReporteFinanzas('/app/finanzas/reportes', { desde: '2026-01-01', hasta: '2026-02-01' })).toBe('/app/reportes/finanzas');
  });

  test('conserva el periodo como personalizado y descarta fechas inválidas', () => {
    expect(destinoReporteFinanzas('/app/finanzas/contabilidad/estado-resultados', { desde: '2026-01-01', hasta: '2026-03-31' }))
      .toBe('/app/reportes/contabilidad/estado-resultados?periodo=personalizado&desde=2026-01-01&hasta=2026-03-31');
    expect(destinoReporteFinanzas('/app/finanzas/contabilidad/estado-resultados', { desde: '2026-04-01', hasta: '2026-03-31' }))
      .toBe('/app/reportes/contabilidad/estado-resultados?periodo=anual');
    expect(destinoReporteFinanzas('/app/finanzas/contabilidad/balance-comprobacion', { desde: 'ayer', hasta: '2026-03-31' }))
      .toBe('/app/reportes/contabilidad/balance-prueba');
  });

  test('el mayor conserva la cuenta y la sanea', () => {
    expect(destinoReporteFinanzas('/app/finanzas/contabilidad/mayor-contable', { cuenta: '110505' }))
      .toBe('/app/reportes/contabilidad/mayor-cuenta?periodo=anual&cuenta=110505');
    expect(destinoReporteFinanzas('/app/finanzas/contabilidad/mayor-contable', { cuenta: '<script>' }))
      .toBe('/app/reportes/contabilidad/mayor-cuenta?periodo=anual');
    // Otros informes no heredan la cuenta.
    expect(destinoReporteFinanzas('/app/finanzas/contabilidad/libro-diario', { cuenta: '110505' }))
      .toBe('/app/reportes/contabilidad/libro-diario');
  });

  test('la cartera por edades abre CxC, o CxP si la pedían', () => {
    expect(destinoReporteFinanzas('/app/finanzas/reportes/cartera-edades')).toBe('/app/reportes/finanzas/cxc-aging');
    expect(destinoReporteFinanzas('/app/finanzas/reportes/cartera-edades', { tipo: 'cxp', sucursal: '7' }))
      .toBe('/app/reportes/finanzas/cxp-aging?sucursal=7');
  });
});

describe('informes con componente propio', () => {
  const conComponente = getAllReportes().filter((r) => r.componente);
  const registro = leer('src/components/reportes/especiales/registro.tsx');

  test('cada componente declarado está en el registro del visor', () => {
    expect(conComponente.length).toBeGreaterThanOrEqual(11);
    for (const r of conComponente) expect(registro).toMatch(new RegExp(`['\\s]${r.componente}'?:\\s*dynamic\\(`));
  });

  test('todo informe sin tabla tiene componente y su fetch lo dice en vez de inventar filas', async () => {
    const sinTabla = getAllReportes().filter((r) => r.sinTabla);
    expect(sinTabla.map((r) => r.id).sort()).toEqual([
      'auxiliar-tercero', 'cambios-patrimonio', 'certificacion-estados', 'estado-flujos-efectivo',
      'indicadores-financieros', 'libro-diario', 'libros-contables', 'mayor-cuenta', 'notas-estados',
    ]);
    for (const r of sinTabla) {
      expect(r.componente).toBeDefined();
      expect(r.alcance).toBe('organizacion');
      await expect(r.fetch(1, PERIODO)).rejects.toBeInstanceOf(ReporteSinTablaError);
    }
  });

  test('los informes sin tabla no llegan al asistente', () => {
    const ids = getReportesPermitidos(['finance'], true).flatMap((m) => m.reportes.map((r) => r.id));
    expect(ids).not.toContain('libros-contables');
    expect(ids).not.toContain('estado-flujos-efectivo');
    // Los de componente propio con tabla siguen: estado de resultados y situación financiera.
    expect(ids).toEqual(expect.arrayContaining(['estado-resultados', 'balance-general', 'categorias-tesoreria']));
  });

  test('el cierre consolidado y el acceso del servidor descartan los informes sin tabla', () => {
    expect(leer('src/lib/services/reportes/reportesEngine.ts')).toMatch(/!def\.alias && esTabular\(def\)/);
    const acceso = leer('src/lib/services/reportes/acceso.server.ts');
    expect(acceso).toContain("'REPORTE_SIN_TABLA'");
    expect(acceso).toMatch(/reportePermitido\(d, alcance\.accesoTotal\) && esTabular\(d\)/);
  });
});

describe('ingresos y egresos por categoría', () => {
  test('agrupa caja y bancos por categoría y tipo, con el monto en valor absoluto', () => {
    const filas = [
      filaCategoriaDeCaja({ type: 'in', amount: 100, categoria_id: 1, categorias_tesoreria: { nombre: 'Ventas' }, branch_id: 2, created_at: '2026-11-02T15:00:00Z' }),
      filaCategoriaDeCaja({ type: 'out', amount: 40, categoria_id: null, categorias_tesoreria: null, branch_id: 2, created_at: '2026-11-02T15:00:00Z' }),
      filaCategoriaDeBanco({ transaction_type: 'deposit', amount: 50, categoria_id: 1, categorias_tesoreria: [{ nombre: 'Ventas' }], branch_id: 3, trans_date: '2026-11-03T15:00:00Z' }),
      filaCategoriaDeBanco({ transaction_type: 'transfer', amount: -30, categoria_id: 5, categorias_tesoreria: { nombre: 'Arriendo' }, branch_id: 3, trans_date: '2026-11-03T15:00:00Z' }),
    ];
    expect(agruparCategorias(filas)).toEqual([
      { categoriaId: 1, nombre: 'Ventas', tipo: 'ingreso', movimientos: 2, total: 150 },
      { categoriaId: null, nombre: 'Sin categoría', tipo: 'egreso', movimientos: 1, total: 40 },
      { categoriaId: 5, nombre: 'Arriendo', tipo: 'egreso', movimientos: 1, total: 30 },
    ]);
  });
});
