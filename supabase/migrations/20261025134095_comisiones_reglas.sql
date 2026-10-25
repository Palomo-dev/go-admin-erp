-- Comisiones de vendedor, 25-oct-2026. NO aplicada. Paso 2 de 3. Requiere 134090 y (en orden) 134075.
--   1. vendor_commission_rates.vinculo ('empleado' | 'externo', default 'empleado'): configurable por vendedor.
--      commissions.payee_type 'supplier' / 'third_party' también se tratan como externos.
--   2. fn_create_default_accounting_rules (sobre 134075): 4 reglas commission para TODOS los tipos
--      (causada/pago x empleado/externo) y Comision OTA D52950501. fn_sembrar_configuracion_contable: crea
--      las cuentas de 134090 en orgs nuevas.
--   3. fn_auto_journal_commission: elige la regla por vínculo; cuenta = auxiliar si es de movimiento, si no su
--      cuenta de 4 dígitos (25050501 -> 2505, 23359501 -> 2335, 23652001 -> 2365 hasta que el contador cree
--      esos auxiliares); si tampoco, la siguiente regla (las viejas 5235/2370 quedan de respaldo, p. ej. PUC no CO).
--      Externo: retención = tarifa% si monto >= umbral, asiento aparte D pasivo / C retención (source_id
--      ':accrued:retencion'); el pago debita el MISMO pasivo que acreditó la causación, por el neto.
--      NUNCA contabiliza comisiones con source_type 'invoice_purchase' (bug org 113); queda en la cola.
--   4. Backfill idempotente: las 4 reglas en todas las orgs existentes (incluidas las 7 sin regla de comisión).
-- No mueve asientos ni saldos (reversa org 113 y reclasificación de 5235: pendientes de OK de Juan).
-- Rollback: supabase/rollbacks/20261025134095_comisiones_reglas_rollback.sql

alter table public.vendor_commission_rates add column if not exists vinculo text not null default 'empleado';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vendor_commission_rates_vinculo_check') then
    alter table public.vendor_commission_rates add constraint vendor_commission_rates_vinculo_check
      check (vinculo in ('empleado', 'externo'));
  end if;
end $$;

create or replace function public.fn_comision_vinculo(p_org integer, p_payee_type text, p_payee_id uuid)
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case
    when p_payee_type in ('supplier', 'third_party') then 'externo'
    else coalesce((select v.vinculo from public.vendor_commission_rates v
                    where v.organization_id = p_org and v.salesperson_id = p_payee_id
                    order by (current_date between v.valid_from and coalesce(v.valid_to, 'infinity'::date)) desc,
                             v.valid_from desc nulls last
                    limit 1), 'empleado')
  end
$$;

-- Auxiliar si es de movimiento; si no, su cuenta de 4 dígitos si es de movimiento; si no, null.
create or replace function public.fn_comision_cuenta(p_org integer, p_cuenta text)
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select c.account_code from public.chart_of_accounts c
   where c.organization_id = p_org and c.es_movimiento is not false
     and c.account_code in (p_cuenta, left(p_cuenta, 4))
   order by (c.account_code = p_cuenta) desc
   limit 1
