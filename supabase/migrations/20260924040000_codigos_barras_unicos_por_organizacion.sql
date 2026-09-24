-- Códigos de barras únicos por organización (decisión del dueño, 2026-09-24).
--
-- 1. Respaldo: cada código que se cambia queda en products_barcode_auditoria
--    (producto, organización, código anterior y nuevo) para poder revertir.
-- 2. Renumeración SOLO de las variantes que heredaron el código de su padre
--    (products.barcode = padre.barcode). Reciben un código nuevo de la
--    numeración de su organización (_codigos_barras_tomar: el mismo generador
--    del catálogo, que salta los códigos ya usados). No se tocan los productos
--    principales ni las variantes con un código propio distinto al del padre.
--    Se incluyen las variantes eliminadas: si alguien las restaura, no chocan.
-- 3. Índice único parcial (organization_id, barcode) para productos no
--    eliminados con código. Los grupos repetidos que NO son herencia (códigos
--    que el usuario escribió igual en productos distintos) se dejan como están
--    y se reportan: la fila más antigua de cada grupo entra al índice y las
--    demás quedan fuera por id (lista fija calculada al aplicar). Cuando el
--    dueño resuelva esos grupos, se recrea el índice sin la lista.
--
-- La importación CSV (fn_importar_productos_lote) ya aísla cada fila en su
-- propia subtransacción: un código repetido hace fallar esa fila («DUPLICADO»)
-- y no el lote. La carga con IA marca como error la fila con un código
-- repetido dentro del archivo antes de cargar.

create table if not exists public.products_barcode_auditoria (
  id bigserial primary key,
  product_id integer not null,
  organization_id integer not null,
  barcode_anterior text,
  barcode_nuevo text,
  motivo text not null,
  migracion text not null,
  created_at timestamptz not null default now()
);

comment on table public.products_barcode_auditoria is
  'Respaldo de códigos de barras cambiados por migraciones (para revertir). Solo service_role.';

alter table public.products_barcode_auditoria enable row level security;
revoke all on table public.products_barcode_auditoria from anon, authenticated, public;
grant all on table public.products_barcode_auditoria to service_role;
grant usage, select on sequence public.products_barcode_auditoria_id_seq to service_role;

do $$
declare
  r record;
  v_ids integer[];
  v_codigos text[];
  i integer;
begin
  -- Idempotente: si ya se aplicó, no quedan variantes con el código del padre.
  for r in
    select v.organization_id, array_agg(v.id order by v.parent_product_id, v.id) as ids
    from public.products v
    join public.products p on p.id = v.parent_product_id
    where coalesce(btrim(v.barcode), '') <> ''
      and p.barcode = v.barcode
    group by v.organization_id
    order by v.organization_id
  loop
    v_ids := r.ids;
    v_codigos := public._codigos_barras_tomar(r.organization_id, cardinality(v_ids));
    for i in 1..cardinality(v_ids) loop
      insert into public.products_barcode_auditoria
        (product_id, organization_id, barcode_anterior, barcode_nuevo, motivo, migracion)
      select id, organization_id, barcode, v_codigos[i], 'variante_heredaba_codigo_del_padre',
             '20260924040000_codigos_barras_unicos_por_organizacion'
      from public.products where id = v_ids[i];
      update public.products
      set barcode = v_codigos[i], updated_at = now()
      where id = v_ids[i];
    end loop;
  end loop;
end;
$$;

-- Índice único parcial con los grupos restantes fuera (todas sus filas salvo
-- la de menor id). La lista se calcula aquí y queda fija en el índice.
do $$
declare
  v_fuera integer[];
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ux_products_org_barcode') then
    return;
  end if;

  select coalesce(array_agg(x.id order by x.id), '{}')
  into v_fuera
  from (
    select p.id,
           row_number() over (partition by p.organization_id, p.barcode order by p.id) as n
    from public.products p
    where p.barcode is not null and p.barcode <> ''
      and coalesce(p.status, 'active') <> 'deleted'
  ) x
  where x.n > 1;

  if cardinality(v_fuera) > 100 then
    raise exception 'Quedan % filas con código repetido: revisar antes de crear el índice', cardinality(v_fuera);
  end if;

  execute format(
    'create unique index ux_products_org_barcode on public.products (organization_id, barcode) '
    'where barcode is not null and barcode <> '''' and coalesce(status, ''active'') <> ''deleted''%s',
    case when cardinality(v_fuera) > 0
      then format(' and not (id = any (%L::integer[]))', v_fuera)
      else '' end
  );
end;
$$;

comment on index public.ux_products_org_barcode is
  'Código de barras único por organización (productos no eliminados). Los ids excluidos son repetidos anteriores a 2026-09-24 pendientes de decisión.';
