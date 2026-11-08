-- Prueba en seco 16 · Integración anticipo a proveedor ↔ consignación (ronda 3 del Contador, «Cruce anticipo–consignación»).
-- Fecha: 2026-11-08 · Proyecto taqjemqjtumhwptchcxk · org 374 (sucursal 585).
--
-- NO DEJA DATOS: begin … rollback. Migraciones SIN APLICAR, en su orden real de aplicación (decidido en
-- ANTICIPOS-CORRECCIONES-P1-P6-P7.md, «Ronda 3»): 20261108120500 → 20261108121000 → 20261108140500 → 20261108160000 →
-- 20261108160500 → 20261108165000 → 20261108170000. 121000 va ANTES de 170000: 170000 lee consignment_advance_crossings
-- si existe y no redefine ninguna función de 121000.
--
-- Cómo se corre (alcance real, ver el .resultado.txt): la cadena de anticipos (140500 → 170000) se pega completa; de
-- 120500 y 121000 se pegan, copiados byte a byte del archivo, solo los objetos que intervienen en el cruce: las tablas
-- organization_links y organization_shared_documents (claves foráneas de la nota), consignment_notes,
-- consignment_advance_crossings y la función fn_consignacion_cruzar_anticipo. El resto de la consignación (recibir,
-- vender por kardex, liquidar) lo cubre de punta a punta la prueba 14 del equipo de consignación; aquí la nota recibida se
-- inserta como administrador y la obligación con el dueño (281510) nace de un asiento de recaudo, como la crearía una venta.
-- La corrida del 2026-11-08 fue UNA sola transacción con las migraciones, la prueba 11 y esta, en ese orden (ver el
-- .resultado.txt): el texto (≈250 KB) se subió en trozos como objetos grandes de Postgres, verificados por md5, y se
-- ejecutó dentro de un DO que termina con una excepción, que es el rollback; después se borraron los objetos grandes.
--
-- Escenario: un consignante (mandato) recibe un anticipo de pago anticipado del precio con retenciones; se cruza parte con
-- la obligación del mandato; se devuelve otra parte por procedimiento (devolución parcial); un segundo anticipo se anula
-- por error. Debe conciliar: saldo por anticipo y por proveedor (tabla = libros = auxiliar por NIT), obligación con el
-- dueño (28151001), retenciones (certificado = libros 236x del NIT) y estado de cuenta del proveedor.

begin;

-- ════ MIGRACIONES: cadena de anticipos (140500 → 170000) y extracto exacto de 120500/121000 ════

create temp table r16 (n serial primary key, caso text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx16 (k text primary key, v text);
grant all on r16, ctx16 to authenticated;
grant usage on sequence r16_n_seq to authenticated;
-- Si en la misma transacción ya corrió otra prueba que dejó los controles inmediatos (la 11 termina así), se vuelven
-- a diferir: el cuadre del asiento se comprueba al final, como en una transacción normal.
set constraints all deferred;

-- ── Datos de apoyo (administrador; se revierten) ─────────────────────────────
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, x.mov and x.code like '1330%', c.requiere_centro_costo
  from public.chart_of_accounts c,
       (values ('133005', 'A proveedores', '1330', false), ('13300501', 'Anticipos a proveedores nacionales', '133005', true)) x(code, name, parent, mov)
 where c.organization_id = 374 and c.account_code = '1330'
   and not exists (select 1 from public.chart_of_accounts e where e.organization_id = 374 and e.account_code = x.code);
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, false, c.requiere_centro_costo
  from public.chart_of_accounts c,
       (values ('281510', 'Ingresos recibidos para terceros (mandato)', '2815', false), ('28151001', 'Dueño consignante de prueba', '281510', true)) x(code, name, parent, mov)
 where c.organization_id = 374 and c.account_code = '2815';
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
select 374, null, 'anticipos_proveedores', '13300501'
 where not exists (select 1 from public.configuracion_contable where organization_id = 374 and clave = 'anticipos_proveedores');
update public.configuracion_contable set account_code = '13300501' where organization_id = 374 and clave = 'anticipos_proveedores';
insert into public.organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion, responsable_inc, periodicidad_iva)
select 374, date '2026-01-01', 'ordinario', array['O-13', 'O-48'], true, false, 'bimestral'
 where not exists (select 1 from public.organization_tax_profiles where organization_id = 374);
