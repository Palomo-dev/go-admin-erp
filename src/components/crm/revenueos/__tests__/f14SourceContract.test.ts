/// <reference types="jest" />
/**
 * F14 — contrato de fuente de Revenue OS. El tablero de
 * `/app/crm/pronostico/analisis` (antes `/app/crm/pronostico`) se retiró el
 * 2026-11-24: sus secciones son reportes del módulo Reportes
 * (`src/lib/services/reportes/modulos/crmIngresosReports.ts`, grupo «Clientes
 * y CRM»). Sin jsdom: se leen los archivos y se fijan las reglas del brief y de
 * CLAUDE.md que un refactor rompería en silencio (límite de 300 líneas en el
 * servicio, fechas por zona horaria, organización nunca de la query, `[]`
 * silencioso, cálculo en los módulos puros y no en la vista).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../../..');
const rel = (p: string) => path.join(ROOT, p);
const read = (p: string) => fs.readFileSync(rel(p), 'utf8');
const lines = (p: string) => read(p).split(/\r?\n/).length;

const UI_DIR = 'src/components/crm/revenueos';
/** Lo que queda en la carpeta de UI: formato y textos de apoyo (los usan los reportes y los tests). */
const UI = {
  formatters: `${UI_DIR}/formatters.ts`,
  hints: `${UI_DIR}/kpiHints.ts`,
};
const REPORTES = 'src/lib/services/reportes/modulos/crmIngresosReports.ts';
const CATALOGO = 'src/lib/services/reportes/reportesCatalogo.ts';
/** Componentes del tablero retirado: no deben volver. */
const RETIRADOS = [
  'src/app/app/crm/pronostico/analisis',
  `${UI_DIR}/RevenueOsPage.tsx`,
  `${UI_DIR}/useRevenueDashboard.ts`,
  `${UI_DIR}/RevenueRangeControl.tsx`,
  `${UI_DIR}/KpiTiles.tsx`,
  `${UI_DIR}/RevenueTrendChart.tsx`,
  `${UI_DIR}/FunnelPanel.tsx`,
  `${UI_DIR}/CohortTable.tsx`,
  `${UI_DIR}/RevenueMathPanel.tsx`,
  'src/components/crm/pronostico/ForecastDashboard.tsx',
  'src/components/crm/pronostico/ForecastScenarios.tsx',
];

const SERVICE_FILES = [
  'src/lib/services/crm/revenueOsService.ts',
  'src/lib/services/crm/revenueOs/rpc.ts',
  'src/lib/services/crm/revenueOs/kpiCards.ts',
  'src/lib/services/crm/revenueOs/revenueInputs.ts',
  'src/lib/services/crm/revenueOs/routeSupport.ts',
  'src/lib/services/crm/revenueOs/dateRange.ts',
  'src/lib/services/crm/revenueOs/revenueMath.ts',
  'src/lib/services/crm/revenueOs/forecastScenarios.ts',
  'src/lib/services/crm/revenueOs/funnelConversion.ts',
  'src/lib/services/crm/revenueOs/cohortModel.ts',
];

const ROUTE_DIR = 'src/app/api/crm/revenue';
const routeFiles = () =>
  fs
    .readdirSync(rel(ROUTE_DIR), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '__tests__')
    .map((d) => `${ROUTE_DIR}/${d.name}/route.ts`);

describe('Archivos: el tablero pasó a Reportes', () => {
  it('quedan los formatos y los textos de apoyo; los componentes del tablero no existen', () => {
    for (const p of Object.values(UI)) expect(fs.existsSync(rel(p))).toBe(true);
    expect(RETIRADOS.filter((p) => fs.existsSync(rel(p)))).toEqual([]);
    expect(fs.existsSync(rel('src/app/app/crm/revenue-os'))).toBe(false);
    expect(read('src/app/app/crm/pronostico/page.tsx')).toMatch(/PronosticoPantalla/);
  });
  it('las cinco secciones son reportes del módulo CRM en el grupo «clientes»', () => {
    const src = read(REPORTES);
    const cat = read(CATALOGO);
    for (const id of ['crm-ingresos-mensual', 'crm-conversion-embudo', 'crm-escenarios-forecast', 'crm-cohortes-retencion', 'crm-matematica-comercial']) {
      expect(src).toMatch(new RegExp(`id: '${id}'`));
      expect(cat).toMatch(new RegExp(`'${id}': \{ grupo: 'clientes'`));
    }
    expect(cat).toMatch(/crm: \[\.\.\.crmReports, \.\.\.crmIngresosReports\]/);
  });
  it('ningún módulo del servicio ni ruta supera 300 líneas', () => {
    const all = [...Object.values(UI), ...SERVICE_FILES, ...routeFiles()];
    const big = all.filter((p) => lines(p) > 300);
    expect(big).toEqual([]);
  });
});

