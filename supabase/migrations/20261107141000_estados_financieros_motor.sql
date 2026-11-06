-- Motor de los estados financieros: flujos de efectivo indirecto, cambios en el patrimonio,
-- resultado integral, base de indicadores y libros. Todo sale del mayor (asientos publicados,
-- en moneda base) y se lee en el servidor con la organización de la sesión.
--
-- Decisiones que este archivo fija:
--  * El asiento de cierre (source cierre_ejercicio, y su reversa) no es resultado del periodo:
--    pasa las cuentas 4-7 a 3605. Contarlo duplicaría la utilidad o la dejaría en cero.
--  * Un dividendo se lleva contra patrimonio, nunca contra resultado.
--  * El flujo se clasifica por asiento, no por variación de saldos: una compra a crédito no
--    mueve efectivo, así que no es inversión ni capital de trabajo.
--  * Cuenta sin categoría: no se adivina. Queda en «pendiente de clasificar», con su importe.
-- La regla de cada línea está explicada en fn_ef_flujo_lineas.

-- Filas que dejan de ser cierre: reversa del cierre incluida.
create or replace function public.fn_ef_es_cierre(p_organization_id integer, p_source text, p_source_id text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select p_source = 'cierre_ejercicio'
      or (p_source = 'reversal' and p_source_id ~ '^[0-9]+$' and exists (
            select 1 from public.journal_entries o
             where o.id = p_source_id::integer and o.organization_id = p_organization_id
               and o.source = 'cierre_ejercicio'));
$$;
revoke all on function public.fn_ef_es_cierre(integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_ef_es_cierre(integer, text, text) to service_role;

-- Guarda común de lectura. Estos estados son de la entidad completa: exige ver todas las sucursales.
create or replace function public.fn_ef_exigir_lectura(p_organization_id integer)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if auth.uid() is not null then
    if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    perform public.reporte_exigir_alcance_sucursal(p_organization_id::bigint, null);
  end if;
end;
$$;
revoke all on function public.fn_ef_exigir_lectura(integer) from public, anon, authenticated;
grant execute on function public.fn_ef_exigir_lectura(integer) to service_role;

-- Atributos de cada cuenta con movimiento. Se heredan del prefijo marcado más largo.
-- Propuesta: solo 11 es efectivo sin marca (el PUC es inequívoco). Políticas: los prefijos
-- estándar de intereses, dividendos e impuestos siguen la decisión del Contador.
create or replace function public.fn_ef_atributos(p_organization_id integer)
returns table(account_code text, cod text, es_efectivo boolean, es_restringido boolean,
              propuesto boolean, categoria text, es_ori boolean)
language sql stable set search_path = public, pg_temp as $$
  with pol as (select public.fn_ef_politicas(p_organization_id) as p),
  marcas as (
    select replace(btrim(m.account_code), '-', '') as pref, m.clase_efectivo, m.categoria_flujo, m.es_ori
      from public.financial_report_account_metadata m
     where m.organization_id = p_organization_id
  ),
  cuentas as (
    select distinct jl.account_code, replace(btrim(jl.account_code), '-', '') as cod
      from public.journal_lines jl
     where jl.organization_id = p_organization_id
  )
  select c.account_code, c.cod,
         coalesce(mc.clase_efectivo in ('efectivo', 'equivalente'), c.cod like '11%'),
         coalesce(mc.clase_efectivo = 'restringido', false),
         mc.clase_efectivo is null and c.cod like '11%',
         -- La política manda sobre una marca más general: clasificar todo el grupo 23 no
         -- decide los dividendos de la 2360. Una marca igual o más precisa que el prefijo sí.
         case when pc.categoria is not null and coalesce(mk.largo, 0) < pc.largo
              then pc.categoria else mk.categoria_flujo end,
         coalesce(mo.es_ori, false)
    from cuentas c
    cross join pol
    left join lateral (select m.clase_efectivo from marcas m
                        where m.clase_efectivo is not null and c.cod like m.pref || '%'
                        order by length(m.pref) desc limit 1) mc on true
    left join lateral (select m.categoria_flujo, length(m.pref) as largo from marcas m
                        where m.categoria_flujo is not null and c.cod like m.pref || '%'
                        order by length(m.pref) desc limit 1) mk on true
    left join lateral (select v.categoria, v.largo from (values
                         ('530520', pol.p ->> 'intereses_pagados', 6),
                         ('421005', pol.p ->> 'intereses_recibidos', 6),
                         ('4215', pol.p ->> 'dividendos_recibidos', 4),
                         ('2360', pol.p ->> 'dividendos_pagados', 4),
                         ('2404', pol.p ->> 'impuestos', 4),
                         ('54', pol.p ->> 'impuestos', 2)
                       ) v(pref, categoria, largo)
                        where c.cod like v.pref || '%' limit 1) pc on true
    left join lateral (select m.es_ori from marcas m
                        where m.es_ori and c.cod like m.pref || '%'
                        order by length(m.pref) desc limit 1) mo on true;
$$;
revoke all on function public.fn_ef_atributos(integer) from public, anon, authenticated;
grant execute on function public.fn_ef_atributos(integer) to service_role;

-- Débitos y créditos en moneda base por cuenta, con fin excluyente. Un inicio nulo es «desde siempre».
create or replace function public.fn_ef_movimientos(
  p_organization_id integer, p_ini timestamptz, p_fin timestamptz, p_sin_cierre boolean
) returns table(account_code text, cod text, debitos numeric, creditos numeric)
language sql stable set search_path = public, pg_temp as $$
  select jl.account_code, replace(btrim(jl.account_code), '-', ''),
         sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)),
         sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate))
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
   where je.organization_id = p_organization_id
     and je.posted is true
     and (p_ini is null or je.entry_date >= p_ini)
     and je.entry_date < p_fin
     and not (p_sin_cierre and public.fn_ef_es_cierre(p_organization_id, je.source, je.source_id))
   group by jl.account_code;
