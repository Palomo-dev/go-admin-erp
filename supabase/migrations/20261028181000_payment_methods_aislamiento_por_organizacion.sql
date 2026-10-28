-- 20261028181000 · Aislamiento por organización del catálogo payment_methods
-- NO APLICADA EN PROD: la aplica Juan tras revisarla.
-- payment_methods.organization_id integer NULL → organizations(id).
--   NULL  = método del sistema / catálogo común (cash, card, transfer, pasarelas…).
--   valor = método personalizado de esa organización (solo ella lo ve).
-- Relleno: solo los códigos NO del sistema que usa exactamente UNA organización en
-- organization_payment_methods. Los que usan varias (p. ej. wompi) quedan en NULL
-- y se listan en el reporte para que Juan decida. No toca pagos, movimientos ni saldos.

alter table public.payment_methods
  add column if not exists organization_id integer null
  references public.organizations(id) on delete set null;
comment on column public.payment_methods.organization_id is
  'Organización dueña de un método personalizado. NULL = método del sistema / catálogo común.';
create index if not exists idx_payment_methods_organization_id
  on public.payment_methods (organization_id) where organization_id is not null;

update public.payment_methods pm
   set organization_id = d.organization_id
  from (
    select opm.payment_method_code, min(opm.organization_id) as organization_id
      from public.organization_payment_methods opm
     group by opm.payment_method_code
    having count(distinct opm.organization_id) = 1
  ) d
 where d.payment_method_code = pm.code
   and coalesce(pm.is_system, false) = false
   and pm.organization_id is null;

-- RLS de lectura: sistema + los propios. Los NULL no del sistema siguen la regla de
-- hoy (visibles a quien los tenga en organization_payment_methods).
drop policy if exists payment_methods_select_policy_v2 on public.payment_methods;
drop policy if exists payment_methods_select_policy_v3 on public.payment_methods;
create policy payment_methods_select_policy_v3 on public.payment_methods
  for select using (
    is_system = true
    or (organization_id is not null and organization_id in (
          select om.organization_id from public.organization_members om
           where om.user_id = (select auth.uid()) and om.is_active))
    or (organization_id is null and code in (
          select opm.payment_method_code from public.organization_payment_methods opm
           where opm.organization_id in (
             select om.organization_id from public.organization_members om
              where om.user_id = (select auth.uid()))))
  );

-- Alta de un método personalizado: guarda la organización que lo crea.
create or replace function public.fn_metodo_pago_personalizado_crear(p_organization_id integer, p_code text, p_name text, p_requires_reference boolean DEFAULT false)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_codigo text := btrim(coalesce(p_code, ''));
  v_nombre text := btrim(coalesce(p_name, ''));
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['billing_management']);

  if v_codigo !~ '^[A-Za-z0-9_-]{2,40}$' then
    raise exception 'codigo_invalido' using errcode = '22023';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  -- El código sigue siendo la llave global (FK de organization_payment_methods y pagos).
  if exists (select 1 from public.payment_methods pm where lower(pm.code) = lower(v_codigo)) then
    raise exception 'codigo_existe' using errcode = '23505';
  end if;

  insert into public.payment_methods (code, name, requires_reference, is_active, is_system, organization_id)
  values (v_codigo, v_nombre, coalesce(p_requires_reference, false), true, false, p_organization_id);

  insert into public.organization_payment_methods (organization_id, payment_method_code, is_active, settings)
  values (p_organization_id, v_codigo, true,
          jsonb_build_object('display_name', v_nombre, 'requires_reference', coalesce(p_requires_reference, false)))
  on conflict (organization_id, payment_method_code) do nothing;

  return v_codigo;
end;
$function$;

-- Una organización no puede activar el método personalizado de otra.
create or replace function public.fn_opm_validar_metodo_propio()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_duena integer;
begin
  select pm.organization_id into v_duena from public.payment_methods pm where pm.code = new.payment_method_code;
  if v_duena is not null and v_duena <> new.organization_id then
    raise exception 'El método de pago % es personalizado de otra organización', new.payment_method_code
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_opm_validar_metodo_propio on public.organization_payment_methods;
create trigger trg_opm_validar_metodo_propio
  before insert or update of payment_method_code, organization_id on public.organization_payment_methods
  for each row execute function public.fn_opm_validar_metodo_propio();
