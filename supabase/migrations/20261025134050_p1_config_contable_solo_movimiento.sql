-- P1 (25-oct-2026): fn_configuracion_contable_validar — revisión. NO aplicada.
-- La versión viva ya rechaza (23514) una cuenta con es_movimiento = false o inexistente en la org, en
-- INSERT y UPDATE (trg_configuracion_contable_validar BEFORE INSERT OR UPDATE). Huecos encontrados:
--   a) es_movimiento NULL pasaba como movimiento (4.564 cuentas con NULL al 25-oct), aunque tuviera hijos;
--   b) cuentas inactivas (is_active/activa = false) se aceptaban.
-- Ahora: NULL solo se acepta si la cuenta no tiene hijos; inactivas se rechazan. Mismo errcode 23514.
-- Rollback: supabase/rollbacks/20261025134050_p1_config_contable_solo_movimiento_rollback.sql

CREATE OR REPLACE FUNCTION public.fn_configuracion_contable_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = new.branch_id and b.organization_id = new.organization_id
  ) then
    raise exception 'La sede no pertenece a la organización'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = new.organization_id
      and c.account_code = new.account_code
      and coalesce(c.is_active, true) and coalesce(c.activa, true)
      and (
        c.es_movimiento is true
        or (c.es_movimiento is null and not exists (
              select 1 from public.chart_of_accounts h
              where h.organization_id = c.organization_id and h.parent_code = c.account_code))
      )
  ) then
    raise exception 'La cuenta % no es de movimiento (o está inactiva) en el plan de la organización', new.account_code
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;
