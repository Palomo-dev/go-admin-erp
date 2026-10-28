-- Cierre de periodo: (1) no se cierra con borradores (journal_entries.posted = false) ni pendientes
-- (journal_entry_failures sin resolver) con fecha en el periodo; (2) reabrir exige motivo y guarda quién y cuándo
-- (reopened_by/reopened_at/reopen_reason); (3) fn_consecutivos_periodo: consecutivo por tipo de comprobante del
-- periodo con sus saltos. SIN APLICAR. Rollback: supabase/rollbacks/20261027212000_cierre_periodo_validaciones_rollback.sql
alter table public.fiscal_periods
  add column if not exists reopened_by uuid,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_reason text;

create or replace function public.fn_periodo_pendientes(p_organization_id integer, p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ini date;
  v_fin date;
  v_borr integer;
  v_pend integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select start_date, end_date into v_ini, v_fin from public.fiscal_periods
   where id = p_period_id and organization_id = p_organization_id;
  if v_ini is null then
    return jsonb_build_object('borradores', 0, 'pendientes', 0);
  end if;
  select count(*) into v_borr from public.journal_entries je
   where je.organization_id = p_organization_id and je.posted is not true
     and (je.entry_date at time zone 'America/Bogota')::date between v_ini and v_fin;
  select count(*) into v_pend from public.journal_entry_failures f
   where f.organization_id = p_organization_id and f.resolved_at is null
     and (f.entry_date at time zone 'America/Bogota')::date between v_ini and v_fin;
  return jsonb_build_object('borradores', v_borr, 'pendientes', v_pend);
end;
$function$;

create or replace function public.fn_consecutivos_periodo(p_organization_id integer, p_period_id uuid)
returns table (comprobante_tipo text, comprobante_prefijo text, cantidad integer, desde integer, hasta integer, saltos integer[])
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ini date;
  v_fin date;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select start_date, end_date into v_ini, v_fin from public.fiscal_periods
   where id = p_period_id and organization_id = p_organization_id;
  return query
  with je as (
    select coalesce(j.comprobante_tipo, 'sin_tipo') t, coalesce(j.comprobante_prefijo, '') p, j.comprobante_numero n
      from public.journal_entries j
     where j.organization_id = p_organization_id and j.comprobante_numero is not null
       and (j.entry_date at time zone 'America/Bogota')::date between v_ini and v_fin
  )
  select g.t, g.p, count(*)::integer, min(g.n), max(g.n),
         coalesce((select array_agg(s order by s) from generate_series(min(g.n), max(g.n)) s
                    where not exists (select 1 from je x where x.t = g.t and x.p = g.p and x.n = s)), '{}')
    from je g group by g.t, g.p order by 1, 2;
end;
$function$;

create or replace function public.fn_cierre_periodo(p_organization_id integer, p_period_id uuid, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_tipo text;
  v_anio integer;
  v_pend jsonb;
begin
  perform public.fn_exigir_permiso_contable(p_organization_id, 'accounting.period.close');
  v_pend := public.fn_periodo_pendientes(p_organization_id, p_period_id);
  if (v_pend->>'borradores')::integer > 0 or (v_pend->>'pendientes')::integer > 0 then
    raise exception 'periodo_con_pendientes: % borradores, % pendientes',
      v_pend->>'borradores', v_pend->>'pendientes' using errcode = '23514';
  end if;
  perform set_config('finanzas.cierre_autorizado', '1', true);
  update public.fiscal_periods
     set status = 'closed',
         closed_at = now(),
         closed_by = auth.uid(),
         notes = coalesce(nullif(btrim(p_notas), ''), notes),
         updated_at = now()
   where id = p_period_id
     and organization_id = p_organization_id
     and status = 'open'
  returning id, period_type, year into v_id, v_tipo, v_anio;
  if v_id is null then
    raise exception 'periodo_no_abierto' using errcode = '23514';
  end if;
  perform public.fn_auditar_cierre_contable(
    p_organization_id, 'fiscal_period', v_id::text, 'close',
    jsonb_build_object('anio', v_anio, 'period_type', v_tipo, 'origen', 'fn_cierre_periodo'));
  return jsonb_build_object('id', v_id, 'status', 'closed');
end;
$function$;

create or replace function public.fn_reabrir_periodo(p_organization_id integer, p_period_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_tipo text;
  v_anio integer;
  v_codigo text;
begin
  select fp.period_type, fp.year into v_tipo, v_anio
    from public.fiscal_periods fp
   where fp.id = p_period_id and fp.organization_id = p_organization_id and fp.status = 'closed';
  if v_tipo is null then
    perform public.fn_exigir_permiso_contable(p_organization_id, 'accounting.period.reopen');
    raise exception 'periodo_no_cerrado' using errcode = '23514';
  end if;
  v_codigo := case when v_tipo = 'yearly' then 'accounting.fiscal_year.reopen' else 'accounting.period.reopen' end;
  perform public.fn_exigir_permiso_contable(p_organization_id, v_codigo);
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '23514';
  end if;
  perform set_config('finanzas.cierre_autorizado', '1', true);
  update public.fiscal_periods
     set status = 'open', closed_at = null, closed_by = null,
         reopened_by = auth.uid(), reopened_at = now(), reopen_reason = btrim(p_motivo),
         updated_at = now()
   where id = p_period_id and organization_id = p_organization_id and status = 'closed'
  returning id into v_id;
  if v_id is null then
    raise exception 'periodo_no_cerrado' using errcode = '23514';
  end if;
  perform public.fn_auditar_cierre_contable(
    p_organization_id, case when v_tipo = 'yearly' then 'fiscal_year' else 'fiscal_period' end, v_id::text, 'reopen',
    jsonb_build_object('anio', v_anio, 'period_type', v_tipo, 'origen', 'fn_reabrir_periodo', 'motivo', btrim(p_motivo)));
  return jsonb_build_object('id', v_id, 'status', 'open');
end;
$function$;

-- La firma vieja (sin motivo) ya no reabre.
create or replace function public.fn_reabrir_periodo(p_organization_id integer, p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  raise exception 'motivo_obligatorio' using errcode = '23514';
end;
$function$;

revoke all on function public.fn_periodo_pendientes(integer, uuid) from public, anon;
revoke all on function public.fn_consecutivos_periodo(integer, uuid) from public, anon;
revoke all on function public.fn_reabrir_periodo(integer, uuid, text) from public, anon;
grant execute on function public.fn_periodo_pendientes(integer, uuid) to authenticated;
grant execute on function public.fn_consecutivos_periodo(integer, uuid) to authenticated;
grant execute on function public.fn_reabrir_periodo(integer, uuid, text) to authenticated;
