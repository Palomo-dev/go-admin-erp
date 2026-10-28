-- Rollback exacto de 20261027242000: restaura método y updated_at del pago, etiqueta de la factura,
-- ORDEN COMPLETO (aplicar): 20261027241500 → 20261027243000 → 20261027244000 → 20261027245000 → 20261027242000
--   (la 242000 SOLO tras confirmar en el panel de Wompi). ROLLBACK en orden INVERSO:
--   242000 → 245000 → 244000 → 243000 → 241500.
--   20261027246000 (liberar reservas de cancelados) es INDEPENDIENTE: va aparte, con su respaldo y su rollback.
-- include_in_cash_register de la venta y la cuenta de la línea del asiento desde la
-- tabla de respaldo, y la borra. Aplicar con: psql -v ON_ERROR_STOP=1 -f <archivo>

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

set local app.contabilidad_mantenimiento = 'on';

do $$
begin
  if to_regclass('public._bk_20261027242000_cobros_pasarela') is null then
    raise notice '20261027242000 no se aplicó: nada que revertir';
    return;
  end if;

  update public.payments p set method = b.old_payment_method, updated_at = b.old_payment_updated_at
    from public._bk_20261027242000_cobros_pasarela b where b.payment_id = p.id;
  update public.invoice_sales i set payment_method = b.old_invoice_payment_method
    from public._bk_20261027242000_cobros_pasarela b where b.invoice_id = i.id;
  update public.sales s set include_in_cash_register = b.old_include_in_cash_register
    from public._bk_20261027242000_cobros_pasarela b where b.sale_id = s.id;
  update public.journal_lines jl set account_code = b.old_account_code
    from public._bk_20261027242000_cobros_pasarela b
   where b.journal_line_id = jl.id and b.old_account_code is not null;

  drop table public._bk_20261027242000_cobros_pasarela;
end $$;

commit;
