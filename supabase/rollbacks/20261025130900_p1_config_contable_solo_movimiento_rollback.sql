-- Rollback de 130900: versión viva al 25-oct-2026.
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
      and c.es_movimiento is distinct from false
  ) then
    raise exception 'La cuenta % no es de movimiento en el plan de la organización', new.account_code
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$function$

;
