-- Pruebas en seco 26 · Consignación, ronda 5 del Contador (RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md, respuestas 10 y 11):
-- la retención de la OPERACIÓN (D 281510 del dueño / C cartera del cliente, Concepto DIAN 13277 de 2025) se registra con
-- el COBRO de la factura en que el comprador la practicó, en su misma fecha, y su abono a la factura queda en ese mismo
-- momento, sin superar el saldo de la factura (la cartera no queda inflada ni se abona de más); el certificado queda
-- pendiente de soporte. El contrato recibido en mandato fija el orden de aplicación de lo recaudado y la liquidación por
-- escrito (C.Co. art. 1277). Casos que pasan y casos que deben bloquear.
-- Fecha: 2026-11-09 · Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585), operada por su usuario dueño.
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- CARGA ejecuta, completas y exactas (md5 comprobado), las migraciones SIN APLICAR en orden de versión. Las facturas se
-- emiten y se cobran como administrador dentro de la transacción (sus disparadores causan la venta y la cartera).
-- Resultado: 26_consignacion_ronda5_contador.resultado.txt

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


-- ════ CUERPO: 26.sql ════
-- ════ 26 · Consignación, ronda 5: la retención de la operación se registra con el COBRO de la factura y su abono queda
--      en ese mismo momento (la cartera no queda inflada ni se abona de más; el certificado, pendiente de soporte); el
--      contrato recibido en mandato fija el orden de aplicación y la liquidación por escrito (C.Co. art. 1277) ════
select set_config('dry.prueba', '26', true);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s26$
declare
  m1 int; b1 uuid; p1 int; inv1 uuid; inv2 uuid; v_pg1 uuid; v_pg2 uuid;
  u uuid := (select owner_user_id from organizations where id = 374);
begin
  insert into chart_of_accounts (organization_id, account_code, name, type, centro_costo_modo, parent_code, es_movimiento)
  select 374, x.* from (values
   ('911520', 'En consignación', 'order', 'no_aplica', '9115', true),
   ('281510', 'Venta por cuenta de terceros', 'liability', 'no_aplica', '2815', false),
   ('28151001', 'Dueño consignante 1', 'liability', 'no_aplica', '281510', true),
   ('413512', 'Venta a cambio de retribución', 'income', 'no_aplica', '4135', false),
   ('41351201', 'Remuneración por consignación', 'income', 'no_aplica', '413512', true),
   ('138095', 'Otras cuentas por cobrar', 'asset', 'no_aplica', '1380', false),
   ('13809501', 'Remuneración por cobrar a dueños consignantes', 'asset', 'no_aplica', '138095', true)) x(c, n, t, m, p, e)
   where not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.c);
  if exists (select 1 from organization_tax_profiles where organization_id = 374) then
    update organization_tax_profiles set regimen = 'ordinario', responsabilidades = array['O-48'], requiere_revision = false, agente_retencion = false,
           agente_retencion_iva = null, gran_contribuyente = null where organization_id = 374;
  else
    insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion) values (374, '2026-01-01', 'ordinario', array['O-48'], false);
  end if;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 26-1', '900000261', 'company', array['O-13', 'O-48']) returning id into m1;
  insert into customers (organization_id, first_name, last_name) values (374, 'Comprador', '26 Uno') returning id into b1;
  insert into products (organization_id, sku, name) values (374, 'P26-1', 'Consignado 26-1') returning id into p1;
  -- Dos facturas EMITIDAS (sus disparadores causan la venta y crean la cartera) y el cobro de cada una: el comprador paga
  -- 71.400 − reteIVA 1.710 = 69.690. El saldo de cada factura queda en 1.710, que es la retención por abonar.
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv1;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv2;
  insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line, product_id) values
    (inv1, 'sale', inv1, 'Consignado 26-1', 1, 60000, 19, 71400, p1),
    (inv2, 'sale', inv2, 'Consignado 26-1', 1, 60000, 19, 71400, p1);
  update invoice_sales set status = 'issued' where id in (inv1, inv2);
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv1::text, 'transfer', 69690, 'COP', 'completed', u, now()) returning id into v_pg1;
  perform set_config('d26.pg1', v_pg1::text, true);
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv2::text, 'transfer', 69690, 'COP', 'completed', u, now()) returning id into v_pg2;
  perform set_config('d26.pg2', v_pg2::text, true);
  perform set_config('d26.m1', m1::text, true); perform set_config('d26.p1', p1::text, true);
  perform set_config('d26.inv1', inv1::text, true); perform set_config('d26.inv2', inv2::text, true);
  perform set_config('d26.u', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('d26.je0', (select coalesce(max(id), 0)::text from journal_entries where organization_id = 374), true);
end $s26$;
select set_config('request.jwt.claims', current_setting('d26.u'), true);
set local role authenticated;

-- ── N · Contrato recibido en mandato: orden de aplicación y liquidación por escrito (respuesta 11) ─────────────────
do $n26$
declare
  o int := 374; b int := 585; m1 int := current_setting('d26.m1')::int; p1 int := current_setting('d26.p1')::int;
  t jsonb; r jsonb; n1 uuid; lin jsonb; q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,15,%L::jsonb,%L,%s)';
