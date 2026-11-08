-- Pruebas en seco · Correcciones del Contador a los anticipos a proveedores (P1, P6, P7, estado del proveedor,
-- circuito en efectivo). Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · org 374 (sucursal 585).
--
-- NO DEJA DATOS: todo corre dentro de begin … rollback. La migración 20261108170000 NO está aplicada: la corrida
-- pega su contenido completo en el lugar marcado «MIGRACIÓN» (dentro de la misma transacción) y se revierte con
-- todo lo demás. Lo que la org 374 no tiene (proveedores, facturas de compra con retenciones, perfil tributario,
-- caja abierta, auxiliar 13300501 y su configuración) se crea como administrador de la base dentro de la
-- transacción. Las operaciones del anticipo corren como un usuario miembro de la org 374 (rol «authenticated»
-- con su sesión simulada por request.jwt.claims), igual que desde la aplicación.
-- Resultado: tabla temporal r. Ver el .resultado.txt hermano.

begin;

-- ════ MIGRACIONES: aquí va, en este orden, el contenido de 20261108140500, 20261108160000, 20261108160500 y 20261108170000 ════

create temp table r (n serial primary key, caso text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated;
grant usage on sequence r_n_seq to authenticated;

-- ── Datos de apoyo (administrador; se revierten) ─────────────────────────────
with s as (
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba A', '900000001', 'company', 'comun', array['O-48']),
         (374, 'Proveedor de prueba B', '900000002', 'company', 'comun', array['O-48']),
         (374, 'Proveedor de prueba C', '900000003', 'company', null, null)
  returning id, nit)
insert into ctx select 'sup_' || right(nit, 1), id::text from s;

insert into ctx select 'tax_rete4', ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
 where ot.organization_id = 374 and tt.code = 'RETE_4';
insert into ctx select 'tax_ica', ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
 where ot.organization_id = 374 and tt.code = 'ICA_0.966';

-- Factura A: 1.000.000 + IVA 19 % con retenciones 4 % (40.000), reteIVA 15 % (28.500) y reteICA 0,97 % (9.700).
with f as (
  insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date, due_date)
  values (374, 585, (select v::int from ctx where k = 'sup_1'), 'PRUEBA-FC-A', 'draft', 'COP', now(), now() + interval '30 days')
  returning id)
insert into ctx select 'fc_a', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Servicio de prueba', 1, 1000000, 19, 'IVA_19', 1190000 from ctx where k = 'fc_a';
insert into public.invoice_purchase_withholdings (organization_id, invoice_id, concept, base, rate, amount, tax_code)
select 374, v::uuid, x.concept, x.base, x.rate, x.amount, x.code from ctx,
       (values ('Retención 4%', 1000000, 4, 40000, 'RETE_4'), ('Retención de IVA 15%', 190000, 15, 28500, 'RETEIVA_15'),
               ('ICA Bogotá', 1000000, 0.97, 9700, 'ICA_0.966')) x(concept, base, rate, amount, code)
 where k = 'fc_a';
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc_a');
insert into ctx select 'ap_a', id::text from public.accounts_payable where invoice_id = (select v::uuid from ctx where k = 'fc_a');

-- Factura B: 500.000 + IVA 19 % con retención 4 % (20.000).
with f as (
  insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date, due_date)
  values (374, 585, (select v::int from ctx where k = 'sup_2'), 'PRUEBA-FC-B', 'draft', 'COP', now(), now() + interval '30 days')
  returning id)
insert into ctx select 'fc_b', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Servicio de prueba B', 1, 500000, 19, 'IVA_19', 595000 from ctx where k = 'fc_b';
insert into public.invoice_purchase_withholdings (organization_id, invoice_id, concept, base, rate, amount, tax_code)
select 374, v::uuid, 'Retención 4%', 500000, 4, 20000, 'RETE_4' from ctx where k = 'fc_b';
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc_b');
insert into ctx select 'ap_b', id::text from public.accounts_payable where invoice_id = (select v::uuid from ctx where k = 'fc_b');

-- La regla vigente de «pago a proveedor» cambia DESPUÉS de causar: la aplicación debe seguir usando la cuenta
-- reconocida en la causación (22050501), no la de la regla (23359501).
update public.accounting_rules set debit_account_code = '23359501'
 where organization_id = 374 and source_type = 'purchase_payment';

-- Caja abierta en la sucursal 585, abierta por el usuario de la prueba.
with c as (
  insert into public.cash_sessions (organization_id, branch_id, opened_by, initial_amount, status)
  values (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 2000000, 'open') returning id)
insert into ctx select 'caja', id::text from c;

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;

