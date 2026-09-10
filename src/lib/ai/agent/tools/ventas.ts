/**
 * GO Assistant — Fase 2: venta y ajuste de inventario.
 *
 * Estas dos son las primeras herramientas con impacto contable REAL. Al
 * insertar, los disparadores del esquema (`fn_auto_journal_sale_pos`,
 * `fn_auto_journal_sale_item_cogs`, `fn_auto_journal_payment`,
 * `fn_auto_journal_stock_movement`, `fn_auto_journal_inventory_adjustment`)
 * generan los asientos solos. No hay que replicar la partida doble aquí — pero
 * sí significa que una venta mal dictada deja rastro en los libros. Por eso
 * ambas son `risk: 'high'` y `minLevel: 'write_full'`.
 *
 * Toda la escritura va en una RPC transaccional. El porqué está en la migración
 * `20260910180000_go_assistant_f2_venta_y_ajuste.sql`: los servicios existentes
 * (`posService`, `adjustmentService`) importan el cliente de navegador y no se
 * pueden llamar desde el servidor.
 *
 * Decisión importante: **el precio lo pone el catálogo, no el modelo.** Si el
 * usuario no dice un precio, la RPC lo lee de `product_prices`. Que una IA
 * invente el precio de venta es exactamente lo que no puede pasar.
 */

import { formatMoney } from '@/lib/ai/assistant/orgCurrency';
import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

interface LineaVenta {
  product_id: number;
  quantity: number;
  unit_price?: number;
}

interface RegistrarVentaArgs {
  items: LineaVenta[];
  customer_id?: string;
  payment_method?: string;
  paid_amount?: number;
  notes?: string;
}

const MAX_LINEAS = 100;

/** Convierte lo que devolvió el modelo en líneas válidas, o `null`. */
function parseLineas(raw: unknown): LineaVenta[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINEAS) return null;
  const items: LineaVenta[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const obj = entry as Record<string, unknown>;
    const productId = Number(obj.product_id);
    const quantity = Number(obj.quantity);
    if (!Number.isInteger(productId) || productId <= 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const linea: LineaVenta = { product_id: productId, quantity };
    // El precio explícito es opcional y solo se acepta si es un número válido;
    // si no viene, la RPC lo resuelve del catálogo.
    const price = Number(obj.unit_price);
    if (obj.unit_price !== undefined && obj.unit_price !== null && Number.isFinite(price) && price >= 0) {
      linea.unit_price = price;
    }
    items.push(linea);
  }
  return items;
}

