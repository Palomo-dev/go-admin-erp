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
-- Ronda 6: la carga incluye también la REVERSIÓN de 20261110100000 (md5 comprobado; no se ejecuta aquí): la prueba 30 la
-- ejecuta con pg_temp.archivo() para comparar el antes y el después de la migración de cartera.
select set_config('dry.prueba', 'carga', true);
create temp table carga (n int, archivo text, md5 text, partes text[], ejecutar boolean not null default true);
insert into carga values
  (1, '20261108120500_organization_links', '6a5a3ead2fe311fdde4b7d5c0376c12b', array['5109dc74bfb22d5ffde0bd5119083948', '313dc95b4be4f01a8900800066208718', '0f6069791dcc69d824c98cdd47546cb2', '1ecf55d6204ed45ee7dcce800a978121', '7f11c99a31097e46956d6e2e33c0db00'], true),
  (2, '20261108121000_consignaciones', '9179856af861a2a886152c1ebbb4f2fd', array['579f75fc1e92b38b2b1f4ea19d4b1fa6', '864bef823a4496f24e108ad4981db42c', '72d2385b395c7e9dd1dc5c6032ef3277', '5a35fd933b1a2348da3d4324f2d6ac17', '859f900e1826c32931a8baa3a259d1bb', 'f71e2367ee68b50f50c67fc8d9791fb0', 'b5e49a7e9a6e59292bd71489806a6db6', 'df08899458b86dbbcf55ba37e45bbc9c', '0e062609ee896e98f7d3ee0ef79cfff1', '76f34a79bf144795349ed10765848830', '9537b8fab5a8ab1f3e78d03886d9312d', 'f704bc7befb13437e1df30fd6ac79c78', '1e279e622c1e88d474e33737481e99cf', '5305fcb5c45d29ebe5f048f8d041784e', 'ebc688770ba8e7710bee7a2e268de630', '94d01c520bab85d770ed3dfea761584f', '13a15bb30ed14719547643188d872e3a', '18966036b5511cabc44e20371fdcd698', '11fb74aad972153151a058fa7d600cb6', 'bc385d3ea2ecaa9dbbf94a218c30a6b0', '5a6c99ea4761748c01a48d177c6b2617', 'ba36e9d32ff2f5c8b971c77e3fc5dcfb', '6bfc4398dedca5728985e4675c6a4162', 'd4d596c4afd080af0e20d1fea4970fe1', '7b636c1742e468914fdae41571210e1e', '2188edd551a9e4e313a6e8c1a5b5a14e', '06d7417ca507e61777c61aca8041a845', '24de3b6303317d2089ec67fa67a202c3', '354ddf6cd5b98cad205563daedc21512', 'a20064c1af6ad15c1702c16ed0758db7', '97593f81f2abb5b4c710b886c074c6a5', '0b18ca5c55b9539f54b4d197824e255e', '5b5785f0a2efa414709d646bc1044d69', '00c4c7f92cc63b225cd68763ba5a7c42'], true),
  (3, '20261108140500_responsabilidades_fiscales_en', '4b00bf10bf99ff2a97e2e89ff0480811', array['4b00bf10bf99ff2a97e2e89ff0480811'], true),
  (4, '20261108160000_tributario_catalogo_rut_y_codigos_fe', '85fd17321a7e85d85a58916cb2f84c95', array['073694ed10dc13551713b22882d9df29', '24758060f07bafe1d08ca69dc1140711', '41a022a7561eba7e33541b8b28286f2a', '7f6a28ff314cc54ecd3c9ddf372c14a5'], true),
  (5, '20261108160500_tributario_perfil_renta_iva', 'a3e330a9cf7b01c6da242b7d3f3a2b8c', array['99bb0669f9646611d6352f576de1f1c0', '520f8894ebf94a7d02099c1c494add6c', 'b1354bbb7fadfa6ed6ac4813b3cf7211', '3cabb2e54b1a1b9989e51568f0c0b984', 'b6fb2babb2f81972472693aed03ce692', 'df51d513c83ebcd4fe7a52b1bba5eb22', 'c4754fd94a0c8a2fa8cd7f5937aab4b2'], true),
  (6, '20261108165000_tarifas_precision_exacta', '1ec6641bdf74dfc15163d0753982309f', array['1ec6641bdf74dfc15163d0753982309f'], true),
  (7, '20261108170000_anticipos_proveedores_contador', '3fe4535a0afe9dc1fa58ece1dea5363d', array['2617ef747a5a86f6f7d67b4776ac5fed', '0aec17209b712c10b0feec04558e98a9', '34515a271978e1ace524650d88c120a4', '420750c888f2a834aea442374dd639d0', '76980510327d35896d5d35205b4371f1', '0e9a186bc0fd1059f5ab10bbb56bb369', '5066eb547385ae35f0a4380a089e97a3', '1632ed67ff3a8a283469ea02e182df81', 'fd8ce1b8fef9ab4639007ab01fba1005', '1deacd0839bf97ffe59c33272fcd4b7b', 'caae20072bdb65479c2a0b88d1d974a8', 'f4d9b79fb5d5e89e602221830c21db42', '620706882cda1f58f4c2f2f89918ed85', 'c350dc6eac443d66ac57d744f07e0528', 'a3497ec627ef1bbaf6310bb6a8a2bdf8', '36b4b3b6c63c5d37dece875b4bae2ca5', '7e327881f13289caab792d7f08e28807', '331ba38d88be78c3f824861a1adefed3', '39be8ea12435262ddbd52671d38a87b6', '8d834422a9358eb309b445fc4b5f4251', '04f867c60650cc4bf0b3af797d328b8f', 'b773a93531cbbb8dce2290e5b97d2468', 'f6426db2148141069def2fe3d80f51d2', '6f918b18c78b6efddcaa7da713b1caa5', 'b93523fff25958d22bbc298b015cc8b8', '704cdcf565e823a0729a23c683036741', '2edc3fa427d777f2b995510c70ed7dbc', 'c733176c26222cbb48c304eb139931fc', '66176eaa0ac7e0869ea588609e6ebdc3', '43d5122336f666f6a03eeef132584cb1', '4ea6088f55dc4469f68e1a9255264a4f', 'd054cae948bd9dc0b2ef1bd5b9ce611d', '4b8bf9af304452488c58d63fda6aa99f', '2bc9323b09ca4898f7be5d259b8f6fa0', '027c290eb36d7e2b12d957d20ee61203', '3b7323e5890cc2ec32ceb80147f0b0ad', '29801ecc7fcd542f9528e0218476e426'], true),
  (8, '20261110100000_cartera_abono_retencion_consignacion', '9f4ade93850013b4cacd3c795ef8d823', array['d0177e7df5143cfda0ff8af9f2f43088', '1ee9a519320426baeb09df9fd741bfc2', '82335f07f27d92afa231859b81a4b61d'], true),
  (9, '20261110100000_cartera_abono_retencion_consignacion_rollback', 'a333e61071756df3e48e31cf5bc66355', array['468d230a1daafef7de276c2321673880', '7b636c1742e468914fdae41571210e1e', '49c81fd240f3b12fdc13d6f84cff8bd8'], false);
