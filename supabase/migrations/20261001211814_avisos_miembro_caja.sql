create or replace function public.fn_avisos_miembro_caja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ciego boolean;
  v_sucursal text;
  v_moneda text;
  v_cuerpo text;
  v_dest uuid;
  v_key text;
  v_id uuid;
  v_aviso boolean := false;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status or new.status <> 'closed' then
    return new;
  end if;
  if new.difference is null or new.difference = 0 then
    return new;
  end if;
  if not exists (
    select 1 from public.organization_modules m
    where m.organization_id = new.organization_id
      and m.module_code = 'pos'
      and m.is_active = true
  ) then
    return new;
  end if;

  begin
    select coalesce((os.settings->>'blind_cash_count')::boolean, false)
      into v_ciego
    from public.organization_settings os
    where os.organization_id = new.organization_id
      and os.key = 'pos_blind_cash_count'
    limit 1;

    select nullif(btrim(b.name), '') into v_sucursal
    from public.branches b
    where b.id = new.branch_id
      and b.organization_id = new.organization_id;

    v_cuerpo := 'La caja de ' || coalesce(v_sucursal, 'la sucursal') || ' cerró con diferencia.';
    if coalesce(v_ciego, false) then
      v_cuerpo := v_cuerpo || ' El monto se consulta en la caja.';
    else
      select upper(btrim(oc.currency_code)) into v_moneda
      from public.organization_currencies oc
      where oc.organization_id = new.organization_id
        and oc.is_base = true
      limit 1;
      v_cuerpo := v_cuerpo || ' Diferencia: ' || trim(to_char(new.difference, 'FM999999999990.00'));
      if v_moneda is not null and v_moneda <> '' then
        v_cuerpo := v_cuerpo || ' ' || v_moneda;
      end if;
      v_cuerpo := v_cuerpo || '.';
    end if;

    for v_dest in
      select d.user_id from public.fn_avisos_miembro_destinatarios(new.organization_id, 'pos.cajas.ver_esperado') d
    loop
      v_key := new.organization_id::text || ':caja.diferencia:cash_session:' || new.id::text || ':' || v_dest::text;
      v_id := public.fn_avisos_miembro_poner(
        new.organization_id, v_dest, new.closed_by,
        'caja.diferencia', 'cash_session', public.fn_avisos_miembro_uuid(v_key),
        'La caja cerró con diferencia', v_cuerpo,
        '/app/pos/cajas', v_key,
        'cash_session:' || new.id::text
      );
      v_aviso := v_aviso or v_id is not null;
    end loop;

    if v_aviso then
      begin
        perform public.fn_crm_cron_post('/api/cron/avisos-miembro', $aviso${"solo":"correo"}$aviso$::jsonb);
      exception when others then
        null;
      end;
    end if;
  exception when others then
    return new;
  end;

  return new;
end;
$$;

drop trigger if exists trg_avisos_miembro_caja on public.cash_sessions;
create trigger trg_avisos_miembro_caja
  after update of status on public.cash_sessions
  for each row execute function public.fn_avisos_miembro_caja();
