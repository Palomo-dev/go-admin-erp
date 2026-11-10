-- Pruebas en seco 22 · Consignación, ronda 4 del Contador (RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md, «Consignación»):
-- retención practicada reconocida cuando ocurre (sin esperar el certificado) y separada de la estimada; asiento de la
-- retención de la operación (del dueño) y de la remuneración (del intermediario) sin duplicar saldos; el certificado solo
-- concilia; anular la liquidación no cierra los pendientes de ventas o comisiones vigentes; calidades acreditadas con los
-- criterios de anticipos (O-15 sin verificar, agente de reteIVA del art. 437-2); comisión contra la 281510 solo
-- compensable y, si no, derecho por cobrar. Casos que pasan y casos que deben bloquear.
-- Fecha: 2026-11-09 · Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585), operada por su usuario miembro.
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- CARGA ejecuta, completas y exactas (md5 comprobado), las migraciones SIN APLICAR en orden de versión. Lo que la org 374
-- no tiene (cuentas 911520, 2815xx, 4135xx, 1380xx, 1305xx; mandantes y compradores con su RUT; productos; regla
-- municipal de ReteICA; facturas en borrador y su causación por cuenta del dueño, emulada con D cartera / C 281510) se
-- crea como administrador dentro de la transacción. Resultado: 22_consignacion_ronda4_retenciones_y_comision.resultado.txt

begin;
-- El día de la prueba es el de la organización (America/Bogota): current_date no depende de la hora UTC de la corrida.
set local timezone to 'America/Bogota';

-- ════ AYUDAS (solo esta sesión) ════════════════════════════════════════════════════════════════════════════
create temp table r (n serial primary key, prueba text default current_setting('dry.prueba', true), caso text, verificacion text, esperado text,
                     obtenido text, ok boolean);
create temp table bitacora (n serial primary key, prueba text default current_setting('dry.prueba', true), linea text);
grant all on r, bitacora to authenticated;
grant usage on sequence r_n_seq, bitacora_n_seq to authenticated;
create function pg_temp.log(m text) returns void language sql as $$ insert into bitacora (linea) values (m) $$;
create function pg_temp.chk(caso text, esperado text, obtenido text) returns void language sql as $$
  insert into r (caso, verificacion, esperado, obtenido, ok) values (split_part(caso, ' ', 1), caso, esperado, obtenido, coalesce(obtenido = esperado, false))
$$;
-- Ejecuta q y espera un error cuyo mensaje empiece por «esperado».
create function pg_temp.err(caso text, esperado text, q text) returns void language plpgsql as $$
begin
  execute q;
  perform pg_temp.chk(caso, esperado, 'sin error');
exception when others then
  perform pg_temp.chk(caso, esperado, case when sqlerrm like esperado || '%' then esperado else sqlerrm end);
end $$;
create function pg_temp.mover(o integer, b integer, p integer, d text, q numeric, s text, sid text default null) returns jsonb language plpgsql
  security definer set search_path = public, pg_temp as $$
begin
  return public.fn_inv_int_mover(o, b, p, null, d, q, case when d = 'in' then 0 end, s, coalesce(sid, gen_random_uuid()::text), 'prueba en seco', auth.uid(), '{}'::jsonb);
end $$;
-- Retenciones de una liquidación que NO son «no aplica»: ámbito.clase.grupo=estado[:valor].
create function pg_temp.ret(liq uuid) returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return (select string_agg(w.scope || '.' || w.class || '.' || w.payer_group || '=' || w.status || coalesce(':' || coalesce(w.practiced_amount, w.amount)::text, ''),
                            ', ' order by w.scope, w.class, w.payer_group)
            from public.consignment_settlement_withholdings w where w.settlement_id = liq and w.status <> 'no_aplica');
end $$;
grant execute on function pg_temp.log(text), pg_temp.chk(text, text, text), pg_temp.err(text, text, text) to authenticated;
grant execute on function pg_temp.mover(integer, integer, integer, text, numeric, text, text), pg_temp.ret(uuid) to authenticated;

