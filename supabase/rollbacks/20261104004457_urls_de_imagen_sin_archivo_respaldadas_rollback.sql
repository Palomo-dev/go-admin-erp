-- Rollback de 20261104004457: devuelve cada URL respaldada (aunque su archivo siga sin
-- existir) y retira las funciones y la tabla de respaldo.
update public.organizations o set logo_url = u.valor
  from private.urls_sin_archivo u where u.tabla = 'organizations' and u.restaurado_at is null and o.id = u.pk::int and o.logo_url is null;
update public.website_settings w set favicon_url = u.valor
  from private.urls_sin_archivo u where u.tabla = 'website_settings' and u.restaurado_at is null and w.id::text = u.pk and w.favicon_url is null;
update public.categories c set image_url = u.valor
  from private.urls_sin_archivo u where u.tabla = 'categories' and u.restaurado_at is null and c.id::text = u.pk and c.image_url is null;
drop function if exists private.fn_restaurar_urls_con_archivo();
drop function if exists private.fn_url_storage_existe(text);
drop table if exists private.urls_sin_archivo;