/** Traduce los errores de la RPC a español. */
function mapSaleError(message: string): ToolResult | null {
  // La RPC vive en una migración. Si el despliegue de la base va por detrás del
  // código, es preferible decirlo con claridad que soltar un error de Postgres
  // delante del usuario — y sobre todo, no dejarle creer que la venta se
  // registró.
  if (
    message.includes('Could not find the function') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  ) {
    return {
      ok: false,
      errorCode: 'not_deployed',
      message:
        'Todavía no puedo registrar ventas: falta aplicar un cambio en la base de datos. Avisa a soporte.',
    };
  }
  if (message.includes('BRANCH_NOT_IN_ORG')) {
    return { ok: false, errorCode: 'not_found', message: 'Esa sucursal no existe en esta organización.' };
  }
  if (message.includes('CUSTOMER_NOT_IN_ORG')) {
    return { ok: false, errorCode: 'not_found', message: 'Ese cliente no existe en esta organización.' };
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
  if (message.includes('PRICE_UNKNOWN')) {
    const nombre = message.split('PRICE_UNKNOWN:')[1]?.split('\n')[0]?.trim() ?? 'ese producto';
    return {
      ok: false,
      errorCode: 'no_price',
      message: `"${nombre}" no tiene precio de venta registrado. Dime a qué precio se vende y lo registro.`,
    };
  }
  if (message.includes('INSUFFICIENT_STOCK')) {
    const partes = message.split('INSUFFICIENT_STOCK:')[1]?.split('\n')[0]?.split(':') ?? [];
    const [nombre, disponible, pedido] = partes;
    return {
      ok: false,
      errorCode: 'no_stock',
      message: `No hay suficiente "${nombre ?? 'producto'}": quedan ${disponible ?? '0'} y me pides ${pedido ?? '?'}.`,
    };
  }
  if (message.includes('TYPE_INVALID')) {
    return { ok: false, errorCode: 'bad_input', message: 'El ajuste tiene que ser de entrada o de salida.' };
  }
  if (message.includes('REASON_REQUIRED')) {
    return { ok: false, errorCode: 'missing_fields', message: 'Un ajuste de inventario necesita un motivo.' };
  }
  return null;
}

/**
 * Formato de dinero en la moneda de la ORGANIZACIÓN, no en una cableada.
 * `ctx.currency` sale de `organization_currencies.is_base`, con la misma cadena
 * de respaldo que usa el resto del ERP.
 */
function money(value: number, currency: string): string {
  return formatMoney(value, currency);
}

/**
 * Resuelve la sucursal: la activa, si no la principal, si no la primera.
 * `sales.branch_id` es NOT NULL.
 */
async function resolveBranch(ctx: ToolContext): Promise<number | null> {
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

export const registrarVenta: ToolDefinition<RegistrarVentaArgs> = {
  name: 'registrar_venta',
  description:
    'Registra una venta con sus líneas, descuenta el stock y registra el pago si lo hubo. Usa buscar_productos ANTES para obtener los identificadores; nunca inventes un product_id. Si no sabes el precio, no lo pongas: se toma del catálogo.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Líneas de la venta.',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'integer', description: 'Identificador del producto (de buscar_productos).' },
            quantity: { type: 'number', description: 'Cantidad vendida.' },
            unit_price: {
              type: 'number',
              description: 'Precio unitario. OMÍTELO salvo que el usuario diga uno distinto al del catálogo.',
            },
          },
          required: ['product_id', 'quantity'],
        },
      },
      customer_id: { type: 'string', description: 'Identificador del cliente, si la venta es a un cliente registrado.' },
      payment_method: { type: 'string', description: 'Forma de pago: cash, card, transfer…' },
      paid_amount: { type: 'number', description: 'Cuánto pagó. Si no pagó nada, omítelo y queda pendiente.' },
      notes: { type: 'string', description: 'Nota de la venta.' },
    },
    required: ['items'],
    additionalProperties: false,
  },
  risk: 'high',
  permissions: ['pos.create'],
  minLevel: 'write_full',
  requiredModule: 'pos',
  // Vender por voz sin ver la pantalla es un incidente esperando ocurrir (§5.5.2).
  availableInVoice: false,

  parseArgs(raw: unknown): RegistrarVentaArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const items = parseLineas(obj.items);
    if (!items) return null;

    const args: RegistrarVentaArgs = { items };
    if (typeof obj.customer_id === 'string' && obj.customer_id.trim()) args.customer_id = obj.customer_id.trim();
    if (typeof obj.payment_method === 'string' && obj.payment_method.trim()) {
      args.payment_method = obj.payment_method.trim().slice(0, 40);
    }
    const paid = Number(obj.paid_amount);
    if (Number.isFinite(paid) && paid > 0) args.paid_amount = paid;
    if (typeof obj.notes === 'string' && obj.notes.trim()) args.notes = obj.notes.trim().slice(0, 500);
    return args;
  },

  /**
   * `preview()` LEE para poder enseñar nombres y precios reales, pero no
   * escribe: sin esto la tarjeta diría "producto 51814 × 3", que no le dice
   * nada a nadie y hace imposible confirmar con criterio.
   */
  async preview(ctx: ToolContext, args: RegistrarVentaArgs): Promise<ToolPreview> {
    const ids = args.items.map((i) => i.product_id);
    const { data } = await ctx.supabase
      .from('products')
      .select('id, name, product_prices(price, effective_to)')
      .eq('organization_id', ctx.organizationId)
      .in('id', ids);

    const catalogo = new Map<number, { name: string; price: number | null }>();
    for (const row of (data ?? []) as Array<{
      id: number;
      name: string;
      product_prices: Array<{ price: number; effective_to: string | null }> | null;
    }>) {
      const vigente = (row.product_prices ?? []).find((p) => p.effective_to === null);
      catalogo.set(row.id, { name: row.name, price: vigente ? Number(vigente.price) : null });
    }

    const warnings: string[] = [];
    let total = 0;
    const lines = args.items.map((item) => {
      const info = catalogo.get(item.product_id);
      const precio = item.unit_price ?? info?.price ?? null;

      if (!info) warnings.push(`No encontré el producto ${item.product_id} en tu catálogo.`);
      else if (precio === null) warnings.push(`"${info.name}" no tiene precio de venta registrado.`);
      else if (item.unit_price !== undefined && info.price !== null && item.unit_price !== info.price) {
        warnings.push(
          `"${info.name}" se vende a ${money(info.price, ctx.currency)} y lo estás poniendo a ${money(item.unit_price, ctx.currency)}.`
        );
      }

      const subtotal = precio !== null ? precio * item.quantity : 0;
      total += subtotal;

      return {
        label: info?.name ?? `Producto ${item.product_id}`,
        value:
          precio !== null
            ? `${item.quantity} × ${money(precio, ctx.currency)} = ${money(subtotal, ctx.currency)}`
            : `${item.quantity} × (sin precio)`,
      };
    });

    const pagado = args.paid_amount ?? 0;
    const saldo = Math.max(total - pagado, 0);
    if (saldo > 0) warnings.push(`Queda un saldo pendiente de ${money(saldo, ctx.currency)}.`);

    return {
      title: 'Registrar venta',
      summary: `Registrar una venta de ${args.items.length} ${
        args.items.length === 1 ? 'producto' : 'productos'
      } por ${money(total, ctx.currency)}${pagado > 0 ? `, pagados ${money(pagado, ctx.currency)}` : ', sin pago'}.`,
      lines,
      warnings,
      totals: {
        Total: money(total, ctx.currency),
        Pagado: money(pagado, ctx.currency),
        Saldo: money(saldo, ctx.currency),
      },
      estimatedCredits: 2,
      // Anular una venta mueve la contabilidad: se hace por su camino de
      // negocio (nota de crédito / anulación), no borrando filas.
      reversible: false,
    };
  },

  async execute(ctx: ToolContext, args: RegistrarVentaArgs): Promise<ToolResult> {
    const branchId = await resolveBranch(ctx);
    if (!branchId) {
      return {
        ok: false,
        errorCode: 'no_branch',
        message: 'No encontré la sucursal donde registrar la venta. Dime en cuál.',
      };
    }

    const { data, error } = await ctx.supabase.rpc('assistant_register_sale', {
      p_organization_id: ctx.organizationId,
      p_branch_id: branchId,
      p_user_id: ctx.userId,
      p_payload: {
        items: args.items,
        customer_id: args.customer_id ?? null,
        payment_method: args.payment_method ?? null,
        paid_amount: args.paid_amount ?? 0,
        notes: args.notes ?? null,
        // La moneda la decide la organización, no la función ni el modelo.
        currency: ctx.currency,
      },
    });

    if (error) {
      const mapped = mapSaleError(error.message);
      if (mapped) return mapped;
      return { ok: false, errorCode: 'execution_error', message: `No pude registrar la venta: ${error.message}` };
    }

    const row = data as {
      sale_id: string;
      lineas: number;
      total: number;
      pagado: number;
      saldo: number;
      estado: string;
    };

    const saldoTexto = row.saldo > 0 ? ` Queda un saldo de ${money(row.saldo, ctx.currency)}.` : '';
    return {
      ok: true,
      message: `Venta registrada por ${money(row.total, ctx.currency)} con ${row.lineas} ${
        row.lineas === 1 ? 'línea' : 'líneas'
      }.${saldoTexto}`,
      entity: { type: 'sale', id: row.sale_id },
      data: row,
      // Sin `undo`: anular una venta mueve inventario y contabilidad. Se hace
      // por el camino de anulación del módulo, no revirtiendo filas a mano.
    };
  },
};

