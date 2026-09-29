/**
 * ¿La pestaña «Producción» tiene algo que mostrar? (PRODUCTO-RECETAS-Y-SUBSECCIONES.md §3:
 * compuesto, se usa como ingrediente o tiene órdenes). Sin red: con lo que el
 * detalle ya sabe del producto. El servidor lo confirma en
 * `fn_producto_produccion_resumen.mostrar` (incluye «usado como ingrediente»).
 */
export function debeMostrarPestanaProduccion(p: {
  is_composite?: boolean | null;
  production_type?: string | null;
  product_type?: string | null;
}): boolean {
  if (p.product_type === 'service') return false;
  return p.is_composite === true || p.production_type === 'preparation' || p.production_type === 'composite';
}
