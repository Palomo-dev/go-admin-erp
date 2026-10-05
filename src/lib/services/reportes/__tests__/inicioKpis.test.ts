jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { CLAVE_VENTAS_ANTERIOR, KPIS_INICIO, correrKpis, kpiDe, planDeKpis, reportesDeKpis, valorNumerico } from '../inicioKpis';
import { getReporteById } from '../reportesCatalogo';
import type { FiltrosReportes } from '../filtrosUrl';
import type { ReportData } from '../types';

describe('KPI del inicio de reportes', () => {
  it('cada tarjeta apunta a un reporte que existe en el catálogo', () => {
    for (const id of reportesDeKpis(KPIS_INICIO)) expect(getReporteById(id)).toBeDefined();
  });

  it('no repite reportes al correrlos', () => {
    const ids = reportesDeKpis(KPIS_INICIO);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('stock-critico');
  });

  it('lee el KPI por título y solo acepta números', () => {
    const data = { kpis: [{ titulo: 'Total CxC', valor: 1200 }, { titulo: 'Estado', valor: 'abierto' }, { titulo: 'Texto numérico', valor: '15.5' }] } as unknown as ReportData;
    expect(valorNumerico(kpiDe(data, 'Total CxC'))).toBe(1200);
    expect(valorNumerico(kpiDe(data, 'Estado'))).toBeNull();
    expect(valorNumerico(kpiDe(data, 'Texto numérico'))).toBe(15.5);
    expect(kpiDe(data, 'No existe')).toBeNull();
    expect(kpiDe(null, 'Total CxC')).toBeNull();
  });
});

describe('plan de KPI del inicio: todo en un solo lote', () => {
  const filtros: FiltrosReportes = {
    periodo: { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre', horaInicio: '08:00', horaFin: '18:00' },
    sucursal: undefined,
    comparar: null,
    vista: null,
  };
  const ids = reportesDeKpis(KPIS_INICIO);

  it('incluye la venta del periodo anterior junto a las demás, con la sucursal de la pantalla', () => {
    const plan = planDeKpis(ids, filtros, 7, getReporteById, () => true);
    const anterior = plan.find((p) => p.clave === CLAVE_VENTAS_ANTERIOR)!;
    expect(anterior).toMatchObject({ reportId: 'ventas-periodo', sucursal: 7 });
    expect(anterior.periodo.fechaInicio).toBe('2026-08-01');
    expect(anterior.periodo.fechaFin).toBe('2026-08-31');
    // Los de toda la organización van sin sucursal.
    expect(plan.find((p) => p.reportId === 'estado-resultados')?.sucursal).toBeNull();
    expect(plan.find((p) => p.reportId === 'cxc-aging')?.sucursal).toBe(7);
  });

  it('omite lo que no está permitido; sin ventas no pide el periodo anterior', () => {
    const plan = planDeKpis(ids, filtros, null, getReporteById, (d) => d.id !== 'ventas-periodo');
    expect(plan.map((p) => p.clave)).not.toContain('ventas-periodo');
    expect(plan.map((p) => p.clave)).not.toContain(CLAVE_VENTAS_ANTERIOR);
  });

  it('corre todo a la vez y deja en null lo que falla', async () => {
    const plan = planDeKpis(['ventas-periodo', 'cxc-aging'], filtros, null, getReporteById, () => true);
    let enCurso = 0;
    let maximo = 0;
    const mapa = await correrKpis(plan, async (p) => {
      enCurso += 1;
      maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 5));
      enCurso -= 1;
      if (p.reportId === 'cxc-aging') throw new Error('falla');
      return { kpis: [] } as unknown as ReportData;
    });
    expect(maximo).toBe(3);
    expect(mapa.get('cxc-aging')).toBeNull();
    expect(mapa.get(CLAVE_VENTAS_ANTERIOR)).toEqual({ kpis: [] });
  });
});
