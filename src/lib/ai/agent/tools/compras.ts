/**
 * GO Assistant — Fase 2 (continuación): orden de compra y traslado.
 *
 * Las dos crean DOCUMENTOS, no movimientos:
 *
 *  * `crear_orden_compra` deja la orden en `draft`. No recibe mercancía ni toca
 *    el stock: la recepción es un paso aparte del ERP, con conteo físico.
 *  * `crear_traslado` deja el traslado en `pending`. No mueve stock: lo
 *    confirma la sucursal destino cuando recibe. Sí se comprueba que el origen
 *    tenga existencias.
 *
 * Aun así son `risk: 'high'`: una orden de compra compromete dinero con un
 * proveedor y un traslado pone en marcha a dos sucursales. Ambas van por RPC
 * transaccional (`20260914110000_go_assistant_f2_compras_y_traslados.sql`).
 *
 * El costo de compra, igual que el precio de venta, **lo pone el catálogo**:
 * si el usuario no dice un costo, la RPC toma el último de `product_costs`
 * (primero el de ese proveedor, luego el general) y avisa si no hay ninguno.
 */

import { formatMoney } from '@/lib/ai/assistant/orgCurrency';
import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

const MAX_LINEAS = 100;

interface LineaCompra {
  product_id: number;
  quantity: number;
  unit_cost?: number;
}

interface OrdenCompraArgs {
  supplier_id: number;
  items: LineaCompra[];
  branch_id?: number;
  expected_date?: string;
  notes?: string;
}

interface LineaTraslado {
  product_id: number;
  quantity: number;
}

interface TrasladoArgs {
  origin_branch_id: number;
  dest_branch_id: number;
  items: LineaTraslado[];
  notes?: string;
}

/** Líneas válidas o `null`. `conCosto` indica si se admite costo por línea. */
function parseLineas(raw: unknown, conCosto: boolean): LineaCompra[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINEAS) return null;
  const items: LineaCompra[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const obj = entry as Record<string, unknown>;
    const productId = Number(obj.product_id);
    const quantity = Number(obj.quantity);
    if (!Number.isInteger(productId) || productId <= 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const linea: LineaCompra = { product_id: productId, quantity };
    if (conCosto && obj.unit_cost !== undefined && obj.unit_cost !== null) {
      const cost = Number(obj.unit_cost);
      if (Number.isFinite(cost) && cost >= 0) linea.unit_cost = cost;
    }
    items.push(linea);
  }
  return items;
}