$$;
revoke all on function public.fn_ef_movimientos(integer, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.fn_ef_movimientos(integer, timestamptz, timestamptz, boolean) to service_role;

-- Único cálculo del resultado del periodo: clases 4 a 7, sin asientos de cierre. Crédito menos débito.
create or replace function public.fn_ef_resultado(p_organization_id integer, p_ini timestamptz, p_fin timestamptz)
returns numeric language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(m.creditos - m.debitos), 0)
    from public.fn_ef_movimientos(p_organization_id, p_ini, p_fin, true) m
   where left(m.cod, 1) in ('4', '5', '6', '7');
$$;
revoke all on function public.fn_ef_resultado(integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_ef_resultado(integer, timestamptz, timestamptz) to service_role;

-- Rango de días calendario de la organización, con fin excluyente.
create or replace function public.fn_ef_rango(p_organization_id integer, p_desde date, p_hasta date,
  out ini timestamptz, out fin timestamptz)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_tz text := coalesce(public.fn_timezone_for(p_organization_id, null), 'America/Bogota');
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  ini := p_desde::timestamp at time zone v_tz;
  fin := (p_hasta + 1)::timestamp at time zone v_tz;
end;
$$;
revoke all on function public.fn_ef_rango(integer, date, date) from public, anon, authenticated;
grant execute on function public.fn_ef_rango(integer, date, date) to service_role;

-- Clasifica cada línea del periodo. El efectivo aportado por una línea es su contribución
-- (crédito menos débito): la suma de contribuciones de un asiento es lo que entró a caja.
--
-- Por asiento se agrupan las líneas no monetarias en operación (incluye resultado y pendientes),
-- inversión, financiación y efecto cambiario, y cada grupo conserva (factor) solo lo que explica
-- el efectivo que de verdad se movió:
--  * Sin efectivo neto: inversión y financiación quedan en cero. Operación se conserva si neta
--    cero (venta a crédito, compra de inventario a crédito: es capital de trabajo). Si no netea
--    es porque su contrapartida es inversión o financiación: tampoco hubo efectivo, se quita.
--  * Con efectivo: se conserva el grupo que va en el sentido del efectivo, proporcional si hay
--    más de uno; el de sentido contrario es la parte sin efectivo (activo pagado a medias).
-- El resultado siempre entra entero a la utilidad; lo que no fue efectivo vuelve como ajuste.
do $$ begin
  if to_regtype('public.ef_linea_flujo') is null then
    create type public.ef_linea_flujo as (
      entry_id integer, account_code text, cod text, es_pyg boolean, categoria text,
      seccion text, grupo text, contribucion numeric, retenido numeric, ajuste numeric,
      etiqueta text, sin_efectivo numeric, mixto boolean
    );
  end if;
end $$;

create or replace function public.fn_ef_flujo_lineas(p_organization_id integer, p_ini timestamptz, p_fin timestamptz)
returns setof public.ef_linea_flujo
language sql stable set search_path = public, pg_temp as $$
  with attr as (select * from public.fn_ef_atributos(p_organization_id)),
  lin as (
    select je.id as entry_id, jl.account_code, a.cod, a.es_efectivo, a.categoria,
           left(a.cod, 1) in ('4', '5', '6', '7') as es_pyg,
           a.cod like '421020%' or a.cod like '530525%' or coalesce(a.categoria = 'efecto_cambiario', false) as es_fx,
           public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
             - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) as n
      from public.journal_entries je
      join public.journal_lines jl on jl.journal_entry_id = je.id
      join attr a on a.account_code = jl.account_code
     where je.organization_id = p_organization_id
       and je.posted is true
       and je.entry_date >= p_ini and je.entry_date < p_fin
       and not public.fn_ef_es_cierre(p_organization_id, je.source, je.source_id)
       and left(a.cod, 1) not in ('8', '9')
  ),
  ent as (
    select l.entry_id,
           coalesce(sum(l.n) filter (where l.es_efectivo), 0) as c,
           bool_or(l.es_efectivo) as hay_caja,
           bool_and(l.es_efectivo or l.es_fx) as solo_fx
      from lin l group by l.entry_id
  ),
  cla as (
    select l.*, e.c,
           case when l.es_efectivo then 'efectivo'
                -- Solo la revaluación de la caja es efecto cambiario. La diferencia realizada
                -- al pagar una deuda en divisas hace parte del pago.
                when l.es_fx and e.hay_caja and e.solo_fx then 'fx'
                when l.categoria = 'inversion' then 'inv'
                when l.categoria = 'financiacion' then 'fin'
                else 'op' end as g
      from lin l join ent e using (entry_id)
  ),
  val as (
    select c.entry_id, c.c,
           coalesce(sum(-c.n) filter (where c.g = 'op'), 0) as vop,
           coalesce(sum(-c.n) filter (where c.g = 'inv'), 0) as vinv,
           coalesce(sum(-c.n) filter (where c.g = 'fin'), 0) as vfin,
           coalesce(sum(-c.n) filter (where c.g = 'fx'), 0) as vfx,
           coalesce(sum(abs(c.n)) filter (where c.g in ('inv', 'fin')), 0) as bruto,
           bool_or(c.g in ('inv', 'fin')) as con_inv_fin,
           bool_or(c.cod ~ '^(1592|1597|1598|1698)') as con_depreciacion,
           bool_or(c.cod ~ '^(1298|1299|1399|1499|1599|1699|1799)') as con_deterioro,
           -- Sale un activo de verdad: no es una depreciación, aunque el asiento traiga la 1592.
           bool_or(c.g = 'inv' and c.n < 0 and c.cod !~ '^(1298|1299|1592|1597|1598|1599|1698|1699|1799)') as con_baja
      from cla c group by c.entry_id, c.c
  ),
  sum_s as (
    select v.*,
           (case when sign(v.vop) = sign(v.c) and abs(v.vop) >= 0.005 then v.vop else 0 end
            + case when sign(v.vinv) = sign(v.c) and abs(v.vinv) >= 0.005 then v.vinv else 0 end
            + case when sign(v.vfin) = sign(v.c) and abs(v.vfin) >= 0.005 then v.vfin else 0 end
            + case when sign(v.vfx) = sign(v.c) and abs(v.vfx) >= 0.005 then v.vfx else 0 end) as s
      from val v
  ),
  fac as (
    select x.*,
           case when abs(x.vop) < 0.005 then 1
                when abs(x.c) < 0.005 or sign(x.vop) <> sign(x.c) or x.s = 0 then 0
                else x.c / x.s end as fop,
           case when abs(x.c) < 0.005 or abs(x.vinv) < 0.005 or sign(x.vinv) <> sign(x.c) or x.s = 0 then 0 else x.c / x.s end as finv,
           case when abs(x.c) < 0.005 or abs(x.vfin) < 0.005 or sign(x.vfin) <> sign(x.c) or x.s = 0 then 0 else x.c / x.s end as ffin,
           case when abs(x.c) < 0.005 or abs(x.vfx) < 0.005 or sign(x.vfx) <> sign(x.c) or x.s = 0 then 0 else x.c / x.s end as ffx
      from sum_s x
  ),
  sal as (
    select c.entry_id, c.account_code, c.cod, c.es_pyg, c.categoria, c.g, c.n, f.con_depreciacion, f.con_deterioro,
           f.con_inv_fin, f.con_baja, f.vop, f.vinv, f.vfin, f.bruto, f.c as caja,
           case c.g when 'op' then f.fop when 'inv' then f.finv when 'fin' then f.ffin when 'fx' then f.ffx else 0 end as factor
      from cla c join fac f on f.entry_id = c.entry_id
     where c.g <> 'efectivo'
  )
  select s.entry_id, s.account_code, s.cod, s.es_pyg, s.categoria,
         case s.g when 'inv' then 'inversion' when 'fin' then 'financiacion' when 'fx' then 'efecto_cambiario'
                  else case when s.es_pyg then 'resultado' when s.categoria is null then 'pendiente' else 'operacion' end end,
         left(s.cod, 2),
         -s.n,
         -s.n * s.factor,
         case when not s.es_pyg then 0
              when s.g = 'op' then -s.n * (s.factor - 1)
              else s.n end,
         case when not s.es_pyg then null
              when s.g = 'inv' then 'venta_activos'
              when s.g = 'fin' then 'reclasificado_financiacion'
              when s.g = 'fx' then 'diferencia_cambio'
              when s.con_depreciacion then 'depreciacion_amortizacion'
              when s.con_deterioro then 'deterioro'
              else 'otras_sin_efectivo' end,
         case when s.con_inv_fin and (s.con_baja or not (s.con_depreciacion or s.con_deterioro))
              then greatest(greatest(abs(s.vop), abs(s.vinv), abs(s.vfin), s.bruto / 2) - abs(s.caja), 0)
              else 0 end,
         s.con_inv_fin
    from sal s;
