-- Procesadores de pago, cuarta parte (dueño, 2026-11-21): NIT de fábrica y NIT obligatorio
-- en el abono.
--
-- 1. Los procesadores que son la misma empresa para todas las organizaciones traen su NIT
--    y razón social de fábrica; la organización solo los escribe si quiere otro. Fuente:
--    política de datos y términos de cada empresa; dígito de verificación comprobado con
--    el algoritmo de la DIAN.
--      Wompi         WOMPI S.A.S.                 900.499.068-7
--      Mercado Pago  MERCADOPAGO COLOMBIA LTDA    900.116.319-8
--      PayU          PAYU COLOMBIA S.A.S.         830.109.723-8
--    Sin NIT de fábrica: el datáfono (cada negocio tiene el suyo), Bold (falta confirmar
--    qué sociedad factura la comisión) y Stripe y PayPal (del exterior: lo define el
--    Contador).
--    Como el tercero de las líneas 138020xx sale de fn_procesador_pago_por_cuenta, los
--    cobros que se registren de aquí en adelante llevan ese NIT. Solo completa datos: no
--    rechaza nada, así que la venta no cambia.
-- 2. El abono exige el NIT del procesador: es el tercero del asiento que se concilia con
--    su extracto. El cobro nunca lo exige.

create or replace function public.fn_procesador_pago_por_cuenta(p_organization_id integer, p_cuenta text)
 returns table(codigo text, nombre text, nit text, cuenta text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select k.codigo,
         coalesce(nullif(btrim(s.tercero_nombre), ''), f.nombre, k.nombre),
         coalesce(nullif(btrim(s.tercero_nit), ''), f.nit),
         k.cuenta
    from public.fn_procesadores_pago_catalogo() k
    left join public.payment_processor_settings s
      on s.organization_id = p_organization_id and s.processor = k.codigo
    left join (values
      ('wompi', '900499068-7', 'WOMPI S.A.S.'),
      ('mercadopago', '900116319-8', 'MERCADOPAGO COLOMBIA LTDA'),
      ('payu', '830109723-8', 'PAYU COLOMBIA S.A.S.')) as f(codigo, nit, nombre)
      on f.codigo = k.codigo
   where left(coalesce(p_cuenta, ''), 8) = k.cuenta;
$function$;
revoke all on function public.fn_procesador_pago_por_cuenta(integer, text) from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_registrar(integer, jsonb)'::regprocedure);
  v_ancla text := E'  select * into v_ter from public.fn_procesador_pago_por_cuenta(p_organization_id, v_cat.cuenta);\n';
  v_regla text := E'  if v_ter.nit is null then\n'
               || E'    raise exception ''NIT_PROCESADOR_REQUERIDO: falta el NIT de %; complételo en Datos de los procesadores'', v_ter.nombre using errcode = ''22023'';\n'
               || E'  end if;\n';
begin
  if position('NIT_PROCESADOR_REQUERIDO' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'fn_procesador_abono_registrar cambió: no se encontró una sola vez la lectura del tercero';
  end if;
  execute replace(v_def, v_ancla, v_ancla || v_regla);
end $$;
