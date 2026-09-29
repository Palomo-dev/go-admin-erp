/**
 * Línea de documento de las piezas viejas que siguen usando la cotización y el
 * documento soporte (`ItemsFactura`, `ImpuestosFactura`). Vivía en
 * `NuevaFacturaForm.tsx`, retirado el 2026-09-28: la factura de venta usa
 * `formulario/FormularioFacturaVenta` (docs/design/FACTURA-VENTA-FORMULARIO-V2.md).
 */
export type InvoiceItem = {
  id?: string; // Cambiado a UUID (string en TypeScript)
  invoice_id?: string | null; // Campo mantenido por compatibilidad
  invoice_sales_id?: string | null; // Nuevo campo para relación con facturas de venta
  invoice_purchase_id?: string | null; // Nuevo campo para relación con facturas de compra
  invoice_type?: 'sale' | 'purchase'; // Tipo explícito para mayor seguridad
  product_id?: number | null; // Mantenemos product_id como número
  description: string;
  qty: number;
  unit_price: number;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_included: boolean; // Indica si el impuesto está incluido en el precio
  total_line: number;
  discount_amount?: number | null;
  product_name?: string; // Campo adicional para UI
  stock_qty?: number | null; // Stock disponible (para validación en UI)
  track_stock?: boolean | null; // Si el producto controla stock
  track_serial?: boolean | null; // Si el producto requiere captura de seriales
  product_sku?: string | null; // SKU del producto (para SerialSelectorDialog)
};
