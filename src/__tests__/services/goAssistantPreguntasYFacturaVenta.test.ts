/**
 * GO Assistant — preguntas con opciones (A/B/C/Otro) y factura de venta.
 *
 * El dueño: "prefiero que no uses formulario y mejor haga preguntas, estilo
 * Claude, un modal para confirmar datos con respuesta A, B, C u Otro".
 * `preguntar_opciones` es ese modal: pausa el turno, no escribe nada, y la
 * respuesta llega como el siguiente mensaje.
 *
 * `registrar_factura_venta`: la RPC se probó contra la base real (borrador sin
 * CxC, emitida con CxC y asiento por disparador, consecutivo FACT-####,
 * sin mover stock, anulación con CxC a cero, cliente ajeno rechazado).
 */

import { preguntarOpciones, preguntaComoTexto, QUESTION_TOOL } from '@/lib/ai/agent/tools/pregunta';
import { registrarFacturaVenta, mapFacturaVentaError } from '@/lib/ai/agent/tools/facturas';
import { buscarClientes } from '@/lib/ai/agent/tools/consulta';
import { getRegistry, resolveTools, resetRegistry } from '@/lib/ai/agent/toolRegistry';
import { runAgent, type AgentEvent } from '@/lib/ai/agent/runAgent';
import type { AssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import type { ToolContext } from '@/lib/ai/agent/types';

jest.mock('@/lib/ai/agent/openaiAdapter', () => ({ openModelStream: jest.fn() }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(async () => ({ credits: 0 })) }));

import { openModelStream } from '@/lib/ai/agent/openaiAdapter';

function caps(over: Partial<AssistantCapabilities> = {}): AssistantCapabilities {
  return {
    level: 'write_full',
    permissions: new Set(['pos.create', 'crm.customers.view']),
    activeModules: new Set(['finance', 'pos']),
    enabledTools: null,
    isAdmin: false,
    undoWindowMinutes: 15,
    bulkMaxRows: 500,
    ...over,
  };
}

function ctxWith(client: unknown): ToolContext {
  return {
    organizationId: 125,
    branchId: 7,
    userId: '00000000-0000-0000-0000-000000000001',
    supabase: client as ToolContext['supabase'],
    capabilities: caps(),
    locale: 'es-CO',
    currency: 'COP',
    channel: 'text',
    conversationId: null,
  };
}

beforeEach(() => {
  resetRegistry();
  jest.clearAllMocks();
});

describe('preguntar_opciones — el modal A/B/C/Otro', () => {
  it('está registrada, es de lectura, sin permisos ni módulo, y disponible en voz', () => {
    expect(getRegistry().has(QUESTION_TOOL)).toBe(true);
    expect(preguntarOpciones.risk).toBe('low');
    expect(preguntarOpciones.permissions).toEqual([]);
    expect(preguntarOpciones.requiredModule).toBeNull();
    expect(preguntarOpciones.availableInVoice).toBe(true);
    expect(resolveTools(caps({ level: 'read', permissions: new Set() })).map((t) => t.name)).toContain(QUESTION_TOOL);
  });

  it('numera las opciones A, B, C, D; exige al menos 2 y corta en 4', () => {
    const a = preguntarOpciones.parseArgs({ question: '¿Persona o empresa?', options: [{ label: 'Persona' }, { label: 'Empresa', value: 'company' }] });
    expect(a).toEqual({
      question: '¿Persona o empresa?',
      options: [
        { key: 'A', label: 'Persona', value: undefined },
        { key: 'B', label: 'Empresa', value: 'company' },
      ],
      allowOther: true,
    });
    expect(preguntarOpciones.parseArgs({ question: 'x', options: [{ label: 'solo una' }] })).toBeNull();
    const cinco = preguntarOpciones.parseArgs({ question: 'x', options: [1, 2, 3, 4, 5].map((n) => ({ label: `op ${n}` })), allow_other: false });
    expect(cinco!.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(cinco!.allowOther).toBe(false);
  });

  it('la pregunta se guarda en el historial como texto legible', () => {
    const args = preguntarOpciones.parseArgs({ question: '¿La emito ya?', options: [{ label: 'Sí, emitir' }, { label: 'Dejar en borrador' }] })!;
    expect(preguntaComoTexto(args)).toBe('¿La emito ya?\nA) Sí, emitir\nB) Dejar en borrador\nOtro: escríbelo');
  });

  it('runAgent: al llamarla, emite `question`, pausa el turno y no deja acción pendiente', async () => {
    const stream = {
      model: 'test',
      chunks: (async function* () {
        yield { delta: 'Una cosa antes: ' };
        yield {
          toolCall: {
            id: 'c1',
            name: QUESTION_TOOL,
            arguments: JSON.stringify({ question: '¿Es persona o empresa?', options: [{ label: 'Persona' }, { label: 'Empresa' }] }),
          },
        };
        yield { usage: { promptTokens: 10, completionTokens: 5 } };
      })(),
    };
    (openModelStream as jest.Mock).mockResolvedValue(stream);

    const events: AgentEvent[] = [];
    const out = await runAgent({
      systemPrompt: 'x',
      history: [],
      message: 'crea el cliente Nicolás',
      ctx: ctxWith({}),
      settings: { model: null, temperature: null, maxTokens: null, systemRules: null, tone: null, language: 'es-CO', overrides: {} },
      emit: (e) => {
        events.push(e);
      },
    });

    const q = events.find((e) => e.type === 'question');
    expect(q).toMatchObject({ type: 'question', question: '¿Es persona o empresa?', allowOther: true });
    expect((q as { options: Array<{ key: string }> }).options.map((o) => o.key)).toEqual(['A', 'B']);
    expect(out.pendingActionId).toBeNull();
    expect(out.content).toContain('Una cosa antes:');
    expect(out.content).toContain('A) Persona');
    // Se pausó: el modelo no volvió a llamarse.
    expect(openModelStream).toHaveBeenCalledTimes(1);
    // No hubo "tool_start": una pregunta no es un paso de trabajo.
    expect(events.some((e) => e.type === 'tool_start')).toBe(false);
  });
});

describe('buscar_clientes', () => {
  it('escapa comodines y busca por nombre, empresa, documento, teléfono y correo', async () => {
    let filtro = '';
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: (f: string) => {
              filtro = f;
              return { order: () => ({ limit: async () => ({ data: [{ id: 'u1', full_name: 'Ana', company_name: null, customer_type: 'person', doc_type: 'cc', doc_number: '1', phone: null, email: null }], error: null }) }) };
            },
          }),
        }),
      }),
    };
    const r = await buscarClientes.execute(ctxWith(client), { consulta: '50%' });
    expect(r.ok).toBe(true);
    expect(filtro).toContain('full_name.ilike.%50\\%%');
    expect(filtro).toContain('doc_number.ilike.');
    expect((r.data as { clientes: Array<{ tipo: string; documento: string }> }).clientes[0]).toMatchObject({ tipo: 'persona', documento: 'cc 1' });
  });
});

