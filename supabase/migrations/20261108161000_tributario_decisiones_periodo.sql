-- P8 del Contador, ronda 2 (docs/contador/RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md, «Varias vigencias en un período»):
-- la alerta «cambio de vigencia dentro del período» se puede CERRAR con una decisión sustentada (quién, fundamento,
-- alcance, fecha), conservando la historia. Si cambia información relevante (las vigencias que tocan el período), la
-- decisión deja de aplicar y la alerta se REABRE. Ni bloqueo eterno ni borrar la historia.
-- ESCRITA, NO APLICADA. Se aplica por el MCP después de 20261108160500.
-- Reversión: supabase/rollbacks/20261108161000_tributario_decisiones_periodo_rollback.sql
--
-- `huella` = resumen de las vigencias que tocan el período al decidir (id, fechas y última modificación de cada una),
-- calculado en el servidor (src/lib/finanzas/tributario/vigenciasPeriodo.ts). Al leer, si la huella actual no coincide,
-- la decisión se muestra como «reabierta» (no se borra ni se edita).
-- Solo inserción por fn_tributario_decision_periodo_registrar (finance.approve o admin.full_access); nadie edita ni
-- borra; una decisión nueva sobre el mismo período deja la anterior en la historia (`reemplaza_a`).
--
-- RONDA 5 DEL CONTADOR (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md, respuesta 6), reescrita sin
-- aplicar. Gran contribuyente con efectos a mitad de bimestre: la norma no regula el caso (Res. 227 de 2025, art.
-- 1.1.4.3), así que la decisión tiene que dejar escrito todo lo que se resolvió. fn_tributario_transicion_gc_registrar
-- guarda en `detalle` (columna nueva, jsonb) y exige:
--   · la resolución con su fecha y la fecha de efectos (deben ser las del perfil de la vigencia);
--   · los períodos de IVA (bimestre, cuatrimestre o año, sin cruzar años) y de retención en la fuente (meses) afectados,
--     y que alguno de cada uno contenga la fecha de efectos;
--   · qué se hace con el tramo anterior y con el posterior a la fecha de efectos;
--   · el responsable y el soporte (referencia y fecha).
-- Con ella, la aclaración 'gran_contribuyente_transicion_por_resolver' de la vigencia se cierra (y vuelve si cambian la
-- fecha de la resolución o la de efectos: 20261108160500). El sistema no decide el corte: lo registra.

create table if not exists public.tax_period_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  obligacion text not null check (obligacion ~ '^[a-z][a-z0-9_:.-]{1,80}$'),
  periodo_desde date not null,
  periodo_hasta date not null,
  decision text not null check (length(btrim(decision)) between 3 and 2000),
  fundamento text not null check (length(btrim(fundamento)) between 3 and 2000),
  alcance text not null check (length(btrim(alcance)) between 3 and 1000),
  vigencia_aplicada_id uuid references public.organization_tax_profiles(id) on delete set null,
  huella text not null check (length(huella) between 1 and 4000),
  reemplaza_a uuid references public.tax_period_decisions(id),
  -- Ronda 5: datos estructurados de decisiones especiales (transición del gran contribuyente). NULL en las demás.
  detalle jsonb check (detalle is null or jsonb_typeof(detalle) = 'object'),
  decidido_por uuid not null,
  decidido_en timestamptz not null default now(),
  constraint tax_period_decisions_rango check (periodo_hasta >= periodo_desde)
);

comment on table public.tax_period_decisions is
  'Decisiones sustentadas que cierran la alerta «cambio de vigencia dentro del período» (P8). Solo inserción; historia completa. La alerta se reabre si cambia la huella de las vigencias.';

create index if not exists idx_tax_period_decisions_periodo
  on public.tax_period_decisions (organization_id, obligacion, periodo_desde, periodo_hasta, decidido_en desc);

alter table public.tax_period_decisions enable row level security;

drop policy if exists tax_period_decisions_select_miembros on public.tax_period_decisions;
create policy tax_period_decisions_select_miembros
  on public.tax_period_decisions
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

revoke all on public.tax_period_decisions from anon;
revoke insert, update, delete, truncate, references, trigger on public.tax_period_decisions from authenticated;
grant select on public.tax_period_decisions to authenticated;

