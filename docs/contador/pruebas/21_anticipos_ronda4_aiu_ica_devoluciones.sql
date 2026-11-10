-- Pruebas en seco 21 · Anticipos, ronda 4 del Contador (RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md, «Anticipos»): AIU en
-- dos regímenes (art. 462-1 E.T. y construcción, DUR 1.3.1.7.9) detrás de la validación del Contador; procedimiento de
-- ReteICA por municipio (sin él, bloqueado; sin trasladar el de otro municipio); devoluciones con soporte del hecho (la
-- solicitud del proveedor sola no basta), resolución parcial por líneas (no prorrata ciega), período de descuento fijado
-- por la regla de cada impuesto, entre períodos y entre años; conversión de la financiación en pago o abono sin depender
-- de la factura. Casos que pasan y casos que deben bloquear.
-- Fecha: 2026-11-09 · Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585). Operan su usuario miembro y, para
-- VALIDAR (nunca quien registró), un segundo usuario añadido como miembro de la 374 dentro de la transacción.
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- CARGA ejecuta, completas y exactas (md5 comprobado), las migraciones SIN APLICAR en orden de versión. Para los casos
-- entre períodos y entre años se fechan, como administrador, un anticipo y sus retenciones en octubre de 2026 y en
-- diciembre de 2025. Resultado: 21_anticipos_ronda4_aiu_ica_devoluciones.resultado.txt

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


