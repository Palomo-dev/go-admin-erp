do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'reintentar-fallos-asiento') then
    perform cron.unschedule('reintentar-fallos-asiento');
  end if;
  perform cron.schedule(
    'reintentar-fallos-asiento',
    '*/15 * * * *',
    $cmd$select public.fn_reintentar_fallos_asiento()$cmd$
  );
end;
$cron$;

create or replace function public.fn_ve_fallos_contables()
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $fn$
  select exists (
    select 1
      from public.platform_admins pa
     where pa.user_id = auth.uid()
       and pa.status = 'active'
       and pa.role in ('super_admin', 'superadmin', 'soporte', 'support')
  );
$fn$;

revoke all on function public.fn_ve_fallos_contables() from public, anon;
grant execute on function public.fn_ve_fallos_contables() to authenticated, service_role;

create or replace function public.fn_alertas_contables(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_fallos jsonb := '[]'::jsonb;
  v_sin_lineas jsonb := '[]'::jsonb;
  v_borradores jsonb;
  v_ve boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  v_ve := public.fn_ve_fallos_contables();

  if v_ve then
    select coalesce(jsonb_agg(x.fila), '[]'::jsonb) into v_fallos
      from (
        select jsonb_build_object(
          'id', f.id,
          'fecha', f.entry_date,
          'origen', f.source,
          'origen_id', f.source_id,
          'debito', f.debit_account,
          'credito', f.credit_account,
          'importe', f.amount,
          'motivo', f.reason,
          'detalle', f.detail
        ) as fila
          from public.journal_entry_failures f
         where f.organization_id = p_organization_id
           and f.resolved_at is null
         order by f.created_at desc
         limit 50
      ) x;

    select coalesce(jsonb_agg(x.fila), '[]'::jsonb) into v_sin_lineas
      from (
        select jsonb_build_object(
          'id', je.id,
          'fecha', je.entry_date,
          'memo', je.memo,
          'origen', je.source,
          'publicado', je.posted
        ) as fila
          from public.journal_entries je
         where je.organization_id = p_organization_id
           and not exists (
             select 1 from public.journal_lines jl where jl.journal_entry_id = je.id
           )
         order by je.id desc
         limit 50
      ) x;
  end if;

  select coalesce(jsonb_agg(x.fila), '[]'::jsonb) into v_borradores
    from (
      select jsonb_build_object(
        'id', je.id,
        'fecha', je.entry_date,
        'memo', je.memo,
        'importe', round(coalesce(sum(jl.debit), 0), 0)
      ) as fila
        from public.journal_entries je
        join public.journal_lines jl on jl.journal_entry_id = je.id
       where je.organization_id = p_organization_id
         and je.posted is false
       group by je.id
      having round(coalesce(sum(jl.debit), 0), 0) >= 1
       order by je.id desc
       limit 20
    ) x;

  return jsonb_build_object(
    've_tecnicos', v_ve,
    'fallos', v_fallos,
    'asientos_sin_lineas', v_sin_lineas,
    'borradores', v_borradores
  );
end;
$fn$;

create or replace function public.fn_trg_asiento_exige_lineas()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
begin
  if not exists (select 1 from public.journal_entries e where e.id = new.id) then
    return null;
  end if;
  if not exists (select 1 from public.journal_lines l where l.journal_entry_id = new.id) then
    raise exception 'asiento_sin_lineas' using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create or replace function public.fn_trg_linea_no_deja_asiento_vacio()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
begin
  if exists (select 1 from public.journal_entries e where e.id = old.journal_entry_id)
     and not exists (
       select 1 from public.journal_lines l where l.journal_entry_id = old.journal_entry_id
     ) then
    raise exception 'asiento_sin_lineas' using errcode = '23514';
  end if;
  return null;
end;
$fn$;

revoke all on function public.fn_trg_asiento_exige_lineas() from public, anon, authenticated;
revoke all on function public.fn_trg_linea_no_deja_asiento_vacio() from public, anon, authenticated;

drop trigger if exists trg_asiento_exige_lineas on public.journal_entries;
create constraint trigger trg_asiento_exige_lineas
after insert or update on public.journal_entries
deferrable initially deferred
for each row
execute function public.fn_trg_asiento_exige_lineas();

drop trigger if exists trg_linea_no_deja_asiento_vacio on public.journal_lines;
create constraint trigger trg_linea_no_deja_asiento_vacio
after delete or update on public.journal_lines
deferrable initially deferred
for each row
execute function public.fn_trg_linea_no_deja_asiento_vacio();
