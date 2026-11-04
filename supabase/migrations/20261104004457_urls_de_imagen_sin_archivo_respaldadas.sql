-- Tras borrarse el proyecto anterior, organizations.logo_url, website_settings.favicon_url
-- y categories.image_url apuntan a archivos de Storage que ya no existen: el ERP y los
-- sitios piden la imagen por /_next/image y reciben 400 (logo roto en el selector de
-- organizaciones, favicon y categorías). Se respalda cada URL rota en
-- private.urls_sin_archivo y se deja el campo en NULL (la UI ya muestra iniciales / nada).
-- private.fn_restaurar_urls_con_archivo() devuelve las URL cuyo archivo vuelva a existir.
-- Ensayo (ENSAYO_OK): 19 logos, 19 favicons y 251 imágenes de categoría; 289 respaldadas.
-- Rollback: supabase/rollbacks/20261104004457_urls_de_imagen_sin_archivo_respaldadas_rollback.sql
create table if not exists private.urls_sin_archivo (
  tabla text not null,
  pk text not null,
  columna text not null,
  valor text not null,
  vaciado_at timestamptz not null default now(),
  restaurado_at timestamptz,
  primary key (tabla, pk, columna)
);
revoke all on private.urls_sin_archivo from public, anon, authenticated;

create or replace function private.fn_url_storage_existe(u text) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select case
    when u is null or u = '' or u !~ '/storage/v1/object/public/' then null
    else exists (select 1 from storage.objects o
      where o.bucket_id = split_part(split_part(u, '/storage/v1/object/public/', 2), '/', 1)
        and o.name = regexp_replace(split_part(split_part(u, '/storage/v1/object/public/', 2), '?', 1), '^[^/]+/', ''))
  end
$f$;

create or replace function private.fn_restaurar_urls_con_archivo() returns integer
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare r record; v_n int := 0;
begin
  for r in select * from private.urls_sin_archivo where restaurado_at is null and private.fn_url_storage_existe(valor) loop
    if r.tabla = 'organizations' then
      update public.organizations set logo_url = r.valor where id = r.pk::int and logo_url is null;
    elsif r.tabla = 'website_settings' then
      update public.website_settings set favicon_url = r.valor where id::text = r.pk and favicon_url is null;
    elsif r.tabla = 'categories' then
      update public.categories set image_url = r.valor where id::text = r.pk and image_url is null;
    end if;
    update private.urls_sin_archivo set restaurado_at = now() where tabla = r.tabla and pk = r.pk and columna = r.columna;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $f$;
revoke all on function private.fn_url_storage_existe(text) from public, anon, authenticated;
revoke all on function private.fn_restaurar_urls_con_archivo() from public, anon, authenticated;

insert into private.urls_sin_archivo (tabla, pk, columna, valor)
select 'organizations', id::text, 'logo_url', logo_url from public.organizations where private.fn_url_storage_existe(logo_url) is false
union all
select 'website_settings', id::text, 'favicon_url', favicon_url from public.website_settings where private.fn_url_storage_existe(favicon_url) is false
union all
select 'categories', id::text, 'image_url', image_url from public.categories where private.fn_url_storage_existe(image_url) is false
on conflict do nothing;

update public.organizations set logo_url = null where private.fn_url_storage_existe(logo_url) is false;
update public.website_settings set favicon_url = null where private.fn_url_storage_existe(favicon_url) is false;
update public.categories set image_url = null where private.fn_url_storage_existe(image_url) is false;
