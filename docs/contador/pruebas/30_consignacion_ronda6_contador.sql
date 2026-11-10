-- Pruebas en seco 30 · Consignación, ronda 6 del Contador (RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md, respuestas 10, 12 y
-- 13 y el pendiente «la liquidación no aplica el orden ni deja constancia de la entrega escrita»):
--   10. el abono por la retención de la operación cuenta en el saldo de la factura igual que un pago (migración
--       20261110100000, ESCRITA, NO APLICADA): 69.690 + 1.710 dejan la factura saldada. Se demuestra ANTES y DESPUÉS en la
--       misma transacción (se ejecuta la reversión exacta y luego la migración exacta): facturas de control (sin pagos,
--       con pago parcial, con pago total, con nota crédito y anulada) y TODAS las facturas de la base quedan idénticas; la
--       reversión deja las funciones aplicadas byte a byte como hoy (md5 de pg_get_functiondef).
--   12. la liquidación APLICA lo recaudado en el orden del contrato; sin compensación pactada la remuneración no se
--       descuenta aunque esté en el orden (queda por cobrar al dueño); los libros quedan como dice la aplicación.
--   13. el plazo de la liquidación por escrito corre desde el CORTE del período (salvo cláusula distinta); la entrega deja
--       constancia (fecha, medio, soporte) y, vencido el plazo sin entrega, queda un pendiente visible.
-- Fecha: 2026-11-10 · Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585), operada por su usuario dueño. Solo
-- LEE las facturas de las demás organizaciones (lo pagado de cada una, antes y después).
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- CARGA ejecuta, completas y exactas (md5 comprobado), las migraciones SIN APLICAR en orden de versión. Las ventas y los
-- cruces de días anteriores se simulan fechándolos como administrador.
-- Resultado: 30_consignacion_ronda6_contador.resultado.txt

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


-- ════ CUERPO: 30.sql ════
-- ════ 30 · Consignación, ronda 6: el abono por retención cuenta en el saldo de la factura igual que un pago (migración
--      20261110100000: 69.690 + 1.710 dejan la factura saldada; facturas de control idénticas antes y después; reversión
--      exacta); la liquidación APLICA lo recaudado en el orden del contrato (sin compensación pactada, la remuneración queda
--      por cobrar al dueño) y deja los libros como dice la aplicación; la liquidación por escrito vence desde el CORTE del
--      período y su entrega deja constancia (fecha, medio, soporte), con pendiente visible si vence ════
select set_config('dry.prueba', '30', true);
set constraints all deferred;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── R0 · Estado ANTES de la migración de cartera: se ejecuta su reversión (archivo exacto, md5 comprobado) ───────────
do $r30$
begin
  execute pg_temp.archivo('20261110100000_cartera_abono_retencion_consignacion_rollback');
  perform pg_temp.chk('R0 la reversión deja fn_invoice_sales_paid y fn_excedente_nota_credito EXACTAMENTE como están aplicadas hoy (md5 de pg_get_functiondef)',
    '4c772ca4a7d6926ce091a7910ea4e1d7 · e9cb33e070ea4c18e1912ee21455b8e6',
    md5(pg_get_functiondef('public.fn_invoice_sales_paid(uuid)'::regprocedure)) || ' · '
      || md5(pg_get_functiondef('public.fn_excedente_nota_credito(uuid)'::regprocedure)));
  perform pg_temp.chk('R0b sin la migración no existen el disparador ni la función de los abonos', '0 · 0',
    (select count(*)::text from pg_trigger where tgname = 'trg_abono_retencion_recalcula_factura') || ' · '
      || (select count(*)::text from pg_proc where proname = 'fn_invoice_sales_retenciones_abonadas'));
end $r30$;

do $s30$
declare
  m1 int; m2 int; m3 int; m4 int; b1 uuid; p1 int; p2 int; p3 int; p4 int; inv1 uuid; inv2 uuid; f uuid; v_nc uuid; v_pg uuid;
  u uuid := (select owner_user_id from organizations where id = 374);