-- ── Sesión del usuario miembro de la org 374 ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ P6 · Cuenta de detalle: sin configurar, 1330 y 133005 se bloquean ═══════
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_e jsonb;
  v_err text;
begin
  v_e := public.fn_cuenta_anticipo_proveedor_estado(374, 585);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Estado de la cuenta sin configurar', 'estado sin_configurar, cuenta null, sugerida null (13300501 no existe en la org 374)',
     v_e::text, v_e ->> 'estado' = 'sin_configurar' and v_e ->> 'cuenta' is null and v_e ->> 'sugerida' is null);
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_registrar(v_a, 585, 100000, 'transfer', 'financiacion', 'p09-sin-cuenta', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Registrar sin cuenta configurada (antes caía a 1330)', 'rechaza: cuenta_anticipos_no_configurada',
     coalesce(v_err, 'NO RECHAZÓ'), v_err = 'cuenta_anticipos_no_configurada');
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'fn_cuenta_anticipo_proveedor ya no devuelve 1330 de respaldo', 'null',
     coalesce(public.fn_cuenta_anticipo_proveedor(374, 585), 'null'), public.fn_cuenta_anticipo_proveedor(374, 585) is null);
end $$;

reset role;
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (374, null, 'anticipos_proveedores', '1330');
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_e jsonb;
  v_err text;
begin
  v_e := public.fn_cuenta_anticipo_proveedor_estado(374, 585);
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_registrar(v_a, 585, 100000, 'transfer', 'financiacion', 'p09-1330', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Configurada 1330 (título)', 'estado no_es_detalle; registrar rechaza cuenta_anticipos_no_detalle',
     (v_e ->> 'estado') || '; ' || coalesce(v_err, 'NO RECHAZÓ'), v_e ->> 'estado' = 'no_es_detalle' and v_err = 'cuenta_anticipos_no_detalle');
end $$;

-- Auxiliar de detalle bajo 133005 (en la org 374 no existe; se crea solo dentro de la prueba).
reset role;
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza,
                                      es_movimiento, requiere_tercero, requiere_centro_costo)
select '133005', 374, 'A proveedores', c.type, '1330', true, c.naturaleza, false, c.requiere_tercero, c.requiere_centro_costo
  from public.chart_of_accounts c where c.organization_id = 374 and c.account_code = '1330';
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza,
                                      es_movimiento, requiere_tercero, requiere_centro_costo)
select '13300501', 374, 'Anticipos a proveedores nacionales', c.type, '133005', true, c.naturaleza, true, true, c.requiere_centro_costo
  from public.chart_of_accounts c where c.organization_id = 374 and c.account_code = '1330';
-- 133005 (título con auxiliar): la base ya rechaza configurarla; la regla del anticipo también la rechazaría.
do $$
declare
  v_err text;
begin
  begin
    update public.configuracion_contable set account_code = '133005' where organization_id = 374 and clave = 'anticipos_proveedores';
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Configurar 133005 (título con auxiliar)', 'la configuración contable lo rechaza; la regla del anticipo dice no_es_detalle',
     coalesce(v_err, 'NO RECHAZÓ') || '; regla: ' || coalesce(public.fn_cuenta_anticipo_motivo_invalida(374, '133005'), 'sirve'),
     v_err is not null and public.fn_cuenta_anticipo_motivo_invalida(374, '133005') = 'no_es_detalle');
end $$;

update public.configuracion_contable set account_code = '13300501' where organization_id = 374 and clave = 'anticipos_proveedores';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ P1 · Naturaleza y retenciones ═══════════════════════════════════════════
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_e jsonb;
  v_err text;
  v_err2 text;
begin
  v_e := public.fn_cuenta_anticipo_proveedor_estado(374, 585);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Configurada 13300501 (auxiliar de detalle)', 'estado ok, cuenta 13300501, sugerida 13300501', v_e::text,
     v_e ->> 'estado' = 'ok' and v_e ->> 'cuenta' = '13300501' and v_e ->> 'sugerida' = '13300501');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_registrar(v_a, 585, 100000, 'transfer', null, 'p09-sin-naturaleza', 374);
  exception when others then v_err := sqlerrm;
  end;
  v_err2 := null;
  begin
    perform public.fn_anticipo_proveedor_crear(v_a, 585, 100000, 'transfer', 'p09-firma-vieja', 374);
  exception when others then v_err2 := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Naturaleza obligatoria, sin valor por defecto', 'registrar sin naturaleza y la firma vieja de crear: naturaleza_obligatoria',
     coalesce(v_err, 'NO RECHAZÓ') || ' / ' || coalesce(v_err2, 'NO RECHAZÓ'), v_err = 'naturaleza_obligatoria' and v_err2 = 'naturaleza_obligatoria');

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19,
           (select v::uuid from ctx where k = 'tax_rete4'), (select v::uuid from ctx where k = 'tax_ica'));
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Sin perfil tributario vigente', 'las tres clases «pendiente/sin_perfil_tributario»; total 0; pendiente=true',
     (select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || '/' || (c ->> 'motivo'), '; ') from jsonb_array_elements(v_e -> 'clases') c)
       || '; total ' || (v_e ->> 'total'),
     (select bool_and(c ->> 'estado' = 'pendiente' and c ->> 'motivo' = 'sin_perfil_tributario') from jsonb_array_elements(v_e -> 'clases') c)
       and (v_e ->> 'total')::numeric = 0 and (v_e ->> 'pendiente')::boolean);
