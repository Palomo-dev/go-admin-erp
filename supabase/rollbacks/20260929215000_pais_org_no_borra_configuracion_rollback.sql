-- Reversión de 20260929215000_pais_org_no_borra_configuracion.
-- ATENCIÓN: vuelve a borrar impuestos y métodos de pago de una organización cada vez que cambia su país.

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
            select setup_organization_defaults(new.id, new.country_code) into result;
        end if;
    end if;
    return new;
end;
$$;
