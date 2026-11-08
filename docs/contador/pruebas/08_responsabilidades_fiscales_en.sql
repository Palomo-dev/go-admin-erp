-- Pruebas · H2: responsabilidades del RUT vigentes en una fecha (fn_responsabilidades_fiscales_en)
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
-- Requiere la migración supabase/migrations/20261108140500_responsabilidades_fiscales_en.sql; mientras no esté
-- aplicada, se pega su cuerpo donde dice «MIGRACIÓN» (así se obtuvo el .resultado.txt).
-- La org 374 no tiene perfil tributario ni responsabilidades en la ficha: ambos se crean DENTRO de la transacción.

begin;
create temp table r (n serial primary key, verificacion text, esperado text, obtenido text, ok boolean);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;

-- ═══ MIGRACIÓN (solo en la prueba en seco, mientras no esté aplicada) ═══

update public.organizations set fiscal_responsibilities = array['O-13'] where id = 374;
insert into r (verificacion, esperado, obtenido, ok)
select 'Sin perfil: hoy y 2027-01-01', '{O-13} (organizations.fiscal_responsibilities)',
       public.fn_responsabilidades_fiscales_en(374)::text || ' · ' || public.fn_responsabilidades_fiscales_en(374, '2027-01-01')::text,
       public.fn_responsabilidades_fiscales_en(374) = array['O-13'] and public.fn_responsabilidades_fiscales_en(374, '2027-01-01') = array['O-13'];

insert into public.organization_tax_profiles (organization_id, vigente_desde, vigente_hasta, regimen, responsabilidades, periodicidad_iva)
values (374, '2026-01-01', '2026-12-31', 'ordinario', array['O-48','O-23'], 'bimestral'),
       (374, '2027-01-01', null, 'simple', array['O-47'], 'anual');

insert into r (verificacion, esperado, obtenido, ok)
select format('Con perfil, fecha %s', x.d), x.e, coalesce(public.fn_responsabilidades_fiscales_en(374, x.d::date)::text, 'NULL'),
       coalesce(public.fn_responsabilidades_fiscales_en(374, x.d::date)::text, 'NULL') = x.e
  from (values ('2025-12-31', '{O-13}'), ('2026-01-01', '{O-48,O-23}'), ('2026-11-07', '{O-48,O-23}'),
               ('2026-12-31', '{O-48,O-23}'), ('2027-01-01', '{O-47}'), ('2027-06-30', '{O-47}')) x(d, e);
insert into r (verificacion, esperado, obtenido, ok)
select 'Fecha NULL = hoy en la zona de la organización', '{O-48,O-23} (2026)', public.fn_responsabilidades_fiscales_en(374)::text,
       public.fn_responsabilidades_fiscales_en(374) = array['O-48','O-23'];
insert into r (verificacion, esperado, obtenido, ok)
select 'organizations.fiscal_responsibilities no cambia (la función solo lee)', '{O-13}', fiscal_responsibilities::text, fiscal_responsibilities = array['O-13']
  from public.organizations where id = 374;

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
insert into r (verificacion, esperado, obtenido, ok)
select 'Miembro de la org 374 (sesión, RLS): 2027-01-01', '{O-47}', coalesce(public.fn_responsabilidades_fiscales_en(374, '2027-01-01')::text, 'NULL'),
       public.fn_responsabilidades_fiscales_en(374, '2027-01-01') = array['O-47'];
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into r (verificacion, esperado, obtenido, ok)
select 'Usuario que no es miembro (RLS)', 'NULL (no ve nada)', coalesce(public.fn_responsabilidades_fiscales_en(374, '2027-01-01')::text, 'NULL'),
       public.fn_responsabilidades_fiscales_en(374, '2027-01-01') is null;
reset role;
set local role anon;
do $$
declare v_err text;
begin
  begin perform public.fn_responsabilidades_fiscales_en(374, '2027-01-01'); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  insert into r (verificacion, esperado, obtenido, ok) values ('anon (clave pública)', '42501 permission denied', coalesce(v_err, 'NO RECHAZÓ'), v_err like '42501%');
end $$;
reset role;
select n, verificacion, esperado, obtenido, ok from r order by n;
rollback;