end $$;

reset role;
insert into public.organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion, responsable_inc, periodicidad_iva)
values (374, date '2026-01-01', 'ordinario', array['O-13', 'O-48'], true, false, 'bimestral');
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_c int := (select v::int from ctx where k = 'sup_3');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'tax_ica');
  v_e jsonb;
  v_err text;
  v_txt text;
begin
  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica);
  select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || ' base ' || coalesce(c ->> 'base', '-') || ' valor ' || coalesce(c ->> 'valor', '-') || ' cuenta ' || coalesce(c ->> 'cuenta', '-'), '; ')
    into v_txt from jsonb_array_elements(v_e -> 'clases') c;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Pago anticipado del precio 1.190.000 (IVA 19 %), proveedor responsable de IVA, org gran contribuyente agente de retención',
     'base 1.000.000, IVA 190.000; retefuente 4 % = 40.000; reteIVA 15 % × 190.000 = 28.500; reteICA 0,97 % = 9.700; total 78.200; neto 1.111.800',
     v_txt || '; total ' || (v_e ->> 'total') || '; neto ' || (v_e ->> 'neto'),
     (v_e ->> 'base')::numeric = 1000000 and (v_e ->> 'iva')::numeric = 190000 and (v_e ->> 'total')::numeric = 78200
       and (v_e ->> 'neto')::numeric = 1111800 and not (v_e ->> 'pendiente')::boolean);

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, null);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'ReteICA sin concepto municipal elegido', 'reteica «pendiente/norma_municipal_sin_confirmar» (no se asume 0 ni tarifa fija); pendiente=true; total 68.500',
     (v_e -> 'clases' -> 2)::text || '; total ' || (v_e ->> 'total'),
     v_e -> 'clases' -> 2 ->> 'estado' = 'pendiente' and v_e -> 'clases' -> 2 ->> 'motivo' = 'norma_municipal_sin_confirmar'
       and (v_e ->> 'pendiente')::boolean and (v_e ->> 'total')::numeric = 68500);

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_c, 'pago_anticipado_precio', 1190000, 19, v_r4, null);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Proveedor sin datos fiscales', 'retefuente y reteIVA «pendiente/proveedor_sin_datos_fiscales»; reteICA pendiente; total 0',
     (select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || '/' || (c ->> 'motivo'), '; ') from jsonb_array_elements(v_e -> 'clases') c),
     v_e -> 'clases' -> 0 ->> 'motivo' = 'proveedor_sin_datos_fiscales' and v_e -> 'clases' -> 1 ->> 'motivo' = 'proveedor_sin_datos_fiscales'
       and v_e -> 'clases' -> 2 ->> 'estado' = 'pendiente' and (v_e ->> 'total')::numeric = 0);

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'financiacion', 1190000, null, null, null);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Anticipo de financiación', 'las tres «no_aplica/financiacion_se_retiene_al_causar»; total 0; no pendiente',
     (select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || '/' || (c ->> 'motivo'), '; ') from jsonb_array_elements(v_e -> 'clases') c),
     (select bool_and(c ->> 'estado' = 'no_aplica' and c ->> 'motivo' = 'financiacion_se_retiene_al_causar') from jsonb_array_elements(v_e -> 'clases') c)
       and (v_e ->> 'total')::numeric = 0 and not (v_e ->> 'pendiente')::boolean);

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 7, v_r4, null);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Tarifa de IVA que la org no tiene (7 %)', 'rechaza: tarifa_iva_invalida', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'tarifa_iva_invalida');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_registrar(v_a, 585, 1190000, 'transfer', 'pago_anticipado_precio', 'p09-sin-concepto', 374, 19, null, v_ica, null, 'TRF-X');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Pago anticipado sin concepto de retefuente habiendo conceptos', 'rechaza: concepto_retefuente_obligatorio',
     coalesce(v_err, 'NO RECHAZÓ'), v_err = 'concepto_retefuente_obligatorio');
end $$;