-- ════ CARGA: las migraciones SIN APLICAR, COMPLETAS y EXACTAS, en orden de versión ════════════════════════════
-- Cada archivo se subió antes, por trozos, a objetos grandes de Postgres (cada trozo verificado por md5 contra el archivo
-- local). Aquí se ubican por el md5 de cada trozo, se concatenan, se comprueba el md5 del archivo COMPLETO contra el del
-- repositorio y se ejecuta tal cual. Nada queda escrito: la corrida termina con una excepción (= rollback).
select set_config('dry.prueba', 'carga', true);
create temp table carga (n int, archivo text, md5 text, partes text[]);
insert into carga values
  (1, '20261108120500_organization_links', '6a5a3ead2fe311fdde4b7d5c0376c12b', array['74b48fc99c0a3a3b010413db8031e675', '948d61028cb34db074d08c12eca2edaf', '6332a1eaafa850e04255cbe1d4c790db']),
  (2, '20261108121000_consignaciones', 'f52c0de6f53856fc9dd38bb5b3403809', array['d2aa4c6725204badc5f14793d54b0da0', 'a8b60ed8327e8bdf4a09a5749389bd0e', 'cb2daffb5506b6d1048c13cb0ef67cde', '2e060edf17d826a0260b29ebe268bb9c', '06c7eacadb8c897ab3d6c5e06763122a', '5f884aa2747373581edd9337f2f14b93', 'bbe2fedfe558459e35157acd8b4c26e9', 'ee0b275499b8c7e42d518f63a10cc084', 'ad04a330664bc68fa5729cf07f710a3d', '88fd3775f77f5c1fa74aa39768fee054', '0691b64cb50fdcf7c490b376aadfbb04', 'cecd90018184f26d34a949cb1cdcf644', '48cdef4e260198970fc32c7289e2e1c3', 'e12361f82a962fc091621ec670802cec', '7ef44ccb92192d743db7bec3bc3849e3']),
  (3, '20261108140500_responsabilidades_fiscales_en', '4b00bf10bf99ff2a97e2e89ff0480811', array['4b00bf10bf99ff2a97e2e89ff0480811']),
  (4, '20261108160000_tributario_catalogo_rut_y_codigos_fe', '85fd17321a7e85d85a58916cb2f84c95', array['a293fbc0aadf7b33b72d1c5d4d824fad', '3a0fbf1e5d8f8cace37a3ef193763cd9']),
  (5, '20261108160500_tributario_perfil_renta_iva', '1d80345bde9c6d9fd378bc10e8c43a5e', array['6b459b8cf3f78457b04c2786625a08ac', '6b925b7a8d549f72fa09598adee2d903', '80df677e5aa15aa7e4c27c91b322beb7']),
  (6, '20261108165000_tarifas_precision_exacta', '1ec6641bdf74dfc15163d0753982309f', array['1ec6641bdf74dfc15163d0753982309f']),
  (7, '20261108170000_anticipos_proveedores_contador', '0c5079355e6c5ab55dd6b14e1e484cea', array['63f6b0c4aca0275295b79fd9c41924f8', 'eb4a4e52a897e7c01209d3725650d0fb', 'd345b3fd61afb1cbdfbb05fc69fe9bac', 'ac7cfef25367cf788f2de7b5698e617f', '45ca6efa4c336768edce64fd6816428d', '651917641ef050acf2afdc2826885dea', '896232d306be97fa362590dbd56de655', '6e27c30d840c1dcdc6c84165526c334d', '8f13afc4f5934c7fd9f778f91a792d99', '521574537319cfb8c790a4af21099265', 'fecada69cc621c6c66475858378a7697', '03f599837ceb3cbaf18680c4781b0421', '8df4262b2efb2ba15458f77e87758b3d', '1f285ec7b28e57d8bbd1f39846705459', '4ca38155375d59428529d5dc111ed302', '0240018dc5742894c78d3cc94f65ccb4']);
do $carga$
declare m record; s text;
begin
  create temp table lo_md5 as select l.oid, md5(lo_get(l.oid)) as md5 from pg_largeobject_metadata l;
  for m in select * from carga order by n loop
    select convert_from(string_agg(lo_get((select x.oid from lo_md5 x where x.md5 = u.p order by x.oid limit 1)), ''::bytea order by u.i), 'UTF8') into s
      from unnest(m.partes) with ordinality u(p, i);
    perform pg_temp.chk('md5 ' || m.archivo, m.md5, md5(s));
    if s is null or md5(s) <> m.md5 then raise exception 'carga: md5 de % distinto', m.archivo; end if;
    execute s;
  end loop;
end $carga$;


-- ════ CUERPO: 22.sql ════
-- ════ 22 · Consignación, ronda 4: retención practicada sin esperar el certificado; asiento al reconocerla y al conciliar;
--      anular no cierra pendientes vigentes; calidades acreditadas con los criterios de anticipos; comisión contra la
--      281510 solo compensable (si no, derecho por cobrar) ════
select set_config('dry.prueba', '22', true);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s22$
declare
  m1 int; m2 int; b1 uuid; b2 uuid; b3 uuid; p1 int; p2 int; p3 int; ica uuid; sa uuid; sc uuid; sn2 uuid; inv1 uuid; inv2 uuid; inv3 uuid;
  v_pg3 uuid;
  u uuid := (select owner_user_id from organizations where id = 374);
