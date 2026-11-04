-- GO Asistente · Endurecimiento de assistant_register_sales_invoice
-- ADAPTADA (2026-11-04) del bloque #6 de 20260930235000_assistant_rpc_endurecimiento.sql,
-- que no entró al restaurar la base en el proyecto taqjemqjtumhwptchcxk.
--
-- Qué pasó
--   El parche original exigía md5(prosrc) = 24784c3215a4fcd06ccfddfc08beb16d (la
--   versión con el parche de 20260930234100). En la base restaurada la función vale
--   d164163a968e591c5ba4cfe29d81fea7 = cuerpo de 20260921130000 (verificado), sin el
--   parche de producto eliminado ni esta guarda. Es SECURITY INVOKER con EXECUTE para
--   authenticated: hoy confía en p_organization_id y p_user_id tal como llegan.
--   fn_assistant_exigir ya existe (md5 2fe3f3cc8558f184898d4e42e1f23b43) y el
--   revoke/grant final de la migración original sí corrió (sin anon ni public).
--
-- Qué cambia respecto al original
--   · Mismo fragmento ancla («begin» de columna 0, único) y misma llamada:
--     fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create','finance.create']).
--     Solo cambia el texto del comentario insertado («adaptada 2026-11-04»).
--   · Guard nuevo con dos bases posibles, para no depender del orden:
--       d164163a968e591c5ba4cfe29d81fea7 (viva hoy)                 → 783c5bb9bd1cfdf64de9daa4fa6bfb20
--       819ead138c0429e09cf0ae72062da1b2 (con 20260930234100 adaptada) → dabba397bf515d2e62178ca7084d58ed
--     Lo normal es aplicar primero 20260930234100_..._adaptada (orden por timestamp).
--   · «Ya aplicada» se detecta por la presencia de fn_assistant_exigir en prosrc.
--   · Solo esta función. Los bloques #7, #10, #11, #12 y #15 de la original
--     (assistant_void_sales_invoice, assistant_create_purchase_order,
--     assistant_create_transfer, assistant_create_adjustment,
--     assistant_bulk_load_products) TAMBIÉN se omitieron y quedan fuera de esta
--     adaptada: necesitan su propia revisión.
--   · Ni firma, ni SECURITY (sigue INVOKER), ni search_path, ni comentarios cambian.
--     El revoke/grant se repite (idempotente) para dejar el estado explícito.
--
-- Rollback: 20260930235000_assistant_rpc_endurecimiento_adaptada_rollback.sql

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
