-- Reversión de 20261121190106_finanzas_procesadores_pago_nit_fabrica.sql
--
-- Quita los NIT de fábrica (el tercero vuelve a salir solo de lo que escribió la
-- organización) y la exigencia del NIT en el abono. Los asientos ya registrados
-- conservan el NIT que llevaron.

do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_registrar(integer, jsonb)'::regprocedure);
begin
  execute replace(v_def,
    E'  if v_ter.nit is null then\n'
    || E'    raise exception ''NIT_PROCESADOR_REQUERIDO: falta el NIT de %; complételo en Datos de los procesadores'', v_ter.nombre using errcode = ''22023'';\n'
    || E'  end if;\n', '');
end $$;

create or replace function public.fn_procesador_pago_por_cuenta(p_organization_id integer, p_cuenta text)
 returns table(codigo text, nombre text, nit text, cuenta text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select k.codigo,
         coalesce(nullif(btrim(s.tercero_nombre), ''), k.nombre),
         nullif(btrim(s.tercero_nit), ''),
         k.cuenta
    from public.fn_procesadores_pago_catalogo() k
    left join public.payment_processor_settings s
      on s.organization_id = p_organization_id and s.processor = k.codigo
   where left(coalesce(p_cuenta, ''), 8) = k.cuenta;
$function$;
revoke all on function public.fn_procesador_pago_por_cuenta(integer, text) from public, anon, authenticated;
