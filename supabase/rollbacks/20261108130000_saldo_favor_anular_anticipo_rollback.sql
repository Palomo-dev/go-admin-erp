-- Reversión de 20261108130000_saldo_favor_anular_anticipo: vuelve al cuerpo anterior
-- (delegaba en fn_anular_pago, que rechaza los pagos 'customer_credit').
create or replace function public.fn_saldo_favor_anular(p_credit_id uuid, p_motivo text, p_organization_id integer default null::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_credito public.credit_notes%rowtype;
  v_pago uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select * into v_credito from public.credit_notes where id = p_credit_id;
  if not found or (p_organization_id is not null and p_organization_id <> v_credito.organization_id) then
    raise exception 'saldo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_credito.organization_id, array['finance.void']);
  if v_credito.branch_id is not null and not public.app_branch_access(v_credito.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_credito.status = 'cancelled' then
    raise exception 'saldo_no_disponible' using errcode = '22023';
  end if;

  select p.id into v_pago from public.payments p
   where p.organization_id = v_credito.organization_id and p.source = 'customer_credit'
     and p.source_id = v_credito.id::text and p.status = 'completed' and p.amount > 0
   order by p.created_at limit 1;
  if v_pago is null then
    raise exception 'saldo_no_anulable' using errcode = '22023',
      hint = 'El saldo a favor no nació de un pago (nota crédito o devolución): devuélvalo en dinero.';
  end if;

  return public.fn_anular_pago(v_pago, p_motivo) || jsonb_build_object('credito_id', v_credito.id);
end;
$function$;