begin
  insert into chart_of_accounts (organization_id, account_code, name, type, centro_costo_modo, parent_code, es_movimiento)
  select 374, x.* from (values
   ('911520', 'En consignación', 'order', 'no_aplica', '9115', true),
   ('281510', 'Venta por cuenta de terceros', 'liability', 'no_aplica', '2815', false),
   ('28151031', 'Dueño consignante 30-1', 'liability', 'no_aplica', '281510', true),
   ('28151032', 'Dueño consignante 30-2', 'liability', 'no_aplica', '281510', true),
   ('28151033', 'Dueño consignante 30-3', 'liability', 'no_aplica', '281510', true),
   ('28151034', 'Dueño consignante 30-4', 'liability', 'no_aplica', '281510', true),
   ('413512', 'Venta a cambio de retribución', 'income', 'no_aplica', '4135', false),
   ('41351201', 'Remuneración por consignación', 'income', 'no_aplica', '413512', true),
   ('138095', 'Otras cuentas por cobrar', 'asset', 'no_aplica', '1380', false),
   ('13809501', 'Remuneración por cobrar a dueños consignantes', 'asset', 'no_aplica', '138095', true)) x(c, n, t, m, p, e)
   where not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.c);
  -- Cuenta de anticipos (para el anticipo al consignante que se cruza con el mandato).
  insert into chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
  select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, x.mov, c.requiere_centro_costo
    from chart_of_accounts c, (values ('133005', 'A proveedores', '1330', false), ('13300501', 'Anticipos a proveedores nacionales', '133005', true)) x(code, name, parent, mov)
   where c.organization_id = 374 and c.account_code = '1330'
     and not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.code);
  insert into configuracion_contable (organization_id, branch_id, clave, account_code)
  select 374, null, 'anticipos_proveedores', '13300501'
   where not exists (select 1 from configuracion_contable where organization_id = 374 and clave = 'anticipos_proveedores');
  update configuracion_contable set account_code = '13300501' where organization_id = 374 and clave = 'anticipos_proveedores';
  if exists (select 1 from organization_tax_profiles where organization_id = 374) then
    update organization_tax_profiles set regimen = 'ordinario', responsabilidades = array['O-48'], requiere_revision = false, agente_retencion = false,
           agente_retencion_iva = null, gran_contribuyente = null where organization_id = 374;
  else
    insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion) values (374, '2026-01-01', 'ordinario', array['O-48'], false);
  end if;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 30-1', '900000301', 'company', array['O-13', 'O-48']) returning id into m1;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 30-2', '900000302', 'company', array['O-13', 'O-48']) returning id into m2;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 30-3', '900000303', 'company', array['O-13', 'O-48']) returning id into m3;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 30-4', '900000304', 'company', array['O-13', 'O-48']) returning id into m4;
  insert into customers (organization_id, first_name, last_name) values (374, 'Comprador', '30 Uno') returning id into b1;
  insert into products (organization_id, sku, name) values (374, 'P30-1', 'Consignado 30-1') returning id into p1;
  insert into products (organization_id, sku, name) values (374, 'P30-2', 'Consignado 30-2') returning id into p2;
  insert into products (organization_id, sku, name) values (374, 'P30-3', 'Consignado 30-3') returning id into p3;
  insert into products (organization_id, sku, name) values (374, 'P30-4', 'Consignado 30-4') returning id into p4;
  -- Dos facturas de la venta en consignación: el comprador paga 71.400 − reteIVA 1.710 = 69.690 (factura 1) y
  -- 71.400 − ReteICA 579 = 70.821 (factura 2). Lo que queda en cada una es la retención por abonar.
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv1;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv2;
  insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line, product_id) values
    (inv1, 'sale', inv1, 'Consignado 30-1', 1, 60000, 19, 71400, p1),
    (inv2, 'sale', inv2, 'Consignado 30-1', 1, 60000, 19, 71400, p1);
  update invoice_sales set status = 'issued' where id in (inv1, inv2);
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv1::text, 'transfer', 69690, 'COP', 'completed', u, now()) returning id into v_pg;
  perform set_config('d30.pg1', v_pg::text, true);
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv2::text, 'transfer', 70821, 'COP', 'completed', u, now()) returning id into v_pg;
  perform set_config('d30.pg2', v_pg::text, true);
  -- FACTURAS DE CONTROL (sin abonos por retención), creadas ANTES de la migración: sin pagos, pago parcial, pago total,
  -- pago con nota crédito y anulada.
  create temp table control30 (etiqueta text, id uuid, nc uuid);
  foreach f in array array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()] loop
    insert into invoice_sales (id, organization_id, branch_id, status, customer_id) values (f, 374, 585, 'draft', b1);
    insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line) values
      (f, 'sale', f, 'Servicio de control 30', 1, 100000, 19, 119000);
    update invoice_sales set status = 'issued' where id = f;
    insert into control30 values ('F' || (select count(*) + 1 from control30)::text, f, null);
  end loop;
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
  select 374, 585, 'invoice_sales', c.id::text, 'transfer', x.monto, 'COP', 'completed', u, now()
    from control30 c join (values ('F2', 50000), ('F3', 119000), ('F4', 30000), ('F5', 20000)) x(e, monto) on x.e = c.etiqueta;
  -- F4: nota crédito emitida por la mitad (59.500).
  perform set_config('app.asiento_por_lineas', 'on', true);
  insert into invoice_sales (organization_id, branch_id, customer_id, status, document_type, related_invoice_id, subtotal, tax_total, total)
  values (374, 585, b1, 'issued', 'credit_note', (select id from control30 where etiqueta = 'F4'), -50000, -9500, -59500) returning id into v_nc;
  perform set_config('app.asiento_por_lineas', '', true);
  update control30 set nc = v_nc where etiqueta = 'F4';
  -- F5: anulada después de su pago.
  update invoice_sales set status = 'void' where id = (select id from control30 where etiqueta = 'F5');
  perform set_config('d30.m1', m1::text, true); perform set_config('d30.m2', m2::text, true);
  perform set_config('d30.m3', m3::text, true); perform set_config('d30.m4', m4::text, true);
  perform set_config('d30.p1', p1::text, true); perform set_config('d30.p2', p2::text, true);
  perform set_config('d30.p3', p3::text, true); perform set_config('d30.p4', p4::text, true);
  perform set_config('d30.inv1', inv1::text, true); perform set_config('d30.inv2', inv2::text, true);
  perform set_config('d30.u', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('d30.je0', (select coalesce(max(id), 0)::text from journal_entries where organization_id = 374), true);
end $s30$;
grant select on control30 to authenticated;
-- Lecturas internas (sin EXECUTE para authenticated): se leen con funciones temporales SECURITY DEFINER.
create function pg_temp.cxc30(n uuid) returns numeric language sql security definer set search_path = public, pg_temp as $$ select public.fn_consignacion_cxc_dueno_saldo(n) $$;
create function pg_temp.saldo30(c text) returns numeric language sql security definer set search_path = public, pg_temp as $$
  select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = 374 and l.account_code = c $$;
grant execute on function pg_temp.cxc30(uuid), pg_temp.saldo30(text) to authenticated;
-- Foto de una factura: saldo · estado · pagado · cartera (saldo/estado) · excedente de su nota crédito.
create temp table foto30 (fase text, etiqueta text, id uuid, saldo numeric, estado text, pagado numeric, cartera text, excedente numeric);
create function pg_temp.foto30(fase text) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into foto30
  select fase, c.etiqueta, c.id, i.balance, i.status, public.fn_invoice_sales_paid(c.id),
         (select ar.balance::text || '/' || ar.status from public.accounts_receivable ar where ar.invoice_id = c.id limit 1),
         case when c.nc is not null then public.fn_excedente_nota_credito(c.nc) end
    from control30 c join public.invoice_sales i on i.id = c.id $$;
grant all on foto30 to authenticated;
grant execute on function pg_temp.foto30(text) to authenticated;
select set_config('request.jwt.claims', current_setting('d30.u'), true);
set local role authenticated;

-- ── Notas recibidas en mandato: n1 (factura con retención), n2 (SIN compensación), n3 (anticipos primero), n4 (plazo
--    desde la liquidación, con su cláusula) ──────────────────────────────────────────────────────────────────────────
do $n30$
declare
  o int := 374; b int := 585; t jsonb; r jsonb;
  hoy date := (now() at time zone 'America/Bogota')::date;
begin
  perform fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201', '13809501',
    '{"retefuente":"13551501","reteiva":"13551701","reteica":"13551801"}'::jsonb);
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',false,
    'obligacion_dueno','venta','compensacion_remuneracion',true,
    'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151031',
    'orden_aplicacion',jsonb_build_array('remuneracion','gastos_reembolsables','anticipos','derechos_frente_al_dueno'),
    'liquidacion_escrita',jsonb_build_object('medio','correo_electronico','plazo_dias',5));
  -- W · Términos de la liquidación por escrito: el plazo corre desde el corte, salvo que el contrato diga otra cosa.
  perform pg_temp.err('W1 contar el plazo desde la última venta no se admite', 'terminos_invalidos',
    format('select fn_consignacion_terminos(%L::jsonb, %L)', t || '{"liquidacion_escrita":{"medio":"correo_electronico","plazo_dias":5,"plazo_desde":"ultima_venta"}}', 'recibida'));
  perform pg_temp.err('W2 desde la fecha de la liquidación sin citar la cláusula del contrato', 'terminos_invalidos',
    format('select fn_consignacion_terminos(%L::jsonb, %L)', t || '{"liquidacion_escrita":{"medio":"correo_electronico","plazo_dias":5,"plazo_desde":"fecha_de_liquidacion"}}', 'recibida'));
  perform pg_temp.chk('W3 sin decir nada, el plazo corre desde el corte del período liquidado', 'corte_del_periodo · null',
    (select (x -> 'liquidacion_escrita' ->> 'plazo_desde') || ' · ' || coalesce(x -> 'liquidacion_escrita' ->> 'clausula', 'null')
       from (select fn_consignacion_terminos(t, 'recibida') -> 'liquidacion_terminos' x) y));
  r := fn_consignacion_recibir(current_setting('d30.m1')::int, b, jsonb_build_array(jsonb_build_object('product_id', current_setting('d30.p1')::int, 'qty', 5, 'precio', 60000, 'costo_acreditado', 40000)),
         15, t, 'k30-n1', o, null);
  perform set_config('d30.n1', r ->> 'nota_id', true);
  r := fn_consignacion_recibir(current_setting('d30.m2')::int, b, jsonb_build_array(jsonb_build_object('product_id', current_setting('d30.p2')::int, 'qty', 10, 'precio', 60000, 'costo_acreditado', 40000)),
         15, t || '{"compensacion_remuneracion":false,"cuenta_recaudo":"28151032","orden_aplicacion":["remuneracion","gastos_reembolsables"]}', 'k30-n2', o, null);
  perform set_config('d30.n2', r ->> 'nota_id', true);
  r := fn_consignacion_recibir(current_setting('d30.m3')::int, b, jsonb_build_array(jsonb_build_object('product_id', current_setting('d30.p3')::int, 'qty', 10, 'precio', 60000, 'costo_acreditado', 40000)),
         15, t || '{"cuenta_recaudo":"28151033","orden_aplicacion":["anticipos","remuneracion","gastos_reembolsables","derechos_frente_al_dueno"]}', 'k30-n3', o, null);
  perform set_config('d30.n3', r ->> 'nota_id', true);
  r := fn_consignacion_recibir(current_setting('d30.m4')::int, b, jsonb_build_array(jsonb_build_object('product_id', current_setting('d30.p4')::int, 'qty', 5, 'precio', 60000, 'costo_acreditado', 40000)),
         15, t || '{"cuenta_recaudo":"28151034","liquidacion_escrita":{"medio":"documento_fisico","plazo_dias":3,"plazo_desde":"fecha_de_liquidacion","clausula":"Cláusula 9: tres días desde la fecha de la liquidación"}}',
         'k30-n4', o, null);
  perform set_config('d30.n4', r ->> 'nota_id', true);
  perform pg_temp.chk('W4 el contrato que dice otra cosa queda guardado con su cláusula', 'fecha_de_liquidacion · Cláusula 9: tres días desde la fecha de la liquidación',
    (select (settlement_terms -> 'liquidacion_escrita' ->> 'plazo_desde') || ' · ' || (settlement_terms -> 'liquidacion_escrita' ->> 'clausula')
       from consignment_notes where id = current_setting('d30.n4')::uuid));
  -- Ventas: n1 por factura (las dos facturas), n2 una en el POS, n3 dos en el POS, n4 una en el POS.
  perform pg_temp.mover(o, b, current_setting('d30.p1')::int, 'out', 1, 'invoice_sale', current_setting('d30.inv1'));
  perform pg_temp.mover(o, b, current_setting('d30.p1')::int, 'out', 1, 'invoice_sale', current_setting('d30.inv2'));
  perform pg_temp.mover(o, b, current_setting('d30.p2')::int, 'out', 1, 'sale');
  perform pg_temp.mover(o, b, current_setting('d30.p3')::int, 'out', 2, 'sale');
  perform pg_temp.mover(o, b, current_setting('d30.p4')::int, 'out', 1, 'sale');
