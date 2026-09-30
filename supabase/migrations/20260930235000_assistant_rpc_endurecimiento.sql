-- GO Asistente · Endurecimiento de las RPC assistant_*
-- docs/ia-chat/GO-ASISTENTE-FIGMA-A-CODIGO.md («Endurecimiento de las RPC assistant_* (2026-09-30)»)
--
-- Antes: cinco de ellas (register_sale, create_adjustment, create_purchase_order,
-- create_transfer, bulk_load_products) tenían EXECUTE para anon, y nueve de las
-- once confiaban en p_organization_id / p_user_id tal como llegaban: SECURITY
-- INVOKER con escrituras en tablas cuya RLS no cubre cada paso, sin
-- fn_assert_acceso_org ni auth.uid(). Una llamada directa a PostgREST saltaba la
-- comprobación de permisos que solo hacía el servidor (evaluateTool).
--
-- Llamadores (todos con la SESIÓN del usuario, ctx.supabase = getServerUserClient
-- vía getServerOrgContext; p_user_id = ctx.userId; ninguno con service role):
--   register_sale, create_adjustment ........ src/lib/ai/agent/tools/ventas.ts
--   create_purchase_order, create_transfer .. src/lib/ai/agent/tools/compras.ts
--   bulk_load_products ....................... src/lib/ai/agent/tools/cargaMasiva.ts
--   register_purchase/sales_invoice .......... src/lib/ai/agent/tools/facturas.ts
--   create_product, set_product_price ........ src/lib/services/aiActionsService.ts
--   void_purchase/sales_invoice, create_adjustment (deshacer carga masiva)
--                                              src/lib/ai/assistant/undoService.ts
--   SQL: bulk_load_products → create_product, set_product_price, create_adjustment.
--
-- Después: todas empiezan por public.fn_assistant_exigir(org, usuario, códigos):
--   · con sesión: p_user_id = auth.uid() (USUARIO_NO_COINCIDE), pertenencia a la
--     organización y admin o alguno de los códigos (fn_finanzas_exigir_permiso);
--   · sin sesión: solo service_role / dueño de la base, y el autor miembro de la org;
--   · EXECUTE revocado a public y anon en las once.
-- Se parchea la definición VIVA (fragmento «begin» de columna 0, único), con md5
-- de prosrc comprobado antes y después. Ni firma, ni SECURITY, ni search_path, ni
-- comentarios cambian (register/void_purchase_invoice siguen SECURITY DEFINER con
-- su guarda anterior intacta; las demás siguen SECURITY INVOKER).
--
-- Permisos (basta uno; mismos códigos que la herramienta del asistente que llega a
-- la función, con finance.view → finance.create en las facturas: ver lista):
--   assistant_register_sale              pos.create
--   assistant_register_sales_invoice     pos.create, finance.create
--   assistant_void_sales_invoice         pos.create, finance.create, finance.void
--   assistant_register_purchase_invoice  inventory.create, inventory_management, finance.create
--   assistant_void_purchase_invoice      inventory.create, inventory_management, finance.create, finance.void
--   assistant_create_purchase_order      inventory.create, inventory_management
--   assistant_create_transfer            inventory.transfer, inventory_management
--   assistant_create_adjustment          inventory.adjust, inventory_management, inventory.create, product_management
--   assistant_create_product             inventory.create, inventory_management, product_management
--   assistant_set_product_price          inventory.edit, inventory_management, product_management, inventory.create
--   assistant_bulk_load_products         inventory.create, inventory_management, product_management
--   Anulaciones: los de la herramienta que crea (el deshacer lo hace el autor) más
--   finance.void. create_adjustment y set_product_price admiten además los de la
--   carga masiva, que ya los ejecuta anidados (y su deshacer, directo): no amplía
--   lo que esos usuarios podían hacer.
--
--   función                              md5 prosrc antes                  md5 prosrc después                anon antes
--   assistant_register_sale              362b402609545ca209ad63f86bd222e6  e15bad5706a06cac633e4c00e8993a01  sí
--   assistant_register_sales_invoice     24784c3215a4fcd06ccfddfc08beb16d  5f41add4cae1371f3ab4e09ee65c2abc  no
--   assistant_void_sales_invoice         e57802a87f93785b6203c5d421e53b80  9377f4c87b49212216cc2b9f448e8edd  no
--   assistant_register_purchase_invoice  9b647e33e06d3b9d445beba7fc1e071d  ae306ed07182dd8590ff43152aaf39ba  no
--   assistant_void_purchase_invoice      c899cbcc5e52fd08748baeb59181db6b  23175c39f3cc0015f8a79a2fb0e533cb  no
--   assistant_create_purchase_order      4e175dd3cb018df93e20d79ef6f4d3e3  c27645bdaaae711b7089ddc488c1884d  sí
--   assistant_create_transfer            54c3588f925dedbf881eb333ce0e29e8  753f3fd04c3bceb4fab8f75e9e4219d7  sí
--   assistant_create_adjustment          66a56e1a2d47bb37fbd233a65da0fad1  3c3bd12524c2ab8c02a759320c7355cf  sí
--   assistant_create_product             ecfb8d75807a51d47ee2b7662dc9e16c  e54dcbfa2fd0f26b17ac040df1155ecc  no
--   assistant_set_product_price          72cf9a179a87959bddb15f1c04c75c28  acdb221d943cbdaa8a1dc9ad34ed07ab  no
--   assistant_bulk_load_products         c949bcc796934a9086d482994468324a  c9033feedffc9714a6f70155dcb94c17  sí
--
-- Rollback: supabase/rollbacks/20260930235000_assistant_rpc_endurecimiento_rollback.sql