begin
  insert into chart_of_accounts (organization_id, account_code, name, type, centro_costo_modo, parent_code, es_movimiento)
  select 374, x.* from (values
   ('911520', 'En consignación', 'order', 'no_aplica', '9115', true),
   ('281510', 'Venta por cuenta de terceros', 'liability', 'no_aplica', '2815', false),
   ('28151001', 'Dueño consignante 1', 'liability', 'no_aplica', '281510', true),
   ('28151002', 'Dueño consignante 2', 'liability', 'no_aplica', '281510', true),
   ('413512', 'Venta a cambio de retribución', 'income', 'no_aplica', '4135', false),
   ('41351201', 'Remuneración por consignación', 'income', 'no_aplica', '413512', true),
   ('138095', 'Otras cuentas por cobrar', 'asset', 'no_aplica', '1380', false),
   ('13809501', 'Remuneración por cobrar a dueños consignantes', 'asset', 'no_aplica', '138095', true),
   ('130505', 'Clientes nacionales', 'asset', 'no_aplica', '1305', false),
   ('13050501', 'Clientes nacionales (prueba)', 'asset', 'no_aplica', '130505', true)) x(c, n, t, m, p, e)
   where not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.c);
  -- El intermediario (374): ordinario, responsable de IVA, no agente de retención, sin autorretención ni SIMPLE.
  if exists (select 1 from organization_tax_profiles where organization_id = 374) then
    update organization_tax_profiles set regimen = 'ordinario', responsabilidades = array['O-48'], requiere_revision = false, agente_retencion = false,
           agente_retencion_iva = null, gran_contribuyente = null where organization_id = 374;
  else
    insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion) values (374, '2026-01-01', 'ordinario', array['O-48'], false);
  end if;
  -- La sucursal vende en Bogotá (territorialidad del reteICA de la operación y de la remuneración).
  update branches set municipality_id = '47ae0b2d-e894-453e-9680-f519c1e3f118' where id = 585;
  insert into reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, norma, vigente_desde)
  values (374, '47ae0b2d-e894-453e-9680-f519c1e3f118', 'Comercio por cuenta de terceros (prueba 22)', 4.14, 'Acuerdo municipal de ReteICA (prueba 22)', '2026-01-01') returning id into ica;
  -- Mandantes: M1 gran contribuyente y responsable de IVA; M2 con O-15 en el RUT (autorretenedor SIN verificar).
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 22-1', '900000221', 'company', array['O-13', 'O-48']) returning id into m1;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 22-2', '900000222', 'company', array['O-15', 'O-48']) returning id into m2;
  -- Compradores: B1 agente según el RUT (O-13); B2 con datos pero sin calidad de agente; B3 agente de reteIVA ACREDITADO (art. 437-2).
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (374, 'Comprador', '22 Uno', array['O-13']) returning id into b1;
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (374, 'Comprador', '22 Dos', array['R-99-PN']) returning id into b2;
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (374, 'Comprador', '22 Tres', array['O-48']) returning id into b3;
  insert into products (organization_id, sku, name) values (374, 'P22-1', 'Consignado 22-1') returning id into p1;
  insert into products (organization_id, sku, name) values (374, 'P22-2', 'Consignado 22-2') returning id into p2;
  insert into products (organization_id, sku, name) values (374, 'P22-3', 'Consignado 22-3') returning id into p3;
  -- Ventas del POS en borrador (solo para saber el comprador) y facturas en borrador con su línea.
  insert into sales (organization_id, branch_id, user_id, status, customer_id) values (374, 585, u, 'draft', b1) returning id into sa;
  insert into sales (organization_id, branch_id, user_id, status, customer_id) values (374, 585, u, 'draft', b2) returning id into sc;
  insert into sales (organization_id, branch_id, user_id, status, customer_id) values (374, 585, u, 'draft', b1) returning id into sn2;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv1;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv2;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b3) returning id into inv3;
  insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line, product_id) values
    (inv1, 'sale', inv1, 'Consignado 22-3', 1, 80000, 0, 80000, p3),
    (inv2, 'sale', inv2, 'Consignado 22-3', 1, 80000, 0, 80000, p3),
    (inv3, 'sale', inv3, 'Consignado 22-1', 1, 60000, 19, 71400, p1);
  -- Causación de las facturas por cuenta del dueño (se emula: la emisión real exige facturación electrónica): D cartera / C 281510.
  perform fn_create_journal_entry(p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Factura de prueba 22-1',
    p_source := 'invoice_sales', p_source_id := inv1::text, p_debit_account := '13050501', p_credit_account := '28151001', p_amount := 80000,
    p_created_by := u, p_fact_key := 'prueba22:inv1');
  perform fn_create_journal_entry(p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Factura de prueba 22-3',
    p_source := 'invoice_sales', p_source_id := inv3::text, p_debit_account := '13050501', p_credit_account := '28151001', p_amount := 60000,
    p_created_by := u, p_fact_key := 'prueba22:inv3');
  perform set_config('d22.m1', m1::text, true); perform set_config('d22.m2', m2::text, true);
  perform set_config('d22.b1', b1::text, true); perform set_config('d22.b2', b2::text, true); perform set_config('d22.b3', b3::text, true);
  perform set_config('d22.p1', p1::text, true); perform set_config('d22.p2', p2::text, true); perform set_config('d22.p3', p3::text, true);
  perform set_config('d22.sa', sa::text, true); perform set_config('d22.sc', sc::text, true); perform set_config('d22.sn2', sn2::text, true);
  perform set_config('d22.inv1', inv1::text, true); perform set_config('d22.inv2', inv2::text, true); perform set_config('d22.inv3', inv3::text, true);
  -- Ronda 5: el cobro de la factura 22-3 (el comprador paga 71.400 − reteIVA 1.710 = 69.690); la retención se registra con él.
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv3::text, 'transfer', 69690, 'COP', 'completed', u, now()) returning id into v_pg3;
  perform set_config('d22.pg3', v_pg3::text, true);
  perform set_config('d22.ica', ica::text, true);
  perform set_config('d22.rete4', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'RETE_4'), true);
  perform set_config('d22.rcom', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'RETE_11_COMISION'), true);
  perform set_config('d22.riva', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'RETEIVA_15'), true);
  perform set_config('d22.icaot', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'ICA_0.966'), true);
  perform set_config('d22.u', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('d22.je0', (select coalesce(max(id), 0)::text from journal_entries where organization_id = 374), true);
end $s22$;
-- Lo que el dueño debe por la comisión de una nota (función interna; la prueba la lee como administrador).
create function pg_temp.cxc(n uuid) returns numeric language sql security definer set search_path = public, pg_temp as $$ select public.fn_consignacion_cxc_dueno_saldo(n) $$;
grant execute on function pg_temp.cxc(uuid) to authenticated;
select set_config('request.jwt.claims', current_setting('d22.u'), true);
set local role authenticated;

do $k22$
declare
  o int := 374; b int := 585; m1 int := current_setting('d22.m1')::int; m2 int := current_setting('d22.m2')::int;
  p1 int := current_setting('d22.p1')::int; p2 int := current_setting('d22.p2')::int; p3 int := current_setting('d22.p3')::int;
  t jsonb; r jsonb; n1 uuid; n2 uuid; n3 uuid; q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,%s,%L::jsonb,%L,%s)';