describe('Fechas y zona horaria', () => {
  const files = [...Object.values(UI), REPORTES, ...SERVICE_FILES, ...routeFiles()];
  it("nadie usa toISOString().split/slice ni split('T')[0] para derivar un día", () => {
    const bad = files.filter((p) => /toISOString\(\)\s*\.\s*(split|slice)|\.split\(['"]T['"]\)\[0\]/.test(read(p)));
    expect(bad).toEqual([]);
  });
  it('el rango por defecto sale de todayInTz + la zona de la organización', () => {
    expect(read('src/lib/services/crm/revenueOs/routeSupport.ts')).toMatch(/todayInTz\(timezone\)/);
    expect(read('src/lib/services/crm/revenueOs/routeSupport.ts')).toMatch(/getOrgTimezoneServer\(ctx\.organizationId/);
  });
});

describe('Organización y errores en las rutas', () => {
  it('toda ruta usa getServerOrgContext y ninguna lee organization_id de la query o del body para consultar', () => {
    for (const p of routeFiles()) {
      const src = read(p);
      expect(src).toMatch(/getServerOrgContext\(\)/);
      expect(src).not.toMatch(/searchParams\.get\(['"]organization_id['"]\)/);
      expect(src).not.toMatch(/searchParams\.get\(['"]org(_id|Id)?['"]\)/);
    }
  });
  it('rpc.ts no devuelve [] ante error: lanza RevenueOsError con el nombre de la función', () => {
    const src = read('src/lib/services/crm/revenueOs/rpc.ts');
    expect(src).not.toMatch(/console\.warn/);
    expect(src).toMatch(/throw new RevenueOsError\(`\$\{name\}: /);
    const afterError = src.split('if (error)')[1] ?? '';
    expect(afterError.slice(0, 200)).not.toMatch(/return \[\]/);
  });
  it('revenueOsService.ts ya no tiene el patrón «warn + return []»', () => {
    expect(read('src/lib/services/crm/revenueOsService.ts')).not.toMatch(/no disponible/);
  });
  it('PUT de insumos exige admin en servidor y rechaza organization_id ajeno con 403', () => {
    const src = read(`${ROUTE_DIR}/inputs/route.ts`);
    expect(src).toMatch(/requireOrgAdmin\(ctx\)/);
    expect(src).toMatch(/403/);
    // Regla 5 por el punto único de F0-SEC (readOrgBody: 403 + registro si el body
    // trae otra organización) o por la comprobación local previa.
    expect(src).toMatch(/readOrgBody\(|body\.organization_id/);
  });
});

describe('Reportes: el cálculo sigue en el servicio y en los módulos puros', () => {
  const src = () => read(REPORTES);
  it('resumen, embudo, cohortes, escenarios y matemática llaman a las funciones de Revenue OS', () => {
    const r = src();
    expect(r).toMatch(/summarizeRevenueMetrics\(/);
    expect(r).toMatch(/computeFunnelConversion\(/);
    expect(r).toMatch(/buildCohortTable\(/);
    expect(r).toMatch(/computeForecastScenarios\(/);
    expect(r).toMatch(/buildRevenueMath\(/);
    expect(read('src/lib/services/crm/revenueOsService.ts')).toMatch(/const math = buildRevenueMath\(/);
    // Nada de fórmulas reescritas en el reporte.
    expect(r).not.toMatch(/computeLtv\(|computeCac\(|computeArpa\(|probability \/ 100/);
  });
  it('sin cifras inventadas: un null se pinta «—» y lo que falta se explica con math.missing', () => {
    const r = src();
    expect(r).toMatch(/const SIN = '—'/);
    expect(r).toMatch(/math\.missing\[f\.key\]/);
  });
  it('los insumos se siguen guardando por PUT /api/crm/revenue/inputs y el reporte solo los lee', () => {
    expect(read(`${ROUTE_DIR}/inputs/route.ts`)).toMatch(/export async function PUT/);
    expect(src()).toMatch(/getRevenueInputs\(orgId, db\)/);
    expect(src()).not.toMatch(/saveRevenueInputs/);
  });
  it('el periodo del visor pasa a las RPC con fin exclusivo y el tope de 36 meses', () => {
    expect(src()).toMatch(/resolveDateRange\(fechaInicio, addDaysPlain\(fechaFin, 1\), fechaFin\)/);
  });
  it('el forecast usa los escenarios puros (probabilidad / 100 dentro del módulo, no en el reporte)', () => {
    expect(read('src/lib/services/crm/revenueOs/forecastScenarios.ts')).toMatch(/probabilityToFraction/);
  });
});
