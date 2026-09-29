-- Membresías — corrección de fn_membership_plans_coherencia (20260929000100).
--
-- La guarda «el producto del plan es de la organización y de tipo membresía» se evaluaba en cada
-- UPDATE del plan. Cuando un producto deja de ser membresía, fn_producto_guardar desactiva su plan
-- (is_active = false) y la guarda lo rechazaba, así que el cambio de tipo era imposible. La guarda
-- se evalúa ahora solo al LIGAR el plan a un producto (INSERT o cambio de product_id).

create or replace function public.fn_membership_plans_coherencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.product_id is not null
     and (tg_op = 'INSERT' or new.product_id is distinct from old.product_id)
     and not exists (
       select 1 from public.products p
        where p.id = new.product_id and p.organization_id = new.organization_id
          and p.service_type = 'membership') then
    raise exception 'plan_producto_invalido' using errcode = '23514',
      detail = 'El producto del plan debe ser de la misma organización y de tipo membresía';
  end if;
  if new.duration_value is null then
    new.duration_value := greatest(coalesce(new.duration_days, 30), 1);
    new.duration_unit := 'day';
  end if;
  new.duration_days := case new.duration_unit
    when 'day' then new.duration_value
    when 'week' then new.duration_value * 7
    when 'month' then new.duration_value * 30
    when 'year' then new.duration_value * 365
  end;
  new.updated_at := now();
  return new;
end;
$$;
