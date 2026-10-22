-- Inventario · la ficha desde Stock y Kardex usa el uuid del producto.
--
-- fn_stock_listado añade `uuid` y `parent_uuid` a cada fila del jsonb. El id
-- numérico no cambia: el kardex sigue abriéndose con ?producto=<id>.
-- El uuid del padre se filtra por la misma organización.
--
-- md5(prosrc) antes:   f1fdb0f8f75c4ed15a262c35a1e4cbf7
-- md5(prosrc) después: 3033c44fdb9fa0892e413f7c659412fe
--
-- Rollback: supabase/rollbacks/20261022221035_stock_listado_uuid_rollback.sql

do $parche$
declare
  v_oid oid := 'public.fn_stock_listado(integer,jsonb,integer,integer)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old_id text := $frag$'product_id', g.product_id,
        'nombre', g.name,$frag$;
  v_new_id text := $frag$'product_id', g.product_id,
        'uuid', (select pu.uuid from public.products pu where pu.id = g.product_id and pu.organization_id = p_org),
        'nombre', g.name,$frag$;
  v_old_padre text := $frag$'parent_id', g.parent_product_id,
        'atributos',$frag$;
  v_new_padre text := $frag$'parent_id', g.parent_product_id,
        'parent_uuid', (select ppu.uuid from public.products ppu where ppu.id = g.parent_product_id and ppu.organization_id = p_org),
        'atributos',$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '3033c44fdb9fa0892e413f7c659412fe' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'f1fdb0f8f75c4ed15a262c35a1e4cbf7' then
    raise exception 'fn_stock_listado cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old_id, ''))) / length(v_old_id) <> 1 then
    raise exception 'fn_stock_listado: el fragmento del producto no aparece una sola vez';
  end if;
  if (length(v_def) - length(replace(v_def, v_old_padre, ''))) / length(v_old_padre) <> 1 then
    raise exception 'fn_stock_listado: el fragmento del padre no aparece una sola vez';
  end if;
  v_def := replace(v_def, v_old_id, v_new_id);
  v_def := replace(v_def, v_old_padre, v_new_padre);
  execute v_def;
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '3033c44fdb9fa0892e413f7c659412fe' then
    raise exception 'fn_stock_listado: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

revoke all on function public.fn_stock_listado(integer, jsonb, integer, integer) from anon, public;
grant execute on function public.fn_stock_listado(integer, jsonb, integer, integer) to authenticated, service_role;
