-- Productos por peso, fase 1 (docs/design/PRODUCTOS-POR-PESO-BASCULA.md, M1).
--
-- Hoy toda línea de factura sale como «94 Unidad»: invoice_items.unit_measure_id
-- vale 70 por defecto y nadie lo llena (6.944 filas, todas 70). Con esto:
--   - La libra (LB) existe como unidad global de peso, con sus conversiones.
--   - units.dian_unit_measure_id dice qué unidad DIAN corresponde a cada unidad
--     de producto (UN 94, KG KGM, LB LBR, LT LTR, MT MTR). Es el ÚNICO mapa:
--     el envío a Factus lee dian_unit_measures.code (unidadFactus en
--     src/lib/services/einvoicing/payloadsFactus.ts). Las demás unidades (GR,
--     ML, CM, CAJ, PAQ, PR…) quedan sin mapa y salen como Unidad, igual que hoy.
--   - Un trigger BEFORE INSERT llena invoice_items.unit_measure_id desde la
--     unidad del producto cuando la línea llega con el valor por defecto (70):
--     cubre pos_checkout_v1, mesas, pedidos web y notas crédito sin tocar esas
--     funciones (que otras sesiones modifican a la vez).
-- VERIFICACIÓN PENDIENTE con Factus (pregunta 7 del dueño): que la API v2
-- acepte KGM y LBR en unit_measure_code. Si no, se corrige solo la columna
-- code de dian_unit_measures (sin tocar código).
-- Datos: solo cambian las facturas NUEVAS de productos en KG, LB, LT o MT
-- (hoy 0 en KG, 3 productos en LT); las líneas existentes no se tocan.

insert into public.units (code, name, conversion_factor, unit_type)
values ('LB', 'Libra', 1, 'weight')
on conflict (code) do nothing;

insert into public.unit_conversions (from_unit_code, to_unit_code, factor, organization_id)
select v.de, v.a, v.f, null
  from (values ('LB', 'KG', 0.45359237::numeric), ('KG', 'LB', 2.2046226218::numeric),
               ('LB', 'GR', 453.59237::numeric),  ('GR', 'LB', 0.0022046226::numeric)) v(de, a, f)
 where not exists (select 1 from public.unit_conversions uc
                    where uc.organization_id is null
                      and btrim(uc.from_unit_code) = v.de and btrim(uc.to_unit_code) = v.a);

insert into public.dian_unit_measures (id, code, name)
values (80, 'LBR', 'Libra')
on conflict (id) do nothing;

alter table public.units add column if not exists dian_unit_measure_id integer
  references public.dian_unit_measures(id);

comment on column public.units.dian_unit_measure_id is
  'Unidad DIAN (dian_unit_measures) con la que se factura una línea de un producto en esta unidad. Sin valor: 70 (Unidad).';

update public.units set dian_unit_measure_id = case btrim(code)
  when 'UN' then 70 when 'KG' then 71 when 'LT' then 72 when 'MT' then 73 when 'LB' then 80 end
 where btrim(code) in ('UN', 'KG', 'LT', 'MT', 'LB')
   and dian_unit_measure_id is null;

create or replace function public.fn_invoice_items_unidad_dian()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidad integer;
begin
  if NEW.product_id is null or coalesce(NEW.unit_measure_id, 70) <> 70 then
    return NEW;
  end if;
  select u.dian_unit_measure_id into v_unidad
    from public.products p
    join public.units u on u.code = p.unit_code
   where p.id = NEW.product_id;
  if v_unidad is not null then
    NEW.unit_measure_id := v_unidad;
  end if;
  return NEW;
end;
$$;

comment on function public.fn_invoice_items_unidad_dian() is
  'Trigger: la línea de factura toma la unidad DIAN de la unidad del producto (units.dian_unit_measure_id) cuando llega con el valor por defecto 70.';

revoke all on function public.fn_invoice_items_unidad_dian() from public, anon, authenticated;

drop trigger if exists trg_invoice_items_unidad_dian on public.invoice_items;
create trigger trg_invoice_items_unidad_dian
  before insert on public.invoice_items
  for each row execute function public.fn_invoice_items_unidad_dian();
