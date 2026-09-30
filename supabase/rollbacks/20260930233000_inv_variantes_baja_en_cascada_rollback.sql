-- Reversión de 20260930233000_inv_variantes_baja_en_cascada.
--
-- ORDEN: si se aplicó 20260930233200 (limpieza), revertirla ANTES que esta: su
-- rollback lee private.inv_variantes_baja_en_cascada. Este archivo se niega a
-- seguir mientras queden filas de la limpieza.
--
-- Quita los dos disparadores y sus funciones y devuelve fn_productos_estado_masivo
-- a su definición exacta anterior (md5 de prosrc 2313276899bfe5433ff3b7d5d453e44e).
-- NO revierte datos: las variantes que el disparador dio de baja con su padre
-- siguen eliminadas (restaurar el padre ya no las devuelve). Si se necesitan,
-- private.inv_variantes_baja_en_cascada (origen 'cascada') tiene su estado previo:
-- consultarla antes de ejecutar este archivo, que la borra.

do $orden$
begin
  if to_regclass('private.inv_variantes_baja_en_cascada') is not null
     and exists (select 1 from private.inv_variantes_baja_en_cascada where origen = 'limpieza_20260930') then
    raise exception 'Revertir primero 20260930233200_inv_variantes_huerfanas_limpieza (quedan filas de la limpieza)';
  end if;
end;
$orden$;

do $parche$
declare
  v_oid oid := 'public.fn_productos_estado_masivo(integer,integer[],text)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$  -- Eliminar (20260930233000): las variantes de un padre que cae en esta misma
  -- llamada las da de baja el disparador de cascada, que guarda su estado para
  -- restaurarlas con el padre. Se suman a `actualizados` como antes.
  update public.products set status = p_status, updated_at = now()
   where id = any(v_ids) and organization_id = p_organization_id
     and status is distinct from p_status
     and not (p_status = 'deleted' and coalesce(parent_product_id = any(v_ids), false));
  get diagnostics v_n = row_count;
  if p_status = 'deleted' then
    select v_n + count(*) into v_n from public.products
     where id = any(v_ids) and parent_product_id = any(v_ids) and status = 'deleted';
  end if;
$frag$;
  v_new text := $frag$  update public.products set status = p_status, updated_at = now()
   where id = any(v_ids) and organization_id = p_organization_id
     and status is distinct from p_status;
  get diagnostics v_n = row_count;
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '2313276899bfe5433ff3b7d5d453e44e' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '5a07af394490108d83143753c749aa25' then
    raise exception 'fn_productos_estado_masivo cambió después del parche (md5 %): revertir a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '2313276899bfe5433ff3b7d5d453e44e' then
    raise exception 'fn_productos_estado_masivo: la reversión no dejó la definición anterior (md5 %)', v_md5;
  end if;
end;
$parche$;

drop trigger if exists trg_producto_variante_padre_vigente on public.products;
drop function if exists public.fn_producto_int_variante_padre_vigente();

drop trigger if exists trg_producto_baja_variantes on public.products;
drop function if exists public.fn_producto_int_baja_variantes();

drop table if exists private.inv_variantes_baja_en_cascada;
