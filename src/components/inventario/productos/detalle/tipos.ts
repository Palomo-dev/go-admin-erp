/**
 * Tipos del detalle de producto (`/app/inventario/productos/[id]`).
 *
 * Pestañas (Figma `04 Inventario › Producto — …`, PARIDAD-DETALLE-PRODUCTO):
 * Resumen · Inventario (Stock · Lotes · Kardex · Seriales) · Precios y costos ·
 * Variantes y modificadores · Producción (B5, solo si tiene contenido) ·
 * Imágenes · Proveedores y etiquetas · Notas · Historial. Van en la URL
 * (`?tab=inventario&sub=seriales`; Producción guarda la suya en `?psub=`).
 */

export type PestanaDetalle =
  | 'resumen'
  | 'inventario'
  | 'precios'
  | 'variantes'
  | 'produccion'
  | 'imagenes'
  | 'proveedores'
  | 'notas'
  | 'historial';

export const PESTANAS_DETALLE: readonly PestanaDetalle[] = [
  'resumen',
  'inventario',
  'precios',
  'variantes',
  'produccion',
  'imagenes',
  'proveedores',
  'notas',
  'historial',
];

export type SubInventario = 'stock' | 'lotes' | 'kardex' | 'seriales';
export type SubVariantes = 'variantes' | 'modificadores';
export type SubProveedores = 'proveedores' | 'etiquetas';

export const SUBPESTANAS: Readonly<Partial<Record<PestanaDetalle, readonly string[]>>> = {
  inventario: ['stock', 'lotes', 'kardex', 'seriales'],
  variantes: ['variantes', 'modificadores'],
  proveedores: ['proveedores', 'etiquetas'],
};

export function esPestana(v: string | null | undefined): v is PestanaDetalle {
  return !!v && (PESTANAS_DETALLE as readonly string[]).includes(v);
}

/** Sub-pestaña válida para la pestaña (o la primera). */
export function subPestanaValida(tab: PestanaDetalle, sub: string | null | undefined): string | null {
  const opciones = SUBPESTANAS[tab];
  if (!opciones) return null;
  return sub && opciones.includes(sub) ? sub : opciones[0];
}

export type EstadoProducto = 'active' | 'inactive' | 'discontinued' | 'deleted';

export interface ProveedorDeProducto {
  id: number;
  supplier_id: number;
  cost: number | string | null;
  is_preferred: boolean | null;
  supplier_sku: string | null;
  lead_time_days: number | null;
  min_order_qty: number | string | null;
  notes?: string | null;
  supplier?: { id: number; uuid?: string | null; name: string; nit: string | null } | null;
}

export interface VarianteDeProducto {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  barcode: string | null;
  status: EstadoProducto | string;
  variant_data: Record<string, string> | null;
  track_stock: boolean;
}

/** Fila de `products` con las relaciones que carga la página del detalle. */
export interface ProductoDetalle {
  id: number;
  uuid: string;
  organization_id: number;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  status: EstadoProducto | string;
  category_id: number | null;
  categories?: { id: number; name: string } | null;
  unit_code: string | null;
  station: string | null;
  product_type: 'product' | 'service' | string | null;
  brand: string | null;
  reference: string | null;
  track_stock: boolean;
  track_serial: boolean | null;
  serial_pattern: string | null;
  auto_generate_serial: boolean | null;
  warranty_months: number | null;
  is_parent: boolean | null;
  is_composite: boolean | null;
  /** Producción (B5): `preparation` · `composite` · … (decide si se ve la pestaña Producción). */
  production_type?: string | null;
  track_lots?: boolean | null;
  parent_product_id: number | null;
  variant_data: Record<string, string> | null;
  weight_kg: number | string | null;
  length_cm: number | string | null;
  width_cm: number | string | null;
  height_cm: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  children?: VarianteDeProducto[];
  product_suppliers?: ProveedorDeProducto[];
  product_tax_relations?: { tax_id: string; organization_taxes: { id: string; name: string; rate: number | string } | null }[];
  units?: { code: string; name: string } | null;
  /** Cómo se vende (PRODUCTOS-POR-PESO-BASCULA.md): el precio es por `unit_code` (por kg). */
  sale_mode?: 'unit' | 'weight' | 'measure' | string | null;
  qty_decimals?: number | null;
  price_ref_qty?: number | string | null;
  price_ref_unit_code?: string | null;
  min_sale_qty?: number | string | null;
  require_scale?: boolean | null;
}