-- ════ CUERPO: 21.sql ════
-- ════ 21 · Anticipos, ronda 4: AIU por régimen, procedimiento municipal de ReteICA, devoluciones por el hecho y por líneas,
--      período de descuento por impuesto (entre períodos y entre años) y conversión de la financiación en pago o abono ════
select set_config('dry.prueba', '21', true);
-- Si corre después de la 11 (prueba 20), esta dejó los controles de cuadre inmediatos: se vuelven a diferir como en una RPC.
set constraints all deferred;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s21$
declare
  v_g int; v_h int; v_ica uuid;
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
  -- Segundo miembro de la org 374 (el que valida como Contador: nunca quien registró la regla).
  insert into public.organization_members (organization_id, user_id, role_id, is_active)
  select 374, o.owner_user_id, 2, true from public.organizations o
   where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba 21-G', '900000211', 'company', 'comun', array['O-48']) returning id into v_g;
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba 21-H', '900000212', 'company', 'comun', array['O-48']) returning id into v_h;
  insert into public.reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, norma, vigente_desde)
  values (374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Servicios (prueba 21)', 9.66, 'Acuerdo municipal de ReteICA (prueba 21)', date '2025-01-01')
  returning id into v_ica;
  perform set_config('d21.g', v_g::text, true);
  perform set_config('d21.h', v_h::text, true);
  perform set_config('d21.ica', v_ica::text, true);
  perform set_config('d21.r4', (select ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
                                 where ot.organization_id = 374 and tt.code = 'RETE_4'), true);
  perform set_config('d21.u', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
  perform set_config('d21.u2', json_build_object('sub', (select owner_user_id from public.organizations where id = 137), 'role', 'authenticated')::text, true);
  perform set_config('d21.je0', (select coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374), true);
end $s21$;
select set_config('request.jwt.claims', current_setting('d21.u'), true);
set local role authenticated;

-- ── A · AIU: dos regímenes, fundamento estructurado, nada opera sin la validación del Contador ──────────────────────
do $a21$
declare
  g int := current_setting('d21.g')::int; h int := current_setting('d21.h')::int;
  r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  u text := current_setting('d21.u'); u2 text := current_setting('d21.u2');
  ct jsonb := '{"numero":"A-21","fecha":"2026-01-05","archivo":"contratos/a-21.pdf","valor":5000000}';
  c462 jsonb := '{"aiu_discriminado":true,"requisitos_prestador":"Empresa de aseo con el AIU discriminado en el contrato"}';
  ccon jsonb := '{"objeto":"construccion_inmueble","licencia_construccion":"LC-11001-2026-0042","honorarios_pactados":false}';
  c1 uuid; c2 uuid; c3 uuid; e jsonb;
  q text := 'select public.fn_aiu_contrato_registrar(374, %s, %L, %L, %L, %L::jsonb, %L, %L::jsonb, %L, %L, %L::date)';
begin
  perform pg_temp.err('A1a 462-1 sin servicio comprendido', 'aiu_condiciones_462_1', format(q, g, 'servicios_462_1', 'Servicio de vigilancia de la sede', null, ct,
    'Estatuto Tributario, art. 462-1', c462, 'base_especial', 'valor_total', '2026-01-01'));
  perform pg_temp.err('A1b mantenimiento con «AIU» no pasa a construcción', 'aiu_mantenimiento_no_es_construccion', format(q, g, 'construccion_inmuebles',
    'Mantenimiento de la fachada con AIU', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9', '{"objeto":"mantenimiento","honorarios_pactados":false}', 'base_especial', 'valor_total', '2026-01-01'));
  perform pg_temp.err('A1c construcción sin licencia de construcción', 'aiu_condiciones_construccion', format(q, g, 'construccion_inmuebles',
    'Construcción de la bodega nueva', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9', '{"objeto":"construccion_inmueble","honorarios_pactados":false}', 'base_especial', 'valor_total', '2026-01-01'));
  perform pg_temp.err('A1d contrato sin archivo', 'aiu_contrato_incompleto', format(q, g, 'servicios_462_1', 'Servicio de aseo de la sede', 'aseo',
    '{"numero":"A-21","fecha":"2026-01-05","valor":5000000}', 'Estatuto Tributario, art. 462-1', c462, 'base_especial', 'valor_total', '2026-01-01'));
  c1 := public.fn_aiu_contrato_registrar(374, g, 'servicios_462_1', 'Servicio de aseo de la sede principal', 'aseo', ct, 'Estatuto Tributario, art. 462-1', c462,
                                         'base_especial', 'valor_total', date '2026-01-01');
  c2 := public.fn_aiu_contrato_registrar(374, g, 'construccion_inmuebles', 'Construcción de la bodega nueva', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9', ccon,
                                         'valor_total', 'valor_total', date '2026-01-01');
  c3 := public.fn_aiu_contrato_registrar(374, g, 'construccion_inmuebles', 'Construcción del local con honorarios', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9',
                                         ccon || '{"honorarios_pactados":true}', 'valor_total', 'valor_total', date '2026-01-01');
  perform pg_temp.chk('A2a contratos registrados nacen pendientes de validación', 'pendiente_validacion,pendiente_validacion,pendiente_validacion',
    (select string_agg(estado, ',' order by created_at, id) from public.aiu_contratos where id in (c1, c2, c3)));
  perform pg_temp.err('A2b valida quien registró', 'validador_debe_ser_distinto',
    format('select public.fn_tributario_regla_validar(%L, %L, %L, %L, %L, 374)', 'aiu_contrato', c1, 'validado', 'Concepto del Contador sobre el contrato de aseo', 'Acta 1'));
  perform set_config('request.jwt.claims', u2, true);
  perform pg_temp.err('A2c concepto corto', 'concepto_obligatorio',
    format('select public.fn_tributario_regla_validar(%L, %L, %L, %L, %L, 374)', 'aiu_contrato', c1, 'validado', 'ok', 'Acta 1'));
  perform pg_temp.chk('A2d el Contador (otro usuario) valida el 462-1', 'validado',
    public.fn_tributario_regla_validar('aiu_contrato', c1, 'validado', 'Servicio de aseo comprendido en el art. 462-1; AIU discriminado; prestador habilitado', 'Concepto C-21-1', 374) ->> 'estado');
  perform pg_temp.err('A2e una regla ya decidida no se vuelve a decidir', 'regla_ya_decidida',
    format('select public.fn_tributario_regla_validar(%L, %L, %L, %L, %L, 374)', 'aiu_contrato', c1, 'rechazado', 'Intento de cambiar la decisión ya tomada', 'Acta 2'));
  perform public.fn_tributario_regla_validar('aiu_contrato', c2, 'validado', 'Construcción de inmueble con licencia; sin honorarios pactados: base la utilidad', 'Concepto C-21-2', 374);
  perform public.fn_tributario_regla_validar('aiu_contrato', c3, 'validado', 'Construcción de inmueble con licencia y honorarios pactados del constructor', 'Concepto C-21-3', 374);
  perform set_config('request.jwt.claims', u, true);

  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1038000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', true, c1);
  perform pg_temp.chk('A3 462-1 validado: base A+I+U 200.000 (20 %), IVA 38.000; retefuente 4 % sobre la base especial; reteIVA 15 %; reteICA sobre el total',
    'iva 38000.00 · base IVA 200000.00 · rete 8000 · reteIVA 5700 · reteICA 9660 · mínimo false',
    format('iva %s · base IVA %s · rete %s · reteIVA %s · reteICA %s · mínimo %s', e ->> 'iva', e -> 'aiu' ->> 'base_iva', e -> 'clases' -> 0 ->> 'valor',
           e -> 'clases' -> 1 ->> 'valor', e -> 'clases' -> 2 ->> 'valor', e -> 'aiu' ->> 'minimo_10_aplicado'));
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":950000},{"tratamiento":"aiu_administracion","base":20000},{"tratamiento":"aiu_imprevistos","base":10000},{"tratamiento":"aiu_utilidad","base":20000}]', true, c1);
  perform pg_temp.chk('A4 462-1 con AIU de 50.000 (5 %): la base no baja del 10 % del valor (100.000)', 'base IVA 100000.00 · iva 19000.00 · mínimo true · rete 4000',
    format('base IVA %s · iva %s · mínimo %s · rete %s', e -> 'aiu' ->> 'base_iva', e ->> 'iva', e -> 'aiu' ->> 'minimo_10_aplicado', e -> 'clases' -> 0 ->> 'valor'));
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1009500, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":900000},{"tratamiento":"aiu_administracion","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', true, c2);
  perform pg_temp.chk('A5 construcción sin honorarios: IVA sobre la utilidad (50.000), SIN el mínimo del 10 %', 'base IVA 50000.00 · iva 9500.00 · mínimo false · reteIVA 1425',
    format('base IVA %s · iva %s · mínimo %s · reteIVA %s', e -> 'aiu' ->> 'base_iva', e ->> 'iva', e -> 'aiu' ->> 'minimo_10_aplicado', e -> 'clases' -> 1 ->> 'valor'));
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":900000},{"tratamiento":"aiu_honorarios","base":100000}]', true, c3);
  perform pg_temp.chk('A6 construcción con honorarios pactados: IVA sobre los honorarios del constructor', 'base IVA 100000.00 · iva 19000.00',
    format('base IVA %s · iva %s', e -> 'aiu' ->> 'base_iva', e ->> 'iva'));
  perform pg_temp.err('A7 honorarios en un contrato del 462-1', 'aiu_componentes_regimen', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1019000, 19, %L, %L, %L::jsonb, true, %L)',
    g, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"aiu_costo_directo","base":900000},{"tratamiento":"aiu_honorarios","base":100000}]', c1));
  perform pg_temp.err('A8 AIU mezclado con una línea gravada', 'aiu_componentes_mezclados', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1309000, 19, %L, %L, %L::jsonb, true, %L)',
    g, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"gravado","base":100000,"tarifa_iva":19},{"tratamiento":"aiu_costo_directo","base":1000000},{"tratamiento":"aiu_utilidad","base":100000}]', c1));
  perform pg_temp.err('A9 contrato AIU de otro proveedor', 'aiu_contrato_invalido', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1038000, 19, %L, %L, %L::jsonb, true, %L)',
    h, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', c1));
  perform pg_temp.err('A10 AIU sin tarifa de IVA', 'tarifa_iva_invalida', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1038000, null, %L, %L, %L::jsonb, true, %L)',
    g, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', c1));
end $a21$;

-- ── B · ReteICA: procedimiento del MISMO municipio, validado; sin él, bloqueado ─────────────────────────────────────
do $b21$
declare
  g int := current_setting('d21.g')::int; r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  u text := current_setting('d21.u'); u2 text := current_setting('d21.u2');
  x1 uuid; pb uuid; pm uuid; res jsonb;
  proc jsonb; sop jsonb := '{"calculo":"Cálculo de la línea devuelta","certificado":"Certificado corregido 21"}';
  hecho jsonb := jsonb_build_object('tipo', 'acta_devolucion', 'documento', 'Acta de devolución 21-1', 'fecha', current_date);
  lin jsonb := '[{"componente":"0","base":100000,"iva":19000}]';
  q text := 'select public.fn_anticipo_proveedor_devolver(%L, 111184, %L, %L, %L, 374, null, %L, %L::jsonb)';
begin
  perform pg_temp.err('B1 procedimiento sin pruebas', 'procedimiento_ica_incompleto',
    format('select public.fn_reteica_procedimiento_registrar(374, %L, %L, %L, %L::text[], %L, %L, %L, %L, %L::date)', '6c5bba87-87af-4e41-9b2d-5381d7a3b04f',
           'Acuerdo municipal (prueba 21)', 'Solicitud escrita del afectado', '{}', 'Reintegro por transferencia al proveedor', 'Certificado corregido del bimestre',
           'periodo_siguiente_al_reintegro', 'Se descuentan en los bimestres siguientes', '2026-01-01'));
  res := public.fn_anticipo_proveedor_registrar(g, 585, 1190000, 'transfer', 'pago_anticipado_precio', 'p21-X1', 374, 19, r4, ica, null, 'TRF-21-X1', null, null, true);
  x1 := (res ->> 'anticipo_id')::uuid;
  perform set_config('d21.x1', x1::text, true);
  perform pg_temp.chk('B2a anticipo con reteICA municipal practicada al girar', '40000 · 9660 · 28500',
    (select string_agg(round(w.valor)::text, ' · ' order by w.clase) from public.supplier_advance_withholdings w where w.advance_id = x1));
  proc := jsonb_build_object('causa', 'devolucion_parcial', 'requiere_correccion', false, 'hecho', hecho, 'lineas', lin, 'soportes', sop);
  perform pg_temp.err('B2b reversión de reteICA sin procedimiento del municipio: bloqueada', 'reteica_sin_procedimiento_municipal',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B2b', 'Consignación 21-1', proc));
  pm := public.fn_reteica_procedimiento_registrar(374, '3c3b7d69-2711-4d3c-b116-c6113cf6b3b5', 'Norma de ReteICA de otro municipio (prueba)', 'Solicitud escrita ante el agente',
          array['prueba_pago'], 'Reintegro por transferencia al proveedor', 'Certificado corregido del bimestre', 'periodo_del_reintegro',
          'Se descuentan en los bimestres siguientes', date '2026-01-01');
  perform set_config('request.jwt.claims', u2, true);
  perform public.fn_tributario_regla_validar('reteica_procedimiento', pm, 'validado', 'Procedimiento del otro municipio revisado contra su norma', 'Concepto ICA-2', 374);
  perform set_config('request.jwt.claims', u, true);
  perform pg_temp.err('B3 el procedimiento validado de OTRO municipio no se traslada', 'reteica_sin_procedimiento_municipal',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B3', 'Consignación 21-1', proc));
  pb := public.fn_reteica_procedimiento_registrar(374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Acuerdo municipal de ReteICA (prueba 21)',
          'Solicitud escrita del afectado ante el agente retenedor', array['prueba_pago', 'liquidacion_corregida'], 'Reintegro por transferencia al proveedor',
          'Certificado de ReteICA corregido del bimestre', 'periodo_siguiente_al_reintegro', 'Lo que no alcance se descuenta en los bimestres siguientes', date '2026-01-01');
  perform pg_temp.err('B4a procedimiento del municipio registrado pero sin validar: sigue bloqueado', 'reteica_sin_procedimiento_municipal',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B4a', 'Consignación 21-1', proc));
  perform set_config('request.jwt.claims', u2, true);
  perform public.fn_tributario_regla_validar('reteica_procedimiento', pb, 'validado', 'Procedimiento del municipio revisado contra el acuerdo municipal', 'Concepto ICA-1', 374);
  perform set_config('request.jwt.claims', u, true);
  perform pg_temp.err('B4b validado, pero sin las pruebas que el procedimiento exige', 'reteica_pruebas_incompletas',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B4b', 'Consignación 21-1', proc));
  proc := jsonb_set(proc, '{soportes}', sop || jsonb_build_object('ica', jsonb_build_object('solicitud', 'Radicado 21-7', 'certificado', 'Certificado ICA 21-7',
                                                                                         'prueba_pago', 'Comprobante 21-7', 'liquidacion_corregida', 'Liquidación 21-7')));
  res := public.fn_anticipo_proveedor_devolver(x1, 111184, 'transfer', 'Devolución parcial', 'p21-B4c', 374, null, 'Consignación 21-1', proc);
  perform pg_temp.chk('B4c con el procedimiento del municipio y sus pruebas: retefuente 4.000 · reteIVA 2.850 · reteICA 966',
    '7816.00 · ' || to_char(current_date, 'YYYY-MM') || ' · ' || to_char(current_date + interval '1 month', 'YYYY-MM'),
    (res ->> 'retencion_revertida') || ' · '
    || (select periodo_descuento from public.supplier_advance_withholding_ajustes where advance_id = x1 and clase = 'retefuente' and tipo = 'devolucion') || ' · '
    || (select periodo_descuento from public.supplier_advance_withholding_ajustes where advance_id = x1 and clase = 'reteica' and tipo = 'devolucion'));
  -- Ronda 5: la anulación en renta es el art. 1.2.4.8 del DUR (la ronda 4 citaba un artículo que no trata devoluciones).
  perform pg_temp.chk('B4d la regla del período queda escrita por impuesto', 'retefuente:DUR 1.2.4.8 · reteica:periodo_siguiente_al_reintegro',
    (select string_agg(clase || ':' || split_part(regla_periodo, ':', 1), ' · ' order by clase) from public.supplier_advance_withholding_ajustes
      where advance_id = x1 and tipo = 'devolucion' and clase in ('retefuente', 'reteica')));
  -- Reintegro de reteICA en exceso: 9.660 − 966 = 8.694 vigente; la correcta era 4,14 ‰ sobre 900.000 = 3.726 → exceso 4.968.
  perform pg_temp.err('B5a exceso de retefuente sin la solicitud del afectado y sus pruebas', 'soporte_procedimiento_obligatorio',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 900000, 2.5, %L, %L, %L::jsonb, null, false, %L, 374)', x1, 'retefuente', 'transfer', 'p21-B5a',
           '{"calculo":"Cálculo","certificado":"Certificado"}', 'Tarifa equivocada'));
  perform pg_temp.err('B5b reteICA en exceso sin las pruebas del procedimiento', 'reteica_pruebas_incompletas',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 900000, 0.414, %L, %L, %L::jsonb, null, false, %L, 374)', x1, 'reteica', 'transfer', 'p21-B5b',
           '{"calculo":"Cálculo","certificado":"Certificado","solicitud":"Solicitud 9","pruebas":"Factura"}', 'Tarifa equivocada'));
  perform pg_temp.err('B5c el período de descuento no se elige', 'periodo_descuento_no_es_de_libre_eleccion',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 900000, 0.414, %L, %L, %L::jsonb, %L, false, %L, 374)', x1, 'reteica', 'transfer', 'p21-B5c',
           jsonb_build_object('calculo', 'Cálculo', 'certificado', 'Certificado', 'solicitud', 'Solicitud 9', 'pruebas', 'Factura',
                              'ica', jsonb_build_object('solicitud', 'Radicado 21-8', 'certificado', 'Certificado ICA 21-8', 'prueba_pago', 'Comprobante 21-8',
                                                        'liquidacion_corregida', 'Liquidación 21-8')), to_char(current_date, 'YYYY-MM'), 'Tarifa equivocada'));
  res := public.fn_anticipo_retencion_exceso_reintegrar(x1, 'reteica', 900000, 0.414, 'transfer', 'p21-B5d',
           jsonb_build_object('calculo', 'Tarifa de la actividad: 4,14 por mil', 'certificado', 'Certificado ICA corregido', 'solicitud', 'Solicitud 9', 'pruebas', 'Factura',
                              'ica', jsonb_build_object('solicitud', 'Radicado 21-8', 'certificado', 'Certificado ICA 21-8', 'prueba_pago', 'Comprobante 21-8',
                                                        'liquidacion_corregida', 'Liquidación 21-8')), null, false, 'Tarifa equivocada', 374);
  perform pg_temp.chk('B5d reintegro del exceso de reteICA en el período que fija el procedimiento', '4968.00 · ' || to_char(current_date + interval '1 month', 'YYYY-MM'),
    (res ->> 'reintegro') || ' · ' || (res ->> 'periodo_descuento'));
