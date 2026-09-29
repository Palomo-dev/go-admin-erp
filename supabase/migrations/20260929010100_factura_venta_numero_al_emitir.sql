-- Factura de venta v2, decisión 2 del dueño (plan de ventas D9): el borrador se
-- guarda SIN número y fn_factura_venta_emitir lo asigna al emitir con la
-- resolución de la sucursal (fn_get_next_invoice_number, respaldo FACT-####).
-- fn_factura_venta_guardar ya admitía el número vacío («se asigna al emitir»),
-- pero la columna seguía NOT NULL y el formulario tenía que inventar un
-- número en el navegador (hallazgo H8). El listado y el detalle ya muestran
-- «Sin número» para un borrador sin él.
--
-- Solo se relaja la restricción: no cambia el tipo ni toca filas. Una factura
-- emitida, anulada o nota crédito siempre lleva número (lo pone la emisión o
-- el documento de origen).

alter table public.invoice_sales alter column number drop not null;
comment on column public.invoice_sales.number is
  'Número de la factura. NULL solo en borradores de venta: se asigna al emitir (fn_factura_venta_emitir).';