create or replace function public.fn_tributario_decision_periodo_registrar(
  p_organization_id integer,
  p_obligacion text,
  p_desde date,
  p_hasta date,
  p_decision text,
  p_fundamento text,
  p_alcance text,
  p_vigencia_aplicada_id uuid,
  p_huella text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_anterior uuid;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.approve')
    or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_vigencia_aplicada_id is not null and not exists (
    select 1 from public.organization_tax_profiles where id = p_vigencia_aplicada_id and organization_id = p_organization_id
  ) then
    raise exception 'VIGENCIA_INVALIDA' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('tax_period_decisions'), p_organization_id);
  select id into v_anterior
    from public.tax_period_decisions
   where organization_id = p_organization_id and obligacion = p_obligacion and periodo_desde = p_desde and periodo_hasta = p_hasta
   order by decidido_en desc
   limit 1;

  insert into public.tax_period_decisions (
    organization_id, obligacion, periodo_desde, periodo_hasta, decision, fundamento, alcance, vigencia_aplicada_id,
    huella, reemplaza_a, decidido_por
  ) values (
    p_organization_id, p_obligacion, p_desde, p_hasta, btrim(p_decision), btrim(p_fundamento), btrim(p_alcance),
    p_vigencia_aplicada_id, p_huella, v_anterior, auth.uid()
  ) returning id into v_id;
  return v_id;
exception
  when check_violation then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
end;
$function$;

comment on function public.fn_tributario_decision_periodo_registrar(integer, text, date, date, text, text, text, uuid, text) is
  'Registra la decisión sustentada que cierra la alerta de varias vigencias en un período (P8). finance.approve o admin.full_access.';

revoke all on function public.fn_tributario_decision_periodo_registrar(integer, text, date, date, text, text, text, uuid, text) from public, anon;
grant execute on function public.fn_tributario_decision_periodo_registrar(integer, text, date, date, text, text, text, uuid, text) to authenticated;