end $n30$;
-- Un anticipo al dueño de n3 (financiación: sin retención al girar) para cruzarlo con el mandato.
do $a30$
declare res jsonb;
begin
  res := fn_anticipo_proveedor_registrar(current_setting('d30.m3')::int, 585, 200000, 'transfer', 'financiacion', 'p30-AX', 374, null, null, null, null, 'TRF-30-AX');
  perform set_config('d30.ax', res ->> 'anticipo_id', true);
  res := fn_consignacion_cruzar_anticipo(current_setting('d30.n3')::uuid, (res ->> 'anticipo_id')::uuid, 50000, 'k30-cr1', 374);
  perform set_config('d30.cr1', res ->> 'cruce_id', true);
end $a30$;
reset role;
-- Hechos anteriores, simulados como administrador: las ventas de n3 y n4 (y el cruce de n3) son de hace 12 y 11 días; la
-- venta de n2, de hace 3 días (su liquidación corta HOY: el plazo no puede contarse desde la última venta).
update consignment_allocations set created_at = now() - interval '12 days'
 where note_id in (current_setting('d30.n3')::uuid, current_setting('d30.n4')::uuid);
update consignment_advance_crossings set created_at = now() - interval '11 days' where id = current_setting('d30.cr1')::uuid;
update consignment_allocations set created_at = now() - interval '3 days' where note_id = current_setting('d30.n2')::uuid;
select set_config('request.jwt.claims', current_setting('d30.u'), true);
set local role authenticated;