function parseId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `YYYY-MM-DD` o nada. El modelo a veces manda "mañana": eso se descarta. */
function parseFecha(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

/** Traduce los errores de las RPC a español. Exportado para los tests. */
export function mapComprasError(message: string): ToolResult | null {
  if (
    message.includes('Could not find the function') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  ) {
    return {
      ok: false,
      errorCode: 'not_deployed',
      message: 'Todavía no puedo hacer esto: falta aplicar un cambio en la base de datos. Avisa a soporte.',
    };
  }
  if (message.includes('SUPPLIER_REQUIRED')) {
    return { ok: false, errorCode: 'missing_fields', message: 'Una orden de compra necesita un proveedor.' };
  }
  if (message.includes('SUPPLIER_NOT_IN_ORG')) {
    return { ok: false, errorCode: 'not_found', message: 'Ese proveedor no existe en esta organización.' };
  }
  if (message.includes('BRANCHES_REQUIRED')) {
    return { ok: false, errorCode: 'missing_fields', message: 'Me falta la sucursal de origen o la de destino.' };
  }
  if (message.includes('SAME_BRANCH')) {
    return { ok: false, errorCode: 'bad_input', message: 'El origen y el destino del traslado son la misma sucursal.' };
  }
  if (message.includes('BRANCH_NOT_IN_ORG')) {
    return { ok: false, errorCode: 'not_found', message: 'Una de las sucursales no existe en esta organización.' };
  }
  if (message.includes('PRODUCT_NOT_IN_ORG')) {
    return { ok: false, errorCode: 'not_found', message: 'Uno de los productos no existe en esta organización.' };
  }
  if (message.includes('ITEMS_REQUIRED')) {
    return { ok: false, errorCode: 'missing_fields', message: 'Me falta saber qué productos y en qué cantidad.' };
  }
  if (message.includes('ITEM_INVALID')) {
    return { ok: false, errorCode: 'bad_input', message: 'Alguna línea no tiene producto o cantidad válida.' };
  }
  if (message.includes('COST_INVALID')) {
    return { ok: false, errorCode: 'bad_input', message: 'El costo de una línea no es válido.' };
  }
  if (message.includes('INSUFFICIENT_STOCK')) {
    const partes = message.split('INSUFFICIENT_STOCK:')[1]?.split('\n')[0]?.split(':') ?? [];
    const [nombre, disponible, pedido] = partes;
    return {
      ok: false,
      errorCode: 'no_stock',
      message: `En la sucursal de origen no hay suficiente "${nombre ?? 'producto'}": hay ${
        disponible ?? '0'
      } y quieres trasladar ${pedido ?? '?'}.`,
    };
  }
  return null;
}

async function resolveBranch(ctx: ToolContext, explicit?: number): Promise<number | null> {
  if (explicit) return explicit;
  if (ctx.branchId) return ctx.branchId;
  const { data } = await ctx.supabase
    .from('branches')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .order('is_main', { ascending: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

async function nombresDeProductos(ctx: ToolContext, ids: number[]): Promise<Map<number, string>> {
  const { data } = await ctx.supabase
    .from('products')
    .select('id, name')
    .eq('organization_id', ctx.organizationId)
    .in('id', ids);
  return new Map(((data ?? []) as Array<{ id: number; name: string }>).map((r) => [r.id, r.name]));
}

async function nombresDeSucursales(ctx: ToolContext, ids: number[]): Promise<Map<number, string>> {
  const { data } = await ctx.supabase
    .from('branches')
    .select('id, name')
    .eq('organization_id', ctx.organizationId)
    .in('id', ids);
  return new Map(((data ?? []) as Array<{ id: number; name: string }>).map((r) => [r.id, r.name]));
}

export const crearOrdenCompra: ToolDefinition<OrdenCompraArgs> = {
  name: 'crear_orden_compra',
  description:
    'Crea una orden de compra a un proveedor, en borrador, con sus líneas. NO recibe la mercancía ni mueve stock: eso se hace al recibirla en el módulo de compras. Usa buscar_productos antes para los product_id y buscar_proveedores (o pregunta) para el supplier_id. Si no sabes el costo, no lo pongas: se toma del último costo registrado.',
  parameters: {
    type: 'object',
    properties: {
      supplier_id: { type: 'integer', description: 'Identificador del proveedor.' },
      items: {
        type: 'array',
        description: 'Líneas de la orden.',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'integer', description: 'Identificador del producto (de buscar_productos).' },
            quantity: { type: 'number', description: 'Cantidad a comprar.' },
            unit_cost: {
              type: 'number',
              description: 'Costo unitario. OMÍTELO salvo que el usuario diga uno.',
            },
          },
          required: ['product_id', 'quantity'],
        },
      },
      branch_id: { type: 'integer', description: 'Sucursal que recibe. Omítelo para usar la actual.' },
      expected_date: { type: 'string', description: 'Fecha esperada de entrega, formato YYYY-MM-DD.' },
      notes: { type: 'string', description: 'Nota de la orden.' },
    },
    required: ['supplier_id', 'items'],
    additionalProperties: false,
  },
  risk: 'high',
  permissions: ['inventory.create', 'inventory_management'],
  minLevel: 'write_full',
  requiredModule: 'inventory',
  availableInVoice: false,

  parseArgs(raw: unknown): OrdenCompraArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const supplierId = parseId(obj.supplier_id);
    const items = parseLineas(obj.items, true);
    if (!supplierId || !items) return null;

    const args: OrdenCompraArgs = { supplier_id: supplierId, items };
    const branchId = parseId(obj.branch_id);
    if (branchId) args.branch_id = branchId;
    const fecha = parseFecha(obj.expected_date);
    if (fecha) args.expected_date = fecha;
    if (typeof obj.notes === 'string' && obj.notes.trim()) args.notes = obj.notes.trim().slice(0, 500);
    return args;
  },

  async preview(ctx: ToolContext, args: OrdenCompraArgs): Promise<ToolPreview> {
    const warnings: string[] = [];

    const { data: proveedor } = await ctx.supabase
      .from('suppliers')
      .select('id, name')
      .eq('organization_id', ctx.organizationId)
      .eq('id', args.supplier_id)
      .maybeSingle();
    const nombreProveedor = (proveedor as { name: string } | null)?.name ?? null;
    if (!nombreProveedor) warnings.push(`No encontré el proveedor ${args.supplier_id} en esta organización.`);

    const ids = args.items.map((i) => i.product_id);
    const nombres = await nombresDeProductos(ctx, ids);

    // Último costo por producto (el de ese proveedor primero), para que la
    // tarjeta enseñe importes reales y no "producto 51814 × 3".
    const { data: costos } = await ctx.supabase
      .from('product_costs')
      .select('product_id, supplier_id, cost, effective_from')
      .in('product_id', ids)
      .order('effective_from', { ascending: false });
    // Primero el costo con ese proveedor; si no hay, el último general. La
    // consulta viene ordenada por vigencia descendente, así que el primero que
    // aparece de cada clase es el vigente.
    const costoProveedor = new Map<number, number>();
    const costoGeneral = new Map<number, number>();
    for (const c of (costos ?? []) as Array<{ product_id: number; supplier_id: number | null; cost: number }>) {
      if (c.supplier_id === args.supplier_id && !costoProveedor.has(c.product_id)) {
        costoProveedor.set(c.product_id, Number(c.cost));
      }
      if (!costoGeneral.has(c.product_id)) costoGeneral.set(c.product_id, Number(c.cost));
    }
    const costoDe = (id: number): number | null => costoProveedor.get(id) ?? costoGeneral.get(id) ?? null;

    let total = 0;
    const lines = args.items.map((item) => {
      const nombre = nombres.get(item.product_id);
      if (!nombre) warnings.push(`No encontré el producto ${item.product_id} en tu catálogo.`);
      const costo = item.unit_cost ?? costoDe(item.product_id);
      if (nombre && costo === null) warnings.push(`"${nombre}" no tiene costo registrado: quedará en 0.`);
      const subtotal = (costo ?? 0) * item.quantity;
      total += subtotal;
      return {
        label: nombre ?? `Producto ${item.product_id}`,
        value:
          costo !== null
            ? `${item.quantity} × ${formatMoney(costo, ctx.currency)} = ${formatMoney(subtotal, ctx.currency)}`
            : `${item.quantity} × (sin costo)`,
      };
    });

    if (nombreProveedor) lines.unshift({ label: 'Proveedor', value: nombreProveedor });
    if (args.expected_date) lines.push({ label: 'Entrega esperada', value: args.expected_date });
    warnings.push('La orden queda en borrador. El stock entra cuando se recibe la mercancía en Compras.');

    return {
      title: 'Crear orden de compra',
      summary: `Orden de compra a ${nombreProveedor ?? 'proveedor'} con ${args.items.length} ${
        args.items.length === 1 ? 'línea' : 'líneas'
      } por ${formatMoney(total, ctx.currency)}, en borrador.`,
      lines,
      warnings,
      totals: { Total: formatMoney(total, ctx.currency) },
      estimatedCredits: 2,
      reversible: true,
    };
  },

  async execute(ctx: ToolContext, args: OrdenCompraArgs): Promise<ToolResult> {
    const branchId = await resolveBranch(ctx, args.branch_id);
    if (!branchId) {
      return { ok: false, errorCode: 'no_branch', message: 'No encontré la sucursal que recibe la compra. Dime cuál.' };
    }

    const { data, error } = await ctx.supabase.rpc('assistant_create_purchase_order', {
      p_organization_id: ctx.organizationId,
      p_branch_id: branchId,
      p_user_id: ctx.userId,
      p_payload: {
        supplier_id: args.supplier_id,
        expected_date: args.expected_date ?? null,
        items: args.items,
        notes: args.notes ?? null,
      },
    });

    if (error) {
      const mapped = mapComprasError(error.message);
      if (mapped) return mapped;
      return { ok: false, errorCode: 'execution_error', message: `No pude crear la orden de compra: ${error.message}` };
    }

    const row = data as {
      purchase_order_id: number;
      proveedor: string;
      lineas: number;
      total: number;
      lineas_sin_costo: number;
    };
    const aviso =
      row.lineas_sin_costo > 0
        ? ` ${row.lineas_sin_costo} ${row.lineas_sin_costo === 1 ? 'línea quedó' : 'líneas quedaron'} sin costo: complétalo antes de enviarla.`
        : '';
    return {
      ok: true,
      message: `Orden de compra #${row.purchase_order_id} creada en borrador a ${row.proveedor} por ${formatMoney(
        row.total,
        ctx.currency
      )} con ${row.lineas} ${row.lineas === 1 ? 'línea' : 'líneas'}.${aviso}`,
      entity: { type: 'purchase_order', id: row.purchase_order_id },
      data: row,
      // Un borrador no ha movido nada: deshacer = cancelarla, mientras siga
      // en borrador. Nunca se borra la fila: queda el rastro.
      undo: { kind: 'cancel_purchase_order', payload: { purchase_order_id: row.purchase_order_id } },
    };
  },
};

