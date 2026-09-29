/**
 * Kit de inventario (bloque B0, INVENTARIO-PLAN.md §5.1). Piezas compartidas por
 * Stock, Movimientos, Kardex, Lotes, Ajustes, Traslados, Seriales, Producción y
 * el POS. Pantalla sin permiso: `EmptyState variante="forbidden"` del kit con
 * los textos `inventario.permisos.*` (no hace falta un componente propio).
 */
export { BadgeOrigenMovimiento, type BadgeOrigenMovimientoProps } from './BadgeOrigenMovimiento';
export { BadgeVencimiento, TONO_VENCIMIENTO, useTextoVencimiento, type BadgeVencimientoProps } from './BadgeVencimiento';
export { EnlaceDocumento, type EnlaceDocumentoProps } from './EnlaceDocumento';
export { useDocumentosMovimiento } from './useDocumentosMovimiento';
export { LotPicker, DialogoLotes, type LotPickerProps, type DialogoLotesProps } from './LotPicker';
export { SaldoCorridoCell, formatearCantidad, type SaldoCorridoCellProps } from './SaldoCorridoCell';
