/// <reference types="jest" />
/**
 * Pantalla de Pronóstico al Figma aprobado (CRM 1431:19, 1434:648, 1434:1185,
 * 1434:842149, 1434:842588, 1434:843089): lógica pura de la vista «Por mes»,
 * qué ocupa el cuerpo, el CSV y la ruta (el panel Revenue OS de la subruta
 * «analisis» pasó al módulo Reportes el 2026-11-24).
 */
import * as fs from 'fs';
import * as path from 'path';
import { calcularPorMes, mesDeOportunidad, mesMas, type ForecastSnapshot } from '@/lib/services/crm/forecastLogica';
import {
  cuerpoPronostico,
  etiquetaMes,
  filasCsvMeses,
  filasCsvOportunidades,
  filasCsvVendedores,
  minutosDesde,
  simboloMoneda,
  tonoProgresoCobertura,
} from '../trimestre/trimestreLogica';

const ROOT = path.resolve(__dirname, '../../../../..');
const leer = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const op = (id: string, amount: number, probability: number, extra: Record<string, unknown> = {}) => ({
  id, name: id, salesperson_id: 'u', amount, currency: 'COP', status: 'open', expected_close_date: '2026-10-10', closed_at: null,
  updated_at: null, forecast_category: null, probability, is_won: false, is_lost: false, stage_name: 'x', ...extra,
});

const foto = (opportunities: ReturnType<typeof op>[]): ForecastSnapshot => ({
  period: '2026-Q4', start: '2026-10-01', end: '2027-01-01', date: '2026-11-15', timezone: 'America/Bogota', base: 'COP',
  users: [], targets: [], teamQuotas: [], opportunities: opportunities as ForecastSnapshot['opportunities'], rates: [], adjustments: [],
  snapshotToken: 't', canViewAll: true, canAdjust: true, canEditAny: true, currentUser: 'u',
});

describe('vista «Por mes»', () => {
  it('mesMas cruza el año', () => {
    expect(mesMas('2026-10', 2)).toBe('2026-12');
    expect(mesMas('2026-11', 2)).toBe('2027-01');
    expect(mesMas('2026-01', -1)).toBe('2025-12');
  });

  it('una ganada cuenta por el día de cierre en la zona de la organización, no por el día UTC', () => {
    // 2026-11-01 03:00 UTC = 31 de octubre 22:00 en Bogotá.
    const ganada = { status: 'won', is_won: true, closed_at: '2026-11-01T03:00:00Z', expected_close_date: '2026-12-20' };
    expect(mesDeOportunidad(ganada, 'America/Bogota')).toBe('2026-10');
    expect(mesDeOportunidad({ ...ganada, closed_at: null }, 'America/Bogota')).toBe('2026-12');
    expect(mesDeOportunidad({ status: 'open', is_won: false, closed_at: null, expected_close_date: null }, 'America/Bogota')).toBeNull();
  });

  it('reparte ganado, compromiso, mejor caso y ponderado en los tres meses; omitidas fuera', () => {
    const meses = calcularPorMes(
      foto([
        op('a', 100, 80),
        op('b', 50, 30, { expected_close_date: '2026-11-05' }),
        op('c', 40, 90, { expected_close_date: '2026-11-20', forecast_category: 'omitted' }),
        op('d', 30, 100, { status: 'won', is_won: true, closed_at: '2026-12-02T15:00:00Z' }),
        op('e', 20, 10, { expected_close_date: '2026-12-10' }),
      ]),
    );
    expect(meses.map((m) => m.mes)).toEqual(['2026-10', '2026-11', '2026-12']);
    const [oct, nov, dic] = meses;
    expect([oct.commit.total, oct.bestCase.total, oct.weighted.total, oct.oportunidades]).toEqual([100, 100, 80, 1]);
    expect([nov.commit.total, nov.bestCase.total, nov.weighted.total, nov.oportunidades]).toEqual([0, 50, 15, 1]);
    expect([dic.won.total, dic.commit.total, dic.bestCase.total, dic.weighted.total, dic.oportunidades]).toEqual([30, 30, 30, 32, 1]);
  });
});

