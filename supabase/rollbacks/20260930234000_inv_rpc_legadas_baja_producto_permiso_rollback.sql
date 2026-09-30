-- Reversión de 20260930234000_inv_rpc_legadas_baja_producto_permiso.
-- Devuelve soft_delete_product a su definición exacta anterior (md5 de prosrc
-- 5994240bc79ad07b3d6343f25bd739e6, sin search_path fijo), el EXECUTE de
-- authenticated a las dos firmas de deactivate_product y quita los comentarios.
-- ADVERTENCIA: vuelve a dejar las tres funciones sin exigir inventory.delete.
-- No toca datos.

CREATE OR REPLACE FUNCTION public.soft_delete_product(p_product_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_org_id integer;
  v_user_id uuid := auth.uid();
BEGIN
  -- Obtener organization_id del producto
  SELECT organization_id INTO v_org_id
  FROM products WHERE id = p_product_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  -- Verificar que el usuario pertenezca a la organización
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'No tiene permisos para eliminar este producto';
  END IF;

  -- Realizar soft-delete
  UPDATE products
  SET status = 'deleted', updated_at = NOW()
  WHERE id = p_product_id
    AND organization_id = v_org_id;

  RETURN true;
END;
$function$;

grant execute on function public.deactivate_product(integer) to authenticated;
grant execute on function public.deactivate_product(integer, integer) to authenticated;

comment on function public.soft_delete_product(integer) is null;
comment on function public.deactivate_product(integer) is null;
comment on function public.deactivate_product(integer, integer) is null;

do $verifica$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.soft_delete_product(integer)'::regprocedure)
     <> '5994240bc79ad07b3d6343f25bd739e6' then
    raise exception 'soft_delete_product: md5 distinto al original tras revertir';
  end if;
end;
$verifica$;