-- ── K (antes) · Retención de la operación con la cartera SIN la migración: el abono queda «por aplicar» ─────────────
do $k30a$
declare
  o int := 374; n1 uuid := current_setting('d30.n1')::uuid; inv1 uuid := current_setting('d30.inv1')::uuid; r jsonb; l1 uuid; w uuid;
  hoy date := (now() at time zone 'America/Bogota')::date;
begin
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k30-l1', o); l1 := r ->> 'liquidacion_id';
  perform set_config('d30.l1', l1::text, true);
  select id into w from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'reteiva' order by payer_group limit 1;
  perform set_config('d30.w1', w::text, true);
  r := fn_consignacion_retencion_practicada(w, 1710, 11400, hoy, 'Comprobante del pago de la factura 30-1 con reteIVA', o, inv1, current_setting('d30.pg1')::uuid);
  perform pg_temp.chk('B1 ANTES de la migración: el abono queda por aplicar y la factura con 1.710 de saldo (lo de la ronda 5)', 'por_aplicar · 1710.00 · partial · 1',
    (r -> 'abono_factura' ->> 'estado') || ' · ' || (select balance::text || ' · ' || status from invoice_sales where id = inv1) || ' · '
      || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = w::text and f.resolved_at is null));
end $k30a$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Foto ANTES (facturas de control) y lo pagado de TODAS las facturas de la base, con la función aplicada hoy.
select pg_temp.foto30('antes');
create temp table pagado30 (fase text, id uuid, pagado numeric);
insert into pagado30 select 'antes', i.id, public.fn_invoice_sales_paid(i.id) from invoice_sales i;

-- ── R1 · Se ejecuta la migración de cartera (archivo exacto, md5 comprobado) ──────────────────────────────────────────
do $m30$
begin
  execute pg_temp.archivo('20261110100000_cartera_abono_retencion_consignacion');
end $m30$;
-- Se fuerza el recálculo de las facturas de control con la función nueva (como lo haría cualquier pago o nota).
select public.fn_factura_venta_recalcular_saldo(c.id) from control30 c;
select pg_temp.foto30('despues');
insert into pagado30 select 'despues', i.id, public.fn_invoice_sales_paid(i.id) from invoice_sales i;
do $d30$
declare v_total int; v_con int;
begin
  perform pg_temp.chk('D1 facturas de control (sin pagos, parcial, total, con nota crédito y anulada): saldo, estado, pagado, cartera y excedente IDÉNTICOS',
    '5 · 0', (select count(*)::text from foto30 where fase = 'antes') || ' · '
      || (select count(*)::text from foto30 a join foto30 d on d.id = a.id and d.fase = 'despues'
           where a.fase = 'antes' and (a.saldo, a.estado, a.pagado, coalesce(a.cartera, '-'), coalesce(a.excedente, -1))
                                  is distinct from (d.saldo, d.estado, d.pagado, coalesce(d.cartera, '-'), coalesce(d.excedente, -1))));
  perform pg_temp.chk('D2 las facturas de control, una por una, antes (esperado) y después (obtenido): saldo/estado/pagado/cartera · excedente de la nota',
    (select string_agg(etiqueta || ' ' || saldo::text || '/' || estado || '/' || pagado::text || '/' || coalesce(cartera, '-') || coalesce(' exc ' || excedente::text, ''),
                       ' · ' order by etiqueta) from foto30 where fase = 'antes'),
    (select string_agg(etiqueta || ' ' || saldo::text || '/' || estado || '/' || pagado::text || '/' || coalesce(cartera, '-') || coalesce(' exc ' || excedente::text, ''),
                       ' · ' order by etiqueta) from foto30 where fase = 'despues'));
  select count(*), count(*) filter (where exists (select 1 from consignment_withholding_receivable_applications x where x.invoice_id = a.id))
    into v_total, v_con from pagado30 a where a.fase = 'antes';
  perform pg_temp.log(format('D3: %s facturas de la base (todas las organizaciones); %s con abono por retención', v_total, v_con));
  perform pg_temp.chk('D3 TODAS las facturas de la base sin abono por retención: lo pagado no cambia (0 diferencias)', '0',
    (select count(*)::text from pagado30 a join pagado30 d on d.id = a.id and d.fase = 'despues'
      where a.fase = 'antes' and a.pagado is distinct from d.pagado
        and not exists (select 1 from consignment_withholding_receivable_applications x where x.invoice_id = a.id)));
  perform pg_temp.chk('D4 la factura del abono: lo pagado sube exactamente en el abono (69.690 → 71.400); toda factura que cambia lo hace en sus abonos aplicados',
    '69690 → 71400.00 · 0',
    (select a.pagado::text || ' → ' || d.pagado::text from pagado30 a join pagado30 d on d.id = a.id and d.fase = 'despues'
      where a.fase = 'antes' and a.id = current_setting('d30.inv1')::uuid) || ' · '
    || (select count(*)::text from pagado30 a join pagado30 d on d.id = a.id and d.fase = 'despues'
         where a.fase = 'antes' and a.pagado is distinct from d.pagado
           and d.pagado - a.pagado <> (select coalesce(sum(x.amount), 0) from consignment_withholding_receivable_applications x
                                        where x.invoice_id = a.id and x.status = 'aplicada')));
end $d30$;
select set_config('request.jwt.claims', current_setting('d30.u'), true);
set local role authenticated;

-- ── K (después) · El abono cuenta en el saldo igual que un pago (respuesta 10) ─────────────────────────────────────
do $k30b$
declare
  o int := 374; inv1 uuid := current_setting('d30.inv1')::uuid; inv2 uuid := current_setting('d30.inv2')::uuid; l1 uuid := current_setting('d30.l1')::uuid;
  w1 uuid := current_setting('d30.w1')::uuid; w2 uuid; r jsonb; hoy date := (now() at time zone 'America/Bogota')::date; nc uuid; v_pg uuid;
