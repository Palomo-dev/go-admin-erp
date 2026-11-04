-- Reversión de 20260930235000_assistant_rpc_endurecimiento_adaptada.sql
--
-- Quita de assistant_register_sales_invoice la llamada a fn_assistant_exigir y
-- comprueba el md5 de prosrc que tenía justo antes:
--   783c5bb9bd1cfdf64de9daa4fa6bfb20 → d164163a968e591c5ba4cfe29d81fea7 (viva al 2026-11-04)
--   dabba397bf515d2e62178ca7084d58ed → 819ead138c0429e09cf0ae72062da1b2 (con 20260930234100 adaptada;
--                                      su rollback la lleva después a d164163a…)
-- Si el md5 es otro, se detiene.
--
-- Qué cambia respecto al rollback original: solo esta función, y NO borra
-- fn_assistant_exigir (la usan las demás assistant_* que sí quedaron parcheadas).
-- Los permisos (sin anon ni public) se dejan como están: eran así antes de la
-- adaptada.
-- ADVERTENCIA: la función vuelve a confiar en p_organization_id/p_user_id del
-- llamador. No toca datos.

do $parche$
declare
  v_oid oid := 'public.assistant_register_sales_invoice(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_esperado text;
  v_old text := $frag$
begin
  -- Guarda GO Asistente (20260930235000, adaptada 2026-11-04): sesión = usuario, organización y permiso.
  perform public.fn_assistant_exigir(p_organization_id, p_user_id, array['pos.create', 'finance.create']);
$frag$;
  v_new text := $frag$
begin
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 in ('d164163a968e591c5ba4cfe29d81fea7', '819ead138c0429e09cf0ae72062da1b2') then
    return;  -- ya revertida
  end if;
  v_esperado := case v_md5
    when '783c5bb9bd1cfdf64de9daa4fa6bfb20' then 'd164163a968e591c5ba4cfe29d81fea7'
    when 'dabba397bf515d2e62178ca7084d58ed' then '819ead138c0429e09cf0ae72062da1b2'
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
