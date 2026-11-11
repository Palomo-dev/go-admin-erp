-- Organizaciones EXISTENTES: grupos de contrapartida de cuentas de orden corridos, corregidos al Decreto 2650
-- SOLO donde no tienen ningún movimiento (respuesta del Contador, 2026-11-10).
--
-- ESTADO: ESCRITA, NO APLICADA — espera el OK del dueño.
-- Reversión: supabase/rollbacks/20261111100200_cuentas_orden_corridas_sin_movimiento_rollback.sql.
-- Fecha: 2026-11-10. Va después de 20261111100000 (plantilla de organizaciones nuevas ya alineada).
--
-- El problema. Los planes sembrados antes de 20261111100000 traen la contrapartida de orden corrida:
--   86 «Deudoras fiscales por contra (cr)» / 8605   → en el Decreto es la 85
--   88 «Deudoras de control por contra (cr)» / 8805 → en el Decreto es la 86 (la 88 no existe)
--   96 «Acreedoras fiscales por contra (db)» / 9605 → en el Decreto es la 95
--   98 «Acreedoras de control por contra (db)» / 9805 → en el Decreto es la 96 (la 98 no existe)
-- 84/8405 y 94/9405 están en su sitio y no se tocan (incluida la consignación recibida 911520 contra 9405).
--
-- Criterio del Contador. Sin movimientos: se corrige código y nombre. Con movimientos: no se tocan asientos; se
-- crearía el grupo correcto, se bloquearía la cuenta vieja y se trasladaría el saldo con reclasificación. Eso
-- último NO está autorizado y esta migración no lo hace: una organización con cualquier línea de asiento
-- (publicado o borrador) en el subárbol se salta y queda como está.
--
-- Diagnóstico al 2026-11-10 (por id, sin nombres):
--   · 38 organizaciones tienen 86 (fiscales), 8605, 88, 8805, 96 (fiscales), 9605, 98 y 9805, las 38 con los
--     nombres de la plantilla vieja. Ninguna tiene cuentas hijas debajo de esas ocho.
--   · Líneas de asiento en 84xx, 86xx, 88xx, 94xx, 96xx o 98xx (account_code o cuenta_original, publicadas o
--     borrador): 0 en todas. Reglas, configuración contable y demás tablas que guardan códigos: 0 referencias.
--   · 1598 y 539595/53959501: 0 líneas en las 38. redondeo_en_contra = 53959501 en las 38 (código sin cambio).
--
-- Qué hace, por organización y en este orden (cada paso solo si el anterior dejó libre el destino):
--   paso 1: subárbol 86 (si el 86 es «Deudoras fiscales por contra…») → 85
--   paso 2: subárbol 88 → 86
--   paso 3: subárbol 96 (si el 96 es «Acreedoras fiscales por contra…») → 95
--   paso 4: subárbol 98 → 96
-- Un paso se salta si el destino ya existe, si alguna cuenta del subárbol tiene líneas de asiento, o si algún
-- código del subárbol aparece en una tabla que guarda códigos sin FK que se actualice sola (cuentas bancarias,
-- categorías de tesorería, presupuesto, sucursales, plantillas de asiento, metadatos de reportes, mapeo de
-- impuestos, categorías y productos, consolidación, sucesoras, movimientos de caja y banco, ítems de factura,
-- anticipos, sesiones de caja, activos fijos, fallos de asiento, revisión de IVA).
-- El cambio de un subárbol es UN update (código y parent_code a la vez), así el FK de padre se comprueba al final
-- de la sentencia con todo el subárbol ya movido. El grupo toma el nombre del Decreto (puc_catalogo); las cuentas
-- de 4 o más dígitos conservan el suyo. configuracion_contable sigue sola (FK ON UPDATE CASCADE); accounting_rules
-- se actualiza aquí. Todo lo cambiado queda en public.cuentas_orden_corridas_respaldo para la reversión exacta.
--
-- Prueba en seco (2026-11-10, una transacción revertida con raise exception):
--   antes:   orgs con 88=38, con 98=38, con 86 fiscales=38, con 96 fiscales=38, con 85=0, con 95=0
--   después: orgs con 88=0, con 98=0, con 86 fiscales=0, con 96 fiscales=0, con 85=38, con 95=38,
--            con 86 control=38, con 96 control=38; respaldo 304 filas de plan (38 orgs × 8), 0 reglas;
--            0 configuraciones sin cuenta; subárboles saltados: 0.
--   reversión: plan (clases 8 y 9), accounting_rules y configuracion_contable idénticos al estado inicial (hash).
-- No corrige los nombres de 84 y 94 («(cr)»/«(db)» en minúscula) ni los demás nombres de la plantilla vieja: el
-- Contador solo autorizó, para existentes, el código y nombre de las cuentas corridas.

