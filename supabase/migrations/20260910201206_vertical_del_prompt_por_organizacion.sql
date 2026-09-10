-- Vertical del prompt conversacional.
--
-- Hoy TODAS las organizaciones reciben un prompt de retail que habla de
-- "tarjetas de producto", "[PEDIDO_LISTO]" y "finalizar el pedido". Hotel X
-- genero 111.745 mensajes de IA con ese prompt.
--
-- NULL = se deduce del tipo de organizacion. Se deja explicito para poder
-- corregir los casos en que el tipo registrado no corresponde al catalogo real.
alter table public.ai_settings
  add column if not exists vertical text;

comment on column public.ai_settings.vertical is
  'Vertical para el prompt del bot: retail | hotel | restaurante | gimnasio | parqueadero | servicios. NULL = se deduce de organization_types. Existe porque el tipo registrado no siempre corresponde: hay organizaciones que figuran como restaurant y su catalogo son jeans.';

alter table public.ai_settings drop constraint if exists ai_settings_vertical_ck;
alter table public.ai_settings add constraint ai_settings_vertical_ck
  check (vertical is null or vertical in
    ('retail','hotel','restaurante','gimnasio','parqueadero','servicios','transporte'));

-- Correccion respaldada por evidencia: la organizacion 120 esta registrada
-- como restaurant pero su catalogo es de ropa.
-- Sin esto recibiria un prompt de restaurante para vender ropa.
update public.ai_settings s
   set vertical = 'retail'
  from organizations o
 where o.id = s.organization_id
   and s.organization_id = 120
   and s.vertical is null;

-- Vista de apoyo: el vertical efectivo de cada organizacion.
create or replace view public.ai_vertical_efectivo as
select
  s.organization_id,
  coalesce(
    s.vertical,
    case lower(coalesce(ot.name, ''))
      when 'hotel'      then 'hotel'
      when 'restaurant' then 'restaurante'
      when 'gym'        then 'gimnasio'
      when 'parking'    then 'parqueadero'
      when 'transport'  then 'transporte'
      when 'services'   then 'servicios'
      else 'retail'
    end
  ) as vertical,
  s.vertical is not null as es_explicito
from public.ai_settings s
join public.organizations o on o.id = s.organization_id
left join public.organization_types ot on ot.id = o.type_id;

alter view public.ai_vertical_efectivo set (security_invoker = true);
revoke all on public.ai_vertical_efectivo from anon;
grant select on public.ai_vertical_efectivo to authenticated, service_role;
