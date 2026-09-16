/**
 * GO Assistant — Fase 2 (continuación): orden de compra y traslado.
 *
 * Las RPC se probaron contra la base real (borrador con total 80000 y subtotal
 * generado, proveedor de otra organización rechazado, traslado pendiente sin
 * tocar stock, misma sucursal rechazada, stock insuficiente rechazado). Aquí se
 * prueba lo que vive en Node: el parseo de argumentos, que `execute()` no pise
 * la organización, la traducción de errores y que deshacer = cancelar sin borrar.
 */

import { crearOrdenCompra, crearTraslado, mapComprasError } from '@/lib/ai/agent/tools/compras';
import { buscarProveedores, listarSucursales } from '@/lib/ai/agent/tools/consulta';
import { getRegistry, resolveTools, resetRegistry } from '@/lib/ai/agent/toolRegistry';
import { applyUndo } from '@/lib/ai/assistant/undoService';
import type { AssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import type { ToolContext } from '@/lib/ai/agent/types';

function caps(over: Partial<AssistantCapabilities> = {}): AssistantCapabilities {
  return {
    level: 'write_full',
    permissions: new Set(['inventory.create', 'inventory.transfer', 'inventory.view']),
    activeModules: new Set(['inventory', 'pos']),
    enabledTools: null,
    isAdmin: false,
    ...over,
  } as AssistantCapabilities;
}

function ctxWith(supabase: unknown, branchId: number | null = 7): ToolContext {
  return {
    organizationId: 125,
    branchId,
    userId: '00000000-0000-0000-0000-000000000001',
    supabase: supabase as ToolContext['supabase'],
    capabilities: caps(),
    locale: 'es-CO',
    currency: 'COP',
    channel: 'text',
    conversationId: null,
  };
}

/** Cliente falso que solo sabe hacer `rpc` y recuerda con qué lo llamaron. */
function rpcSpy(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: result.data ?? null, error: result.error ?? null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 3 } }) }) }) }),
          }),
        }),
      }),
    }),
  };
  return { client, calls };
}

beforeEach(() => resetRegistry());

describe('F2 compras — registro y filtrado', () => {
  it('las cuatro herramientas nuevas están registradas', () => {
    const r = getRegistry();
    for (const n of ['crear_orden_compra', 'crear_traslado', 'buscar_proveedores', 'listar_sucursales']) {
      expect(r.has(n)).toBe(true);
    }
  });

  it('crear_orden_compra y crear_traslado son de riesgo alto, write_full y no van por voz', () => {
    for (const t of [crearOrdenCompra, crearTraslado]) {
      expect(t.risk).toBe('high');
      expect(t.minLevel).toBe('write_full');
      expect(t.availableInVoice).toBe(false);
      expect(t.requiredModule).toBe('inventory');
    }
  });

  it('con nivel write_low no se ofrecen; las de consulta sí', () => {
    const names = resolveTools(caps({ level: 'write_low' })).map((t) => t.name);
    expect(names).not.toContain('crear_orden_compra');
    expect(names).not.toContain('crear_traslado');
    expect(names).toContain('buscar_proveedores');
    expect(names).toContain('listar_sucursales');
  });

  it('sin el módulo de inventario no se ofrece ninguna de compras', () => {
    const names = resolveTools(caps({ activeModules: new Set(['pos']) })).map((t) => t.name);
    expect(names).not.toContain('crear_orden_compra');
    expect(names).not.toContain('crear_traslado');
    expect(names).not.toContain('buscar_proveedores');
    // listar_sucursales no depende de módulo: sirve para todo el ERP.
    expect(names).toContain('listar_sucursales');
  });

  it('el permiso de traslado no da permiso de compra, ni al revés', () => {
    const soloTraslado = resolveTools(caps({ permissions: new Set(['inventory.transfer']) })).map((t) => t.name);
    expect(soloTraslado).toContain('crear_traslado');
    expect(soloTraslado).not.toContain('crear_orden_compra');

    const soloCompra = resolveTools(caps({ permissions: new Set(['inventory.create']) })).map((t) => t.name);
    expect(soloCompra).toContain('crear_orden_compra');
    expect(soloCompra).not.toContain('crear_traslado');
  });
});

