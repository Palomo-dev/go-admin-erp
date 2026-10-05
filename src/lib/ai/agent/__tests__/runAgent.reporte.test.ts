import type { SupabaseClient } from '@supabase/supabase-js';
import { runAgent, type AgentEvent } from '../runAgent';
import type { ToolContext, ToolDefinition } from '../types';
import { openModelStream } from '../openaiAdapter';
import { resolveModel } from '../modelRouter';
import { getTool, resolveTools } from '../toolRegistry';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { armarTarjetaReporte } from '@/lib/ai/assistant/tarjetaReporte';

// Figma Reportes §22: el resultado de un reporte llega al panel como evento
// `reporte` con la tarjeta que armó la herramienta (datos reales), no como
// texto del modelo; la tarjeta no viaja al modelo y el cobro sigue siendo uno
// por turno con `chargeAiCredits`.
jest.mock('../openaiAdapter', () => ({ openModelStream: jest.fn() }));
jest.mock('../modelRouter', () => ({ resolveModel: jest.fn() }));
jest.mock('../toolRegistry', () => ({ getTool: jest.fn(), resolveTools: jest.fn() }));
jest.mock('../catalogTools', () => ({ actionFieldsFor: jest.fn().mockReturnValue([]) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn() }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));

it('emite `reporte` tras el tool_end de una consulta con tarjeta, y el modelo solo recibe `data`', async () => {
  jest.clearAllMocks();
  const ctx: ToolContext = {
    organizationId: 7, branchId: null, userId: 'usuario-prueba', conversationId: 'conversacion-prueba',
    supabase: {} as SupabaseClient, locale: 'es-CO', currency: 'COP', channel: 'text',
    capabilities: { level: 'read', enabledTools: null, permissions: new Set(), activeModules: new Set(['pos']), isAdmin: false, undoWindowMinutes: 15, bulkMaxRows: 500 },
  };
  const tarjeta = armarTarjetaReporte(
    { columnas: [{ key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' }, { key: 'total', titulo: 'Total', tipo: 'moneda' }], filas: [{ sucursal: 'Norte', total: 10 }] },
    { reporteId: 'ventas-periodo', grupo: 'ventas', titulo: 'Ventas del periodo', sucursalId: 1, vista: null,
      periodo: { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', horaInicio: null, horaFin: null, etiqueta: 'Septiembre 2026' } },
  );
  const consulta: ToolDefinition = {
    name: 'consultar_reporte', description: 'x', risk: 'low', parameters: { type: 'object', properties: {} },
    permissions: [], minLevel: 'read', requiredModule: null, availableInVoice: false,
    parseArgs: (raw) => raw as Record<string, unknown>,
    preview: jest.fn(),
    execute: jest.fn(async () => ({ ok: true, message: 'Ventas del periodo · Septiembre 2026: 1 filas', data: { total: 10 }, tarjetaReporte: tarjeta })),
  };
  const registered = [consulta] as unknown as ReturnType<typeof resolveTools>;
  jest.mocked(resolveTools).mockReturnValue(registered);
  jest.mocked(getTool).mockImplementation((name) => registered.find((t) => t.name === name));
  jest.mocked(resolveModel).mockReturnValue({ model: 'modelo', provider: 'openai', temperature: 0.2, maxTokens: 1500, source: 'organization' });
  const mensajesVistos: unknown[] = [];
  jest.mocked(openModelStream)
    .mockResolvedValueOnce({ model: 'modelo', chunks: (async function* () {
      yield { toolCall: { id: 'c1', name: 'consultar_reporte', arguments: '{"reporte_id":"ventas-periodo"}' } };
      yield { usage: { promptTokens: 10, completionTokens: 5 } };
    })() })
    .mockImplementationOnce(async (input) => {
      mensajesVistos.push(...input.messages);
      return { model: 'modelo', chunks: (async function* () {
        yield { delta: 'Norte vendió 10.' };
        yield { usage: { promptTokens: 20, completionTokens: 5 } };
      })() };
    });
  jest.mocked(chargeAiCredits).mockResolvedValue({ credits: 2 } as Awaited<ReturnType<typeof chargeAiCredits>>);

  const events: AgentEvent[] = [];
  const result = await runAgent({ ctx, systemPrompt: 'x', history: [], message: '¿Qué sucursal vendió más?',
    settings: { model: null, temperature: null, maxTokens: null, systemRules: null, tone: null, language: null, overrides: {} },
    emit: (e) => { events.push(e); } });

  expect(result.content).toBe('Norte vendió 10.');
  const tipos = events.map((e) => e.type);
  expect(tipos.indexOf('reporte')).toBe(tipos.indexOf('tool_end') + 1);
  expect(events.find((e) => e.type === 'reporte')).toEqual({ type: 'reporte', tarjeta });
  const respuestaHerramienta = mensajesVistos.find((m) => (m as { role: string }).role === 'tool') as { content: string };
  expect(JSON.parse(respuestaHerramienta.content)).toEqual({ ok: true, message: 'Ventas del periodo · Septiembre 2026: 1 filas', data: { total: 10 } });
  expect(chargeAiCredits).toHaveBeenCalledTimes(1);
});
