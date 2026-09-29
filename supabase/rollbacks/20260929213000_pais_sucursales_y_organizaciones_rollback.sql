-- Reversión de 20260929213000_pais_sucursales_y_organizaciones.
-- Devuelve a NULL el country_code que puso la migración, en las filas exactas que tenía NULL
-- el 2026-09-29 (listas tomadas justo antes de aplicarla). La sucursal 129 recupera también
-- country = NULL. Si alguna de estas filas se editó a mano después, esta reversión pisa ese cambio:
-- revisar antes de aplicarla.
-- Igual que la migración, desactiva el disparador que rehace impuestos y métodos de pago.

update public.branches
   set country_code = null
 where id in (2,3,16,21,26,27,28,29,30,31,33,35,36,37,38,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,
              55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,
              85,87,88,90,92,95,101,120,121);

update public.branches set country_code = null, country = null where id = 129;

alter table public.organizations disable trigger after_organization_update_country;
update public.organizations
   set country_code = null
 where id in (1,4,5,6,7,16,57,58,59,60,61,62);
alter table public.organizations enable trigger after_organization_update_country;