end $b21$;

-- ── C · Devoluciones: soporte del hecho, líneas afectadas, período por impuesto ─────────────────────────────────────
do $c21$
declare
  g int := current_setting('d21.g')::int; r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  x2 uuid; res jsonb; base jsonb; q text;
  ica_sop jsonb := jsonb_build_object('solicitud', 'Radicado 21-9', 'certificado', 'Certificado ICA 21-9', 'prueba_pago', 'Comprobante 21-9', 'liquidacion_corregida', 'Liquidación 21-9');
begin
  res := public.fn_anticipo_proveedor_registrar(g, 585, 795000, 'transfer', 'pago_anticipado_precio', 'p21-X2', 374, null, r4, ica, null, 'TRF-21-X2', null,
           '[{"descripcion":"Servicio gravado","tratamiento":"gravado","base":500000,"tarifa_iva":19},{"descripcion":"Bien excluido","tratamiento":"excluido","base":200000}]', true);
  x2 := (res ->> 'anticipo_id')::uuid;
  perform pg_temp.chk('C0 anticipo mixto: retefuente 28.000 · reteIVA 14.250 · reteICA 6.762', '28000 · 6762 · 14250',
    (select string_agg(round(w.valor)::text, ' · ' order by w.clase) from public.supplier_advance_withholdings w where w.advance_id = x2));
  base := jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
            'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 21-2', 'fecha', current_date),
            'lineas', '[{"componente":"1","base":200000,"iva":0}]'::jsonb,
            'soportes', jsonb_build_object('calculo', 'Línea excluida resuelta', 'certificado', 'Certificado corregido 21-2', 'ica', ica_sop));
  q := 'select public.fn_anticipo_proveedor_devolver(%L, 190068, %L, %L, %L, 374, null, %L, %L::jsonb)';
  perform pg_temp.err('C1a la solicitud del proveedor sola no prueba la resolución', 'solicitud_no_prueba_el_hecho',
    format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1a', 'Consignación 21-2',
           jsonb_set(base, '{hecho}', jsonb_build_object('tipo', 'solicitud_proveedor', 'documento', 'Carta del proveedor', 'fecha', current_date))));
  perform pg_temp.err('C1b sin soporte del hecho', 'soporte_del_hecho_obligatorio', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1b', 'Consignación 21-2', base - 'hecho'));
  perform pg_temp.err('C1c resolución parcial sin líneas afectadas', 'lineas_afectadas_obligatorias', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1c', 'Consignación 21-2', base - 'lineas'));
  perform pg_temp.err('C1d línea que excede lo que queda de ella', 'linea_excede_lo_pendiente', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1d', 'Consignación 21-2',
    jsonb_set(base, '{lineas}', '[{"componente":"1","base":250000,"iva":0}]')));
  perform pg_temp.err('C1e IVA de la línea que no es el de la operación', 'linea_iva_no_cuadra', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1e', 'Consignación 21-2',
    jsonb_set(base, '{lineas}', '[{"componente":"0","base":100000,"iva":0}]')));
  perform pg_temp.err('C1f el período de descuento no es de libre elección', 'periodo_descuento_no_es_de_libre_eleccion', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1f', 'Consignación 21-2',
    base || '{"periodo_descuento":"2026-01"}'));
  res := public.fn_anticipo_proveedor_devolver(x2, 190068, 'transfer', 'Resolución parcial: el bien excluido no se entregará', 'p21-C1g', 374, null, 'Consignación 21-2', base);
  perform pg_temp.chk('C1g resolución parcial de la línea excluida (sin agotar el anticipo): cada retención sobre lo que cubrió; reteIVA 0 (prorrata ciega daría 3.585)',
    'retefuente 8000 · reteica 1932 · total 9932.00 · saldo 595000.00',
    (select string_agg(d ->> 'clase' || ' ' || (d ->> 'revertido'), ' · ' order by d ->> 'clase') from jsonb_array_elements(res -> 'detalle') d)
      || ' · total ' || (res ->> 'retencion_revertida') || ' · saldo ' || (res ->> 'saldo_disponible'));
