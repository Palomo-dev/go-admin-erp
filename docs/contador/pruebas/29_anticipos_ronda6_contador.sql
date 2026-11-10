-- Pruebas en seco 29 · Anticipos, ronda 6 del Contador (RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md, respuestas 9 y 11):
-- reteIVA en exceso con el saldo que no alcance en los DOS períodos siguientes, igual que en la anulación (DUR 1625 de
-- 2016, art. 1.3.2.3.1: «aplicará el mismo procedimiento»), con la solicitud y la manifestación escritas; anticipo de AIU
-- SIN costo directo pendiente hasta validar el contrato y la naturaleza del pago (sin aplicarle el 10 % de todo el
-- contrato); CIERRE del contrato (su acta de liquidación final) con el piso del 10 % sobre el valor final. Casos que pasan
-- y casos que deben bloquear.
-- Fecha: 2026-11-10 · Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585). Operan su usuario dueño y, para
-- VALIDAR (nunca quien registró), un segundo usuario añadido como miembro de la 374 dentro de la transacción.
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- CARGA ejecuta, completas y exactas (md5 comprobado), las migraciones SIN APLICAR en orden de versión. El anticipo del
-- reintegro se fecha, como administrador, en el mes anterior.
-- Resultado: 29_anticipos_ronda6_contador.resultado.txt

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


-- ════ CUERPO: 29.sql ════
-- ════ 29 · Anticipos, ronda 6: reteIVA en exceso con el saldo en los DOS períodos siguientes (DUR 1.3.2.3.1, «aplicará el
--      mismo procedimiento»); anticipo de AIU sin costo directo pendiente hasta validar el contrato y la naturaleza del
--      pago (sin el 10 % de todo el contrato); CIERRE del contrato con el piso del 10 % sobre su valor final ════
select set_config('dry.prueba', '29', true);
-- Si corre después de otras pruebas (integrada), los controles de cuadre se vuelven a diferir como en una RPC.
set constraints all deferred;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s29$
declare
  v_g int; v_ica uuid;
