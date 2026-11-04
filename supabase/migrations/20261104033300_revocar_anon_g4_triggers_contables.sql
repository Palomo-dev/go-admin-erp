-- Grupo 4 de 4: 44 funciones de trigger contables y de cartera (asientos, cuentas, facturas).
--   Misma razón que el grupo 3: EXECUTE no se comprueba al disparar el trigger.
--   Incluye fn_create_commission_on_invoice_purchase, sin trigger hoy.
-- Aplicada por MCP el 2026-11-04, después de 20261104031500 (las 12 críticas), en orden 1 → 4,
-- con una sonda como anon después de cada grupo (395 tablas/vistas + 14 rutas de una tienda real).
-- service_role y postgres conservan EXECUTE. Se quedan para anon, a propósito, las 6 que evalúan
-- las políticas RLS de las tiendas: app_branch_access, can_access_account_receivable, fn_mis_orgs,
-- get_public_menu, is_user_member_of_org, user_belongs_to_organization.
--
-- Rollback: supabase/rollbacks/20261104033300_revocar_anon_g4_triggers_contables_rollback.sql

revoke execute on function
  public.audit_finance_changes(),
  public.create_account_receivable_on_invoice(),
  public.fn_auto_journal_ap(),
  public.fn_auto_journal_ap_installment(),
  public.fn_auto_journal_ar(),
  public.fn_auto_journal_cash_session(),
  public.fn_auto_journal_credit_note(),
  public.fn_auto_journal_employee_loan(),
  public.fn_auto_journal_folio_item(),
  public.fn_auto_journal_folio_payment(),
  public.fn_auto_journal_loan_installment(),
  public.fn_auto_journal_maintenance(),
  public.fn_auto_journal_membership_payment(),
  public.fn_auto_journal_ota_commission(),
  public.fn_auto_journal_parking_pass(),
  public.fn_auto_journal_parking_payment(),
  public.fn_auto_journal_parking_reversal(),
  public.fn_auto_journal_parking_session(),
  public.fn_auto_journal_payment(),
  public.fn_auto_journal_payroll(),
  public.fn_auto_journal_payroll_period(),
  public.fn_auto_journal_purchase(),
  public.fn_auto_journal_purchase_order(),
  public.fn_auto_journal_refund(),
  public.fn_auto_journal_reservation(),
  public.fn_auto_journal_sale(),
  public.fn_auto_journal_sale_item_cogs(),
  public.fn_auto_journal_shipment(),
  public.fn_auto_journal_tip(),
  public.fn_auto_journal_transport_incident(),
  public.fn_auto_journal_trip(),
  public.fn_auto_journal_trip_ticket(),
  public.fn_auto_journal_void(),
  public.fn_chart_cuenta_titulo_configurada(),
  public.fn_create_commission_on_invoice_purchase(),
  public.fn_normalizar_impuesto_linea(),
  public.fn_recalc_accounts_payable_from_payments(),
  public.fn_recalc_invoice_balance_from_payments(),
  public.fn_recalc_invoice_totals(),
  public.fn_trg_asiento_cuadrado(),
  public.trg_fn_asegurar_cuenta_anticipos(),
  public.trg_fn_auto_create_accounting_rules(),
  public.trg_fn_auto_create_chart_of_accounts(),
  public.update_accounts_receivable_on_payment()
from public, anon, authenticated;

do $verificar$
declare v_f text;
begin
  foreach v_f in array array['public.audit_finance_changes()', 'public.create_account_receivable_on_invoice()', 'public.fn_auto_journal_ap()', 'public.fn_auto_journal_ap_installment()', 'public.fn_auto_journal_ar()', 'public.fn_auto_journal_cash_session()', 'public.fn_auto_journal_credit_note()', 'public.fn_auto_journal_employee_loan()', 'public.fn_auto_journal_folio_item()', 'public.fn_auto_journal_folio_payment()', 'public.fn_auto_journal_loan_installment()', 'public.fn_auto_journal_maintenance()', 'public.fn_auto_journal_membership_payment()', 'public.fn_auto_journal_ota_commission()', 'public.fn_auto_journal_parking_pass()', 'public.fn_auto_journal_parking_payment()', 'public.fn_auto_journal_parking_reversal()', 'public.fn_auto_journal_parking_session()', 'public.fn_auto_journal_payment()', 'public.fn_auto_journal_payroll()', 'public.fn_auto_journal_payroll_period()', 'public.fn_auto_journal_purchase()', 'public.fn_auto_journal_purchase_order()', 'public.fn_auto_journal_refund()', 'public.fn_auto_journal_reservation()', 'public.fn_auto_journal_sale()', 'public.fn_auto_journal_sale_item_cogs()', 'public.fn_auto_journal_shipment()', 'public.fn_auto_journal_tip()', 'public.fn_auto_journal_transport_incident()', 'public.fn_auto_journal_trip()', 'public.fn_auto_journal_trip_ticket()', 'public.fn_auto_journal_void()', 'public.fn_chart_cuenta_titulo_configurada()', 'public.fn_create_commission_on_invoice_purchase()', 'public.fn_normalizar_impuesto_linea()', 'public.fn_recalc_accounts_payable_from_payments()', 'public.fn_recalc_invoice_balance_from_payments()', 'public.fn_recalc_invoice_totals()', 'public.fn_trg_asiento_cuadrado()', 'public.trg_fn_asegurar_cuenta_anticipos()', 'public.trg_fn_auto_create_accounting_rules()', 'public.trg_fn_auto_create_chart_of_accounts()', 'public.update_accounts_receivable_on_payment()'] loop
    if has_function_privilege('anon', v_f::regprocedure, 'execute') then
      raise exception '% sigue ejecutable por anon', v_f;
    end if;
    if not has_function_privilege('service_role', v_f::regprocedure, 'execute') then
      raise exception '% perdió service_role', v_f;
    end if;
    if has_function_privilege('authenticated', v_f::regprocedure, 'execute') <> false then
      raise exception '% authenticated quedó distinto de lo esperado', v_f;
    end if;
  end loop;
end
$verificar$;
