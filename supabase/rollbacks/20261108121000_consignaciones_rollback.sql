-- Reversión de 20261108121000_consignaciones.sql (revertirla ANTES que 20261108120500_organization_links).
--
-- Borra el disparador del kardex, las funciones y las trece tablas. ADVERTENCIA: si ya hay notas,
--   - la mercancía ENTREGADA sigue fuera de la bodega en el kardex (salidas 'transfer_out' con source_id
--     'consignacion:<nota>'); su costo nunca salió de la cuenta de inventario (no hubo asiento);
--   - la mercancía RECIBIDA sigue en el kardex (entradas 'transfer_in' sin costo) y en las cuentas de orden;
--   - los productos de consignación conservan su cuenta de ingreso (auxiliar 281510 del dueño) en el catálogo;
--   - los anticipos cruzados conservan su saldo rebajado (supplier_advances) y su asiento;
--   - los pendientes contables 'consignacion_*' siguen en journal_entry_failures;
--   - las retenciones practicadas (asiento 'consignment_withholding'), las compensaciones de la comisión
--     ('consignment_commission_offset') y la remuneración por cobrar al dueño quedan en los libros.
-- Borrar las tablas pierde qué tiene cada consignatario, qué se le debe a cada dueño, qué venta salió de qué nota y
-- la evidencia de faltantes y daños. Respaldar consignment_* antes, o no revertir con datos. Asientos, kardex,
-- facturas y saldos a favor NO se tocan.

drop trigger if exists trg_consignacion_venta on public.stock_movements;

drop function if exists public.fn_consignacion_documento_recibido_cerrar(uuid, uuid, integer);
drop function if exists public.fn_consignacion_documento_recibido_preparar(uuid, integer);
drop function if exists public.fn_consignacion_recibida_aceptar(uuid, integer, jsonb, text, text, text, integer);
drop function if exists public.fn_consignacion_compartir(uuid, integer);
drop function if exists public.fn_consignacion_compartir_interna(uuid);
drop function if exists public.fn_consignacion_reconocer_remuneracion(uuid, text, text, integer);
drop function if exists public.fn_consignacion_compensar_remuneracion(uuid, numeric, text, integer);
drop function if exists public.fn_consignacion_retencion_practicada(uuid, numeric, numeric, date, text, integer, uuid);
drop function if exists public.fn_consignacion_configurar_retenciones(integer, jsonb);
drop function if exists public.fn_consignacion_conciliar_retencion(uuid, numeric, text, integer);
drop function if exists public.fn_consignacion_retenciones_liquidacion(uuid);
drop function if exists public.fn_consignacion_retencion_registrar(public.consignment_settlements, integer, text, text, text, text, text, numeric, jsonb, jsonb);
drop function if exists public.fn_consignacion_cruzar_anticipo(uuid, uuid, numeric, text, integer);
drop function if exists public.fn_consignacion_recibida_anular_liquidacion(uuid, text, integer);
drop function if exists public.fn_consignacion_recibida_liquidar(uuid, date, boolean, text, text, integer);
drop function if exists public.fn_trg_consignacion_venta();
drop function if exists public.fn_consignacion_revertir_venta(public.stock_movements);
drop function if exists public.fn_consignacion_asignar_venta(public.stock_movements);
drop function if exists public.fn_consignacion_reconocer_int(public.consignment_notes, numeric, numeric, timestamptz, text, text, text, text, uuid);
drop function if exists public.fn_consignacion_cxc_dueno_saldo(uuid);
drop function if exists public.fn_consignacion_saldo_dueno(integer, text);
drop function if exists public.fn_consignacion_remuneracion(text, text, numeric, numeric, numeric, numeric, numeric);
drop function if exists public.fn_consignacion_cuenta_ingreso_pos(integer, integer);
drop function if exists public.fn_consignacion_venta_cobrada(text, text);
drop function if exists public.fn_consignacion_linea_venta(text, text, integer);
drop function if exists public.fn_consignacion_registrar_novedad(uuid, uuid, text, numeric, text, text, text, text, integer);
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
drop function if exists public.fn_consignacion_estimatorio_habilitado(integer);
drop function if exists public.fn_consignacion_cuentas_recibida(integer, integer, text);
drop function if exists public.fn_consignacion_configurar_cuentas(integer, text, text, text, text, jsonb);
drop function if exists public.fn_consignacion_cuenta_valida(integer, text, text);
drop function if exists public.fn_consignacion_cuenta_patron(integer, text);

drop table if exists public.consignment_settlement_withholdings;
drop table if exists public.consignment_remuneration_recognitions;
drop table if exists public.consignment_advance_crossings;
drop table if exists public.consignment_commission_offsets;
drop table if exists public.consignment_incidents;
drop table if exists public.consignment_returns;
drop table if exists public.consignment_allocations;
drop table if exists public.consignment_products;
drop table if exists public.consignment_settlement_lines;
drop table if exists public.consignment_settlements;
drop table if exists public.consignment_note_lines;
drop table if exists public.consignment_notes;
drop table if exists public.consignment_account_settings;
