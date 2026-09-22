import { evaluateTool, getTool } from '@/lib/ai/agent/toolRegistry';
import { canReconcileDocument, visionFailure } from '@/lib/ai/agent/tools/documentos';
import { resolveModel } from '@/lib/ai/agent/modelRouter';
import type { AssistantCapabilities } from '@/lib/ai/assistant/capabilities';

const caps: AssistantCapabilities = { level: 'off', enabledTools: null, isAdmin: false, permissions: new Set(), activeModules: new Set(), undoWindowMinutes: 15, bulkMaxRows: 500 };

it('no confunde saturación del proveedor con una foto borrosa ni exige volver a subirla', () => {
  const failure = visionFailure(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'));
  expect(failure.errorCode).toBe('vision_unavailable');
  expect(failure.message).toContain('conserva');
  expect(failure.message).not.toMatch(/nítida|borros/);
  expect(visionFailure(new Error('invalid JSON')).message).toContain('validar');
});

it('usa el modelo operativo actual sin configuración y respeta la elección de la organización', () => {
  const previous = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_MODEL;
  try {
    expect(resolveModel('reasoning').model).toBe('gpt-5.6-luna');
    expect(resolveModel('reasoning', { model: 'modelo-configurado', temperature: null, maxTokens: null, systemRules: null, tone: null, language: null, overrides: {} }).model).toBe('modelo-configurado');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previous;
  }
});

it('leer adjuntos propios no exige permisos de inventario y no habilita búsquedas de negocio', () => {
  expect(evaluateTool(caps, getTool('leer_documento')!, 'text').allowed).toBe(true);
  expect(canReconcileDocument(caps)).toBe(false);
  expect(evaluateTool(caps, getTool('create_customer')!, 'text').allowed).toBe(false);
  expect(canReconcileDocument({ ...caps, level: 'read', permissions: new Set(['crm.customers.create']) })).toBe(false);
});

it('respeta la desactivación explícita y el canal de voz', () => {
  expect(evaluateTool({ ...caps, enabledTools: [] }, getTool('leer_documento')!, 'text').allowed).toBe(false);
  expect(evaluateTool(caps, getTool('leer_documento')!, 'voice').allowed).toBe(false);
});

it('separa lectura financiera de catálogo y exige el módulo correspondiente', () => {
  const finance = { ...caps, level: 'write_full' as const, permissions: new Set(['finance.view']), activeModules: new Set(['finance']) };
  expect(canReconcileDocument(finance, 'finance')).toBe(true);
  expect(canReconcileDocument(finance, 'catalog')).toBe(false);
  expect(canReconcileDocument({ ...finance, activeModules: new Set() }, 'finance')).toBe(false);
  expect(evaluateTool({ ...finance, isAdmin: true, activeModules: new Set() }, getTool('create_product')!, 'text').allowed).toBe(false);
});

it('resuelve visión también con GEMINI_CHAT_MODEL antes del default', () => {
  const previous = process.env.GEMINI_CHAT_MODEL;
  const analysis = process.env.GEMINI_ANALYSIS_MODEL;
  delete process.env.GEMINI_ANALYSIS_MODEL;
  process.env.GEMINI_CHAT_MODEL = 'gemini-configurado';
  try {
    expect(resolveModel('vision', { model: null, temperature: null, maxTokens: null, systemRules: null, tone: null, language: null, overrides: {} }).model).toBe('gemini-configurado');
  } finally {
    if (previous === undefined) delete process.env.GEMINI_CHAT_MODEL; else process.env.GEMINI_CHAT_MODEL = previous;
    if (analysis === undefined) delete process.env.GEMINI_ANALYSIS_MODEL; else process.env.GEMINI_ANALYSIS_MODEL = analysis;
  }
});