begin
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',false,
    'obligacion_dueno','venta','compensacion_remuneracion',true,
    'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001',
    -- Ronda 5 (C.Co. art. 1277): orden de aplicación y liquidación por escrito, términos obligatorios del contrato recibido.
    'orden_aplicacion',jsonb_build_array('remuneracion','gastos_reembolsables','anticipos','derechos_frente_al_dueno'),
    'liquidacion_escrita',jsonb_build_object('medio','correo_electronico','plazo_dias',5));
  -- K · Cuentas y reglas (ronda 4)
  perform fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201');
  perform pg_temp.err('K1 recibir sin cuenta por cobrar al dueño', 'sin_cuenta_cobro_remuneracion',
    format(q, m1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000)), 15, t, 'k22-k1', o));
  perform pg_temp.err('K2 cuenta por cobrar de título', 'cuenta_cobro_remuneracion_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L,%L)', o, '911520', '9405', '41351201', '1380'));
  perform pg_temp.err('K3 retención sufrida fuera de 1355', 'cuenta_retencion_sufrida_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L,%L,%L::jsonb)', o, '911520', '9405', '41351201', '13809501', '{"retefuente":"23652501"}'));
  r := fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201', '13809501', '{"retefuente":"13551501","reteiva":"13551701","reteica":"13551801"}'::jsonb);
  perform pg_temp.chk('K4 cuentas de la ronda 4', '13809501/13551501/13551701/13551801',
    (r->>'cobro_remuneracion') || '/' || (r->'retenciones_sufridas'->>'retefuente') || '/' || (r->'retenciones_sufridas'->>'reteiva') || '/' || (r->'retenciones_sufridas'->>'reteica'));
  perform pg_temp.err('K5 reteICA con un impuesto de compras en vez de la regla municipal', 'regla_retencion_invalida', format('select fn_consignacion_configurar_retenciones(%s,%L::jsonb)', o,
    jsonb_build_object('operacion', jsonb_build_object('reteica', current_setting('d22.icaot')), 'remuneracion', '{}'::jsonb)));
  r := fn_consignacion_configurar_retenciones(o, jsonb_build_object(
         'operacion', jsonb_build_object('retefuente', current_setting('d22.rete4'), 'reteiva', current_setting('d22.riva'), 'reteica', current_setting('d22.ica')),
         'remuneracion', jsonb_build_object('retefuente', current_setting('d22.rcom'), 'reteica', current_setting('d22.ica'))));
  perform pg_temp.chk('K6 reteICA de la operación: la regla municipal (la misma de anticipos)', current_setting('d22.ica'), r->'operacion'->>'reteica');
  perform pg_temp.err('K7 recibida en mandato sin pactar la compensación', 'terminos_invalidos',
    format(q, m1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000)), 15, t - 'compensacion_remuneracion', 'k22-k7', o));
  r := fn_consignacion_recibir(m1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000)), 15, t, 'k22-n1', o, null);
  n1 := r->>'nota_id';
  r := fn_consignacion_recibir(m2, b, jsonb_build_array(jsonb_build_object('product_id',p2,'qty',5,'precio',50000,'costo_acreditado',30000)), 15,
         t || '{"compensacion_remuneracion":false,"cuenta_recaudo":"28151002"}', 'k22-n2', o, null);
  n2 := r->>'nota_id';
  r := fn_consignacion_recibir(m1, b, jsonb_build_array(jsonb_build_object('product_id',p3,'qty',5,'precio',80000,'costo_acreditado',50000)), 10,
         t || '{"obligacion_dueno":"cobro"}', 'k22-n3', o, null);
  n3 := r->>'nota_id';
  perform set_config('d22.n1', n1::text, true); perform set_config('d22.n2', n2::text, true); perform set_config('d22.n3', n3::text, true);
  perform pg_temp.chk('K8 notas con la compensación pactada (o no) y la cuenta por cobrar', 'true/13809501 · false/13809501 · true/13809501',
    (select string_agg(commission_offset_agreed::text || '/' || owner_receivable_account_code, ' · ' order by number) from consignment_notes where id in (n1, n2, n3)));