end $c21$;

-- Hecho de un mes anterior (el anticipo era de octubre) y retención de un año anterior (el anticipo era de diciembre de 2025):
-- se simula fechando el anticipo y su retención como administrador.
do $c21b$
declare res jsonb;
begin
  res := public.fn_anticipo_proveedor_registrar(current_setting('d21.g')::int, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p21-X3', 374, 19,
           current_setting('d21.r4')::uuid, current_setting('d21.ica')::uuid, null, 'TRF-21-X3', null, null, true);
  perform set_config('d21.x3', res ->> 'anticipo_id', true);
  res := public.fn_anticipo_proveedor_registrar(current_setting('d21.g')::int, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p21-X4', 374, 19,
           current_setting('d21.r4')::uuid, current_setting('d21.ica')::uuid, null, 'TRF-21-X4', null, null, true);
  perform set_config('d21.x4', res ->> 'anticipo_id', true);
end $c21b$;
reset role;
update public.supplier_advances set created_at = timestamptz '2026-10-01 10:00-05' where id = current_setting('d21.x3')::uuid;
update public.supplier_advance_withholdings set fecha = timestamptz '2026-10-01 10:00-05' where advance_id = current_setting('d21.x3')::uuid;
update public.supplier_advances set created_at = timestamptz '2025-12-15 10:00-05' where id = current_setting('d21.x4')::uuid;
update public.supplier_advance_withholdings set fecha = timestamptz '2025-12-15 10:00-05' where advance_id = current_setting('d21.x4')::uuid;
select set_config('request.jwt.claims', current_setting('d21.u'), true);
set local role authenticated;
do $c21c$
declare
  x3 uuid := current_setting('d21.x3')::uuid; x4 uuid := current_setting('d21.x4')::uuid; res jsonb;
  sop jsonb := jsonb_build_object('calculo', 'Retenciones practicadas al girar', 'certificado', 'Certificado anulado',
                                  'ica', jsonb_build_object('solicitud', 'Radicado 21-10', 'certificado', 'Certificado ICA 21-10', 'prueba_pago', 'Comprobante 21-10',
                                                            'liquidacion_corregida', 'Liquidación 21-10'));
