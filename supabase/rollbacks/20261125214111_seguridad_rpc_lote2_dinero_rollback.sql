-- Reversión de 20261125214111_seguridad_rpc_lote2_dinero.
-- Devuelve EXECUTE a authenticated, el search_path y el cuerpo anterior de fn_propinas_persona.
-- Ninguna de estas funciones tenía PUBLIC ni anon antes de la migración (el asesor solo marcaba
-- 6 funciones para anon, ninguna de este lote). No toca datos.
-- OJO: reabre la carga retroactiva de asientos de TODAS las organizaciones y el pago de
-- parqueadero sin guarda a cualquier sesión, y la fuga de nombre/correo de fn_propinas_persona.

grant execute on function public.fn_retro_journal_ap() to authenticated;
grant execute on function public.fn_retro_journal_ar() to authenticated;
grant execute on function public.fn_retro_journal_invoices() to authenticated;
grant execute on function public.fn_retro_journal_payments() to authenticated;
grant execute on function public.fn_retro_journal_sales() to authenticated;
grant execute on function public.registrar_pago_estacionamiento(integer, integer, uuid, uuid, text, numeric, character, text, jsonb, text) to authenticated;
grant execute on function public.fn_cuenta_caja(integer, integer, text) to authenticated;
grant execute on function public.fn_cuentas_stock_producto(integer, integer, integer, text, text, text) to authenticated;
grant execute on function public.fn_cuenta_caja_existente(integer, integer, text) to authenticated;
grant execute on function public.fn_asiento_tesoreria_elegido(integer, text, text, text) to authenticated;
grant execute on function public.fn_tesoreria_fallo_cuenta(integer, text) to authenticated;
grant execute on function public.fn_carga_inicial_contrapartida(integer, integer, boolean) to authenticated;
grant execute on function public.fn_cuenta_anticipo_proveedor(integer, integer) to authenticated;
grant execute on function public.fn_cuenta_iva19_sugerida(integer) to authenticated;
grant execute on function public.fn_puc_ancestros(integer, text) to authenticated;
grant execute on function public.fn_reserva_anticipo(integer, uuid) to authenticated;
grant execute on function public.fn_pasarela_metodo_pago(integer, text) to authenticated;
grant execute on function public.fn_saldo_favor_estado(text, numeric, integer, integer, timestamptz) to authenticated;
grant execute on function public.fn_saldo_favor_vencido(integer, integer, timestamptz) to authenticated;
grant execute on function public.fn_validar_identificacion_para_dian(integer, text) to authenticated;
grant execute on function public.fn_ar_mark_customer_purchased() to authenticated;
grant execute on function public.fn_auto_journal_bank() to authenticated;
grant execute on function public.fn_auto_journal_bank_transfer() to authenticated;
grant execute on function public.fn_auto_journal_cash_movement() to authenticated;
grant execute on function public.fn_auto_journal_membership() to authenticated;
grant execute on function public.fn_coupons_guarda() to authenticated;
grant execute on function public.fn_journal_linea_heredar_centro() to authenticated;
grant execute on function public.fn_metodo_pago_con_pagos_no_se_borra() to authenticated;
grant execute on function public.fn_on_crm_module_activated() to authenticated;
grant execute on function public.fn_sales_mark_customer_purchased() to authenticated;
grant execute on function public.fn_set_branch_from_org() to authenticated;
grant execute on function public.fn_stages_guard_outcome_flags() to authenticated;
grant execute on function public.fn_validar_cuenta_linea_documento() to authenticated;
grant execute on function public.fn_validar_cuentas_catalogo() to authenticated;
grant execute on function public.trg_fn_sembrar_centros_org() to authenticated;
grant execute on function public.trg_fn_sembrar_centros_sucursal() to authenticated;
grant execute on function public.trg_fn_sembrar_configuracion_contable() to authenticated;
grant execute on function public.trg_fn_sembrar_motivos_devolucion() to authenticated;

