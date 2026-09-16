/// <reference types="jest" />
/**
 * F0-SEC r3 · constructor · `POST /api/ai-assistant/reportes` (tester r2, fallo 3).
 *
 * El asistente de reportes ejecuta `fn_reporte_crm_*` a través de
 * `reportAgentService.sendMessage` → `ejecutarReporte` → `crmReports[].fetch`.
 * Hasta r2, `fetch` usaba SIEMPRE el cliente browser de `@/lib/supabase/config`,
 * que en un route handler no tiene sesión: la RPC corría como `anon` y solo
 * funcionaba porque `anon` podía ejecutarla (el agujero que cierra la
 * migración `crm_v4_f00_40_cerrar_rpc_crm_anon`).
 *
 * Ahora el route handler pasa `ctx.supabase` (cliente de SESIÓN de
 * `getServerOrgContext`) y `fetch` lo usa. Este test fija:
 *  1. la ruta entrega el cliente de sesión al servicio;
 *  2. el motor lo entrega a `fetch` y `crmReports` ejecuta la RPC con ÉL, con
 *     la organización de la sesión (no la del body);
 *  3. sin cliente inyectado, `fetch` sigue cayendo al cliente browser (la página
 *     `app/reportes` no cambia);
 *  4. guardarraíl estático: ningún módulo de reportes usa el cliente browser
 *     directamente dentro de `fetch` (todos pasan por `client ?? browserSupabase`).
 */
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

const sessionRpc = jest.fn(async () => ({ data: { total_pipeline: 10, forecast: 5, por_etapa: [] }, error: null }));
const browserRpc = jest.fn(async () => ({ data: { total_pipeline: 99, forecast: 99, por_etapa: [] }, error: null }));
const SESSION_CLIENT = { rpc: sessionRpc, from: jest.fn() };

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => ({ organizationId: 7, userId: 'user-1', supabase: SESSION_CLIENT }),
  // r4: el error real, para que el 403 de `readOrgBody` (organización ajena) llegue como tal y no como 500.
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: browserRpc, from: jest.fn() } }));
// r4: la lista blanca de módulos sale del servidor con el cliente de sesión.
const getActiveModules = jest.fn(async (_orgId: number, _client: unknown) => [{ code: 'crm' }]);
jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: { getActiveModules: (orgId: number, client: unknown) => getActiveModules(orgId, client) },
}));
jest.mock('@/lib/services/aiCreditsService', () => ({
  checkAICredits: async () => ({ allowed: true }),
  estimateCredits: () => 1,
  consumeAICredits: async () => true,
}));
const chatCreate = jest.fn(async () => ({
  choices: [{ message: { content: 'Aquí va el funnel.\n```report\n{"reportId":"crm-funnel"}\n```' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
}));
jest.mock('openai', () => ({
  __esModule: true,
  default: class { chat = { completions: { create: chatCreate } }; },
}));

import { POST } from '../route';
import { crmReports } from '@/lib/services/reportes/modulos/crmReports';
import { ejecutarReporte } from '@/lib/services/reportes/reportesEngine';
import type { PeriodoCierre, ReportesClient } from '@/lib/services/reportes/types';

const periodo: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre 2026' } as PeriodoCierre;

const originalKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  sessionRpc.mockClear();
  browserRpc.mockClear();
  process.env.OPENAI_API_KEY = 'sk-test-clave-de-prueba-no-real';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; });

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/ai-assistant/reportes', {
    method: 'post',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('POST /api/ai-assistant/reportes ejecuta el reporte con el cliente de SESIÓN', () => {
  test('fn_reporte_crm_funnel corre con ctx.supabase y la organización de la sesión; el cliente browser no se toca', async () => {
    // r4: un `context.organizationId` ajeno ya no se sobrescribe en silencio: 403 (ver testerR3.f0sec).
    const foreign = await post({ message: 'x', conversationHistory: [], context: { organizationId: 999 }, periodoActual: periodo, modulosActivos: ['crm'] });
    expect(foreign.status).toBe(403);
    expect(sessionRpc).not.toHaveBeenCalled();

    const res = await post({
      message: 'muéstrame el funnel',
      conversationHistory: [],
      context: { organizationId: 7, organizationName: 'x', branchId: null },
      periodoActual: periodo,
      modulosActivos: ['crm'],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reportData?.id).toBe('crm-funnel');
    expect(sessionRpc).toHaveBeenCalledTimes(1);
    expect(sessionRpc).toHaveBeenCalledWith('fn_reporte_crm_funnel', expect.objectContaining({ p_organization_id: 7 }));
    expect(browserRpc).not.toHaveBeenCalled();
    // El dato viene del cliente de sesión (10), no del browser (99).
    expect(json.reportData?.kpis?.[0]?.valor).toBe(10);
  });
});

describe('motor de reportes: el cliente inyectado llega a fetch', () => {
  test('ejecutarReporte(..., client) → crmReports usa ese cliente', async () => {
    await ejecutarReporte('crm-ranking-vendedores', 7, periodo, null, SESSION_CLIENT as unknown as ReportesClient);
    expect(sessionRpc).toHaveBeenCalledWith('fn_reporte_crm_ranking_vendedores', expect.objectContaining({ p_organization_id: 7 }));
    expect(browserRpc).not.toHaveBeenCalled();
  });

  test('sin cliente (página app/reportes en el navegador) → cae al cliente browser, como antes', async () => {
    sessionRpc.mockClear();
    const funnel = crmReports.find((r) => r.id === 'crm-funnel')!;
    await funnel.fetch(7, periodo, null);
    expect(browserRpc).toHaveBeenCalledWith('fn_reporte_crm_funnel', expect.objectContaining({ p_organization_id: 7 }));
    expect(sessionRpc).not.toHaveBeenCalled();
  });
});

describe('guardarraíl estático: los 19 módulos de reportes aceptan el cliente inyectado', () => {
  const dir = path.join(process.cwd(), 'src', 'lib', 'services', 'reportes', 'modulos');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

  test('cada fetch declara `client?: ReportesClient` y resuelve `client ?? browserSupabase`; nada usa `supabase` a pelo', () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const fetches = (src.match(/async fetch\(/g) ?? []).length;
      const withClient = (src.match(/async fetch\(orgId: number, periodo: PeriodoCierre, branchId\?: number \| null, client\?: ReportesClient\)/g) ?? []).length;
      const fallbacks = (src.match(/const db = client \?\? browserSupabase;/g) ?? []).length;
      const rawUses = src.replace(/import \{ supabase as browserSupabase \}[^\n]*/g, '').match(/\bsupabase\b/g) ?? [];
      if (fetches === 0 || withClient !== fetches || fallbacks !== fetches || rawUses.length > 0) {
        offenders.push(`${f}: fetch=${fetches} conClient=${withClient} fallback=${fallbacks} usosDirectos=${rawUses.length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
