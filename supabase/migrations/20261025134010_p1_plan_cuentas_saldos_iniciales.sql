-- P1 (25-oct-2026): plan de cuentas del contador — crea los auxiliares/subcuentas que faltan en las
-- 116 orgs con regla inventory/opening. NO aplicada. Idempotente (solo inserta donde NO existe).
-- Paso 1 de 3: SOLO crea cuentas. Las cuentas padre (3705, 6135, 4295, 240805, 240810, 530515) SIGUEN
-- de movimiento aquí: trg_puc_validar_cuenta se desactiva durante los INSERT para que no las pase a
-- título solo. El paso a título va en 134060, después de reclasificar saldos (regla del contador) y
-- después de que 134020 cambie reglas/configuración (nunca una regla apuntando a una cuenta de título).
-- Conteo esperado al 25-oct (solo lectura): 1.846 cuentas nuevas
--   370505:116  37050501:116  37050502:0 (3705 sin movimientos en ninguna org)
--   613505:108  61350501:109  61350502:116
--   429595:116  42959501:116  42959502:6 (orgs con líneas 4295 que no son de sobrantes: 132,142,144,199,204,328)
--   429581:116  42958101:116 (Ajuste al peso a favor)   539595:116  53959501:116 (Ajuste al peso en contra)
--   240805:1 (org 149)  24080501/24080502:116 c/u  24081001/24081002:115 c/u (no en 149: 240810 tiene
--   movimientos y el contador la deja de movimiento)
--   530515:0 (ya existe)  53051501:116
--   140505/14050501 (insumos de cocina) y 614005/61400501/61400502: solo orgs de sector restaurante/hotel (type_id 1/2) con 6140 (regla del contador).
-- Validado por el contador (25-oct): IVA con auxiliares en todas las orgs; el saldo/borradores se
-- reclasifican en 134060. Única excepción: 240810 de la org 149.
-- Bitácora: public.p1_puc_bitacora (la usan 134020/134060 y sus rollbacks).
-- Rollback: supabase/rollbacks/20261025134010_p1_plan_cuentas_saldos_iniciales_rollback.sql

create table if not exists public.p1_puc_bitacora (
  id bigserial primary key,
  migracion text not null,
  organization_id integer not null,
  objeto text not null,          -- 'cuenta' | 'titulo' | 'regla' | 'config' | 'linea_borrador' | 'asiento_reclasif'
  clave text not null,           -- código de cuenta / id de regla / id de config / id de línea
  campo text,
  valor_anterior text,
  valor_nuevo text,
  created_at timestamptz not null default now()
);
alter table public.p1_puc_bitacora enable row level security;  -- sin políticas: solo service_role