end $k22$;

-- ── Punto 5: la comisión contra la 281510 solo con obligación real y compensación pactada; si no, derecho por cobrar ─
do $c22$
declare
  o int := 374; b int := 585; p1 int := current_setting('d22.p1')::int; p2 int := current_setting('d22.p2')::int; p3 int := current_setting('d22.p3')::int;
  n1 uuid := current_setting('d22.n1')::uuid; n2 uuid := current_setting('d22.n2')::uuid; n3 uuid := current_setting('d22.n3')::uuid;
  r jsonb;
begin
  -- N1 (compensación pactada, obligación al vender): 4 ventas de 60.000 (B1, consumidor final, B2 y factura con IVA a B3).
  perform pg_temp.mover(o, b, p1, 'out', 1, 'sale', current_setting('d22.sa'));
  perform pg_temp.mover(o, b, p1, 'out', 1, 'sale');
  perform pg_temp.mover(o, b, p1, 'out', 1, 'sale', current_setting('d22.sc'));
  perform pg_temp.mover(o, b, p1, 'out', 1, 'invoice_sale', current_setting('d22.inv3'));
  perform pg_temp.chk('C1 N1: remuneración de 9.000 por venta contra la 281510 (compensación pactada y obligación nacida); nada por cobrar', '36000.00/0.00',
    (select sum(remuneration_amount)::text || '/' || sum(remuneration_receivable)::text from consignment_allocations where note_id = n1 and remuneration_recognized));
  -- N2 (compensación NO pactada): la comisión es un derecho por cobrar al dueño.
  perform pg_temp.mover(o, b, p2, 'out', 1, 'sale');
  perform pg_temp.chk('C2 N2 sin compensación pactada: D 13809501 / C 41351201 por 7.500 (no se debita la 281510)', '13809501 D 7500 · 41351201 C 7500',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.source = 'consignment_sale' and e.fact_key like 'consignment_sale_rem:%:cxc'
        and e.source_id in (select a.id::text from consignment_allocations a where a.note_id = n2)));
  perform pg_temp.err('C3 compensar en una nota sin compensación pactada', 'compensacion_no_pactada', format('select fn_consignacion_compensar_remuneracion(%L,7500,%L,%s)', n2, 'k22-c3', o));
  perform pg_temp.mover(o, b, p2, 'in', 1, 'return');
  perform pg_temp.chk('C4 devolución: la remuneración por cobrar se reversa contra la cuenta por cobrar (no contra la 281510)', '0.00',
    pg_temp.cxc(n2)::text);
  perform pg_temp.mover(o, b, p2, 'out', 1, 'sale', current_setting('d22.sn2'));
  -- N3 (compensación pactada, obligación AL COBRO): una factura anulada y otra sin cobrar.
  perform pg_temp.mover(o, b, p3, 'out', 1, 'invoice_sale', current_setting('d22.inv2'));
  perform pg_temp.chk('C5 factura sin cobrar con obligación al cobro: la comisión no es compensable todavía (por cobrar 8.000) y queda el pendiente de la venta', '8000.00/1',
    pg_temp.cxc(n3)::text || '/' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_obligacion_al_cobro'
      and f.resolved_at is null and f.source_id in (select a.id::text from consignment_allocations a where a.note_id = n3)));
  perform pg_temp.mover(o, b, p3, 'in', 1, 'invoice_void', current_setting('d22.inv2'));
  perform pg_temp.chk('C6 se anula la factura (el HECHO): su pendiente de venta se cierra y la remuneración por cobrar se reversa', '0.00/0/venta_revertida',
    pg_temp.cxc(n3)::text || '/' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_obligacion_al_cobro'
      and f.resolved_at is null and f.source_id in (select a.id::text from consignment_allocations a where a.note_id = n3))
    || '/' || (select max(f.resolution) from journal_entry_failures f where f.reason = 'consignacion_obligacion_al_cobro'
                and f.source_id in (select a.id::text from consignment_allocations a where a.note_id = n3)));
  perform pg_temp.mover(o, b, p3, 'out', 1, 'invoice_sale', current_setting('d22.inv1'));
  perform pg_temp.err('C7 compensar más que lo que el dueño debe por la comisión', 'excede_remuneracion_por_cobrar', format('select fn_consignacion_compensar_remuneracion(%L,9000,%L,%s)', n3, 'k22-c7', o));
  r := fn_consignacion_compensar_remuneracion(n3, 8000, 'k22-c8', o);
  perform pg_temp.chk('C8 compensación posterior, pactada, contra la obligación EXIGIBLE del mismo dueño (ventas ya nacidas): D 28151001 / C 13809501', '8000.00/0.00/13809501',
    (r->>'monto') || '/' || (r->>'por_cobrar_restante') || '/' ||
    (select l.account_code from journal_lines l where l.journal_entry_id = (r->>'asiento_id')::int and l.credit > 0));
  perform pg_temp.err('C9 lo facturado «al cobro» y no cobrado no se liquida al dueño', 'sin_ventas_por_liquidar',
    format('select fn_consignacion_recibida_liquidar(%L,null,false,null,%L,%s)', n3, 'k22-c9', o));
