/**
 * GO Assistant — catálogo de acciones.
 *
 * Fuente única de verdad sobre QUÉ puede hacer el asistente: riesgo, permiso
 * requerido, nivel de capacidad mínimo, módulo del plan y —lo más importante en
 * esta fase— si la acción está realmente implementada contra el esquema real.
 *
 * Contexto (C3 del plan, verificado contra `information_schema` el 2026-09-09):
 * el asistente declaraba 16 acciones y ninguna funcionaba.
 *
 *   - `inventory`, `orders`, `order_items` NO EXISTEN (el stock vive en
 *     `stock_levels`, las ventas en `sales`/`sale_items`).
 *   - `products.price`, `products.cost`, `products.is_active` NO EXISTEN
 *     (precios en `product_prices`, costos en `product_costs`, y la columna es
 *     `status text check (active|inactive|discontinued|deleted)`).
 *   - `categories.slug` es NOT NULL sin default → `create_category` fallaba.
 *   - `suppliers` tiene `contact`, no `contact_name` → `create_supplier` fallaba.
 *   - `customers.full_name`, `doc_type` y `doc_number` son GENERATED ALWAYS
 *     → `update_customer` fallaba al intentar escribir `full_name`.
 *
 * Lo que no está implementado contra el esquema real se marca `available:false`
 * y el asistente lo dice ("todavía no puedo hacer eso") en vez de reventar con
 * un error de Postgres delante del usuario. Se implementan en F2 apoyándose en
 * los servicios que ya conocen el esquema (posService, purchaseOrderService,
 * adjustmentService…), nunca con SQL propio.
 */

import type { CapabilityLevel } from './capabilities';

export type AIActionType =
  | 'create_product'
  | 'update_product'
  | 'update_product_stock'
  | 'update_product_price'
  | 'create_customer'
  | 'update_customer'
  | 'create_order'
  | 'update_order_status'
  | 'create_purchase_order'
  | 'update_purchase_order'
  | 'create_stock_adjustment'
  | 'create_stock_transfer'
  | 'create_category'
  | 'update_category'
  | 'create_supplier'
  | 'update_supplier';

export type ActionRisk = 'low' | 'medium' | 'high';

export interface ActionFieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'date' | 'boolean';
  value: unknown;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  placeholder?: string;
  readonly?: boolean;
}

export interface ActionDefinition {
  type: AIActionType;
  label: string;
  /** Cómo se le describe al modelo. */
  description: string;
  risk: ActionRisk;
  /** Códigos de `permissions`. Basta uno. Vacío = solo exige el nivel. */
  permissions: readonly string[];
  minLevel: Exclude<CapabilityLevel, 'off'>;
  /** Código en `organization_modules`. `null` = no depende de un módulo. */
  requiredModule: string | null;
  /** `false` = declarada pero no implementada contra el esquema real. */
  available: boolean;
  /** Por qué no está disponible, en español, decible al usuario. */
  unavailableReason?: string;
  fields: readonly ActionFieldDef[];
}

const DOC_TYPE_OPTIONS = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'NIT', label: 'NIT' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASSPORT', label: 'Pasaporte' },
];

/** Motivo estándar para lo que F2 implementará vía servicios existentes. */
const PENDING_F2 = (que: string) =>
  `Todavía no puedo ${que} desde el chat. Puedo explicarte cómo hacerlo en el sistema.`;

