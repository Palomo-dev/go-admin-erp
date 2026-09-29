-- El disparador after_organization_update_country llama a setup_organization_defaults cada vez que
-- cambia organizations.country_code, y esa función BORRA y rehace organization_taxes y
-- organization_payment_methods (incluidos los de pasarela ya conectados) y la moneda base. Un admin que
-- corrigiera el país de su organización en Organización › Información perdía toda esa configuración.
-- Encontrado al normalizar el país (20260929213000, docs/design/AUTH-ACCESO-V2.md §13.7).
--
-- Ahora, en UPDATE, solo se aplican los valores por defecto del país si la organización todavía no
-- tiene impuestos ni métodos de pago (una organización recién creada o nunca configurada). En INSERT
-- sigue igual. Con configuración existente, el cambio de país no toca nada: se ajusta a mano.

create or replace function public.trigger_setup_organization_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  result text;
begin
  if new.country_code is not null then
    if tg_op = 'INSERT' then
      select setup_organization_defaults(new.id, new.country_code) into result;
    elsif tg_op = 'UPDATE' and (old.country_code is distinct from new.country_code) then
      if not exists (select 1 from public.organization_taxes where organization_id = new.id)
         and not exists (select 1 from public.organization_payment_methods where organization_id = new.id) then
        select setup_organization_defaults(new.id, new.country_code) into result;
      end if;
    end if;
  end if;
  return new;
end;
$$;