create or replace function public.fn_assistant_exigir(p_org integer, p_user_id uuid, p_codigos text[])
 returns void
 language plpgsql
 stable
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if p_org is null then
    raise exception 'ORGANIZACION_REQUERIDA' using errcode = '22023';
  end if;

  if v_uid is null then
    -- Sin sesión solo pasa el servidor: service_role por PostgREST o el dueño de
    -- la base (tareas internas). SECURITY INVOKER a propósito: current_user es el
    -- rol real del llamador. anon y authenticated sin sesión, nunca.
    if current_user not in ('service_role', 'postgres', 'supabase_admin')
       or coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'Acceso denegado a la organización' using errcode = '42501';
    end if;
    -- El servidor ya validó la organización; aun así, el autor debe pertenecer a ella.
    if p_user_id is not null
       and not exists (select 1 from public.organization_members om
                        where om.user_id = p_user_id and om.organization_id = p_org and om.is_active)
       and not exists (select 1 from public.organizations o
                        where o.id = p_org and o.owner_user_id = p_user_id) then
      raise exception 'USUARIO_FUERA_DE_LA_ORG' using errcode = '42501';
    end if;
    return;
  end if;

  -- Con sesión, el autor es quien llama: nunca otro usuario.
  if p_user_id is distinct from v_uid then
    raise exception 'USUARIO_NO_COINCIDE' using errcode = '42501';
  end if;

  -- Pertenencia (fn_assert_acceso_org) + administrador (super admin o rol 1/2,
  -- espejo de isOrgAdminLike) o cualquiera de los códigos: el mismo criterio que
  -- hasAnyPermission del asistente. Regla 7: no se reimplementa.
  perform public.fn_finanzas_exigir_permiso(p_org, p_codigos);
end;
$function$;

comment on function public.fn_assistant_exigir(integer, uuid, text[]) is
  'Guarda única de las RPC assistant_* (GO Asistente). Con sesión: p_user_id = auth.uid(), pertenencia a p_org y admin o alguno de p_codigos (fn_finanzas_exigir_permiso). Sin sesión: solo service_role/dueño de la base, y p_user_id (si viene) miembro de p_org. Errores 42501: USUARIO_NO_COINCIDE, USUARIO_FUERA_DE_LA_ORG, sin_permiso, Acceso denegado a la organización. Depende de request.jwt.claims (auth.uid/auth.role), como el resto de guardas bajo PostgREST.';

revoke execute on function public.fn_assistant_exigir(integer, uuid, text[]) from public, anon;
grant execute on function public.fn_assistant_exigir(integer, uuid, text[]) to authenticated, service_role;

-- assistant_register_sale (registrar_venta (pos.create))
do $parche$
declare
  v_oid oid := 'public.assistant_register_sale(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$