describe('F2 compras — parseo de argumentos', () => {
  it('orden de compra: exige proveedor y líneas válidas', () => {
    expect(crearOrdenCompra.parseArgs({ items: [{ product_id: 1, quantity: 2 }] })).toBeNull();
    expect(crearOrdenCompra.parseArgs({ supplier_id: 'abc', items: [{ product_id: 1, quantity: 2 }] })).toBeNull();
    expect(crearOrdenCompra.parseArgs({ supplier_id: 5, items: [] })).toBeNull();
    expect(crearOrdenCompra.parseArgs({ supplier_id: 5, items: [{ product_id: 1, quantity: 0 }] })).toBeNull();
    expect(crearOrdenCompra.parseArgs({ supplier_id: 5, items: [{ product_id: 1.5, quantity: 1 }] })).toBeNull();
  });

  it('orden de compra: el costo negativo se descarta, la fecha en prosa se descarta', () => {
    const args = crearOrdenCompra.parseArgs({
      supplier_id: '5',
      items: [{ product_id: 1, quantity: 2, unit_cost: -3 }],
      expected_date: 'mañana',
      notes: 'x'.repeat(600),
    });
    expect(args).not.toBeNull();
    expect(args!.supplier_id).toBe(5);
    expect(args!.items[0].unit_cost).toBeUndefined();
    expect(args!.expected_date).toBeUndefined();
    expect(args!.notes!.length).toBe(500);
  });

  it('orden de compra: acepta fecha ISO y costo válido', () => {
    const args = crearOrdenCompra.parseArgs({
      supplier_id: 5,
      items: [{ product_id: 1, quantity: 2, unit_cost: 1500 }],
      expected_date: '2026-10-01',
    });
    expect(args!.expected_date).toBe('2026-10-01');
    expect(args!.items[0].unit_cost).toBe(1500);
  });

  it('traslado: exige ambas sucursales y descarta costos que no le corresponden', () => {
    expect(crearTraslado.parseArgs({ origin_branch_id: 1, items: [{ product_id: 1, quantity: 1 }] })).toBeNull();
    const args = crearTraslado.parseArgs({
      origin_branch_id: 1,
      dest_branch_id: 2,
      items: [{ product_id: 9, quantity: 3, unit_cost: 100 }],
    });
    expect(args).toEqual({ origin_branch_id: 1, dest_branch_id: 2, items: [{ product_id: 9, quantity: 3 }] });
  });
});

describe('F2 compras — execute() no confía en el modelo para la organización', () => {
  it('la orden de compra manda la organización y el usuario del contexto, nunca de los args', async () => {
    const spy = rpcSpy({ data: { purchase_order_id: 41, proveedor: 'P', lineas: 1, total: 80000, lineas_sin_costo: 0 } });
    const res = await crearOrdenCompra.execute(ctxWith(spy.client), {
      supplier_id: 5,
      items: [{ product_id: 1, quantity: 2 }],
    });
    expect(res.ok).toBe(true);
    expect(spy.calls[0].fn).toBe('assistant_create_purchase_order');
    expect(spy.calls[0].args.p_organization_id).toBe(125);
    expect(spy.calls[0].args.p_branch_id).toBe(7);
    expect(res.undo).toEqual({ kind: 'cancel_purchase_order', payload: { purchase_order_id: 41 } });
    expect(res.message).toContain('borrador');
  });

  it('sin sucursal en el contexto, la resuelve de la base', async () => {
    const spy = rpcSpy({ data: { purchase_order_id: 1, proveedor: 'P', lineas: 1, total: 0, lineas_sin_costo: 1 } });
    const res = await crearOrdenCompra.execute(ctxWith(spy.client, null), {
      supplier_id: 5,
      items: [{ product_id: 1, quantity: 2 }],
    });
    expect(spy.calls[0].args.p_branch_id).toBe(3);
    expect(res.message).toContain('sin costo');
  });

  it('el traslado manda la organización del contexto y devuelve undo de cancelación', async () => {
    const spy = rpcSpy({ data: { transfer_id: 9, origen: 'A', destino: 'B', lineas: 2 } });
    const res = await crearTraslado.execute(ctxWith(spy.client), {
      origin_branch_id: 1,
      dest_branch_id: 2,
      items: [{ product_id: 1, quantity: 1 }],
    });
    expect(res.ok).toBe(true);
    expect(spy.calls[0].fn).toBe('assistant_create_transfer');
    expect(spy.calls[0].args.p_organization_id).toBe(125);
    expect(res.undo).toEqual({ kind: 'cancel_transfer', payload: { transfer_id: 9 } });
    expect(res.message).toContain('pendiente');
  });

  it('los errores de la RPC llegan en español y con código estable', async () => {
    const spy = rpcSpy({ error: { message: 'INSUFFICIENT_STOCK:Camisa azul:2:5' } });
    const res = await crearTraslado.execute(ctxWith(spy.client), {
      origin_branch_id: 1,
      dest_branch_id: 2,
      items: [{ product_id: 1, quantity: 5 }],
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('no_stock');
    expect(res.message).toContain('Camisa azul');
    expect(res.message).toContain('hay 2');
  });
});

describe('F2 compras — mapa de errores', () => {
  it.each([
    ['SUPPLIER_REQUIRED', 'missing_fields'],
    ['SUPPLIER_NOT_IN_ORG', 'not_found'],
    ['BRANCHES_REQUIRED', 'missing_fields'],
    ['SAME_BRANCH', 'bad_input'],
    ['BRANCH_NOT_IN_ORG', 'not_found'],
    ['PRODUCT_NOT_IN_ORG', 'not_found'],
    ['ITEMS_REQUIRED', 'missing_fields'],
    ['ITEM_INVALID', 'bad_input'],
    ['COST_INVALID', 'bad_input'],
    ['Could not find the function public.assistant_create_transfer', 'not_deployed'],
  ])('%s → %s', (msg, code) => {
    expect(mapComprasError(msg)?.errorCode).toBe(code);
  });

  it('un error desconocido devuelve null para que el llamador lo muestre tal cual', () => {
    expect(mapComprasError('permission denied for table purchase_orders')).toBeNull();
  });
});

describe('F2 compras — consultas de apoyo', () => {
  it('buscar_proveedores escapa los comodines de ILIKE', async () => {
    let filtro = '';
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                or: (f: string) => {
                  filtro = f;
                  return Promise.resolve({ data: [], error: null });
                },
              }),
            }),
          }),
        }),
      }),
    };
    const res = await buscarProveedores.execute(ctxWith(client), { consulta: '100%_x' });
    expect(res.ok).toBe(true);
    expect(filtro).toContain('100\\%\\_x');
  });

  it('listar_sucursales no depende de permisos ni módulos', () => {
    expect(listarSucursales.permissions).toEqual([]);
    expect(listarSucursales.requiredModule).toBeNull();
    expect(listarSucursales.risk).toBe('low');
  });
});