describe('cuerpo de la pantalla', () => {
  const base = { enDetalle: false, vista: 'vendedor' as const, cuota: 450, abiertas: 5, ganadas: 1 };
  it('sin cuotas manda en la vista de equipo (1434:842149)', () => {
    expect(cuerpoPronostico({ ...base, cuota: 0 })).toBe('sinCuotas');
    expect(cuerpoPronostico({ ...base, cuota: 0, enDetalle: true })).toBe('oportunidades');
  });
  it('sin oportunidades del trimestre: EmptyState con enlace al pipeline', () => {
    expect(cuerpoPronostico({ ...base, abiertas: 0, ganadas: 0 })).toBe('sinOportunidades');
    expect(cuerpoPronostico({ ...base, abiertas: 0, ganadas: 2 })).toBe('vendedores');
  });
  it('«Por mes» y el detalle del vendedor', () => {
    expect(cuerpoPronostico({ ...base, vista: 'mes' })).toBe('meses');
    expect(cuerpoPronostico({ ...base, enDetalle: true })).toBe('oportunidades');
  });
});

describe('detalles de presentación', () => {
  it('minutos desde la carga, nunca negativos', () => {
    expect(minutosDesde(0, 5 * 60_000 + 59_000)).toBe(5);
    expect(minutosDesde(10, 0)).toBe(0);
  });
  it('mes en el idioma de la interfaz sin corrimiento de día', () => {
    expect(etiquetaMes('2026-10', 'es')).toBe('octubre de 2026');
    expect(etiquetaMes('2026-01', 'en')).toBe('January 2026');
  });
  it('símbolo de la moneda y tono de la barra del móvil', () => {
    expect(simboloMoneda('COP', 'es-CO')).toBe('$');
    expect(simboloMoneda('XXX-no', 'es-CO')).toBe('XXX-no');
    expect(tonoProgresoCobertura(0.52)).toBe('peligro');
    expect(tonoProgresoCobertura(0.82)).toBe('advertencia');
    expect(tonoProgresoCobertura(1.02)).toBe('exito');
  });
  it('CSV con montos sin formato y vacíos donde no hay cuota ni ajuste', () => {
    const r = (total: number) => ({ total });
    expect(filasCsvVendedores([{ userId: 'u', quota: r(0), won: r(1), commit: r(2), adjustment: r(0), bestCase: r(3), weighted: r(4), coverage: null }], () => 'Ana')).toEqual([['Ana', null, 1, 2, null, 3, 4, null]]);
    expect(filasCsvOportunidades([{ name: 'X', stage_name: 'S', expected_close_date: '2026-10-10', amount: '12.5', currency: 'COP', probability: 70, category: 'commit' }], (c) => c.toUpperCase(), (p) => p ?? 0)).toEqual([['X', 'S', '2026-10-10', 12.5, 'COP', 70, 'COMMIT']]);
    expect(filasCsvMeses([{ mes: '2026-10', oportunidades: 2, won: r(1), commit: r(2), bestCase: r(3), weighted: r(4) }])).toEqual([['2026-10', 1, 2, 3, 4, 2]]);
  });
});

describe('ruta', () => {
  it('/app/crm/pronostico monta la pantalla del Figma; el análisis de ingresos ya no es una página del CRM', () => {
    expect(leer('src/app/app/crm/pronostico/page.tsx')).toMatch(/PronosticoPantalla/);
    expect(fs.existsSync(path.join(ROOT, 'src/app/app/crm/pronostico/analisis'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'src/components/crm/revenueos/RevenueOsPage.tsx'))).toBe(false);
  });
  it('«⋯ › Ver en Reportes» abre el reporte de ingresos en /app/reportes (y solo con el módulo Reportes visible)', () => {
    const pantalla = leer('src/components/crm/pronostico/trimestre/PronosticoPantalla.tsx');
    expect(pantalla).toMatch(/rutaReporte\('clientes', 'crm-ingresos-mensual'\)/);
    expect(pantalla).toMatch(/usePaginasModulo\('reports'\)/);
    expect(pantalla).toMatch(/oculta: !verReportes/);
    expect(pantalla).not.toMatch(/push\('\/app\/crm\/pronostico\/analisis/);
    expect(pantalla).not.toMatch(/acciones\.analisis/);
    expect(leer('src/lib/services/reportes/modulos/crmIngresosReports.ts')).toMatch(/id: 'crm-ingresos-mensual'/);
  });
});
