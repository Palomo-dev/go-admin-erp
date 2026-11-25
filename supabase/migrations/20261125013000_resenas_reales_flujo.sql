-- Reseñas reales y de ejemplo — flujo (Figma «16 Sitio web», sección 3123-88477, lámina 5B).
-- Solo aditiva: columnas NULL-ables o con DEFAULT, dos tablas nuevas, un bucket y una ruta más en la
-- allowlist del cron de la tienda. Nada de lo que funciona hoy cambia:
--   * Las 46 filas actuales de website_settings quedan con reviews_default_source = NULL (= reseñas de
--     ejemplo, como hoy). El DEFAULT 'real' se pone DESPUÉS de crear la columna, así que solo lo
--     reciben las tiendas nuevas.
--   * NULL en los demás ajustes = comportamiento de hoy (cualquiera escribe, fotos sí, sin correo).
--   * product_reviews tiene 0 filas al aplicar; aun así las columnas nuevas llevan DEFAULT.

-- 1) Ajustes de reseñas de la tienda («Ajustes de reseñas», 3C). Valen para toda la tienda.
alter table public.website_settings
  add column if not exists reviews_default_source text,
  add column if not exists reviews_who_can_write text,
  add column if not exists reviews_allow_photos boolean,
  add column if not exists reviews_request_enabled boolean,
  add column if not exists reviews_request_days smallint,
  add column if not exists reviews_request_reminder boolean;

alter table public.website_settings alter column reviews_default_source set default 'real';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'website_settings_reviews_default_source_check') then
    alter table public.website_settings add constraint website_settings_reviews_default_source_check
      check (reviews_default_source is null or reviews_default_source in ('real', 'mixed', 'auto', 'generated'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'website_settings_reviews_who_can_write_check') then
    alter table public.website_settings add constraint website_settings_reviews_who_can_write_check
      check (reviews_who_can_write is null or reviews_who_can_write in ('any', 'buyers'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'website_settings_reviews_request_days_check') then
    alter table public.website_settings add constraint website_settings_reviews_request_days_check
      check (reviews_request_days is null or reviews_request_days between 1 and 30);
  end if;
end $$;

comment on column public.website_settings.reviews_default_source is
  'Origen de las reseñas cuando la sección de la ficha no elige uno. NULL = ejemplos (tiendas anteriores al 2026-11-25); las tiendas nuevas nacen con real.';
comment on column public.website_settings.reviews_who_can_write is
  'any | buyers. NULL = any. buyers se exige en el servidor de la tienda (/api/reviews).';
comment on column public.website_settings.reviews_allow_photos is 'NULL = sí. Hasta 3 fotos de 5 MB.';
comment on column public.website_settings.reviews_request_enabled is
  'Correo «¿Qué te pareció tu compra?» tras la entrega. NULL = apagado.';
comment on column public.website_settings.reviews_request_days is 'Días después de entregado (1-30). NULL = 7.';
comment on column public.website_settings.reviews_request_reminder is 'Un recordatorio 5 días después. NULL = sí.';

-- 2) Reseñas: «Destacar» y «Llegó por». Públicas (la tienda las usa para ordenar y no son datos personales).
alter table public.product_reviews
  add column if not exists is_featured boolean not null default false,
  add column if not exists source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_reviews_source_check') then
    alter table public.product_reviews add constraint product_reviews_source_check
      check (source is null or source in ('ficha', 'correo', 'pedido', 'cuenta'));
  end if;
end $$;

-- Una opinión por producto y pedido («Ya opinaste sobre este producto»).
create unique index if not exists ux_product_reviews_pedido_producto
  on public.product_reviews (order_id, product_id) where order_id is not null;

comment on column public.product_reviews.is_featured is 'Destacada por la tienda: sale primero. Hasta 3 por producto (lo limita el ERP).';
comment on column public.product_reviews.source is 'Llegó por: ficha | correo | pedido | cuenta. NULL = anterior a este flujo.';

-- 3) Datos privados de cada reseña. product_reviews se lee en público (política status = approved,
--    todas las columnas), así que el correo, el método de verificación y las fotos ocultas van aquí.
create table if not exists public.product_review_private (
  review_id uuid primary key references public.product_reviews(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  author_email text,
  verification_method text check (verification_method is null or verification_method in ('sesion', 'pedido', 'enlace')),
  hidden_images text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ix_product_review_private_org_email on public.product_review_private (organization_id, lower(author_email));

alter table public.product_review_private enable row level security;
revoke all on public.product_review_private from anon;
drop policy if exists product_review_private_miembros on public.product_review_private;
create policy product_review_private_miembros on public.product_review_private
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true
  ));

-- 4) Solicitudes «¿Qué te pareció tu compra?»: una por pedido (la fila es el reclamo del envío).
create table if not exists public.product_review_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  web_order_id uuid not null unique references public.web_orders(id) on delete cascade,
  email text not null,
  sent_at timestamptz,
  resend_id text,
  reminder_claimed_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_resend_id text,
  unsubscribed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists ix_product_review_requests_org_email on public.product_review_requests (organization_id, email);

alter table public.product_review_requests enable row level security;
revoke all on public.product_review_requests from anon;
drop policy if exists product_review_requests_miembros on public.product_review_requests;
create policy product_review_requests_miembros on public.product_review_requests
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true
  ));

-- 5) Fotos de las reseñas: bucket público de lectura; solo el servidor de la tienda sube (service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-images', 'review-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 6) Tarea diaria «pedir reseña»: misma vía que recordatorio-pago (pg_cron → fn_websites_cron_post).
--    CREATE OR REPLACE conserva el ACL. Solo cambia la allowlist.
create or replace function public.fn_websites_cron_post(p_path text)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_secret text;
  v_req bigint;
  v_base constant text := 'https://goadmin-websites-8fs1.vercel.app';
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_path is null or p_path not in ('/api/cron/carritos-abandonados', '/api/cron/recordatorio-pago', '/api/cron/pedir-resena') then
    raise exception 'ruta no permitida' using errcode = '22023';
  end if;
  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s
   where s.name = 'crm_cron_secret'
   order by s.created_at desc
   limit 1;
  if v_secret is null or length(v_secret) < 16 then
    raise exception 'fn_websites_cron_post: crm_cron_secret ausente en vault (fail-closed)';
  end if;
  select net.http_post(
    url := v_base || p_path,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'X-Webhook-Secret', v_secret,
      'Content-Type', 'application/json',
      'X-Cron-Source', 'pg_cron'
    ),
    timeout_milliseconds := 55000
  ) into v_req;
  return v_req;
end;
$function$;

-- 10:00 de Colombia (15:00 UTC), una vez al día. cron.schedule con nombre reemplaza si ya existe.
select cron.schedule('pedir-resena-sitio', '0 15 * * *', $$select public.fn_websites_cron_post('/api/cron/pedir-resena')$$);
