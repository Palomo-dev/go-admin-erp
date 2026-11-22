-- Configuración contable: la clave «Propinas» es el pasivo 28150501, no 5105.
--
-- Sigue a 20261121021410_pos_propinas_pasivo_trabajadores_28150501 (decisión
-- del Contador, 2026-11-20). La configuración contable de cada organización
-- apuntaba la clave 'propinas' a 5105 (Gastos de personal). Ahora:
--   1. Las 45 filas de configuracion_contable con 'propinas' = 5105 pasan a 28150501.
--   2. La propuesta por sector (organizaciones nuevas) también.
--   3. fn_clave_cuenta_configurable reconoce el pasivo de las propinas (cobro y
--      liquidación) como la clave 'propinas'. Si el Contador de una organización
--      elige otro auxiliar de pasivo, los asientos de propina lo usan.
-- El orden importa: primero los datos y después la función, para que ningún
-- asiento de propina se redirija a 5105 en medio.

update public.configuracion_contable
   set account_code = '28150501'
 where clave = 'propinas' and account_code = '5105';

do $$
declare
  v_def text := pg_get_functiondef('public.fn_propuesta_configuracion_sector'::regproc);
begin
  if position($q$('propinas', '28150501')$q$ in v_def) > 0 then
    return;
  end if;
  if position($q$('propinas', '5105')$q$ in v_def) = 0 then
    raise exception 'fn_propuesta_configuracion_sector no tiene la propuesta vieja de propinas';
  end if;
  execute replace(v_def, $q$('propinas', '5105')$q$, $q$('propinas', '28150501')$q$);
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_clave_cuenta_configurable'::regproc);
  v_viejo text := $q$    when s.code = '5105' and s.origen = any (array['tip', 'tips']) then 'propinas'$q$;
  v_nuevo text := $q$    when s.code in ('2815', '281505', '28150501') and s.origen = any (array['tip', 'tips', 'tip_settlements']) then 'propinas'$q$;
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'fn_clave_cuenta_configurable no tiene la línea vieja de propinas';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
