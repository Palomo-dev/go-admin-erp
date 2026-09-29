import { supabase } from '@/lib/supabase/config';
import type { ProductoDetalle } from './tipos';

/**
 * Producto del detalle por uuid, filtrado por la organización de la sesión.
 * Solo datos del registro y sus relaciones directas: precios, costos, stock,
 * conteos y permisos salen de `fn_producto_resumen` (una sola RPC).
 */
export async function cargarProductoDetalle(organizationId: number, uuid: string): Promise<ProductoDetalle | null> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id, uuid, organization_id, sku, name, description, barcode, status, category_id, unit_code, station,
      product_type, brand, reference, track_stock, track_serial, serial_pattern, auto_generate_serial,
      warranty_months, is_parent, is_composite, parent_product_id, variant_data, weight_kg, length_cm,
      width_cm, height_cm, created_at, updated_at,
      sale_mode, qty_decimals, price_ref_qty, price_ref_unit_code, min_sale_qty, require_scale,
      categories(id, name),
      children:products(id, uuid, sku, name, barcode, status, variant_data, track_stock),
      product_suppliers(id, supplier_id, cost, is_preferred, supplier_sku, lead_time_days, min_order_qty, notes,
        supplier:suppliers(id, uuid, name, nit)),
      product_tax_relations(tax_id, organization_taxes(id, name, rate))
    `,
    )
    .eq('uuid', uuid)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProductoDetalle) ?? null;
}
