-- GO Asistente · Endurecimiento del resto de RPC assistant_*
-- ADAPTADA (2026-11-04) de los bloques #7, #10, #11, #12 y #15 de
-- 20260930235000_assistant_rpc_endurecimiento.sql, que no entraron al restaurar la
-- base en el proyecto taqjemqjtumhwptchcxk. El bloque #6
-- (assistant_register_sales_invoice) va aparte en
-- 20260930235000_assistant_rpc_endurecimiento_adaptada.sql.
--
-- Qué pasó
--   Cada bloque original exigía un md5(prosrc) «antes» que no coincide con la base
--   restaurada. Las cinco funciones vivas son, byte a byte, el cuerpo de la
--   migración que las creó (verificado con md5 del cuerpo en el repo), sin la
--   guarda. No hay en el repo ninguna definición que dé el md5 «antes» que
--   esperaba el original: la diferencia con producción no se pudo reconstruir.
--   Hoy son SECURITY INVOKER, sin search_path, con EXECUTE para authenticated y
--   service_role (sin anon ni public: el revoke/grant final de la original sí
--   corrió) y confían en p_organization_id / p_user_id tal como llegan.
--   fn_assistant_exigir ya existe (md5 2fe3f3cc8558f184898d4e42e1f23b43).
--
--   función                          bloque  md5 esperado por el original  md5 vivo (= repo)                 md5 tras esta adaptada
--   assistant_void_sales_invoice     #7      e57802a87f93785b6203c5d421e53b80  cb820d9a76f9789e382a94595da5cfcd  612207fec85f38e2b88ff7260c4c9fd3
--   assistant_create_purchase_order  #10     4e175dd3cb018df93e20d79ef6f4d3e3  eb44c04155163c9eedfee144c25ec6e2  9ef17ae834bb5b41de81048a7c7b4f33
--   assistant_create_transfer        #11     54c3588f925dedbf881eb333ce0e29e8  eb74cb45a6c19139cf8bfdd5ec2e33f8  f2817e3b86c28a6f2bf9a2dd53e1416d
--   assistant_create_adjustment      #12     66a56e1a2d47bb37fbd233a65da0fad1  78dc5f45c0907570c8ffc4db35b830ac  ec5599adc8fc91183e330de5ab18bc7a
--   assistant_bulk_load_products     #15     c949bcc796934a9086d482994468324a  f7b82d5aa838ad59c315212de5eace35  e8b80e236605b62aea5ea51d82496bdc
--   (cuerpos vivos: 20260921130000, 20260914110000 ×2, 20260910180000, 20260914140000)
--
-- Qué cambia respecto al original
--   · Mismo fragmento ancla («begin» de columna 0, único en cada definición) y
--     misma llamada, con los MISMOS permisos de la original:
--       void_sales_invoice     pos.create, finance.create, finance.void
--       create_purchase_order  inventory.create, inventory_management
--       create_transfer        inventory.transfer, inventory_management
--       create_adjustment      inventory.adjust, inventory_management, inventory.create, product_management
--       bulk_load_products     inventory.create, inventory_management, product_management
--     Solo cambia el texto del comentario insertado («adaptada 2026-11-04»).
--   · Guard por md5 de la definición viva de HOY y comprobación del md5 final.
--     «Ya aplicada»: md5 = el final esperado, o fn_assistant_exigir ya presente.
--   · Ni firma, ni SECURITY (siguen INVOKER), ni search_path, ni comentarios
--     cambian. El revoke/grant se repite (idempotente) para dejar el estado explícito.
--   · bulk_load_products llama anidado a assistant_create_adjustment con el mismo
--     p_user_id y a create_product / set_product_price (ya guardadas con
--     auth.uid()): los permisos de la carga están cubiertos por los del ajuste.
--
-- Llamadores verificados (2026-11-04), todos con la SESIÓN del usuario
-- (ctx.supabase de getServerOrgContext, p_user_id = ctx.userId):
--   create_purchase_order, create_transfer .. src/lib/ai/agent/tools/compras.ts
--   create_adjustment ........................ src/lib/ai/agent/tools/ventas.ts
--   bulk_load_products ....................... src/lib/ai/agent/tools/cargaMasiva.ts
--   void_sales_invoice, create_adjustment .... src/lib/ai/assistant/undoService.ts (deshacer)
--   SQL: assistant_bulk_load_products → assistant_create_adjustment.
--   Ninguno en supabase/functions, goadmin-websites ni cron.job.
--
-- Ensayo (2026-11-04, sin aplicar, terminado en raise ENSAYO_OK): migración ×2
-- (idempotente), md5 finales de la tabla, SECURITY/search_path/ACL/comentario
-- intactos; en la org 1, para las cinco: sesión con p_user_id ajeno →
-- USUARIO_NO_COINCIDE; sesión de otra org → «Acceso denegado a la organización»;
-- service_role con autor fuera de la org → USUARIO_FUERA_DE_LA_ORG; anon →
-- permission denied; llamada válida con sesión del autor → OK (incluida la carga
-- masiva con su ajuste anidado). Rollback ×2 → md5 de hoy.
--
-- Rollback: supabase/rollbacks/20261104032000_assistant_rpc_endurecimiento_resto_adaptada_rollback.sql

