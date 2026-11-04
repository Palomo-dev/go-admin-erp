-- Reversión de 20260930234100_pos_rechaza_producto_eliminado_adaptada.sql
--
-- Quita de assistant_register_sales_invoice la llamada a fn_producto_exigir_vendible
-- y comprueba el md5 de prosrc que tenía justo antes:
--   819ead138c0429e09cf0ae72062da1b2 → d164163a968e591c5ba4cfe29d81fea7 (viva al 2026-11-04,
--                                      idéntica al cuerpo de 20260921130000)
--   dabba397bf515d2e62178ca7084d58ed → 783c5bb9bd1cfdf64de9daa4fa6bfb20 (si sigue aplicada
--                                      20260930235000 adaptada; su rollback lleva después a d164163a…)
-- Si el md5 es otro, se detiene. Revertir las dos adaptadas, en cualquier orden,
-- deja la función exactamente como estaba el 2026-11-04 (ensayado).
--
-- Qué cambia respecto al rollback original: solo revierte esta función (el resto
-- de 20260930234100 sí entró y tiene su propio rollback) y NO borra
-- fn_producto_exigir_vendible, porque la adaptada no la crea.
-- ADVERTENCIA: GO Assistant vuelve a facturar productos eliminados. No toca datos.

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
      -- Producto eliminado (20260930234100, adaptada 2026-11-04).
      perform public.fn_producto_exigir_vendible(p_organization_id, v_product_id, now());
$frag$;
  v_new text := $frag$      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
$frag$;
begin
  select prosrc, md5(prosrc) into v_src, v_md5 from pg_proc where oid = v_oid;
  if v_md5 in ('d164163a968e591c5ba4cfe29d81fea7', '783c5bb9bd1cfdf64de9daa4fa6bfb20') then
    return;  -- ya revertida
  end if;
  v_esperado := case v_md5
    when '819ead138c0429e09cf0ae72062da1b2' then 'd164163a968e591c5ba4cfe29d81fea7'
    when 'dabba397bf515d2e62178ca7084d58ed' then '783c5bb9bd1cfdf64de9daa4fa6bfb20'
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