$$;
revoke all on function public.fn_ef_flujo_lineas(integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_ef_flujo_lineas(integer, timestamptz, timestamptz) to service_role;

-- Estado de flujos de efectivo, método indirecto (NIIF para pymes, sección 7).
create or replace function public.fn_estado_flujos_efectivo(p_organization_id integer, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  v_utilidad numeric;
  v_inicial numeric;
  v_final numeric;
  v_rest_ini numeric;
  v_rest_fin numeric;
  v_filas jsonb;
  v_pendientes jsonb;
  v_revisar jsonb;
  v_sin_efectivo jsonb;
  v_cuentas jsonb;
  v_op numeric;
  v_inv numeric;
  v_finan numeric;
  v_pend numeric;
  v_fx numeric;
  v_borradores integer;
  v_fallos integer;
  v_fallos_monto numeric;
  v_confirmadas timestamptz;
  v_lineas public.ef_linea_flujo[];
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;

  select coalesce(array_agg(l), '{}') into v_lineas
    from public.fn_ef_flujo_lineas(p_organization_id, v_ini, v_fin) l;

  v_utilidad := public.fn_ef_resultado(p_organization_id, v_ini, v_fin);

  with saldo as (
    select a.account_code, a.es_efectivo, a.es_restringido, a.propuesto,
           coalesce(i.neto, 0) as inicial, coalesce(f.neto, 0) as final
      from public.fn_ef_atributos(p_organization_id) a
      left join (select m.account_code, sum(m.debitos - m.creditos) as neto
                   from public.fn_ef_movimientos(p_organization_id, null, v_ini, false) m group by 1) i using (account_code)
      left join (select m.account_code, sum(m.debitos - m.creditos) as neto
                   from public.fn_ef_movimientos(p_organization_id, null, v_fin, false) m group by 1) f using (account_code)
     where a.es_efectivo or a.es_restringido
  )
  select coalesce(sum(s.inicial) filter (where s.es_efectivo), 0),
         coalesce(sum(s.final) filter (where s.es_efectivo), 0),
         coalesce(sum(s.inicial) filter (where s.es_restringido), 0),
         coalesce(sum(s.final) filter (where s.es_restringido), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'cuenta', s.account_code,
           'nombre', (select c.name from public.chart_of_accounts c
                       where c.organization_id = p_organization_id and c.account_code = s.account_code),
           'inicial', round(s.inicial, 2), 'final', round(s.final, 2),
           'restringida', s.es_restringido, 'propuesta', s.propuesto
         ) order by s.account_code) filter (where s.inicial <> 0 or s.final <> 0), '[]'::jsonb)
    into v_inicial, v_final, v_rest_ini, v_rest_fin, v_cuentas
    from saldo s;

  -- Inversión y financiación se presentan por asiento: el resultado marcado (utilidad en venta)
  -- se suma al grupo del activo que se vendió, y cada entrada o salida va en su propio renglón.
  with inv_fin as (
    select l.entry_id, l.seccion,
           case when l.es_pyg and l.seccion = 'inversion'
                then coalesce((select min(o.grupo) from unnest(v_lineas) o
                                where o.entry_id = l.entry_id and o.seccion = 'inversion' and not o.es_pyg), l.grupo)
                else l.grupo end as grupo,
           l.retenido
      from unnest(v_lineas) l
     where l.seccion in ('inversion', 'financiacion')
  ), por_asiento as (
    select i.seccion, i.grupo, sum(i.retenido) as valor from inv_fin i group by i.entry_id, i.seccion, i.grupo
  ), renglones as (
    select 'operacion' as seccion, 'ajuste' as tipo, l.etiqueta as grupo, null::text as sentido, sum(l.ajuste) as valor
      from unnest(v_lineas) l where l.es_pyg and l.ajuste <> 0 group by l.etiqueta
    union all
    select 'operacion', 'variacion', l.grupo, null, sum(l.retenido)
      from unnest(v_lineas) l where l.seccion = 'operacion' group by l.grupo
    union all
    select p.seccion, 'movimiento', p.grupo, case when p.valor < 0 then 'salida' else 'entrada' end, sum(p.valor)
      from por_asiento p group by p.seccion, p.grupo, case when p.valor < 0 then 'salida' else 'entrada' end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'seccion', r.seccion, 'tipo', r.tipo, 'grupo', r.grupo, 'sentido', r.sentido,
           'nombre', (select c.name from public.chart_of_accounts c
                       where c.organization_id = p_organization_id and c.account_code = r.grupo),
           'valor', round(r.valor, 2)
         ) order by r.seccion desc, r.tipo, r.grupo, r.sentido), '[]'::jsonb)
    into v_filas
    from renglones r
   where abs(r.valor) >= 0.005;

  select coalesce(sum(l.ajuste) filter (where l.es_pyg), 0)
         + coalesce(sum(l.retenido) filter (where l.seccion = 'operacion'), 0),
         coalesce(sum(l.retenido) filter (where l.seccion = 'inversion'), 0),
         coalesce(sum(l.retenido) filter (where l.seccion = 'financiacion'), 0),
         coalesce(sum(l.retenido) filter (where l.seccion = 'pendiente'), 0),
         coalesce(sum(l.retenido) filter (where l.seccion = 'efecto_cambiario'), 0)
    into v_op, v_inv, v_finan, v_pend, v_fx
    from unnest(v_lineas) l;
  v_op := v_op + v_utilidad;

  select coalesce(jsonb_agg(x order by x ->> 'cuenta'), '[]'::jsonb) into v_pendientes
    from (
      select jsonb_build_object('cuenta', l.account_code,
               'nombre', (select c.name from public.chart_of_accounts c
                           where c.organization_id = p_organization_id and c.account_code = l.account_code),
               'valor', round(sum(l.retenido), 2)) as x
        from unnest(v_lineas) l where l.seccion = 'pendiente'
       group by l.account_code having abs(sum(l.retenido)) >= 0.005
    ) p;

  -- Resultado sin marca que aparece junto a inversión o financiación: la utilidad en venta de
  -- un activo, por ejemplo, sigue en operación hasta que el Contador la clasifique.
  select coalesce(jsonb_agg(x order by x ->> 'cuenta'), '[]'::jsonb) into v_revisar
    from (
      select jsonb_build_object('cuenta', l.account_code,
               'nombre', (select c.name from public.chart_of_accounts c
                           where c.organization_id = p_organization_id and c.account_code = l.account_code),
               'valor', round(sum(l.contribucion), 2)) as x
        from unnest(v_lineas) l where l.es_pyg and l.categoria is null and l.mixto
       group by l.account_code having abs(sum(l.contribucion)) >= 0.005
    ) p;

  select coalesce(jsonb_agg(x order by (x ->> 'fecha'), (x ->> 'asiento')::integer), '[]'::jsonb) into v_sin_efectivo
    from (
      select jsonb_build_object('asiento', d.entry_id, 'fecha', je.entry_date, 'memo', je.memo, 'monto', round(d.monto, 2)) as x
        from (select l.entry_id, max(l.sin_efectivo) as monto from unnest(v_lineas) l group by l.entry_id having max(l.sin_efectivo) >= 0.005) d
        join public.journal_entries je on je.id = d.entry_id
       order by d.monto desc limit 100
    ) p;

  select count(*) into v_borradores
    from public.journal_entries je
   where je.organization_id = p_organization_id and je.posted is not true
     and je.entry_date >= v_ini and je.entry_date < v_fin;
  select count(*), coalesce(sum(f.amount), 0) into v_fallos, v_fallos_monto
    from public.journal_entry_failures f
   where f.organization_id = p_organization_id and f.resolved_at is null
     and (f.entry_date is null or f.entry_date < v_fin);

  select s.politicas_confirmadas_en into v_confirmadas
    from public.financial_report_settings s where s.organization_id = p_organization_id;

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'utilidad', round(v_utilidad, 2),
    'filas', v_filas,
    'operacion', round(v_op, 2), 'inversion', round(v_inv, 2), 'financiacion', round(v_finan, 2),
    'pendiente', round(v_pend, 2), 'efecto_cambiario', round(v_fx, 2),
    'variacion', round(v_op + v_inv + v_finan + v_pend, 2),
    'efectivo_inicial', round(v_inicial, 2), 'efectivo_final', round(v_final, 2),
    'diferencia', round(v_inicial + v_op + v_inv + v_finan + v_pend + v_fx - v_final, 2),
    'restringido', jsonb_build_object('inicial', round(v_rest_ini, 2), 'final', round(v_rest_fin, 2)),
    'cuentas_efectivo', v_cuentas,
    'pendientes_cuentas', v_pendientes,
    'revisar_cuentas', v_revisar,
    'sin_efectivo', v_sin_efectivo,
    'avisos', jsonb_build_object('borradores', v_borradores, 'fallos', v_fallos, 'fallos_monto', round(v_fallos_monto, 2)),
    'politicas', public.fn_ef_politicas(p_organization_id),
    'politicas_confirmadas', v_confirmadas is not null
  );
