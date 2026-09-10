-- Sinonimos de catalogo.
--
-- Problema medido: "zapatillas" no encuentra nada en la Tienda de Tenis porque
-- su catalogo esta en ingles ("On Running Men's"). De 15 palabras genericas en
-- espanol, esa tienda reconoce 1, Onix Perfums 1 y NEG infashion 0.
--
-- Salvaguarda de diseno: un sinonimo SOLO se activa si `apunta_a` existe de
-- verdad en el vocabulario de esa organizacion. Asi una base generica en espanol
-- nunca puede hacer que el bot afirme tener algo que no tiene.

create table if not exists public.sinonimos_base (
  termino   text not null,
  apunta_a  text not null,
  nota      text,
  primary key (termino, apunta_a)
);

comment on table public.sinonimos_base is
  'Equivalencias genericas del espanol comercial. Solo surten efecto en una organizacion si `apunta_a` esta en su catalogo.';

insert into public.sinonimos_base (termino, apunta_a, nota) values
  ('zapatillas','calzado','calzado deportivo'),
  ('zapatos','calzado',null),
  ('tenis','calzado',null),
  ('deportivas','calzado',null),
  ('guayos','calzado',null),
  ('sandalias','calzado',null),
  ('ropa','vestuario',null),
  ('camiseta','camisa',null),
  ('playera','camisa',null),
  ('pantalones','pantalon',null),
  ('bluyin','jeans',null),
  ('blue','jeans',null),
  ('perfumes','perfume',null),
  ('locion','perfume',null),
  ('lociones','perfume',null),
  ('fragancia','perfume',null),
  ('fragancias','perfume',null),
  ('medicamento','medicamentos',null),
  ('remedio','medicamentos',null),
  ('pastilla','pastillas',null),
  ('drogas','medicamentos',null),
  ('trago','licor',null),
  ('tragos','licor',null),
  ('aguardiente','licor',null),
  ('cervezas','cerveza',null),
  ('nevera','refrigerador',null),
  ('heladera','refrigerador',null),
  ('estufa','cocina',null),
  ('licuadora','licuadoras',null),
  ('vasos','vaso',null),
  ('platos','plato',null),
  ('ollas','olla',null),
  ('sartenes','sarten',null),
  ('muebles','mueble',null),
  ('comida','alimentos',null),
  ('bebidas','bebida',null)
on conflict do nothing;

-- Sinonimos propios de cada organizacion, editables por el inquilino.
create table if not exists public.org_sinonimos (
  organization_id integer     not null references public.organizations(id) on delete cascade,
  termino         text        not null,
  apunta_a        text        not null,
  origen          text        not null default 'manual',
  created_at      timestamptz not null default now(),
  primary key (organization_id, termino),
  constraint org_sinonimos_origen_ck check (origen in ('manual','base','sugerido'))
);

comment on table public.org_sinonimos is
  'Sinonimos propios de la organizacion. `origen`: manual (lo escribio el comerciante), base (heredado de sinonimos_base), sugerido (propuesto por lo que preguntaron los clientes).';

alter table public.org_sinonimos enable row level security;

drop policy if exists org_sinonimos_lectura on public.org_sinonimos;
create policy org_sinonimos_lectura on public.org_sinonimos
  for select to authenticated
  using (exists (select 1 from public.organization_members m
                  where m.user_id = auth.uid()
                    and m.organization_id = org_sinonimos.organization_id
                    and m.is_active));

drop policy if exists org_sinonimos_escritura on public.org_sinonimos;
create policy org_sinonimos_escritura on public.org_sinonimos
  for all to authenticated
  using (exists (select 1 from public.organization_members m
                  where m.user_id = auth.uid()
                    and m.organization_id = org_sinonimos.organization_id
                    and m.is_active))
  with check (exists (select 1 from public.organization_members m
                       where m.user_id = auth.uid()
                         and m.organization_id = org_sinonimos.organization_id
                         and m.is_active));

revoke all on public.org_sinonimos from anon;
revoke all on public.sinonimos_base from anon;
grant select, insert, update, delete on public.org_sinonimos to authenticated, service_role;
grant select on public.sinonimos_base to authenticated, service_role;