begin
  res := public.fn_anticipo_proveedor_devolver(x3, 111184, 'transfer', 'Se resolvió el contrato en octubre', 'p21-C2', 374, null, 'Consignación 21-3',
           jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', false, 'soportes', sop,
                              'hecho', jsonb_build_object('tipo', 'resciliacion', 'documento', 'Acta de resciliación 21-3', 'fecha', date '2026-10-20')));
  perform pg_temp.chk('C2 hecho de octubre registrado en noviembre: renta e IVA en el período del hecho; ICA según su procedimiento',
    'reteiva 2026-10 · reteica ' || to_char(current_date + interval '1 month', 'YYYY-MM') || ' · retefuente 2026-10 · fechas renta/IVA en 2026-10',
    (select string_agg(clase || ' ' || periodo_descuento, ' · ' order by clase desc) from public.supplier_advance_withholding_ajustes where advance_id = x3)
      || ' · fechas renta/IVA en ' || (select string_agg(distinct to_char(fecha at time zone 'America/Bogota', 'YYYY-MM'), ',')
                                        from public.supplier_advance_withholding_ajustes where advance_id = x3 and clase <> 'reteica'));
  perform pg_temp.chk('C2b octubre conserva neto no negativo (sin excedente); el reteICA de diciembre, sin retenciones practicadas, pasa a los siguientes', '0/1',
    (select count(*) filter (where detalle ->> 'periodo' = '2026-10')::text || '/' || count(*) filter (where detalle ->> 'clase' = 'reteica')::text
       from public.anticipo_pendientes where advance_id = x3 and tipo = 'descuento_retencion_siguientes_periodos'));
  res := public.fn_anticipo_proveedor_devolver(x4, 111184, 'transfer', 'Se resolvió en enero el contrato de diciembre de 2025', 'p21-C3', 374, null, 'Consignación 21-4',
           jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', true, 'soportes', sop,
                              'hecho', jsonb_build_object('tipo', 'sentencia_o_laudo', 'documento', 'Laudo 21-4', 'fecha', date '2026-01-15')));
  perform pg_temp.chk('C3a retención de 2025 revertida por un hecho de enero de 2026: período 2026-01 (renta e IVA)', 'reteiva 2026-01 · retefuente 2026-01',
    (select string_agg(clase || ' ' || periodo_descuento, ' · ' order by clase desc) from public.supplier_advance_withholding_ajustes
      where advance_id = x4 and clase <> 'reteica'));
  perform pg_temp.chk('C3b pendientes: excedente para los períodos siguientes, otro año y corrección de la declaración', 'correccion_declaracion · descuento_retencion_siguientes_periodos · retencion_revertida_otro_anio',
    (select string_agg(distinct tipo, ' · ') from public.anticipo_pendientes where advance_id = x4));
  perform pg_temp.chk('C3c enero de 2026 queda con neto negativo en retefuente (−4.000): se descuenta en los siguientes', '-4000.00',
    (select (detalle ->> 'por_descontar') from public.anticipo_pendientes where advance_id = x4 and tipo = 'descuento_retencion_siguientes_periodos'
      and detalle ->> 'clase' = 'retefuente') :: numeric * -1 || '');
