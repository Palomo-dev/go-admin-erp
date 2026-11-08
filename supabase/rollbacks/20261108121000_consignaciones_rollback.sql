-- Reversión de 20261108121000_consignaciones.sql (revertirla ANTES que 20261108120500_organization_links).
--
-- Borra el disparador del kardex, las funciones y las siete tablas. ADVERTENCIA: si ya hay notas,
--   - la mercancía ENTREGADA sigue fuera de la bodega (salidas 'transfer_out' con source_id 'consignacion:<nota>')
--     y su costo en la subcuenta de inventarios de mercancía en poder de terceros;
--   - la mercancía RECIBIDA sigue en el kardex (entradas 'transfer_in' sin costo) y en las cuentas de orden;
--   - los productos de consignación conservan su cuenta de ingreso (auxiliar 281510 del dueño) en el catálogo;
--   - los pendientes contables 'consignacion_*' siguen en journal_entry_failures.
-- Borrar las tablas pierde qué tiene cada consignatario, qué se le debe a cada dueño y qué venta salió de qué nota.
-- Respaldar consignment_* antes, o no revertir con datos. Asientos, kardex, facturas, facturas de compra y saldos a
-- favor NO se tocan.

drop trigger if exists trg_consignacion_venta on public.stock_movements;

drop function if exists public.fn_consignacion_documento_recibido_cerrar(uuid, uuid, integer);
drop function if exists public.fn_consignacion_documento_recibido_preparar(uuid, integer);
drop function if exists public.fn_consignacion_recibida_aceptar(uuid, integer, jsonb, text, text, integer);
drop function if exists public.fn_consignacion_compartir(uuid, integer);
drop function if exists public.fn_consignacion_compartir_interna(uuid);
drop function if exists public.fn_consignacion_recibida_cerrar_compra(uuid, uuid, integer);
drop function if exists public.fn_consignacion_recibida_anular_liquidacion(uuid, text, integer);
drop function if exists public.fn_consignacion_recibida_liquidar(uuid, date, text, integer);
drop function if exists public.fn_trg_consignacion_venta();
drop function if exists public.fn_consignacion_revertir_venta(public.stock_movements);
drop function if exists public.fn_consignacion_asignar_venta(public.stock_movements);
drop function if exists public.fn_consignacion_cuenta_ingreso_pos(integer, integer);
drop function if exists public.fn_consignacion_venta_cobrada(text, text);
drop function if exists public.fn_consignacion_linea_venta(text, text, integer);
drop function if exists public.fn_consignacion_recibida_devolver(uuid, jsonb, text, integer, text);
drop function if exists public.fn_consignacion_recibir(integer, integer, jsonb, numeric, jsonb, text, integer, text);
drop function if exists public.fn_consignacion_recibir_interna(integer, integer, integer, jsonb, numeric, jsonb, text, text, uuid, uuid, text);
drop function if exists public.fn_consignacion_registrar_producto(integer, integer, integer, text, text);
drop function if exists public.fn_consignacion_cerrar(uuid, uuid, text, integer);
drop function if exists public.fn_consignacion_liquidar(uuid, jsonb, text, integer, date, date);
drop function if exists public.fn_consignacion_entregar(uuid, integer, jsonb, numeric, jsonb, text, integer, text, text);
drop function if exists public.fn_consignacion_estado(uuid);
drop function if exists public.fn_consignacion_terminos(jsonb, text);
drop function if exists public.fn_consignacion_pendiente(integer, integer, text, text, text, numeric, text);
drop function if exists public.fn_consignacion_registrar_pendiente(integer, text, text);
drop function if exists public.fn_consignacion_cuentas_recibida(integer, integer, text, integer, text);
drop function if exists public.fn_consignacion_cuenta_valida(integer, text, text);
drop function if exists public.fn_consignacion_cuenta_patron(integer, text);
drop function if exists public.fn_cuenta_inventario_consignacion(integer, integer);

drop table if exists public.consignment_returns;
drop table if exists public.consignment_allocations;
drop table if exists public.consignment_products;
drop table if exists public.consignment_settlement_lines;
drop table if exists public.consignment_settlements;
drop table if exists public.consignment_note_lines;
drop table if exists public.consignment_notes;
