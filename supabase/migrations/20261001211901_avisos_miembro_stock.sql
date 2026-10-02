create or replace function public.fn_avisos_miembro_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric;
  v_prev numeric;
  v_min numeric;
  v_nombre text;
  v_org integer;
  v_tz text;
  v_hoy text;
  v_sucursal text;
  v_dest uuid;
  v_key text;
  v_id uuid;
  v_aviso boolean := false;
  v_actor uuid;
begin
  if tg_op <> 'UPDATE'
     or new.product_id is distinct from old.product_id
     or new.branch_id is distinct from old.branch_id
  then
    return new;
  end if;

  begin
    select coalesce(sum(sl.qty_on_hand), 0), max(sl.min_level)
      into v_qty, v_min
    from public.stock_levels sl
    where sl.product_id = new.product_id
      and sl.branch_id = new.branch_id;

    v_prev := v_qty - coalesce(new.qty_on_hand, 0) + coalesce(old.qty_on_hand, 0);
    if v_min is null or v_min <= 0 or v_qty <= 0 or v_qty > v_min or v_prev <= v_min then
      return new;
    end if;

    select p.organization_id, p.name
      into v_org, v_nombre
    from public.products p
    where p.id = new.product_id
      and coalesce(p.track_stock, false)
      and coalesce(p.status, 'active') <> 'deleted'
      and not (
        coalesce(p.is_parent, false)
        and exists (
          select 1 from public.products h
          where h.parent_product_id = p.id
            and coalesce(h.status, 'active') <> 'deleted'
        )
      )
      and (
        p.parent_product_id is null
        or exists (
          select 1 from public.products padre
          where padre.id = p.parent_product_id
            and coalesce(padre.status, 'active') <> 'deleted'
        )
      );

    if v_org is null then
      return new;
    end if;
    if not exists (
      select 1 from public.organization_modules m
      where m.organization_id = v_org
        and m.module_code = 'inventory'
        and m.is_active = true
    ) then
      return new;
    end if;

    select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota') into v_tz
    from public.organizations o where o.id = v_org;
    v_hoy := to_char(now() at time zone v_tz, 'YYYY-MM-DD');

    select nullif(btrim(b.name), '') into v_sucursal
    from public.branches b
    where b.id = new.branch_id and b.organization_id = v_org;

    v_actor := auth.uid();
    for v_dest in
      select d.user_id from public.fn_avisos_miembro_destinatarios(v_org, 'inventory.view') d
    loop
      v_key := v_org::text || ':inventario.bajo:stock:' || new.product_id::text || ':' || new.branch_id::text || ':' || v_dest::text || ':' || v_hoy;
      v_id := public.fn_avisos_miembro_poner(
        v_org, v_dest, v_actor,
        'inventario.bajo', 'stock', public.fn_avisos_miembro_uuid(v_key),
        'Un producto quedó bajo el mínimo',
        '«' || coalesce(v_nombre, 'Producto') || '» quedó en ' || trim(to_char(v_qty, 'FM999999990.99'))
          || ' unidades. El mínimo en ' || coalesce(v_sucursal, 'la sucursal') || ' es '
          || trim(to_char(v_min, 'FM999999990.99')) || '.',
        '/app/inventario/productos/' || new.product_id::text,
        v_key,
        'stock:' || new.product_id::text || ':' || new.branch_id::text
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

drop trigger if exists trg_avisos_miembro_stock on public.stock_levels;
create trigger trg_avisos_miembro_stock
  after update of qty_on_hand, min_level on public.stock_levels
  for each row execute function public.fn_avisos_miembro_stock();
