-- Rollback de 20261104004934: quita el filtro por archivo_disponible de buscar_productos.
do $e$
declare
  v_def text;
  v_ancla text := 'join public.product_images pi on pi.product_id = p2.id and pi.archivo_disponible';
begin
  v_def := pg_get_functiondef('public.buscar_productos(integer,text[],integer,real)'::regprocedure);
  if position(v_ancla in v_def) = 0 then return; end if;
  execute replace(v_def, v_ancla, 'join public.product_images pi on pi.product_id = p2.id');
end $e$;
