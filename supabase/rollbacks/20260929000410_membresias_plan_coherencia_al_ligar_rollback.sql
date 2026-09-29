-- Rollback de 20260929000410_membresias_plan_coherencia_al_ligar.sql
-- Devuelve fn_membership_plans_coherencia a la versión de 20260929000100 (guarda en cada UPDATE).
-- Con esa versión, cambiar un producto membresía a otro tipo vuelve a fallar (plan_producto_invalido).

create or replace function public.fn_membership_plans_coherencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.product_id is not null and not exists (
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
