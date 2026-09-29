-- Acceso v3 · fase 8 (docs/design/AUTH-ACCESO-V2.md §13.3): país normalizado en sucursales y organizaciones.
--
-- Conteo del 2026-09-29 antes de aplicar:
--   · 70 de 94 sucursales sin country_code: 67 con country = 'Colombia', 2 con 'México', 1 sin país.
--   · 12 de 89 organizaciones sin country_code, todas con country = 'Colombia'.
-- Regla:
--   · sucursal con nombre de país reconocido en countries → su código (Colombia → COL, México → MEX);
--   · sucursal sin país → el de su organización (country y country_code);
--   · organización sin código con nombre reconocido → su código.
-- Dos sucursales de la org 2 dicen «México» aunque la organización está en Colombia: se respeta lo que
-- dice cada sucursal (MEX).
--
-- CUIDADO: el disparador after_organization_update_country llama a setup_organization_defaults cuando
-- cambia organizations.country_code, y esa función BORRA y rehace organization_taxes y
-- organization_payment_methods. Para no tocar la configuración de 12 organizaciones en operación, se
-- desactiva ese disparador SOLO durante la actualización de esta migración y se vuelve a activar.

do $$
declare
  v_suc_antes integer;
  v_org_antes integer;
  v_suc_despues integer;
  v_org_despues integer;
begin
  select count(*) into v_suc_antes from public.branches where country_code is null;
  select count(*) into v_org_antes from public.organizations where country_code is null;

  -- 1 · Sucursales con nombre de país reconocido
  update public.branches b
     set country_code = c.code
    from public.countries c
   where b.country_code is null
     and b.country is not null
     and c.name = b.country;

  -- 2 · Sucursales sin país: el de su organización (por código o por nombre)
  update public.branches b
     set country_code = coalesce(o.country_code, c.code),
         country = coalesce(b.country, o.country)
    from public.organizations o
    left join public.countries c on c.name = o.country
   where b.organization_id = o.id
     and b.country_code is null
     and b.country is null
     and coalesce(o.country_code, c.code) is not null;

  -- 3 · Organizaciones: sin disparar setup_organization_defaults
  alter table public.organizations disable trigger after_organization_update_country;

  update public.organizations o
     set country_code = c.code
    from public.countries c
   where o.country_code is null
     and o.country is not null
     and c.name = o.country;

  alter table public.organizations enable trigger after_organization_update_country;

  select count(*) into v_suc_despues from public.branches where country_code is null;
  select count(*) into v_org_despues from public.organizations where country_code is null;
  raise notice 'país normalizado: sucursales sin código % → %, organizaciones sin código % → %',
    v_suc_antes, v_suc_despues, v_org_antes, v_org_despues;
end;
$$;
