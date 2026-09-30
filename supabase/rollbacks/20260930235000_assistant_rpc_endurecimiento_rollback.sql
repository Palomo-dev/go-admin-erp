-- Reversión de 20260930235000_assistant_rpc_endurecimiento.
-- Quita la línea de fn_assistant_exigir de las once assistant_* (comprueba el md5
-- de prosrc anterior), devuelve EXECUTE a anon en las cinco que lo tenían y borra
-- fn_assistant_exigir. Si alguna función cambió después del parche, se detiene
-- (revertir a mano con la definición de supabase_migrations.schema_migrations).
-- No toca datos.
-- ADVERTENCIA: las RPC vuelven a confiar en p_organization_id / p_user_id del
-- llamador y cinco vuelven a ser ejecutables por anon.

-- assistant_register_sale (registrar_venta (pos.create))
do $parche$
declare
  v_oid oid := 'public.assistant_register_sale(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '362b402609545ca209ad63f86bd222e6' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'e15bad5706a06cac633e4c00e8993a01' then
    raise exception 'assistant_register_sale cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sale: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '362b402609545ca209ad63f86bd222e6' then
    raise exception 'assistant_register_sale: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_register_sales_invoice (registrar_factura_venta)
do $parche$
declare
  v_oid oid := 'public.assistant_register_sales_invoice(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create', 'finance.create']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '24784c3215a4fcd06ccfddfc08beb16d' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '5f41add4cae1371f3ab4e09ee65c2abc' then
    raise exception 'assistant_register_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '24784c3215a4fcd06ccfddfc08beb16d' then
    raise exception 'assistant_register_sales_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_void_sales_invoice (deshacer registrar_factura_venta)
do $parche$
declare
  v_oid oid := 'public.assistant_void_sales_invoice(integer,uuid,uuid)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create', 'finance.create', 'finance.void']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'e57802a87f93785b6203c5d421e53b80' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '9377f4c87b49212216cc2b9f448e8edd' then
    raise exception 'assistant_void_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_void_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'e57802a87f93785b6203c5d421e53b80' then
    raise exception 'assistant_void_sales_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_register_purchase_invoice (registrar_factura_compra)
do $parche$
declare
  v_oid oid := 'public.assistant_register_purchase_invoice(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management', 'finance.create']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '9b647e33e06d3b9d445beba7fc1e071d' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'ae306ed07182dd8590ff43152aaf39ba' then
    raise exception 'assistant_register_purchase_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_purchase_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '9b647e33e06d3b9d445beba7fc1e071d' then
    raise exception 'assistant_register_purchase_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_void_purchase_invoice (deshacer registrar_factura_compra)
do $parche$
declare
  v_oid oid := 'public.assistant_void_purchase_invoice(integer,uuid,uuid)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management', 'finance.create', 'finance.void']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'c899cbcc5e52fd08748baeb59181db6b' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '23175c39f3cc0015f8a79a2fb0e533cb' then
    raise exception 'assistant_void_purchase_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_void_purchase_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'c899cbcc5e52fd08748baeb59181db6b' then
    raise exception 'assistant_void_purchase_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_create_purchase_order (crear_orden_compra)
do $parche$
declare
  v_oid oid := 'public.assistant_create_purchase_order(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '4e175dd3cb018df93e20d79ef6f4d3e3' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'c27645bdaaae711b7089ddc488c1884d' then
    raise exception 'assistant_create_purchase_order cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_purchase_order: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '4e175dd3cb018df93e20d79ef6f4d3e3' then
    raise exception 'assistant_create_purchase_order: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_create_transfer (crear_traslado)
do $parche$
declare
  v_oid oid := 'public.assistant_create_transfer(integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.transfer', 'inventory_management']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '54c3588f925dedbf881eb333ce0e29e8' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '753f3fd04c3bceb4fab8f75e9e4219d7' then
    raise exception 'assistant_create_transfer cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_transfer: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '54c3588f925dedbf881eb333ce0e29e8' then
    raise exception 'assistant_create_transfer: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_create_adjustment (ajuste_inventario; carga masiva y su deshacer)
do $parche$
declare
  v_oid oid := 'public.assistant_create_adjustment(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.adjust', 'inventory_management', 'inventory.create', 'product_management']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '66a56e1a2d47bb37fbd233a65da0fad1' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '3c3bd12524c2ab8c02a759320c7355cf' then
    raise exception 'assistant_create_adjustment cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_adjustment: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '66a56e1a2d47bb37fbd233a65da0fad1' then
    raise exception 'assistant_create_adjustment: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_create_product (create_product; carga masiva)
do $parche$
declare
  v_oid oid := 'public.assistant_create_product(integer,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, auth.uid(), array['inventory.create', 'inventory_management', 'product_management']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'ecfb8d75807a51d47ee2b7662dc9e16c' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'e54dcbfa2fd0f26b17ac040df1155ecc' then
    raise exception 'assistant_create_product cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_product: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'ecfb8d75807a51d47ee2b7662dc9e16c' then
    raise exception 'assistant_create_product: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_set_product_price (update_product_price; carga masiva)
do $parche$
declare
  v_oid oid := 'public.assistant_set_product_price(integer,integer,numeric)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, auth.uid(), array['inventory.edit', 'inventory_management', 'product_management', 'inventory.create']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '72cf9a179a87959bddb15f1c04c75c28' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'acdb221d943cbdaa8a1dc9ad34ed07ab' then
    raise exception 'assistant_set_product_price cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_set_product_price: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '72cf9a179a87959bddb15f1c04c75c28' then
    raise exception 'assistant_set_product_price: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_bulk_load_products (carga_masiva_productos)
do $parche$
declare
  v_oid oid := 'public.assistant_bulk_load_products(integer,integer,uuid,jsonb,integer)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management', 'product_management']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'c949bcc796934a9086d482994468324a' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'c9033feedffc9714a6f70155dcb94c17' then
    raise exception 'assistant_bulk_load_products cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_bulk_load_products: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'c949bcc796934a9086d482994468324a' then
    raise exception 'assistant_bulk_load_products: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- EXECUTE como estaba: anon lo tenía en las cinco marcadas; public en ninguna.
grant execute on function public.assistant_register_sale(integer, integer, uuid, jsonb) to anon;
grant execute on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) to anon;
grant execute on function public.assistant_create_transfer(integer, uuid, jsonb) to anon;
grant execute on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) to anon;
grant execute on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) to anon;

drop function if exists public.fn_assistant_exigir(integer, uuid, text[]);
