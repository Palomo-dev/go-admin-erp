-- Reversión de 20261125013000_resenas_reales_flujo.sql.
-- OJO: borra datos de las tablas y columnas nuevas (correos de autores, solicitudes enviadas,
-- destacadas, «Llegó por», ajustes de reseñas). No los restaura. El bucket solo se borra si está vacío.

select cron.unschedule('pedir-resena-sitio') where exists (select 1 from cron.job where jobname = 'pedir-resena-sitio');

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
  if p_path is null or p_path not in ('/api/cron/carritos-abandonados', '/api/cron/recordatorio-pago') then
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

delete from storage.buckets b
 where b.id = 'review-images'
   and not exists (select 1 from storage.objects o where o.bucket_id = 'review-images');

drop table if exists public.product_review_requests;
drop table if exists public.product_review_private;

drop index if exists public.ux_product_reviews_pedido_producto;
alter table public.product_reviews drop constraint if exists product_reviews_source_check;
alter table public.product_reviews
  drop column if exists source,
  drop column if exists is_featured;

alter table public.website_settings drop constraint if exists website_settings_reviews_default_source_check;
alter table public.website_settings drop constraint if exists website_settings_reviews_who_can_write_check;
alter table public.website_settings drop constraint if exists website_settings_reviews_request_days_check;
alter table public.website_settings
  drop column if exists reviews_request_reminder,
  drop column if exists reviews_request_days,
  drop column if exists reviews_request_enabled,
  drop column if exists reviews_allow_photos,
  drop column if exists reviews_who_can_write,
  drop column if exists reviews_default_source;