begin
  perform pg_temp.chk('K1 69.690 + 1.710 dejan la factura SALDADA; la cartera la sigue; el abono pasó a aplicado y su pendiente se cerró',
    '0.00 · paid · 0.00/paid · aplicada · 0 · abono_aplicado_en_cartera',
    (select balance::text || ' · ' || status from invoice_sales where id = inv1) || ' · '
      || (select ar.balance::text || '/' || ar.status from accounts_receivable ar where ar.invoice_id = inv1 limit 1) || ' · '
      || (select status from consignment_withholding_receivable_applications where withholding_id = w1) || ' · '
      || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = w1::text and f.resolved_at is null)
      || ' · ' || (select max(f.resolution) from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = w1::text));
  perform pg_temp.chk('K2 lo pagado de la factura = cobro 69.690 + abono 1.710', '71400.00', fn_invoice_sales_paid(inv1)::text);
  -- Con la migración, la retención nace aplicada: ReteICA de 579 en la factura 2, con su cobro de 70.821.
  select id into w2 from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'reteica' order by payer_group limit 1;
  perform set_config('d30.w2', w2::text, true);
  r := fn_consignacion_retencion_practicada(w2, 579, 60000, hoy, 'Comprobante del pago de la factura 30-2 con ReteICA', o, inv2, current_setting('d30.pg2')::uuid);
  perform pg_temp.chk('K3 nace aplicada: saldo antes 579, después 0; sin pendiente de cartera; el certificado sigue pendiente de soporte',
    'aplicada · 579.00 · 0.00 · 0.00 · 0 · pendiente_de_soporte',
    (r -> 'abono_factura' ->> 'estado') || ' · ' || (r -> 'abono_factura' ->> 'saldo_factura_antes') || ' · ' || (r -> 'abono_factura' ->> 'saldo_factura') || ' · '
      || (r -> 'abono_factura' ->> 'saldo_real_exigible') || ' · '
      || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = w2::text)
      || ' · ' || (r ->> 'certificado'));
  perform pg_temp.chk('K4 asiento de la retención: D 281510 del dueño / C cartera de la factura (Concepto DIAN 13277 de 2025)', '28151031 D 579 · cartera C 579',
    (select string_agg(case when l.debit > 0 then l.account_code || ' D ' || round(l.debit) else 'cartera C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l where l.journal_entry_id = (r ->> 'asiento_id')::int));
  perform pg_temp.err('K5 una retención más sobre la factura saldada abonaría de más la cartera', 'retencion_excede_saldo_factura',
    format('select fn_consignacion_retencion_practicada(%L, 100, 11400, %L::date, %L, 374, %L, %L)',
           (select id from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'retefuente' order by payer_group limit 1),
           hoy, 'Otro comprobante 30-2', inv2, current_setting('d30.pg2')));
  perform pg_temp.chk('K6 nada queda «por aplicar» en la lectura de la ronda 5', '0',
    (select count(*)::text from fn_consignacion_cartera_retenciones(374) c where c.invoice_id in (inv1, inv2)));
end $k30b$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Otro pago que después falla recalcula la factura dos veces por el disparador de payments: el abono se conserva.
do $k30c$
declare inv2 uuid := current_setting('d30.inv2')::uuid; v_pg uuid; nc uuid;
begin
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv2::text, 'transfer', 1000, 'COP', 'completed', (select owner_user_id from organizations where id = 374), now())
    returning id into v_pg;
  update payments set status = 'failed' where id = v_pg;
  perform pg_temp.chk('K7 un pago nuevo que luego falla recalcula la factura por payments: sigue saldada (el abono cuenta en todos los caminos)',
    '0.00 · paid · 71400.00', (select balance::text || ' · ' || status from invoice_sales where id = inv2) || ' · ' || fn_invoice_sales_paid(inv2)::text);
  -- Nota crédito total de la factura 2: el excedente que vuelve al cliente es el DINERO recibido (70.821), no el abono.
  perform set_config('app.asiento_por_lineas', 'on', true);
  insert into invoice_sales (organization_id, branch_id, customer_id, status, document_type, related_invoice_id, subtotal, tax_total, total)
  values (374, 585, (select customer_id from invoice_sales where id = inv2), 'issued', 'credit_note', inv2, -60000, -11400, -71400) returning id into nc;
  perform set_config('app.asiento_por_lineas', '', true);
  perform pg_temp.chk('K8 nota crédito total: el saldo a favor del cliente es lo que pagó en dinero (70.821), sin el abono por retención', '70821.00',
    fn_excedente_nota_credito(nc)::text);
end $k30c$;
select set_config('request.jwt.claims', current_setting('d30.u'), true);
set local role authenticated;

-- ── L · La liquidación APLICA lo recaudado en el orden del contrato (respuesta 12) ─────────────────────────────────
do $l30$
declare
  o int := 374; n2 uuid := current_setting('d30.n2')::uuid; n3 uuid := current_setting('d30.n3')::uuid; n4 uuid := current_setting('d30.n4')::uuid;
  r jsonb; l uuid; hoy date := (now() at time zone 'America/Bogota')::date;
begin
  -- n2: SIN compensación pactada, la remuneración no se descuenta aunque esté en el orden: queda por cobrar al dueño.
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k30-l2a', o); l := r ->> 'liquidacion_id';
  perform set_config('d30.l2a', l::text, true);
  perform pg_temp.chk('L1 sin compensación pactada: recaudado 60.000 · remuneración 9.000 aplicada 0, por cobrar 9.000 · saldo para el dueño 60.000 (no 51.000)',
    '60000.00 · remuneracion 9000.00/0/9000.00 compensacion_no_pactada · 60000.00 · 51000.00',
    (r -> 'aplicacion' ->> 'recaudado') || ' · ' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'concepto') || ' '
      || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'monto') || '/' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'aplicado') || '/'
      || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'por_cobrar_al_dueno') || ' ' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'motivo') || ' · '
      || (r ->> 'por_pagar') || ' · ' || (r ->> 'dueno'));
  perform pg_temp.chk('L2 los libros dicen lo mismo: 281510 del dueño 60.000 = saldo para el dueño; cuenta por cobrar 9.000', '60000.00 · 9000.00 · 60000.00',
    pg_temp.saldo30('28151032')::text || ' · ' || pg_temp.cxc30(n2)::text || ' · ' || (select payable_amount::text from consignment_settlements where id = l));
  perform pg_temp.err('L3 el orden de n2 no incluye anticipos: un anticipo no se cruza con lo recaudado', 'anticipos_fuera_del_orden_de_aplicacion',
    format('select fn_consignacion_cruzar_anticipo(%L, %L, 1000, %L, 374)', n2, gen_random_uuid(), 'k30-cr-n2'));
  -- n3 (anticipos primero, compensación pactada): período 1 hasta hace 10 días.
  r := fn_consignacion_recibida_liquidar(n3, hoy - 10, false, null, 'k30-l3a', o); l := r ->> 'liquidacion_id';
  perform set_config('d30.l3a', l::text, true);
  perform pg_temp.chk('L4 orden anticipos → remuneración: recaudado 120.000; anticipo 50.000 y remuneración 18.000 aplicados; saldo para el dueño 52.000',
    '120000.00 · anticipos 50000.00/50000.00 · remuneracion 18000.00/18000.00 · 52000.00 · 0',
    (r -> 'aplicacion' ->> 'recaudado') || ' · ' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'concepto') || ' ' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'monto') || '/'
      || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'aplicado') || ' · ' || (r -> 'aplicacion' -> 'conceptos' -> 1 ->> 'concepto') || ' '
      || (r -> 'aplicacion' -> 'conceptos' -> 1 ->> 'monto') || '/' || (r -> 'aplicacion' -> 'conceptos' -> 1 ->> 'aplicado') || ' · ' || (r ->> 'por_pagar') || ' · '
      || (r -> 'aplicacion' -> 'libros' ->> 'ajuste'));
  perform pg_temp.chk('L5 libros = aplicación: 281510 del dueño 52.000; el cruce queda imputado a esta liquidación', '52000.00 · true',
    pg_temp.saldo30('28151033')::text || ' · ' || (select (settlement_id = l)::text from consignment_advance_crossings where id = current_setting('d30.cr1')::uuid));