end $c22$;
-- ── Puntos 1, 2 y 7: retención practicada vs estimada; asientos; calidades acreditadas ──────────────────────────────
do $r22$
declare
  o int := 374; n1 uuid := current_setting('d22.n1')::uuid; n2 uuid := current_setting('d22.n2')::uuid; n3 uuid := current_setting('d22.n3')::uuid;
  r jsonb; l1 uuid; l1b uuid; l2 uuid; w uuid; wop uuid; abiertos int;
begin
  perform pg_temp.err('Q1 agente de reteIVA sin su fundamento (art. 437-2)', 'fundamento_agente_reteiva_obligatorio',
    format('select fn_cliente_calidad_tributaria_guardar(%s,%L,%L,%L,%L::text[],%L::date)', o, current_setting('d22.b3'), 'agente_retencion_iva', 'Resolución de designación', '{}', '2026-01-01'));
  perform fn_cliente_calidad_tributaria_guardar(o, current_setting('d22.b3')::uuid, 'agente_retencion_iva', 'Certificación de entidad pública', '{}', '2026-01-01', null,
                                                null, null, null, null, 'Art. 437-2 num. 1 E.T.: entidad estatal');
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k22-l1', o); l1 := r->>'liquidacion_id';
  perform set_config('d22.l1', l1::text, true);
  perform pg_temp.chk('Q2 L1 (operación, por comprador): B1 agente según su RUT; B2 y B3 sin calidad de agente de renta acreditada; B3 agente de reteIVA ACREDITADO (no es 09 ni 13)',
    'operacion.retefuente.agente=estimada:2400.00, operacion.retefuente.por_acreditar=pendiente, operacion.reteica.por_acreditar=pendiente, operacion.reteiva.agente=estimada:1710.00, '
    || 'remuneracion.retefuente.dueno=estimada:3960.00, remuneracion.reteica.dueno=pendiente, remuneracion.reteiva.dueno=pendiente', pg_temp.ret(l1));
  select id into w from consignment_settlement_withholdings where settlement_id = l1 and scope = 'remuneracion' and class = 'retefuente';
  select id into wop from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente';
  perform pg_temp.chk('Q3 lo estimado no se asienta', '0', (select count(*)::text from journal_entries e where e.source = 'consignment_withholding' and e.source_id in (w::text, wop::text)));
  perform pg_temp.err('R1 el certificado no crea el hecho: conciliar una estimada con valor', 'retencion_no_reconocida',
    format('select fn_consignacion_conciliar_retencion(%L,3960,%L,%s)', w, 'Certificado del mandante 22-1', o));
  perform pg_temp.err('R2 la retención de la operación se practica al pagar una factura de la liquidación', 'factura_de_la_liquidacion_obligatoria',
    format('select fn_consignacion_retencion_practicada(%L,2400,60000,current_date,%L,%s)', wop, 'Comprobante del pago del comprador', o));
  r := fn_consignacion_retencion_practicada(w, 3960, 36000, current_date, 'Comprobante de pago del mandante 22-1 con la retención en la fuente', o);
  perform pg_temp.chk('R3 practicada sobre la comisión (ya compensada): D 13551501 / C 28151001; sin esperar el certificado',
    '13551501 D 3960 · 28151001 C 3960 · por cobrar true',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l where l.journal_entry_id = (r->>'asiento_id')::int) || ' · por cobrar ' || ((r->>'por_cobrar_dueno')::numeric = 0)::text);
  perform pg_temp.chk('R4 queda por conciliar con el certificado', '1', (select count(*)::text from journal_entry_failures f
     where f.reason = 'consignacion_retencion_certificado_pendiente' and f.source_id = 'cert:' || w::text and f.resolved_at is null));
  -- Punto 3: anular la liquidación (el DOCUMENTO) no cierra los pendientes de las ventas ni de la comisión.
  select count(*) into abiertos from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolved_at is null
     and (f.source_id = l1::text or f.source_id like l1::text || ':%');
  r := fn_consignacion_recibida_anular_liquidacion(l1, 'Se rehace la liquidación', o);
  perform pg_temp.chk('A1 anular L1: siguen abiertos todos sus pendientes; la retención practicada y su asiento se conservan',
    abiertos::text || '/practicada/1', (r->>'pendientes_vigentes') || '/' || (select status from consignment_settlement_withholdings where id = w)
      || '/' || (select count(*)::text from journal_entries e where e.source = 'consignment_withholding' and e.source_id = w::text));
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k22-l1b', o); l1b := r->>'liquidacion_id';
  perform pg_temp.chk('A2 la nueva liquidación lleva la retención practicada (no la vuelve a estimar)', '1/practicada/' || l1::text,
    (select count(*)::text from consignment_settlement_withholdings where settlement_id = l1b and scope = 'remuneracion' and class = 'retefuente')
    || '/' || (select status || '/' || carried_from::text from consignment_settlement_withholdings where id = w and settlement_id = l1b));
  perform pg_temp.chk('A3 los pendientes de L1 se cierran al quedar sus ventas cubiertas por L1b', '0/' || abiertos::text,
    (select count(*)::text from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolved_at is null
       and (f.source_id = l1::text or f.source_id like l1::text || ':%')) || '/'
    || (select count(*)::text from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolution = 'reliquidada:' || l1b::text));
  r := fn_consignacion_conciliar_retencion(w, 3960, 'Certificado anual del mandante 22-1', o);
  perform pg_temp.chk('R5 conciliar la practicada con el certificado: sin diferencia y cierra el pendiente', '0.00/0',
    (r->>'diferencia') || '/' || (select count(*)::text from journal_entry_failures f where f.source_id = 'cert:' || w::text and f.resolved_at is null));
  -- Punto 7: el O-15 sin resolución verificada no excluye; con la resolución y el concepto cubierto, sí.
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k22-l2', o); l2 := r->>'liquidacion_id';
  perform pg_temp.chk('Q4 mandante con O-15 sin verificar: la retención de la operación queda pendiente (no se excluye)', 'pendiente/autorretencion_sin_verificar',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = l2 and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente'));
  perform pg_temp.chk('Q5 el dueño sin calidad de agente de renta acreditada (sin 07 ni 13): la de la remuneración queda por acreditar', 'pendiente/calidad_agente_retencion_por_acreditar',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = l2 and scope = 'remuneracion' and class = 'retefuente'));
  perform fn_proveedor_calidad_tributaria_guardar(o, current_setting('d22.m2')::int, 'autorretenedor_renta', 'Resolución DIAN verificada', array['RETE_4'], '2026-01-01', null,
                                                  '2026-01-15', 'rut-mandante-22-2.pdf', '000123', '2025-12-01', 'Autorretención en la fuente por compras y servicios');
  perform fn_consignacion_recibida_anular_liquidacion(l2, 'Se verificó la autorretención', o);
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k22-l2b', o);
  perform pg_temp.chk('Q6 verificada la resolución y su alcance (concepto RETE_4): no aplica', 'no_aplica/autorretenedor_autorizado_concepto',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = (r->>'liquidacion_id')::uuid and scope = 'operacion'
       and class = 'retefuente' and payer_group = 'agente'));
  -- Puntos 1 y 2 en la operación: el comprador B3 (agente de reteIVA acreditado) retiene el IVA al pagar la factura 22-3.
  select id into wop from consignment_settlement_withholdings where settlement_id = l1b and scope = 'operacion' and class = 'reteiva' and payer_group = 'agente'
     and status = 'estimada';
  r := fn_consignacion_retencion_practicada(wop, 1710, 11400, current_date, 'Comprobante del pago de la factura 22-3 con reteIVA', o, current_setting('d22.inv3')::uuid,
                                            current_setting('d22.pg3')::uuid);
  perform pg_temp.chk('R6 retención del comprador sobre la venta por cuenta del dueño: D 28151001 / C cartera de la factura; la 1355 del intermediario no se toca',
    '28151001 D 1710 · 13050501 C 1710 · pendiente de cartera 1',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l where l.journal_entry_id = (r->>'asiento_id')::int)
    || ' · pendiente de cartera ' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = wop::text));
  perform pg_temp.err('R7 la misma retención con otro valor', 'retencion_ya_practicada',
    format('select fn_consignacion_retencion_practicada(%L,1500,11400,current_date,%L,%s,%L)', wop, 'Otro comprobante', o, current_setting('d22.inv3')));
  r := fn_consignacion_conciliar_retencion(wop, 1500, 'Certificado del comprador 22-3', o);
  perform pg_temp.chk('R8 el certificado difiere de lo practicado: queda la diferencia como pendiente (no se ajusta solo)', '-210.00/1',
    (r->>'diferencia') || '/' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_retencion_diferencia_certificado' and f.source_id = 'dif:' || wop::text));
end $r22$;

reset role;
do $z22$
begin
  perform pg_temp.chk('Z0 obligación exigible = libros − lo facturado «al cobro» sin cobrar (80.000)', '80000.00',
    ((select sum(l.credit - l.debit) from journal_lines l join journal_entries e on e.id = l.journal_entry_id
       where e.organization_id = 374 and l.account_code = '28151001') - fn_consignacion_saldo_dueno(374, '28151001'))::text);
  perform pg_temp.chk('Z1 obligación con el dueño 1 (28151001) por los movimientos de la prueba (sin las causaciones emuladas de las facturas): 3 recaudos POS 180.000 − comisión compensada 36.000 + retención sobre la comisión 3.960 − compensación 8.000 − reteIVA del comprador 1.710', '138250.00',
    (select sum(l.credit - l.debit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.organization_id = 374 and l.account_code = '28151001' and e.id > current_setting('d22.je0')::int));
  perform pg_temp.chk('Z2 retención sufrida del intermediario (13551501) = la practicada sobre su comisión', '3960.00',
    (select sum(l.debit - l.credit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.organization_id = 374 and l.account_code = '13551501' and e.id > current_setting('d22.je0')::int));
  perform pg_temp.chk('Z3 ninguna retención pendiente o «no aplica» trae valor; ninguna estimada tiene asiento', '0/0',
    (select count(*)::text from consignment_settlement_withholdings where status in ('pendiente', 'no_aplica') and amount is not null) || '/'
    || (select count(*)::text from consignment_settlement_withholdings w where w.status = 'estimada' and w.journal_entry_id is not null));
  perform pg_temp.chk('Z4 asientos de la prueba 22 descuadrados', '0',
    (select count(*)::text from journal_entries e where e.organization_id = 374 and e.id > current_setting('d22.je0')::int
       and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
end $z22$;

-- ════ FINAL: el resultado sale en el mensaje de esta excepción, que además revierte todo ═══════════════════════════
reset role;
do $fin$
declare t text; v text; b text;
begin
  select string_agg(x.s, ' · ' order by x.p) into t
    from (select prueba p, format('%s: %s de %s ok', prueba, count(*) filter (where ok), count(*)) s from r group by prueba) x;
  select string_agg(format('%s | %s | %s | %s | %s', n, prueba, verificacion, coalesce(obtenido, 'null'),
                           case when ok then 'ok' else 'FALLA · esperado: ' || coalesce(esperado, 'null') end), chr(10) order by n) into v from r;
  select string_agg(prueba || ' › ' || linea, chr(10) order by n) into b from bitacora;
  raise exception '%', 'PRUEBA EN SECO (se revierte) · ' || coalesce(t, '-') || chr(10) || coalesce(v, '') || chr(10) || coalesce(b, '');
end $fin$;
