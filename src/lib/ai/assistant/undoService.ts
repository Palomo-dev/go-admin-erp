/**
 * GO Assistant — Fase 3: deshacer.
 *
 * Desde F0 cada acción guarda un `undo_payload` en `ai_agent_actions`, pero
 * nadie lo aplicaba. Esto lo aplica.
 *
 * **Deshacer COMPENSA, no borra** (§6.4 del plan). Un producto recién creado y
 * sin movimientos sí se puede borrar; uno que ya se vendió, no — y en ese caso
 * lo honesto es decirlo, no dejar la base inconsistente. Lo que tiene
 * contrapartida contable (una venta, un ajuste) no se deshace por aquí en
 * absoluto: se anula por el camino de negocio del módulo, y por eso esas
 * herramientas no devuelven `undo`.
 *
 * La ventana es `ai_assistant_settings.undo_window_minutes` (default 15).
 * Pasada, el botón desaparece: revertir algo de hace tres horas, cuando el
 * mundo ya cambió, causa más daño del que arregla.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UndoContext {
  supabase: SupabaseClient;
  organizationId: number;
  userId: string;
}

export interface UndoOutcome {
  ok: boolean;
  message: string;
  errorCode?: string;
}

type Payload = Record<string, unknown>;

function intId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Un producto solo se puede borrar si NO tiene rastro en el negocio.
 *
 * Si ya se vendió, se movió o entró en una compra, borrarlo dejaría líneas de
 * venta apuntando a nada. En ese caso se desactiva (`status = 'inactive'`), que
 * es lo que hace el ERP a mano, y se le dice al usuario lo que realmente pasó.
 */
async function productHasHistory(ctx: UndoContext, productId: number): Promise<boolean> {
  const [ventas, movimientos] = await Promise.all([
    ctx.supabase.from('sale_items').select('id', { count: 'exact', head: true }).eq('product_id', productId),
    ctx.supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('product_id', productId),
  ]);
  return (ventas.count ?? 0) > 0 || (movimientos.count ?? 0) > 0;
}

/** Campos que sí se pueden restaurar de un snapshot `before`. */
const RESTORABLE: Record<string, readonly string[]> = {
  products: ['name', 'description', 'brand', 'category_id', 'status'],
  categories: ['name', 'description'],
  suppliers: ['name', 'contact', 'email', 'phone', 'address'],
  // `full_name`, `doc_type` y `doc_number` son GENERATED ALWAYS: se restauran
  // los campos base, nunca los generados.
  customers: ['first_name', 'last_name', 'email', 'phone', 'address', 'city'],
};

async function restoreSnapshot(
  ctx: UndoContext,
  table: keyof typeof RESTORABLE,
  id: string | number,
  before: Payload,
  etiqueta: string
): Promise<UndoOutcome> {
  const update: Payload = {};
  for (const field of RESTORABLE[table]) {
    if (field in before) update[field] = before[field];
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, errorCode: 'nothing_to_restore', message: 'No guardé cómo estaba antes.' };
  }
  update.updated_at = new Date().toISOString();

  const { error } = await ctx.supabase
    .from(table)
    .update(update)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);

  if (error) return { ok: false, errorCode: 'restore_failed', message: error.message };
  return { ok: true, message: `${etiqueta} quedó como estaba antes.` };
}

/**
 * Tablas que hay que mirar ANTES de borrar cada entidad.
 *
 * **Por qué no basta con intentar el DELETE y capturar el error.** Se verificó
 * contra `pg_constraint` en la base real: en este esquema casi ninguna clave
 * foránea protege. `products_category_id_fkey` es `ON DELETE SET NULL`, así que
 * borrar una categoría **descategoriza sus productos en silencio**. Y peor:
 * `invoice_purchase` y `purchase_orders` son `ON DELETE CASCADE` sobre
 * `suppliers`, de modo que borrar un proveedor **borraría sus facturas y
 * órdenes de compra**; `customers` cascadea a conversaciones, membresías, notas
 * de crédito, consentimientos y siete tablas más.
 *
 * Es decir: el `DELETE` no habría fallado. Habría funcionado, destruyendo
 * datos, y "deshacer" habría sido mucho peor que la acción que deshace.
 *
 * Un registro creado hace menos de 15 minutos (la ventana de deshacer) casi
 * nunca tiene dependencias, así que en el caso normal esto no estorba. Cuando
 * las tiene, es exactamente cuando hay que parar.
 */
