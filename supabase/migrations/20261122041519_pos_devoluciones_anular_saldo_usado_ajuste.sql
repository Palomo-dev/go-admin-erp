-- Ajuste de 20261122041421 «anular devolución con saldo usado»: journal_reversals
-- solo admite las categorías de las correcciones contables (F-48, CC-001…), no
-- las anulaciones de documentos. El enlace del asiento espejo con los dos
-- asientos que reemplaza queda en finance_audit_log (asientos_reemplazados) y
-- en su fact_key 'return_void:<devolución>'.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_devolucion_anular(integer, integer, text, text, boolean, boolean)'::regprocedure);
  v_viejo text := $v$    insert into public.journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, motivo, created_by)
    select p_organization_id, 'devolucion:' || v_r.id, 'anulacion_devolucion', x.id, v_espejo, v_motivo, v_uid
      from unnest(array[v_a1, v_c1]) as x(id) where x.id is not null;
$v$;
  v_viejo2 text := $v$                             'saldo_usado_a_cartera', v_usado, 'cuenta_por_cobrar', v_cxc,$v$;
  v_nuevo2 text := $v$                             'saldo_usado_a_cartera', v_usado, 'cuenta_por_cobrar', v_cxc,
                             'asiento_espejo', v_espejo, 'asientos_reemplazados', to_jsonb(array_remove(array[v_a1, v_c1], null)),$v$;
begin
  if position('journal_reversals' in v_def) = 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 or position(v_viejo2 in v_def) = 0 then
    raise exception 'fn_devolucion_anular cambió: no aparecen las anclas del ajuste';
  end if;
  execute replace(replace(v_def, v_viejo, ''), v_viejo2, v_nuevo2);
end;
$$;
