-- P1 (25-oct-2026): la siembra de configuracion_contable ya no deja inventario en 1435 sola ni en 1405.
-- fn_propuesta_configuracion_sector: inventario = '1435' para todos los sectores (se quita 1405 del sector 1).
-- fn_sembrar_configuracion_contable: inventario -> auxiliar 143501xx (fn_inventario_auxiliar_1435);
-- otras claves que caen en cuenta de título -> su único auxiliar de movimiento (si hay varios, no se siembra).
-- comisiones ya se propone en 529505 (no 5235) en la versión viva; no cambia.
-- Rollback: supabase/rollbacks/20261025130100_p1_siembra_inventario_auxiliar_rollback.sql

CREATE OR REPLACE FUNCTION public.fn_propuesta_configuracion_sector(p_type_id integer)
 RETURNS TABLE(clave text, account_code text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select v.clave,
    case v.clave
      when 'ventas_productos' then case p_type_id
        when 1 then '414015'
        when 2 then '4140'
        when 4 then '4155'
        when 6 then '4145'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '414095'
        when 2 then '4140'
        else '4235'
      end
      when 'costo_ventas' then case when p_type_id in (1, 2) then '6140' else '6135' end
      -- Inventario: nunca 1405. fn_sembrar_configuracion_contable lo cambia por el auxiliar 143501xx.
      when 'inventario' then '1435'
      else v.defecto
    end
  from (values
    ('caja', '1105'),
    ('bancos', '1110'),
    ('clientes', '1305'),
    ('proveedores', '2205'),
    ('ventas_productos', '4135'),
    ('ventas_servicios', '4235'),
    ('devoluciones', '4175'),
    ('descuentos', '4175'),
    ('costo_ventas', '6135'),
    ('inventario', '1435'),
    ('iva_generado', '240805'),
    ('iva_descontable', '240810'),
    ('retefuente', '2365'),
    ('reteiva', '2367'),
    ('reteica', '2368'),
    ('propinas', '5105'),
    ('comisiones', '529505'),
    ('anticipos', '2805'),
    ('nomina', '5105'),
    ('nomina_por_pagar', '2505'),
    ('nomina_aportes', '2370'),
    ('faltante_inventario', '519595'),
    ('gastos_extraordinarios', '5315'),
    ('consumo_interno', '519595'),
    ('manifiesto_por_pagar', '2205'),
    ('manifiesto_transporte', '2335'),
    ('saldo_inicial', '3105'),
    ('impuesto_consumo', '2495'),
    ('redondeo', '4295'),
    ('compra_servicio', '2335')
  ) as v(clave, defecto);
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sembrar_configuracion_contable(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo integer;
  v_inv text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if exists (
    select 1 from public.configuracion_contable where organization_id = p_org
  ) then
    return;
  end if;

  select o.type_id into v_tipo from public.organizations o where o.id = p_org;

  -- Inventario va SIEMPRE a un auxiliar 143501xx (regla de Juan: nunca 1435 sola ni 1405).
  -- Si aún no hay sede (la org se acaba de crear), fn_inventario_auxiliar_1435 devuelve null
  -- y la clave no se siembra: el resolver usa el auxiliar de la sede en tiempo de asiento.
  v_inv := public.fn_inventario_auxiliar_1435(p_org, null);

  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, p.clave, x.codigo
  from public.fn_propuesta_configuracion_sector(v_tipo) p
  cross join lateral (
    select case
      when p.clave = 'inventario' then v_inv
      -- Cuenta de título: su único auxiliar de movimiento, si lo hay.
      when exists (
        select 1 from public.chart_of_accounts t
        where t.organization_id = p_org and t.account_code = p.account_code and t.es_movimiento is false
      ) then (
        select min(h.account_code) from public.chart_of_accounts h
        where h.organization_id = p_org
          and h.account_code like p.account_code || '_%'
          and h.es_movimiento is true
        having count(*) = 1
      )
      else p.account_code
    end as codigo
  ) x
  join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = x.codigo
   and c.es_movimiento is distinct from false
  on conflict (organization_id, branch_id, clave) do nothing;
end;
$function$
;
