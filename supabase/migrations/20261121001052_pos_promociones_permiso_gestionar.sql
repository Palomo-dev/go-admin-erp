-- Permiso `pos.promociones.gestionar` (aprobado por el dueño el 2026-11-20).
--
-- Igual que `pos.cupones.gestionar` (20261120181551):
-- 1. El permiso, para Admin de organización (2) y Manager (5). El Super Admin
--    (`is_super_admin`) ya tiene todos. Un cargo puede concederlo o quitarlo.
-- 2. Guarda en `promotions` y `promotion_rules`: crear, editar o borrar con
--    sesión exige el permiso. Sin sesión (service role de la tienda web,
--    tareas internas) no se exige.
-- 3. El canje no lo exige: `increment_promotion_usage` solo cambia
--    `usage_count` y `updated_at`, y esa actualización pasa sin permiso.
-- Aditiva: no cambia columnas ni datos.

-- ── 1. Permiso ─────────────────────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select 'pos.promociones.gestionar', 'Gestionar promociones',
       'Crear, editar, activar, duplicar y eliminar promociones y sus reglas',
       'pos', 'promociones'
where not exists (select 1 from public.permissions where code = 'pos.promociones.gestionar');

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (2), (5)) as r(role_id)
 where p.code = 'pos.promociones.gestionar'
   and not exists (select 1 from public.role_permissions rp
                    where rp.role_id = r.role_id and rp.permission_id = p.id);

-- ── 2. Guarda de `promotions` ──────────────────────────────────────────────
create or replace function public.fn_promotions_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'La organización de una promoción no cambia' using errcode = '42501';
  end if;

  -- Uso: solo cambia el contador (increment_promotion_usage). Sin permiso.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'usage_count' - 'updated_at') = (to_jsonb(old) - 'usage_count' - 'updated_at') then
    return new;
  end if;

  if auth.uid() is not null and not public.fn_tiene_permiso(v_org, 'pos.promociones.gestionar') then
    raise exception 'Sin permiso para gestionar promociones' using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_promotions_guarda on public.promotions;
create trigger trg_promotions_guarda
  before insert or update or delete on public.promotions
  for each row execute function public.fn_promotions_guarda();

-- ── 3. Guarda de `promotion_rules` ─────────────────────────────────────────
create or replace function public.fn_promotion_rules_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promo uuid := case when tg_op = 'DELETE' then old.promotion_id else new.promotion_id end;
  v_org integer;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select organization_id into v_org from public.promotions where id = v_promo;
  -- Al borrar la promoción, sus reglas caen en cascada: la guarda de
  -- `promotions` ya exigió el permiso.
  if v_org is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not public.fn_tiene_permiso(v_org, 'pos.promociones.gestionar') then
    raise exception 'Sin permiso para gestionar promociones' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_promotion_rules_guarda on public.promotion_rules;
create trigger trg_promotion_rules_guarda
  before insert or update or delete on public.promotion_rules
  for each row execute function public.fn_promotion_rules_guarda();

revoke all on function public.fn_promotions_guarda() from public, anon, authenticated;
revoke all on function public.fn_promotion_rules_guarda() from public, anon, authenticated;
