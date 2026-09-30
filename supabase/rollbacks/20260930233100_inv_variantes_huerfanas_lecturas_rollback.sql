-- Reversión de 20260930233100_inv_variantes_huerfanas_lecturas.
-- Devuelve cada función a su definición exacta anterior: quita el fragmento del
-- predicado pp_elim y comprueba el md5 de prosrc original. Si alguna cambió
-- después del parche, se detiene (revertir a mano con la definición de
-- supabase_migrations.schema_migrations). No toca datos.

-- fn_stock_listado — stock (/app/inventario/stock) e inicio «Stock crítico» (bloqueHoy, fn_inicio_modulos_resumen)
do $parche$
declare
  v_oid oid := 'public.fn_stock_listado(integer,jsonb,integer,integer)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$     where p.organization_id = p_org
       and coalesce(p.status, 'active') <> 'deleted'
       -- Variantes de un padre eliminado: fuera (20260930233100).
       and not exists (select 1 from public.products pp_elim
                       where pp_elim.id = p.parent_product_id and pp_elim.status = 'deleted')
$frag$;
  v_new text := $frag$     where p.organization_id = p_org
       and coalesce(p.status, 'active') <> 'deleted'
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'ea36b5a1cc8339effa4cc6ecb7f7199d' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'f1fdb0f8f75c4ed15a262c35a1e4cbf7' then
    raise exception 'fn_stock_listado cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_stock_listado: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'ea36b5a1cc8339effa4cc6ecb7f7199d' then
    raise exception 'fn_stock_listado: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- pos_product_ranking — cuadrícula y búsqueda del POS (posService.getProductsPaginated)
do $parche$
declare
  v_oid oid := 'public.pos_product_ranking(integer,text,integer,text,boolean,integer,integer)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$      AND (p_include_variants OR p.parent_product_id IS NULL)
      -- Variantes de un padre eliminado: fuera (20260930233100).
      AND NOT EXISTS (SELECT 1 FROM public.products pp_elim
                      WHERE pp_elim.id = p.parent_product_id AND pp_elim.status = 'deleted')
$frag$;
  v_new text := $frag$      AND (p_include_variants OR p.parent_product_id IS NULL)
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'ca799476e1b78de44a351173e68f2945' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '255fedb9c9f32a1a4fdab5794420a56a' then
    raise exception 'pos_product_ranking cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'pos_product_ranking: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'ca799476e1b78de44a351173e68f2945' then
    raise exception 'pos_product_ranking: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- buscar_productos — búsqueda global, GO Assistant y catálogo del POS
do $parche$
declare
  v_oid oid := 'public.buscar_productos(integer,text[],integer,real)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$    where p.organization_id = p_org
      and p.status = 'active'
      -- Variantes de un padre eliminado: fuera (20260930233100).
      and not exists (select 1 from public.products pp_elim
                      where pp_elim.id = p.parent_product_id and pp_elim.status = 'deleted')
  ),
$frag$;
  v_new text := $frag$    where p.organization_id = p_org
      and p.status = 'active'
  ),
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '9f72aab3d0db3f37a01d028fba2732fd' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '71caa0fb78db65657c1c0fec73140c90' then
    raise exception 'buscar_productos cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'buscar_productos: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '9f72aab3d0db3f37a01d028fba2732fd' then
    raise exception 'buscar_productos: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- fn_reporte_stock_critico — reporte de stock crítico (alertas de stock bajo)
do $parche$
declare
  v_oid oid := 'public.fn_reporte_stock_critico(bigint)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$      AND p.status = 'active'
      -- Variantes de un padre eliminado: fuera (20260930233100).
      AND NOT EXISTS (SELECT 1 FROM public.products pp_elim
                      WHERE pp_elim.id = p.parent_product_id AND pp_elim.status = 'deleted')
    ORDER BY (sl.min_level - sl.qty_on_hand) DESC
$frag$;
  v_new text := $frag$      AND p.status = 'active'
    ORDER BY (sl.min_level - sl.qty_on_hand) DESC
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '2e456e5c88ec1eb070cfa40efec8c6f2' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '4373083611844463942759ca42bee065' then
    raise exception 'fn_reporte_stock_critico cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_reporte_stock_critico: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '2e456e5c88ec1eb070cfa40efec8c6f2' then
    raise exception 'fn_reporte_stock_critico: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- fn_reporte_rotacion_inventario — reporte de rotación: inventario sin movimiento (dead stock)
do $parche$
declare
  v_oid oid := 'public.fn_reporte_rotacion_inventario(bigint,timestamp with time zone,timestamp with time zone,bigint)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$    WHERE p.organization_id = p_organization_id
      AND p.status = 'active'
      -- Variantes de un padre eliminado: fuera (20260930233100).
      AND NOT EXISTS (SELECT 1 FROM public.products pp_elim
                      WHERE pp_elim.id = p.parent_product_id AND pp_elim.status = 'deleted')
    GROUP BY p.id, p.name, p.sku, sl.qty_on_hand
$frag$;
  v_new text := $frag$    WHERE p.organization_id = p_organization_id
      AND p.status = 'active'
    GROUP BY p.id, p.name, p.sku, sl.qty_on_hand
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '6be3308cff4c47dab430f0086a4d4b66' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'f39681ad5f2ec25498689ff130e7f4c7' then
    raise exception 'fn_reporte_rotacion_inventario cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_reporte_rotacion_inventario: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '6be3308cff4c47dab430f0086a4d4b66' then
    raise exception 'fn_reporte_rotacion_inventario: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;