update public.organization_tax_profiles set requiere_revision = false, agente_retencion_iva = true, gran_contribuyente = true where organization_id = 374;

with s as (
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Consignante de prueba G', '900000007', 'company', 'comun', array['O-48']) returning id)
insert into ctx16 select 'sup_g', id::text from s;
insert into ctx16 select 'tax_rete4', ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
 where ot.organization_id = 374 and tt.code = 'RETE_4';

-- Nota recibida en mandato (intermediación) del consignante G, con su auxiliar de obligación 28151001.
with n as (
  insert into public.consignment_notes (organization_id, branch_id, direction, supplier_id, number, legal_modality, accounting_role, tax_treatment,
    memo_valuation, price_mode, remuneration_mode, commission_base, commission_pct, remuneration_recognition, fee_invoice_required, owner_obligation_at,
    risk_terms, billing_terms, memo_account_code, memo_contra_account_code, owner_account_code, remuneration_account_code, idempotency_key)
  values (374, 585, 'recibida', (select v::int from ctx16 where k = 'sup_g'), 'NCR-PRUEBA-16', 'intermediacion', 'agente', 'mandato',
    'costo_acreditado', 'fijo', 'porcentaje', 'precio_pactado', 15, 'al_vender', true, 'venta',
    '{"devoluciones":"dueno","perdidas":"dueno","gastos":"consignatario"}'::jsonb, '{}'::jsonb, '911520', '9405', '28151001', '41351201', 'p16-nota')
  returning id)
insert into ctx16 select 'nota', id::text from n;
insert into ctx16 select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
-- Obligación real con el dueño: recaudo de ventas por 500.000 (D caja / C 28151001), como la deja la venta en mandato.
select public.fn_create_journal_entry(p_organization_id := 374, p_branch_id := 585, p_entry_date := now(),
  p_memo := 'Recaudo para el dueño de la mercancía en consignación - NCR-PRUEBA-16', p_source := 'consignment_sale', p_source_id := 'p16-venta',
  p_debit_account := '1105', p_credit_account := '28151001', p_amount := 500000, p_created_by := null, p_fact_key := 'p16-recaudo-dueno');

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_g int := (select v::int from ctx16 where k = 'sup_g');
  v_r4 uuid := (select v::uuid from ctx16 where k = 'tax_rete4');
  v_ica uuid;
  v_res jsonb;
  v_g1 uuid;
  v_g2 uuid;
  v_err text;
  v_txt text;
begin
  v_ica := public.fn_reteica_regla_guardar(374, '47ae0b2d-e894-453e-9680-f519c1e3f118', 'Comercio por mandato (prueba 16)', 9.66,
                                           'Acuerdo municipal de ReteICA vigente', date '2026-01-01');
  -- G1: pago anticipado de 595.000 (500.000 + IVA 95.000) → rete 20.000, reteIVA 14.250, reteICA 4.830; girado 555.920.
  v_res := public.fn_anticipo_proveedor_registrar(v_g, 585, 595000, 'transfer', 'pago_anticipado_precio', 'p16-G1', 374, 19, v_r4, v_ica, null, 'TRF-G1', null, null, true);
  v_g1 := (v_res ->> 'anticipo_id')::uuid;
  insert into ctx16 values ('g1', v_g1::text);
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Anticipo', 'Anticipo al consignante con retenciones', 'retención 39.080 (20.000 + 14.250 + 4.830); girado 555.920',
     format('retención %s; girado %s', v_res ->> 'retencion', v_res ->> 'girado'), (v_res ->> 'retencion')::numeric = 39080 and (v_res ->> 'girado')::numeric = 555920);

  -- Cruce con la obligación del mandato (función exacta de 121000).
  v_err := null;
  begin
    perform public.fn_consignacion_cruzar_anticipo((select v::uuid from ctx16 where k = 'nota'), v_g1, 550000, 'p16-cruce-x', 374);
  exception when others then v_err := sqlerrm;
  end;
  v_res := public.fn_consignacion_cruzar_anticipo((select v::uuid from ctx16 where k = 'nota'), v_g1, 300000, 'p16-cruce', 374);
  insert into ctx16 values ('cruce_asiento', v_res ->> 'asiento_id');
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Cruce', 'Cruzar más que la obligación con el dueño / cruzar 300.000', 'excede_obligacion_con_el_dueno; cruce 300.000, saldo del anticipo 295.000',
     format('%s; monto %s; saldo %s', coalesce(v_err, 'NO RECHAZÓ'), v_res ->> 'monto', v_res ->> 'saldo_anticipo'),
     v_err like 'excede_obligacion_con_el_dueno%' and (v_res ->> 'monto')::numeric = 300000 and (v_res ->> 'saldo_anticipo')::numeric = 295000);

  -- Devolución parcial por procedimiento: base 100.000 + IVA 19.000 → retenciones 7.816; dinero 111.184.
  v_res := public.fn_anticipo_proveedor_devolver(v_g1, 111184, 'transfer', 'El consignante devuelve parte del anticipo', 'p16-dev-G1', 374, null, 'Consignación 0151',
    jsonb_build_object('causa', 'devolucion_parcial', 'base_devuelta', 100000, 'iva_devuelto', 19000, 'periodo_descuento', to_char(now(), 'YYYY-MM'),
                       'requiere_correccion', false,
                       'soportes', jsonb_build_object('documento', 'Acuerdo con el consignante 4', 'calculo', 'Parte devuelta 100.000 + IVA 19.000',
                                                      'certificado', 'Certificado corregido 16', 'norma_ica', 'Acuerdo municipal de ReteICA vigente')));
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Devolución', 'Devolución parcial del anticipo ya cruzado', '111.184 al banco y 7.816 de retenciones; saldo 176.000',
     format('dinero %s; retenciones %s; saldo %s', v_res ->> 'dinero', v_res ->> 'retencion_revertida', v_res ->> 'saldo_disponible'),
     (v_res ->> 'dinero')::numeric = 111184 and (v_res ->> 'retencion_revertida')::numeric = 7816 and (v_res ->> 'saldo_disponible')::numeric = 176000);

  -- Anular: el cruzado no se anula (anticipo_usado); un segundo anticipo que no se giró, sí.
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular_por_error(v_g1, 'Intento de anular', 'Soporte', null, 374);
  exception when others then v_err := sqlerrm;
  end;
  v_res := public.fn_anticipo_proveedor_registrar(v_g, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p16-G2', 374, 19, v_r4, v_ica, null, 'TRF-G2', null, null, true);
  v_g2 := (v_res ->> 'anticipo_id')::uuid;
  perform public.fn_anticipo_proveedor_anular_por_error(v_g2, 'Transferencia rechazada por el banco', 'Extracto con el rechazo de TRF-G2', null, 374);
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Anulación', 'Anular el anticipo cruzado / anular por error el que no se giró', 'anticipo_usado; el segundo queda cancelled',
     format('%s; %s', coalesce(v_err, 'NO RECHAZÓ'), (select status from public.supplier_advances where id = v_g2)),
     v_err = 'anticipo_usado' and (select status from public.supplier_advances where id = v_g2) = 'cancelled');