interface LineaAjuste {
  product_id: number;
  quantity: number;
}

interface AjusteArgs {
  type: 'gain' | 'loss';
  reason: string;
  items: LineaAjuste[];
  notes?: string;
}

export const ajustarInventario: ToolDefinition<AjusteArgs> = {
  name: 'crear_ajuste_inventario',
  description:
    'Registra un ajuste de inventario documentado (entrada por sobrante o salida por faltante/merma), con su motivo y sus movimientos. Usa buscar_productos antes para obtener los identificadores.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['gain', 'loss'],
        description: 'gain = entra stock (sobrante). loss = sale stock (faltante, merma, daño).',
      },
      reason: { type: 'string', description: 'Motivo del ajuste. Obligatorio: queda en el documento.' },
      items: {
        type: 'array',
        description: 'Productos y cantidades a ajustar.',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'integer', description: 'Identificador del producto.' },
            quantity: { type: 'number', description: 'Cantidad a ajustar (siempre positiva).' },
          },
          required: ['product_id', 'quantity'],
        },
      },
      notes: { type: 'string', description: 'Nota adicional.' },
    },
    required: ['type', 'reason', 'items'],
    additionalProperties: false,
  },
  risk: 'high',
  permissions: ['inventory.adjust', 'inventory_management'],
  minLevel: 'write_full',
  requiredModule: 'inventory',
  availableInVoice: false,

  parseArgs(raw: unknown): AjusteArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const type = obj.type === 'gain' || obj.type === 'loss' ? obj.type : null;
    const reason = typeof obj.reason === 'string' ? obj.reason.trim() : '';
    if (!type || !reason) return null;

    const items = parseLineas(obj.items);
    if (!items) return null;

    const args: AjusteArgs = {
      type,
      reason: reason.slice(0, 200),
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    };
    if (typeof obj.notes === 'string' && obj.notes.trim()) args.notes = obj.notes.trim().slice(0, 500);
    return args;
  },

  async preview(ctx: ToolContext, args: AjusteArgs): Promise<ToolPreview> {
    const { data } = await ctx.supabase
      .from('products')
      .select('id, name')
      .eq('organization_id', ctx.organizationId)
      .in(
        'id',
        args.items.map((i) => i.product_id)
      );

    const nombres = new Map(((data ?? []) as Array<{ id: number; name: string }>).map((r) => [r.id, r.name]));
    const signo = args.type === 'gain' ? '+' : '−';

    const warnings: string[] = [];
    for (const item of args.items) {
      if (!nombres.has(item.product_id)) {
        warnings.push(`No encontré el producto ${item.product_id} en tu catálogo.`);
      }
    }
    warnings.push('Un ajuste mueve el inventario valorado y genera asiento contable.');

    return {
      title: args.type === 'gain' ? 'Ajuste de entrada' : 'Ajuste de salida',
      summary: `${args.type === 'gain' ? 'Sumar' : 'Descontar'} ${args.items.length} ${
        args.items.length === 1 ? 'producto' : 'productos'
      } del inventario. Motivo: ${args.reason}.`,
      lines: [
        { label: 'Motivo', value: args.reason },
        ...args.items.map((item) => ({
          label: nombres.get(item.product_id) ?? `Producto ${item.product_id}`,
          value: `${signo}${item.quantity}`,
        })),
      ],
      warnings,
      estimatedCredits: 2,
      reversible: false,
    };
  },

  async execute(ctx: ToolContext, args: AjusteArgs): Promise<ToolResult> {
    const branchId = await resolveBranch(ctx);
    if (!branchId) {
      return {
        ok: false,
        errorCode: 'no_branch',
        message: 'No encontré la sucursal del ajuste. Dime en cuál.',
      };
    }

    const { data, error } = await ctx.supabase.rpc('assistant_create_adjustment', {
      p_organization_id: ctx.organizationId,
      p_branch_id: branchId,
      p_user_id: ctx.userId,
      p_payload: {
        type: args.type,
        reason: args.reason,
        items: args.items,
        notes: args.notes ?? null,
      },
    });

    if (error) {
      const mapped = mapSaleError(error.message);
      if (mapped) return mapped;
      return { ok: false, errorCode: 'execution_error', message: `No pude registrar el ajuste: ${error.message}` };
    }

    const row = data as { adjustment_id: number; tipo: string; lineas: number; motivo: string };
    return {
      ok: true,
      message: `Ajuste de ${row.tipo === 'gain' ? 'entrada' : 'salida'} registrado con ${row.lineas} ${
        row.lineas === 1 ? 'línea' : 'líneas'
      }. Motivo: ${row.motivo}.`,
      entity: { type: 'inventory_adjustment', id: row.adjustment_id },
      data: row,
    };
  },
};

export const VENTAS_TOOLS = [registrarVenta, ajustarInventario];
