-- Reversión de 20261104032000_assistant_rpc_endurecimiento_resto_adaptada.sql
--
-- Quita la llamada a fn_assistant_exigir de las cinco funciones y comprueba el md5
-- de prosrc que tenían justo antes (vivo al 2026-11-04):
--   assistant_void_sales_invoice     612207fec85f38e2b88ff7260c4c9fd3 → cb820d9a76f9789e382a94595da5cfcd
--   assistant_create_purchase_order  9ef17ae834bb5b41de81048a7c7b4f33 → eb44c04155163c9eedfee144c25ec6e2
--   assistant_create_transfer        f2817e3b86c28a6f2bf9a2dd53e1416d → eb74cb45a6c19139cf8bfdd5ec2e33f8
--   assistant_create_adjustment      ec5599adc8fc91183e330de5ab18bc7a → 78dc5f45c0907570c8ffc4db35b830ac
--   assistant_bulk_load_products     e8b80e236605b62aea5ea51d82496bdc → f7b82d5aa838ad59c315212de5eace35
-- Si el md5 es otro (la función cambió después), se detiene sin tocar nada.
--
-- Qué cambia respecto al rollback original: solo estas cinco funciones, y NO borra
-- fn_assistant_exigir (la usan las demás assistant_* que sí quedaron parcheadas).
-- Los permisos (sin anon ni public) se dejan como están: eran así antes de la
-- adaptada; devolver EXECUTE a anon le corresponde al rollback original.
-- ADVERTENCIA: las cinco vuelven a confiar en p_organization_id / p_user_id del
-- llamador. No toca datos.

do $parche$
declare
  r record;
  v_oid oid;
  v_md5 text;
  v_def text;
  v_old text;
  v_new text := $frag$
begin
$frag$;
begin
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
    ) as t(orden, nombre, firma, permisos, md5_previo, md5_parcheado)
    order by orden
  loop
    v_oid := r.firma::regprocedure;
    v_old := E'\nbegin\n'
          || E'  -- Guarda GO Asistente (20260930235000, adaptada 2026-11-04): sesión = usuario, organización y permiso.\n'
          || '  perform public.fn_assistant_exigir(p_organization_id, p_user_id, ' || r.permisos || E');\n';

    select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
    if v_md5 = r.md5_previo then
      continue;  -- ya revertida
    end if;
    if v_md5 <> r.md5_parcheado then
      raise exception '% cambió (md5 %): revisar a mano', r.nombre, v_md5;
    end if;
    v_def := pg_get_functiondef(v_oid);
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception '%: el fragmento no aparece una sola vez', r.nombre;
    end if;
    execute replace(v_def, v_old, v_new);
    select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
    if v_md5 <> r.md5_previo then
      raise exception '%: md5 final inesperado (%)', r.nombre, v_md5;
    end if;
  end loop;
end;
$parche$;