const DEPENDENCIAS: Record<string, ReadonlyArray<{ tabla: string; columna: string; que: string }>> = {
  categories: [
    { tabla: 'products', columna: 'category_id', que: 'productos' },
    { tabla: 'product_category_relations', columna: 'category_id', que: 'productos' },
    { tabla: 'category_rules', columna: 'category_id', que: 'reglas de categoría' },
    { tabla: 'promotion_rules', columna: 'category_id', que: 'promociones' },
    { tabla: 'website_menu_items', columna: 'category_id', que: 'menús del sitio web' },
  ],
  suppliers: [
    { tabla: 'invoice_purchase', columna: 'supplier_id', que: 'facturas de compra' },
    { tabla: 'purchase_orders', columna: 'supplier_id', que: 'órdenes de compra' },
    { tabla: 'product_suppliers', columna: 'supplier_id', que: 'productos' },
    { tabla: 'product_costs', columna: 'supplier_id', que: 'costos de productos' },
    { tabla: 'accounts_payable', columna: 'supplier_id', que: 'cuentas por pagar' },
    { tabla: 'lots', columna: 'supplier_id', que: 'lotes' },
  ],
  customers: [
    { tabla: 'sales', columna: 'customer_id', que: 'ventas' },
    { tabla: 'invoice_sales', columna: 'customer_id', que: 'facturas' },
    { tabla: 'quotations', columna: 'customer_id', que: 'cotizaciones' },
    { tabla: 'accounts_receivable', columna: 'customer_id', que: 'cuentas por cobrar' },
    { tabla: 'opportunities', columna: 'customer_id', que: 'oportunidades' },
    { tabla: 'conversations', columna: 'customer_id', que: 'conversaciones' },
    { tabla: 'memberships', columna: 'customer_id', que: 'membresías' },
    { tabla: 'reservations', columna: 'customer_id', que: 'reservas' },
    { tabla: 'credit_notes', columna: 'customer_id', que: 'notas de crédito' },
  ],
};

/** Qué depende de esta fila, en palabras. Vacío = no la usa nadie. */
async function dependenciasDe(
  ctx: UndoContext,
  table: keyof typeof DEPENDENCIAS,
  id: string | number
): Promise<string[]> {
  const checks = DEPENDENCIAS[table];
  const resultados = await Promise.all(
    checks.map(async ({ tabla, columna, que }) => {
      const { count, error } = await ctx.supabase
        .from(tabla)
        .select('*', { count: 'exact', head: true })
        .eq(columna, id);
      // Fail-closed: si no se puede comprobar, se asume que SÍ hay dependencia.
      // Borrar por no haber podido mirar es exactamente el error que esta
      // función existe para evitar.
      if (error) return `${que} (no pude comprobarlo)`;
      return (count ?? 0) > 0 ? que : null;
    })
  );
  return resultados.filter((r): r is string => r !== null);
}

async function deleteIfClean(
  ctx: UndoContext,
  table: 'categories' | 'suppliers' | 'customers',
  id: string | number,
  etiqueta: string
): Promise<UndoOutcome> {
  if (!id) return { ok: false, errorCode: 'bad_payload', message: `No sé qué ${etiqueta} deshacer.` };

  const enUso = await dependenciasDe(ctx, table, id);
  if (enUso.length > 0) {
    return {
      ok: false,
      errorCode: 'in_use',
      message: `No borré ${etiqueta} porque ya tiene ${enUso.join(', ')} asociados, y borrarlo se los llevaría por delante. Si de verdad quieres eliminarlo, hazlo desde su módulo.`,
    };
  }

  const { error } = await ctx.supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);

  if (error) return { ok: false, errorCode: 'delete_failed', message: error.message };
  return { ok: true, message: `${etiqueta} se eliminó.` };
}

/**
 * Aplica la reversión guardada.
 *
 * Devuelve `ok: false` con un motivo legible cuando no se puede: eso es
 * información, no un fallo. "No pude deshacerlo porque ya se vendió" es una
 * respuesta útil; borrar igualmente, no.
 */
