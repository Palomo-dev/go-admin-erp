-- Pruebas en seco 14 · Consignación en dos sentidos, «Ronda 2 del Contador», de punta a punta, REEJECUTADA el 2026-11-09
-- con los archivos EXACTOS de la ronda 5. Proyecto taqjemqjtumhwptchcxk · org 374 (sucursal 585) y, SOLO para la parte
-- «entre organizaciones» (I1–I6, que la ronda 4 no volvió a correr y el Contador lo marcó), la org 138 (sucursal 113)
-- como consignante que entrega; 374 recibe, acepta y liquida. 20261108120500 (vínculos) no cambió. Lo que cambió por
-- criterio ya aceptado en las rondas 3, 4 y 5 (se anota en el resultado): «al liquidar» ya no existe (la nota 2 devenga
-- al cumplirse una obligación posterior documentada); la liquidación no registra remuneración (no hay contra-asiento al
-- anularla); compensación pactada y cuenta por cobrar al dueño obligatorias; los pendientes de impuestos «por
-- determinar» de la ronda 2 son ahora retenciones por ámbito; ronda 5: el contrato recibido en mandato fija el orden de
-- aplicación y la liquidación por escrito, y al aceptar una nota de otra organización el receptor declara esos términos.
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- Resultado: 14_consignaciones_ronda2_punta_a_punta.resultado.txt

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


-- ════ CUERPO: 14.sql ════
select set_config('dry.prueba', '14', true);
reset role;
-- ── Datos de apoyo (administrador; se revierten) ─────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $f$
declare s1 int; s138 int; p1 int; p2 int; p3 int; p4 int; p5 int; c137 uuid; c138 uuid; a1 uuid; a2 uuid; a3 uuid;
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
   ('133005', 'A proveedores', 'asset', 'no_aplica', '1330', false),
   ('13300501', 'Anticipos a proveedores nacionales', 'asset', 'no_aplica', '133005', true)) x(c, n, t, m, p, e)
   where not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.c);
  -- Perfil tributario del intermediario (374): ordinario, responsable de IVA, sin autorretención ni SIMPLE.
  if exists (select 1 from organization_tax_profiles where organization_id = 374) then
    update organization_tax_profiles set regimen = 'ordinario', responsabilidades = array['O-48'], requiere_revision = false, agente_retencion = false,
           agente_retencion_iva = null, gran_contribuyente = null where organization_id = 374;
  else
    insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades) values (374, '2026-01-01', 'ordinario', array['O-48']);
  end if;  insert into suppliers (organization_id, name, supplier_type) values (374, 'Consignante prueba seco', 'company') returning id into s1;
  insert into suppliers (organization_id, name, supplier_type) values (374, 'Organización vinculada prueba seco', 'company') returning id into s138;
  insert into products (organization_id, sku, name) values (374, 'SECO-P1', 'Prueba seco 1') returning id into p1;
  insert into products (organization_id, sku, name) values (374, 'SECO-P2', 'Prueba seco 2') returning id into p2;
  insert into products (organization_id, sku, name) values (374, 'SECO-P3', 'Prueba seco propio') returning id into p3;
  insert into products (organization_id, sku, name) values (374, 'SECO-P5', 'Prueba seco vinculado') returning id into p5;
  insert into customers (organization_id, first_name, last_name) values (374, 'Cliente', 'Seco') returning id into c137;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s1, 100000, 100000, 'COP', '13300501') returning id into a1;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s138, 50000, 50000, 'COP', '13300501') returning id into a2;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s1, 1000000, 1000000, 'COP', '13300501') returning id into a3;
  perform fn_inv_int_mover(374, 585, p3, null, 'in', 5, 20000, 'initial', 'seco', 'seco', null, '{}'::jsonb);
  -- Ronda 5: la parte entre organizaciones vuelve a correr; la 138 es la consignante que entrega (sus datos también se revierten).
  insert into products (organization_id, sku, name) values (138, 'SECO-P4', 'Prueba seco del consignante') returning id into p4;
  insert into customers (organization_id, first_name, last_name) values (138, 'Consignatario', 'Vinculado') returning id into c138;
  perform fn_inv_int_mover(138, 113, p4, null, 'in', 10, 30000, 'initial', 'seco', 'seco', null, '{}'::jsonb);
  perform set_config('dry.u138', json_build_object('sub', (select owner_user_id from organizations where id = 138), 'role', 'authenticated')::text, true);
  perform set_config('dry.p4', p4::text, true); perform set_config('dry.p4uuid', (select uuid::text from products where id = p4), true);
  perform set_config('dry.c138', c138::text, true);
  perform set_config('dry.u374', json_build_object('sub', (select owner_user_id from organizations where id = 374), 'role', 'authenticated')::text, true);
  perform set_config('dry.s1', s1::text, true); perform set_config('dry.s138', s138::text, true);
  perform set_config('dry.p1', p1::text, true); perform set_config('dry.p2', p2::text, true); perform set_config('dry.p3', p3::text, true);
  perform set_config('dry.p5', p5::text, true);
  perform set_config('dry.c137', c137::text, true);
  perform set_config('dry.a1', a1::text, true); perform set_config('dry.a2', a2::text, true); perform set_config('dry.a3', a3::text, true);
