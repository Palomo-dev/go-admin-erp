/**
 * Básculas del POS (docs/design/PRODUCTOS-POR-PESO-BASCULA.md, fase 3):
 * intérprete de protocolos, detector de estabilidad, transportes (Desktop,
 * Web Serial, manual), lector y la pesada que se agrega al carrito.
 * Todo puro salvo los transportes, que envuelven APIs del navegador/Desktop.
 */
export * from './tipos';
export * from './protocolos';
export * from './estabilidad';
export * from './transportes';
export * from './lector';
export * from './pesada';
export * from './config';
export * from './flujoPesada';
export * from './taraSesion';
