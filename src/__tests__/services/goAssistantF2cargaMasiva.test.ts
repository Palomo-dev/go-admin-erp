/**
 * GO Assistant — Fase 2 (§6.3): carga masiva de productos.
 *
 * La RPC `assistant_bulk_load_products` se probó contra la base real (crear +
 * actualizar con precio y ajuste de entrada; modo conteo con ajuste de
 * salida; tope de filas; todo-o-nada ante un producto de otra organización;
 * SKU duplicado aborta). Aquí va lo que vive en Node: leer cabeceras
 * humanas, números colombianos, deduplicación explícita y el deshacer que
 * compensa en vez de borrar.
 */

import {
  cargarProductosMasivo,
  matrizAFilas,
  parseNumero,
  planificar,
  reconocerColumnas,
  mapCargaError,
  type ProductoCatalogo,
} from '@/lib/ai/agent/tools/cargaMasiva';
import { getRegistry, resolveTools, resetRegistry } from '@/lib/ai/agent/toolRegistry';
import { applyUndo } from '@/lib/ai/assistant/undoService';
import type { AssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import type { ToolContext } from '@/lib/ai/agent/types';

function caps(over: Partial<AssistantCapabilities> = {}): AssistantCapabilities {
  return {
    level: 'write_full',
    permissions: new Set(['inventory.create']),
    activeModules: new Set(['inventory']),
    enabledTools: null,
    isAdmin: false,
    undoWindowMinutes: 15,
    bulkMaxRows: 500,
    ...over,
  };
}

function ctxWith(supabase: unknown, over: Partial<ToolContext> = {}): ToolContext {
  return {
    organizationId: 125,
    branchId: 7,
    userId: '00000000-0000-0000-0000-000000000001',
    supabase: supabase as ToolContext['supabase'],
    capabilities: caps(),
    locale: 'es-CO',
    currency: 'COP',
    channel: 'text',
    conversationId: null,
    ...over,
  };
}

beforeEach(() => resetRegistry());

describe('carga masiva — registro', () => {
  it('está registrada, es high/write_full/inventory y no va por voz', () => {
    expect(getRegistry().has('cargar_productos_masivo')).toBe(true);
    expect(cargarProductosMasivo.risk).toBe('high');
    expect(cargarProductosMasivo.minLevel).toBe('write_full');
    expect(cargarProductosMasivo.requiredModule).toBe('inventory');
    expect(cargarProductosMasivo.availableInVoice).toBe(false);
  });

  it('no se ofrece con write_low ni sin permiso de crear', () => {
    expect(resolveTools(caps({ level: 'write_low' })).map((t) => t.name)).not.toContain('cargar_productos_masivo');
    expect(resolveTools(caps({ permissions: new Set(['inventory.view']) })).map((t) => t.name)).not.toContain(
      'cargar_productos_masivo'
    );
    expect(resolveTools(caps()).map((t) => t.name)).toContain('cargar_productos_masivo');
  });
});

describe('carga masiva — números como los escribe la gente', () => {
  it.each([
    ['12000', 12000],
    ['12.000', 12000],
    ['12,000', 12000],
    ['1.234,50', 1234.5],
    ['1,234.50', 1234.5],
    ['$ 12.000', 12000],
    ['12.50', 12.5],
    ['3,5', 3.5],
    ['', null],
    ['abc', null],
    [15, 15],
  ])('%p → %p', (entrada, esperado) => {
    expect(parseNumero(entrada)).toBe(esperado);
  });
});

describe('carga masiva — cabeceras humanas', () => {
  it('reconoce acentos, mayúsculas y espacios', () => {
    expect(reconocerColumnas(['Nombre', 'Código', 'Código de barras', 'Precio venta', 'Costo', 'Cantidad', 'Marca'])).toEqual([
      'name',
      'sku',
      'barcode',
      'price',
      'cost',
      'stock',
      'brand',
    ]);
  });

  it('una columna desconocida se ignora sin romper el resto', () => {
    expect(reconocerColumnas(['Producto', 'Proveedor', 'Existencias'])).toEqual(['name', null, 'stock']);
  });

  it('dos columnas no pueden mapear al mismo campo', () => {
    expect(reconocerColumnas(['Nombre', 'Producto'])).toEqual(['name', null]);
  });

  it('salta títulos y filas vacías antes de la cabecera', () => {
    const { filas, columnas } = matrizAFilas([
      ['Inventario tienda', null, null],
      [null, null, null],
      ['Nombre', 'Precio', 'Stock'],
      ['Camisa azul', '25.000', '10'],
      [null, null, null],
      ['Pantalón', 40000, 3],
    ]);
    expect(columnas).toEqual(['name', 'price', 'stock']);
    expect(filas).toEqual([
      { name: 'Camisa azul', price: 25000, stock: 10 },
      { name: 'Pantalón', price: 40000, stock: 3 },
    ]);
  });

  it('sin columna de nombre no hay filas', () => {
    expect(matrizAFilas([['Precio', 'Stock'], [1, 2]]).filas).toEqual([]);
  });
});

describe('carga masiva — política de duplicados, dicha y aplicada', () => {
  const catalogo: ProductoCatalogo[] = [
    { id: 1, sku: 'CAM-001', barcode: '7701234567890', name: 'Camisa azul' },
    { id: 2, sku: 'PAN-001', barcode: null, name: 'Pantalón negro' },
  ];

  it('coincide por SKU antes que por barcode antes que por nombre', () => {
    const plan = planificar(
      [
        { name: 'Otra cosa', sku: 'cam-001' },
        { name: 'Otra cosa 2', barcode: '7701234567890' },
        { name: 'PANTALON  NEGRO' },
        { name: 'Zapato nuevo', price: 100 },
      ],
      catalogo,
      ['name']
    );
    const porN = new Map(plan.filas.map((f) => [f.n, f]));
    expect(porN.get(1)).toMatchObject({ estado: 'existente', productId: 1, coincidePor: 'sku' });
    expect(porN.get(2)).toMatchObject({ estado: 'existente', productId: 1, coincidePor: 'barcode' });
    expect(porN.get(3)).toMatchObject({ estado: 'existente', productId: 2, coincidePor: 'nombre' });
    expect(porN.get(4)).toMatchObject({ estado: 'nuevo' });
    expect(plan).toMatchObject({ nuevos: 1, existentes: 3, errores: 0 });
  });

  it('las filas con problemas van arriba, con motivo, y no cuentan como carga', () => {
    const plan = planificar(
      [
        { name: 'Bueno', price: 10 },
        { name: '', price: 10 },
        { name: 'Precio negativo', price: -1 },
        { name: 'Repetido', sku: 'X1' },
        { name: 'Repetido otra vez', sku: 'x1' },
      ],
      [],
      ['name']
    );
    expect(plan.errores).toBe(3);
    expect(plan.filas.slice(0, 3).every((f) => f.estado === 'error')).toBe(true);
    expect(plan.filas.map((f) => f.motivo).filter(Boolean)).toEqual(['Sin nombre.', 'Precio negativo.', 'SKU "x1" repetido en el archivo.']);
    expect(plan.nuevos).toBe(2);
  });
});

describe('carga masiva — argumentos y ejecución', () => {
  it('exige un adjunto válido o filas dictadas; el archivo manda si vienen ambos', () => {
    expect(cargarProductosMasivo.parseArgs({})).toBeNull();
    expect(cargarProductosMasivo.parseArgs({ attachment_id: 'no-es-uuid' })).toBeNull();
    const ambos = cargarProductosMasivo.parseArgs({
      attachment_id: '11111111-2222-4333-8444-555555555555',
      rows: [{ name: 'x' }],
      stock_mode: 'set',
    });
    expect(ambos).toMatchObject({ attachment_id: '11111111-2222-4333-8444-555555555555', stock_mode: 'set' });
    expect(ambos!.rows).toBeUndefined();
    const dictado = cargarProductosMasivo.parseArgs({ rows: [{ name: 'Camisa', price: '25.000', stock: '4' }], stock_mode: 'lo que sea' });
    expect(dictado).toEqual({ stock_mode: 'add', rows: [{ name: 'Camisa', price: 25000, stock: 4 }] });
  });

  it('execute() manda a la RPC la organización del contexto, el tope de la organización y el plan', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return {
          data: {
            total: 2,
            creados: 1,
            actualizados: 1,
            productos_creados: [{ product_id: 900, sku: 'NUEVO-1', name: 'Nuevo' }],
            ajustes: [{ adjustment_id: 55, type: 'gain', items: [{ product_id: 1, quantity: 3 }] }],
            precios: [],
          },
          error: null,
        };
      },
      from: (tabla: string) => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({
                data: tabla === 'products' ? [{ id: 1, sku: 'CAM-001', barcode: null, name: 'Camisa azul' }] : [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
    const res = await cargarProductosMasivo.execute(ctxWith(client, { capabilities: caps({ bulkMaxRows: 50 }) }), {
      stock_mode: 'add',
      rows: [{ name: 'Nuevo', price: 10 }, { name: 'camisa azul', stock: 3 }],
    });
    expect(res.ok).toBe(true);
    expect(calls[0].fn).toBe('assistant_bulk_load_products');
    expect(calls[0].args.p_organization_id).toBe(125);
    expect(calls[0].args.p_max_rows).toBe(50);
    const payload = calls[0].args.p_payload as { rows: Array<Record<string, unknown>>; stock_mode: string };
    expect(payload.stock_mode).toBe('add');
    expect(payload.rows[0]).toMatchObject({ op: 'create', name: 'Nuevo', price: 10 });
    expect(payload.rows[1]).toMatchObject({ op: 'update', product_id: 1, stock: 3 });
    expect(res.undo?.kind).toBe('undo_bulk_load');
    expect(res.undo?.payload).toMatchObject({ branch_id: 7 });
  });

  it('por encima del tope de la organización no llama a la RPC', async () => {
    let llamadas = 0;
    const client = {
      rpc: async () => {
        llamadas += 1;
        return { data: null, error: null };
      },
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }) }),
    };
    const res = await cargarProductosMasivo.execute(ctxWith(client, { capabilities: caps({ bulkMaxRows: 1 }) }), {
      stock_mode: 'add',
      rows: [{ name: 'a' }, { name: 'b' }],
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('too_many_rows');
    expect(llamadas).toBe(0);
  });

  it.each([
    ['TOO_MANY_ROWS:600:500', 'too_many_rows'],
    ['SKU_TAKEN', 'sku_taken'],
    ['PRODUCT_NOT_IN_ORG', 'not_found'],
    ['Could not find the function public.assistant_bulk_load_products', 'not_deployed'],
  ])('%s → %s', (msg, code) => {
    expect(mapCargaError(msg)?.errorCode).toBe(code);
  });
});