describe('registrar_factura_venta', () => {
  it('es high/write_full, módulo finance y no va por voz', () => {
    expect(getRegistry().has('registrar_factura_venta')).toBe(true);
    expect(registrarFacturaVenta.risk).toBe('high');
    expect(registrarFacturaVenta.requiredModule).toBe('finance');
    expect(registrarFacturaVenta.availableInVoice).toBe(false);
  });

  it('una línea sin producto necesita descripción y precio; con producto, el precio es opcional (catálogo)', () => {
    expect(registrarFacturaVenta.parseArgs({ items: [{ qty: 1 }] })).toBeNull();
    expect(registrarFacturaVenta.parseArgs({ items: [{ description: 'Servicio', qty: 1 }] })).toBeNull();
    const ok = registrarFacturaVenta.parseArgs({
      customer_id: '11111111-2222-4333-8444-555555555555',
      issue: 'true',
      items: [{ product_id: 5, qty: 2 }, { description: 'Servicio', qty: 1, unit_price: 50000, tax_rate: 19 }],
      payment_terms: 15,
    });
    expect(ok).toMatchObject({ customer_id: '11111111-2222-4333-8444-555555555555', issue: false, tax_included: false, payment_terms: 15 });
    expect(ok!.items[0]).toEqual({ qty: 2, product_id: 5 });
  });

  it('execute() manda organización, moneda y `issue` del contexto y devuelve undo de anulación', async () => {
    const rpc: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpc.push({ fn, args });
        return { data: { invoice_id: 'a1b2c3d4-0000-4000-8000-000000000001', sale_id: 's', number: 'FACT-0042', cliente: 'Ana', estado: 'draft', total: 59500, lineas: 1 }, error: null };
      },
    };
    const res = await registrarFacturaVenta.execute(ctxWith(client), {
      customer_id: '11111111-2222-4333-8444-555555555555',
      issue: false,
      tax_included: false,
      items: [{ description: 'Servicio', qty: 1, unit_price: 50000, tax_rate: 19 }],
    });
    expect(res.ok).toBe(true);
    expect(rpc[0].fn).toBe('assistant_register_sales_invoice');
    expect(rpc[0].args.p_organization_id).toBe(125);
    expect((rpc[0].args.p_payload as { currency: string; issue: boolean }).currency).toBe('COP');
    expect(res.message).toContain('FACT-0042');
    expect(res.message).toContain('borrador');
    expect(res.entity?.url).toBe('/app/finanzas/facturas-venta/a1b2c3d4-0000-4000-8000-000000000001');
    expect(res.undo).toEqual({ kind: 'void_sales_invoice', payload: { invoice_id: 'a1b2c3d4-0000-4000-8000-000000000001' } });
  });

  it.each([
    ['PRICE_UNKNOWN:Camisa azul', 'no_price'],
    ['CUSTOMER_NOT_IN_ORG', 'not_found'],
    ['ITEMS_REQUIRED', 'missing_fields'],
  ])('%s → %s', (msg, code) => {
    expect(mapFacturaVentaError(msg)?.errorCode).toBe(code);
  });
});