end $$;

do $$
declare
  v_g int := (select v::int from ctx16 where k = 'sup_g');
  v_c jsonb;
  v_e jsonb;
  v_txt text;
begin
  v_c := public.fn_anticipos_proveedor_conciliacion(374, v_g);
  select string_agg(format('valor %s apl %s cru %s dev %s anul %s saldo %s libros %s cuadra %s', a ->> 'valor', a ->> 'aplicado', a ->> 'cruzado', a ->> 'devuelto',
                           a ->> 'anulado', a ->> 'saldo', a ->> 'saldo_libros', a ->> 'cuadra'), ' | ') into v_txt
    from jsonb_array_elements(v_c -> 'anticipos') a;
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Conciliación', 'Por anticipo: valor − aplicado − cruzado − devuelto − anulado = saldo = libros',
     'G1: 595.000 − 0 − 300.000 − 119.000 − 0 = 176.000 = libros; G2 anulado', v_txt,
     (select bool_and((a ->> 'cuadra')::boolean) from jsonb_array_elements(v_c -> 'anticipos') a)
       and exists (select 1 from jsonb_array_elements(v_c -> 'anticipos') a where (a ->> 'cruzado')::numeric = 300000 and (a ->> 'saldo')::numeric = 176000));
  select format('saldo %s libros %s auxiliar NIT %s', p ->> 'saldo', p ->> 'saldo_libros', p ->> 'auxiliar_nit') into v_txt from jsonb_array_elements(v_c -> 'proveedores') p;
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Conciliación', 'Por proveedor: tabla = libros = auxiliar por NIT', '176.000 / 176.000 / 176.000', v_txt,
     (select bool_and((p ->> 'saldo')::numeric = 176000 and (p ->> 'saldo_libros')::numeric = 176000 and (p ->> 'auxiliar_nit')::numeric = 176000)
        from jsonb_array_elements(v_c -> 'proveedores') p));

  v_e := public.fn_estado_cuenta_proveedor(374, v_g, null, null);
  select string_agg(format('%s C %s A %s', m ->> 'tipo', m ->> 'cargo', m ->> 'abono'), ' | ') into v_txt from jsonb_array_elements(v_e -> 'movimientos') m;
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Estado', 'Estado de cuenta del consignante', 'aparece «cruce_consignacion» 300.000; saldo final −176.000 (el anticipo vivo)',
     v_txt || '; saldo final ' || (v_e ->> 'saldo_final'),
     v_txt like '%cruce_consignacion C 300000%' and (v_e ->> 'saldo_final')::numeric = -176000);

  v_c := public.fn_certificado_retenciones_proveedor(374, v_g, current_date - 1, current_date + 1);
  insert into r16 (caso, verificacion, esperado, obtenido, ok) values
    ('Certificado', 'Certificado del consignante', '39.080 (G1) + 7.816 (G2) − 7.816 (anulación) − 7.816 (devolución) = 31.264',
     (v_c -> 'totales')::text, (v_c -> 'totales' ->> 'retenido')::numeric = 31264);