end;
$$;
revoke all on function public.fn_estado_flujos_efectivo(integer, date, date) from public, anon;
grant execute on function public.fn_estado_flujos_efectivo(integer, date, date) to authenticated, service_role;

-- Estado de cambios en el patrimonio. El saldo final se compara con el patrimonio del mayor.
-- El resultado abierto (4 a 7 sin cerrar) vive en la columna 36: el cierre solo lo cambia de
-- cuenta y por eso sus asientos se ignoran en los dos lados, sin duplicar la utilidad.
create or replace function public.fn_estado_cambios_patrimonio(p_organization_id integer, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  v_utilidad numeric;
  v_balance numeric;
  v_filas jsonb;
  v_final numeric;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;
  v_utilidad := public.fn_ef_resultado(p_organization_id, v_ini, v_fin);

  select coalesce(sum(m.creditos - m.debitos), 0) into v_balance
    from public.fn_ef_movimientos(p_organization_id, null, v_fin, false) m
   where left(m.cod, 1) in ('3', '4', '5', '6', '7');

  with attr as (select * from public.fn_ef_atributos(p_organization_id)),
  lin as (
    select je.id as entry_id, a.cod, a.es_ori,
           public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)
             - public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) as neto,
           -- Una reversa se clasifica como el asiento que deshace: se leen sus lados al derecho.
           case when je.source = 'reversal' then -1 else 1 end
             * (public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
                - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) as lado
      from public.journal_entries je
      join public.journal_lines jl on jl.journal_entry_id = je.id
      join attr a on a.account_code = jl.account_code
     where je.organization_id = p_organization_id and je.posted is true
       and je.entry_date >= v_ini and je.entry_date < v_fin
       and not public.fn_ef_es_cierre(p_organization_id, je.source, je.source_id)
  ),
  ent as (
    select l.entry_id,
           bool_or(left(l.cod, 2) in ('36', '37') and l.lado > 0) as db_resultados,
           bool_or(l.cod like '2360%' and l.lado < 0) as cr_dividendos,
           bool_or(left(l.cod, 2) = '33' and l.lado < 0) as cr_reservas,
           bool_or(left(l.cod, 2) in ('31', '32') and l.lado < 0) as cr_capital,
           bool_or(left(l.cod, 2) = '36' and l.lado > 0) as db36,
           bool_or(left(l.cod, 2) = '37' and l.lado > 0) as db37,
           bool_or(left(l.cod, 2) = '36' and l.lado < 0) as cr36,
           bool_or(left(l.cod, 2) = '37' and l.lado < 0) as cr37,
           bool_or(l.cod like '3%' and l.lado > 0) as db3,
           bool_and(left(l.cod, 2) in ('36', '37')) as solo_resultados
      from lin l group by l.entry_id
  ),
  con as (
    select e.entry_id,
           case when e.db_resultados and e.cr_dividendos then 'dividendos'
                when e.db_resultados and e.cr_reservas then 'reservas'
                when e.db_resultados and e.cr_capital then 'capitalizacion'
                when e.solo_resultados and ((e.db36 and e.cr37) or (e.db37 and e.cr36)) then 'traslado'
                when e.cr_capital and not e.db3 then 'aportes'
                else 'otros' end as concepto
      from ent e
  ),
  movs as (
    select case when l.es_ori then 'ori' else c.concepto end as clave, left(l.cod, 2) as columna, sum(l.neto) as valor
      from lin l join con c using (entry_id)
     where l.cod like '3%'
     group by 1, 2
  ),
  inicial as (
    select case when m.cod like '3%' then left(m.cod, 2) else '36' end as columna,
           sum(m.creditos - m.debitos) as valor
      from public.fn_ef_movimientos(p_organization_id, null, v_ini, false) m
     where left(m.cod, 1) in ('3', '4', '5', '6', '7')
     group by 1
  ),
  todo as (
    select 'saldo_inicial' as clave, i.columna, i.valor from inicial i
    union all select m.clave, m.columna, m.valor from movs m
    union all select 'resultado', '36', v_utilidad
  ),
  sumado as (select t.clave, t.columna, sum(t.valor) as valor from todo t group by 1, 2),
  final as (select 'saldo_final' as clave, s.columna, sum(s.valor) as valor from sumado s group by s.columna),
  filas as (select * from sumado union all select * from final)
  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', f.clave,
           'valores', (select jsonb_object_agg(x.columna, round(x.valor, 2)) from filas x where x.clave = f.clave and x.valor <> 0),
           'total', round((select sum(x.valor) from filas x where x.clave = f.clave), 2)
         )), '[]'::jsonb),
         coalesce((select sum(x.valor) from filas x where x.clave = 'saldo_final'), 0)
    into v_filas, v_final
    from (select distinct clave from filas) f;

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'filas', v_filas,
    'utilidad', round(v_utilidad, 2),
    'saldo_final', round(v_final, 2),
    'patrimonio_balance', round(v_balance, 2),
    'diferencia', round(v_final - v_balance, 2)
  );