-- ═══ Circuito positivo en EFECTIVO con caja abierta ═══════════════════════════
-- El efectivo esperado del arqueo se lee con el cálculo de la base (pos_caja__esperado_calculo), que el usuario no
-- ejecuta directamente: se mide como administrador con la misma sesión simulada, antes y después.
reset role;
insert into ctx select 'esp_antes', (public.pos_caja__esperado_calculo((select v::int from ctx where k = 'caja')) ->> 'efectivo_esperado');
set local role authenticated;

do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_caja int := (select v::int from ctx where k = 'caja');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'tax_ica');
  v_antes numeric;
  v_despues numeric;
  v_res jsonb;
  v_res2 jsonb;
  v_ant uuid;
  v_txt text;
  v_n int;
  v_err text;
begin
  v_res := public.fn_anticipo_proveedor_registrar(v_a, 585, 1190000, 'cash', 'pago_anticipado_precio', 'p09-efectivo-A1', 374, 19, v_r4, v_ica,
                                                  null, null, 'Anticipo en efectivo de prueba');
  v_ant := (v_res ->> 'anticipo_id')::uuid;
  insert into ctx values ('ant_a1', v_ant::text);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Efectivo', 'Registrar anticipo en efectivo con caja abierta', 'caja_id = caja abierta; monto 1.190.000; retención 78.200; girado 1.111.800; cuenta 13300501',
     format('caja %s; monto %s; retención %s; girado %s; cuenta %s; recibo %s', v_res ->> 'caja_id', v_res ->> 'monto', v_res ->> 'retencion', v_res ->> 'girado', v_res ->> 'cuenta', v_res ->> 'recibo'),
     (v_res ->> 'caja_id')::int = v_caja and (v_res ->> 'girado')::numeric = 1111800 and (v_res ->> 'retencion')::numeric = 78200 and v_res ->> 'cuenta' = '13300501');

  select string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc, l.credit desc),
         count(*) filter (where l.account_code = '1330')
    into v_txt, v_n
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.fact_key = 'supplier_advance:' || v_ant;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Efectivo', 'Asiento del anticipo en efectivo',
     'D 13300501 1.190.000 / C caja 1.111.800 / C retefuente 40.000 / C reteIVA 28.500 / C reteICA 9.700; todo con NIT 900000001; nada en 1330',
     v_txt, v_n = 0 and v_txt like '13300501 D 1190000 C 0 tercero 900000001%' and v_txt like '%C 1111800 tercero 900000001%'
       and v_txt like '%C 40000 tercero 900000001%' and v_txt like '%C 28500 tercero 900000001%' and v_txt like '%C 9700 tercero 900000001%');

  select count(*) into v_n from public.payments p join public.payment_groups g on g.id = p.payment_group_id
   where p.source = 'supplier_advance' and p.source_id = v_ant::text and p.method = 'cash' and p.amount = -1111800
     and p.status = 'completed' and g.cash_session_id = v_caja;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Efectivo', 'Sale de la caja', 'un pago en efectivo de -1.111.800 ligado a la caja abierta', format('pagos=%s', v_n), v_n = 1);

  select string_agg(format('%s base %s valor %s cuenta %s', w.clase, w.base, w.valor, w.cuenta), '; ' order by w.clase) into v_txt
    from public.supplier_advance_withholdings w where w.advance_id = v_ant;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Retención guardada por anticipo (base y valor)', 'reteica 1.000.000/9.700; reteiva 190.000/28.500; retefuente 1.000.000/40.000',
     v_txt, v_txt like 'retefuente base 1000000.00 valor 40000.00%' and v_txt like '%reteica base 1000000.00 valor 9700.00%' and v_txt like '%reteiva base 190000.00 valor 28500.00%');

  v_res2 := public.fn_anticipo_proveedor_registrar(v_a, 585, 1190000, 'cash', 'pago_anticipado_precio', 'p09-efectivo-A1', 374, 19, v_r4, v_ica,
                                                   null, null, 'Anticipo en efectivo de prueba');
  select count(*) into v_n from public.journal_entries where organization_id = 374 and fact_key = 'supplier_advance:' || v_ant;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Efectivo', 'Repetir con la misma clave', 'repetida=true, mismo anticipo, un solo asiento',
     format('repetida %s; mismo %s; asientos %s', v_res2 ->> 'repetida', (v_res2 ->> 'anticipo_id')::uuid = v_ant, v_n),
     (v_res2 ->> 'repetida')::boolean and (v_res2 ->> 'anticipo_id')::uuid = v_ant and v_n = 1);
end $$;

