import type { SupabaseClient } from '@supabase/supabase-js';
import { leerDocumento } from '@/lib/ai/agent/tools/documentos';
import type { ToolContext } from '@/lib/ai/agent/types';

const generate = jest.fn();
const credentials = jest.fn();
const charge = jest.fn();
const fallbackModel = jest.fn();
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: generate } })) }));
jest.mock('@/lib/services/providerCredentials.server', () => ({
  getProviderCredentials: (...args: unknown[]) => credentials(...args),
  getProviderSettings: async () => ({ source: 'org', settings: { model: 'gemini-primary-test' } }),
}));
jest.mock('@/lib/ai/agent/modelRouter', () => ({
  loadOrgModelSettings: async () => ({ overrides: {} }),
  resolveModel: (...args: unknown[]) => fallbackModel(...args),
}));
jest.mock('@/lib/services/aiCreditsService', () => ({ checkAICredits: async () => ({ allowed: true }) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: (...args: unknown[]) => charge(...args) }));

const update = jest.fn();
const campo = { valor: null, confianza: 0 };
const extraction = { doc_type: 'other', doc_type_confianza: 1, descripcion_visual: 'Captura de prueba', texto_visible: 'Texto', lineas: [],
  moneda: campo, emisor_nombre: campo, emisor_nit: campo, receptor_nombre: campo, receptor_nit: campo,
  numero: campo, fecha: campo, fecha_vencimiento: campo, cufe: campo, resolucion_dian: campo, notas: campo,
  subtotal_impreso: campo, descuentos_impreso: campo, iva_impreso: campo, inc_impreso: campo,
  retenciones_impreso: campo, total_impreso: campo,
};
const ctx: ToolContext = {
  organizationId: 120, userId: 'user-test', branchId: null, conversationId: null,
  locale: 'es-CO', currency: 'COP', channel: 'text',
  capabilities: { level: 'off', permissions: new Set(), activeModules: new Set(), isAdmin: false,
    enabledTools: null, undoWindowMinutes: 15, bulkMaxRows: 500 },
  supabase: { from: (table: string) => {
    const query = { select: () => query, eq: () => query,
      update: (data: unknown) => { update(data); return query; },
      maybeSingle: async () => ({ data: table === 'ai_attachments' ? {
        id: 'attachment-test', organization_id: 120, storage_path: 'org/120/test.png', mime: 'image/png',
        bytes: 4, kind: 'image', extraction: null,
      } : null, error: null }),
    };
    return query;
  }, storage: { from: () => ({ download: async () => ({ data: new Blob(['foto']), error: null }) }) } } as unknown as SupabaseClient,
};

beforeEach(() => {
  jest.clearAllMocks(); generate.mockReset();
  credentials.mockResolvedValue({ credentials: { GOOGLE_AI_API_KEY: 'fake-test-credential' } });
  fallbackModel.mockImplementation(() => ({ model: 'gemini-fallback-test', provider: 'google' }));
  charge.mockResolvedValue({ credits: 3 });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it.each([429, 500, 503, 504])('ante %s intenta fallback una vez, mismas credenciales y cobra/guarda modelo exitoso', async (status) => {
  generate.mockRejectedValueOnce(Object.assign(new Error('Proveedor temporalmente caído'), { status }))
    .mockResolvedValueOnce({ text: JSON.stringify(extraction) });
  const result = await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' });
  expect(result.ok).toBe(true);
  expect(generate.mock.calls.map(([call]) => call.model)).toEqual(['gemini-primary-test', 'gemini-fallback-test']);
  for (const [call] of generate.mock.calls) {
    expect(call.config.httpOptions.retryOptions.attempts).toBe(1);
    expect(call.config.httpOptions.timeout).toBeLessThanOrEqual(15000);
  }
  expect(credentials).toHaveBeenCalledTimes(1);
  expect(credentials).toHaveBeenCalledWith(120, 'analysis', 'google');
  expect(fallbackModel).toHaveBeenCalledWith('vision');
  expect(charge).toHaveBeenCalledTimes(1);
  expect(charge).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-fallback-test', actionType: 'vision_extract' }));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ extraction_model: 'gemini-fallback-test' }));
});

it.each([400, 401, 403])('no hace fallback para error permanente %s', async (status) => {
  generate.mockRejectedValue(Object.assign(new Error('Credenciales o solicitud inválida'), { status }));
  expect((await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' })).ok).toBe(false);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(charge).not.toHaveBeenCalled();
});

it('timeout permite un respaldo; dos fallos mantienen mensaje honesto sin cobro', async () => {
  generate.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
  const result = await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(result.errorCode).toBe('vision_unavailable');
  expect(result.message).toContain('conserva');
  expect(result.message).toContain('No se cobró');
  expect(charge).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

it('reconoce el AbortError que produce el timeout interno del SDK sin señal de usuario', async () => {
  generate.mockRejectedValueOnce(new DOMException('This operation was aborted', 'AbortError'))
    .mockResolvedValueOnce({ text: JSON.stringify(extraction) });
  expect((await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' })).ok).toBe(true);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(charge).toHaveBeenCalledTimes(1);
});

it('no repite el mismo modelo como fallback', async () => {
  fallbackModel.mockReturnValue({ model: 'gemini-primary-test', provider: 'google' });
  generate.mockRejectedValue(Object.assign(new Error('503'), { status: 503 }));
  await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' });
  expect(generate).toHaveBeenCalledTimes(1);
});

it('primario exitoso conserva el modelo de org y no consulta respaldo', async () => {
  generate.mockResolvedValue({ text: JSON.stringify(extraction) });
  expect((await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' })).ok).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(fallbackModel).not.toHaveBeenCalledWith('vision');
  expect(charge).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ extraction_model: 'gemini-primary-test' }));
});

it('no cambia de proveedor en el respaldo', async () => {
  fallbackModel.mockImplementation(() => ({ model: 'otro-modelo', provider: 'openai' }));
  generate.mockRejectedValue(Object.assign(new Error('503'), { status: 503 }));
  await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(charge).not.toHaveBeenCalled();
});

it('JSON inválido del respaldo no inicia otra cadena de reparación ni cobra', async () => {
  generate.mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
    .mockResolvedValueOnce({ text: 'no es JSON' });
  expect((await leerDocumento.execute(ctx, { attachment_id: 'attachment-test' })).errorCode).toBe('extraction_failed');
  expect(generate).toHaveBeenCalledTimes(2);
  expect(charge).not.toHaveBeenCalled();
});
