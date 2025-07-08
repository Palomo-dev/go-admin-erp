/**
 * Archivo índice para exportar todos los componentes del módulo de órdenes de compra
 */

// Re-exportar componentes - aseguramos que sean exportaciones limpias sin extensiones
export { FiltrosOrdenesCompra } from './FiltrosOrdenesCompra';
export { ListaOrdenesCompra } from './ListaOrdenesCompra';
export { default as OrdenesCompra } from './OrdenesCompra';

// Exportamos componentes adicionales (si existen)
// Como pueden no tener exportaciones por defecto, las comentamos para evitar errores
// export { DetalleOrdenCompra } from './DetalleOrdenCompra';
// export { FormularioOrdenCompra } from './FormularioOrdenCompra';

// Re-exportar tipos
export * from './types';
