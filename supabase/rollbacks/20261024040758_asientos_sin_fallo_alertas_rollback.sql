-- Quita el cron, la visibilidad de soporte y los triggers de cabecera.
-- fn_alertas_contables vuelve a devolver fallos y asientos sin líneas
-- a cualquier usuario de la organización. No reabre fallos ni recrea asientos.

do $rb_cron$
begin
  if exists (select 1 from cron.job where jobname = 'reintentar-fallos-asiento') then
    perform cron.unschedule('reintentar-fallos-asiento');
  end if;
end;
$rb_cron$;

drop trigger if exists trg_asiento_exige_lineas on public.journal_entries;
drop trigger if exists trg_linea_no_deja_asiento_vacio on public.journal_lines;
drop function if exists public.fn_trg_asiento_exige_lineas();
drop function if exists public.fn_trg_linea_no_deja_asiento_vacio();
drop function if exists public.fn_ve_fallos_contables();

create or replace function public.fn_alertas_contables(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_fallos jsonb;
  v_sin_lineas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

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

  return jsonb_build_object(
    'fallos', v_fallos,
    'asientos_sin_lineas', v_sin_lineas
  );
end;
$$;

comment on function public.fn_alertas_contables(integer) is
  'Fallos contables sin resolver y asientos sin líneas de la organización. La pertenencia la exige fn_assert_acceso_org.';

revoke all on function public.fn_alertas_contables(integer) from public, anon;
grant execute on function public.fn_alertas_contables(integer) to authenticated, service_role;