end $c21c$;

-- ── D · Financiación que se convierte en pago o abono del precio (sin depender de la factura) ─────────────────────────
do $d21$
declare
  g int := current_setting('d21.g')::int; r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  f1 uuid; res jsonb; conv uuid; q text;
begin
  res := public.fn_anticipo_proveedor_registrar(g, 585, 500000, 'transfer', 'financiacion', 'p21-F1', 374, null, null, null, null, 'TRF-21-F1', null, null, null);
  f1 := (res ->> 'anticipo_id')::uuid;
  perform pg_temp.chk('D1 financiación: no se retiene al girar', '0 · 500000.00', (res ->> 'retencion') || ' · ' || (res ->> 'girado'));
  q := 'select public.fn_anticipo_proveedor_convertir_en_pago(%L, %L, %L, current_date, %s, %L, 374, 19, %L, %L, null, true)';
  perform pg_temp.err('D2a convertir un pago anticipado (ya se evaluó al girar)', 'anticipo_no_es_financiacion', format(q, current_setting('d21.x1'), 'abono', 'Acta 21-5', 357000, 'p21-D2a', r4, ica));
  perform pg_temp.err('D2b sin soporte del hecho', 'soporte_obligatorio', format(q, f1, 'abono', '', 357000, 'p21-D2b', r4, ica));
  perform pg_temp.err('D2c más que lo financiado', 'conversion_excede_financiacion', format(q, f1, 'abono', 'Acta 21-5', 700000, 'p21-D2c', r4, ica));
  res := public.fn_anticipo_proveedor_convertir_en_pago(f1, 'abono', 'Acta de entrega parcial 21-5', current_date, 357000, 'p21-D2d', 374, 19, r4, ica, null, true);
  conv := (res ->> 'conversion_id')::uuid;
  perform set_config('d21.f1', f1::text, true);
  perform pg_temp.chk('D2d abono de 357.000 (base 300.000 + IVA 57.000): retefuente 12.000 · reteIVA 8.550 · reteICA 2.898; girado convertido 333.552',
    '23448 · 333552.00 · 523448.00',
    (res ->> 'retencion') || ' · ' || (res ->> 'girado_convertido') || ' · ' || (res ->> 'saldo_disponible'));
  perform pg_temp.chk('D2e asiento de la conversión: D anticipo / C retenciones, con el NIT del proveedor', '13300501 D 23448 · 23652501 C 12000 · 23670501 C 8550 · 23680501 C 2898 · NIT 900000211',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc, l.account_code)
       from public.journal_lines l where l.journal_entry_id = (res ->> 'asiento_id')::int)
    || ' · NIT ' || (select string_agg(distinct l.tercero_nit, ',') from public.journal_lines l where l.journal_entry_id = (res ->> 'asiento_id')::int));
  perform pg_temp.chk('D3 conversión repetida con la misma clave', 'true',
    (public.fn_anticipo_proveedor_convertir_en_pago(f1, 'abono', 'Acta de entrega parcial 21-5', current_date, 357000, 'p21-D2d', 374, 19, r4, ica, null, true) ->> 'repetida'));
  -- Resolución parcial de una línea del ABONO (la línea se identifica con la conversión).
  res := public.fn_anticipo_proveedor_devolver(f1, 111184, 'transfer', 'Se resolvió parte del abono', 'p21-D4', 374, null, 'Consignación 21-6',
           jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
                              'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 21-6', 'fecha', current_date),
                              'lineas', jsonb_build_array(jsonb_build_object('componente', conv::text || ':0', 'base', 100000, 'iva', 19000)),
                              'soportes', jsonb_build_object('calculo', 'Parte del abono', 'certificado', 'Certificado corregido 21-6',
                                                             'ica', jsonb_build_object('solicitud', 'Radicado 21-11', 'certificado', 'Certificado ICA 21-11',
                                                                                       'prueba_pago', 'Comprobante 21-11', 'liquidacion_corregida', 'Liquidación 21-11'))));
  perform pg_temp.chk('D4 resolución parcial de una línea del abono convertido: 4.000 + 2.850 + 966', '7816.00 · 111184.00',
    (res ->> 'retencion_revertida') || ' · ' || (res ->> 'dinero'));
