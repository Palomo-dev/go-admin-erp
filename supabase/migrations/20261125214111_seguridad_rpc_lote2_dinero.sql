-- GO-seguridad 2026-11-25 · Lote 2 de la auditoría de SECURITY DEFINER por módulos: DINERO (pagos,
-- caja, cartera CxC/CxP, facturas, notas, propinas, comisiones, contabilidad, impuestos, monedas,
-- métodos de pago). Método y formato de 20261125210126_seguridad_rpc_pedidos_web.
--
-- Se revisaron las SECURITY DEFINER del dominio que ejecuta authenticated. Casi todas validan la
-- organización con fn_assert_acceso_org / fn_finanzas_exigir_permiso / fn_ef_exigir_lectura /
-- fn_exigir_permiso_contable / fn_impuestos_exigir_gestion / fn_propinas_sucursales /
-- fn_tasa_comision_exigir_gestion (todas rechazan anon y a quien no es miembro activo) y filtran
-- el registro por esa organización (revisadas las que reciben organización + uuid: cartera,
-- pagos, cierre y reapertura de periodo, plantillas, retenciones, devoluciones, consignación…).
-- Quedaban:
--
--   1. GRAVE · fn_retro_journal_ap/_ar/_invoices/_payments/_sales(): sin argumentos, sin guarda y
--      con EXECUTE para cualquier sesión. Recorren las ventas, facturas, pagos y cartera de TODAS
--      las organizaciones y les crean asientos contables. Cualquier usuario con sesión podía
--      dispararlas. Ningún consumidor ni función las llama (eran de una carga retroactiva).
--      → solo service_role + search_path.
--   2. GRAVE · registrar_pago_estacionamiento(...): sin guarda. Insertaba un pago (payments) y su
--      vínculo de parqueadero en la organización que dijera el argumento: un pago falso en otra
--      organización (los triggers de payments recalculan saldos y generan el asiento). Ningún
--      consumidor la llama (grep en los 5 repositorios y Edge Functions; logs de 24 h: 0).
--      → solo service_role + search_path.
--   3. Ayudantes internos de contabilidad y tesorería sin guarda, que solo llaman otras
--      SECURITY DEFINER (corren como dueño y no dependen de este permiso), ni políticas, ni vistas,
--      ni funciones SECURITY INVOKER, ni consumidores (logs de 24 h: 0):
--        fn_cuenta_caja (CREA cuentas 110505xx en el PUC de cualquier organización),
--        fn_cuentas_stock_producto, fn_cuenta_caja_existente, fn_asiento_tesoreria_elegido,
--        fn_tesoreria_fallo_cuenta, fn_carga_inicial_contrapartida, fn_cuenta_anticipo_proveedor,
--        fn_cuenta_iva19_sugerida, fn_puc_ancestros, fn_reserva_anticipo (saldo 28050501 de una
--        reserva de cualquier organización), fn_pasarela_metodo_pago, fn_saldo_favor_estado,
--        fn_saldo_favor_vencido, fn_validar_identificacion_para_dian.
--      → solo service_role.
--   4. fn_propinas_persona(org, usuario): devolvía nombre, correo y cargo de CUALQUIER usuario a
--      cualquier sesión, sin mirar la organización. La llaman el ERP con sesión
--      (src/lib/pos/propinas/propinasServidor.ts) y cuatro SECURITY DEFINER de propinas fila a
--      fila. → null si quien llama no es miembro activo de la organización (servidor pasa); el
--      nombre solo si la persona es miembro de esa organización. Sigue siendo SQL STABLE (sin
--      costo extra apreciable por fila).
--   5. 18 funciones de trigger con EXECUTE para authenticated (asientos de banco, caja,
--      membresías, validaciones del PUC, siembras contables…). Un trigger no necesita EXECUTE del
--      rol que hace el INSERT/UPDATE. → sin EXECUTE para clientes.
--   6. search_path fijo en las SECURITY DEFINER del dominio que no lo tenían (cartera, pagos,
--      métodos de pago, impuestos, notas, facturas, asientos automáticos). Revisado: ninguna llama
--      sin calificar a funciones del esquema extensions.
--
-- Fuera de este lote (anotado): crear/editar/borrar métodos de pago e impuestos solo exigen ser
-- miembro (no un permiso de finanzas). fn_excedente_nota_credito y fn_cuenta_exige_tercero se
-- quedan con authenticated porque las usan vistas (v_cartera_vs_documentos, v_lineas_sin_tercero)
-- y Postgres exige EXECUTE al usuario de la vista.
--
-- Ojo: CREATE OR REPLACE de cualquiera de estas sin cláusula SET borra el search_path que fija
-- esta migración. Quien las redefina, que lleve SET search_path TO 'public', 'pg_temp'.