end;
$$;
revoke all on function public.fn_estado_cambios_patrimonio(integer, date, date) from public, anon;
grant execute on function public.fn_estado_cambios_patrimonio(integer, date, date) to authenticated, service_role;

-- Resultado integral: importes por cuenta de movimiento, sin cierre, para presentar por
-- naturaleza (vista principal, NIIF para pymes 5.11) o por función. El ORI son las cuentas
-- de la 38 marcadas expresamente; no se infiere.
create or replace function public.fn_estado_resultado_integral(p_organization_id integer, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;
  return (
    with mov as (select * from public.fn_ef_movimientos(p_organization_id, v_ini, v_fin, true))
    select jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta,
      'utilidad', round(public.fn_ef_resultado(p_organization_id, v_ini, v_fin), 2),
      'cuentas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'cuenta', m.account_code, 'codigo', m.cod,
                 'nombre', (select c.name from public.chart_of_accounts c
                             where c.organization_id = p_organization_id and c.account_code = m.account_code),
                 'neto', round(m.creditos - m.debitos, 2)
               ) order by m.cod)
          from mov m
         where left(m.cod, 1) in ('4', '5', '6', '7') and abs(m.creditos - m.debitos) >= 0.005
      ), '[]'::jsonb),
      'ori', coalesce((
        select round(sum(m.creditos - m.debitos), 2)
          from mov m join public.fn_ef_atributos(p_organization_id) a using (account_code)
         where a.es_ori
      ), 0)
    )
  );
