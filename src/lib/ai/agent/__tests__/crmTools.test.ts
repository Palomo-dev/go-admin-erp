import type { SupabaseClient } from '@supabase/supabase-js';
import { crearOportunidadCrm } from '../tools/crm';
import { getTool, resetRegistry, resolveTools } from '../toolRegistry';
import { runAgent, type AgentEvent } from '../runAgent';
import { openModelStream } from '../openaiAdapter';
import { resolveModel } from '../modelRouter';
import { getServiceClient } from '@/lib/supabase/server-service';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import type { ToolContext } from '../types';

jest.mock('@/lib/utils/orgContext', () => ({ ...jest.requireActual('@/lib/utils/orgContextError') }));
jest.mock('../openaiAdapter', () => ({ openModelStream: jest.fn() }));
jest.mock('../modelRouter', () => ({ resolveModel: jest.fn() }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn() }));

const actor = '11111111-1111-4111-8111-111111111111';
const cliente = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const rpc = jest.fn();
const from = jest.fn(() => { throw new Error('La herramienta no debe escribir tablas directamente'); });
const ctx: ToolContext = {
  organizationId: 120, branchId: null, userId: actor, conversationId: null,
  supabase: { rpc, from } as unknown as SupabaseClient,
  locale: 'es-CO', currency: 'USD', channel: 'text',
  capabilities: { level: 'write_low', enabledTools: null, isAdmin: false,
    permissions: new Set(['crm.opportunities.create']), activeModules: new Set(['crm']),
    undoWindowMinutes: 15, bulkMaxRows: 500 },
};

beforeEach(() => {
  jest.clearAllMocks();
  resetRegistry();
  rpc.mockResolvedValue({ data: { id, name: 'Negocio sintético', currency: 'USD' }, error: null });
});

test('registro exige permiso de crear, módulo CRM y confirmación; lectura no concede escritura', () => {
  expect(getTool('crear_oportunidad')).toBe(crearOportunidadCrm);
  expect(crearOportunidadCrm.risk).toBe('medium');
  const nombres = (c = ctx.capabilities) => resolveTools(c).map(t => t.name);
  expect(nombres()).toContain('crear_oportunidad');
  expect(nombres({ ...ctx.capabilities, permissions: new Set(['crm.opportunities.view']) })).not.toContain('crear_oportunidad');
  expect(nombres({ ...ctx.capabilities, level: 'read' })).not.toContain('crear_oportunidad');
  expect(nombres({ ...ctx.capabilities, activeModules: new Set() })).not.toContain('crear_oportunidad');
  expect(nombres({ ...ctx.capabilities, enabledTools: [] })).not.toContain('crear_oportunidad');
  expect(resolveTools(ctx.capabilities, 'voice').map(t => t.name)).not.toContain('crear_oportunidad');
});

test.each([
  { name: '' }, { name: 'x'.repeat(256) }, { name: 'Negocio', amount: -1 },
  { name: 'Negocio', amount: true }, { name: 'Negocio', customer_id: 'inventado' },
  { name: 'Negocio', organization_id: 999 }, { name: 'Negocio', organizationId: 120 },
  { name: 'Negocio', created_by: actor }, { name: 'Negocio', origen: 'factura' },
  { name: 'Negocio', origen_ref: { invoice_id: id } }, { name: 'Negocio', metadata: {} },
  { name: 'Negocio', next_contact_at: '2026-10-12T10:00:00' },
])('comparte validación canónica y rechaza argumentos peligrosos: %p', raw => {
  expect(crearOportunidadCrm.parseArgs(raw)).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test('el resumen no escribe y conserva moneda explícita y día de cierre', async () => {
  const args = crearOportunidadCrm.parseArgs({ name: 'Negocio', customer_id: cliente, amount: 20,
    currency: 'EUR', expected_close_date: '2026-10-12' })!;
  const preview = await crearOportunidadCrm.preview(ctx, args);
  expect(preview.lines).toContainEqual({ label: 'Cliente', value: cliente });
  expect(preview.lines).toContainEqual({ label: 'Cierre esperado', value: '2026-10-12' });
  expect(preview.lines.find(l => l.label === 'Monto previsto')?.value).toMatch(/20/);
  expect(preview.reversible).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(chargeAiCredits).not.toHaveBeenCalled();
});

test('la ejecución usa sesión y RPC única, con origen general y sin inventar roles', async () => {
  const args = crearOportunidadCrm.parseArgs({ name: 'Negocio sintético', customer_id: cliente })!;
  const resultado = await crearOportunidadCrm.execute(ctx, args);
  expect(resultado).toMatchObject({ ok: true, entity: { type: 'opportunity', id, url: `/app/crm/oportunidades/${id}` } });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('crm_create_opportunity', { p_org: 120,
    p_data: { name: 'Negocio sintético', customer_id: cliente, amount: 0,
      currency: 'USD', salesperson_id: actor, origen: 'general', source: 'go_assistant' } });
  expect(from).not.toHaveBeenCalled();
  expect(getServiceClient).not.toHaveBeenCalled();
  expect(resultado.undo).toBeUndefined();
});

test.each([
  ['42501', 'sin_permiso', 'Tu acceso'], ['P0002', 'cliente_no_encontrado', 'esta organización'],
  ['P0001', 'sin_embudo_ventas', 'embudo'], ['XX000', 'detalle interno sensible', 'Revisa su estado'],
])('propaga fallo %s sin éxito ficticio ni texto interno de Postgres', async (code, message, esperado) => {
  rpc.mockResolvedValue({ data: null, error: { code, message } });
  const result = await crearOportunidadCrm.execute(ctx, { name: 'Negocio' });
  expect(result.ok).toBe(false);
  expect(result.message).toContain(esperado);
  expect(result.entity).toBeUndefined();
  expect(result.message).not.toContain('detalle interno sensible');
});

test('el bucle real pausa la nueva herramienta antes de ejecutar o escribir oportunidades', async () => {
  const single = jest.fn().mockResolvedValue({ data: { id: 'accion-pendiente', expires_at: '2026-10-02T09:00:00Z' }, error: null });
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  const actionFrom = jest.fn().mockReturnValue({ insert });
  jest.mocked(getServiceClient).mockReturnValue({ from: actionFrom } as unknown as SupabaseClient);
  jest.mocked(resolveModel).mockReturnValue({ model: 'modelo-configurado', provider: 'openai',
    temperature: 0.2, maxTokens: 1500, source: 'organization' });
  jest.mocked(openModelStream).mockResolvedValue({ model: 'modelo-configurado',
    chunks: (async function* () {
      yield { toolCall: { id: 'propuesta', name: 'crear_oportunidad', arguments: '{"name":"Negocio sintético","customer_id":"22222222-2222-4222-8222-222222222222"}' } };
    })(),
  });
  const eventos: AgentEvent[] = [];
  await runAgent({ ctx, systemPrompt: 'Prueba', history: [], message: 'Crea la oportunidad',
    settings: { model: null, temperature: null, maxTokens: null, systemRules: null, tone: null, language: null, overrides: {} },
    emit: e => { eventos.push(e); },
  });
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 120, user_id: actor,
    tool_name: 'crear_oportunidad', risk: 'medium', status: 'pending' }));
  expect(eventos.filter(e => e.type === 'action')).toHaveLength(1);
  expect(rpc).not.toHaveBeenCalled();
  expect(actionFrom).toHaveBeenCalledWith('ai_agent_actions');
});
