-- Inventario · variantes huérfanas 1/3 — Eliminar un padre elimina sus variantes
-- docs/inventario/VARIANTES-HUERFANAS.md
--
-- Causa: un producto padre se elimina con baja lógica (products.status = 'deleted')
-- y sus variantes (products.parent_product_id → padre) se quedaban vivas. Entre
-- el 2026-08-01 y el 2026-09-16 eso dejó 2.084 variantes activas bajo 398 padres
-- eliminados en 10 organizaciones (936 en la org 137). La lista de Productos no
-- las muestra (solo trae padres) pero el stock, el inicio y los reportes las
-- contaban una por una: la org 137 veía «226 agotados» en el inicio y 0 en la
-- lista con «Sin stock».
--
-- Caminos que eliminan un producto (todos terminan en UPDATE products.status):
--   · fn_producto_cambiar_estado   — detalle del producto y, desde hoy, la lista
--   · soft_delete_product          — la lista hasta hoy (legado, sin permiso fino)
--   · deactivate_product (x2)      — legado, sin llamadores en src/
--   · fn_productos_estado_masivo   — acciones masivas (ya arrastraba variantes)
--   · fn_producto_guardar          — editar: da de baja las variantes quitadas
--   · fn_producto_variante_estado  — una variante suelta
--   · PostgREST directo            — la política products_update_policy lo admite
--
-- Decisión: un disparador AFTER UPDATE OF status sobre products, no una RPC más.
-- Es el único punto por el que pasan TODOS los caminos, incluidos los legados,
-- el importador y un UPDATE directo por PostgREST; una RPC «única» dejaría fuera
-- los que no la llaman. Corre en la misma transacción que la baja del padre:
-- o caen todos, o ninguno.
--
--   · Padre → 'deleted': sus variantes no eliminadas pasan a 'deleted' y su
--     estado anterior queda en private.inv_variantes_baja_en_cascada.
--   · Padre 'deleted' → otro estado (restaurar: el importador con
--     PRODUCTO_RESTAURADO o fn_producto_cambiar_estado; la acción masiva no
--     alcanza productos eliminados): vuelven SOLO las variantes que
--     cayeron con él, cada una a su estado anterior exacto. Las que se habían
--     eliminado una por una antes (o se quitaron al editar) siguen eliminadas.
--   · Guarda BEFORE: no se crea ni se revive (deleted → vivo) una variante bajo
--     un padre eliminado, ni se mueve una variante viva bajo uno. Cambiar entre
--     estados vivos sí se permite (no bloquea a las huérfanas que la limpieza deja
--     por tener stock). Error: 'variante_padre_eliminado' (23514).
--   · fn_productos_estado_masivo (definición viva, md5 comprobado): al eliminar ya
--     no marca a mano las variantes de un padre que cae en la misma llamada; las
--     da de baja el disparador, que guarda su estado para restaurarlas. El resumen
--     (actualizados/seleccionados/variantes) no cambia.
--
-- Rollback: supabase/rollbacks/20260930233000_inv_variantes_baja_en_cascada_rollback.sql

-- ── 1. Rastro de las bajas en cascada ──────────────────────────────────────
create table if not exists private.inv_variantes_baja_en_cascada (
  variant_id integer primary key,
  parent_id integer not null,
  organization_id integer not null,
  status_previo text,
  updated_at_previo timestamptz,
  origen text not null check (origen in ('cascada', 'limpieza_20260930')),
  registrado_en timestamptz not null default now()
);
create index if not exists inv_variantes_baja_en_cascada_parent_idx
  on private.inv_variantes_baja_en_cascada (parent_id);
revoke all on private.inv_variantes_baja_en_cascada from public, anon, authenticated;

comment on table private.inv_variantes_baja_en_cascada is
  'Variantes dadas de baja con su padre (cascada) o por la limpieza 20260930233200: estado previo para restaurarlas al restaurar el padre.';

-- ── 2. Cascada al eliminar y restauración al restaurar ─────────────────────
create or replace function public.fn_producto_int_baja_variantes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'deleted' then
    with previas as (
      select v.id, v.status, v.updated_at
        from public.products v
       where v.parent_product_id = new.id
         and v.organization_id = new.organization_id
         and coalesce(v.status, 'active') <> 'deleted'
       for update
    ),
    baja as (
      update public.products v
         set status = 'deleted', updated_at = now()
        from previas
       where v.id = previas.id
      returning v.id, previas.status as status_previo, previas.updated_at as updated_at_previo
    )
    insert into private.inv_variantes_baja_en_cascada
      (variant_id, parent_id, organization_id, status_previo, updated_at_previo, origen)
    select b.id, new.id, new.organization_id, b.status_previo, b.updated_at_previo, 'cascada'
      from baja b
    on conflict (variant_id) do update
      set parent_id = excluded.parent_id,
          organization_id = excluded.organization_id,
          status_previo = excluded.status_previo,
          updated_at_previo = excluded.updated_at_previo,
          origen = excluded.origen,
          registrado_en = now();
  elsif old.status = 'deleted' then
    with restaurables as (
      delete from private.inv_variantes_baja_en_cascada r
       where r.parent_id = new.id
      returning r.variant_id, r.status_previo
    )
    update public.products v
       set status = r.status_previo, updated_at = now()
      from restaurables r
     where v.id = r.variant_id
       and v.parent_product_id = new.id
       and v.organization_id = new.organization_id
       and v.status = 'deleted';
  end if;
  return null;