-- Ronda 5: decisión de la transición del gran contribuyente con efectos a mitad de bimestre.
-- p_datos: { resolucion, resolucion_fecha, fecha_efectos, periodos_iva: [{desde, hasta}], periodos_retencion: [{desde, hasta}],
--            tramo_anterior, tramo_posterior, responsable, soporte: { referencia, fecha }, fundamento }
create or replace function public.fn_tributario_transicion_gc_registrar(p_organization_id integer, p_vigencia_id uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  d jsonb := coalesce(p_datos, '{}'::jsonb);
  v_vig public.organization_tax_profiles;
  v_res text := nullif(btrim(coalesce(d ->> 'resolucion', '')), '');
  v_res_fecha date;
  v_efectos date;
  v_ant text := nullif(btrim(coalesce(d ->> 'tramo_anterior', '')), '');
  v_post text := nullif(btrim(coalesce(d ->> 'tramo_posterior', '')), '');
  v_resp text := nullif(btrim(coalesce(d ->> 'responsable', '')), '');
  v_sop_ref text := nullif(btrim(coalesce(d #>> '{soporte,referencia}', '')), '');
  v_sop_fecha date;
  v_fund text := nullif(btrim(coalesce(d ->> 'fundamento', '')), '');
  v_iva jsonb;
  v_ret jsonb;
  v_p record;
  v_meses integer;
  v_desde date;
  v_hasta date;
  v_anterior uuid;
  v_id uuid;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.approve')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if jsonb_typeof(d) <> 'object' then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  begin
    v_res_fecha := nullif(d ->> 'resolucion_fecha', '')::date;
    v_efectos := nullif(d ->> 'fecha_efectos', '')::date;
    v_sop_fecha := nullif(d #>> '{soporte,fecha}', '')::date;
  exception when others then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end;

  select * into v_vig from public.organization_tax_profiles p where p.id = p_vigencia_id and p.organization_id = p_organization_id;
  if v_vig.id is null then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  -- Solo para la calificación excepcional con efectos que no caen al inicio de un bimestre.
  if v_vig.gran_contribuyente is not true or v_vig.gran_contribuyente_calificacion is distinct from 'excepcional'
     or v_vig.gran_contribuyente_desde is null
     or (extract(day from v_vig.gran_contribuyente_desde) = 1 and extract(month from v_vig.gran_contribuyente_desde)::int in (1, 3, 5, 7, 9, 11)) then
    raise exception 'TRANSICION_NO_APLICA' using errcode = '22023';
  end if;
  -- La resolución, su fecha y la fecha de efectos son las del perfil (no otras).
  if v_res is null or v_res_fecha is null or v_efectos is null then
    raise exception 'RESOLUCION_REQUERIDA' using errcode = '22023';
  end if;
  if lower(v_res) is distinct from lower(btrim(coalesce(v_vig.gran_contribuyente_acto, '')))
     or v_res_fecha is distinct from v_vig.gran_contribuyente_acto_fecha
     or v_efectos is distinct from v_vig.gran_contribuyente_desde then
    raise exception 'TRANSICION_NO_COINCIDE_CON_PERFIL' using errcode = '22023';
  end if;

  -- Períodos de IVA: cada uno es un período fiscal (bimestre, cuatrimestre o año, completo y sin cruzar años); alguno
  -- contiene la fecha de efectos.
  v_iva := d -> 'periodos_iva';
  if jsonb_typeof(v_iva) is distinct from 'array' or jsonb_array_length(v_iva) = 0 or jsonb_array_length(v_iva) > 12 then
    raise exception 'PERIODOS_IVA_INVALIDOS' using errcode = '22023';
  end if;
  for v_p in select nullif(x ->> 'desde', '') as desde, nullif(x ->> 'hasta', '') as hasta from jsonb_array_elements(v_iva) x loop
    begin
      v_desde := v_p.desde::date; v_hasta := v_p.hasta::date;
    exception when others then
      raise exception 'PERIODOS_IVA_INVALIDOS' using errcode = '22023';
    end;
    v_meses := (extract(year from v_hasta)::int * 12 + extract(month from v_hasta)::int)
             - (extract(year from v_desde)::int * 12 + extract(month from v_desde)::int) + 1;
    if v_desde is null or v_hasta is null or extract(day from v_desde) <> 1
       or v_hasta <> (date_trunc('month', v_hasta) + interval '1 month - 1 day')::date
       or extract(year from v_desde) <> extract(year from v_hasta)
       or not ((v_meses = 2 and extract(month from v_desde)::int in (1, 3, 5, 7, 9, 11))
            or (v_meses = 4 and extract(month from v_desde)::int in (1, 5, 9))
            or (v_meses = 12 and extract(month from v_desde)::int = 1)) then
      raise exception 'PERIODOS_IVA_INVALIDOS' using errcode = '22023';
    end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(v_iva) x where v_efectos between (x ->> 'desde')::date and (x ->> 'hasta')::date) then
    raise exception 'PERIODOS_IVA_INVALIDOS' using errcode = '22023', detail = 'ninguno_contiene_la_fecha_de_efectos';
  end if;

  -- Períodos de retención en la fuente: meses completos; alguno contiene la fecha de efectos.
  v_ret := d -> 'periodos_retencion';
  if jsonb_typeof(v_ret) is distinct from 'array' or jsonb_array_length(v_ret) = 0 or jsonb_array_length(v_ret) > 24 then
    raise exception 'PERIODOS_RETENCION_INVALIDOS' using errcode = '22023';
  end if;
  for v_p in select nullif(x ->> 'desde', '') as desde, nullif(x ->> 'hasta', '') as hasta from jsonb_array_elements(v_ret) x loop
    begin
      v_desde := v_p.desde::date; v_hasta := v_p.hasta::date;
    exception when others then
      raise exception 'PERIODOS_RETENCION_INVALIDOS' using errcode = '22023';
    end;
    if v_desde is null or v_hasta is null or extract(day from v_desde) <> 1
       or v_hasta <> (date_trunc('month', v_desde) + interval '1 month - 1 day')::date then
      raise exception 'PERIODOS_RETENCION_INVALIDOS' using errcode = '22023';
    end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(v_ret) x where v_efectos between (x ->> 'desde')::date and (x ->> 'hasta')::date) then
    raise exception 'PERIODOS_RETENCION_INVALIDOS' using errcode = '22023', detail = 'ninguno_contiene_la_fecha_de_efectos';
  end if;

  if char_length(coalesce(v_ant, '')) not between 20 and 2000 or char_length(coalesce(v_post, '')) not between 20 and 2000 then
    raise exception 'TRAMO_REQUERIDO' using errcode = '22023';
  end if;
  if char_length(coalesce(v_resp, '')) not between 3 and 200 then
    raise exception 'RESPONSABLE_REQUERIDO' using errcode = '22023';
  end if;
  if char_length(coalesce(v_sop_ref, '')) not between 3 and 300 or v_sop_fecha is null then
    raise exception 'SOPORTE_REQUERIDO' using errcode = '22023';
  end if;
  if char_length(coalesce(v_fund, '')) not between 10 and 2000 then
    raise exception 'FUNDAMENTO_REQUERIDO' using errcode = '22023';
  end if;

  select least(min((x ->> 'desde')::date), v_efectos), greatest(max((x ->> 'hasta')::date), v_efectos) into v_desde, v_hasta
    from (select * from jsonb_array_elements(v_iva) union all select * from jsonb_array_elements(v_ret)) s(x);

  perform pg_advisory_xact_lock(hashtext('tax_period_decisions'), p_organization_id);
  select id into v_anterior from public.tax_period_decisions
   where organization_id = p_organization_id and obligacion = 'transicion_gran_contribuyente' and vigencia_aplicada_id = p_vigencia_id
   order by decidido_en desc limit 1;

  insert into public.tax_period_decisions (
    organization_id, obligacion, periodo_desde, periodo_hasta, decision, fundamento, alcance, vigencia_aplicada_id,
    huella, reemplaza_a, detalle, decidido_por
  ) values (
    p_organization_id, 'transicion_gran_contribuyente', v_desde, v_hasta,
    left('Tramo anterior: ' || v_ant || ' · Tramo posterior: ' || v_post, 2000),
    v_fund,
    left('IVA: ' || (select string_agg((x ->> 'desde') || '/' || (x ->> 'hasta'), ', ') from jsonb_array_elements(v_iva) x)
         || ' · Retención: ' || (select string_agg((x ->> 'desde') || '/' || (x ->> 'hasta'), ', ') from jsonb_array_elements(v_ret) x), 1000),
    p_vigencia_id,
    'gc:' || p_vigencia_id::text || ':' || v_res_fecha::text || ':' || v_efectos::text,
    v_anterior,
    jsonb_build_object('resolucion', v_res, 'resolucion_fecha', v_res_fecha, 'fecha_efectos', v_efectos,
                       'periodos_iva', v_iva, 'periodos_retencion', v_ret,
                       'tramo_anterior', v_ant, 'tramo_posterior', v_post, 'responsable', v_resp,
                       'soporte', jsonb_build_object('referencia', v_sop_ref, 'fecha', v_sop_fecha)),
    auth.uid()
  ) returning id into v_id;

  -- La aclaración de la vigencia queda resuelta (el resto de aclaraciones se conserva).
  update public.organization_tax_profiles
     set aclaraciones = array_remove(aclaraciones, 'gran_contribuyente_transicion_por_resolver'),
         requiere_revision = cardinality(array_remove(aclaraciones, 'gran_contribuyente_transicion_por_resolver')) > 0,
         updated_at = now(), updated_by = auth.uid()
   where id = p_vigencia_id and organization_id = p_organization_id;
  return v_id;
end;
$function$;

comment on function public.fn_tributario_transicion_gc_registrar(integer, uuid, jsonb) is
  'Ronda 5 del Contador: decisión estructurada de la transición del gran contribuyente con efectos a mitad de bimestre (resolución y fechas, períodos de IVA y retención, tramos anterior y posterior, responsable y soporte). Cierra la aclaración de la vigencia. finance.approve o admin.full_access.';
revoke all on function public.fn_tributario_transicion_gc_registrar(integer, uuid, jsonb) from public, anon;
grant execute on function public.fn_tributario_transicion_gc_registrar(integer, uuid, jsonb) to authenticated;
