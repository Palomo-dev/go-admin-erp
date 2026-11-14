/**
 * POST /api/chat/ai/lab-test — Laboratorio de IA con respuesta real
 * (Figma 93-chat-pendientes 04 y 05):
 * - organización de la sesión y permiso resuelto en el servidor;
 * - saldo ANTES del proveedor, cobro DESPUÉS con `chargeAiCredits` (1 crédito);
 * - si el proveedor falla, no se cobra;
 * - el prompt es el de la IA real (núcleo compartido) con los fragmentos
 *   elegidos, y no se escribe nada en conversaciones, mensajes ni trabajos.
 */
import { OrgContextError } from '@/lib/utils/orgContextError';

const tienePermiso = jest.fn();
const checkAICredits = jest.fn();
const chargeAiCredits = jest.fn();
const generar = jest.fn();

/** Tablas y RPC que toca la prueba, con sus filtros. */
let lecturas: { tabla: string; filtros: Record<string, unknown> }[];
let escrituras: string[];
let rpcs: string[];

function fakeSupabase(datos: Record<string, unknown>) {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const resolver = () => {
        lecturas.push({ tabla, filtros });
        return { data: datos[tabla] ?? null, error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filtros[c] = v), q),
        in: (c: string, v: unknown) => ((filtros[`${c}:in`] = v), Promise.resolve(resolver())),
        limit: () => q,
        maybeSingle: async () => resolver(),
        single: async () => resolver(),
        insert: () => {
          escrituras.push(tabla);
          return q;
        },
        update: () => {
          escrituras.push(tabla);
          return q;
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
      };
      return q;
    },
    rpc: async (nombre: string) => {
      rpcs.push(nombre);
      if (nombre === 'calcular_costo_llm') return { data: 0.0004, error: null };
      return { data: null, error: null };
    },
  };
}

const DATOS = {
  ai_settings: { provider: 'openai', model: 'gpt-5.6-luna', system_rules: 'Responde en tono cercano.' },
  ai_vertical_efectivo: { vertical: 'retail' },
  organizations: { name: 'Tienda de prueba', subdomain: null },
  website_settings: null,
  organization_payment_methods: [],
  organization_taxes: null,
  quick_replies: [],
  knowledge_fragments: [{ title: 'Envíos', content: 'Gratis desde 150.000 en Envigado.' }],
  channels: { type: 'instagram' },
  ai_modelos_disponibles: null as unknown,
};

const ctx = { userId: 'u-1', organizationId: 120, roleId: 3, isSuperAdmin: false, memberId: 7, supabase: fakeSupabase(DATOS) };
const servicio = { actual: fakeSupabase(DATOS) };

jest.mock('@/lib/utils/orgContext', () => {
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    getServerOrgContext: async () => ctx,
    readOrgBody,
    OrgContextError: Err,
    requireOrgAdminOrPermission: async (c: unknown, codigo: string) => {
      if (!(await tienePermiso(c, codigo))) throw new Err('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
    },
  };
});
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => servicio.actual }));
jest.mock('@/lib/services/aiCreditsService', () => ({ checkAICredits: (...a: unknown[]) => checkAICredits(...a) }));
jest.mock('@/lib/services/crm/aiCostService', () => {
  class InsufficientCreditsError extends Error {}
  return { chargeAiCredits: (...a: unknown[]) => chargeAiCredits(...a), InsufficientCreditsError };
});
jest.mock('../../../../../../../supabase/functions/_shared/ai-chat/generacionLlm', () => ({
  ...jest.requireActual('../../../../../../../supabase/functions/_shared/ai-chat/generacionLlm'),
  generarSegunProveedor: (...a: unknown[]) => generar(...a),
}));
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ falso: true })));

import { POST } from '../route';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';

