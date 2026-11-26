-- Uso en la tienda de cada pasarela (encargo 2026-11-26, Finanzas › Métodos de pago).
--
-- «Usar en la tienda para»:
--   'ambos'              = pago completo y anticipo de contraentrega (POR DEFECTO: lo de hoy).
--   'solo_anticipo'      = no sale como opción de pago del checkout; solo cobra el anticipo.
--   'solo_pago_completo' = sale en el checkout; nunca se usa para el anticipo.
-- La tienda (goadmin-websites, lib/payments/usoPasarela.ts) lo lee en `getWebsitePaymentMethods`.
-- Aditiva: columna NOT NULL con DEFAULT constante (en PG 17 no reescribe la tabla); ninguna fila
-- cambia de comportamiento. Pedidos, anticipos y webhooks no se tocan.

alter table public.organization_payment_methods
  add column if not exists website_usage text not null default 'ambos';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_payment_methods_website_usage_check'
      and conrelid = 'public.organization_payment_methods'::regclass
  ) then
    alter table public.organization_payment_methods
      add constraint organization_payment_methods_website_usage_check
      check (website_usage in ('ambos', 'solo_anticipo', 'solo_pago_completo'));
  end if;
end $$;

comment on column public.organization_payment_methods.website_usage is
  'Uso en la tienda en línea de una pasarela: ambos (pago completo y anticipo de contraentrega, por defecto), solo_anticipo (no sale en el checkout, solo cobra el anticipo) o solo_pago_completo (no se usa para el anticipo).';

-- Validación en el servidor: con la contraentrega con anticipo activa (fila «cash» activa y visible
-- en la tienda, con alguna sede que ofrece la contraentrega y pide anticipo) no se puede dejar a la
-- organización sin pasarela que sirva para el anticipo. Solo se mira cuando una pasarela pasa a
-- 'solo_pago_completo'; activar, desactivar u ocultar métodos sigue como hoy.
-- SECURITY INVOKER: lee las filas de la misma organización con los permisos de quien guarda.
create or replace function public.fn_opm_validar_uso_tienda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.website_usage is not distinct from new.website_usage then
    return new; -- guardar otra cosa de una pasarela que ya era «solo pago completo»: como hoy
  end if;
  if exists (
    select 1
    from public.organization_payment_methods efectivo,
         lateral jsonb_each(
           case when jsonb_typeof(efectivo.settings -> 'contraentrega' -> 'sedes') = 'object'
                then efectivo.settings -> 'contraentrega' -> 'sedes' else '{}'::jsonb end
         ) sede
    where efectivo.organization_id = new.organization_id
      and efectivo.payment_method_code = 'cash'
      and efectivo.is_active is true
      and efectivo.show_on_website is true
      and jsonb_typeof(sede.value) = 'object'
      and coalesce(sede.value ->> 'ofrecer', 'true') <> 'false'
      and sede.value -> 'anticipo' ->> 'tipo' in ('envio', 'porcentaje', 'fijo')
  ) and not exists (
    select 1
    from public.organization_payment_methods p
    where p.organization_id = new.organization_id
      and p.id <> new.id
      and p.integration_connection_id is not null
      and p.is_active is true
      and p.show_on_website is true
      and p.website_usage <> 'solo_pago_completo'
  ) then
    raise exception 'La contraentrega con anticipo está activa: deja al menos una pasarela que sirva para el anticipo.'
      using errcode = 'P0001', hint = 'uso_tienda_sin_anticipo';
  end if;
  return new;
end;
$$;

comment on function public.fn_opm_validar_uso_tienda() is
  'Impide dejar sin pasarela para el anticipo a una organización con contraentrega con anticipo activa (website_usage).';

drop trigger if exists trg_opm_validar_uso_tienda on public.organization_payment_methods;
create trigger trg_opm_validar_uso_tienda
  before insert or update of website_usage on public.organization_payment_methods
  for each row
  when (new.website_usage = 'solo_pago_completo' and new.integration_connection_id is not null)
  execute function public.fn_opm_validar_uso_tienda();