reset role;
insert into r (caso, verificacion, esperado, obtenido, ok)
select 'Efectivo', 'El arqueo lo refleja (efectivo esperado de la caja)', 'baja exactamente 1.111.800 (lo girado; la retención no sale de la caja)',
       format('antes %s, después %s, diferencia %s', a.v, d.e, d.e - a.v::numeric), d.e - a.v::numeric = -1111800
  from ctx a, (select (public.pos_caja__esperado_calculo((select v::int from ctx where k = 'caja')) ->> 'efectivo_esperado')::numeric as e) d
 where a.k = 'esp_antes';
set local role authenticated;

-- ═══ P6/P1 · Aplicación a la CxP reconocida, sin repetir la retención ═══════
do $$
declare
  v_ant uuid := (select v::uuid from ctx where k = 'ant_a1');
  v_ap uuid := (select v::uuid from ctx where k = 'ap_a');
  v_res jsonb;
  v_res2 jsonb;
  v_txt text;
  v_num numeric;
  v_ok boolean;
begin
  select amount || ' / ' || balance into v_txt from public.accounts_payable where id = v_ap;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'CxP de la factura A antes de aplicar', 'neto 1.111.800 (1.190.000 − retenciones de la factura 78.200)', v_txt, v_txt = '1111800.00 / 1111800.00');

  v_res := public.fn_anticipo_proveedor_aplicar(v_ant, v_ap, 595000, 'p09-aplicar-1', 374);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Aplicar 595.000 (la mitad del anticipo)',
     'cuenta_por_pagar 22050501 (la de la causación, aunque la regla vigente ya dice 23359501); retención descontada 39.100; baja la CxP 555.900; CxP 555.900',
     format('cuenta %s; causación %s; descontada %s; reducción %s; saldo CxP %s; saldo anticipo %s', v_res ->> 'cuenta_por_pagar', v_res ->> 'asiento_causacion',
            v_res ->> 'retencion_descontada', v_res ->> 'reduccion_cuenta', v_res ->> 'saldo_cuenta', v_res ->> 'saldo_disponible'),
     v_res ->> 'cuenta_por_pagar' = '22050501' and (v_res ->> 'retencion_descontada')::numeric = 39100
       and (v_res ->> 'reduccion_cuenta')::numeric = 555900 and (v_res ->> 'saldo_cuenta')::numeric = 555900 and (v_res ->> 'saldo_disponible')::numeric = 595000);

  select string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc, l.credit desc)
    into v_txt
    from public.journal_lines l where l.journal_entry_id = (v_res ->> 'asiento_id')::int;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Asiento de la aplicación', 'D 22050501 555.900 · D retefuente 20.000 · D reteIVA 14.250 · D reteICA 4.850 · C 13300501 595.000; NIT 900000001',
     v_txt, v_txt like '22050501 D 555900 C 0 tercero 900000001%' and v_txt like '%D 20000 C 0%' and v_txt like '%D 14250 C 0%'
       and v_txt like '%D 4850 C 0%' and v_txt like '%13300501 D 0 C 595000 tercero 900000001%' and v_txt not like '%23359501%');

  v_res2 := public.fn_anticipo_proveedor_aplicar(v_ant, v_ap, 595000, 'p09-aplicar-2', 374);
  select ap.balance || ' / ' || ap.status || '; anticipo ' || a.balance || ' / ' || a.status into v_txt
    from public.accounts_payable ap, public.supplier_advances a where ap.id = v_ap and a.id = v_ant;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Aplicar los otros 595.000', 'descontada 39.100 (la factura retuvo toda la base una vez); CxP 0 / paid; anticipo 0 / used',
     format('descontada %s; ', v_res2 ->> 'retencion_descontada') || v_txt,
     (v_res2 ->> 'retencion_descontada')::numeric = 39100 and v_txt = '0.00 / paid; anticipo 0.00 / used');

  -- Cada retención queda practicada UNA vez frente al proveedor A: anticipo + factura − descontado.
  select string_agg(format('%s %s', l.account_code, sum_c), '; ' order by l.account_code), bool_and(sum_c in (40000, 28500, 9700))
    into v_txt, v_ok
    from (select l.account_code, sum(l.credit - l.debit) as sum_c
            from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
           where e.organization_id = 374 and l.tercero_nit = '900000001' and left(l.account_code, 3) = '236'
           group by l.account_code) l;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Retención neta por cuenta y NIT A (factura + anticipo + aplicaciones)', 'retefuente 40.000, reteIVA 28.500, reteICA 9.700: una sola vez',
     v_txt, v_ok);

  select string_agg(format('consumo %s, a CxP %s, descontada %s, cuenta %s, causación %s', coalesce(x.consumo_anticipo, x.amount), x.amount, x.retencion_descontada,
                           x.cuenta_por_pagar, x.asiento_causacion), ' | ' order by x.created_at),
         bool_and(x.advance_id = v_ant and x.account_payable_id = v_ap and x.cuenta_por_pagar = '22050501' and x.asiento_causacion is not null)
    into v_txt, v_ok
    from public.supplier_advance_applications x where x.account_payable_id = v_ap;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Estado', 'Historia de la CxP A (lo que lee el detalle de la cuenta por pagar)', 'dos aplicaciones que referencian anticipo y CxP, con cuenta y asiento de causación',
     v_txt, v_ok);