$$;
revoke all on function public.fn_comision_vinculo(integer, text, uuid) from public, anon, authenticated;
revoke all on function public.fn_comision_cuenta(integer, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_create_default_accounting_rules(org_id integer, country_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type integer;
  v_inv text;
  v_cmv text;
  v_merma text;
  v_prod text;
  v_serv text;
  v_noshow text;
  v_manifiesto text;
  v_folio_alim text;
  v_folio_serv text;
  v_dev text;
begin
  perform public.fn_assert_acceso_org(org_id);
  if country_code is null then
    null;
  end if;
  if exists (select 1 from public.accounting_rules where organization_id = org_id) then
    return;
  end if;

  select o.type_id into v_type from public.organizations o where o.id = org_id;
  select s.account_code into v_inv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'inventario';
  select s.account_code into v_cmv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'costo_ventas';
  select s.account_code into v_prod
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_productos';
  select s.account_code into v_serv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_servicios';
  -- Siempre auxiliares de movimiento (P1 25-oct-2026): el plan de la org nueva sale de puc_plantilla,
  -- que ya trae 14350101 (vía trg_sede_auxiliar_1435), 61350501/61350502, 37050501, 42959501, IVA 19%/5%.
  v_inv := '14350101';
  -- Costo según sector (regla del contador, decisión de Juan 22-oct): hoteles/restaurantes 61400501,
  -- el resto 61350501. Mermas: 61400502 (cocina) o 61350502.
  v_cmv := case
             when v_type in (1, 2) then '61400501'
             when v_cmv = '6135' or v_cmv is null then '61350501'
             else v_cmv end;
  v_merma := case when v_type in (1, 2) then '61400502' else '61350502' end;
  v_prod := coalesce(v_prod, '4135');
  v_serv := coalesce(v_serv, '4235');
  v_folio_alim := v_prod;
  v_folio_serv := v_serv;
  v_dev := '4175';
  -- Hoteles (type_id 2, contador 25-oct-2026): ingresos y devoluciones en auxiliares de movimiento (134070).
  --   ventas/caja/viaje/no-show 41400501 (alojamiento), folio alimentos 41401501, folio servicios 41409501,
  --   devoluciones/anulación/reembolso 41750101. Nunca 4140/4175 (títulos en hoteles).
  if v_type = 2 then
    v_prod := '41400501';
    v_serv := '41400501';
    v_folio_alim := '41401501';
    v_folio_serv := '41409501';
    v_dev := '41750101';
  end if;
  v_noshow := case when v_type = 2 then v_serv when v_type = 1 then v_prod else '4235' end;
  v_manifiesto := case when v_type = 6 then '2335' else '2205' end;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', v_prod, '24080501', true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', v_prod, '24080501', true, 11, true),
    (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', null, false, 20, true),
    (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', null, false, 21, true),
    (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', v_inv, '2205', '24081001', true, 10, true),
    (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', v_inv, '2205', '24081001', true, 11, true),
    (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2205', '1110', null, false, 20, true),
    (org_id, 'Salida de inventario', 'Salida que no es venta: gasto contra inventario. El costo de ventas solo sale de una venta o factura.', 'inventory', 'adjusted', '519595', v_inv, null, false, 30, true),
    (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', null, false, 10, true),
    (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', null, false, 11, true),
    (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5105', '2370', null, false, 12, true),
    (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', null, false, 13, true),
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', v_dev, '1305', '24080501', true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', v_dev, '1305', '24080501', true, 26, true),
    (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', v_dev, '1110', null, false, 27, true),
    (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '4250', null, false, 28, true),
    (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true),
    (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', v_inv, '42959501', null, false, 30, true),
    (org_id, 'Ajuste Inventario Perdida', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory_adjustment', 'loss', v_merma, v_inv, null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', v_inv, '2205', '24081001', true, 30, true),
    (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', null, false, 30, true),
    (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', null, false, 30, true),
    (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', null, false, 30, true),
    (org_id, 'Prestamo Empleado', 'Desembolso de prestamo a trabajador', 'loan', 'paid', '1365', '1105', null, false, 30, true),
    (org_id, 'Cuota Prestamo', 'Abono de prestamo a trabajador', 'installment', 'paid', '1105', '1365', null, false, 30, true),
    (org_id, 'Manifiesto Despacho', 'Inventario contra proveedores, o contra costos por pagar si la organización es de transporte. La caja solo si es de contado.', 'manifest', 'created', v_inv, v_manifiesto, null, false, 30, true),
    (org_id, 'Envio', 'Costo de envio', 'shipment', 'created', '523550', '1110', null, false, 30, true),
    (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', v_folio_alim, null, false, 30, true),
    (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', v_folio_serv, null, false, 31, true),
    (org_id, 'Pago Folio', 'Pago de folio', 'folio_payment', 'paid', '1105', '1305', null, false, 30, true),
    (org_id, 'Comision OTA', 'Comision del canal: gasto contra cuenta por pagar al canal', 'ota_commission', 'confirmed', '52950501', '2335', null, false, 30, true),
    (org_id, 'Mantenimiento', 'Gasto de mantenimiento', 'maintenance', 'created', '5145', '1110', null, false, 30, true),
    (org_id, 'Reserva Confirmada', 'Reserva confirmada', 'reservation', 'confirmed', '1305', '2805', null, false, 30, true),
    (org_id, 'Reserva no presentada', 'El anticipo pasa al ingreso del sector', 'reservation', 'no_show', '2805', v_noshow, null, false, 32, true),
    (org_id, 'Costo Patronal', 'Provision de seguridad social patronal al aprobar el periodo', 'payroll_period', 'created', '5105', '2370', null, false, 5, true),
    (org_id, 'Pago Costo Patronal', 'Pago de obligaciones patronales al cerrar el periodo', 'payroll_period', 'paid', '2370', '1110', null, false, 5, true),
    (org_id, 'Inventario apertura', 'Apertura de inventario contra saldos iniciales (37050501)', 'inventory', 'opening', v_inv, '37050501', null, false, 40, true),
    (org_id, 'Inventario venta', 'Costo de la venta', 'inventory', 'sale', v_cmv, v_inv, null, false, 41, true),
    (org_id, 'Inventario devolucion', 'Devolucion al inventario', 'inventory', 'return', v_inv, v_cmv, null, false, 42, true),
    (org_id, 'Inventario compra', 'Entrada de compra', 'inventory', 'purchase', v_inv, '2205', null, false, 43, true),
    (org_id, 'Inventario faltante', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory', 'loss', v_merma, v_inv, null, false, 44, true),
    (org_id, 'Inventario sobrante', 'Sobrante de inventario', 'inventory', 'gain', v_inv, '42959501', null, false, 45, true);

  -- Comisiones de vendedor (contador 25-oct-2026), todos los tipos. fn_auto_journal_commission elige por
  -- conditions.vinculo (empleado/externo) y usa el auxiliar si existe; si no, su cuenta de 4 dígitos.
  --   Empleado: causación D52051801 / C25050501; pago D(pasivo de la causación) / C dinero.
  --   Externo:  causación D52950501 / C23359501, retención 23652001 (tarifa/umbral en conditions); pago igual.
  insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
  select org_id, v.n, v.d, 'commission', v.ev, v.deb, v.cre, v.tax, false, v.p, true, v.cond::jsonb
    from (values
      ('Comisión Causada Empleado', 'Comisión de vendedor empleado', 'accrued', '52051801', '25050501', null::text, 1,
       '{"vinculo": "empleado"}'),
      ('Comisión Causada Externo', 'Comisión de vendedor externo, con retención en la fuente sobre el umbral', 'accrued',
       '52950501', '23359501', '23652001', 2, '{"vinculo": "externo", "retencion_tarifa": 10, "retencion_umbral": 0}'),
      ('Pago Comisión Empleado', 'Pago de comisión a vendedor empleado', 'paid', '25050501', '1110', null, 1,
       '{"vinculo": "empleado"}'),
      ('Pago Comisión Externo', 'Pago de comisión a vendedor externo (neto de retención)', 'paid', '23359501', '1110', null, 2,
       '{"vinculo": "externo"}')
    ) v(n, d, ev, deb, cre, tax, p, cond)
   where not exists (select 1 from public.accounting_rules x where x.organization_id = org_id
                       and x.source_type = 'commission' and x.name = v.n);

  -- Hoteles (QA Soporte 25-oct): fn_auto_journal_folio_item elige la regla de folio por PRIORIDAD según el origen
  -- del cargo (10 = room/hospedaje, 11 = pos/food/minibar, 12 = resto). Con 30/31 caía al fallback "cualquier regla".
  -- Hospedaje 41400501 (prioridad 10, regla nueva), alimentos 41401501 (11), otros servicios 41409501 (12).
  if v_type = 2 then
    update public.accounting_rules set priority = 11, conditions = '{"source": "pos"}'::jsonb
     where organization_id = org_id and source_type = 'folio_item' and name = 'Cargo Folio Alimentos';
    update public.accounting_rules set priority = 12, conditions = '{"source": "service"}'::jsonb
     where organization_id = org_id and source_type = 'folio_item' and name = 'Cargo Folio Servicios';
    insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
      debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
    values (org_id, 'Cargo Folio Hospedaje', 'Cargo a folio por alojamiento', 'folio_item', 'created',
      '1305', '41400501', null, false, 10, true, '{"source": "room"}'::jsonb);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sembrar_configuracion_contable(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo integer;
  v_inv text;
  v_nivel integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if exists (
    select 1 from public.configuracion_contable where organization_id = p_org
  ) then
    return;
  end if;

  select o.type_id into v_tipo from public.organizations o where o.id = p_org;

  -- Hoteles y restaurantes (type_id 1/2, regla del contador): plan propio de A&B, SOLO en esas orgs
  -- (no va a puc_plantilla, que es de todas): 1405/140505/14050501 insumos de cocina y
  -- 6140/614005/61400501 costo A&B, 61400502 mermas de cocina. En comercio no se crea nada.
  if v_tipo in (1, 2) then
   for v_nivel in 1..3 loop  -- por nivel: el hijo necesita al padre ya insertado
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, t.codigo, t.nombre, p.type, t.padre, true, p.naturaleza, t.mov,
           coalesce(p.requiere_tercero, false), p.requiere_centro_costo, p.centro_costo_modo,
           p.presentacion_niif, now(), now()
      from (values
        ('1405',     '14',     'Materias primas',              false, 1),
        ('140505',   '1405',   'Insumos de cocina',            false, 2),
        ('14050501', '140505', 'Insumos de cocina',            true,  3),
        ('6140',     '61',     'Hoteles y restaurantes',       false, 1),
        ('614005',   '6140',   'Restaurantes',                 false, 2),
        ('61400501', '614005', 'Costo de alimentos y bebidas', true,  3),
        ('61400502', '614005', 'Mermas de cocina',             true,  3)
      ) as t(codigo, padre, nombre, mov, orden)
      join public.chart_of_accounts p on p.organization_id = p_org and p.account_code = t.padre
     where t.orden = v_nivel
    on conflict (organization_id, account_code) do nothing;
   end loop;
  end if;

  -- Hoteles (type_id 2): auxiliares de ingresos/devoluciones (134070). Con el trigger activo, 4140, 414005,
  -- 414015, 414095 y 4175 pasan a título solos al nacer su auxiliar (org nueva: sin saldos).
  if v_tipo = 2 then
    perform public.fn_hoteles_asegurar_cuentas_ingreso(p_org, null);
  end if;

  -- Comisiones (134090): 520518/52051801 y 529505/52950501. Con el trigger activo 5205 y 529505 pasan a título;
  -- la clave 'comisiones' (529505 en la propuesta) cae a su único auxiliar 52950501 más abajo.
  perform public.fn_comisiones_asegurar_cuentas(p_org, null);

  -- Inventario va SIEMPRE a un auxiliar 143501xx (regla de Juan: nunca 1435 sola ni 1405).
  -- Si aún no hay sede (la org se acaba de crear), fn_inventario_auxiliar_1435 devuelve null
  -- y la clave no se siembra: el resolver usa el auxiliar de la sede en tiempo de asiento.
  v_inv := public.fn_inventario_auxiliar_1435(p_org, null);

  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, p.clave, x.codigo
  from public.fn_propuesta_configuracion_sector(v_tipo) p
  cross join lateral (
    select case
      when p.clave = 'inventario' then v_inv
      -- Auxiliares del contador (P1 25-oct-2026), si existen y son de movimiento en la org.
      when exists (
        select 1 from public.chart_of_accounts a
        where a.organization_id = p_org and a.es_movimiento is true
          and a.account_code = case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' when p.account_code = '6135' then '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' end
            when 'ventas_servicios' then case when v_tipo = 2 then '41400501' end
            when 'devoluciones' then case when v_tipo = 2 then '41750101' end
            when 'descuentos' then case when v_tipo = 2 then '41750102' end
          end
      ) then case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' else '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' end
            when 'ventas_servicios' then case when v_tipo = 2 then '41400501' end
            when 'devoluciones' then case when v_tipo = 2 then '41750101' end
            when 'descuentos' then case when v_tipo = 2 then '41750102' end
          end
      -- Cuenta de título: su único auxiliar de movimiento, si lo hay.
      when p.account_code not like '24%' and exists (
        select 1 from public.chart_of_accounts t
        where t.organization_id = p_org and t.account_code = p.account_code and t.es_movimiento is false
      ) then (
        select min(h.account_code) from public.chart_of_accounts h
        where h.organization_id = p_org
          and h.account_code like p.account_code || '_%'
          and h.es_movimiento is true
        having count(*) = 1
      )
      else p.account_code
    end as codigo
  ) x
  join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = x.codigo
   and c.es_movimiento is distinct from false
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Ingresos diversos: 42959501 explícito (QA 25-oct), no solo el respaldo del resolver.
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'ingresos_diversos', '42959501'
  where exists (select 1 from public.chart_of_accounts a
                 where a.organization_id = p_org and a.account_code = '42959501' and a.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Redondeo en contra (Ajuste al peso): 53959501 (clave creada en 134020).
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'redondeo_en_contra', '53959501'
  where exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '53959501' and c.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Hoteles: la categoría de tesorería «Devoluciones a clientes» (sembrada antes por tr_zzz_categorias_tesoreria
  -- con 4175) pasa al auxiliar 41750101; 4175 es título en hoteles.
  if v_tipo = 2 and exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org
                              and c.account_code = '41750101' and c.es_movimiento is true) then
    update public.categorias_tesoreria set cuenta_sugerida = '41750101'
     where organization_id = p_org and cuenta_sugerida = '4175';
  end if;

  -- Costo de ventas por sede: 6135 -> 61350501 (igual que el Bloque B), si el auxiliar existe.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6135', '61350501', now()
  from public.branches b
  where b.organization_id = p_org
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61350501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6135');

  -- Hoteles y restaurantes: costo por sede 6140 -> 61400501.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6140', '61400501', now()
  from public.branches b
  where b.organization_id = p_org and v_tipo in (1, 2)
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61400501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6140');
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
    v_credit text;
    v_je RECORD;
    v_vinculo text;
    v_debit text;
    v_tax text;
    v_ret numeric := 0;
    v_amount numeric;
    v_cand RECORD;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    -- Cancelar (rechazo, clawback, anulación de la venta): contra-asiento de lo
    -- contabilizado. Nunca se borra ni se edita un asiento.
    IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled'
       AND OLD.status IN ('accrued', 'paid') THEN
        FOR v_je IN
            SELECT je.id
              FROM journal_entries je
             WHERE je.organization_id = NEW.organization_id
               AND je.source = 'commissions'
               AND je.source_id IN (NEW.id::text || ':accrued', NEW.id::text || ':accrued:retencion', NEW.id::text || ':paid')
               AND COALESCE(je.posted, false)
               AND NOT EXISTS (SELECT 1 FROM journal_entries r
                                WHERE r.organization_id = je.organization_id
                                  AND r.fact_key = 'reversal:' || je.id)
             ORDER BY je.id
        LOOP
            PERFORM fn_revertir_asiento_en_fecha(
                v_je.id, 'anulacion_comision', 'comision:' || NEW.id::text, now(), auth.uid());
        END LOOP;
        RETURN NEW;
    END IF;

    IF NEW.status = 'accrued' AND (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
        v_event_type := 'accrued';
    ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_event_type := 'paid';
    ELSE
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.commission_amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- Bug org 113 (jul-2026): las comisiones NO salen de facturas de compra. No se contabilizan; quedan en la cola.
    IF NEW.source_type = 'invoice_purchase' THEN
        PERFORM fn_log_journal_failure(NEW.organization_id, NULL, now(), TG_TABLE_NAME, NEW.id::text, NULL, NULL, NULL,
            NEW.commission_amount, 'comision_factura_compra', 'Las comisiones no se generan desde facturas de compra');
        RETURN NEW;
    END IF;

    IF v_event_type = 'paid' AND NEW.metadata ? 'payroll_slip_id' THEN
        RETURN NEW;
    END IF;

    v_vinculo := fn_comision_vinculo(NEW.organization_id, NEW.payee_type, NEW.payee_id);
    v_rule := NULL;
    FOR v_cand IN
        SELECT * FROM accounting_rules
         WHERE organization_id = NEW.organization_id
           AND source_type = 'commission'
           AND event_type = v_event_type
           AND is_active = true
           AND (conditions->>'vinculo' IS NULL OR conditions->>'vinculo' = v_vinculo)
         ORDER BY (conditions->>'vinculo' = v_vinculo) DESC NULLS LAST, priority
    LOOP
        v_debit := fn_comision_cuenta(NEW.organization_id, v_cand.debit_account_code);
        v_credit := fn_comision_cuenta(NEW.organization_id, v_cand.credit_account_code);
        IF v_debit IS NOT NULL AND v_credit IS NOT NULL THEN
            v_rule := v_cand;
            EXIT;
        END IF;
    END LOOP;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    -- La sucursal del asiento tiene que ser de la MISMA organizacion que la
    -- comision. Antes se copiaba NEW.branch_id sin comprobarlo.
    v_branch_id := NULL;

    IF NEW.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id = NEW.branch_id
           AND b.organization_id = NEW.organization_id;

        IF v_branch_id IS NULL THEN
            RAISE WARNING 'fn_auto_journal_commission: la comision % apunta a la sucursal %, que no pertenece a la organizacion %; se descarta',
                  NEW.id, NEW.branch_id, NEW.organization_id;
        END IF;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = NEW.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    -- journal_entries.branch_id es NOT NULL: sin sucursal no hay asiento, pero
    -- tampoco se inventa una. Se deja registrado igual que el caso 'no_rule'.
    IF v_branch_id IS NULL THEN
        PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_branch', 'La organizacion no tiene ninguna sucursal propia y journal_entries.branch_id es NOT NULL');
        RETURN NEW;
    END IF;

    v_memo := CASE NEW.commission_type
        WHEN 'salesperson' THEN 'Comisión Vendedor - ' || COALESCE(NEW.payee_name, NEW.payee_id::text, 'N/A')
        WHEN 'intermediation_sale' THEN 'Comisión Intermediación Venta - ' || COALESCE(NEW.payee_name, NEW.source_id)
        WHEN 'intermediation_purchase' THEN 'Comisión Intermediación Compra - ' || COALESCE(NEW.payee_name, NEW.source_id)
        ELSE 'Comisión - ' || COALESCE(NEW.payee_name, 'N/A')
    END;

    -- El pago sale de la cuenta de dinero elegida (misma resolución que payments);
    -- sin elección, la cuenta de la regla, como antes.
    -- Retención (externo): tarifa% sobre el monto si alcanza el umbral, solo si la cuenta existe.
    IF v_rule.conditions ? 'retencion_tarifa' AND v_rule.tax_account_code IS NOT NULL THEN
        v_tax := fn_comision_cuenta(NEW.organization_id, v_rule.tax_account_code);
        IF v_tax IS NOT NULL AND NEW.commission_amount >= COALESCE((v_rule.conditions->>'retencion_umbral')::numeric, 0) THEN
            v_ret := round(NEW.commission_amount * (v_rule.conditions->>'retencion_tarifa')::numeric / 100.0, 2);
        END IF;
    END IF;

    -- El pago debita el pasivo que acreditó la causación de ESTA comisión (aunque se haya causado con la regla
    -- vieja 2370) y, si hubo retención en la causación, paga el neto.
    v_amount := NEW.commission_amount;
    IF v_event_type = 'paid' THEN
        SELECT l.account_code INTO v_debit
          FROM journal_entries je JOIN journal_lines l ON l.journal_entry_id = je.id
         WHERE je.organization_id = NEW.organization_id AND je.source = 'commissions'
           AND je.source_id = NEW.id::text || ':accrued' AND l.credit > 0
         ORDER BY je.id LIMIT 1;
        v_debit := COALESCE(v_debit, fn_comision_cuenta(NEW.organization_id, v_rule.debit_account_code));
        v_amount := NEW.commission_amount - COALESCE((
            SELECT sum(l.credit) FROM journal_entries je JOIN journal_lines l ON l.journal_entry_id = je.id
             WHERE je.organization_id = NEW.organization_id AND je.source = 'commissions'
               AND je.source_id = NEW.id::text || ':accrued:retencion' AND l.credit > 0), 0);
        v_ret := 0;
    END IF;

    IF v_event_type = 'paid'
       AND (COALESCE(NEW.metadata->>'bank_account_id', '') <> '' OR COALESCE(NEW.metadata->>'payment_method', '') <> '') THEN
        v_credit := COALESCE(
            fn_money_account_code_pago(
                NEW.organization_id, v_branch_id,
                NULLIF(NEW.metadata->>'payment_method', ''),
                CASE WHEN COALESCE(NEW.metadata->>'bank_account_id', '') ~ '^[0-9]+$'
                     THEN (NEW.metadata->>'bank_account_id')::integer END),
            v_credit);
    END IF;

    v_source_id := NEW.id::text || ':' || v_event_type;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := CASE v_event_type
            WHEN 'accrued' THEN COALESCE(NEW.accrued_at, NEW.created_at, now())
            WHEN 'paid' THEN COALESCE(NEW.paid_at, NEW.updated_at, now())
        END,
        p_memo := v_memo,
        p_source := 'commissions',
        p_source_id := v_source_id,
        p_debit_account := v_debit,
        p_credit_account := v_credit,
        p_amount := v_amount
    );

    IF v_ret > 0 AND v_entry_id IS NOT NULL THEN
        PERFORM fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := v_branch_id,
            p_entry_date := COALESCE(NEW.accrued_at, NEW.created_at, now()),
            p_memo := 'Retención en la fuente - ' || v_memo,
            p_source := 'commissions',
            p_source_id := v_source_id || ':retencion',
            p_debit_account := v_credit,
            p_credit_account := v_tax,
            p_amount := v_ret
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- 4. Backfill idempotente en orgs existentes (las mismas 4 reglas de la plantilla).
insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
  debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
select o.id, v.n, v.d, 'commission', v.ev, v.deb, v.cre, v.tax, false, v.p, true, v.cond::jsonb
  from public.organizations o
 cross join (values
    ('Comisión Causada Empleado', 'Comisión de vendedor empleado', 'accrued', '52051801', '25050501', null::text, 1,
     '{"vinculo": "empleado"}'),
    ('Comisión Causada Externo', 'Comisión de vendedor externo, con retención en la fuente sobre el umbral', 'accrued',
     '52950501', '23359501', '23652001', 2, '{"vinculo": "externo", "retencion_tarifa": 10, "retencion_umbral": 0}'),
    ('Pago Comisión Empleado', 'Pago de comisión a vendedor empleado', 'paid', '25050501', '1110', null, 1,
     '{"vinculo": "empleado"}'),
    ('Pago Comisión Externo', 'Pago de comisión a vendedor externo (neto de retención)', 'paid', '23359501', '1110', null, 2,
     '{"vinculo": "externo"}')
  ) v(n, d, ev, deb, cre, tax, p, cond)
 where not exists (select 1 from public.accounting_rules x where x.organization_id = o.id
                     and x.source_type = 'commission' and x.name = v.n);