export const ACTION_CATALOG: Readonly<Record<AIActionType, ActionDefinition>> = {
  // ─── Catálogo ──────────────────────────────────────────────────────────────
  create_product: {
    type: 'create_product',
    label: 'Crear producto',
    description:
      'Crea un producto en el catálogo. El precio de venta y el costo se guardan con vigencia; el stock inicial requiere sucursal.',
    risk: 'medium',
    permissions: ['inventory.create', 'inventory_management', 'product_management'],
    minLevel: 'write_low',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'name', label: 'Nombre del producto', type: 'text', value: '', required: true, placeholder: 'Ej: Camiseta Azul XL' },
      { name: 'sku', label: 'SKU/Código', type: 'text', value: '', required: false, placeholder: 'Se genera si lo dejas vacío' },
      { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false },
      { name: 'barcode', label: 'Código de barras', type: 'text', value: '', required: false },
      { name: 'brand', label: 'Marca', type: 'text', value: '', required: false },
      { name: 'price', label: 'Precio de venta', type: 'number', value: 0, required: true, min: 0 },
      { name: 'cost', label: 'Costo', type: 'number', value: 0, required: false, min: 0 },
      { name: 'stock', label: 'Stock inicial', type: 'number', value: 0, required: false, min: 0 },
      { name: 'category_id', label: 'Categoría', type: 'select', value: '', required: false, options: [] },
      { name: 'supplier_id', label: 'Proveedor', type: 'select', value: '', required: false, options: [] },
      {
        name: 'status',
        label: 'Estado',
        type: 'select',
        value: 'active',
        required: false,
        options: [
          { value: 'active', label: 'Activo' },
          { value: 'inactive', label: 'Inactivo' },
        ],
      },
    ],
  },
  update_product: {
    type: 'update_product',
    label: 'Actualizar producto',
    description: 'Cambia nombre, descripción, marca, categoría o estado de un producto existente.',
    risk: 'medium',
    permissions: ['inventory.edit', 'inventory_management', 'product_management'],
    minLevel: 'write_low',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'product_id', label: 'ID del producto', type: 'text', value: '', required: true, readonly: true },
      { name: 'name', label: 'Nombre', type: 'text', value: '', required: false },
      { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false },
      { name: 'brand', label: 'Marca', type: 'text', value: '', required: false },
      { name: 'category_id', label: 'Categoría', type: 'select', value: '', required: false, options: [] },
      {
        name: 'status',
        label: 'Estado',
        type: 'select',
        value: '',
        required: false,
        options: [
          { value: 'active', label: 'Activo' },
          { value: 'inactive', label: 'Inactivo' },
          { value: 'discontinued', label: 'Descontinuado' },
        ],
      },
    ],
  },
  update_product_price: {
    type: 'update_product_price',
    label: 'Cambiar precio',
    description:
      'Cambia el precio de venta vigente de un producto. Cierra el precio anterior y abre uno nuevo (histórico de precios).',
    risk: 'medium',
    permissions: ['inventory.edit', 'inventory_management', 'product_management'],
    minLevel: 'write_low',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'product_id', label: 'ID del producto', type: 'text', value: '', required: true, readonly: true },
      { name: 'product_name', label: 'Producto', type: 'text', value: '', required: false, readonly: true },
      { name: 'current_price', label: 'Precio actual', type: 'number', value: 0, required: false, readonly: true },
      { name: 'new_price', label: 'Nuevo precio', type: 'number', value: 0, required: true, min: 0 },
    ],
  },
  update_product_stock: {
    type: 'update_product_stock',
    label: 'Ajustar stock',
    description:
      'Fija las existencias de un producto en una sucursal. Tiene impacto contable: siempre pide confirmación.',
    risk: 'high',
    permissions: ['inventory.adjust', 'inventory_management'],
    minLevel: 'write_full',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'product_id', label: 'ID del producto', type: 'text', value: '', required: true, readonly: true },
      { name: 'product_name', label: 'Producto', type: 'text', value: '', required: false, readonly: true },
      { name: 'branch_id', label: 'Sucursal', type: 'select', value: '', required: true, options: [] },
      { name: 'quantity', label: 'Nueva cantidad', type: 'number', value: 0, required: true, min: 0 },
      { name: 'reason', label: 'Motivo del ajuste', type: 'text', value: '', required: true, placeholder: 'Ej: Conteo físico' },
    ],
  },
  create_category: {
    type: 'create_category',
    label: 'Crear categoría',
    description: 'Crea una categoría de productos.',
    risk: 'medium',
    permissions: ['inventory.create', 'inventory_management', 'product_management'],
    minLevel: 'write_low',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'name', label: 'Nombre', type: 'text', value: '', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false },
      { name: 'parent_id', label: 'Categoría padre', type: 'select', value: '', required: false, options: [] },
    ],
  },
  update_category: {
    type: 'update_category',
    label: 'Actualizar categoría',
    description: 'Cambia el nombre o la descripción de una categoría.',
    risk: 'medium',
    permissions: ['inventory.edit', 'inventory_management', 'product_management'],
    minLevel: 'write_low',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'category_id', label: 'ID de categoría', type: 'text', value: '', required: true, readonly: true },
      { name: 'name', label: 'Nombre', type: 'text', value: '', required: false },
      { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false },
    ],
  },

  // ─── Terceros ──────────────────────────────────────────────────────────────
  create_supplier: {
    type: 'create_supplier',
    label: 'Crear proveedor',
    description: 'Crea un proveedor con sus datos de contacto y NIT.',
    risk: 'medium',
    permissions: ['inventory.create', 'inventory_management'],
    minLevel: 'write_low',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'name', label: 'Nombre / razón social', type: 'text', value: '', required: true },
      { name: 'nit', label: 'NIT', type: 'text', value: '', required: false },
      { name: 'contact', label: 'Persona de contacto', type: 'text', value: '', required: false },
      { name: 'email', label: 'Email', type: 'text', value: '', required: false },
      { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
      { name: 'address', label: 'Dirección', type: 'text', value: '', required: false },
      { name: 'city', label: 'Ciudad', type: 'text', value: '', required: false },
    ],
  },
  update_supplier: {
    type: 'update_supplier',
    label: 'Actualizar proveedor',
    description: 'Cambia los datos de contacto de un proveedor.',
    risk: 'medium',
    permissions: ['inventory.edit', 'inventory_management'],
    minLevel: 'write_low',
    requiredModule: 'inventory',
    available: true,
    fields: [
      { name: 'supplier_id', label: 'ID del proveedor', type: 'text', value: '', required: true, readonly: true },
      { name: 'name', label: 'Nombre', type: 'text', value: '', required: false },
      { name: 'contact', label: 'Persona de contacto', type: 'text', value: '', required: false },
      { name: 'email', label: 'Email', type: 'text', value: '', required: false },
      { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
      { name: 'address', label: 'Dirección', type: 'text', value: '', required: false },
    ],
  },
  create_customer: {
    type: 'create_customer',
    label: 'Crear cliente',
    description: 'Crea un cliente con nombre, documento y datos de contacto.',
    risk: 'medium',
    permissions: ['crm.customers.create', 'customer_management', 'crm.contacts.create'],
    minLevel: 'write_low',
    requiredModule: null,
    available: true,
    fields: [
      { name: 'full_name', label: 'Nombre completo', type: 'text', value: '', required: true },
      { name: 'email', label: 'Email', type: 'text', value: '', required: false, placeholder: 'correo@ejemplo.com' },
      { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
      { name: 'doc_type', label: 'Tipo de documento', type: 'select', value: '', required: false, options: DOC_TYPE_OPTIONS },
      { name: 'doc_number', label: 'Número de documento', type: 'text', value: '', required: false },
      { name: 'address', label: 'Dirección', type: 'text', value: '', required: false },
      { name: 'city', label: 'Ciudad', type: 'text', value: '', required: false },
    ],
  },
  update_customer: {
    type: 'update_customer',
    label: 'Actualizar cliente',
    description: 'Cambia los datos de contacto de un cliente.',
    risk: 'medium',
    permissions: ['crm.customers.edit', 'customer_management', 'crm.contacts.edit'],
    minLevel: 'write_low',
    requiredModule: null,
    available: true,
    fields: [
      { name: 'customer_id', label: 'ID del cliente', type: 'text', value: '', required: true, readonly: true },
      { name: 'full_name', label: 'Nombre completo', type: 'text', value: '', required: false },
      { name: 'email', label: 'Email', type: 'text', value: '', required: false },
      { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
      { name: 'address', label: 'Dirección', type: 'text', value: '', required: false },
      { name: 'city', label: 'Ciudad', type: 'text', value: '', required: false },
    ],
  },

  // ─── No implementadas contra el esquema real (F2) ──────────────────────────
  create_order: {
    type: 'create_order',
    label: 'Crear venta',
    description: 'Registra una venta con sus líneas, impuestos y pago.',
    risk: 'high',
    permissions: ['pos.create'],
    minLevel: 'write_full',
    requiredModule: 'pos',
    available: false,
    unavailableReason:
      'Para registrar una venta uso la herramienta `registrar_venta`, no esta accion.',
    fields: [],
  },
  update_order_status: {
    type: 'update_order_status',
    label: 'Cambiar estado de venta',
    description: 'Cambia el estado de una venta existente.',
    risk: 'high',
    permissions: ['pos.create'],
    minLevel: 'write_full',
    requiredModule: 'pos',
    available: false,
    unavailableReason: PENDING_F2('cambiar el estado de una venta'),
    fields: [],
  },
  create_purchase_order: {
    type: 'create_purchase_order',
    label: 'Crear orden de compra',
    description: 'Crea una orden de compra a un proveedor.',
    risk: 'high',
    permissions: ['inventory.create', 'inventory_management'],
    minLevel: 'write_full',
    requiredModule: 'inventory',
    available: false,
    unavailableReason: PENDING_F2('crear órdenes de compra'),
    fields: [],
  },
  update_purchase_order: {
    type: 'update_purchase_order',
    label: 'Actualizar orden de compra',
    description: 'Cambia el estado de una orden de compra.',
    risk: 'high',
    permissions: ['inventory.edit', 'inventory_management'],
    minLevel: 'write_full',
    requiredModule: 'inventory',
    available: false,
    unavailableReason: PENDING_F2('actualizar órdenes de compra'),
    fields: [],
  },
  create_stock_adjustment: {
    type: 'create_stock_adjustment',
    label: 'Ajuste de inventario',
    description: 'Registra un ajuste de inventario con su documento y movimiento.',
    risk: 'high',
    permissions: ['inventory.adjust', 'inventory_management'],
    minLevel: 'write_full',
    requiredModule: 'inventory',
    available: false,
    unavailableReason:
      'Para ajustar inventario uso la herramienta `crear_ajuste_inventario`, no esta accion.',
    fields: [],
  },
  create_stock_transfer: {
    type: 'create_stock_transfer',
    label: 'Traslado entre sucursales',
    description: 'Traslada existencias de una sucursal a otra.',
    risk: 'high',
    permissions: ['inventory.transfer', 'inventory_management'],
    minLevel: 'write_full',
    requiredModule: 'inventory',
    available: false,
    unavailableReason: PENDING_F2('hacer traslados entre sucursales'),
    fields: [],
  },
};

// ─── Saneado de valores ──────────────────────────────────────────────────────

/**
 * Convierte un valor entrante al tipo que el esquema declara, o lo descarta.
 *
 * El filtro anterior comprobaba el NOMBRE del campo y aceptaba cualquier valor.
 * El tester de F0 lo demostró: `String({})` acaba en la base como
 * `'[object Object]'`, `String([1,2])` como `'1,2'`, y `Number(true)` es `1`, o
 * sea que `category_id: true` apuntaba a la categoría 1. La tarjeta nunca manda
 * eso, pero un cliente hostil sí.
 *
 * Devuelve `undefined` cuando el valor debe descartarse.
 */
export function sanitizeFieldValue(field: ActionFieldDef, value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  // Nada de objetos ni arrays: no hay ningún campo del catálogo que los admita.
  if (typeof value === 'object') return undefined;

  switch (field.type) {
    case 'number': {
      if (typeof value === 'boolean') return undefined;
      const n = Number(value);
      if (!Number.isFinite(n)) return undefined;
      if (field.min !== undefined && n < field.min) return undefined;
      if (field.max !== undefined && n > field.max) return undefined;
      return n;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    }
    case 'select': {
      if (typeof value === 'boolean') return undefined;
      const s = String(value).trim();
      if (s === '') return undefined;
      // Si el campo trae opciones fijas (no dinámicas), el valor debe ser una
      // de ellas. Los que se rellenan por API (categorías, sucursales…) llegan
      // con `options: []` y su pertenencia la valida el ejecutor contra la
      // organización.
      if (field.options && field.options.length > 0) {
        return field.options.some((o) => o.value === s) ? s : undefined;
      }
      return s;
    }
    default: {
      if (typeof value === 'boolean') return undefined;
      const s = String(value).trim();
      return s === '' ? undefined : s;
    }
  }
}

/**
 * Lista blanca compartida por `/chat` (al proponer) y `/execute-action` (al
 * confirmar). Estaba duplicada en los dos sitios y divergía; el tester lo llamó
 * "el filtro gemelo".
 *
 * `editableOnly` descarta además los campos `readonly`, que son los que
 * identifican SOBRE QUÉ se actúa (`product_id`, `customer_id`…). La tarjeta los
 * pinta deshabilitados pero los reenvía; aceptarlos del cliente permitía
 * cambiar el registro entre lo que el usuario vio y lo que se ejecutó.
 */
export function sanitizeActionFields(
  type: AIActionType,
  incoming: Array<{ name?: unknown; value?: unknown }>,
  options: { editableOnly?: boolean } = {}
): Record<string, unknown> {
  const schema = new Map(
    getActionSchema(type)
      .filter((f) => !options.editableOnly || !f.readonly)
      .map((f) => [f.name, f])
  );

  const result: Record<string, unknown> = {};
  for (const item of incoming) {
    if (typeof item?.name !== 'string') continue;
    const field = schema.get(item.name);
    if (!field) continue;
    const clean = sanitizeFieldValue(field, item.value);
    if (clean !== undefined) result[item.name] = clean;
  }
  return result;
}

export const ALL_ACTION_TYPES = Object.keys(ACTION_CATALOG) as AIActionType[];

export function isActionType(value: unknown): value is AIActionType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACTION_CATALOG, value);
}

export function getActionDefinition(type: AIActionType): ActionDefinition {
  return ACTION_CATALOG[type];
}

/** Copia mutable del esquema de campos (los del catálogo son de solo lectura). */
export function getActionSchema(type: AIActionType): ActionFieldDef[] {
  return ACTION_CATALOG[type].fields.map((f) => ({
    ...f,
    options: f.options ? f.options.map((o) => ({ ...o })) : undefined,
  }));
}

/**
 * Lista negra permanente (§9.4). Ninguna acción con estos nombres puede
 * registrarse jamás. `src/__tests__/guardrails.test.ts` falla si alguien lo
 * intenta.
 */
export const FORBIDDEN_ACTIONS: readonly string[] = [
  'delete_organization',
  'delete_member',
  'delete_profile',
  'delete_user',
  'update_organization_owner',
  'change_user_role',
  'change_user_role_to_admin',
  'update_permissions',
  'update_subscription',
  'update_plan',
  'grant_ai_credits',
  'read_provider_credentials',
  'write_provider_credentials',
  'access_other_organization',
  'execute_sql',
];
