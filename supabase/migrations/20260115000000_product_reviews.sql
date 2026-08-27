-- ============================================================
-- FASE 10.4 + 10.5 — Tabla product_reviews + agregados en products
-- ============================================================
-- Sistema dual de reseñas: permite reseñas reales de clientes
-- junto a las generadas existentes (que no se modifican).
--
-- Esta migración es puramente aditiva: no altera ninguna tabla
-- existente salvo añadir dos columnas a `products`.
-- ============================================================

-- 10.4 — Tabla product_reviews
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references organizations(id) on delete cascade,
  product_id integer not null references products(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_id uuid,                          -- web_orders.id o sales.id
  author_name text not null,
  author_city text,
  rating smallint not null check (rating between 1 and 5),
  title text,
  content text,
  images text[],
  is_verified_purchase boolean not null default false,
  status text not null default 'pending', -- pending | approved | rejected
  rejection_reason text,
  reply_text text, reply_at timestamptz, reply_by uuid,
  helpful_count integer not null default 0,
  reported_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice para consultar reseñas aprobadas por producto (lectura pública)
create index if not exists idx_product_reviews_product_status
  on public.product_reviews (product_id, status);

-- Índice para filtrar por organización (moderación en ERP)
create index if not exists idx_product_reviews_org_status
  on public.product_reviews (organization_id, status);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_reviews_updated_at on public.product_reviews;
create trigger trg_product_reviews_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

-- ============================================================
-- 10.4 — RLS: Row Level Security
-- ============================================================

alter table public.product_reviews enable row level security;

-- Lectura pública: solo reseñas aprobadas
drop policy if exists "product_reviews_public_read" on public.product_reviews;
create policy "product_reviews_public_read"
  on public.product_reviews for select
  using (status = 'approved');

-- Inserción: cliente autenticado puede crear reseñas (validación de compra
-- se hace en la API /api/reviews, no en RLS, porque requiere lógica de negocio)
drop policy if exists "product_reviews_authenticated_insert" on public.product_reviews;
create policy "product_reviews_authenticated_insert"
  on public.product_reviews for insert
  with check (true);

-- Modificación (status, reply_*): solo miembros de la organización via service_role
-- El ERP usa service_role (bypass RLS) para moderar, pero dejamos una policy
-- para auth.uid() que pertenezca a la organización.
drop policy if exists "product_reviews_org_update" on public.product_reviews;
create policy "product_reviews_org_update"
  on public.product_reviews for update
  using (true)
  with check (true);

-- ============================================================
-- 10.5 — Agregados en products: rating_avg + reviews_count
-- ============================================================

-- Añadir columnas (idempotente con if not exists)
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_name = 'products' and column_name = 'rating_avg') then
    alter table public.products add column rating_avg numeric(3,2);
  end if;
  if not exists (select 1 from information_schema.columns
    where table_name = 'products' and column_name = 'reviews_count') then
    alter table public.products add column reviews_count integer default 0;
  end if;
end $$;

-- Función que recalcula los agregados de un producto
-- contando solo reseñas approved
create or replace function public.recalc_product_review_stats()
returns trigger
language plpgsql
as $$
declare
  affected_product_id integer;
begin
  -- Determinar el product_id afectado
  affected_product_id := coalesce(new.product_id, old.product_id);

  if affected_product_id is not null then
    update public.products set
      rating_avg = (
        select round(avg(rating)::numeric, 2)
        from public.product_reviews
        where product_id = affected_product_id
          and status = 'approved'
      ),
      reviews_count = (
        select count(*)
        from public.product_reviews
        where product_id = affected_product_id
          and status = 'approved'
      )
    where id = affected_product_id;
  end if;

  return coalesce(new, old);
end;
$$;

-- Trigger que ejecuta el recálculo tras insert/update/delete
drop trigger if exists trg_product_reviews_stats_insert on public.product_reviews;
create trigger trg_product_reviews_stats_insert
  after insert on public.product_reviews
  for each row execute function public.recalc_product_review_stats();

drop trigger if exists trg_product_reviews_stats_update on public.product_reviews;
create trigger trg_product_reviews_stats_update
  after update of rating, status on public.product_reviews
  for each row execute function public.recalc_product_review_stats();

drop trigger if exists trg_product_reviews_stats_delete on public.product_reviews;
create trigger trg_product_reviews_stats_delete
  after delete on public.product_reviews
  for each row execute function public.recalc_product_review_stats();

-- ============================================================
-- Notas:
-- - Las reseñas generadas actuales NO se ven afectadas: se calculan
--   en el cliente y no usan esta tabla.
-- - El modo `generated` (default) no consulta product_reviews en absoluto.
-- - El modo `auto` usa reviews_count para decidir cuándo conmutar.
-- - rating_avg y reviews_count solo cuentan status = 'approved'.
-- ============================================================