end;
$$;

comment on function public.fn_producto_int_baja_variantes() is
  'Disparador: eliminar un padre da de baja sus variantes (guarda su estado) y restaurarlo devuelve las que cayeron con él. docs/inventario/VARIANTES-HUERFANAS.md';
revoke all on function public.fn_producto_int_baja_variantes() from public, anon, authenticated;

drop trigger if exists trg_producto_baja_variantes on public.products;
create trigger trg_producto_baja_variantes
  after update of status on public.products
  for each row
  when (old.status is distinct from new.status and (new.status = 'deleted' or old.status = 'deleted'))
  execute function public.fn_producto_int_baja_variantes();

-- ── 3. Guarda: ninguna variante viva nueva bajo un padre eliminado ─────────
create or replace function public.fn_producto_int_variante_padre_vigente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_product_id is null or coalesce(new.status, 'active') = 'deleted' then
    return new;
  end if;
  -- Ni se revive ni se mueve de padre: cambiar entre estados vivos se permite.
  if tg_op = 'UPDATE'
     and old.parent_product_id is not distinct from new.parent_product_id
     and coalesce(old.status, 'active') <> 'deleted' then
    return new;
  end if;
  -- Solo el rollback de la limpieza 20260930233200 devuelve huérfanas a su estado.
  if coalesce(current_setting('inv.permitir_variante_huerfana', true), '') = 'on' then
    return new;
  end if;
  if exists (select 1 from public.products pp
              where pp.id = new.parent_product_id and pp.status = 'deleted') then
    raise exception 'variante_padre_eliminado' using errcode = '23514',
      detail = format('El producto padre %s está eliminado: restáurelo antes de activar o crear sus variantes.',
                      new.parent_product_id);
  end if;
  return new;
end;
$$;

comment on function public.fn_producto_int_variante_padre_vigente() is
  'Disparador: impide crear, revivir o mover una variante viva bajo un padre eliminado (variante_padre_eliminado). docs/inventario/VARIANTES-HUERFANAS.md';
revoke all on function public.fn_producto_int_variante_padre_vigente() from public, anon, authenticated;

drop trigger if exists trg_producto_variante_padre_vigente on public.products;
create trigger trg_producto_variante_padre_vigente
  before insert or update of status, parent_product_id on public.products
  for each row
  execute function public.fn_producto_int_variante_padre_vigente();

-- ── 4. Parche de fn_productos_estado_masivo (definición viva) ──────────────
do $parche$
declare
  v_oid oid := 'public.fn_productos_estado_masivo(integer,integer[],text)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$  update public.products set status = p_status, updated_at = now()
   where id = any(v_ids) and organization_id = p_organization_id
     and status is distinct from p_status;
  get diagnostics v_n = row_count;
$frag$;
  v_new text := $frag$  -- Eliminar (20260930233000): las variantes de un padre que cae en esta misma
  -- llamada las da de baja el disparador de cascada, que guarda su estado para
  -- restaurarlas con el padre. Se suman a `actualizados` como antes.
  update public.products set status = p_status, updated_at = now()
   where id = any(v_ids) and organization_id = p_organization_id
     and status is distinct from p_status
     and not (p_status = 'deleted' and coalesce(parent_product_id = any(v_ids), false));
  get diagnostics v_n = row_count;
  if p_status = 'deleted' then
    select v_n + count(*) into v_n from public.products
     where id = any(v_ids) and parent_product_id = any(v_ids) and status = 'deleted';
  end if;
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '5a07af394490108d83143753c749aa25' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '2313276899bfe5433ff3b7d5d453e44e' then
    raise exception 'fn_productos_estado_masivo cambió (md5 %): revisar el parche', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_productos_estado_masivo: el fragmento del parche no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '5a07af394490108d83143753c749aa25' then
    raise exception 'fn_productos_estado_masivo: md5 tras el parche inesperado (%)', v_md5;
  end if;
end;
$parche$;
