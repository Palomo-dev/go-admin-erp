alter table public.sale_items
  add column if not exists promo_excluded boolean not null default false,
  add column if not exists promo_excluded_by uuid,
  add column if not exists promo_excluded_at timestamptz,
  add column if not exists promo_excluded_reason text;

alter table public.web_order_items
  add column if not exists promo_excluded boolean not null default false,
  add column if not exists promo_excluded_by uuid,
  add column if not exists promo_excluded_at timestamptz,
  add column if not exists promo_excluded_reason text;

comment on column public.sale_items.promo_excluded is
  'La línea no recibe promoción automática. El descuento manual sigue. Por defecto false.';
comment on column public.sale_items.promo_excluded_by is
  'Usuario que quitó la promoción de la línea.';
comment on column public.sale_items.promo_excluded_at is
  'Momento en que se quitó la promoción de la línea.';
comment on column public.sale_items.promo_excluded_reason is
  'Motivo opcional, hasta 240 caracteres.';
comment on column public.web_order_items.promo_excluded is
  'La línea no recibe promoción automática. Por defecto false.';
comment on column public.web_order_items.promo_excluded_by is
  'Usuario que quitó la promoción de la línea del pedido.';
comment on column public.web_order_items.promo_excluded_at is
  'Momento en que se quitó la promoción de la línea del pedido.';
comment on column public.web_order_items.promo_excluded_reason is
  'Motivo opcional, hasta 240 caracteres.';

insert into public.permissions (code, name, description, module, category)
values (
  'pos.promotions.remove',
  'Quitar promoción de una línea',
  'Quita o restaura la promoción automática de una línea de venta, mesa o pedido.',
  'pos',
  'pos'
)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      module = excluded.module,
      category = excluded.category;

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (1), (2)) as r(role_id)
 where p.code = 'pos.promotions.remove'
   and not exists (
     select 1 from public.role_permissions rp
      where rp.role_id = r.role_id and rp.permission_id = p.id
   );

-- Administrador (rol 1 o 2, o super admin) o el permiso en el rol o el cargo.
-- El cargo, si menciona el código, manda sobre el rol. Misma precedencia que
-- get_user_permission_codes, con el atajo de administrador de orgContext.
create or replace function public.fn_pos_puede_quitar_promocion(p_org integer, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select p_user is not null
     and exists (
       select 1
         from public.organization_members om
        where om.user_id = p_user
          and om.organization_id = p_org
          and om.is_active
          and (
            coalesce(om.is_super_admin, false)
            or om.role_id in (1, 2)
            or coalesce(
              (
                select jpp.allowed
                  from public.job_position_permissions jpp
                  join public.permissions p on p.id = jpp.permission_id
                 where jpp.job_position_id = om.job_position_id
                   and p.code = 'pos.promotions.remove'
              ),
              (
                select rp.allowed
                  from public.role_permissions rp
                  join public.permissions p on p.id = rp.permission_id
                 where rp.role_id = om.role_id
                   and p.code = 'pos.promotions.remove'
              ),
              false
            )
          )
     );
$function$;

comment on function public.fn_pos_puede_quitar_promocion(integer, uuid) is
  '¿Este usuario puede quitar la promoción de una línea en la organización? Rol 1, rol 2, super admin o pos.promotions.remove.';

revoke all on function public.fn_pos_puede_quitar_promocion(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_pos_puede_quitar_promocion(integer, uuid) to service_role;

create or replace function public.pos_linea_excluir_promocion(
  p_sale_item_id uuid,
  p_excluded boolean,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_si    public.sale_items%rowtype;
  v_sale  public.sales%rowtype;
  v_notas jsonb;
  v_motivo text;
  v_nombres text;
  v_promo uuid;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_si from public.sale_items where id = p_sale_item_id for update;
  if not found then
    raise exception 'linea_no_encontrada' using errcode = 'P0002';
  end if;
  select * into v_sale from public.sales where id = v_si.sale_id for update;
  if not found then
    raise exception 'venta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  if not public.app_branch_access(v_sale.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if not public.fn_pos_puede_quitar_promocion(v_sale.organization_id, auth.uid()) then
    raise exception 'sin_permiso_quitar_promocion' using errcode = '42501';
  end if;
  if v_sale.status not in ('pending', 'draft', 'partial') then
    raise exception 'venta_cerrada' using errcode = '22023';
  end if;
  if v_sale.payment_status = 'paid' then
    raise exception 'venta_pagada' using errcode = '22023';
  end if;

  v_notas := case when jsonb_typeof(v_si.notes) = 'object' then v_si.notes else '{}'::jsonb end;
  v_motivo := nullif(left(btrim(coalesce(p_reason, '')), 240), '');
  v_promo := null;
  if jsonb_typeof(v_notas->'promociones') = 'array' and jsonb_array_length(v_notas->'promociones') > 0 then
    begin
      v_promo := (v_notas->'promociones'->>0)::uuid;
    exception when others then
      v_promo := null;
    end;
  end if;
  select string_agg(p.name, ', ' order by p.name) into v_nombres
    from public.promotions p
   where p.organization_id = v_sale.organization_id
     and jsonb_typeof(v_notas->'promociones') = 'array'
     and v_notas->'promociones' ? p.id::text;

  update public.sale_items set
    promo_excluded = coalesce(p_excluded, false),
    promo_excluded_by = case when coalesce(p_excluded, false) then auth.uid() else null end,
    promo_excluded_at = case when coalesce(p_excluded, false) then now() else null end,
    promo_excluded_reason = case when coalesce(p_excluded, false) then v_motivo else null end,
    updated_at = now()
  where id = p_sale_item_id;

  insert into public.ops_audit_log (
    organization_id, branch_id, user_id, entity_type, entity_id, action, metadata
  ) values (
    v_sale.organization_id,
    v_sale.branch_id,
    auth.uid(),
    'sale',
    v_sale.id::text,
    case when coalesce(p_excluded, false) then 'promo_excluded' else 'promo_restored' end,
    jsonb_build_object(
      'sale_item_id', p_sale_item_id,
      'product_id', v_si.product_id,
      'promotion_id', v_promo,
      'promotion_name', v_nombres,
      'amount', coalesce(v_si.discount_amount, 0),
      'reason', v_motivo
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'sale_item_id', p_sale_item_id,
    'promo_excluded', coalesce(p_excluded, false)
  );
end;
$function$;

comment on function public.pos_linea_excluir_promocion(uuid, boolean, text) is
  'Quita o restaura la promoción de una línea de venta abierta. Exige pos.promotions.remove (o administrador) y deja el registro en ops_audit_log.';

revoke all on function public.pos_linea_excluir_promocion(uuid, boolean, text) from public, anon;
grant execute on function public.pos_linea_excluir_promocion(uuid, boolean, text) to authenticated, service_role;