end $$;

-- ═══ Financiación: la retención se practica al causar, no se descuenta nada ════
do $$
declare
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_ap uuid := (select v::uuid from ctx where k = 'ap_b');
  v_res jsonb;
  v_ant uuid;
begin
  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 300000, 'transfer', 'financiacion', 'p09-fin-B1', 374, null, null, null, null, 'TRF-B1');
  v_ant := (v_res ->> 'anticipo_id')::uuid;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Registrar anticipo de financiación por transferencia', 'retención 0; girado 300.000; pendiente=false',
     format('retención %s; girado %s; pendiente %s', v_res ->> 'retencion', v_res ->> 'girado', v_res ->> 'retencion_pendiente'),
     (v_res ->> 'retencion')::numeric = 0 and (v_res ->> 'girado')::numeric = 300000 and not (v_res ->> 'retencion_pendiente')::boolean);
  v_res := public.fn_anticipo_proveedor_aplicar(v_ant, v_ap, 300000, 'p09-aplicar-B1', 374);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Aplicar el de financiación a la factura B (retuvo 20.000)', 'descontada 0 (no hubo retención en el anticipo); CxP 575.000 → 275.000',
     format('descontada %s; CxP %s', v_res ->> 'retencion_descontada', v_res ->> 'saldo_cuenta'),
     (v_res ->> 'retencion_descontada')::numeric = 0 and (v_res ->> 'saldo_cuenta')::numeric = 275000);
end $$;

-- ═══ P7 · Anular solo por error; si el dinero salió, devolución real ══════════
do $$
declare
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'tax_ica');
  v_res jsonb;
  v_b2 uuid;
  v_b3 uuid;
  v_err text;
  v_err2 text;
  v_txt text;
  v_n int;
begin
  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 238000, 'transfer', 'pago_anticipado_precio', 'p09-B2', 374, 19, v_r4, v_ica, null, 'TRF-B2');
  v_b2 := (v_res ->> 'anticipo_id')::uuid;
  insert into ctx values ('ant_b2', v_b2::text);

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular(v_b2, 'Registrado por error', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'La anulación vieja (sin declaración) ya no procede', 'rechaza: anulacion_requiere_declaracion', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'anulacion_requiere_declaracion');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular_por_error(v_b2, 'Transferencia rechazada', null, null, 374);
  exception when others then v_err := sqlerrm;
  end;
  v_err2 := null;
  begin
    perform public.fn_anticipo_proveedor_anular_por_error(v_b2, 'Transferencia rechazada', 'Extracto con el rechazo', current_date + 5, 374);
  exception when others then v_err2 := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Declarar «no ocurrió» exige soporte y fecha no futura', 'soporte_obligatorio / fecha_ajuste_futura',
     coalesce(v_err, 'NO RECHAZÓ') || ' / ' || coalesce(v_err2, 'NO RECHAZÓ'), v_err = 'soporte_obligatorio' and v_err2 = 'fecha_ajuste_futura');

  v_res := public.fn_anticipo_proveedor_anular_por_error(v_b2, 'Transferencia rechazada por el banco', 'Extracto bancario con el rechazo de TRF-B2', null, 374);
  select string_agg(format('%s D %s C %s', l.account_code, round(l.debit), round(l.credit)), ' | ' order by l.debit desc, l.credit desc) into v_txt
    from public.journal_lines l where l.journal_entry_id = (v_res ->> 'contra_asiento')::int;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Anular por error (el desembolso no ocurrió)', 'contra-asiento: D banco 222.360 · D retefuente 8.000 · D reteIVA 5.700 · D reteICA 1.940 · C 13300501 238.000',
     v_txt, v_txt like '%D 222360 C 0%' and v_txt like '%D 8000 C 0%' and v_txt like '%D 5700 C 0%' and v_txt like '%D 1940 C 0%' and v_txt like '%13300501 D 0 C 238000%');
  select format('estado %s, saldo %s, tipo %s, soporte «%s», fecha %s; pago %s', a.status, a.balance, a.anulacion_tipo, a.anulacion_soporte, a.anulacion_fecha,
                (select p.status from public.payments p where p.source = 'supplier_advance' and p.source_id = a.id::text))
    into v_txt from public.supplier_advances a where a.id = v_b2;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Estado tras anular por error', 'cancelled, saldo 0, desembolso_no_ocurrio, con soporte y fecha del ajuste; pago void',
     v_txt, v_txt like 'estado cancelled, saldo 0.00, tipo desembolso_no_ocurrio%' and v_txt like '%pago void');

  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p09-B3', 374, 19, v_r4, v_ica, null, 'TRF-B3');
  v_b3 := (v_res ->> 'anticipo_id')::uuid;
  insert into ctx values ('ant_b3', v_b3::text);
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_devolver(v_b3, 59500, 'transfer', 'El proveedor devolvió la mitad', 'p09-dev-sin-soporte', 374, null, null);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Devolución real sin soporte', 'rechaza: soporte_obligatorio', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'soporte_obligatorio');

  v_res := public.fn_anticipo_proveedor_devolver(v_b3, 59500, 'transfer', 'El proveedor devolvió la mitad', 'p09-dev-B3', 374, null, 'Consignación 0042');
  select string_agg(format('%s D %s C %s', l.account_code, round(l.debit), round(l.credit)), ' | ' order by l.debit desc, l.credit desc) into v_txt
    from public.journal_lines l where l.journal_entry_id = (v_res ->> 'asiento_id')::int;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Devolución real de 59.500 (la mitad del anticipo con retención 7.820)',
     'entra 55.590; se revierte la retención proporcional 3.910 (2.000 + 1.425 + 485); D banco 55.590 · D retenciones · C 13300501 59.500; saldo 59.500',
     format('dinero %s; revertida %s; saldo %s; ', v_res ->> 'dinero', v_res ->> 'retencion_revertida', v_res ->> 'saldo_disponible') || v_txt,
     (v_res ->> 'dinero')::numeric = 55590 and (v_res ->> 'retencion_revertida')::numeric = 3910 and (v_res ->> 'saldo_disponible')::numeric = 59500
       and v_txt like '%D 55590 C 0%' and v_txt like '%13300501 D 0 C 59500%');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular_por_error(v_b3, 'Intento de anular', 'Soporte cualquiera', null, 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Anular uno cuyo dinero salió y regresó en parte', 'rechaza: anticipo_usado (el saldo sigue siendo un derecho frente al proveedor)',
     coalesce(v_err, 'NO RECHAZÓ'), v_err = 'anticipo_usado');
