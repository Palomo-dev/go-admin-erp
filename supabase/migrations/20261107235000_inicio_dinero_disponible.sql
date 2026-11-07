-- PROPUESTA SIN APLICAR (2026-11-07). No aplicar sin orden del dueño.
--
-- «Dinero disponible» del módulo Finanzas en el inicio (Figma `03 Navegación
-- y shell` › «Inicio — pendientes de Finanzas en el módulo», 2360:42276).
-- La nota de fuentes del diseño (2362:43410) lo marca como FALTA: hoy el saldo
-- de bancos se suma en el navegador (`BancosService.getStats`) mezclando las
-- monedas de las cuentas. Hasta aplicar esta función, el inicio muestra la
-- tarjeta como «No disponible» con su motivo.
--
-- Qué devuelve (nunca suma monedas distintas):
--   por_moneda: [{ moneda, total, bancos, cajas }]  — un total por moneda.
--   cuentas_bancarias, cajas_abiertas: cuántas cuentas entran en el total.
--   cajas_ocultas: true si hay arqueo ciego y la persona no puede ver el
--   efectivo esperado; entonces las cajas no se suman.
--
-- Fuentes, sin cálculo nuevo:
--   - Bancos: `bank_accounts.balance` de cada cuenta activa, en SU moneda
--     (`bank_accounts.currency`; vacía → moneda base de la organización).
--   - Cajas abiertas: `pos_caja__esperado_calculo` (el esperado del cierre de
--     caja), en la moneda base. Con `fn_caja_ve_esperado` = false no se suma.
--
-- Seguridad: SECURITY DEFINER con `fn_assert_acceso_org`, permiso
-- `finance.view` resuelto en la base y sucursal validada con
-- `app_branch_access`, como `fn_inicio_modulos_resumen`. Cerrada a anon.

create or replace function public.fn_inicio_dinero_disponible(
  p_organization_id integer,
  p_branch_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_moneda text;
  v_sucursales integer[];
  v_ve_cajas boolean;
  v_por_moneda jsonb;
  v_bancos integer := 0;
  v_cajas integer := 0;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
      raise exception 'Sucursal no válida' using errcode = '22023';
    end if;
    if not public.app_branch_access(p_branch_id) then
      raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
    end if;
    v_sucursales := array[p_branch_id];
  else
    select coalesce(array_agg(b.id), array[]::integer[]) into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and public.app_branch_access(b.id);
  end if;

  v_moneda := upper(public.fn_moneda_base_organizacion(p_organization_id));
  v_ve_cajas := public.fn_caja_ve_esperado(p_organization_id);

  with bancos as (
    select upper(coalesce(nullif(btrim(ba.currency), ''), v_moneda)) as moneda,
           coalesce(ba.balance, 0) as monto
      from public.bank_accounts ba
     where ba.organization_id = p_organization_id
       and coalesce(ba.is_active, true)
       and ba.branch_id = any (v_sucursales)
  ), cajas as (
    select v_moneda as moneda,
           coalesce((public.pos_caja__esperado_calculo(cs.id) ->> 'efectivo_esperado')::numeric, 0) as monto
      from public.cash_sessions cs
     where v_ve_cajas
       and cs.organization_id = p_organization_id
       and cs.status = 'open'
       and cs.branch_id = any (v_sucursales)
  ), todo as (
    select moneda, monto, 'banco' as origen from bancos
    union all
    select moneda, monto, 'caja' as origen from cajas
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'moneda', x.moneda,
           'total', x.total,
           'bancos', x.bancos,
           'cajas', x.cajas
         ) order by (x.moneda = v_moneda) desc, x.moneda), '[]'::jsonb),
         coalesce(sum(x.n_bancos), 0)::integer,
         coalesce(sum(x.n_cajas), 0)::integer
    into v_por_moneda, v_bancos, v_cajas
    from (
      select t.moneda,
             round(sum(t.monto), 2) as total,
             round(sum(t.monto) filter (where t.origen = 'banco'), 2) as bancos,
             round(sum(t.monto) filter (where t.origen = 'caja'), 2) as cajas,
             count(*) filter (where t.origen = 'banco') as n_bancos,
             count(*) filter (where t.origen = 'caja') as n_cajas
        from todo t
       group by t.moneda
    ) x;

  return jsonb_build_object(
    'moneda_base', v_moneda,
    'por_moneda', v_por_moneda,
    'cuentas_bancarias', v_bancos,
    'cajas_abiertas', v_cajas,
    'cajas_ocultas', not v_ve_cajas,
    'calculado_en', now()
  );
end;
$function$;

comment on function public.fn_inicio_dinero_disponible(integer, integer) is
  'Dinero disponible del inicio (Finanzas): saldo de bancos activos por su moneda + efectivo esperado de cajas abiertas en moneda base. Nunca suma monedas distintas.';

revoke all on function public.fn_inicio_dinero_disponible(integer, integer) from public, anon;
grant execute on function public.fn_inicio_dinero_disponible(integer, integer) to authenticated, service_role;