end $l30$;
-- Período 2 de n3: una venta (60.000) y tres anticipos cruzados (40.000, 15.000 y 10.000), en ese orden.
do $l30b$
declare n3 uuid := current_setting('d30.n3')::uuid; ax uuid := current_setting('d30.ax')::uuid; r jsonb;
begin
  perform pg_temp.mover(374, 585, current_setting('d30.p3')::int, 'out', 1, 'sale');
  r := fn_consignacion_cruzar_anticipo(n3, ax, 40000, 'k30-cr2', 374); perform set_config('d30.cr2', r ->> 'cruce_id', true);
  r := fn_consignacion_cruzar_anticipo(n3, ax, 15000, 'k30-cr3', 374); perform set_config('d30.cr3', r ->> 'cruce_id', true);
  r := fn_consignacion_cruzar_anticipo(n3, ax, 10000, 'k30-cr4', 374); perform set_config('d30.cr4', r ->> 'cruce_id', true);
end $l30b$;
reset role;
update consignment_advance_crossings set created_at = now() - interval '3 minutes' where id = current_setting('d30.cr2')::uuid;
update consignment_advance_crossings set created_at = now() - interval '2 minutes' where id = current_setting('d30.cr3')::uuid;
update consignment_advance_crossings set created_at = now() - interval '1 minute' where id = current_setting('d30.cr4')::uuid;
select set_config('request.jwt.claims', current_setting('d30.u'), true);
set local role authenticated;
do $l30c$
declare
  o int := 374; n3 uuid := current_setting('d30.n3')::uuid; r jsonb; l uuid; txt text;
begin
  r := fn_consignacion_recibida_liquidar(n3, null, false, null, 'k30-l3b', o); l := r ->> 'liquidacion_id';
  txt := (r -> 'aplicacion' ->> 'recaudado') || ' · anticipos ' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'monto') || '/' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'aplicado')
    || ' espera ' || (r -> 'aplicacion' -> 'conceptos' -> 0 ->> 'en_espera') || ' · remuneracion ' || (r -> 'aplicacion' -> 'conceptos' -> 1 ->> 'aplicado') || '/'
    || (r -> 'aplicacion' -> 'conceptos' -> 1 ->> 'por_cobrar_al_dueno') || ' ' || (r -> 'aplicacion' -> 'conceptos' -> 1 ->> 'motivo') || ' · '
    || (r ->> 'por_pagar') || ' · ajuste ' || (r -> 'aplicacion' -> 'libros' ->> 'ajuste');
  perform pg_temp.chk('L6 el orden manda: recaudado 60.000; anticipos 40.000 + 15.000 (el de 10.000 no cabe: espera); a la remuneración le quedan 5.000 de 9.000; saldo 0',
    '60000.00 · anticipos 65000.00/55000.00 espera 10000.00 · remuneracion 5000.00/4000.00 recaudo_insuficiente · 0.00 · ajuste -4000.00', txt);
  perform pg_temp.chk('L7 libros = aplicación: se revierte la compensación que el orden no cubre (D 13809501 / C 28151033 por 4.000)',
    '13809501 D 4000 · 28151033 C 4000 · 4000.00 · 42000.00',
    (select string_agg(jl.account_code || case when jl.debit > 0 then ' D ' || round(jl.debit) else ' C ' || round(jl.credit) end, ' · ' order by jl.debit desc)
       from journal_lines jl where jl.journal_entry_id = (r -> 'aplicacion' -> 'libros' ->> 'asiento_id')::int)
      || ' · ' || pg_temp.cxc30(n3)::text || ' · ' || pg_temp.saldo30('28151033')::text);
  perform pg_temp.chk('L8 cuadre con el dueño: 281510 = saldos de sus liquidaciones (52.000 + 0) − anticipo en espera (10.000)', '42000.00',
    (select (sum(s.payable_amount) - 10000)::text from consignment_settlements s where s.note_id = n3 and s.status = 'liquidada'));
  r := fn_consignacion_recibida_anular_liquidacion(l, 'Se rehace la liquidación del período 2', o);
  perform pg_temp.chk('L9 anular la liquidación deshace su aplicación: reversión anulada con su contra-asiento, cruces sin imputar, pendiente escrito cerrado',
    '0.00 · 38000.00 · 2 · documento_anulado_sin_entrega',
    pg_temp.cxc30(n3)::text || ' · ' || pg_temp.saldo30('28151033')::text || ' · '
      || (select count(*)::text from consignment_advance_crossings c where c.note_id = n3 and c.settlement_id is null and c.amount in (40000, 15000)) || ' · '
      || (select max(f.resolution) from journal_entry_failures f where f.source = 'consignment_settlement_writing' and f.source_id = l::text));
  r := fn_consignacion_recibida_liquidar(n3, null, false, null, 'k30-l3c', o);
  perform pg_temp.chk('L10 reliquidar da la misma aplicación y los mismos libros', '0.00 · ajuste -4000.00 · 4000.00 · 42000.00',
    (r ->> 'por_pagar') || ' · ajuste ' || (r -> 'aplicacion' -> 'libros' ->> 'ajuste') || ' · ' || pg_temp.cxc30(n3)::text || ' · ' || pg_temp.saldo30('28151033')::text);
