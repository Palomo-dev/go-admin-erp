-- Reversión de supabase/migrations/20261110150000_asiento_por_lineas_reparto_por_base.sql (ronda 6 del Contador).
-- Deshace el único reemplazo (el inverso exacto) y borra fn_asiento_peso_reparto_linea.
-- Resultado: la definición que tenía fn_armar_asiento_documento antes de aplicar la migración. Si entre tanto no se
-- aplicó ninguna de las migraciones de IVA que también la modifican (20261108140000 y 20261108152000), la definición queda
-- BYTE A BYTE igual a la que estaba aplicada el 2026-11-10: md5(pg_get_functiondef) = a4e14cbc23142d9f46c25145faa49642
-- (14.792 caracteres). Si alguna de ellas ya está aplicada, se conservan sus cambios y solo se quita este.
-- NO revierte datos: los asientos publicados mientras estuvo aplicada (con la base repartida por la base antes de IVA) se
-- quedan como se publicaron; si hiciera falta cambiarlos, se recontabilizan por el flujo normal.

create or replace function pg_temp.fn_reemplazo_verificado(p_def text, p_viejo text, p_nuevo text, p_etiqueta text)
returns text
language plpgsql
as $function$
declare
  v_veces integer := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
begin
  if v_veces <> 1 then
    raise exception '%: se esperaba 1 aparición del texto a reemplazar y hay %', p_etiqueta, v_veces;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$function$;

do $do$
declare
  v_firma constant regprocedure := 'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('reparto_base_antes_de_iva_20261110' in v_def) = 0 then
    raise notice 'fn_armar_asiento_documento no tiene el cambio del reparto por la base';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$               -- reparto_base_antes_de_iva_20261110 (ronda 6 del Contador): pesa la base antes de IVA de la línea.
               public.fn_asiento_peso_reparto_linea(ii, v_neto >= v_total, p_tipo in ('compra', 'documento_soporte')) as monto,$v$,
$v$               abs(coalesce(ii.total_line, 0)) as monto,$v$,
    'fn_armar_asiento_documento/peso (reversión)');

  execute v_def;

  v_def := pg_get_functiondef(v_firma);
  if position('iva_tarifa_lado_20261108' in v_def) = 0 and position('iva_no_descontable_al_costo_20261108' in v_def) = 0
     and md5(v_def) <> 'a4e14cbc23142d9f46c25145faa49642' then
    raise warning 'fn_armar_asiento_documento revertida, pero su md5 (%) no es el de la definición del 2026-11-10', md5(v_def);
  end if;
end;
$do$;

drop function if exists pg_temp.fn_reemplazo_verificado(text, text, text, text);
drop function if exists public.fn_asiento_peso_reparto_linea(public.invoice_items, boolean, boolean);
