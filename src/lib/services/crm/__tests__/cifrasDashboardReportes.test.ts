import { supabase } from '@/lib/supabase/config';
import { crmDashboardService } from '@/components/crm/dashboard/CRMDashboardService';
import { createReportesService } from '@/components/crm/reportes/ReportesService';
import { esOportunidadGanada } from '../estadoOportunidadLogica';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));

type Row = Record<string, unknown>;
type Response = { data: Row[] | null; error: { message: string } | null; count?: number };
const from = supabase.from as jest.Mock;
const traces: { table: string; fields: string; filters: [string, unknown][] }[] = [];
let responses: Record<string, Row[]>;
let forecast: Row[];
let failedTable: string | undefined;

beforeEach(() => {
  traces.length = 0;
  responses = {};
  forecast = [];
  failedTable = undefined;
  from.mockImplementation((table: string) => {
    const trace = { table, fields: '', filters: [] as [string, unknown][] };
    traces.push(trace);
    const query = {
      select: (fields: string) => { trace.fields = fields; return query; },
      eq: (field: string, value: unknown) => { trace.filters.push([field, value]); return query; },
      in: () => query, gte: () => query, lte: () => query, order: () => query,
      then: (resolve: (response: Response) => unknown) => Promise.resolve(resolve({
        data: table === 'opportunities' && trace.fields.includes('stages!inner') ? forecast : responses[table] ?? [],
        error: table === failedTable ? { message: 'Lectura no disponible' } : null,
        count: 0,
      })),
    };
    return query;
  });
});

const filters = { dateRange: { from: null, to: null }, channelId: null, pipelineId: null, agentId: null, branchId: null };
const reportFilters = { dateFrom: null, dateTo: null, channelId: null, pipelineId: null, agentId: null };

test.each([[0, 0], [1, 10], [50, 500], [100, 1000], [null, 0], [-1, 0], [150, 1000]])(
  'el KPI mensual de 1000 con probabilidad %s vale %s, en la escala 0–100', async (probability, expected) => {
    forecast = [{ amount: 1000, stages: { probability } }];
    const data = await crmDashboardService.getKPIs(120, filters);
    expect(data.monthForecast).toBe(expected);
    expect(traces.filter(t => t.table === 'opportunities').every(t => t.filters.some(([key, org]) => key === 'organization_id' && org === 120))).toBe(true);
  },
);

test('reportes cuentan varios cierres ganados y no confunden una etapa abierta de 100% con venta', async () => {
  responses.pipelines = [{ id: 'pipeline', name: 'Pipeline de prueba' }];
  responses.stages = [
    { id: 'open', name: 'Abierta', probability: 100, is_won: false },
    { id: 'won-a', name: 'Cierre A', probability: 0, is_won: true },
    { id: 'won-b', name: 'Cierre B', probability: 50, is_won: true },
  ];
  responses.opportunities = [
    { id: '1', stage_id: 'open', status: 'open', amount: 1000 },
    { id: '2', stage_id: 'open', status: 'lost', amount: 1000 },
    { id: '3', stage_id: 'won-a', status: 'won', amount: 1000 },
    { id: '4', stage_id: 'won-b', status: 'won', amount: 1000 },
    { id: '5', stage_id: 'open', status: 'won', amount: 1000 },
  ];
  const [data] = await createReportesService(120).getPipelineMetrics(reportFilters);
  expect(data).toMatchObject({ totalOpportunities: 5, totalValue: 5000, conversionRate: 60 });
  expect(traces.find(t => t.table === 'stages')?.filters).toContainEqual(['pipelines.organization_id', 120]);
  expect(traces.find(t => t.table === 'opportunities')?.fields).toContain('status');
});

test.each(['pipelines', 'stages', 'opportunities'])('un error en %s no se muestra como un reporte vacío', async table => {
  responses.pipelines = [{ id: 'pipeline', name: 'Pipeline de prueba' }];
  failedTable = table;
  await expect(createReportesService(120).getPipelineMetrics(reportFilters)).rejects.toEqual({ message: 'Lectura no disponible' });
});

test.each([
  [{ status: 'won', is_won: false }, true],
  [{ status: 'open', is_won: true }, true],
  [{ status: 'open', is_won: false }, false],
  [{ status: 'lost', is_won: false }, false],
  [{ status: null }, false],
])('pronóstico y reportes comparten el criterio de cierre %j', (o, expected) => {
  expect(esOportunidadGanada(o)).toBe(expected);
});
