-- Finanzas ronda 3 · Frente C · Libro diario de trabajo («Asientos»), Contabilidad v2 BK-1.
--
-- Aplicada por el MCP el 2026-11-07 con orden del dueño.
-- PostgREST (`ContabilidadService.listarLibroDiario`), pero hay dos cosas que
-- PostgREST no resuelve en una consulta:
--   1. «Ocultar pares revertidos» tiene que quitar también el ORIGINAL que tiene
--      contra-asiento (`fact_key = 'reversal:<id>'`). Hoy se quita de la página
--      ya leída y la pantalla lo avisa: el total y el tamaño de página quedan
--      aproximados.
--   2. El importe (Σ débitos) y la marca de reversión se leen con dos consultas
--      más por página.
-- Esta función hace las tres cosas en una sola lectura. Es SECURITY INVOKER:
-- respeta la RLS de `journal_entries` (pertenencia y sucursal) igual que hoy.
-- Aditiva: no toca tablas ni datos. Al aplicarla, `listarLibroDiario` pasa a
-- llamarla y conserva su contrato.

create or replace function public.fn_libro_diario_trabajo(
  p_organization_id integer,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_estado text default 'todos',
  p_fuentes text[] default null,
  p_cuenta text default null,
  p_branch_id integer default null,
  p_texto text default null,
  p_numero integer default null,
  p_ocultar_pares boolean default false,
  p_limite integer default 25,
  p_desplazamiento integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_patron text;
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_texto is not null then
    v_patron := '%' || replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select je.*
      from public.journal_entries je
     where je.organization_id = p_organization_id
       and (p_desde is null or je.entry_date >= p_desde)
       and (p_hasta is null or je.entry_date <= p_hasta)
       and (coalesce(p_estado, 'todos') = 'todos'
            or (p_estado = 'publicados' and je.posted is true)
            or (p_estado = 'borradores' and je.posted is not true))
       and (p_fuentes is null or cardinality(p_fuentes) = 0 or je.source = any (p_fuentes))
       and (p_branch_id is null or je.branch_id = p_branch_id)
       and (p_cuenta is null or exists (
             select 1 from public.journal_lines jl
              where jl.journal_entry_id = je.id and jl.account_code = p_cuenta))
       and (v_patron is null or je.memo ilike v_patron or (p_numero is not null and je.id = p_numero))
       and (not coalesce(p_ocultar_pares, false) or (
             je.source is distinct from 'reversal'
             and not exists (
               select 1 from public.journal_entries r
                where r.organization_id = je.organization_id
                  and r.fact_key = 'reversal:' || je.id)))
  ),
  pagina as (
    select *
      from base
     order by entry_date desc, id desc
     limit greatest(least(coalesce(p_limite, 25), 500), 1)
    offset greatest(coalesce(p_desplazamiento, 0), 0)
  )
  select jsonb_build_object(
           'total', (select count(*) from base),
           'filas', coalesce((
             select jsonb_agg(
                      to_jsonb(p) || jsonb_build_object(
                        'importe', (select coalesce(sum(jl.debit), 0) from public.journal_lines jl where jl.journal_entry_id = p.id),
                        'revertido_por', (select r.id from public.journal_entries r
                                           where r.organization_id = p.organization_id
                                             and r.fact_key = 'reversal:' || p.id
                                           limit 1))
                      order by p.entry_date desc, p.id desc)
               from pagina p), '[]'::jsonb))
    into v_resultado;

  return v_resultado;
end;
$function$;

comment on function public.fn_libro_diario_trabajo(integer, timestamptz, timestamptz, text, text[], text, integer, text, integer, boolean, integer, integer) is
  'Libro diario de trabajo paginado: filtros, importe por asiento y marca de reversión; «ocultar pares» quita contra-asiento y original. Invoker: aplica la RLS de journal_entries.';

revoke all on function public.fn_libro_diario_trabajo(integer, timestamptz, timestamptz, text, text[], text, integer, text, integer, boolean, integer, integer) from public, anon;
grant execute on function public.fn_libro_diario_trabajo(integer, timestamptz, timestamptz, text, text[], text, integer, text, integer, boolean, integer, integer) to authenticated;
