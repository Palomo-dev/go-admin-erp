-- Rollback de 20261027212000: vuelve fn_cierre_periodo y fn_reabrir_periodo(2 args) a la versión anterior.
-- Las columnas reopened_* se conservan (no se pierde la auditoría); bórrelas a mano si hace falta.
begin;
drop function if exists public.fn_reabrir_periodo(integer, uuid, text);
drop function if exists public.fn_consecutivos_periodo(integer, uuid);
create or replace function public.fn_cierre_periodo(p_organization_id integer, p_period_id uuid, p_notas text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid; v_tipo text; v_anio integer;
begin
  perform public.fn_exigir_permiso_contable(p_organization_id, 'accounting.period.close');
  perform set_config('finanzas.cierre_autorizado', '1', true);
  update public.fiscal_periods set status = 'closed', closed_at = now(), closed_by = auth.uid(),
         notes = coalesce(nullif(btrim(p_notas), ''), notes), updated_at = now()
   where id = p_period_id and organization_id = p_organization_id and status = 'open'
  returning id, period_type, year into v_id, v_tipo, v_anio;
  if v_id is null then raise exception 'periodo_no_abierto' using errcode = '23514'; end if;
  perform public.fn_auditar_cierre_contable(p_organization_id, 'fiscal_period', v_id::text, 'close',
    jsonb_build_object('anio', v_anio, 'period_type', v_tipo, 'origen', 'fn_cierre_periodo'));
  return jsonb_build_object('id', v_id, 'status', 'closed');
end;
$function$;
drop function if exists public.fn_periodo_pendientes(integer, uuid);
create or replace function public.fn_reabrir_periodo(p_organization_id integer, p_period_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid; v_tipo text; v_anio integer; v_codigo text;
begin
  select fp.period_type, fp.year into v_tipo, v_anio from public.fiscal_periods fp
   where fp.id = p_period_id and fp.organization_id = p_organization_id and fp.status = 'closed';
  if v_tipo is null then
    perform public.fn_exigir_permiso_contable(p_organization_id, 'accounting.period.reopen');
    raise exception 'periodo_no_cerrado' using errcode = '23514';
  end if;
  v_codigo := case when v_tipo = 'yearly' then 'accounting.fiscal_year.reopen' else 'accounting.period.reopen' end;
  perform public.fn_exigir_permiso_contable(p_organization_id, v_codigo);
  perform set_config('finanzas.cierre_autorizado', '1', true);
  update public.fiscal_periods set status = 'open', closed_at = null, closed_by = null, updated_at = now()
   where id = p_period_id and organization_id = p_organization_id and status = 'closed'
  returning id into v_id;
  if v_id is null then raise exception 'periodo_no_cerrado' using errcode = '23514'; end if;
  perform public.fn_auditar_cierre_contable(p_organization_id,
    case when v_tipo = 'yearly' then 'fiscal_year' else 'fiscal_period' end, v_id::text, 'reopen',
    jsonb_build_object('anio', v_anio, 'period_type', v_tipo, 'origen', 'fn_reabrir_periodo'));
  return jsonb_build_object('id', v_id, 'status', 'open');
end;
$function$;
delete from supabase_migrations.schema_migrations where version = '20261027212000';
commit;