end;
$$;
revoke all on function public.fn_estado_resultado_integral(integer, date, date) from public, anon;
grant execute on function public.fn_estado_resultado_integral(integer, date, date) to authenticated, service_role;

-- Corriente o no corriente: la marca de la cuenta y, sin marca, el grupo del PUC
-- (misma tabla de src/lib/finanzas/pucPrefijo.ts).
create or replace function public.fn_ef_presentacion(p_cod text, p_explicita text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_explicita, case
    when left(p_cod, 2) in ('11', '13', '14', '22', '23', '24', '25', '26', '28') then 'corriente'
    when left(p_cod, 2) in ('15', '16', '18', '19', '29') then 'no_corriente'
    when left(p_cod, 2) in ('12', '17', '21', '27') then 'segun_plazo'
  end);
$$;
revoke all on function public.fn_ef_presentacion(text, text) from public, anon, authenticated;
grant execute on function public.fn_ef_presentacion(text, text) to service_role;

-- Cifras base de los indicadores. Las razones se calculan en src/lib/finanzas/estados/indicadores.ts.
create or replace function public.fn_indicadores_financieros_base(p_organization_id integer, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;
  return (
    with fin as (
      select m.account_code, m.cod, m.debitos - m.creditos as saldo,
             public.fn_ef_presentacion(m.cod, c.presentacion_niif) as pres
        from public.fn_ef_movimientos(p_organization_id, null, v_fin, false) m
        left join public.chart_of_accounts c
          on c.organization_id = p_organization_id and c.account_code = m.account_code
    ),
    ini as (select m.cod, m.debitos - m.creditos as saldo
              from public.fn_ef_movimientos(p_organization_id, null, v_ini, false) m),
    per as (select m.cod, m.creditos - m.debitos as neto
              from public.fn_ef_movimientos(p_organization_id, v_ini, v_fin, true) m)
    select jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'dias', p_hasta - p_desde + 1,
      'activo_corriente', round(coalesce((select sum(saldo) from fin where cod like '1%' and pres = 'corriente'), 0), 2),
      'pasivo_corriente', round(coalesce((select -sum(saldo) from fin where cod like '2%' and pres = 'corriente'), 0), 2),
      'sin_clasificar', round(coalesce((select sum(abs(saldo)) from fin
                                         where left(cod, 1) in ('1', '2') and pres is distinct from 'corriente'
                                           and pres is distinct from 'no_corriente'), 0), 2),
      'activo', round(coalesce((select sum(saldo) from fin where cod like '1%'), 0), 2),
      'pasivo', round(coalesce((select -sum(saldo) from fin where cod like '2%'), 0), 2),
      'patrimonio', round(coalesce((select -sum(saldo) from fin where left(cod, 1) in ('3', '4', '5', '6', '7')), 0), 2),
      'activo_inicial', round(coalesce((select sum(saldo) from ini where cod like '1%'), 0), 2),
      'patrimonio_inicial', round(coalesce((select -sum(saldo) from ini where left(cod, 1) in ('3', '4', '5', '6', '7')), 0), 2),
      'cartera', round(coalesce((select sum(saldo) from fin where cod like '1305%'), 0), 2),
      'cartera_inicial', round(coalesce((select sum(saldo) from ini where cod like '1305%'), 0), 2),
      'inventario', round(coalesce((select sum(saldo) from fin where cod like '14%'), 0), 2),
      'inventario_inicial', round(coalesce((select sum(saldo) from ini where cod like '14%'), 0), 2),
      'proveedores', round(coalesce((select -sum(saldo) from fin where cod like '22%'), 0), 2),
      'proveedores_inicial', round(coalesce((select -sum(saldo) from ini where cod like '22%'), 0), 2),
      'ingresos', round(coalesce((select sum(neto) from per where cod like '41%'), 0), 2),
      'costo', round(coalesce((select -sum(neto) from per where cod like '6%'), 0), 2),
      'resultado_operacional', round(coalesce((select sum(neto) from per where left(cod, 2) in ('41', '51', '52') or left(cod, 1) in ('6', '7')), 0), 2),
      'resultado', round(public.fn_ef_resultado(p_organization_id, v_ini, v_fin), 2)
    )
  );
