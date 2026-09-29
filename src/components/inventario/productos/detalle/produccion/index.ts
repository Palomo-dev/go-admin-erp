/**
 * Detalle de producto › Producción (B5). Contrato para B7, que la monta en
 * `DetalleProducto.tsx`:
 *
 *   <PestanaProduccion producto={producto} permisos={permisos} />
 *
 * `producto` es la fila del detalle (`ProductoDetalle` sirve: usa id, name,
 * sku, unit_code y track_stock). La pestaña lee su propio resumen
 * (`fn_producto_produccion_resumen`) y guarda su sub-pestaña en `?psub=`.
 * `debeMostrarPestanaProduccion` dice si tiene contenido (compuesto, con
 * receta, ingrediente de otra receta u órdenes).
 */
export { PestanaProduccion, PARAM_SUB_PRODUCCION, type PestanaProduccionProps, type ProductoPestanaProduccion, type SubProduccion } from './PestanaProduccion';
export { debeMostrarPestanaProduccion } from './mostrar';