end $l30c$;
-- n2: un derecho frente al dueño (devolución de lo ya liquidado) no se descuenta si el orden no lo incluye.
do $l30d$
declare o int := 374; n2 uuid := current_setting('d30.n2')::uuid; r jsonb;
begin
  perform pg_temp.mover(o, 585, current_setting('d30.p2')::int, 'in', 1, 'return');
  perform pg_temp.mover(o, 585, current_setting('d30.p2')::int, 'out', 2, 'sale');
  perform pg_temp.err('L11 descontar un derecho frente al dueño que el orden del contrato no incluye', 'derechos_fuera_del_orden_de_aplicacion',
    format('select fn_consignacion_recibida_liquidar(%L, null, true, %L, %L, 374)', n2, 'Acuerdo escrito con el dueño 30-2', 'k30-l2x'));
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k30-l2b', o);
  perform pg_temp.chk('L12 sin descontar el derecho: recaudado 120.000, remuneración por cobrar 18.000, saldo para el dueño 120.000', '120000.00 · 18000.00 · 120000.00',
    (r -> 'aplicacion' ->> 'recaudado') || ' · ' || (r -> 'aplicacion' ->> 'remuneracion_por_cobrar_al_dueno') || ' · ' || (r ->> 'por_pagar'));
end $l30d$;

-- ── E · Liquidación por escrito: el plazo corre desde el CORTE; constancia de la entrega; pendiente si vence (13) ─────
do $e30$
declare
  o int := 374; n4 uuid := current_setting('d30.n4')::uuid; l3a uuid := current_setting('d30.l3a')::uuid; l2a uuid := current_setting('d30.l2a')::uuid;
  r jsonb; l4 uuid; hoy date := (now() at time zone 'America/Bogota')::date;
  q text := 'select fn_consignacion_liquidacion_entrega_registrar(%L, %L::date, %L, %L, 374)';
begin
  perform pg_temp.chk('E1 corte hace 10 días, plazo de 5 días desde el CORTE: venció hace 5 días; quedan los dos pendientes visibles',
    to_char(hoy - 10, 'YYYY-MM-DD') || ' · ' || to_char(hoy - 5, 'YYYY-MM-DD') || ' · 1 · 1',
    (select to_char(period_to, 'YYYY-MM-DD') || ' · ' || to_char(written_due_on, 'YYYY-MM-DD') from consignment_settlements where id = l3a) || ' · '
      || (select count(*)::text from journal_entry_failures f where f.source = 'consignment_settlement_writing' and f.source_id = l3a::text
            and f.reason = 'consignacion_liquidacion_escrita_por_entregar' and f.resolved_at is null) || ' · '
      || (select count(*)::text from journal_entry_failures f where f.source = 'consignment_settlement_writing' and f.source_id = l3a::text
            and f.reason = 'consignacion_liquidacion_escrita_vencida' and f.resolved_at is null));
  perform pg_temp.chk('E2 la venta fue hace 3 días y el corte es hoy: vence en 5 días desde el corte (no en 2 desde la última venta)',
    to_char(hoy + 5, 'YYYY-MM-DD') || ' · ' || to_char(hoy - 3, 'YYYY-MM-DD'),
    (select to_char(written_due_on, 'YYYY-MM-DD') from consignment_settlements where id = l2a) || ' · '
      || (select to_char(max(a.created_at at time zone 'America/Bogota'), 'YYYY-MM-DD') from consignment_allocations a where a.settlement_id = l2a));
  r := fn_consignacion_recibida_liquidar(n4, hoy - 10, false, null, 'k30-l4', o); l4 := r ->> 'liquidacion_id';
  perform set_config('d30.l4', l4::text, true);
  perform pg_temp.chk('E3 el contrato dice «desde la fecha de la liquidación» (cláusula citada): corte hace 10 días, vence en 3 días desde hoy',
    'fecha_de_liquidacion · ' || to_char(hoy, 'YYYY-MM-DD') || ' · ' || to_char(hoy + 3, 'YYYY-MM-DD') || ' · por_entregar',
    (r -> 'entrega_escrita' ->> 'plazo_desde') || ' · ' || (r -> 'entrega_escrita' ->> 'cuenta_desde') || ' · ' || (r -> 'entrega_escrita' ->> 'vence') || ' · '
      || (r -> 'entrega_escrita' ->> 'estado'));
  perform pg_temp.err('E4 entregada por un medio distinto del que fija el contrato', 'medio_distinto_del_pactado',
    format(q, l3a, hoy, 'documento_fisico', 'Recibido firmado por el dueño 30-3'));
  perform pg_temp.err('E5 con fecha futura', 'fecha_futura', format(q, l3a, hoy + 1, 'correo_electronico', 'Correo enviado al dueño 30-3'));
  perform pg_temp.err('E6 antes de existir la liquidación', 'fecha_anterior_a_la_liquidacion', format(q, l3a, hoy - 1, 'correo_electronico', 'Correo enviado al dueño 30-3'));
  perform pg_temp.err('E7 sin soporte', 'soporte_obligatorio', format(q, l3a, hoy, 'correo_electronico', 'ok'));
  r := fn_consignacion_liquidacion_entrega_registrar(l3a, hoy, 'correo_electronico', 'Correo enviado al dueño 30-3 con la liquidación adjunta (id 30-3-a)', o);
  perform pg_temp.chk('E8 constancia de entrega (fecha, medio y soporte): fuera de plazo; sus dos pendientes se cierran diciendo que fue tarde',
    'true · 0 · 2 · correo_electronico · Correo enviado al dueño 30-3 con la liquidación adjunta (id 30-3-a)',
    (r ->> 'fuera_de_plazo') || ' · '
      || (select count(*)::text from journal_entry_failures f where f.source = 'consignment_settlement_writing' and f.source_id = l3a::text and f.resolved_at is null) || ' · '
      || (select count(*)::text from journal_entry_failures f where f.source = 'consignment_settlement_writing' and f.source_id = l3a::text
            and f.resolution like 'entregada_fuera_de_plazo:%') || ' · '
      || (select written_delivery_medium || ' · ' || written_delivery_support from consignment_settlements where id = l3a));
  r := fn_consignacion_liquidacion_entrega_registrar(l3a, hoy, 'correo_electronico', 'Correo enviado al dueño 30-3 con la liquidación adjunta (id 30-3-a)', o);
  perform pg_temp.chk('E9 repetirla es idempotente', 'true', r ->> 'repetida');
  perform pg_temp.err('E10 registrarla otra vez con otros datos', 'entrega_ya_registrada', format(q, l3a, hoy, 'correo_electronico', 'Otro correo al dueño 30-3'));
  r := fn_consignacion_liquidacion_entrega_registrar(l2a, hoy, 'correo_electronico', 'Correo enviado al dueño 30-2 con la liquidación adjunta', o);
  perform pg_temp.chk('E11 entregada dentro del plazo', 'false', r ->> 'fuera_de_plazo');