describe('carga masiva — deshacer compensa, no borra', () => {
  it('revierte precios, crea el ajuste contrario y elimina los productos nuevos sin historial', async () => {
    const rpc: Array<Record<string, unknown>> = [];
    const updates: Array<{ tabla: string; datos: Record<string, unknown> }> = [];
    const deletes: string[] = [];
    const client = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        rpc.push(args);
        return { data: {}, error: null };
      },
      from(tabla: string) {
        const cadena = {
          eq: () => cadena,
          maybeSingle: async () => ({ data: { id: 1 }, error: null }),
          // `productHasHistory` cuenta filas: 0 = sin historial.
          count: 0,
          error: null,
          then: undefined,
        } as Record<string, unknown>;
        return {
          select: () => cadena,
          update: (datos: Record<string, unknown>) => ({
            eq: async () => {
              updates.push({ tabla, datos });
              return { error: null };
            },
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => {
                deletes.push(tabla);
                return { error: null };
              },
              then: (r: (v: unknown) => void) => {
                deletes.push(tabla);
                r({ error: null });
              },
            }),
          }),
        };
      },
    };
    const r = await applyUndo(
      { supabase: client as never, organizationId: 125, userId: 'u' },
      {
        kind: 'undo_bulk_load',
        payload: {
          branch_id: 7,
          productos_creados: [{ product_id: 900, name: 'Nuevo' }],
          ajustes: [{ adjustment_id: 55, type: 'gain', items: [{ product_id: 1, quantity: 3 }] }],
          precios: [{ product_id: 1, previous_price_id: 10, new_price_id: 11 }],
        },
      }
    );
    expect(r.ok).toBe(true);
    // Ajuste contrario: una entrada se deshace con una salida de lo mismo.
    expect(rpc[0]).toMatchObject({
      p_organization_id: 125,
      p_branch_id: 7,
      p_payload: { type: 'loss', items: [{ product_id: 1, quantity: 3 }] },
    });
    // Precio: se reabre el anterior y se cierra el nuevo.
    expect(updates.some((u) => u.tabla === 'product_prices' && u.datos.effective_to === null)).toBe(true);
    expect(updates.some((u) => u.tabla === 'product_prices' && typeof u.datos.effective_to === 'string')).toBe(true);
    // Producto nuevo sin historial: se elimina.
    expect(deletes).toContain('products');
  });
});