do $parche$
declare
  r record;
  v_oid oid;
  v_md5 text;
  v_src text;
  v_def text;
  v_old text := $frag$
begin
$frag$;
  v_new text;
begin
  if to_regprocedure('public.fn_assistant_exigir(integer,uuid,text[])') is null then
    raise exception 'falta fn_assistant_exigir: aplicar antes la primera parte de 20260930235000';
  end if;

  for r in
    select * from (values
      (1, 'assistant_void_sales_invoice', 'public.assistant_void_sales_invoice(integer,uuid,uuid)',
          $p$array['pos.create', 'finance.create', 'finance.void']$p$,
          'cb820d9a76f9789e382a94595da5cfcd', '612207fec85f38e2b88ff7260c4c9fd3'),
      (2, 'assistant_create_purchase_order', 'public.assistant_create_purchase_order(integer,integer,uuid,jsonb)',
          $p$array['inventory.create', 'inventory_management']$p$,
          'eb44c04155163c9eedfee144c25ec6e2', '9ef17ae834bb5b41de81048a7c7b4f33'),
      (3, 'assistant_create_transfer', 'public.assistant_create_transfer(integer,uuid,jsonb)',
          $p$array['inventory.transfer', 'inventory_management']$p$,
          'eb74cb45a6c19139cf8bfdd5ec2e33f8', 'f2817e3b86c28a6f2bf9a2dd53e1416d'),
      (4, 'assistant_create_adjustment', 'public.assistant_create_adjustment(integer,integer,uuid,jsonb)',
          $p$array['inventory.adjust', 'inventory_management', 'inventory.create', 'product_management']$p$,
          '78dc5f45c0907570c8ffc4db35b830ac', 'ec5599adc8fc91183e330de5ab18bc7a'),
      (5, 'assistant_bulk_load_products', 'public.assistant_bulk_load_products(integer,integer,uuid,jsonb,integer)',
          $p$array['inventory.create', 'inventory_management', 'product_management']$p$,
          'f7b82d5aa838ad59c315212de5eace35', 'e8b80e236605b62aea5ea51d82496bdc')
    ) as t(orden, nombre, firma, permisos, md5_hoy, md5_final)
    order by orden
  loop
    v_oid := r.firma::regprocedure;
    v_new := E'\nbegin\n'
          || E'  -- Guarda GO Asistente (20260930235000, adaptada 2026-11-04): sesión = usuario, organización y permiso.\n'
          || '  perform public.fn_assistant_exigir(p_organization_id, p_user_id, ' || r.permisos || E');\n';

    select prosrc, md5(prosrc) into v_src, v_md5 from pg_proc where oid = v_oid;
    if v_md5 = r.md5_final then
      continue;  -- ya aplicada
    end if;
    if position('fn_assistant_exigir' in v_src) > 0 then
      raise notice '%: ya tiene fn_assistant_exigir con otro texto (md5 %); no se toca', r.nombre, v_md5;
      continue;
    end if;
    if v_md5 <> r.md5_hoy then
      raise exception '% cambió (md5 %): revisar a mano', r.nombre, v_md5;
    end if;
    v_def := pg_get_functiondef(v_oid);
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception '%: el fragmento no aparece una sola vez', r.nombre;
    end if;
    execute replace(v_def, v_old, v_new);
    select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
    if v_md5 <> r.md5_final then
      raise exception '%: md5 final inesperado (%)', r.nombre, v_md5;
    end if;
  end loop;
end;
$parche$;

-- EXECUTE: nunca public ni anon; authenticated (sesión) y service_role (servidor).
revoke execute on function public.assistant_void_sales_invoice(integer, uuid, uuid) from public, anon;
grant execute on function public.assistant_void_sales_invoice(integer, uuid, uuid) to authenticated, service_role;
revoke execute on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_create_transfer(integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_create_transfer(integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) from public, anon;
grant execute on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) to authenticated, service_role;
