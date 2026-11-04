-- Reversión de 20261023190000_sobrante_diversos_adaptada.sql
--
-- Quita de fn_auto_journal_stock_movement el bloque «Sobrante (20261023190000,
-- adaptada 2026-11-04)» y comprueba que vuelve EXACTAMENTE a la definición viva del
-- 2026-11-04, la de 20261025134030:
--   md5(prosrc) 8b0338f49c3f7f6044bd6dcf366d6de8 → 42c746274a0f655dea9a25dc001ffc78
-- Si el md5 es otro (otra migración tocó la función después), se detiene.
--
-- Qué cambia respecto al rollback original: este NO reinstala
-- public.sobrante_funcion_respaldo (esos respaldos se tomaron durante la
-- restauración, sobre la versión de 20261023181348, y pisarían 20261023211500 y
-- 20261025134030), no borra funciones ni toca configuracion_contable ni asientos.
-- Los asientos o fallos registrados mientras estuvo activa no se tocan.

do $patch$
declare
  v_oid oid := 'public.fn_auto_journal_stock_movement()'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $old$  -- Sobrante (20261023190000, adaptada 2026-11-04): ningún movimiento de stock usa 4250.
  -- El relevo es la cuenta de ingresos diversos resuelta a auxiliar (20261025134030).
  if left(coalesce(v_credit_account, ''), 4) = '4250' then
    v_credit_account := public.fn_cuenta_ingresos_diversos(new.organization_id, new.branch_id);
  end if;
  if left(coalesce(v_debit_account, ''), 4) = '4250' then
    v_debit_account := public.fn_cuenta_ingresos_diversos(new.organization_id, new.branch_id);
  end if;
  if v_debit_account is null or v_credit_account is null
     or left(coalesce(v_credit_account, ''), 4) = '4250'
     or left(coalesce(v_debit_account, ''), 4) = '4250' then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'sobrante_cuenta', 'Un movimiento de stock no usa 4250 y no hay cuenta de ingresos diversos');
    return new;
  end if;

$old$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '42c746274a0f655dea9a25dc001ffc78' then
    return;  -- ya revertida
  end if;
  if v_md5 <> '8b0338f49c3f7f6044bd6dcf366d6de8' then
    raise exception 'fn_auto_journal_stock_movement cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_auto_journal_stock_movement: el bloque no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, '');
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '42c746274a0f655dea9a25dc001ffc78' then
    raise exception 'fn_auto_journal_stock_movement: md5 final inesperado (%)', v_md5;
  end if;
end
$patch$;
