/**
 * GO Assistant — ejecución de acciones.
 *
 * Cambios de la Fase 0 respecto a la versión anterior:
 *
 * 1. **Ya no importa el cliente de navegador** (`@/lib/supabase/config`, C4).
 *    Toda función recibe el cliente de SESIÓN del route handler, con RLS
 *    activo, y la organización sale de `getServerOrgContext()`, nunca del body.
 *
 * 2. **Escribe contra el esquema real** (C3). La versión anterior insertaba en
 *    `inventory`, `orders`, `order_items` (tablas inexistentes) y en columnas
 *    `products.price` / `products.cost` / `products.is_active` que tampoco
 *    existen. Además `create_category` fallaba por `slug NOT NULL`,
 *    `create_supplier` por escribir `contact_name` en vez de `contact` y
 *    `update_customer` por escribir `full_name`, que es GENERATED ALWAYS.
 *
 * 3. **Los permisos se resuelven en el servidor** (C2). Ya no existe
 *    `canExecuteAction(type, userRole)` con el rol declarado por el cliente:
 *    ver `assertActionAllowed` en `@/lib/ai/assistant/actionGuard`.
 *
 * Nota de diseño: aquí todavía hay SQL propio para las operaciones de una sola
 * tabla. La regla del plan ("las herramientas llaman a servicios, no escriben
 * SQL") se aplica en F2 para todo lo compuesto (ventas, compras, ajustes
 * documentados), que sí toca varias tablas y debe ser transaccional.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACTION_CATALOG,
  getActionDefinition,
  getActionSchema,
  sanitizeActionFields,
  type AIActionType,
} from '@/lib/ai/assistant/actionCatalog';

export type { AIActionType, ActionFieldDef as AIActionField } from '@/lib/ai/assistant/actionCatalog';
export { ACTION_CATALOG, getActionSchema, isActionType } from '@/lib/ai/assistant/actionCatalog';

export type AIActionStatus =
  | 'pending'
  | 'confirmed'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'undone';

export interface ActionExecutionContext {
  supabase: SupabaseClient;
  organizationId: number;
  userId: string;
  /** Sucursal activa; puede faltar y entonces se resuelve la principal. */
  branchId?: number | null;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
  entity?: { type: string; id: string | number };
  /** Cómo revertir. `undefined` = no reversible. */
  undo?: { kind: string; payload: Record<string, unknown> };
  /** Código estable para el cliente (`schema_unavailable`, `duplicate`…). */
  errorCode?: string;
}

type Data = Record<string, unknown>;

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Coacciones defensivas.
 *
 * La lista blanca de campos filtra NOMBRES, no valores: el nombre del campo
 * viene del esquema, pero el valor lo pone quien confirma la tarjeta. Sin estas
 * guardas, `String({})` daba `'[object Object]'` en una columna de texto,
 * `String([1,2])` daba `'1,2'`, y `Number(true)` daba `1`, así que un
 * `category_id: true` apuntaba a la categoría 1. Lo encontró el tester de F0
 * (fallo 14).
 *
 * Solo se aceptan primitivas, y los booleanos no cuentan como número.
 */
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return null;
  if (typeof v === 'boolean') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean' || typeof v === 'object') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intId(v: unknown): number | null {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Normaliza a slug ASCII. `categories.slug` es NOT NULL y único por
 * organización; sin esto `create_category` fallaba siempre.
 */
/** Marcas diacríticas combinantes (U+0300–U+036F) que deja `normalize('NFD')`. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sin-nombre';
}

// La generación del SKU vivía aquí. Se movió dentro de
// `assistant_create_product`: el reintento ante colisión tiene que ocurrir en la
// misma transacción que el insert, si no la carrera sigue abierta.

/** Divide "Juan Carlos Pérez" en first/last. `full_name` es GENERATED ALWAYS. */
function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