begin
  insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
  select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, x.mov, c.requiere_centro_costo
    from public.chart_of_accounts c, (values ('133005', 'A proveedores', '1330', false), ('13300501', 'Anticipos a proveedores nacionales', '133005', true)) x(code, name, parent, mov)
   where c.organization_id = 374 and c.account_code = '1330'
     and not exists (select 1 from public.chart_of_accounts y where y.organization_id = 374 and y.account_code = x.code);
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select 374, null, 'anticipos_proveedores', '13300501'
   where not exists (select 1 from public.configuracion_contable where organization_id = 374 and clave = 'anticipos_proveedores');
  update public.configuracion_contable set account_code = '13300501' where organization_id = 374 and clave = 'anticipos_proveedores';
  if exists (select 1 from public.organization_tax_profiles where organization_id = 374) then
    update public.organization_tax_profiles set requiere_revision = false, agente_retencion = true, agente_retencion_iva = null, gran_contribuyente = null,
           responsabilidades = array['O-13', 'O-48'] where organization_id = 374;
  else
    insert into public.organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion, responsable_inc, periodicidad_iva)
    values (374, date '2026-01-01', 'ordinario', array['O-13', 'O-48'], true, false, 'bimestral');
  end if;
  -- Segundo miembro de la org 374 (el que valida como Contador: nunca quien registró el contrato).
  insert into public.organization_members (organization_id, user_id, role_id, is_active)
  select 374, o.owner_user_id, 2, true from public.organizations o
   where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba 29-G', '900000291', 'company', 'comun', array['O-48']) returning id into v_g;
  insert into public.reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, norma, vigente_desde)
  values (374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Servicios (prueba 29)', 9.66, 'Acuerdo municipal de ReteICA (prueba 29)', date '2025-01-01')
  returning id into v_ica;
  perform set_config('d29.g', v_g::text, true);
  perform set_config('d29.ica', v_ica::text, true);
  perform set_config('d29.r4', (select ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
                                 where ot.organization_id = 374 and tt.code = 'RETE_4'), true);
  perform set_config('d29.u', json_build_object('sub', (select owner_user_id from public.organizations where id = 374), 'role', 'authenticated')::text, true);
  perform set_config('d29.u2', json_build_object('sub', (select owner_user_id from public.organizations where id = 137), 'role', 'authenticated')::text, true);
  perform set_config('d29.je0', (select coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374), true);
end $s29$;
-- El acumulado AIU del contrato es interno (sin EXECUTE para authenticated): la prueba lo lee como administrador.
create function pg_temp.aiu_acum29(c uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$ select public.fn_aiu_contrato_acumulado(c) $$;
grant execute on function pg_temp.aiu_acum29(uuid) to authenticated;
-- El neto de un período también es interno: se lee igual.
create function pg_temp.neto29(per text) returns numeric language sql security definer set search_path = public, pg_temp as $$ select public.fn_retencion_neto_periodo(374, 'reteiva', per) $$;
grant execute on function pg_temp.neto29(text) to authenticated;

-- ── P · reteIVA en exceso: el saldo en los DOS períodos siguientes, como en la anulación (respuesta 9) ──────────────
do $p29$
declare r jsonb;
begin
  r := public.fn_retencion_periodo_descuento('reteiva', 'exceso', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P1 reteIVA en exceso: período del reintegro y el saldo en los DOS siguientes (DUR 1.3.2.3.1, «aplicará el mismo procedimiento»)',
    'DUR 1.3.2.3.1 · 2026-11 · dos_siguientes · ["2026-12", "2027-01"]',
    split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo') || ' · ' || (r -> 'periodos_saldo')::text);
  r := public.fn_retencion_periodo_descuento('reteiva', 'exceso', date '2026-11-20', date '2026-12-10');
  perform pg_temp.chk('P2 reintegro en diciembre: los dos períodos siguientes cruzan de año', '2026-12 · ["2027-01", "2027-02"]',
    (r ->> 'periodo') || ' · ' || (r -> 'periodos_saldo')::text);
  perform pg_temp.chk('P3 el saldo pendiente del exceso de reteIVA queda limitado a dos períodos', 'dos_siguientes · 2 · 5000',
    (select (d ->> 'saldo') || ' · ' || (d ->> 'limite_periodos') || ' · ' || round((d ->> 'por_descontar')::numeric)
       from (select public.fn_retencion_saldo_pendiente_detalle(public.fn_retencion_periodo_descuento('reteiva', 'exceso', date '2026-10-20', date '2026-11-09'),
                                                                'reteiva', 5000, '{}'::jsonb) d) x));
  r := public.fn_retencion_periodo_descuento('retefuente', 'exceso', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P4 renta en exceso no cambia: período del reintegro (DUR 1.2.4.16), el saldo en los siguientes sin límite',
    'DUR 1.2.4.16 · 2026-11 · siguientes_sin_limite', split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo'));
end $p29$;

-- El anticipo del reintegro se gira hoy y se fecha, como administrador, en el mes anterior: así el reintegro de este mes
-- no alcanza a descontarse en su período (sola, la prueba deja el saldo; en la integrada depende de lo que haya en el mes).
select set_config('request.jwt.claims', current_setting('d29.u'), true);
set local role authenticated;
do $e29a$
declare res jsonb;
begin
  res := public.fn_anticipo_proveedor_registrar(current_setting('d29.g')::int, 585, 1190000, 'transfer', 'pago_anticipado_precio', 'p29-X1', 374, 19,
           current_setting('d29.r4')::uuid, current_setting('d29.ica')::uuid, null, 'TRF-29-X1', null, null, true);
  perform set_config('d29.x1', res ->> 'anticipo_id', true);
end $e29a$;
reset role;
update public.supplier_advances set created_at = date_trunc('month', now()) - interval '10 days' where id = current_setting('d29.x1')::uuid;
update public.supplier_advance_withholdings set fecha = date_trunc('month', now()) - interval '10 days' where advance_id = current_setting('d29.x1')::uuid;
select set_config('request.jwt.claims', current_setting('d29.u'), true);
set local role authenticated;
do $e29b$
declare
  x uuid := current_setting('d29.x1')::uuid; res jsonb; neto numeric; per text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
  sig text := (jsonb_build_array(to_char(date_trunc('month', now() at time zone 'America/Bogota') + interval '1 month', 'YYYY-MM'),
                                 to_char(date_trunc('month', now() at time zone 'America/Bogota') + interval '2 months', 'YYYY-MM')))::text;
  sop jsonb := jsonb_build_object('calculo', 'La tarifa de reteIVA aplicable era 10 % del IVA', 'certificado', 'Certificado corregido 29-1',
                                  'solicitud', 'Solicitud escrita del proveedor 29-1', 'pruebas', 'Factura y RUT del proveedor',
                                  'manifestacion_no_imputacion', 'Manifestación escrita del proveedor: no imputó la retención en su declaración de IVA');
begin
  perform pg_temp.err('E1 sigue exigiéndose la manifestación escrita de no imputación', 'soporte_procedimiento_obligatorio',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 190000, 10, %L, %L, %L::jsonb, null, false, %L, 374)', x, 'reteiva', 'transfer', 'p29-E1',
           sop - 'manifestacion_no_imputacion', 'Tarifa de reteIVA equivocada'));
  res := public.fn_anticipo_retencion_exceso_reintegrar(x, 'reteiva', 190000, 10, 'transfer', 'p29-E2', sop, null, false, 'Tarifa de reteIVA equivocada', 374);
  perform pg_temp.chk('E2 reintegro 28.500 − 19.000 = 9.500 en el período del reintegro; el saldo va a los dos siguientes',
    '9500.00 · ' || per || ' · dos_siguientes · ' || sig,
    (res ->> 'reintegro') || ' · ' || (res ->> 'periodo_descuento') || ' · ' || (res ->> 'saldo') || ' · ' || (res -> 'periodos_saldo')::text);
  neto := pg_temp.neto29(per);
  perform pg_temp.chk('E3 si el período del reintegro no alcanza, el pendiente lleva el saldo a los DOS siguientes (límite 2)',
    case when neto < 0 then 'dos_siguientes · ' || sig || ' · 2 · ' || round(-neto)::text else 'el período alcanza: sin saldo pendiente' end,
    case when neto < 0 then
      (select (p.detalle ->> 'saldo') || ' · ' || (p.detalle -> 'periodos_saldo')::text || ' · ' || (p.detalle ->> 'limite_periodos') || ' · '
              || round((p.detalle ->> 'por_descontar')::numeric)::text
         from public.anticipo_pendientes p where p.advance_id = x and p.tipo = 'descuento_retencion_siguientes_periodos' and p.detalle ->> 'clase' = 'reteiva')
    else
      case when exists (select 1 from public.anticipo_pendientes p where p.advance_id = x and p.tipo = 'descuento_retencion_siguientes_periodos')
           then 'pendiente sin saldo' else 'el período alcanza: sin saldo pendiente' end
    end);
  perform pg_temp.chk('E4 el ajuste guarda la regla del período con su artículo y los dos soportes', 'DUR 1.3.2.3.1 · true',
    (select split_part(a.regla_periodo, ':', 1) || ' · ' || (a.soportes ? 'solicitud' and a.soportes ? 'manifestacion_no_imputacion')::text
       from public.supplier_advance_withholding_ajustes a where a.advance_id = x and a.tipo = 'retencion_excesiva'));
end $e29b$;

-- ── A · Anticipo de AIU SIN costo directo y cierre del contrato (respuesta 11) ─────────────────────────────────────
do $a29$
declare
  g int := current_setting('d29.g')::int; r4 uuid := current_setting('d29.r4')::uuid; ica uuid := current_setting('d29.ica')::uuid;
  ct jsonb := '{"numero":"A-29","fecha":"2026-01-05","archivo":"contratos/a-29.pdf","valor":1000000}';
  c462 jsonb := '{"aiu_discriminado":true,"requisitos_prestador":"Empresa de vigilancia con el AIU discriminado en el contrato"}';
  solo_aiu jsonb := '[{"tratamiento":"aiu_administracion","base":30000},{"tratamiento":"aiu_imprevistos","base":10000},{"tratamiento":"aiu_utilidad","base":10000}]';
  c1 uuid; e jsonb; res jsonb; a1 uuid; p1 uuid; hoy date := (now() at time zone 'America/Bogota')::date;
  q text := 'select public.fn_aiu_contrato_cerrar(%L, %L::jsonb, 374)';
begin
  c1 := public.fn_aiu_contrato_registrar(374, g, 'servicios_462_1', 'Servicio de vigilancia de la sede (prueba 29)', 'vigilancia', ct,
                                         'Estatuto Tributario, art. 462-1', c462, 'base_especial', 'valor_total', date '2026-01-01');
  perform set_config('d29.c1', c1::text, true);
  -- A1: anticipo de A + I + U = 50.000 (sin costo directo) con el contrato todavía sin validar.
  res := public.fn_anticipo_proveedor_registrar(g, 585, 59500, 'transfer', 'pago_anticipado_precio', 'p29-A1', 374, 19, r4, ica, null, 'TRF-29-A1', null,
           solo_aiu, true, c1);
  a1 := (res ->> 'anticipo_id')::uuid;
  e := res -> 'evaluacion';
  perform pg_temp.chk('A1 anticipo de AIU sin costo directo: base del IVA = A + I + U (50.000), NO el 10 % del contrato (100.000); retenciones pendientes',
    '50000 · true · false · false · true · 0 · 59500.00',
    round((e -> 'aiu' ->> 'base_iva')::numeric)::text || ' · ' || (e -> 'aiu' ->> 'sin_costo_directo') || ' · ' || (e -> 'aiu' ->> 'minimo_10_aplicado') || ' · '
      || (e -> 'aiu' ->> 'minimo_10_contrato_aplicado') || ' · ' || (res ->> 'retencion_pendiente') || ' · ' || (res ->> 'retencion') || ' · ' || (res ->> 'girado'));
  select id into p1 from public.anticipo_pendientes where advance_id = a1 and tipo = 'retencion_por_evaluar' and estado = 'abierto';
  perform pg_temp.chk('A2 queda el pendiente visible de la retención por evaluar', 'true', (p1 is not null)::text);
  perform pg_temp.err('A3 resolver el pendiente (validar la naturaleza del pago) con el contrato SIN validar: bloqueado', 'aiu_contrato_sin_validar',
    format('select public.fn_anticipo_pendiente_resolver(%L, %L, %L, 374)', p1, 'El pago anticipado corresponde a la administración del mes', 'Concepto N-29'));
  perform set_config('request.jwt.claims', current_setting('d29.u2'), true);
  perform public.fn_tributario_regla_validar('aiu_contrato', c1, 'validado', 'Vigilancia comprendida en el art. 462-1; AIU discriminado; prestador habilitado', 'Concepto C-29-1', 374);
  perform set_config('request.jwt.claims', current_setting('d29.u'), true);
  -- A4: validado el contrato, otro anticipo de solo A + I + U sigue pendiente: falta validar la naturaleza del pago.
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 59500, 19, r4, ica, solo_aiu, true, c1);
  perform pg_temp.chk('A4 con el contrato validado, el anticipo de AIU sin costo directo sigue pendiente (motivo propio)', 'true · aiu_anticipo_sin_costo_directo · 50000',
    (e ->> 'pendiente') || ' · ' || (e -> 'clases' -> 0 ->> 'motivo') || ' · ' || round((e -> 'aiu' ->> 'base_iva')::numeric)::text);
  -- A5: un anticipo CON costo directo no cambia (piso por operación de la ronda 5).
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":910000},{"tratamiento":"aiu_administracion","base":30000},{"tratamiento":"aiu_imprevistos","base":30000},{"tratamiento":"aiu_utilidad","base":30000}]'::jsonb, true, c1);
  perform pg_temp.chk('A5 con costo directo: piso del 10 % de la operación como en la ronda 5; no es «sin costo directo»', '100000 · true · false',
    round((e -> 'aiu' ->> 'base_iva')::numeric)::text || ' · ' || (e -> 'aiu' ->> 'minimo_10_aplicado') || ' · ' || (e -> 'aiu' ->> 'sin_costo_directo'));
  -- C · Cerrar el contrato = registrar su acta de liquidación final.
  perform pg_temp.err('C1 cerrar con un anticipo de AIU sin costo directo pendiente: bloqueado', 'aiu_cierre_con_anticipos_pendientes',
    format(q, c1, jsonb_build_object('fecha', hoy, 'valor_final', 1000000, 'base_iva_final', 100000, 'acta', 'Acta de liquidación A-29')));
  res := public.fn_anticipo_pendiente_resolver(p1, 'Validada la naturaleza: pago anticipado de la administración del primer mes', 'Concepto N-29', 374);
  perform pg_temp.chk('A6 validado el contrato, se valida la naturaleza del pago (el pendiente se resuelve)', 'resuelto · false',
    (res ->> 'estado') || ' · ' || (select retencion_pendiente::text from public.supplier_advances where id = a1));
  perform pg_temp.err('C2 cerrar con la base final por debajo del 10 % del valor final (60.000 de 1.000.000): no se da por buena', 'aiu_minimo_10_contrato_al_cierre',
    format(q, c1, jsonb_build_object('fecha', hoy, 'valor_final', 1000000, 'base_iva_final', 60000, 'acta', 'Acta de liquidación A-29')));
  perform pg_temp.err('C3 cerrar con un valor final menor que lo que ya registran sus operaciones (40.000 < 50.000)', 'aiu_cierre_inconsistente_con_operaciones',
    format(q, c1, jsonb_build_object('fecha', hoy, 'valor_final', 40000, 'base_iva_final', 40000, 'acta', 'Acta de liquidación A-29')));
  perform pg_temp.err('C4 cerrar sin el acta', 'aiu_cierre_incompleto', format(q, c1, jsonb_build_object('fecha', hoy, 'valor_final', 1000000, 'base_iva_final', 100000)));
  res := public.fn_aiu_contrato_cerrar(c1, jsonb_build_object('fecha', hoy, 'valor_final', 1000000, 'base_iva_final', 100000, 'acta', 'Acta de liquidación A-29'), 374);
  perform pg_temp.chk('C5 cierre con la base final en el piso (100.000 = 10 % de 1.000.000): cerrado, con lo que registran sus operaciones',
    'false · 100000 · 50000 · 50000',
    (res ->> 'repetida') || ' · ' || round((res -> 'resumen' ->> 'piso_10')::numeric)::text || ' · '
      || round((res -> 'resumen' -> 'acumulado_operaciones' ->> 'valor')::numeric)::text || ' · '
      || round((res -> 'resumen' -> 'acumulado_operaciones' ->> 'base_iva')::numeric)::text);
  res := public.fn_aiu_contrato_cerrar(c1, jsonb_build_object('fecha', hoy, 'valor_final', 1000000, 'base_iva_final', 100000, 'acta', 'Acta de liquidación A-29'), 374);
  perform pg_temp.chk('C6 repetir el mismo cierre es idempotente', 'true', res ->> 'repetida');
  perform pg_temp.err('C7 cerrar otra vez con otros datos', 'aiu_contrato_ya_cerrado',
    format(q, c1, jsonb_build_object('fecha', hoy, 'valor_final', 1200000, 'base_iva_final', 120000, 'acta', 'Acta de liquidación A-29 bis')));
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":910000},{"tratamiento":"aiu_administracion","base":30000},{"tratamiento":"aiu_imprevistos","base":30000},{"tratamiento":"aiu_utilidad","base":30000}]'::jsonb, true, c1);
  perform pg_temp.chk('C8 un contrato cerrado no admite operaciones nuevas: sus retenciones quedan pendientes', 'true · aiu_contrato_cerrado',
    (e ->> 'pendiente') || ' · ' || (e -> 'clases' -> 0 ->> 'motivo'));
end $a29$;
reset role;
do $z29$
begin
  perform pg_temp.chk('Z1 asientos de la prueba 29: todos cuadran; ninguno en 1330', 'true · 0',
    (select bool_and(t.d = t.c)::text || ' · ' || sum(t.en_1330)::text from public.journal_entries je
       join (select journal_entry_id, sum(debit) d, sum(credit) c, count(*) filter (where account_code = '1330') en_1330 from public.journal_lines group by 1) t
         on t.journal_entry_id = je.id
      where je.organization_id = 374 and je.id > current_setting('d29.je0')::int));
  perform pg_temp.chk('Z2 el cierre quedó con quién, cuándo y el acta', 'true',
    (select (cerrado_por is not null and cerrado_en is not null and cierre_acta = 'Acta de liquidación A-29')::text from public.aiu_contratos where id = current_setting('d29.c1')::uuid));
end $z29$;

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
