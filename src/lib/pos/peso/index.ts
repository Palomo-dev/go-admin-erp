/**
 * Productos por peso y por medida en el POS (docs/design/PRODUCTOS-POR-PESO-BASCULA.md).
 * Lógica pura: cómo se vende, decimales y unidad, precio «cada tanto»,
 * validación de la pesada y redondeo al cobrar.
 */
export * from './modoVenta';
export * from './precioReferencia';
export * from './pesada';
export * from './cobroRedondeo';
// La conversión de peso es una sola, compartida con el ticket del agente.
export { GRAMOS_POR_UNIDAD, convertirPeso, pesoEnUnidad, pesoLegible, precioVisiblePeso, unidadPeso, type UnidadPeso } from '@printing/peso';