end;
$$;
revoke all on function public.fn_indicadores_financieros_base(integer, date, date) from public, anon;
grant execute on function public.fn_indicadores_financieros_base(integer, date, date) to authenticated, service_role;

-- Libro mayor y balances, consolidado al nivel pedido. Incluye el cierre: es el libro tal cual.
create or replace function public.fn_libro_mayor_balances(p_organization_id integer, p_desde date, p_hasta date, p_largo integer default 4)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  v_largo integer := case when p_largo in (1, 2, 4, 6, 8) then p_largo else 4 end;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;
  return (
    with antes as (
      select left(m.cod, v_largo) as codigo, sum(m.debitos - m.creditos) as saldo
        from public.fn_ef_movimientos(p_organization_id, null, v_ini, false) m group by 1
    ), per as (
      select left(m.cod, v_largo) as codigo, sum(m.debitos) as debitos, sum(m.creditos) as creditos
        from public.fn_ef_movimientos(p_organization_id, v_ini, v_fin, false) m group by 1
    ), filas as (
      select coalesce(a.codigo, p.codigo) as codigo, coalesce(a.saldo, 0) as inicial,
             coalesce(p.debitos, 0) as debitos, coalesce(p.creditos, 0) as creditos
        from antes a full join per p on p.codigo = a.codigo
    )
    select jsonb_build_object(
      'filas', coalesce(jsonb_agg(jsonb_build_object(
        'codigo', f.codigo,
        'nombre', (select c.name from public.chart_of_accounts c
                    where c.organization_id = p_organization_id and replace(c.account_code, '-', '') = f.codigo limit 1),
        'inicial', round(f.inicial, 2), 'debitos', round(f.debitos, 2), 'creditos', round(f.creditos, 2),
        'final', round(f.inicial + f.debitos - f.creditos, 2)
      ) order by f.codigo) filter (where f.inicial <> 0 or f.debitos <> 0 or f.creditos <> 0), '[]'::jsonb),
      'debitos', round(coalesce(sum(f.debitos), 0), 2),
      'creditos', round(coalesce(sum(f.creditos), 0), 2)
    ) from filas f
  );
end;
$$;
revoke all on function public.fn_libro_mayor_balances(integer, date, date, integer) from public, anon;
grant execute on function public.fn_libro_mayor_balances(integer, date, date, integer) to authenticated, service_role;