export const crearTraslado: ToolDefinition<TrasladoArgs> = {
  name: 'crear_traslado',
  description:
    'Crea un traslado de existencias entre dos sucursales, en estado pendiente. NO mueve el stock: lo confirma la sucursal destino al recibir. Se valida que la sucursal origen tenga existencias. Usa buscar_productos antes para los product_id.',
  parameters: {
    type: 'object',
    properties: {
      origin_branch_id: { type: 'integer', description: 'Sucursal que envía.' },
      dest_branch_id: { type: 'integer', description: 'Sucursal que recibe.' },
      items: {
        type: 'array',
        description: 'Productos y cantidades a trasladar.',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'integer', description: 'Identificador del producto.' },
            quantity: { type: 'number', description: 'Cantidad a trasladar.' },
          },
          required: ['product_id', 'quantity'],
        },
      },
      notes: { type: 'string', description: 'Nota del traslado.' },
    },
    required: ['origin_branch_id', 'dest_branch_id', 'items'],
    additionalProperties: false,
  },
  risk: 'high',
  permissions: ['inventory.transfer', 'inventory_management'],
  minLevel: 'write_full',
  requiredModule: 'inventory',
  availableInVoice: false,

  parseArgs(raw: unknown): TrasladoArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const origin = parseId(obj.origin_branch_id);
    const dest = parseId(obj.dest_branch_id);
    const items = parseLineas(obj.items, false);
    if (!origin || !dest || !items) return null;

    const args: TrasladoArgs = {
      origin_branch_id: origin,
      dest_branch_id: dest,
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    };
    if (typeof obj.notes === 'string' && obj.notes.trim()) args.notes = obj.notes.trim().slice(0, 500);
    return args;
  },

  async preview(ctx: ToolContext, args: TrasladoArgs): Promise<ToolPreview> {
    const warnings: string[] = [];
    const sucursales = await nombresDeSucursales(ctx, [args.origin_branch_id, args.dest_branch_id]);
    const origen = sucursales.get(args.origin_branch_id);
    const destino = sucursales.get(args.dest_branch_id);
    if (!origen) warnings.push(`No encontré la sucursal de origen ${args.origin_branch_id}.`);
    if (!destino) warnings.push(`No encontré la sucursal de destino ${args.dest_branch_id}.`);
    if (args.origin_branch_id === args.dest_branch_id) warnings.push('Origen y destino son la misma sucursal.');

    const ids = args.items.map((i) => i.product_id);
    const nombres = await nombresDeProductos(ctx, ids);

    const { data: stock } = await ctx.supabase
      .from('stock_levels')
      .select('product_id, qty_on_hand, qty_reserved')
      .eq('branch_id', args.origin_branch_id)
      .in('product_id', ids);
    const disponible = new Map<number, number>();
    for (const s of (stock ?? []) as Array<{ product_id: number; qty_on_hand: number; qty_reserved: number | null }>) {
      disponible.set(
        s.product_id,
        (disponible.get(s.product_id) ?? 0) + Number(s.qty_on_hand) - Number(s.qty_reserved ?? 0)
      );
    }

    const lines = args.items.map((item) => {
      const nombre = nombres.get(item.product_id);
      if (!nombre) warnings.push(`No encontré el producto ${item.product_id} en tu catálogo.`);
      const hay = disponible.get(item.product_id) ?? 0;
      if (nombre && hay < item.quantity) {
        warnings.push(`En ${origen ?? 'el origen'} hay ${hay} de "${nombre}" y quieres trasladar ${item.quantity}.`);
      }
      return {
        label: nombre ?? `Producto ${item.product_id}`,
        value: `${item.quantity} (disponible en origen: ${hay})`,
      };
    });
    lines.unshift({ label: 'Ruta', value: `${origen ?? args.origin_branch_id} → ${destino ?? args.dest_branch_id}` });
    warnings.push('El traslado queda pendiente. El stock se mueve cuando el destino confirma la recepción.');

    return {
      title: 'Crear traslado entre sucursales',
      summary: `Trasladar ${args.items.length} ${args.items.length === 1 ? 'producto' : 'productos'} de ${
        origen ?? 'origen'
      } a ${destino ?? 'destino'}, pendiente de recepción.`,
      lines,
      warnings,
      estimatedCredits: 2,
      reversible: true,
    };
  },

  async execute(ctx: ToolContext, args: TrasladoArgs): Promise<ToolResult> {
    const { data, error } = await ctx.supabase.rpc('assistant_create_transfer', {
      p_organization_id: ctx.organizationId,
      p_user_id: ctx.userId,
      p_payload: {
        origin_branch_id: args.origin_branch_id,
        dest_branch_id: args.dest_branch_id,
        items: args.items,
        notes: args.notes ?? null,
      },
    });

    if (error) {
      const mapped = mapComprasError(error.message);
      if (mapped) return mapped;
      return { ok: false, errorCode: 'execution_error', message: `No pude crear el traslado: ${error.message}` };
    }

    const row = data as { transfer_id: number; origen: string; destino: string; lineas: number };
    return {
      ok: true,
      message: `Traslado #${row.transfer_id} creado de ${row.origen} a ${row.destino} con ${row.lineas} ${
        row.lineas === 1 ? 'línea' : 'líneas'
      }, pendiente de que ${row.destino} confirme la recepción.`,
      entity: { type: 'inventory_transfer', id: row.transfer_id },
      data: row,
      undo: { kind: 'cancel_transfer', payload: { transfer_id: row.transfer_id } },
    };
  },
};

export const COMPRAS_TOOLS = [crearOrdenCompra, crearTraslado];