-- 1 · Carga retroactiva de asientos: solo service_role
revoke all on function public.fn_retro_journal_ap() from public, anon, authenticated;
revoke all on function public.fn_retro_journal_ar() from public, anon, authenticated;
revoke all on function public.fn_retro_journal_invoices() from public, anon, authenticated;
revoke all on function public.fn_retro_journal_payments() from public, anon, authenticated;
revoke all on function public.fn_retro_journal_sales() from public, anon, authenticated;
grant execute on function public.fn_retro_journal_ap() to service_role;
grant execute on function public.fn_retro_journal_ar() to service_role;
grant execute on function public.fn_retro_journal_invoices() to service_role;
grant execute on function public.fn_retro_journal_payments() to service_role;
grant execute on function public.fn_retro_journal_sales() to service_role;
alter function public.fn_retro_journal_ap() set search_path to 'public', 'pg_temp';
alter function public.fn_retro_journal_ar() set search_path to 'public', 'pg_temp';
alter function public.fn_retro_journal_invoices() set search_path to 'public', 'pg_temp';
alter function public.fn_retro_journal_payments() set search_path to 'public', 'pg_temp';
alter function public.fn_retro_journal_sales() set search_path to 'public', 'pg_temp';

-- 2 · Pago de parqueadero sin guarda: solo service_role
revoke all on function public.registrar_pago_estacionamiento(integer, integer, uuid, uuid, text, numeric, character, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.registrar_pago_estacionamiento(integer, integer, uuid, uuid, text, numeric, character, text, jsonb, text) to service_role;
alter function public.registrar_pago_estacionamiento(integer, integer, uuid, uuid, text, numeric, character, text, jsonb, text) set search_path to 'public', 'pg_temp';

-- 3 · Ayudantes internos de contabilidad y tesorería: solo service_role
revoke all on function public.fn_cuenta_caja(integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_cuentas_stock_producto(integer, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_cuenta_caja_existente(integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_asiento_tesoreria_elegido(integer, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_tesoreria_fallo_cuenta(integer, text) from public, anon, authenticated;
revoke all on function public.fn_carga_inicial_contrapartida(integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.fn_cuenta_anticipo_proveedor(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_cuenta_iva19_sugerida(integer) from public, anon, authenticated;
revoke all on function public.fn_puc_ancestros(integer, text) from public, anon, authenticated;
revoke all on function public.fn_reserva_anticipo(integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_pasarela_metodo_pago(integer, text) from public, anon, authenticated;
revoke all on function public.fn_saldo_favor_estado(text, numeric, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.fn_saldo_favor_vencido(integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.fn_validar_identificacion_para_dian(integer, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_caja(integer, integer, text) to service_role;
grant execute on function public.fn_cuentas_stock_producto(integer, integer, integer, text, text, text) to service_role;
grant execute on function public.fn_cuenta_caja_existente(integer, integer, text) to service_role;
grant execute on function public.fn_asiento_tesoreria_elegido(integer, text, text, text) to service_role;
grant execute on function public.fn_tesoreria_fallo_cuenta(integer, text) to service_role;
grant execute on function public.fn_carga_inicial_contrapartida(integer, integer, boolean) to service_role;
grant execute on function public.fn_cuenta_anticipo_proveedor(integer, integer) to service_role;
grant execute on function public.fn_cuenta_iva19_sugerida(integer) to service_role;
grant execute on function public.fn_puc_ancestros(integer, text) to service_role;
grant execute on function public.fn_reserva_anticipo(integer, uuid) to service_role;
grant execute on function public.fn_pasarela_metodo_pago(integer, text) to service_role;
grant execute on function public.fn_saldo_favor_estado(text, numeric, integer, integer, timestamptz) to service_role;
grant execute on function public.fn_saldo_favor_vencido(integer, integer, timestamptz) to service_role;
grant execute on function public.fn_validar_identificacion_para_dian(integer, text) to service_role;

-- 4 · Persona de propinas: solo miembros de la organización; nombre solo de sus miembros
create or replace function public.fn_propinas_persona(p_organization_id integer, p_user uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- GO-seguridad 2026-11-25: antes devolvía nombre, correo y cargo de cualquier usuario a
  -- cualquier sesión. Ahora: null si quien llama no es miembro activo (el servidor pasa), y el
  -- nombre solo si la persona es miembro de esa organización.
  select case
           when not (
             ((select auth.uid()) is null and coalesce((select auth.role()), '') not in ('anon', 'authenticated'))
             or exists (select 1 from public.organization_members me
                         where me.user_id = (select auth.uid()) and me.organization_id = p_organization_id
                           and me.is_active))
             then null
           else jsonb_build_object(
             'id', p_user,
             'nombre', case when om.id is not null
                            then coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email) end,
             'cargo', coalesce(jp.name, r.name))
         end
    from (select p_user as uid) x
    left join public.profiles p on p.id = x.uid
    left join public.organization_members om on om.user_id = x.uid and om.organization_id = p_organization_id
    left join public.job_positions jp on jp.id = om.job_position_id
    left join public.roles r on r.id = om.role_id;
$function$;

-- 5 · Funciones de trigger: sin EXECUTE para clientes
revoke all on function public.fn_ar_mark_customer_purchased() from public, anon, authenticated;
revoke all on function public.fn_auto_journal_bank() from public, anon, authenticated;
revoke all on function public.fn_auto_journal_bank_transfer() from public, anon, authenticated;
revoke all on function public.fn_auto_journal_cash_movement() from public, anon, authenticated;
revoke all on function public.fn_auto_journal_membership() from public, anon, authenticated;
revoke all on function public.fn_coupons_guarda() from public, anon, authenticated;
revoke all on function public.fn_journal_linea_heredar_centro() from public, anon, authenticated;
revoke all on function public.fn_metodo_pago_con_pagos_no_se_borra() from public, anon, authenticated;
revoke all on function public.fn_on_crm_module_activated() from public, anon, authenticated;
revoke all on function public.fn_sales_mark_customer_purchased() from public, anon, authenticated;
revoke all on function public.fn_set_branch_from_org() from public, anon, authenticated;
revoke all on function public.fn_stages_guard_outcome_flags() from public, anon, authenticated;
revoke all on function public.fn_validar_cuenta_linea_documento() from public, anon, authenticated;
revoke all on function public.fn_validar_cuentas_catalogo() from public, anon, authenticated;
revoke all on function public.trg_fn_sembrar_centros_org() from public, anon, authenticated;
revoke all on function public.trg_fn_sembrar_centros_sucursal() from public, anon, authenticated;
revoke all on function public.trg_fn_sembrar_configuracion_contable() from public, anon, authenticated;
revoke all on function public.trg_fn_sembrar_motivos_devolucion() from public, anon, authenticated;
grant execute on function public.fn_ar_mark_customer_purchased() to service_role;
grant execute on function public.fn_auto_journal_bank() to service_role;
grant execute on function public.fn_auto_journal_bank_transfer() to service_role;
grant execute on function public.fn_auto_journal_cash_movement() to service_role;
grant execute on function public.fn_auto_journal_membership() to service_role;
grant execute on function public.fn_coupons_guarda() to service_role;
grant execute on function public.fn_journal_linea_heredar_centro() to service_role;
grant execute on function public.fn_metodo_pago_con_pagos_no_se_borra() to service_role;
grant execute on function public.fn_on_crm_module_activated() to service_role;
grant execute on function public.fn_sales_mark_customer_purchased() to service_role;
grant execute on function public.fn_set_branch_from_org() to service_role;
grant execute on function public.fn_stages_guard_outcome_flags() to service_role;
grant execute on function public.fn_validar_cuenta_linea_documento() to service_role;
grant execute on function public.fn_validar_cuentas_catalogo() to service_role;
grant execute on function public.trg_fn_sembrar_centros_org() to service_role;
grant execute on function public.trg_fn_sembrar_centros_sucursal() to service_role;
grant execute on function public.trg_fn_sembrar_configuracion_contable() to service_role;
grant execute on function public.trg_fn_sembrar_motivos_devolucion() to service_role;

-- 6 · search_path fijo en el resto del dominio
alter function public.create_account_receivable(integer, uuid, uuid, numeric, numeric, timestamptz, text, integer) set search_path to 'public', 'pg_temp';
alter function public.create_account_receivable(text) set search_path to 'public', 'pg_temp';
alter function public.create_account_receivable_on_invoice() set search_path to 'public', 'pg_temp';
alter function public.create_payment_method(integer, text, text, boolean, boolean, jsonb) set search_path to 'public', 'pg_temp';
alter function public.delete_organization_payment_method(integer, text) set search_path to 'public', 'pg_temp';
alter function public.update_organization_payment_method(integer, text, boolean, jsonb) set search_path to 'public', 'pg_temp';
alter function public.update_payment_method(integer, text, text, boolean, boolean, jsonb) set search_path to 'public', 'pg_temp';
alter function public.toggle_payment_method_status(integer, text, boolean) set search_path to 'public', 'pg_temp';
alter function public.get_organization_payment_methods(integer) set search_path to 'public', 'pg_temp';
alter function public.get_account_receivable_detail(uuid, integer) set search_path to 'public', 'pg_temp';
alter function public.get_accounts_receivable_for_customers(uuid[], integer) set search_path to 'public', 'pg_temp';
alter function public.get_accounts_receivable_stats(integer) set search_path to 'public', 'pg_temp';
alter function public.get_accounts_receivable_with_customers(integer) set search_path to 'public', 'pg_temp';
alter function public.get_invoice_payments(uuid, integer) set search_path to 'public', 'pg_temp';
alter function public.get_payments_filtered(uuid, integer, boolean, text, integer, integer) set search_path to 'public', 'pg_temp';
alter function public.get_payments_for_account(uuid, integer, boolean, integer, integer) set search_path to 'public', 'pg_temp';
alter function public.obtener_cuentas_por_cobrar_cliente(uuid, integer) set search_path to 'public', 'pg_temp';
alter function public.obtener_pagos_estacionamiento(integer, uuid, uuid) set search_path to 'public', 'pg_temp';
alter function public.obtener_pagos_membresia(integer, integer) set search_path to 'public', 'pg_temp';
alter function public.registrar_pago_membresia(integer, integer, integer, text, numeric, character, text, jsonb, text) set search_path to 'public', 'pg_temp';
alter function public.issue_invoice(uuid) set search_path to 'public', 'pg_temp';
alter function public.process_credit_note(uuid, numeric) set search_path to 'public', 'pg_temp';
alter function public.list_organization_taxes(integer) set search_path to 'public', 'pg_temp';
alter function public.fn_invoice_stock_shortages(uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_ap() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_ap_installment() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_ar() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_cash_session() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_folio_item() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_maintenance() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_membership_payment() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_parking_reversal() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_purchase_order() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_refund() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_transport_incident() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_trip() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_trip_ticket() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_cash_session_opened() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_payroll_approved() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_purchase_invoice() set search_path to 'public', 'pg_temp';