do $$
declare
  r record;
  v_org integer;
  v_creadas integer := 0;
  -- (código, padre, nombre, es_movimiento, condición)
  --   condición: 'siempre' | 'saldo_3705' | 'otros_4295' | 'iva_810' | 'sector_hr'
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;

  for v_org in
    select distinct ar.organization_id from public.accounting_rules ar
     where ar.source_type = 'inventory' and ar.event_type = 'opening'
     order by 1
  loop
    for r in
      select * from (values
        ('370505',   '3705',   'Saldos iniciales',                         false, 'siempre',   1),
        ('37050501', '370505', 'Inventario inicial',                       true,  'siempre',   2),
        ('37050502', '370505', 'Utilidades acumuladas',                    true,  'saldo_3705',3),
        ('613505',   '6135',   'Costo de mercancías vendidas',             false, 'siempre',   4),
        ('61350501', '613505', 'Costo de ventas de mercancías',            true,  'siempre',   5),
        ('61350502', '613505', 'Mermas y faltantes de inventario',         true,  'siempre',   6),
        ('429595',   '4295',   'Otros ingresos diversos',                  false, 'siempre',   7),
        ('42959501', '429595', 'Sobrantes de inventario',                  true,  'siempre',   8),
        ('42959502', '429595', 'Otros ingresos diversos',                  true,  'otros_4295',9),
        ('429581',   '4295',   'Ajuste al peso',                           false, 'siempre',  10),
        ('42958101', '429581', 'Ajuste al peso a favor',                   true,  'siempre',  11),
        ('539595',   '5395',   'Ajuste al peso',                           false, 'siempre',  12),
        ('53959501', '539595', 'Ajuste al peso en contra',                 true,  'siempre',  13),
        ('240805',   '2408',   'IVA generado',                             true,  'siempre',  14),
        ('24080501', '240805', 'IVA generado 19%',                         true,  'siempre',  15),
        ('24080502', '240805', 'IVA generado 5%',                          true,  'siempre',  16),
        ('24081001', '240810', 'IVA descontable 19%',                      true,  'iva_810',  17),
        ('24081002', '240810', 'IVA descontable 5%',                       true,  'iva_810',  18),
        ('530515',   '5305',   'Comisiones',                               false, 'siempre',  19),
        ('53051501', '530515', 'Comisiones bancarias y financieras',       true,  'siempre',  20),
        ('140505',   '1405',   'Insumos de cocina',                        false, 'sector_hr', 21),
        ('14050501', '140505', 'Insumos de cocina',                        true,  'sector_hr', 21),
        ('614005',   '6140',   'Restaurantes',                             false, 'sector_hr', 21),
        ('61400501', '614005', 'Costo de alimentos y bebidas',             true,  'sector_hr', 22),
        ('61400502', '614005', 'Mermas de cocina',                         true,  'sector_hr', 23)
      ) as t(codigo, padre, nombre, mov, cond, orden)
      order by orden
    loop
      continue when exists (select 1 from public.chart_of_accounts
                             where organization_id = v_org and account_code = r.codigo);
      continue when not exists (select 1 from public.chart_of_accounts
                                 where organization_id = v_org and account_code = r.padre);
      -- 37050502 solo si 3705 tiene saldo publicado distinto de 0 (al 25-oct: ninguna org).
      continue when r.cond = 'saldo_3705' and coalesce((
        select sum(l.debit - l.credit) from public.journal_lines l
          join public.journal_entries e on e.id = l.journal_entry_id and e.posted
         where l.organization_id = v_org and l.account_code = '3705'), 0) = 0;
      -- 42959502 solo donde 4295 tiene líneas que no salen de ajustes/movimientos de inventario.
      continue when r.cond = 'otros_4295' and not exists (
        select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
         where l.organization_id = v_org and l.account_code = '4295'
           and coalesce(e.source, '') not in ('inventory_adjustment', 'inventory_adjustments', 'stock_movements'));
      -- Hoteles y restaurantes (organizations.type_id 1/2, regla del contador): costo A&B 61400501 y
      -- mermas de cocina 61400502 bajo 614005 «Restaurantes». No se crea en otros sectores.
      continue when r.cond = 'sector_hr' and not exists (
        select 1 from public.organizations o where o.id = v_org and o.type_id in (1, 2));
      -- IVA descontable: excepción del contador para la org 149 (240810 con movimientos queda de movimiento).
      continue when r.cond = 'iva_810' and v_org = 149 and exists (
        select 1 from public.journal_lines l where l.organization_id = 149 and l.account_code = '240810');

      insert into public.chart_of_accounts (
        organization_id, account_code, name, type, parent_code, is_active, activa,
        naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
        presentacion_niif, created_at, updated_at)
      select v_org, r.codigo, r.nombre, p.type, r.padre, true, true,
             p.naturaleza, r.mov, coalesce(p.requiere_tercero, false), p.requiere_centro_costo,
             p.centro_costo_modo, p.presentacion_niif, now(), now()
        from public.chart_of_accounts p
       where p.organization_id = v_org and p.account_code = r.padre
      on conflict (organization_id, account_code) do nothing;

      if found then
        v_creadas := v_creadas + 1;
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
        values ('134010', v_org, 'cuenta', r.codigo, r.nombre);
      end if;
    end loop;
  end loop;

  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise notice '134010: % cuentas creadas (esperado 1846 al 25-oct)', v_creadas;
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;
