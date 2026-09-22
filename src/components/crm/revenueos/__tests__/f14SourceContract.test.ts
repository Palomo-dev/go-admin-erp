/// <reference types="jest" />
/**
 * F14 — contrato de fuente del panel Revenue OS (`/app/crm/pronostico`).
 * Sin jsdom: se leen los archivos y se fijan las reglas del brief y de
 * CLAUDE.md que un refactor rompería en silencio (límite de 300 líneas,
 * fechas por zona horaria, celdas de cohorte con número, organización nunca
 * de la query, `[]` silencioso, motion reducido, tablas accesibles).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../../..');
const rel = (p: string) => path.join(ROOT, p);
const read = (p: string) => fs.readFileSync(rel(p), 'utf8');
const lines = (p: string) => read(p).split(/\r?\n/).length;

const UI_DIR = 'src/components/crm/revenueos';
const UI = {
  page: `${UI_DIR}/RevenueOsPage.tsx`,
  hook: `${UI_DIR}/useRevenueDashboard.ts`,
  range: `${UI_DIR}/RevenueRangeControl.tsx`,
  kpis: `${UI_DIR}/KpiTiles.tsx`,
  trend: `${UI_DIR}/RevenueTrendChart.tsx`,
  funnel: `${UI_DIR}/FunnelPanel.tsx`,
  cohorts: `${UI_DIR}/CohortTable.tsx`,
  math: `${UI_DIR}/RevenueMathPanel.tsx`,
  formatters: `${UI_DIR}/formatters.ts`,
  hints: `${UI_DIR}/kpiHints.ts`,
  scenarios: 'src/components/crm/pronostico/ForecastScenarios.tsx',
  forecastDashboard: 'src/components/crm/pronostico/ForecastDashboard.tsx',
  route: 'src/app/app/crm/pronostico/page.tsx',
};

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

describe('Archivos del panel', () => {
  it('existen todos los componentes y el hook', () => {
    for (const p of Object.values(UI)) expect(fs.existsSync(rel(p))).toBe(true);
  });
  it('la página /app/crm/pronostico monta RevenueOsPage (sin página nueva)', () => {
    expect(read(UI.route)).toMatch(/RevenueOsPage/);
    expect(fs.existsSync(rel('src/app/app/crm/revenue-os'))).toBe(false);
  });
  it('ningún componente ni módulo supera 300 líneas', () => {
    const all = [...Object.values(UI), ...SERVICE_FILES, ...routeFiles()];
    const big = all.filter((p) => lines(p) > 300);
    expect(big).toEqual([]);
  });
});

describe('Fechas y zona horaria', () => {
  const files = [...Object.values(UI), ...SERVICE_FILES, ...routeFiles()];
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

describe('UI: brief y accesibilidad', () => {
  it('la página respeta prefers-reduced-motion (un solo MotionConfig reducedMotion="user" en el provider compartido, F15)', () => {
    // F15 (2026-09-21): el `MotionConfig` vive en src/components/shared/motion/MotionProvider.tsx,
    // montado en src/app/app/layout.tsx; la página no lo anida.
    expect(read('src/components/shared/motion/MotionProvider.tsx')).toMatch(/<MotionConfig reducedMotion="user"/);
    expect(read(UI.page)).not.toMatch(/<MotionConfig/);
  });
  it('las celdas de cohorte llevan el número en el texto, no solo color; tabla con caption y scope', () => {
    const src = read(UI.cohorts);
    expect(src).toMatch(/<caption/);
    expect(src).toMatch(/scope="col"/);
    expect(src).toMatch(/scope="row"/);
    expect(src).toMatch(/\{cell\.label\}/);
  });
  it('el embudo muestra la conversión en una tabla accesible y usa el módulo puro', () => {
    const src = read(UI.funnel);
    expect(src).toMatch(/computeFunnelConversion/);
    expect(src).toMatch(/<caption/);
    expect(src).toMatch(/scope="col"/);
  });
  it('la tendencia usa Recharts con tooltip y ofrece vista de tabla', () => {
    const src = read(UI.trend);
    expect(src).toMatch(/from 'recharts'/);
    expect(src).toMatch(/<Tooltip/);
    expect(src).toMatch(/<table/);
    expect(src).toMatch(/<caption/);
  });
  it('estados vacíos honestos: sin cifras inventadas', () => {
    const all = Object.values(UI).map(read).join('\n');
    expect(all).toMatch(/Sin oportunidades ganadas en el periodo/);
    expect(read(UI.kpis)).toMatch(/Sin datos/);
    expect(read(UI.math)).toMatch(/math\.missing\[/);
  });
  it('el forecast usa los escenarios puros y el ponderado corregido (probabilidad / 100)', () => {
    expect(read(UI.scenarios)).toMatch(/computeForecastScenarios/);
    const fd = read(UI.forecastDashboard);
    expect(fd).toMatch(/weightedOpenAmount/);
    expect(fd).not.toMatch(/\(o\.amount \|\| 0\) \* \(stage\?\.probability \|\| 0\)/);
  });
  it('la matemática comercial se lee del servidor (math) y los insumos se guardan por PUT /api/crm/revenue/inputs', () => {
    const src = read(UI.math);
    expect(src).toMatch(/\/api\/crm\/revenue\/inputs/);
    expect(src).toMatch(/method: 'PUT'/);
    expect(src).not.toMatch(/computeLtv\(|computeCac\(/);
  });
  it('color de marca blue-600 en la acción principal y sin dependencias nuevas', () => {
    expect(read(UI.math)).toMatch(/bg-blue-600/);
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.recharts).toBeDefined();
    expect(pkg.dependencies['motion']).toBeDefined();
  });
});
