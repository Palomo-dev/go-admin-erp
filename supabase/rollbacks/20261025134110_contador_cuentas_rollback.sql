-- Rollback de 20261025134110. Revertir ANTES 134120 y 134115.
-- Borra las cuentas que creó 134110 (bitácora 'cuenta_nueva'). Las que tienen líneas contabilizadas ya revertidas
-- (saldo 0) quedan en el plan con aviso; con saldo o borradores aborta.
do $$
declare r record;
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for r in select * from public.p1_puc_bitacora where migracion = '134110' and objeto = 'cuenta_nueva'
            order by length(clave) desc, id desc loop
    if exists (select 1 from public.journal_lines l where l.organization_id = r.organization_id and l.account_code = r.clave)
       or exists (select 1 from public.chart_of_accounts h where h.organization_id = r.organization_id and h.parent_code = r.clave) then
      -- Las líneas contabilizadas son inmutables: tras revertir los asientos (contraasiento) la cuenta queda con
      -- saldo 0 y NO se puede borrar. Se deja en el plan (con aviso); si tuviera saldo o borradores, se aborta.
      if coalesce((select sum(l.debit - l.credit) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                    where l.organization_id = r.organization_id and l.account_code = r.clave and e.posted is true), 0) <> 0
         or exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                     where l.organization_id = r.organization_id and l.account_code = r.clave and e.posted is not true) then
        raise exception 'rollback %: org % cuenta % tiene saldo o borradores; revertir antes las migraciones posteriores', '134110', r.organization_id, r.clave;
      end if;
      raise notice 'rollback %: org % cuenta % queda en el plan (movimientos revertidos, saldo 0)', '134110', r.organization_id, r.clave;
      continue;
    end if;
    delete from public.chart_of_accounts where organization_id = r.organization_id and account_code = r.clave;
  end loop;
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  delete from public.p1_puc_bitacora where migracion = '134110';
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;

drop function if exists public.fn_restaurantes_asegurar_cuentas(integer, text);

-- fn_hoteles_asegurar_cuentas_ingreso vuelve a la versión de 134070 (sin 41409502).
create or replace function public.fn_hoteles_asegurar_cuentas_ingreso(p_org integer, p_migracion text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select * from (values
      ('414005',   '4140',   'Hotelería',                                    false,  1),
      ('41400501', '414005', 'Ingresos por alojamiento',                     true,   2),
      ('414015',   '4140',   'Restaurantes',                                 false,  3),
      ('41401501', '414015', 'Ingresos por alimentos',                       true,   4),
      ('414020',   '4140',   'Bares y cantinas',                             false,  5),
      ('41402001', '414020', 'Ingresos por bebidas y bar',                   true,   6),
      ('414095',   '4140',   'Otros',                                        false,  7),
      ('41409501', '414095', 'Ingresos por otros servicios hoteleros',       true,   8),
      ('417501',   '4175',   'Devoluciones, rebajas y descuentos en ventas', false,  9),
      ('41750101', '417501', 'Devoluciones en ventas',                       true,  10),
      ('41750102', '417501', 'Rebajas y descuentos en ventas',               true,  11)
    ) as t(codigo, padre, nombre, mov, orden)
    order by orden   -- todo padre antes que sus hijos
  loop
    continue when exists (select 1 from public.chart_of_accounts
                           where organization_id = p_org and account_code = r.codigo);
    continue when not exists (select 1 from public.chart_of_accounts
                               where organization_id = p_org and account_code = r.padre);
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, r.codigo, r.nombre, p.type, r.padre, true,
           p.naturaleza, r.mov, coalesce(p.requiere_tercero, false), p.requiere_centro_costo,
           p.centro_costo_modo, p.presentacion_niif, now(), now()
      from public.chart_of_accounts p
     where p.organization_id = p_org and p.account_code = r.padre
    on conflict (organization_id, account_code) do nothing;
    if found then
      v_n := v_n + 1;
      if p_migracion is not null then
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
        values (p_migracion, p_org, 'cuenta', r.codigo, r.nombre);
      end if;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function public.fn_hoteles_asegurar_cuentas_ingreso(integer, text) from public, anon, authenticated;