begin
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'e15bad5706a06cac633e4c00e8993a01' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '362b402609545ca209ad63f86bd222e6' then
    raise exception 'assistant_register_sale cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sale: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'e15bad5706a06cac633e4c00e8993a01' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create', 'finance.create']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '5f41add4cae1371f3ab4e09ee65c2abc' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '24784c3215a4fcd06ccfddfc08beb16d' then
    raise exception 'assistant_register_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '5f41add4cae1371f3ab4e09ee65c2abc' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create', 'finance.create', 'finance.void']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '9377f4c87b49212216cc2b9f448e8edd' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'e57802a87f93785b6203c5d421e53b80' then
    raise exception 'assistant_void_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_void_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '9377f4c87b49212216cc2b9f448e8edd' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management', 'finance.create']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'ae306ed07182dd8590ff43152aaf39ba' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '9b647e33e06d3b9d445beba7fc1e071d' then
    raise exception 'assistant_register_purchase_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_purchase_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'ae306ed07182dd8590ff43152aaf39ba' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management', 'finance.create', 'finance.void']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '23175c39f3cc0015f8a79a2fb0e533cb' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'c899cbcc5e52fd08748baeb59181db6b' then
    raise exception 'assistant_void_purchase_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_void_purchase_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '23175c39f3cc0015f8a79a2fb0e533cb' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'c27645bdaaae711b7089ddc488c1884d' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '4e175dd3cb018df93e20d79ef6f4d3e3' then
    raise exception 'assistant_create_purchase_order cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_purchase_order: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'c27645bdaaae711b7089ddc488c1884d' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.transfer', 'inventory_management']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '753f3fd04c3bceb4fab8f75e9e4219d7' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '54c3588f925dedbf881eb333ce0e29e8' then
    raise exception 'assistant_create_transfer cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_transfer: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '753f3fd04c3bceb4fab8f75e9e4219d7' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.adjust', 'inventory_management', 'inventory.create', 'product_management']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '3c3bd12524c2ab8c02a759320c7355cf' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '66a56e1a2d47bb37fbd233a65da0fad1' then
    raise exception 'assistant_create_adjustment cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_adjustment: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '3c3bd12524c2ab8c02a759320c7355cf' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, auth.uid(), array['inventory.create', 'inventory_management', 'product_management']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'e54dcbfa2fd0f26b17ac040df1155ecc' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'ecfb8d75807a51d47ee2b7662dc9e16c' then
    raise exception 'assistant_create_product cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_create_product: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'e54dcbfa2fd0f26b17ac040df1155ecc' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, auth.uid(), array['inventory.edit', 'inventory_management', 'product_management', 'inventory.create']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'acdb221d943cbdaa8a1dc9ad34ed07ab' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '72cf9a179a87959bddb15f1c04c75c28' then
    raise exception 'assistant_set_product_price cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_set_product_price: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'acdb221d943cbdaa8a1dc9ad34ed07ab' then
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
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['inventory.create', 'inventory_management', 'product_management']);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'c9033feedffc9714a6f70155dcb94c17' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'c949bcc796934a9086d482994468324a' then
    raise exception 'assistant_bulk_load_products cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_bulk_load_products: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'c9033feedffc9714a6f70155dcb94c17' then
    raise exception 'assistant_bulk_load_products: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- EXECUTE: nunca public ni anon; authenticated (sesión) y service_role (servidor).
revoke execute on function public.assistant_register_sale(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_register_sale(integer, integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_void_sales_invoice(integer, uuid, uuid) from public, anon;
grant execute on function public.assistant_void_sales_invoice(integer, uuid, uuid) to authenticated, service_role;
revoke execute on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_void_purchase_invoice(integer, uuid, uuid) from public, anon;
grant execute on function public.assistant_void_purchase_invoice(integer, uuid, uuid) to authenticated, service_role;
revoke execute on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_create_transfer(integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_create_transfer(integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_create_product(integer, jsonb) from public, anon;
grant execute on function public.assistant_create_product(integer, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_set_product_price(integer, integer, numeric) from public, anon;
grant execute on function public.assistant_set_product_price(integer, integer, numeric) to authenticated, service_role;
revoke execute on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) from public, anon;
grant execute on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) to authenticated, service_role;