end $f$;

-- ── Organización 374: recibida (mandato) y entregada, como su dueño ──────────
select set_config('request.jwt.claims', current_setting('dry.u374'), true);
set local role authenticated;
do $t$
declare
  o int := 374; b int := 585;
  s1 int := current_setting('dry.s1')::int; p1 int := current_setting('dry.p1')::int; p2 int := current_setting('dry.p2')::int;
  p3 int := current_setting('dry.p3')::int; c137 uuid := current_setting('dry.c137')::uuid;
  a1 uuid := current_setting('dry.a1')::uuid; a2 uuid := current_setting('dry.a2')::uuid; a3 uuid := current_setting('dry.a3')::uuid;
  t jsonb; t2 jsonb; te jsonb; lin jsonb; r jsonb; n1 uuid; n2 uuid; l1 uuid; liq1 uuid; liq2 uuid; liq4 uuid; ne uuid;
  q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,15,%L::jsonb,%L,%s)';
begin
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',true,
    'obligacion_dueno','venta','compensacion_remuneracion',true,'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001',
    -- Ronda 5 (C.Co. art. 1277): orden de aplicación y liquidación por escrito, términos obligatorios del contrato recibido.
    'orden_aplicacion',jsonb_build_array('remuneracion','gastos_reembolsables','anticipos','derechos_frente_al_dueno'),
    'liquidacion_escrita',jsonb_build_object('medio','correo_electronico','plazo_dias',5));
  lin := jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000));

  -- Punto 1: contrapartida del grupo 94 DEFINIDA
  perform pg_temp.err('T1 recibir sin contrapartida 94 definida', 'sin_cuenta_contra_orden', format(q, s1, b, lin, t, 'k-t1', o));
  perform pg_temp.err('T2a contrapartida 9905', 'cuenta_contra_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L)', o, '911520', '9905', '41351201'));
  perform pg_temp.err('T2b contrapartida 9115 (no es del grupo 94)', 'cuenta_contra_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L)', o, '911520', '9115', '41351201'));
  r := fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201');
  perform pg_temp.chk('T2c contrapartida definida', '9405', r->>'contra');
  -- Ronda 4: sin la cuenta por cobrar al dueño (comisión no compensable) no se recibe.
  perform pg_temp.err('T2c2 recibir sin cuenta por cobrar al dueño', 'sin_cuenta_cobro_remuneracion', format(q, s1, b, lin, t, 'k-t2c2', o));
  r := fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201', '13809501',
         '{"retefuente":"13551501","reteiva":"13551701","reteica":"13551801"}'::jsonb);
  perform pg_temp.chk('T2c3 cuenta por cobrar al dueño y retención sufrida', '13809501/13551501', (r->>'cobro_remuneracion') || '/' || (r->'retenciones_sufridas'->>'retefuente'));
  perform pg_temp.err('T3k recibida en mandato sin pactar la compensación de la remuneración', 'terminos_invalidos', format(q, s1, b, lin, t - 'compensacion_remuneracion', 'k-t3k', o));

  -- Punto 2: contrato sin defaults
  perform pg_temp.err('T3a sin modalidad', 'clasificacion_obligatoria', format(q, s1, b, lin, t - 'contrato', 'k-t3a', o));
  perform pg_temp.err('T3b sin condición contable', 'condicion_contable_obligatoria', format(q, s1, b, lin, t - 'condicion', 'k-t3b', o));
  perform pg_temp.err('T3c sin valoración', 'valoracion_obligatoria', format(q, s1, b, lin, t - 'valoracion', 'k-t3c', o));
  perform pg_temp.err('T3d compra real', 'compra_real_usa_factura', format(q, s1, b, lin, t || '{"contrato":"compra"}', 'k-t3d', o));
  perform pg_temp.err('T3e estimatorio (punto 3)', 'estimatorio_bloqueado_438_455', format(q, s1, b, lin, t || '{"contrato":"estimatorio","condicion":"principal"}', 'k-t3e', o));
  perform pg_temp.err('T3f mandato como principal', 'terminos_invalidos', format(q, s1, b, lin, t || '{"condicion":"principal"}', 'k-t3f', o));
  perform pg_temp.err('T3g sin reconocimiento', 'terminos_invalidos', format(q, s1, b, lin, t - 'reconocimiento', 'k-t3g', o));
  perform pg_temp.err('T3h sin costo acreditado', 'costo_acreditado_obligatorio', format(q, s1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000)), t, 'k-t3h', o));

  -- Recibir (custodia por costo acreditado y por valor convenido)
  r := fn_consignacion_recibir(s1, b, lin, 15, t, 'k-n1', o, null); n1 := r->>'nota_id';
  perform pg_temp.chk('T4a N1 custodia (10 × costo acreditado 40.000)', '400000.00', r->>'custodia');
  r := fn_consignacion_recibir(s1, b, lin, 15, t, 'k-n1', o, null);
  perform pg_temp.chk('T4b recibir repetido es idempotente', 'true', r->>'repetida');
  t2 := t || jsonb_build_object('valoracion','valor_convenido','remuneracion_modo','precio_liquidacion','reconocimiento','obligacion_posterior','obligacion_posterior','Entregar e instalar el equipo en la sede del comprador','factura_remuneracion',false);
  r := fn_consignacion_recibir(s1, b, jsonb_build_array(jsonb_build_object('product_id',p2,'qty',5,'precio',50000,'precio_liquidacion',42000)), 0, t2, 'k-n2', o, null);
  n2 := r->>'nota_id';
  perform pg_temp.chk('T4c N2 custodia (5 × valor convenido 50.000)', '250000.00', r->>'custodia');

  -- Venta por el kardex (remuneración al vender)
  perform pg_temp.mover(o, b, p1, 'out', 3, 'sale');
  select id into l1 from consignment_note_lines where note_id = n1;
  perform pg_temp.chk('T5 vendido en la línea', '3.000', (select qty_sold::text from consignment_note_lines where id = l1));

  -- Punto 7: faltante sin gasto
  perform pg_temp.err('T6a novedad sin evidencia', 'evidencia_obligatoria', format('select fn_consignacion_registrar_novedad(%L,%L,%L,1,%L,%L,null,%L,%s)', n1, l1, 'faltante', 'por_determinar', 'x', 'k-nv0', o));
  r := fn_consignacion_registrar_novedad(n1, l1, 'faltante', 1, 'por_determinar', 'Conteo físico: falta una unidad', 'Por definir con el dueño', 'k-nv1', o);
  perform pg_temp.chk('T6b faltante sale de custodia', '40000.00', r->>'custodia');

  -- Liquidar
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k-liq1', o); liq1 := r->>'liquidacion_id';
  perform pg_temp.chk('T7 liq1 venta / remuneración / dueño', '180000.00/27000.00/153000.00', (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno'));

  -- Devolución de lo ya liquidado → derecho frente al dueño; nueva venta
  perform pg_temp.mover(o, b, p1, 'in', 1, 'return');
  perform pg_temp.mover(o, b, p1, 'out', 2, 'sale');
  perform pg_temp.err('T9a descontar derechos sin acuerdo', 'acuerdo_obligatorio', format('select fn_consignacion_recibida_liquidar(%L,null,true,null,%L,%s)', n1, 'k-liq2x', o));
  r := fn_consignacion_recibida_liquidar(n1, null, true, 'Acuerdo escrito con el dueño', 'k-liq2', o); liq2 := r->>'liquidacion_id';
  perform pg_temp.chk('T9b liq2 con acuerdo: venta / dueño / derechos', '60000.00/51000.00/60000.00', (r->>'venta') || '/' || (r->>'dueno') || '/' || (r->>'derechos_descontados'));
  perform pg_temp.err('T9c anular liq1 (no es la última; corrección seq)', 'liquidacion_no_es_la_ultima', format('select fn_consignacion_recibida_anular_liquidacion(%L,%L,%s)', liq1, 'Prueba de anulación', o));
  r := fn_consignacion_recibida_anular_liquidacion(liq2, 'Se pactó no descontar', o);
  perform pg_temp.chk('T9d anular liq2 (la última; remuneración al vender: sin asiento)', 'anulada/null', (r->>'estado') || '/' || coalesce(r->>'asiento_id', 'null'));
  perform pg_temp.chk('T9d2 anular no cierra los pendientes tributarios de esas ventas (ronda 4)', 'true', ((r->>'pendientes_vigentes')::int > 0)::text);
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k-liq3', o);
  perform pg_temp.chk('T9e liq3 sin descontar: venta / dueño / derechos', '120000.00/102000.00/0.00', (r->>'venta') || '/' || (r->>'dueno') || '/' || (r->>'derechos_descontados'));

  -- Ronda 3 (aceptada por el Contador): «al liquidar» ya no existe; la remuneración se devenga al cumplirse la obligación posterior.
  perform pg_temp.mover(o, b, p2, 'out', 2, 'sale');
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k-liq4', o); liq4 := r->>'liquidacion_id';
  perform pg_temp.chk('T11a liq4 (precio de liquidación 42.000): venta / remuneración / dueño', '100000.00/16000.00/84000.00', (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno'));
  r := fn_consignacion_recibida_anular_liquidacion(liq4, 'Prueba de contra-asiento', o);
  perform pg_temp.chk('T11b anular liq4: la liquidación no registró remuneración, no hay contra-asiento (ronda 3)', 'anulada/null', (r->>'estado') || '/' || coalesce(r->>'asiento_id', 'null'));
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k-liq5', o);
  perform pg_temp.chk('T11c liq5: remuneración / dueño', '16000.00/84000.00', (r->>'remuneracion') || '/' || (r->>'dueno'));

  -- Punto 6: anticipo cruzado con la obligación real (281510)
  perform pg_temp.err('T10a anticipo de otro consignante', 'anticipo_no_encontrado', format('select fn_consignacion_cruzar_anticipo(%L,%L,1000,%L,%s)', n1, a2, 'k-cr0', o));
  perform pg_temp.err('T10b más que el saldo del anticipo', 'anticipo_sin_saldo', format('select fn_consignacion_cruzar_anticipo(%L,%L,200000,%L,%s)', n1, a1, 'k-cr1', o));
  perform pg_temp.err('T10c más que la obligación con el dueño', 'excede_obligacion_con_el_dueno', format('select fn_consignacion_cruzar_anticipo(%L,%L,900000,%L,%s)', n1, a3, 'k-cr2', o));
  r := fn_consignacion_cruzar_anticipo(n1, a1, 50000, 'k-cr3', o);
  perform pg_temp.chk('T10d cruce: monto / saldo del anticipo', '50000.00/50000.00', (r->>'monto') || '/' || (r->>'saldo_anticipo'));

  -- Punto 8: entregada sin 1465 ni asiento
  te := t - 'valoracion' - 'cuenta_recaudo' - 'orden_aplicacion' - 'liquidacion_escrita';
  r := fn_consignacion_entregar(c137, b, jsonb_build_array(jsonb_build_object('product_id',p3,'qty',2,'precio',35000)), 10, te, 'k-e1', o, null, null);
  ne := r->>'nota_id';
  perform set_config('dry.ne', ne::text, true);
  perform pg_temp.chk('T12a entregada: costo identificado / ubicación', '40000.00/En poder de Cliente Seco', (r->>'costo') || '/' || (r->>'ubicacion'));
  perform pg_temp.err('T12b liquidar el mandato del lado del dueño', 'liquidacion_mandante_pendiente', format('select fn_consignacion_liquidar(%L,%L::jsonb,%L,%s)', ne,
    jsonb_build_array(jsonb_build_object('linea_id', (select id from consignment_note_lines where note_id = ne), 'vendido', 1, 'precio', 35000)), 'k-el1', o));
  perform pg_temp.err('T12c entregar estimatorio', 'estimatorio_bloqueado_438_455', format('select fn_consignacion_entregar(%L,%s,%L::jsonb,10,%L::jsonb,%L,%s)', c137, b,
    jsonb_build_array(jsonb_build_object('product_id',p3,'qty',1)), te || '{"contrato":"estimatorio","condicion":"principal"}', 'k-e2', o));
  perform pg_temp.err('T12d entregar producto ajeno', 'producto_ajeno', format('select fn_consignacion_entregar(%L,%s,%L::jsonb,10,%L::jsonb,%L,%s)', c137, b,
    jsonb_build_array(jsonb_build_object('product_id',p1,'qty',1)), te, 'k-e3', o));
  perform pg_temp.err('T12e entregar sin clasificación', 'clasificacion_obligatoria', format('select fn_consignacion_entregar(%L,%s,%L::jsonb,10,%L::jsonb,%L,%s)', c137, b,
    jsonb_build_array(jsonb_build_object('product_id',p3,'qty',1)), te - 'contrato', 'k-e4', o));
  perform pg_temp.err('T12f operar la organización 138 con la sesión de la 374', 'Acceso denegado', format(q, s1, 113, lin, t, 'k-x', 138));
  perform pg_temp.err('T12g el hash del token no se puede leer', 'permission denied', 'select token_hash from public.organization_links');
end $t$;

-- ── Entre organizaciones (ronda 5: se vuelve a correr): 138 entrega, 374 recibe, acepta y liquida ─────────────
do $i$
declare
  u374 text := current_setting('dry.u374'); u138 text := current_setting('dry.u138');
  c138 uuid := current_setting('dry.c138')::uuid; s138 int := current_setting('dry.s138')::int;
  p4 int := current_setting('dry.p4')::int; p5 int := current_setting('dry.p5')::int; p4uuid text := current_setting('dry.p4uuid');
  r jsonb; tok text; doc uuid; doc2 uuid; n3 uuid; te2 jsonb; mapeo jsonb; tc jsonb;
begin
  perform set_config('request.jwt.claims', u138, true);
  r := fn_vinculo_invitar(138, array['consignacion'], null, c138, null, 7); tok := r->>'token';
  perform set_config('request.jwt.claims', u374, true);
  r := fn_vinculo_aceptar(tok, 374, s138, null);
  perform pg_temp.chk('I1 vínculo aceptado', 'activo', r->>'estado');
  perform set_config('request.jwt.claims', u138, true);
  te2 := jsonb_build_object('contrato','intermediacion','condicion','agente','precio_modo','fijo','remuneracion_modo','porcentaje',
    'base_comision','precio_venta','reconocimiento','al_vender','factura_remuneracion',false,'obligacion_dueno','venta',
    'riesgos',jsonb_build_object('devoluciones','consignatario','perdidas','consignatario','gastos','consignatario'));
  r := fn_consignacion_entregar(c138, 113, jsonb_build_array(jsonb_build_object('product_id',p4,'qty',4,'precio',70000)), 10, te2, 'k-ie1', 138, null, null);
  doc := r->>'documento_compartido_id';
  perform pg_temp.chk('I2 entregada de 138: costo / compartida', '120000.00/true', (r->>'costo') || '/' || (doc is not null)::text);
  perform pg_temp.chk('I2b RLS: 138 no ve notas de 374', '0', (select count(*)::text from consignment_notes where organization_id = 374));
  perform set_config('request.jwt.claims', u374, true);
  mapeo := jsonb_build_array(jsonb_build_object('producto_ref', p4uuid, 'product_id', p5));
  -- La copia del consignante no trae los términos del lado del receptor: sin declararlos, no se acepta (ronda 4: la
  -- compensación; ronda 5: el orden de aplicación y la liquidación por escrito).
  perform pg_temp.err('I3a aceptar sin declarar la compensación, el orden de aplicación ni la liquidación por escrito', 'terminos_invalidos',
    format('select fn_consignacion_recibida_aceptar(%L,585,%L::jsonb,%L,%L,%L,374)', doc, mapeo, '28151002', 'costo_acreditado', 'k-ia0'));
  tc := jsonb_build_object('compensacion_remuneracion', true, 'orden_aplicacion', jsonb_build_array('remuneracion','anticipos'),
                           'liquidacion_escrita', jsonb_build_object('medio','documento_compartido','plazo_dias',3));
  perform pg_temp.err('I3b el orden de aplicación es obligatorio también al aceptar', 'orden_aplicacion_obligatorio',
    format('select fn_consignacion_recibida_aceptar(%L,585,%L::jsonb,%L,%L,%L,374,%L::jsonb)', doc, mapeo, '28151002', 'costo_acreditado', 'k-ia0b', tc - 'orden_aplicacion'));
  r := fn_consignacion_recibida_aceptar(doc, 585, mapeo, '28151002', 'costo_acreditado', 'k-ia1', 374, tc);
  n3 := r->>'nota_id';
  perform pg_temp.chk('I3 aceptada en 374: custodia / pactado / recaudo', '120000.00/280000.00/28151002', (r->>'custodia') || '/' || (r->>'pactado') || '/' || (r->'cuentas'->>'recaudo'));
  perform pg_temp.chk('I3c la nota aceptada guarda la compensación y los términos de la liquidación', 'true · ["remuneracion", "anticipos"] · documento_compartido/3',
    (select commission_offset_agreed::text || ' · ' || (settlement_terms->'orden_aplicacion')::text || ' · ' || (settlement_terms->'liquidacion_escrita'->>'medio')
            || '/' || (settlement_terms->'liquidacion_escrita'->>'plazo_dias') from consignment_notes where id = n3));
  perform pg_temp.chk('I3d RLS: 374 no ve notas de 138', '0', (select count(*)::text from consignment_notes where organization_id = 138));
  perform pg_temp.mover(374, 585, p5, 'out', 1, 'sale');
  r := fn_consignacion_recibida_liquidar(n3, null, false, null, 'k-il1', 374);
  doc2 := r->>'documento_compartido_id';
  perform pg_temp.chk('I4 liquidación 374 → 138: venta / remuneración / dueño / compartida', '70000.00/7000.00/63000.00/true',
    (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno') || '/' || (doc2 is not null)::text);
  perform pg_temp.chk('I4b la liquidación por escrito lleva el orden de aplicación pactado (C.Co. art. 1277)', '["remuneracion", "anticipos"]',
    (r->'terminos_liquidacion'->'orden_aplicacion')::text);
  perform pg_temp.err('I5 374 lee la liquidación como si fuera 138', 'Acceso denegado', format('select fn_consignacion_documento_recibido_preparar(%L,%s)', doc2, 138));
  perform set_config('request.jwt.claims', u138, true);
  r := fn_consignacion_documento_recibido_preparar(doc2, 138);
  perform pg_temp.chk('I6 138 prepara: el mandato del lado del dueño espera al Contador', 'true', ((r->'diferencias') @> '[{"tipo":"mandante_pendiente"}]')::text);
  perform set_config('request.jwt.claims', u374, true);
end $i$;

-- ── Cuadre final (administrador) y resultado ─────────────────────────────────
reset role;
do $z$
declare v text;
begin
  select string_agg(x, chr(10)) into v from (
    select e.source || ': ' || (select string_agg(l.account_code || case when l.debit > 0 then ' D ' else ' C ' end || (l.debit + l.credit)::numeric(16,0), ' | ' order by l.debit desc)
                                  from journal_lines l where l.journal_entry_id = e.id) x
      from journal_entries e where e.created_at = now() and e.source like 'consign%' order by e.id) s;
  perform pg_temp.log('ASIENTOS DE CONSIGNACIÓN:' || chr(10) || coalesce(v, '(ninguno)'));
  -- Ronda 5: los casos entre dos organizaciones (I1–I6) vuelven a correr; suman sus 4 asientos (custodia recibida, salida de
  -- custodia, venta por cuenta del dueño 2 y su remuneración). El esperado sube de 14 a 18 por eso, no por un cambio de cálculo.
  perform pg_temp.chk('Z1 asientos de consignación (14 de la parte propia + 4 de la parte entre organizaciones, que vuelve a correr en la ronda 5)', '18', (select count(*)::text from journal_entries e where e.created_at = now() and e.source like 'consign%'));
  perform pg_temp.chk('Z2 asientos descuadrados (todos los de la transacción)', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z3 asientos de las entregadas', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and e.source_id in (current_setting('dry.ne'))));
  perform pg_temp.chk('Z4 líneas en 1465', '0', (select count(*)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.created_at = now() and l.account_code like '1465%'));
  perform pg_temp.chk('Z5 kardex de la entregada propia', 'transfer_out out 2.000', (select string_agg(source || ' ' || direction || ' ' || qty::text, ', ') from stock_movements where source_id = 'consignacion:' || current_setting('dry.ne')));
  perform pg_temp.chk('Z6 obligación con el dueño en 28151001 tras el cruce (la nota 2 aún no reconoce su remuneración: espera la obligación posterior)', '314000.00', (select sum(l.credit - l.debit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.organization_id = 374 and l.account_code = '28151001'));
  perform pg_temp.chk('Z7 saldo y estado del anticipo cruzado', '50000.00 active', (select balance::text || ' ' || status from supplier_advances where id = current_setting('dry.a1')::uuid));
  -- Ronda 5: la liquidación entre organizaciones (I4) deja sus 3 retenciones pendientes (el dueño de la 138 no tiene datos fiscales
  -- acreditados en la 374): el esperado sube de 9 a 12 por esos casos.
  perform pg_temp.chk('Z8 retenciones pendientes abiertas (reemplazan los «impuestos por determinar» de la ronda 2; el consignante no tiene datos fiscales; 3 de la liquidación entre organizaciones)', '12', (select count(*)::text from journal_entry_failures where created_at = now() and organization_id = 374 and reason = 'consignacion_retencion_pendiente' and resolved_at is null));
  perform pg_temp.chk('Z9 ningún pendiente se cierra por anular el documento (ronda 4)', '0', (select count(*)::text from journal_entry_failures where created_at = now() and organization_id = 374 and resolution = 'liquidacion_anulada'));
  select string_agg(reason || '×' || n, ', ') into v from (select reason, count(*) n from journal_entry_failures where created_at = now() and organization_id = 374 and reason like 'consignacion%' and resolved_at is null group by reason order by reason) s;
  perform pg_temp.log('PENDIENTES ABIERTOS: ' || coalesce(v, '-'));
  -- Ronda 6: cada liquidación vigente deja su entrega por escrito como pendiente visible (3 propias + 1 entre organizaciones).
  perform pg_temp.chk('Z10 pendientes abiertos por tipo', 'consignacion_derecho_frente_al_dueno×1, consignacion_devolucion_pos×1, consignacion_factura_remuneracion×2, consignacion_liquidacion_escrita_por_entregar×4, consignacion_novedad×1, consignacion_remuneracion_por_devengar×1, consignacion_retencion_pendiente×12', v);
end $z$;

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
