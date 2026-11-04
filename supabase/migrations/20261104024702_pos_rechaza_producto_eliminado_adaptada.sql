-- POS y ventas · Una línea NUEVA de venta no puede llevar un producto eliminado
-- ADAPTADA (2026-11-04) del bloque #8 de 20260930234100_pos_rechaza_producto_eliminado.sql,
-- el único que no entró al restaurar la base en el proyecto taqjemqjtumhwptchcxk.
--
-- Qué pasó
--   El parche original exigía que assistant_register_sales_invoice tuviera
--   md5(prosrc) = cf16d1953aacc29a8ddd2e7062b4a49b. En la base restaurada vale
--   d164163a968e591c5ba4cfe29d81fea7, que es EXACTAMENTE el cuerpo de
--   20260921130000_go_assistant_registrar_factura_venta.sql (verificado: md5 del
--   cuerpo del archivo = md5(prosrc) vivo). La versión cf16… salió de algún cambio
--   aplicado en el proyecto anterior que no quedó en el repositorio; no se pudo
--   reconstruir qué traía (supabase_migrations.schema_migrations está vacío en el
--   proyecto nuevo y _restore.drift no lo registra).
--   El resto de la migración original sí entró: fn_producto_exigir_vendible existe
--   (md5 eff8466949db9e4ab225c37644bf4296), y POS, factura de venta y
--   assistant_register_sale ya la llaman.
--
-- Qué cambia respecto al original
--   · Mismo fragmento ancla y misma inserción (fn_producto_exigir_vendible(org,
--     producto, now()) justo después de PRODUCT_NOT_IN_ORG). Solo cambia el texto del
--     comentario insertado («adaptada 2026-11-04»), y por eso el md5 final.
--   · Guard nuevo: md5(prosrc) de la definición viva al 2026-11-04, con dos bases
--     posibles para no depender del orden respecto a 20260930235000_..._adaptada:
--       d164163a968e591c5ba4cfe29d81fea7 (viva hoy)                    → 819ead138c0429e09cf0ae72062da1b2
--       783c5bb9bd1cfdf64de9daa4fa6bfb20 (con 20260930235000 adaptada)  → dabba397bf515d2e62178ca7084d58ed
--     (las dos rutas terminan en el mismo md5 dabba397… cuando ambas están aplicadas).
--   · «Ya aplicada» se detecta por la presencia de fn_producto_exigir_vendible en
--     prosrc, no por un md5 fijo: así sigue siendo idempotente en cualquier orden.
--   · No crea ni toca fn_producto_exigir_vendible (ya existe), ni firma, ni
--     SECURITY (sigue INVOKER), ni search_path, ni permisos, ni comentarios.
--
-- Rollback: 20260930234100_pos_rechaza_producto_eliminado_adaptada_rollback.sql

do $parche$
declare
  v_oid oid := 'public.assistant_register_sales_invoice(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_src text;
  v_def text;
  v_esperado text;
  v_old text := $frag$      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
$frag$;
  v_new text := $frag$      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
      -- Producto eliminado (20260930234100, adaptada 2026-11-04).
      perform public.fn_producto_exigir_vendible(p_organization_id, v_product_id, now());
$frag$;
begin
  if to_regprocedure('public.fn_producto_exigir_vendible(integer,integer,timestamp with time zone)') is null then
    raise exception 'falta fn_producto_exigir_vendible: aplicar antes la primera parte de 20260930234100';
  end if;
  select prosrc, md5(prosrc) into v_src, v_md5 from pg_proc where oid = v_oid;
  if position('fn_producto_exigir_vendible' in v_src) > 0 then
    return;  -- ya aplicada
  end if;
  v_esperado := case v_md5
    when 'd164163a968e591c5ba4cfe29d81fea7' then '819ead138c0429e09cf0ae72062da1b2'
    when '783c5bb9bd1cfdf64de9daa4fa6bfb20' then 'dabba397bf515d2e62178ca7084d58ed'
  end;
  if v_esperado is null then
    raise exception 'assistant_register_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> v_esperado then
    raise exception 'assistant_register_sales_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- ── Guarda de GO Asistente en el MISMO archivo (guardarraíl 41) ─────────────────────────────
-- Ninguna migración deja assistant_register_sales_invoice sin fn_assistant_exigir ni ejecutable
-- por anon. En producción esta guarda entró justo después, con 20261104024716 (adaptada de
-- 20260930235000); aquí se repite tal cual. Es idempotente: si ya está, no hace nada, y el
-- resultado final es el mismo (md5 dabba397…) en cualquier orden.
do $parche$
declare
  v_oid oid := 'public.assistant_register_sales_invoice(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_src text;
  v_def text;
  v_esperado text;
  v_old text := $frag$
begin
$frag$;
  v_new text := $frag$
begin
  -- Guarda GO Asistente (20260930235000, adaptada 2026-11-04): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create', 'finance.create']);
$frag$;
begin
  if to_regprocedure('public.fn_assistant_exigir(integer,uuid,text[])') is null then
    raise exception 'falta fn_assistant_exigir: aplicar antes la primera parte de 20260930235000';
  end if;
  select prosrc, md5(prosrc) into v_src, v_md5 from pg_proc where oid = v_oid;
  if position('fn_assistant_exigir' in v_src) > 0 then
    return;  -- ya aplicada
  end if;
  v_esperado := case v_md5
    when 'd164163a968e591c5ba4cfe29d81fea7' then '783c5bb9bd1cfdf64de9daa4fa6bfb20'
    when '819ead138c0429e09cf0ae72062da1b2' then 'dabba397bf515d2e62178ca7084d58ed'
  end;
  if v_esperado is null then
    raise exception 'assistant_register_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> v_esperado then
    raise exception 'assistant_register_sales_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- EXECUTE: nunca public ni anon; authenticated (sesión) y service_role (servidor).
revoke execute on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) to authenticated, service_role;
