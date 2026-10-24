import { supabase } from '@/lib/supabase/config';
import { claveProducto } from './identProducto';
import type { ProductoDetalle } from './tipos';

const SELECT_PRODUCTO = `
      id, uuid, organization_id, sku, name, description, barcode, status, category_id, unit_code, station,
      product_type, brand, reference, track_stock, track_serial, serial_pattern, auto_generate_serial,
      warranty_months, is_parent, is_composite, production_type, track_lots, parent_product_id, variant_data, weight_kg, length_cm,
      width_cm, height_cm, created_at, updated_at,
      sale_mode, qty_decimals, price_ref_qty, price_ref_unit_code, min_sale_qty, require_scale,
      categories(id, name),
      children:products(id, uuid, sku, name, barcode, status, variant_data, track_stock),
      product_suppliers(id, supplier_id, cost, is_preferred, supplier_sku, lead_time_days, min_order_qty, notes,
        supplier:suppliers(id, uuid, name, nit)),
      product_tax_relations(tax_id, organization_taxes(id, name, rate))
    `;

/**
 * Producto del detalle por id numérico o uuid, filtrado por la organización
 * de la sesión. Un identificador que no es ni número ni uuid devuelve null
 * (la ficha muestra «no encontrado») sin consultar. Precios, costos, stock,
 * conteos y permisos salen de `fn_producto_resumen` (una sola RPC).
 */
export async function cargarProductoDetalle(organizationId: number, ident: string): Promise<ProductoDetalle | null> {
  const clave = claveProducto(ident);
  if (!clave) return null;
  const base = supabase.from('products').select(SELECT_PRODUCTO).eq('organization_id', organizationId);
  const filtrada = clave.campo === 'id' ? base.eq('id', clave.valor) : base.eq('uuid', clave.valor);
  const { data, error } = await filtrada.maybeSingle();
  if (error) throw error;
  return (data as unknown as ProductoDetalle) ?? null;
}