end $$;

-- ═══ Estado de cuenta del proveedor y conciliación ═══════════════════════════
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_e jsonb;
  v_c jsonb;
  v_txt text;
begin
  v_e := public.fn_estado_cuenta_proveedor(374, v_a, null, null);
  select string_agg(format('%s C %s A %s S %s', m ->> 'tipo', m ->> 'cargo', m ->> 'abono', m ->> 'saldo'), ' | ') into v_txt
    from jsonb_array_elements(v_e -> 'movimientos') m;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Estado', 'Estado de cuenta del proveedor A', 'factura 1.111.800 · anticipo abono 1.190.000 · dos aplicaciones cargo 39.100 c/u · saldo final 0',
     v_txt || '; saldo final ' || (v_e ->> 'saldo_final'),
     (v_e ->> 'saldo_final')::numeric = 0 and v_txt like '%anticipo C 0 A 1190000%' and v_txt like '%aplicacion_anticipo C 39100%');

  v_e := public.fn_estado_cuenta_proveedor(374, v_b, null, null);
  select string_agg(format('%s C %s A %s', m ->> 'tipo', m ->> 'cargo', m ->> 'abono'), ' | ') into v_txt
    from jsonb_array_elements(v_e -> 'movimientos') m;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Estado', 'Estado de cuenta del proveedor B (creación, aplicación, anulación y devolución)',
     'saldo final 215.500 = CxP 275.000 − anticipo vivo 59.500; aparecen anticipo, aplicacion_anticipo, anulacion_anticipo y devolucion_anticipo',
     v_txt || '; saldo final ' || (v_e ->> 'saldo_final'),
     (v_e ->> 'saldo_final')::numeric = 215500 and v_txt like '%aplicacion_anticipo%' and v_txt like '%anulacion_anticipo C 238000%'
       and v_txt like '%devolucion_anticipo C 59500%');

  v_c := public.fn_anticipos_proveedor_conciliacion(374, null);
  select string_agg(format('%s %s: valor %s apl %s dev %s anul %s saldo %s libros %s cuadra %s', a ->> 'proveedor', a ->> 'naturaleza', a ->> 'valor', a ->> 'aplicado',
                           a ->> 'devuelto', a ->> 'anulado', a ->> 'saldo', a ->> 'saldo_libros', a ->> 'cuadra'), ' | ') into v_txt
    from jsonb_array_elements(v_c -> 'anticipos') a;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Conciliación por anticipo', '4 anticipos; en cada uno valor − aplicado − devuelto − anulado = saldo = saldo en libros',
     v_txt, jsonb_array_length(v_c -> 'anticipos') = 4 and (select bool_and((a ->> 'cuadra')::boolean) from jsonb_array_elements(v_c -> 'anticipos') a));
  select string_agg(format('%s: saldo %s libros %s auxiliar por NIT %s', p ->> 'proveedor', p ->> 'saldo', p ->> 'saldo_libros', p ->> 'auxiliar_nit'), ' | ') into v_txt
    from jsonb_array_elements(v_c -> 'proveedores') p;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Conciliación por proveedor', 'A: 0 / 0 / 0 · B: 59.500 / 59.500 / 59.500',
     v_txt, (select bool_and((p ->> 'saldo')::numeric = (p ->> 'saldo_libros')::numeric and (p ->> 'saldo')::numeric = (p ->> 'auxiliar_nit')::numeric)
               from jsonb_array_elements(v_c -> 'proveedores') p)
            and exists (select 1 from jsonb_array_elements(v_c -> 'proveedores') p
                         where p ->> 'proveedor' = 'Proveedor de prueba B' and (p ->> 'saldo')::numeric = 59500));