end $d21$;
reset role;
do $e21$
declare f1 uuid := current_setting('d21.f1')::uuid;
begin
  perform pg_temp.chk('E1 certificado: las retenciones de la conversión en su fecha, como «Abono del anticipo»', '3 · 23448.00',
    (select count(*)::text || ' · ' || sum(f.valor)::text from public.fn_retenciones_practicadas_filas(374, now() - interval '1 day', now() + interval '1 day', null,
       current_setting('d21.g')::int) f where f.numero like 'Abono del anticipo%'));
  perform pg_temp.chk('E2 conciliación del anticipo convertido: tabla = libros', 'true · 404448.00 · 404448.00',
    (select (a ->> 'cuadra') || ' · ' || (a ->> 'saldo') || ' · ' || (a ->> 'saldo_libros')
       from jsonb_array_elements(public.fn_anticipos_proveedor_conciliacion(374, current_setting('d21.g')::int) -> 'anticipos') a where a ->> 'anticipo_id' = f1::text));
  perform pg_temp.chk('E3 estado de cuenta: la conversión aparece con su retención', '23448.00',
    (select m.abono::text from public.fn_estado_cuenta_proveedor_movs(374, current_setting('d21.g')::int) m where m.tipo = 'conversion_anticipo'));
  perform pg_temp.chk('E4 asientos de la prueba 21: todos cuadran; ninguno en 1330', 'true · 0',
    (select bool_and(t.d = t.c)::text || ' · ' || sum(t.en_1330)::text from public.journal_entries je
       join (select journal_entry_id, sum(debit) d, sum(credit) c, count(*) filter (where account_code = '1330') en_1330 from public.journal_lines group by 1) t
         on t.journal_entry_id = je.id
      where je.organization_id = 374 and je.id > current_setting('d21.je0')::int));
end $e21$;

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