create table if not exists public.cuentas_orden_corridas_respaldo (
  id bigserial primary key,
  organization_id integer not null,
  paso integer not null,
  tabla text not null check (tabla in ('chart_of_accounts', 'accounting_rules')),
  fila_id uuid,
  columna text not null,
  valor_anterior text,
  valor_nuevo text,
  parent_anterior text,
  nombre_anterior text,
  updated_at_anterior timestamptz,
  creado_en timestamptz not null default now()
);

comment on table public.cuentas_orden_corridas_respaldo is
  'Respaldo de 20261111100200: códigos de contrapartida de orden corridos (86→85, 88→86, 96→95, 98→96) corregidos en organizaciones sin movimientos. Lo usa la reversión; se borra con ella.';

alter table public.cuentas_orden_corridas_respaldo enable row level security;
revoke all on public.cuentas_orden_corridas_respaldo from public, anon, authenticated;
revoke all on sequence public.cuentas_orden_corridas_respaldo_id_seq from public, anon, authenticated;

do $$
declare
  v_paso record;
  v_org integer;
  v_nombre_grupo text;
  v_col text;
  v_movidas integer := 0;
  v_saltadas integer := 0;
begin
  for v_paso in
    select * from (values
      (1, '86', '85', '^deudoras fiscales por contra'),
      (2, '88', '86', null),
      (3, '96', '95', '^acreedoras fiscales por contra'),
      (4, '98', '96', null)
    ) as t(paso, origen, destino, nombre_origen)
    order by 1
  loop
    select k.nombre into strict v_nombre_grupo from public.puc_catalogo k where k.codigo = v_paso.destino;

    for v_org in
      select c.organization_id
        from public.chart_of_accounts c
       where c.account_code = v_paso.origen
         and (v_paso.nombre_origen is null or c.name ~* v_paso.nombre_origen)
       order by 1
    loop
      -- Destino ocupado (p. ej. el paso anterior se saltó): no se mueve.
      if exists (
        select 1 from public.chart_of_accounts c
         where c.organization_id = v_org and left(c.account_code, 2) = v_paso.destino
      ) then
        v_saltadas := v_saltadas + 1;
        raise notice 'org % paso %: % ocupado, % se queda', v_org, v_paso.paso, v_paso.destino, v_paso.origen;
        continue;
      end if;

      -- Cualquier línea de asiento, publicada o borrador.
      if exists (
        select 1 from public.journal_lines jl
         where jl.organization_id = v_org
           and (left(jl.account_code, 2) = v_paso.origen or left(coalesce(jl.cuenta_original, ''), 2) = v_paso.origen)
      ) then
        v_saltadas := v_saltadas + 1;
        raise notice 'org % paso %: % tiene movimientos, no se toca', v_org, v_paso.paso, v_paso.origen;
        continue;
      end if;

      -- Códigos guardados en tablas sin FK que los siga.
      if exists (select 1 from public.bank_accounts t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.categorias_tesoreria t where t.organization_id = v_org and left(t.cuenta_sugerida, 2) = v_paso.origen)
         or exists (select 1 from public.budget_lines t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.branch_account_mappings t where t.organization_id = v_org
                      and (left(t.base_account_code, 2) = v_paso.origen or left(t.sub_account_code, 2) = v_paso.origen))
         or exists (select 1 from public.plantillas_asiento_lineas t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.financial_report_account_metadata t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.tax_account_mapping t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.categories t where t.organization_id = v_org
                      and v_paso.origen in (left(t.cuenta_costo, 2), left(t.cuenta_ingreso, 2), left(t.cuenta_inventario, 2), left(t.cuenta_devolucion, 2)))
         or exists (select 1 from public.products t where t.organization_id = v_org
                      and v_paso.origen in (left(t.cuenta_costo, 2), left(t.cuenta_ingreso, 2), left(t.cuenta_inventario, 2), left(t.cuenta_devolucion, 2)))
         or exists (select 1 from public.puc_consolidacion_cuentas t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.plan_cuentas_sucesoras t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.cash_movements t where t.organization_id = v_org and left(t.cuenta_contable, 2) = v_paso.origen)
         or exists (select 1 from public.bank_transactions t where t.organization_id = v_org and left(t.cuenta_contable, 2) = v_paso.origen)
         or exists (select 1 from public.invoice_items t where left(t.cuenta_contable, 2) = v_paso.origen)
         or exists (select 1 from public.supplier_advances t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.cash_sessions t where t.organization_id = v_org and left(t.account_code, 2) = v_paso.origen)
         or exists (select 1 from public.fixed_assets t where t.organization_id = v_org
                      and v_paso.origen in (left(t.account_asset_code, 2), left(t.account_depreciation_code, 2), left(t.account_expense_code, 2)))
         or exists (select 1 from public.journal_entry_failures t where t.organization_id = v_org
                      and v_paso.origen in (left(t.debit_account, 2), left(t.credit_account, 2)))
         or exists (select 1 from public.contabilidad_revision_iva t where t.organization_id = v_org
                      and v_paso.origen in (left(t.cuenta_asignada, 2), left(t.cuenta_titulo, 2)))
      then
        v_saltadas := v_saltadas + 1;
        raise notice 'org % paso %: % está referenciada fuera del plan, no se toca', v_org, v_paso.paso, v_paso.origen;
        continue;
      end if;

      -- Respaldo del subárbol.
      insert into public.cuentas_orden_corridas_respaldo
        (organization_id, paso, tabla, columna, valor_anterior, valor_nuevo, parent_anterior, nombre_anterior, updated_at_anterior)
      select c.organization_id, v_paso.paso, 'chart_of_accounts', 'account_code',
             c.account_code, v_paso.destino || substr(c.account_code, 3), c.parent_code, c.name, c.updated_at
        from public.chart_of_accounts c
       where c.organization_id = v_org and left(c.account_code, 2) = v_paso.origen;

      -- Subárbol en una sola sentencia: código, padre y, en el grupo, nombre del Decreto.
      update public.chart_of_accounts c
         set account_code = v_paso.destino || substr(c.account_code, 3),
             parent_code = case
               when length(c.account_code) = 2 then c.parent_code
               else v_paso.destino || substr(c.parent_code, 3)
             end,
             name = case when length(c.account_code) = 2 then v_nombre_grupo else c.name end,
             updated_at = now()
       where c.organization_id = v_org and left(c.account_code, 2) = v_paso.origen;

      -- Reglas contables que apunten al subárbol.
      foreach v_col in array array['debit_account_code', 'credit_account_code', 'tax_account_code', 'discount_account_code']
      loop
        execute format(
          'insert into public.cuentas_orden_corridas_respaldo
             (organization_id, paso, tabla, fila_id, columna, valor_anterior, valor_nuevo)
           select r.organization_id, $1, ''accounting_rules'', r.id, %1$L, r.%1$I, $2 || substr(r.%1$I, 3)
             from public.accounting_rules r
            where r.organization_id = $3 and left(r.%1$I, 2) = $4', v_col)
        using v_paso.paso, v_paso.destino, v_org, v_paso.origen;
        execute format(
          'update public.accounting_rules r
              set %1$I = $1 || substr(r.%1$I, 3)
            where r.organization_id = $2 and left(r.%1$I, 2) = $3', v_col)
        using v_paso.destino, v_org, v_paso.origen;
      end loop;

      v_movidas := v_movidas + 1;
    end loop;
  end loop;

  raise notice 'cuentas de orden corridas: % subárboles corregidos, % saltados', v_movidas, v_saltadas;
end $$;