begin
  perform fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201', '13809501',
    '{"retefuente":"13551501","reteiva":"13551701","reteica":"13551801"}'::jsonb);
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',false,
    'obligacion_dueno','venta','compensacion_remuneracion',true,
    'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001',
    'orden_aplicacion',jsonb_build_array('remuneracion','gastos_reembolsables','anticipos','derechos_frente_al_dueno'),
    'liquidacion_escrita',jsonb_build_object('medio','correo_electronico','plazo_dias',5));
  lin := jsonb_build_array(jsonb_build_object('product_id',p1,'qty',5,'precio',60000,'costo_acreditado',40000));
  perform pg_temp.err('N1 sin orden de aplicación', 'orden_aplicacion_obligatorio', format(q, m1, b, lin, t - 'orden_aplicacion', 'k26-n1', o));
  perform pg_temp.err('N2 orden con un concepto que no existe', 'terminos_invalidos', format(q, m1, b, lin, t || '{"orden_aplicacion":["remuneracion","intereses"]}', 'k26-n2', o));
  perform pg_temp.err('N3 orden con un concepto repetido', 'terminos_invalidos', format(q, m1, b, lin, t || '{"orden_aplicacion":["remuneracion","remuneracion"]}', 'k26-n3', o));
  perform pg_temp.err('N4 compensación pactada sin decir cuándo se aplica la remuneración', 'terminos_invalidos',
    format(q, m1, b, lin, t || '{"orden_aplicacion":["anticipos","gastos_reembolsables"]}', 'k26-n4', o));
  perform pg_temp.err('N5 sin liquidación por escrito', 'liquidacion_escrita_obligatoria', format(q, m1, b, lin, t - 'liquidacion_escrita', 'k26-n5', o));
  perform pg_temp.err('N6 medio de la liquidación que no es escrito', 'terminos_invalidos',
    format(q, m1, b, lin, t || '{"liquidacion_escrita":{"medio":"verbal","plazo_dias":5}}', 'k26-n6', o));
  perform pg_temp.err('N7 plazo de la liquidación por fuera de 1 a 90 días', 'terminos_invalidos',
    format(q, m1, b, lin, t || '{"liquidacion_escrita":{"medio":"correo_electronico","plazo_dias":0}}', 'k26-n7', o));
  r := fn_consignacion_recibir(m1, b, lin, 15, t, 'k26-n8', o, null); n1 := r ->> 'nota_id';
  perform set_config('d26.n1', n1::text, true);
  perform pg_temp.chk('N8 la nota guarda el orden de aplicación y la liquidación por escrito', '4 · remuneracion · correo_electronico/5',
    (select jsonb_array_length(settlement_terms -> 'orden_aplicacion')::text || ' · ' || (settlement_terms -> 'orden_aplicacion' ->> 0) || ' · '
            || (settlement_terms -> 'liquidacion_escrita' ->> 'medio') || '/' || (settlement_terms -> 'liquidacion_escrita' ->> 'plazo_dias')
       from consignment_notes where id = n1));
  perform pg_temp.chk('N9 la entregada (lado del mandante) no exige estos términos de la recibida', 'null',
    coalesce((fn_consignacion_terminos(t - 'valoracion' - 'cuenta_recaudo' - 'orden_aplicacion' - 'liquidacion_escrita', 'entregada') -> 'liquidacion_terminos')::text, 'null'));
  perform pg_temp.mover(o, b, p1, 'out', 1, 'invoice_sale', current_setting('d26.inv1'));
end $n26$;
reset role;
-- La venta (porción vendida) ocurrió hace dos días; se simula fechándola como administrador.
update consignment_allocations set created_at = now() - interval '2 days' where source_id = current_setting('d26.inv1');
select set_config('request.jwt.claims', current_setting('d26.u'), true);
set local role authenticated;

-- ── C · Retención de la operación: con el cobro, abono a la factura en ese momento (respuesta 10) ────────────────────
do $c26$
declare
  o int := 374; n1 uuid := current_setting('d26.n1')::uuid; inv1 uuid := current_setting('d26.inv1')::uuid; inv2 uuid := current_setting('d26.inv2')::uuid;
  pg1 uuid := current_setting('d26.pg1')::uuid; pg2 uuid := current_setting('d26.pg2')::uuid;
  hoy date := (now() at time zone 'America/Bogota')::date; r jsonb; l1 uuid; w uuid; w2 uuid;
  q text := 'select fn_consignacion_retencion_practicada(%L, %s, 11400, %L::date, %L, 374, %L, %L)';