describe('F3 — deshacer una orden o un traslado = cancelar, nunca borrar', () => {
  function docClient(status: string) {
    const updates: Array<{ tabla: string; datos: Record<string, unknown> }> = [];
    const deletes: string[] = [];
    const client = {
      from(tabla: string) {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 1, status }, error: null }) }) }),
          }),
          update: (datos: Record<string, unknown>) => ({
            eq: () => ({ eq: () => ({ eq: async () => { updates.push({ tabla, datos }); return { error: null }; } }) }),
          }),
          delete: () => {
            deletes.push(tabla);
            throw new Error('no se borra');
          },
        };
      },
    };
    return { client, updates, deletes };
  }

  const undoCtx = (client: unknown) => ({
    supabase: client as never,
    organizationId: 125,
    userId: 'u',
  });

  it('una orden en borrador se cancela', async () => {
    const c = docClient('draft');
    const r = await applyUndo(undoCtx(c.client) as never, { kind: 'cancel_purchase_order', payload: { purchase_order_id: 41 } });
    expect(r.ok).toBe(true);
    expect(c.updates).toEqual([{ tabla: 'purchase_orders', datos: expect.objectContaining({ status: 'cancelled' }) }]);
    expect(c.deletes).toEqual([]);
  });

  it('una orden ya enviada NO se toca', async () => {
    const c = docClient('sent');
    const r = await applyUndo(undoCtx(c.client) as never, { kind: 'cancel_purchase_order', payload: { purchase_order_id: 41 } });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('already_advanced');
    expect(c.updates).toEqual([]);
  });

  it('un traslado en tránsito NO se toca; uno pendiente se cancela', async () => {
    const enTransito = docClient('in_transit');
    const r1 = await applyUndo(undoCtx(enTransito.client) as never, { kind: 'cancel_transfer', payload: { transfer_id: 9 } });
    expect(r1.ok).toBe(false);
    expect(enTransito.updates).toEqual([]);

    const pendiente = docClient('pending');
    const r2 = await applyUndo(undoCtx(pendiente.client) as never, { kind: 'cancel_transfer', payload: { transfer_id: 9 } });
    expect(r2.ok).toBe(true);
    expect(pendiente.updates[0].tabla).toBe('inventory_transfers');
  });
});
