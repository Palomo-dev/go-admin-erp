-- Reversión de 20261121021810_configuracion_contable_propinas_28150501.sql
-- Primero la función (para que nada se redirija a 5105 a medias) y después los datos.

do $$
declare
  v_def text := pg_get_functiondef('public.fn_clave_cuenta_configurable'::regproc);
  v_viejo text := $q$    when s.code = '5105' and s.origen = any (array['tip', 'tips']) then 'propinas'$q$;
  v_nuevo text := $q$    when s.code in ('2815', '281505', '28150501') and s.origen = any (array['tip', 'tips', 'tip_settlements']) then 'propinas'$q$;
begin
  if position(v_nuevo in v_def) > 0 then
    execute replace(v_def, v_nuevo, v_viejo);
  end if;
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_propuesta_configuracion_sector'::regproc);
begin
  if position($q$('propinas', '28150501')$q$ in v_def) > 0 then
    execute replace(v_def, $q$('propinas', '28150501')$q$, $q$('propinas', '5105')$q$);
  end if;
end $$;

update public.configuracion_contable
   set account_code = '5105'
 where clave = 'propinas' and account_code = '28150501';