alter function public.fn_retro_journal_ap() reset search_path;
alter function public.fn_retro_journal_ar() reset search_path;
alter function public.fn_retro_journal_invoices() reset search_path;
alter function public.fn_retro_journal_payments() reset search_path;
alter function public.fn_retro_journal_sales() reset search_path;
alter function public.registrar_pago_estacionamiento(integer, integer, uuid, uuid, text, numeric, character, text, jsonb, text) reset search_path;
alter function public.create_account_receivable(integer, uuid, uuid, numeric, numeric, timestamptz, text, integer) reset search_path;
alter function public.create_account_receivable(text) reset search_path;
alter function public.create_account_receivable_on_invoice() reset search_path;
alter function public.create_payment_method(integer, text, text, boolean, boolean, jsonb) reset search_path;
alter function public.delete_organization_payment_method(integer, text) reset search_path;
alter function public.update_organization_payment_method(integer, text, boolean, jsonb) reset search_path;
alter function public.update_payment_method(integer, text, text, boolean, boolean, jsonb) reset search_path;
alter function public.toggle_payment_method_status(integer, text, boolean) reset search_path;
alter function public.get_organization_payment_methods(integer) reset search_path;
alter function public.get_account_receivable_detail(uuid, integer) reset search_path;
alter function public.get_accounts_receivable_for_customers(uuid[], integer) reset search_path;
alter function public.get_accounts_receivable_stats(integer) reset search_path;
alter function public.get_accounts_receivable_with_customers(integer) reset search_path;
alter function public.get_invoice_payments(uuid, integer) reset search_path;
alter function public.get_payments_filtered(uuid, integer, boolean, text, integer, integer) reset search_path;
alter function public.get_payments_for_account(uuid, integer, boolean, integer, integer) reset search_path;
alter function public.obtener_cuentas_por_cobrar_cliente(uuid, integer) reset search_path;
alter function public.obtener_pagos_estacionamiento(integer, uuid, uuid) reset search_path;
alter function public.obtener_pagos_membresia(integer, integer) reset search_path;
alter function public.registrar_pago_membresia(integer, integer, integer, text, numeric, character, text, jsonb, text) reset search_path;
alter function public.issue_invoice(uuid) reset search_path;
alter function public.process_credit_note(uuid, numeric) reset search_path;
alter function public.list_organization_taxes(integer) reset search_path;
alter function public.fn_invoice_stock_shortages(uuid) reset search_path;
alter function public.fn_auto_journal_ap() reset search_path;
alter function public.fn_auto_journal_ap_installment() reset search_path;
alter function public.fn_auto_journal_ar() reset search_path;
alter function public.fn_auto_journal_cash_session() reset search_path;
alter function public.fn_auto_journal_folio_item() reset search_path;
alter function public.fn_auto_journal_maintenance() reset search_path;
alter function public.fn_auto_journal_membership_payment() reset search_path;
alter function public.fn_auto_journal_parking_reversal() reset search_path;
alter function public.fn_auto_journal_purchase_order() reset search_path;
alter function public.fn_auto_journal_refund() reset search_path;
alter function public.fn_auto_journal_transport_incident() reset search_path;
alter function public.fn_auto_journal_trip() reset search_path;
alter function public.fn_auto_journal_trip_ticket() reset search_path;
alter function public.fn_notify_cash_session_opened() reset search_path;
alter function public.fn_notify_payroll_approved() reset search_path;
alter function public.fn_notify_purchase_invoice() reset search_path;

-- fn_propinas_persona (cuerpo anterior)
create or replace function public.fn_propinas_persona(p_organization_id integer, p_user uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', p_user,
    'nombre', coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email),
    'cargo', coalesce(jp.name, r.name))
    from (select p_user as uid) x
    left join public.profiles p on p.id = x.uid
    left join public.organization_members om on om.user_id = x.uid and om.organization_id = p_organization_id
    left join public.job_positions jp on jp.id = om.job_position_id
    left join public.roles r on r.id = om.role_id;
$function$;