/**
 * Traduce los errores que lanzan las RPC del asistente a mensajes que el usuario
 * pueda entender.
 *
 * Las RPC lanzan códigos estables (`CATEGORY_NOT_IN_ORG`, `SKU_TAKEN`…) en vez
 * de dejar salir el error de Postgres: mostrarle
 * `duplicate key value violates unique constraint "products_organization_id_sku_key"`
 * a alguien que está dictando un producto por chat no es una respuesta.
 *
 * Devuelve `null` si el error no es uno de los declarados, para que el llamador
 * lo trate como fallo inesperado.
 */
function mapRpcError(message: string): ActionResult | null {
  const known: Record<string, { code: string; text: string }> = {
    NAME_REQUIRED: { code: 'missing_fields', text: 'Me falta el nombre del producto.' },
    CATEGORY_NOT_IN_ORG: { code: 'not_found', text: 'Esa categoría no existe en esta organización.' },
    SUPPLIER_NOT_IN_ORG: { code: 'not_found', text: 'Ese proveedor no existe en esta organización.' },
    BRANCH_NOT_IN_ORG: { code: 'not_found', text: 'Esa sucursal no existe en esta organización.' },
    PRODUCT_NOT_IN_ORG: { code: 'not_found', text: 'Ese producto no existe en esta organización.' },
    PRICE_INVALID: { code: 'bad_input', text: 'El precio no es un número válido.' },
    BRANCH_REQUIRED_FOR_STOCK: {
      code: 'no_branch',
      text: 'Para registrar existencias necesito saber en qué sucursal. Dímela y lo creo entero.',
    },
    SKU_TAKEN: {
      code: 'duplicate',
      text: 'Ya existe un producto con ese código. Dime otro código o lo genero yo.',
    },
  };

  for (const [key, value] of Object.entries(known)) {
    if (message.includes(key)) {
      return { success: false, errorCode: value.code, message: value.text };
    }
  }
  return null;
}

/**
 * Resuelve la sucursal a usar: la activa, si no la principal, si no la primera.
 * `stock_levels.branch_id` es NOT NULL, así que sin sucursal no hay stock.
 */