end $$;

reset role;
insert into r16 (caso, verificacion, esperado, obtenido, ok)
select 'Obligación', 'Obligación con el dueño (28151001) después del cruce', '500.000 − 300.000 = 200.000 (acreedora)',
       coalesce(sum(l.credit - l.debit), 0)::text, coalesce(sum(l.credit - l.debit), 0) = 200000
  from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
 where e.organization_id = 374 and l.account_code = '28151001';
insert into r16 (caso, verificacion, esperado, obtenido, ok)
select 'Retenciones', 'Certificado = libros 236x del NIT del consignante', '31.264 = 31.264',
       format('certificado %s; libros %s', c.v, l.v), c.v = 31264 and l.v = 31264
  from (select sum(f.valor) as v from public.fn_retenciones_practicadas_filas(374, now() - interval '1 day', now() + interval '1 day', null,
                                                                            (select v::int from ctx16 where k = 'sup_g')) f) c,
       (select sum(l.credit - l.debit) as v from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
         where e.organization_id = 374 and l.tercero_nit = '900000007' and left(l.account_code, 3) = '236') l;
insert into r16 (caso, verificacion, esperado, obtenido, ok)
select 'Cruce', 'Asiento del cruce (121000): D 28151001 / C 13300501 y NIT del consignante en la línea del anticipo',
       'D 28151001 300.000 · C 13300501 300.000 con tercero 900000007',
       string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc),
       bool_and(l.account_code <> '13300501' or l.tercero_nit = '900000007')
  from public.journal_lines l where l.journal_entry_id = (select v::int from ctx16 where k = 'cruce_asiento');
set constraints all immediate;
insert into r16 (caso, verificacion, esperado, obtenido, ok)
select 'Cuadre', 'Asientos de la prueba (cuadre de la base)', 'todos cuadran',
       format('%s asientos (%s); cuadran %s', count(*), string_agg(distinct je.source, ', '), bool_and(t.d = t.c)), bool_and(t.d = t.c)
  from public.journal_entries je
  join (select journal_entry_id, sum(debit) d, sum(credit) c from public.journal_lines group by 1) t on t.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx16 where k = 'max_je')
   and je.source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund', 'reversal', 'consignment_advance_crossing');

select n, caso, ok, verificacion, obtenido from r16 order by n;

rollback;
