jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { KPIS_INICIO, kpiDe, reportesDeKpis, valorNumerico } from '../inicioKpis';
import { getReporteById } from '../reportesCatalogo';
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
