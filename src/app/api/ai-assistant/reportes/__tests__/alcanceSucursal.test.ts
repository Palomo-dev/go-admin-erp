/// <reference types="jest" />
/**
 * `POST /api/ai-assistant/reportes` con un gerente de una sola sede.
 *
 * La sucursal llega del selector del cliente: la ruta la valida contra el
 * alcance de la sesión antes de gastar créditos o llamar al modelo, y el agente
 * no ejecuta reportes de toda la organización sin acceso a todas las sedes.
 * Organización y sucursales ficticias (org 7, sucursales 1–3, asignada la 2).
 */
import { NextRequest } from 'next/server';

type Resultado = { data: unknown; error: { message: string } | null };
const tablas: Record<string, Resultado> = {
  branches: { data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null },
  member_branches: { data: [{ branch_id: 2 }], error: null },
};
const sessionRpc = jest.fn(async () => ({ data: { total_pipeline: 10, forecast: 5, por_etapa: [] }, error: null }));
const filtros: Array<[string, string, unknown]> = [];
function chain(tabla: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'gte', 'lte', 'order', 'in', 'neq', 'is', 'limit']) b[m] = () => b;
  b.eq = (col: string, val: unknown) => { filtros.push([tabla, col, val]); return b; };
  b.then = (res: (x: Resultado) => void) => res(tablas[tabla] ?? { data: [], error: null });
  return b;
}
const SESSION_CLIENT = { rpc: sessionRpc, from: (t: string) => chain(t) };

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => ({
    organizationId: 7,
    userId: 'user-1',
    roleId: 5,
    roleName: 'gerente',
    isSuperAdmin: false,
    memberId: 40,
    supabase: SESSION_CLIENT,
  }),
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: { getActiveModules: async () => [{ code: 'crm' }] },
}));
const checkCredits = jest.fn(async () => ({ allowed: true }));
jest.mock('@/lib/services/aiCreditsService', () => ({
  checkAICredits: () => checkCredits(),
  estimateCredits: () => 1,
  consumeAICredits: async () => true,
}));
let aiReply = '';
const chatCreate = jest.fn(async (_args: { messages: Array<{ content: string }> }) => ({
  choices: [{ message: { content: aiReply } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
}));
jest.mock('openai', () => ({ __esModule: true, default: class { chat = { completions: { create: chatCreate } }; } }));

import { POST } from '../route';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

const periodo = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre 2026' } as PeriodoCierre;
const originalKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  sessionRpc.mockClear(); chatCreate.mockClear(); checkCredits.mockClear();
  filtros.length = 0;
  aiReply = 'Actividades.\n```report\n{"reportId":"crm-actividades"}\n```';
  process.env.OPENAI_API_KEY = 'sk-test-clave-de-prueba-no-real';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; });

function post(branchId: unknown) {
  return POST(new NextRequest('http://localhost/api/ai-assistant/reportes', {
    method: 'post',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'reporte', conversationHistory: [], context: { organizationId: 7, userName: 'x', branchId }, periodoActual: periodo }),
  }));
}

describe('sucursal pedida por el cliente', () => {
  test('consolidado sin acceso total → 403 sin llamar al modelo ni cobrar', async () => {
    const res = await post(null);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('BRANCH_SCOPE_REQUIRED');
    expect(chatCreate).not.toHaveBeenCalled();
    expect(checkCredits).not.toHaveBeenCalled();
  });

  test('sucursal ajena → 403 BRANCH_FORBIDDEN', async () => {
    const res = await post(1);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('BRANCH_FORBIDDEN');
    expect(chatCreate).not.toHaveBeenCalled();
  });

  test('su sucursal (también como texto) → el reporte corre con esa sucursal', async () => {
    const res = await post('2');
    expect(res.status).toBe(200);
    expect((await res.json()).reportData?.id).toBe('crm-actividades');
    expect(filtros).toContainEqual(['activities', 'branch_id', 2]);
    expect(filtros).toContainEqual(['activities', 'organization_id', 7]);
  });
});

describe('reportes de toda la organización', () => {
  test('no aparecen en el catálogo del prompt ni se ejecutan', async () => {
    aiReply = 'Funnel.\n```report\n{"reportId":"crm-funnel"}\n```';
    const res = await post(2);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reportData).toBeUndefined();
    expect(json.content).toMatch(/requiere acceso a todas las sucursales/);
    expect(sessionRpc).not.toHaveBeenCalled();
    const prompt = chatCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).not.toMatch(/crm-funnel:/);
  });
});