const FRAGMENTO = '3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f';
const CUERPO = { query: '¿Cuánto vale el envío?', canal: 'whatsapp', temperatura: 0.3, maxTokens: 200, fragmentIds: [FRAGMENTO] };
const peticion = (body: unknown) =>
  new Request('https://erp.example/api/chat/ai/lab-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const RESPUESTA_LLM = { content: 'El envío es gratis desde $150.000.', model: 'gpt-5.6-luna', promptTokens: 400, completionTokens: 112, totalTokens: 512, cachedTokens: 0 };

beforeEach(() => {
  lecturas = [];
  escrituras = [];
  rpcs = [];
  ctx.supabase = fakeSupabase(DATOS);
  servicio.actual = fakeSupabase(DATOS);
  process.env.OPENAI_API_KEY = 'sk-prueba';
  tienePermiso.mockReset().mockResolvedValue(true);
  checkAICredits.mockReset().mockResolvedValue({ allowed: true, creditsRemaining: 40 });
  chargeAiCredits.mockReset().mockResolvedValue({ credits: 1, previousBalance: 40, logId: 9, cost_amount: null, unit_cost_usd: null });
  generar.mockReset().mockResolvedValue({ respuesta: RESPUESTA_LLM, proveedor: 'openai', model: 'gpt-5.6-luna' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('sin permiso: 403, sin llamar al proveedor ni cobrar', async () => {
  tienePermiso.mockResolvedValue(false);
  const res = await POST(peticion(CUERPO));
  expect(res.status).toBe(403);
  expect(tienePermiso).toHaveBeenCalledWith(ctx, 'admin.full_access');
  expect(generar).not.toHaveBeenCalled();
  expect(chargeAiCredits).not.toHaveBeenCalled();
});

test('otra organización en el body: 403 y nada más', async () => {
  const res = await POST(peticion({ ...CUERPO, organizationId: 999 }));
  expect(res.status).toBe(403);
  expect(generar).not.toHaveBeenCalled();
});

test('cuerpo inválido: 400', async () => {
  const res = await POST(peticion({ ...CUERPO, maxTokens: 999999 }));
  expect(res.status).toBe(400);
  expect(generar).not.toHaveBeenCalled();
});

test('sin créditos: 402 `sin_creditos` ANTES de llamar al proveedor', async () => {
  checkAICredits.mockResolvedValue({ allowed: false, creditsRemaining: 0 });
  const res = await POST(peticion(CUERPO));
  expect(res.status).toBe(402);
  expect((await res.json()).code).toBe('sin_creditos');
  expect(generar).not.toHaveBeenCalled();
  expect(chargeAiCredits).not.toHaveBeenCalled();
});

test('respuesta real: mismo prompt que la IA de atención, ajustes de la prueba, cobro de 1 crédito DESPUÉS', async () => {
  const orden: string[] = [];
  generar.mockImplementation(async () => {
    orden.push('proveedor');
    return { respuesta: RESPUESTA_LLM, proveedor: 'openai', model: 'gpt-5.6-luna' };
  });
  chargeAiCredits.mockImplementation(async () => {
    orden.push('cobro');
    return { credits: 1, previousBalance: 40, logId: 9, cost_amount: null, unit_cost_usd: null };
  });

  const res = await POST(peticion(CUERPO));
  expect(res.status).toBe(200);
  const { data } = await res.json();
  expect(data).toMatchObject({ respuesta: RESPUESTA_LLM.content, tokens: { total: 512 }, fragmentos: 1, creditosCobrados: 1, saldoRestante: 39 });
  expect(orden).toEqual(['proveedor', 'cobro']);

  const entrada = generar.mock.calls[0][0];
  expect(entrada).toMatchObject({ organizationId: 120, proveedor: 'openai', model: 'gpt-5.6-luna', temperatura: 0.3, maxTokens: 200 });
  const [sistema, contexto, usuario] = entrada.chatMessages;
  // Prompt de la IA real (reglas de la organización, encargo de tienda, REFERENCIA con el fragmento elegido).
  expect(sistema.content).toContain('INSTRUCCIONES PRINCIPALES:\nResponde en tono cercano.');
  expect(sistema.content).toContain('REGLAS CRÍTICAS:');
  expect(sistema.content).toContain('- Envíos: Gratis desde 150.000 en Envigado.');
  expect(contexto.content).toContain('Cliente: Cliente | Canal: whatsapp');
  expect(usuario).toEqual({ role: 'user', content: CUERPO.query });

  expect(chargeAiCredits).toHaveBeenCalledTimes(1);
  expect(chargeAiCredits.mock.calls[0][0]).toMatchObject({ orgId: 120, credits: 1, actionType: 'chat_lab_test', model: 'gpt-5.6-luna', units: 512, userId: 'u-1' });

  // Fragmentos con la sesión y la organización de la sesión; nada escrito en el chat.
  const leidos = lecturas.find((l) => l.tabla === 'knowledge_fragments');
  expect(leidos?.filtros).toMatchObject({ organization_id: 120, is_active: true, 'id:in': [FRAGMENTO] });
  expect(lecturas.every((l) => l.filtros.organization_id === undefined || l.filtros.organization_id === 120)).toBe(true);
  expect(escrituras).toEqual([]);
});

test('un canal propio se prueba con su tipo', async () => {
  const res = await POST(peticion({ ...CUERPO, canal: '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d' }));
  expect(res.status).toBe(200);
  expect(generar.mock.calls[0][0].chatMessages[1].content).toContain('Canal: instagram');
});

test('el proveedor falla: 502 `proveedor` y NO se cobra', async () => {
  generar.mockRejectedValue(Object.assign(new Error('503 upstream'), { status: 503 }));
  const res = await POST(peticion(CUERPO));
  expect(res.status).toBe(502);
  const cuerpo = await res.json();
  expect(cuerpo.code).toBe('proveedor');
  expect(JSON.stringify(cuerpo)).not.toContain('upstream');
  expect(chargeAiCredits).not.toHaveBeenCalled();
});

test('respuesta vacía del proveedor: 502 y NO se cobra', async () => {
  generar.mockResolvedValue({ respuesta: { ...RESPUESTA_LLM, content: '  ' }, proveedor: 'openai', model: 'gpt-5.6-luna' });
  const res = await POST(peticion(CUERPO));
  expect(res.status).toBe(502);
  expect(chargeAiCredits).not.toHaveBeenCalled();
});

test('el saldo se agotó mientras generaba: 402 y no se entrega la respuesta', async () => {
  chargeAiCredits.mockRejectedValue(new InsufficientCreditsError('ai'));
  const res = await POST(peticion(CUERPO));
  expect(res.status).toBe(402);
  const cuerpo = await res.json();
  expect(cuerpo.code).toBe('sin_creditos');
  expect(JSON.stringify(cuerpo)).not.toContain(RESPUESTA_LLM.content);
});

test('ajustes de la prueba: modelo del catálogo y reglas propias, sin tocar la configuración; costo real', async () => {
  servicio.actual = fakeSupabase(DATOS);
  ctx.supabase = fakeSupabase({ ...DATOS, ai_modelos_disponibles: { provider: 'openai', model: 'gpt-4o-mini' } });
  const res = await POST(peticion({ ...CUERPO, modelo: 'gpt-4o-mini', reglas: 'Responde en dos líneas.' }));
  expect(res.status).toBe(200);
  const entrada = generar.mock.calls[0][0];
  expect(entrada).toMatchObject({ model: 'gpt-4o-mini', proveedor: 'openai' });
  expect(entrada.chatMessages[0].content).toContain('INSTRUCCIONES PRINCIPALES:\nResponde en dos líneas.');
  expect(entrada.chatMessages[0].content).not.toContain('Responde en tono cercano.');
  const { data } = await res.json();
  // Costo: 1 crédito cobrado y el costo del proveedor que devuelve calcular_costo_llm.
  expect(data).toMatchObject({ creditosCobrados: 1, costoUsd: 0.0004 });
  expect(escrituras).toEqual([]);
});

test('reglas vacías: la prueba va sin reglas', async () => {
  const res = await POST(peticion({ ...CUERPO, reglas: '' }));
  expect(res.status).toBe(200);
  expect(generar.mock.calls[0][0].chatMessages[0].content).not.toContain('INSTRUCCIONES PRINCIPALES');
});

test('un modelo fuera del catálogo: 400 antes de llamar al proveedor ni cobrar', async () => {
  const res = await POST(peticion({ ...CUERPO, modelo: 'modelo-inventado' }));
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe('modelo_invalido');
  expect(generar).not.toHaveBeenCalled();
  expect(chargeAiCredits).not.toHaveBeenCalled();
});
