-- Rollback de 20261025134105: versión viva al 25-oct de fn_propuesta_configuracion_sector.
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
      when 'costo_ventas' then case when p_type_id in (1, 2) then '61400501' else '61350501' end
      when 'faltante_inventario' then case when p_type_id in (1, 2) then '61400502' else v.defecto end
      -- Inventario: nunca 1405 ni el título 1435 (título en 55 de 56 orgs H/R): auxiliar de movimiento
      -- 14350101, igual que el TS (QA 25-oct). fn_sembrar_configuracion_contable puede afinarlo por sede.
      when 'inventario' then '14350101'
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
    ('costo_ventas', '61350501'),
    ('inventario', '14350101'),
    ('iva_generado', '24080501'),
    ('iva_descontable', '24081001'),
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
    ('redondeo', '42958101'),
    ('ingresos_diversos', '42959501'),
    ('compra_servicio', '2335')
  ) as v(clave, defecto);
$function$;