end $e30$;
reset role;
-- Pasa el tiempo (simulado como administrador): el plazo de la liquidación de n4 vence sin entrega.
update consignment_settlements set written_due_on = (now() at time zone 'America/Bogota')::date - 1 where id = current_setting('d30.l4')::uuid;
select set_config('request.jwt.claims', current_setting('d30.u'), true);
set local role authenticated;
do $v30$
declare r jsonb; l4 uuid := current_setting('d30.l4')::uuid; l3a uuid := current_setting('d30.l3a')::uuid; l2a uuid := current_setting('d30.l2a')::uuid;
begin
  r := fn_consignacion_vigilar_liquidaciones_escritas(374);
  perform pg_temp.chk('E12 la vigilancia ve cada liquidación por escrito y deja el pendiente de la que venció sin entrega',
    'vencida · entregada_fuera_de_plazo · entregada · 1',
    (select string_agg(x ->> 'estado', ' · ' order by case (x ->> 'liquidacion_id')::uuid when l4 then 1 when l3a then 2 else 3 end)
       from jsonb_array_elements(r -> 'filas') x where (x ->> 'liquidacion_id')::uuid in (l4, l3a, l2a)) || ' · '
      || (select count(*)::text from journal_entry_failures f where f.source = 'consignment_settlement_writing' and f.source_id = l4::text
            and f.reason = 'consignacion_liquidacion_escrita_vencida' and f.resolved_at is null));
  r := fn_consignacion_vigilar_liquidaciones_escritas(374);
  perform pg_temp.chk('E13 volver a vigilar no duplica el pendiente', '1',
    (select count(*)::text from journal_entry_failures f where f.source = 'consignment_settlement_writing' and f.source_id = l4::text
       and f.reason = 'consignacion_liquidacion_escrita_vencida'));
end $v30$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── R2 · La reversión de la migración de cartera restaura EXACTAMENTE lo de hoy y devuelve los abonos a «por aplicar» ─
do $r30b$
begin
  execute pg_temp.archivo('20261110100000_cartera_abono_retencion_consignacion_rollback');
  perform pg_temp.chk('R2 revertida: las dos funciones aplicadas quedan byte a byte como hoy; la factura 1 vuelve a 1.710; los dos abonos, por aplicar con su pendiente',
    '4c772ca4a7d6926ce091a7910ea4e1d7 · e9cb33e070ea4c18e1912ee21455b8e6 · 1710.00 · partial · 2 · 2',
    md5(pg_get_functiondef('public.fn_invoice_sales_paid(uuid)'::regprocedure)) || ' · '
      || md5(pg_get_functiondef('public.fn_excedente_nota_credito(uuid)'::regprocedure)) || ' · '
      || (select balance::text || ' · ' || status from invoice_sales where id = current_setting('d30.inv1')::uuid) || ' · '
      || (select count(*)::text from consignment_withholding_receivable_applications x
           where x.withholding_id in (current_setting('d30.w1')::uuid, current_setting('d30.w2')::uuid) and x.status = 'por_aplicar') || ' · '
      || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.resolved_at is null
           and f.source_id in (current_setting('d30.w1'), current_setting('d30.w2'))));
  -- Y se vuelve a aplicar, para que lo que siga en la transacción vea el estado con la migración.
  execute pg_temp.archivo('20261110100000_cartera_abono_retencion_consignacion');
end $r30b$;
do $z30$
begin
  perform pg_temp.chk('Z1 asientos de la prueba 30 descuadrados', '0',
    (select count(*)::text from journal_entries e where e.organization_id = 374 and e.id > current_setting('d30.je0')::int
       and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z2 ningún abono por retención sin su cobro', '0',
    (select count(*)::text from consignment_withholding_receivable_applications x
      where not exists (select 1 from payments p where p.id = x.payment_id and p.status = 'completed')));
  perform pg_temp.chk('Z3 ningún ajuste de la aplicación toca el ingreso de la remuneración (413512)', '0',
    (select count(*)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.organization_id = 374 and e.id > current_setting('d30.je0')::int and e.source = 'consignment_commission_offset' and l.account_code like '413512%'));
end $z30$;

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