end $$;

reset role;

-- ═══ Perfil con renta e IVA separados (20261108160500): sus columnas mandan sobre los códigos ═══
-- Se simulan las tres columnas que lee la evaluación (si 160500 ya está aplicada, «if not exists» no hace nada).
alter table public.organization_tax_profiles
  add column if not exists gran_contribuyente boolean,
  add column if not exists agente_retencion_iva boolean,
  add column if not exists requiere_revision boolean not null default false;
update public.organization_tax_profiles set gran_contribuyente = false, agente_retencion_iva = false where organization_id = 374;
do $$
declare
  v_e jsonb;
  v_e2 jsonb;
  v_e3 jsonb;
begin
  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, (select v::int from ctx where k = 'sup_1'), 'pago_anticipado_precio', 1190000, 19,
           (select v::uuid from ctx where k = 'tax_rete4'), (select v::uuid from ctx where k = 'tax_ica'));
  update public.organization_tax_profiles set agente_retencion_iva = true where organization_id = 374;
  v_e2 := public.fn_anticipo_proveedor_evaluar_retenciones(374, (select v::int from ctx where k = 'sup_1'), 'pago_anticipado_precio', 1190000, 19,
           (select v::uuid from ctx where k = 'tax_rete4'), (select v::uuid from ctx where k = 'tax_ica'));
  update public.organization_tax_profiles set requiere_revision = true where organization_id = 374;
  v_e3 := public.fn_anticipo_proveedor_evaluar_retenciones(374, (select v::int from ctx where k = 'sup_1'), 'pago_anticipado_precio', 1190000, 19,
           (select v::uuid from ctx where k = 'tax_rete4'), (select v::uuid from ctx where k = 'tax_ica'));
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Perfil 160500: agente de reteIVA y gran contribuyente propios mandan sobre O-13',
     'con ambos en false: reteIVA no_aplica aunque responsabilidades traiga O-13; con agente_retencion_iva true: 28.500; con requiere_revision: las tres pendientes',
     format('%s / %s / %s', v_e -> 'clases' -> 1 ->> 'motivo', v_e2 -> 'clases' -> 1 ->> 'valor', v_e3 -> 'clases' -> 0 ->> 'motivo'),
     v_e -> 'clases' -> 1 ->> 'motivo' = 'organizacion_no_agente_reteiva' and (v_e2 -> 'clases' -> 1 ->> 'valor')::numeric = 28500
       and v_e3 -> 'clases' -> 0 ->> 'motivo' = 'perfil_requiere_revision');
end $$;

-- El control de cuadre de la base corre aquí, sobre todos los asientos de la transacción.
set constraints all immediate;

insert into r (caso, verificacion, esperado, obtenido, ok)
select 'Cuadre', 'Asientos de la prueba (cuadre de la base + suma)', 'todos cuadran; ninguna línea en 1330',
       format('%s asientos (%s); cuadran %s; líneas en 1330: %s', count(*), string_agg(distinct je.source, ', '), bool_and(t.d = t.c), sum(t.en_1330)),
       bool_and(t.d = t.c) and sum(t.en_1330) = 0
  from public.journal_entries je
  join (select journal_entry_id, sum(debit) d, sum(credit) c, count(*) filter (where account_code = '1330') en_1330
          from public.journal_lines group by 1) t on t.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je')
   and je.source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund', 'reversal');

select n, caso, verificacion, esperado, obtenido, ok from r order by n;

rollback;