export async function applyUndo(ctx: UndoContext, undo: { kind: string; payload: Payload }): Promise<UndoOutcome> {
  const { kind, payload } = undo;

  switch (kind) {
    case 'delete_product': {
      const productId = intId(payload.product_id);
      if (!productId) return { ok: false, errorCode: 'bad_payload', message: 'No sé qué producto deshacer.' };

      if (await productHasHistory(ctx, productId)) {
        const { error } = await ctx.supabase
          .from('products')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .eq('id', productId)
          .eq('organization_id', ctx.organizationId);
        if (error) return { ok: false, errorCode: 'deactivate_failed', message: error.message };
        return {
          ok: true,
          message: 'El producto ya tenía movimientos, así que no lo borré: lo dejé inactivo para no romper el histórico.',
        };
      }

      // Las filas hijas van primero: no hay ON DELETE CASCADE en todas.
      await Promise.all([
        ctx.supabase.from('product_prices').delete().eq('product_id', productId),
        ctx.supabase.from('product_costs').delete().eq('product_id', productId),
        ctx.supabase.from('product_suppliers').delete().eq('product_id', productId),
        ctx.supabase.from('stock_levels').delete().eq('product_id', productId),
      ]);

      const { error } = await ctx.supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('organization_id', ctx.organizationId);
      if (error) return { ok: false, errorCode: 'delete_failed', message: error.message };
      return { ok: true, message: 'El producto se eliminó.' };
    }

    case 'restore_product':
      return restoreSnapshot(ctx, 'products', intId(payload.product_id) ?? 0, (payload.before as Payload) ?? {}, 'El producto');

    case 'revert_price': {
      const productId = intId(payload.product_id);
      const newPriceId = intId(payload.new_price_id);
      const previousPriceId = intId(payload.previous_price_id);
      if (!productId || !newPriceId) {
        return { ok: false, errorCode: 'bad_payload', message: 'No sé qué precio deshacer.' };
      }

      // Pertenencia explícita: `product_prices` no lleva `organization_id`.
      const { data: producto } = await ctx.supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (!producto) {
        return { ok: false, errorCode: 'not_found', message: 'Ese producto no existe en esta organización.' };
      }

      // Se reabre el anterior ANTES de cerrar el nuevo: al revés, un fallo
      // dejaría el producto sin precio vigente y fuera del POS.
      if (previousPriceId) {
        await ctx.supabase.from('product_prices').update({ effective_to: null }).eq('id', previousPriceId);
      }
      const { error } = await ctx.supabase
        .from('product_prices')
        .update({ effective_to: new Date().toISOString() })
        .eq('id', newPriceId);
      if (error) return { ok: false, errorCode: 'revert_failed', message: error.message };

      return {
        ok: true,
        message: previousPriceId ? 'El precio volvió al anterior.' : 'Quité el precio que había puesto.',
      };
    }

    case 'restore_stock': {
      const productId = intId(payload.product_id);
      const branchId = intId(payload.branch_id);
      const qty = Number(payload.qty_on_hand);
      if (!productId || !branchId || !Number.isFinite(qty)) {
        return { ok: false, errorCode: 'bad_payload', message: 'No sé qué existencias devolver.' };
      }

      const { data: producto } = await ctx.supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (!producto) {
        return { ok: false, errorCode: 'not_found', message: 'Ese producto no existe en esta organización.' };
      }

      const { error } = await ctx.supabase
        .from('stock_levels')
        .update({ qty_on_hand: qty, updated_at: new Date().toISOString() })
        .eq('product_id', productId)
        .eq('branch_id', branchId)
        .is('lot_id', null);
      if (error) return { ok: false, errorCode: 'revert_failed', message: error.message };
      return { ok: true, message: `Las existencias volvieron a ${qty}.` };
    }

    case 'delete_category':
      return deleteIfClean(ctx, 'categories', intId(payload.category_id) ?? 0, 'la categoría');
    case 'restore_category':
      return restoreSnapshot(ctx, 'categories', intId(payload.category_id) ?? 0, (payload.before as Payload) ?? {}, 'La categoría');

    case 'delete_supplier':
      return deleteIfClean(ctx, 'suppliers', intId(payload.supplier_id) ?? 0, 'el proveedor');
    case 'restore_supplier':
      return restoreSnapshot(ctx, 'suppliers', intId(payload.supplier_id) ?? 0, (payload.before as Payload) ?? {}, 'El proveedor');

    case 'delete_customer':
      return deleteIfClean(ctx, 'customers', String(payload.customer_id ?? ''), 'el cliente');
    case 'restore_customer':
      return restoreSnapshot(ctx, 'customers', String(payload.customer_id ?? ''), (payload.before as Payload) ?? {}, 'El cliente');

    default:
      return {
        ok: false,
        errorCode: 'not_undoable',
        message: 'Esa acción no se puede deshacer desde aquí.',
      };
  }
}
