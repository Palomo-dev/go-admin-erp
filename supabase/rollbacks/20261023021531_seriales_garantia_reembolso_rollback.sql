-- Rollback de 20261023021531_seriales_garantia_reembolso.sql
-- fn_garantia_resolver vuelve a resolver el reembolso sin nota, asiento ni caja.
-- No deshace un reembolso ya contabilizado.
-- Ejecutar antes de revertir procesar_devolucion.

do $rollback$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.fn_garantia_resolver(integer,uuid,jsonb)'::regprocedure);
  if position('reembolso_contable_20261023' in v_def) = 0 then
    return;
  end if;
  v_nuevo := replace(v_def, $rb_new_1$  return jsonb_build_object('id', v_w.id, 'estado', 'resolved', 'tipo', v_tipo,
                            'reemplazo', case when v_tipo = 'replacement' then v_r.serial end,
                            'nota_credito', (
                              select jsonb_build_object('id', i.id, 'numero', i.number)
                                from public.warranty_claims w
                                join public.invoice_sales i on i.id = w.credit_note_invoice_id
                               where w.id = v_w.id and i.organization_id = p_org),
                            'devolucion_id', (select w.return_id from public.warranty_claims w where w.id = v_w.id));$rb_new_1$, $rb_old_1$  return jsonb_build_object('id', v_w.id, 'estado', 'resolved', 'tipo', v_tipo,
                            'reemplazo', case when v_tipo = 'replacement' then v_r.serial end);$rb_old_1$);
  if v_nuevo = v_def then
    raise exception 'rollback garantia: no está el tramo 1';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_2$  v_estado_reclamada := case
    when v_tipo = 'repair' then 'sold'
    when v_tipo = 'refund' then 'damaged'
    when v_w.status = 'in_process' then 'rma'
    else 'damaged' end;

  -- reembolso_contable_20261023: nota, asiento, caja e inventario antes de
  -- marcar el serial. Reparación y reemplazo no pasan por aquí.
  if v_tipo = 'refund' then
    perform public.fn_garantia_int_reembolsar(p_org, v_w.id, v_d);
  end if;

  update public.warranty_claims$rb_new_2$, $rb_old_2$  v_estado_reclamada := case
    when v_tipo = 'repair' then 'sold'
    when v_w.status = 'in_process' then 'rma'
    else 'damaged' end;

  update public.warranty_claims$rb_old_2$);
  if v_nuevo = v_def then
    raise exception 'rollback garantia: no está el tramo 2';
  end if;
  v_def := v_nuevo;
  execute v_def;
end
$rollback$;

drop function if exists public.fn_garantia_int_reembolsar(integer, uuid, jsonb);
