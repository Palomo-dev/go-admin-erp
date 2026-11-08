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