-- Inventarios y balances: activos, pasivos y patrimonio al corte, en su saldo natural.
create or replace function public.fn_libro_inventarios_balances(p_organization_id integer, p_corte date, p_largo integer default 4)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_fin timestamptz;
  v_largo integer := case when p_largo in (2, 4, 6, 8) then p_largo else 4 end;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.fin into v_fin from public.fn_ef_rango(p_organization_id, p_corte, p_corte) r;
  return (
    with mov as (select m.cod, m.creditos - m.debitos as neto
                   from public.fn_ef_movimientos(p_organization_id, null, v_fin, false) m),
    filas as (
      select left(m.cod, v_largo) as codigo,
             sum(case when m.cod like '1%' then -m.neto else m.neto end) as saldo
        from mov m where left(m.cod, 1) in ('1', '2', '3') group by 1
    )
    select jsonb_build_object(
      'corte', p_corte,
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', f.codigo,
        'nombre', (select c.name from public.chart_of_accounts c
                    where c.organization_id = p_organization_id and replace(c.account_code, '-', '') = f.codigo limit 1),
        'saldo', round(f.saldo, 2)
      ) order by f.codigo) from filas f where abs(f.saldo) >= 0.005), '[]'::jsonb),
      'activo', round(coalesce((select sum(saldo) from filas where codigo like '1%'), 0), 2),
      'pasivo', round(coalesce((select sum(saldo) from filas where codigo like '2%'), 0), 2),
      'patrimonio', round(coalesce((select sum(saldo) from filas where codigo like '3%'), 0), 2),
      'resultado_abierto', round(coalesce((select sum(neto) from mov where left(cod, 1) in ('4', '5', '6', '7')), 0), 2),
      'activos_fijos', (select count(*) from public.fixed_assets a where a.organization_id = p_organization_id)
    )
  );
end;
$$;
revoke all on function public.fn_libro_inventarios_balances(integer, date, integer) from public, anon;
grant execute on function public.fn_libro_inventarios_balances(integer, date, integer) to authenticated, service_role;

-- Saldo por tercero o por centro de costo, con saldo inicial y movimiento del periodo.
create or replace function public.fn_libro_resumen(p_organization_id integer, p_desde date, p_hasta date, p_por text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  if p_por not in ('tercero', 'centro') then
    raise exception 'criterio_invalido' using errcode = '22023';
  end if;
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;
  return (
    with lin as (
      select case p_por when 'tercero' then coalesce(nullif(btrim(jl.tercero_nit), ''), '-')
                        else coalesce(jl.cost_center_id::text, '-') end as clave,
             je.entry_date >= v_ini as en_periodo,
             public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) as d,
             public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) as c,
             jl.tercero_nombre
        from public.journal_entries je
        join public.journal_lines jl on jl.journal_entry_id = je.id
       where je.organization_id = p_organization_id and je.posted is true and je.entry_date < v_fin
    ), filas as (
      select l.clave, max(l.tercero_nombre) as nombre,
             coalesce(sum(l.d - l.c) filter (where not l.en_periodo), 0) as inicial,
             coalesce(sum(l.d) filter (where l.en_periodo), 0) as debitos,
             coalesce(sum(l.c) filter (where l.en_periodo), 0) as creditos
        from lin l group by l.clave
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'clave', f.clave,
      'nombre', case when p_por = 'tercero' then f.nombre
                     else (select c.code || ' ' || c.name from public.cost_centers c
                            where c.organization_id = p_organization_id and c.id::text = f.clave) end,
      'inicial', round(f.inicial, 2), 'debitos', round(f.debitos, 2), 'creditos', round(f.creditos, 2),
      'final', round(f.inicial + f.debitos - f.creditos, 2)
    ) order by f.clave), '[]'::jsonb) from filas f
  );
end;
$$;
revoke all on function public.fn_libro_resumen(integer, date, date, text) from public, anon;
grant execute on function public.fn_libro_resumen(integer, date, date, text) to authenticated, service_role;

-- Líneas del periodo por páginas, para el libro diario y los auxiliares por cuenta. Sin tope
-- oculto: quien llama sigue pidiendo con p_despues hasta recibir menos de p_limite.
create or replace function public.fn_libro_lineas(p_organization_id integer, p_desde date, p_hasta date, p_despues integer default 0, p_limite integer default 1000)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  v_limite integer := least(greatest(coalesce(p_limite, 1000), 1), 1000);
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'asiento', x.entry_id, 'fecha', x.entry_date, 'memo', x.memo,
      'cuenta', x.account_code, 'nombre', x.nombre,
      'debito', x.d, 'credito', x.c, 'tercero', x.tercero_nit
    ) order by x.id), '[]'::jsonb)
    from (
      select jl.id, je.id as entry_id, je.entry_date, je.memo, jl.account_code, jl.tercero_nit,
             (select c.name from public.chart_of_accounts c
               where c.organization_id = p_organization_id and c.account_code = jl.account_code) as nombre,
             public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) as d,
             public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) as c
        from public.journal_entries je
        join public.journal_lines jl on jl.journal_entry_id = je.id
       where je.organization_id = p_organization_id and je.posted is true
         and je.entry_date >= v_ini and je.entry_date < v_fin
         and jl.id > coalesce(p_despues, 0)
       order by jl.id
       limit v_limite
    ) x
  );
end;
$$;
revoke all on function public.fn_libro_lineas(integer, date, date, integer, integer) from public, anon;
grant execute on function public.fn_libro_lineas(integer, date, date, integer, integer) to authenticated, service_role;