do $carga$
declare m record; s text;
begin
  create temp table lo_md5 as select l.oid, md5(lo_get(l.oid)) as md5 from pg_largeobject_metadata l;
  for m in select * from carga order by n loop
    select convert_from(string_agg(lo_get((select x.oid from lo_md5 x where x.md5 = u.p order by x.oid limit 1)), ''::bytea order by u.i), 'UTF8') into s
      from unnest(m.partes) with ordinality u(p, i);
    perform pg_temp.chk('md5 ' || m.archivo, m.md5, md5(s));
    if s is null or md5(s) <> m.md5 then raise exception 'carga: md5 de % distinto', m.archivo; end if;
    if m.ejecutar then
      execute s;
    end if;
  end loop;
end $carga$;
-- Texto exacto de un archivo de la carga (md5 comprobado otra vez), para ejecutarlo dentro de una prueba.
create function pg_temp.archivo(a text) returns text language plpgsql as $$
declare m record; s text;
begin
  select * into m from carga where archivo = a;
  select convert_from(string_agg(lo_get((select x.oid from lo_md5 x where x.md5 = u.p order by x.oid limit 1)), ''::bytea order by u.i), 'UTF8') into s
    from unnest(m.partes) with ordinality u(p, i);
  if s is null or md5(s) <> m.md5 then raise exception 'archivo: md5 de % distinto', a; end if;
  return s;
end $$;


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
  -- Ronda 6 (respuesta 10): con 20261110100000 cargada el abono nace APLICADO y la factura queda saldada (antes: por_aplicar · 1710.00).
  perform pg_temp.chk('C5 con su cobro: D 28151001 / C cartera de la factura (Concepto DIAN 13277 de 2025); abono aplicado: factura saldada',
    '28151001 D 1710 · cartera de la factura C 1710 · aplicada · 0.00 · 0.00 · pendiente_de_soporte',
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
  -- Ronda 6: ya no queda nada «por aplicar»; el saldo de la factura ES el saldo real exigible (antes: 1710.00 · 1710.00 · 0.00).
  perform pg_temp.chk('C7 nada queda por aplicar: el saldo de la factura es el exigible', 'sin abonos por aplicar',
    coalesce((select c.saldo_factura::text || ' · ' || c.retenciones_por_aplicar::text || ' · ' || c.saldo_real_exigible::text
                from fn_consignacion_cartera_retenciones(374) c where c.invoice_id = inv1), 'sin abonos por aplicar'));
  perform pg_temp.chk('C8 la cartera operativa no se escribe a mano: sigue al saldo de la factura (ronda 6: 0 y 0)', '0.00 · 0.00',
    (select i.balance::text || ' · ' || (select ar.balance::text from accounts_receivable ar where ar.invoice_id = inv1 limit 1) from invoice_sales i where i.id = inv1));
  perform pg_temp.chk('C9 pendientes: ninguno de cartera por aplicar (ronda 6) y el certificado pendiente de soporte', '0 · 1',
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