begin
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k26-l1', o); l1 := r ->> 'liquidacion_id';
  perform pg_temp.chk('N10 la liquidación por escrito lleva el orden de aplicación y su forma', 'remuneracion · correo_electronico/5',
    (r -> 'terminos_liquidacion' -> 'orden_aplicacion' ->> 0) || ' · ' || (r -> 'terminos_liquidacion' -> 'liquidacion_escrita' ->> 'medio') || '/'
      || (r -> 'terminos_liquidacion' -> 'liquidacion_escrita' ->> 'plazo_dias'));
  select id into w from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'reteiva' order by payer_group limit 1;
  select id into w2 from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'reteica' order by payer_group limit 1;
  perform pg_temp.chk('C0 saldo de la factura después del cobro (lo que queda es la retención)', '1710.00 · partial',
    (select balance::text || ' · ' || status from invoice_sales where id = inv1));
  perform pg_temp.err('C1 la retención de la operación sin el cobro en que se practicó', 'cobro_obligatorio',
    format('select fn_consignacion_retencion_practicada(%L, 1710, 11400, %L::date, %L, 374, %L)', w, hoy, 'Comprobante del pago de la factura 26-1', inv1));
  perform pg_temp.err('C2 con el cobro de OTRA factura', 'cobro_de_otra_factura', format(q, w, 1710, hoy, 'Comprobante del pago de la factura 26-1', inv1, pg2));
  perform pg_temp.err('C3 en una fecha distinta de la del cobro', 'fecha_distinta_del_cobro', format(q, w, 1710, hoy - 1, 'Comprobante del pago de la factura 26-1', inv1, pg1));
  perform pg_temp.err('C4 por más de lo que la factura todavía debe (abonaría de más la cartera)', 'retencion_excede_saldo_factura',
    format(q, w, 2000, hoy, 'Comprobante del pago de la factura 26-1', inv1, pg1));
  r := fn_consignacion_retencion_practicada(w, 1710, 11400, hoy, 'Comprobante del pago de la factura 26-1 con reteIVA', o, inv1, pg1);
  perform pg_temp.chk('C5 con su cobro: D 28151001 / C cartera de la factura (Concepto DIAN 13277 de 2025); abono por aplicar; saldo real exigible 0',
    '28151001 D 1710 · cartera de la factura C 1710 · por_aplicar · 1710.00 · 0.00 · pendiente_de_soporte',
    -- La cartera es la cuenta deudora con que se causó ESA factura (1305 o su auxiliar, según el plan de la organización).
    (select string_agg(case when l.debit > 0 then l.account_code || ' D ' || round(l.debit)
                            when l.account_code = (select jl.account_code from journal_entries e join journal_lines jl on jl.journal_entry_id = e.id
                                                    where e.source = 'invoice_sales' and e.source_id = inv1::text and jl.debit > 0 and jl.account_code like '13%'
                                                    order by jl.debit desc, jl.id limit 1)
                            then 'cartera de la factura C ' || round(l.credit) else l.account_code || ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l where l.journal_entry_id = (r ->> 'asiento_id')::int)
    || ' · ' || (r -> 'abono_factura' ->> 'estado') || ' · ' || (r -> 'abono_factura' ->> 'saldo_factura') || ' · ' || (r -> 'abono_factura' ->> 'saldo_real_exigible')
    || ' · ' || (r ->> 'certificado'));
  perform pg_temp.chk('C6 el abono queda ligado al cobro y a su fecha', '1 · 1710.00 · true · true',
    (select count(*)::text || ' · ' || max(x.amount)::text || ' · ' || bool_and(x.payment_id = pg1)::text || ' · ' || bool_and(x.applied_on = hoy)::text
       from consignment_withholding_receivable_applications x where x.withholding_id = w));
  perform pg_temp.chk('C7 saldo real exigible de la factura: saldo 1.710 − abono por aplicar 1.710 = 0', '1710.00 · 1710.00 · 0.00',
    (select c.saldo_factura::text || ' · ' || c.retenciones_por_aplicar::text || ' · ' || c.saldo_real_exigible::text
       from fn_consignacion_cartera_retenciones(374) c where c.invoice_id = inv1));
  perform pg_temp.chk('C8 la cartera operativa no se escribe a mano: sigue al saldo de la factura', '1710.00 · 1710.00',
    (select i.balance::text || ' · ' || (select ar.balance::text from accounts_receivable ar where ar.invoice_id = inv1 limit 1) from invoice_sales i where i.id = inv1));
  perform pg_temp.chk('C9 pendientes: la cartera por aplicar y el certificado pendiente de soporte', '1 · 1',
    (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = w::text and f.resolved_at is null)
    || ' · ' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_retencion_certificado_pendiente' and f.source_id = 'cert:' || w::text
                   and f.resolved_at is null and f.detail like '%pendiente de soporte%'));
  perform pg_temp.err('C10 otra retención sobre la misma factura que ya no tiene saldo (1.710 por aplicar + 100)', 'retencion_excede_saldo_factura',
    format(q, w2, 100, hoy, 'Comprobante del pago de la factura 26-1 con reteICA', inv1, pg1));
end $c26$;
reset role;
do $z26$
begin
  perform pg_temp.chk('Z1 asientos de la prueba 26 descuadrados', '0',
    (select count(*)::text from journal_entries e where e.organization_id = 374 and e.id > current_setting('d26.je0')::int
       and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z2 ningún abono por retención sin su cobro', '0',
    (select count(*)::text from consignment_withholding_receivable_applications x
      where not exists (select 1 from payments p where p.id = x.payment_id and p.status = 'completed')));
end $z26$;

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