async function resolveBranchId(ctx: ActionExecutionContext, requested?: unknown): Promise<number | null> {
  const explicit = intId(requested);
  if (explicit) {
    const { data } = await ctx.supabase
      .from('branches')
      .select('id')
      .eq('id', explicit)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    return data ? explicit : null;
  }
  if (ctx.branchId) return ctx.branchId;

  const { data } = await ctx.supabase
    .from('branches')
    .select('id, is_main')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .order('is_main', { ascending: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

/**
 * Comprueba que una fila pertenece a la organización del contexto y devuelve su
 * nombre (o `null` si no).
 *
 * Hace falta explícitamente porque **las claves foráneas de este esquema no
 * llevan organización**: `products_category_id_fkey`, `categories_parent_id_fkey`,
 * `product_suppliers_supplier_id_fkey` y `product_costs_supplier_id_fkey`
 * referencian solo el `id`. Y la RLS de `products` comprueba
 * `products.organization_id`, no la de la categoría a la que apunta.
 *
 * Sin esta comprobación, un `category_id` de otra organización —que además pasa
 * la lista blanca de campos, porque `category_id` SÍ está en el esquema de la
 * acción— se acepta sin más: el producto queda apuntando a una categoría ajena y
 * su nombre se filtra en cualquier listado que haga join. Lo encontró el tester
 * de F0 (fallo 2). `branch_id` ya se validaba; estos tres no.
 */
async function belongsToOrg(
  ctx: ActionExecutionContext,
  table: 'products' | 'categories' | 'suppliers',
  id: number,
  nameColumn = 'name'
): Promise<string | null> {
  const { data } = await ctx.supabase
    .from(table)
    .select(`id, ${nameColumn}`)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  return row ? String(row[nameColumn] ?? '') : null;
}

async function assertProductInOrg(ctx: ActionExecutionContext, productId: number): Promise<string | null> {
  return belongsToOrg(ctx, 'products', productId);
}

/**
 * Resuelve una referencia opcional (categoría, proveedor, categoría padre)
 * validando pertenencia.
 *
 * Devuelve `{ ok: false }` si el id apunta fuera de la organización: quien llama
 * debe abortar, no ignorarlo en silencio. Ignorarlo sería igual de seguro pero
 * mentiría al usuario sobre lo que se creó.
 */
async function resolveOptionalRef(
  ctx: ActionExecutionContext,
  table: 'categories' | 'suppliers',
  raw: unknown
): Promise<{ ok: true; id: number | null } | { ok: false; message: string }> {
  const id = intId(raw);
  if (id === null) return { ok: true, id: null };
  const name = await belongsToOrg(ctx, table, id);
  if (name === null) {
    return {
      ok: false,
      message:
        table === 'categories'
          ? 'Esa categoría no existe en esta organización.'
          : 'Ese proveedor no existe en esta organización.',
    };
  }
  return { ok: true, id };
}

// ─── Servicio ────────────────────────────────────────────────────────────────

class AIActionsService {
  /**
   * Convierte los campos de una acción en un objeto plano, descartando lo que
   * no está declarado en el esquema de esa acción. Es la lista blanca que
   * impide que el cliente cuele claves arbitrarias en el `insert`.
   */
  normalizeFields(type: AIActionType, fields: Array<{ name: string; value: unknown }>): Data {
    return sanitizeActionFields(type, fields);
  }

  /** Campos que faltan y son obligatorios, con su etiqueta legible. */
  missingRequiredFields(type: AIActionType, data: Data): string[] {
    return getActionSchema(type)
      .filter((f) => f.required && (data[f.name] === undefined || data[f.name] === null || data[f.name] === ''))
      .map((f) => f.label);
  }

  async executeAction(
    type: AIActionType,
    data: Data,
    ctx: ActionExecutionContext
  ): Promise<ActionResult> {
    const definition = getActionDefinition(type);

    if (!definition.available) {
      return {
        success: false,
        errorCode: 'not_implemented',
        message: definition.unavailableReason ?? 'Todavía no puedo hacer eso desde el chat.',
      };
    }

    const missing = this.missingRequiredFields(type, data);
    if (missing.length > 0) {
      return {
        success: false,
        errorCode: 'missing_fields',
        message: `Me falta ${missing.length === 1 ? 'un dato' : 'información'}: ${missing.join(', ')}.`,
      };
    }

    try {
      switch (type) {
        case 'create_product':
          return await this.createProduct(data, ctx);
        case 'update_product':
          return await this.updateProduct(data, ctx);
        case 'update_product_price':
          return await this.updateProductPrice(data, ctx);
        case 'update_product_stock':
          return await this.updateProductStock(data, ctx);
        case 'create_category':
          return await this.createCategory(data, ctx);
        case 'update_category':
          return await this.updateCategory(data, ctx);
        case 'create_supplier':
          return await this.createSupplier(data, ctx);
        case 'update_supplier':
          return await this.updateSupplier(data, ctx);
        case 'create_customer':
          return await this.createCustomer(data, ctx);
        case 'update_customer':
          return await this.updateCustomer(data, ctx);
        default:
          return {
            success: false,
            errorCode: 'not_implemented',
            message: 'Todavía no puedo hacer eso desde el chat.',
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[GO Assistant] Error ejecutando acción', { type, message });
      return { success: false, errorCode: 'execution_error', message };
    }
  }

  // ─── Catálogo ──────────────────────────────────────────────────────────────

  /**
   * Crear un producto toca CINCO tablas: `products`, `product_prices`,
   * `product_costs`, `product_suppliers` y `stock_levels`.
   *
   * La versión anterior las escribía una a una desde aquí y degradaba los
   * fallos a una nota entre paréntesis, devolviendo `success: true`: el usuario
   * creía tener un producto completo y tenía uno sin precio, con la acción
   * cerrada como `executed` y un `undo` (`delete_product`) que no contemplaba
   * las filas hijas.
   *
   * Ahora va entera en `assistant_create_product`, una sola transacción: o
   * entran las cinco o no entra ninguna (§17 del plan, "toda operación
   * multi-tabla es transaccional"). La RPC es SECURITY INVOKER, así que la RLS
   * del usuario sigue aplicando dentro, y valida la pertenencia de categoría,
   * proveedor y sucursal —las FK de este esquema no llevan organización—.
   */
  private async createProduct(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const name = str(data.name)!;
    const stock = num(data.stock);

    // La sucursal se resuelve aquí porque depende del contexto de la sesión
    // (sucursal activa → principal → primera), que la RPC no conoce.
    let branchId: number | null = null;
    if (stock !== null && stock > 0) {
      branchId = await resolveBranchId(ctx, data.branch_id);
      if (!branchId) {
        return {
          success: false,
          errorCode: 'no_branch',
          message:
            'No encontré una sucursal donde registrar el stock inicial. Dime en cuál, o lo creo sin existencias.',
        };
      }
    }

    const { data: created, error } = await ctx.supabase.rpc('assistant_create_product', {
      p_organization_id: ctx.organizationId,
      p_payload: {
        name,
        sku: str(data.sku),
        description: str(data.description),
        barcode: str(data.barcode),
        brand: str(data.brand),
        status: str(data.status) ?? 'active',
        category_id: intId(data.category_id),
        supplier_id: intId(data.supplier_id),
        branch_id: branchId,
        price: num(data.price),
        cost: num(data.cost),
        stock,
      },
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped) return mapped;
      throw new Error(error.message);
    }

    const row = created as { product_id: number; sku: string; name: string };
    return {
      success: true,
      message: `Producto "${row.name}" creado con código ${row.sku}`,
      data: row,
      entity: { type: 'product', id: row.product_id },
      undo: { kind: 'delete_product', payload: { product_id: row.product_id } },
    };
  }

  private async updateProduct(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const productId = intId(data.product_id);
    if (!productId) {
      return { success: false, errorCode: 'bad_input', message: 'No reconocí el producto que quieres actualizar.' };
    }

    const { data: before } = await ctx.supabase
      .from('products')
      .select('id, name, description, brand, category_id, status')
      .eq('id', productId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!before) {
      return { success: false, errorCode: 'not_found', message: 'Ese producto no existe en esta organización.' };
    }

    const categoryRef = await resolveOptionalRef(ctx, 'categories', data.category_id);
    if (!categoryRef.ok) {
      return { success: false, errorCode: 'not_found', message: categoryRef.message };
    }

    const update: Data = {};
    if (str(data.name)) update.name = str(data.name);
    if (data.description !== undefined) update.description = str(data.description);
    if (data.brand !== undefined) update.brand = str(data.brand);
    // `category_id` presente pero vacío significa "quítale la categoría".
    // Antes se ignoraba en silencio y el usuario recibía "Producto actualizado"
    // sin que pasara nada (problema 8 del qa-reviewer). El saneado descarta los
    // vacíos, así que la señal es la ausencia de la clave en `data` frente a su
    // presencia con valor nulo en la propuesta original.
    if (categoryRef.id !== null) {
      update.category_id = categoryRef.id;
    } else if (data.category_id === null) {
      update.category_id = null;
    }
    if (str(data.status)) update.status = str(data.status);

    if (Object.keys(update).length === 0) {
      return { success: false, errorCode: 'bad_input', message: 'No me dijiste qué cambiar del producto.' };
    }
    update.updated_at = new Date().toISOString();

    const { error } = await ctx.supabase
      .from('products')
      .update(update)
      .eq('id', productId)
      .eq('organization_id', ctx.organizationId);

    if (error) throw new Error(error.message);

    return {
      success: true,
      message: `Producto "${(before as { name: string }).name}" actualizado`,
      entity: { type: 'product', id: productId },
      undo: { kind: 'restore_product', payload: { product_id: productId, before: before as Data } },
    };
  }

  /**
   * Los precios tienen vigencia: se cierra el vigente (`effective_to = now`) y
   * se abre uno nuevo. Nunca se sobrescribe una fila de `product_prices`.
   *
   * Son DOS escrituras, y hacerlas sueltas desde aquí tenía un modo de fallo
   * grave: si se cerraba el anterior y el insert del nuevo fallaba, el producto
   * quedaba con CERO precios vigentes. `posService.ts:2176` lee el precio con
   * `product_prices!inner` filtrando `effective_to = null`, así que sin fila el
   * producto no vuelve de la consulta y **deja de poder venderse**. Un fallo del
   * asistente sacaba un producto del POS.
   *
   * Van juntas en `assistant_set_product_price`, una sola transacción.
   */
  private async updateProductPrice(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const productId = intId(data.product_id);
    const newPrice = num(data.new_price);
    if (!productId) {
      return { success: false, errorCode: 'bad_input', message: 'No reconocí el producto.' };
    }
    if (newPrice === null || newPrice < 0) {
      return { success: false, errorCode: 'bad_input', message: 'El precio nuevo no es un número válido.' };
    }

    const { data: result, error } = await ctx.supabase.rpc('assistant_set_product_price', {
      p_organization_id: ctx.organizationId,
      p_product_id: productId,
      p_price: newPrice,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped) return mapped;
      throw new Error(error.message);
    }

    const row = result as {
      product_name: string;
      previous_price: number | null;
      previous_price_id: number | null;
      new_price_id: number;
    };

    const antes = row.previous_price !== null ? ` (antes ${row.previous_price})` : '';
    return {
      success: true,
      message: `Precio de "${row.product_name}" actualizado a ${newPrice}${antes}`,
      entity: { type: 'product', id: productId },
      undo: {
        kind: 'revert_price',
        payload: {
          product_id: productId,
          new_price_id: row.new_price_id,
          previous_price_id: row.previous_price_id,
        },
      },
    };
  }

  /**
   * Fija las existencias en una sucursal. `stock_levels` tiene UNIQUE
   * (product_id, branch_id, lot_id) — pero `lot_id` admite NULL, y en Postgres
   * NULL no colisiona consigo mismo, así que un `upsert` con onConflict no
   * dedupe. Se busca la fila sin lote y se actualiza; si no existe, se inserta.
   */
  private async updateProductStock(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const productId = intId(data.product_id);
    const quantity = num(data.quantity);
    if (!productId) {
      return { success: false, errorCode: 'bad_input', message: 'No reconocí el producto.' };
    }
    if (quantity === null || quantity < 0) {
      return { success: false, errorCode: 'bad_input', message: 'La cantidad no es un número válido.' };
    }

    const productName = await assertProductInOrg(ctx, productId);
    if (!productName) {
      return { success: false, errorCode: 'not_found', message: 'Ese producto no existe en esta organización.' };
    }

    const branchId = await resolveBranchId(ctx, data.branch_id);
    if (!branchId) {
      return {
        success: false,
        errorCode: 'no_branch',
        message: 'No encontré la sucursal. El stock siempre va asociado a una sucursal: dime cuál.',
      };
    }

    const { data: existing } = await ctx.supabase
      .from('stock_levels')
      .select('id, qty_on_hand')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .is('lot_id', null)
      .maybeSingle();

    const before = (existing as { qty_on_hand: number } | null)?.qty_on_hand ?? 0;
    const now = new Date().toISOString();

    if (existing) {
      const { error } = await ctx.supabase
        .from('stock_levels')
        .update({ qty_on_hand: quantity, updated_at: now })
        .eq('id', (existing as { id: number }).id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await ctx.supabase
        .from('stock_levels')
        .insert({ product_id: productId, branch_id: branchId, qty_on_hand: quantity });
      if (error) throw new Error(error.message);
    }

    return {
      success: true,
      message: `Stock de "${productName}" fijado en ${quantity} (antes ${before})`,
      entity: { type: 'product', id: productId },
      undo: {
        kind: 'restore_stock',
        payload: { product_id: productId, branch_id: branchId, qty_on_hand: before },
      },
    };
  }

  private async createCategory(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const name = str(data.name)!;
    const baseSlug = slugify(name);

    // `categories_parent_id_fkey` no lleva organización: sin esto, una categoría
    // podía colgar de una categoría padre de otro tenant.
    const parentRef = await resolveOptionalRef(ctx, 'categories', data.parent_id);
    if (!parentRef.ok) {
      return { success: false, errorCode: 'not_found', message: parentRef.message };
    }

    let created: { id: number; name: string } | null = null;
    let lastError: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 4 && !created; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const { data: inserted, error } = await ctx.supabase
        .from('categories')
        .insert({
          organization_id: ctx.organizationId,
          name,
          slug,
          description: str(data.description),
          parent_id: parentRef.id,
        })
        .select('id, name')
        .single();
      if (!error) {
        created = inserted as { id: number; name: string };
        break;
      }
      lastError = error;
      if (!isUniqueViolation(error)) break;
    }

    if (!created) throw new Error(lastError?.message ?? 'No se pudo crear la categoría');

    return {
      success: true,
      message: `Categoría "${name}" creada`,
      data: created,
      entity: { type: 'category', id: created.id },
      undo: { kind: 'delete_category', payload: { category_id: created.id } },
    };
  }

  private async updateCategory(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const categoryId = intId(data.category_id);
    if (!categoryId) {
      return { success: false, errorCode: 'bad_input', message: 'No reconocí la categoría.' };
    }

    const { data: before } = await ctx.supabase
      .from('categories')
      .select('id, name, description')
      .eq('id', categoryId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!before) {
      return { success: false, errorCode: 'not_found', message: 'Esa categoría no existe en esta organización.' };
    }

    const update: Data = {};
    if (str(data.name)) update.name = str(data.name);
    if (data.description !== undefined) update.description = str(data.description);
    if (Object.keys(update).length === 0) {
      return { success: false, errorCode: 'bad_input', message: 'No me dijiste qué cambiar de la categoría.' };
    }
    update.updated_at = new Date().toISOString();

    const { error } = await ctx.supabase
      .from('categories')
      .update(update)
      .eq('id', categoryId)
      .eq('organization_id', ctx.organizationId);
    if (error) throw new Error(error.message);

    return {
      success: true,
      message: `Categoría "${(before as { name: string }).name}" actualizada`,
      entity: { type: 'category', id: categoryId },
      undo: { kind: 'restore_category', payload: { category_id: categoryId, before: before as Data } },
    };
  }

  // ─── Terceros ──────────────────────────────────────────────────────────────

  private async createSupplier(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const name = str(data.name)!;

    const { data: supplier, error } = await ctx.supabase
      .from('suppliers')
      .insert({
        organization_id: ctx.organizationId,
        name,
        nit: str(data.nit),
        // La columna es `contact`, no `contact_name`: escribir `contact_name`
        // hacía fallar esta acción siempre (C3).
        contact: str(data.contact),
        email: str(data.email),
        phone: str(data.phone),
        address: str(data.address),
        city: str(data.city),
      })
      .select('id, name')
      .single();

    if (error) throw new Error(error.message);

    const created = supplier as { id: number; name: string };
    return {
      success: true,
      message: `Proveedor "${name}" creado`,
      data: created,
      entity: { type: 'supplier', id: created.id },
      undo: { kind: 'delete_supplier', payload: { supplier_id: created.id } },
    };
  }

  private async updateSupplier(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const supplierId = intId(data.supplier_id);
    if (!supplierId) {
      return { success: false, errorCode: 'bad_input', message: 'No reconocí el proveedor.' };
    }

    const { data: before } = await ctx.supabase
      .from('suppliers')
      .select('id, name, contact, email, phone, address')
      .eq('id', supplierId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!before) {
      return { success: false, errorCode: 'not_found', message: 'Ese proveedor no existe en esta organización.' };
    }

    const update: Data = {};
    if (str(data.name)) update.name = str(data.name);
    if (data.contact !== undefined) update.contact = str(data.contact);
    if (data.email !== undefined) update.email = str(data.email);
    if (data.phone !== undefined) update.phone = str(data.phone);
    if (data.address !== undefined) update.address = str(data.address);
    if (Object.keys(update).length === 0) {
      return { success: false, errorCode: 'bad_input', message: 'No me dijiste qué cambiar del proveedor.' };
    }
    update.updated_at = new Date().toISOString();

    const { error } = await ctx.supabase
      .from('suppliers')
      .update(update)
      .eq('id', supplierId)
      .eq('organization_id', ctx.organizationId);
    if (error) throw new Error(error.message);

    return {
      success: true,
      message: `Proveedor "${(before as { name: string }).name}" actualizado`,
      entity: { type: 'supplier', id: supplierId },
      undo: { kind: 'restore_supplier', payload: { supplier_id: supplierId, before: before as Data } },
    };
  }

  private async createCustomer(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const fullName = str(data.full_name)!;
    const { first_name, last_name } = splitName(fullName);

    // `full_name`, `doc_type` y `doc_number` son GENERATED ALWAYS: se escriben
    // los campos base (`first_name`/`last_name`, `identification_*`).
    //
    // La versión anterior fijaba `fiscal_municipality_id` a un UUID literal de
    // otra organización. Se deja NULL: los datos fiscales se completan en la
    // ficha del cliente o al facturar, no adivinándolos aquí.
    const { data: customer, error } = await ctx.supabase
      .from('customers')
      .insert({
        organization_id: ctx.organizationId,
        branch_id: ctx.branchId ?? null,
        first_name,
        last_name,
        email: str(data.email),
        phone: str(data.phone),
        identification_type: str(data.doc_type),
        identification_number: str(data.doc_number),
        address: str(data.address),
        city: str(data.city),
      })
      .select('id, full_name')
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const byEmail = String(error.message ?? '').includes('email');
        return {
          success: false,
          errorCode: 'duplicate',
          message: byEmail
            ? 'Ya existe un cliente con ese correo en esta organización.'
            : 'Ya existe un cliente con ese número de documento en esta organización.',
        };
      }
      throw new Error(error.message);
    }

    const created = customer as { id: string; full_name: string | null };
    return {
      success: true,
      message: `Cliente "${created.full_name ?? fullName}" creado`,
      data: created,
      entity: { type: 'customer', id: created.id },
      undo: { kind: 'delete_customer', payload: { customer_id: created.id } },
    };
  }

  private async updateCustomer(data: Data, ctx: ActionExecutionContext): Promise<ActionResult> {
    const customerId = str(data.customer_id);
    if (!customerId) {
      return { success: false, errorCode: 'bad_input', message: 'No reconocí el cliente.' };
    }

    const { data: before } = await ctx.supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone, address, city, full_name')
      .eq('id', customerId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!before) {
      return { success: false, errorCode: 'not_found', message: 'Ese cliente no existe en esta organización.' };
    }

    const update: Data = {};
    const newFullName = str(data.full_name);
    if (newFullName) {
      // `full_name` es GENERATED ALWAYS: escribirlo lanzaba error 428C9. Se
      // traduce a los campos base.
      const parts = splitName(newFullName);
      update.first_name = parts.first_name;
      update.last_name = parts.last_name;
    }
    if (data.email !== undefined) update.email = str(data.email);
    if (data.phone !== undefined) update.phone = str(data.phone);
    if (data.address !== undefined) update.address = str(data.address);
    if (data.city !== undefined) update.city = str(data.city);

    if (Object.keys(update).length === 0) {
      return { success: false, errorCode: 'bad_input', message: 'No me dijiste qué cambiar del cliente.' };
    }
    update.updated_at = new Date().toISOString();

    const { error } = await ctx.supabase
      .from('customers')
      .update(update)
      .eq('id', customerId)
      .eq('organization_id', ctx.organizationId);

    if (error) {
      if (isUniqueViolation(error)) {
        return {
          success: false,
          errorCode: 'duplicate',
          message: 'Otro cliente de esta organización ya usa ese correo o documento.',
        };
      }
      throw new Error(error.message);
    }

    const beforeRow = before as { full_name: string | null };
    return {
      success: true,
      message: `Cliente "${beforeRow.full_name ?? customerId}" actualizado`,
      entity: { type: 'customer', id: customerId },
      undo: { kind: 'restore_customer', payload: { customer_id: customerId, before: before as Data } },
    };
  }

  /** Descripción legible de la acción, para la tarjeta y para la voz. */
  getActionDescription(type: AIActionType): string {
    return ACTION_CATALOG[type]?.label ?? type;
  }
}

export const aiActionsService = new AIActionsService();
export default AIActionsService;
