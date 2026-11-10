-- Pruebas en seco 25 · Anticipos, ronda 5 del Contador (RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md, respuestas 9, 12 y 13 y las
-- citas que corrige): período de la reteIVA en reversiones (DUR 1625 de 2016, art. 1.3.2.3.1: el de la anulación y el
-- saldo en los DOS siguientes); renta con el art. 1.2.4.8 (anulación) y el 1.2.4.16 (exceso); reteIVA en exceso con la
-- solicitud escrita y la manifestación escrita de no imputación del retenido; excedente de ReteICA pendiente en los
-- períodos siguientes, sin límite, con la solicitud escrita como soporte; piso del 10 % del AIU (art. 462-1 E.T.) por
-- operación y acumulado del contrato. Casos que pasan y casos que deben bloquear.
-- Fecha: 2026-11-09 · Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585). Operan su usuario dueño y, para
-- VALIDAR (nunca quien registró), un segundo usuario añadido como miembro de la 374 dentro de la transacción.
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- CARGA ejecuta, completas y exactas (md5 comprobado), las migraciones SIN APLICAR en orden de versión. El hecho de un
-- período anterior se simula fechando, como administrador, un anticipo y sus retenciones en octubre de 2025.
-- Resultado: 25_anticipos_ronda5_contador.resultado.txt

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


-- ════ CUERPO: 25.sql ════
-- ════ 25 · Anticipos, ronda 5: período de la reteIVA en reversiones (DUR 1.3.2.3.1: el de la anulación y el saldo en los
--      dos siguientes), citas corregidas (renta: 1.2.4.8 y 1.2.4.16), reteIVA en exceso con solicitud escrita y
--      manifestación de no imputación, excedente de reteICA sin límite de períodos con la solicitud guardada, y piso del
--      10 % del AIU por operación y acumulado del contrato ════
select set_config('dry.prueba', '25', true);
-- Si corre después de otras pruebas (integrada), los controles de cuadre se vuelven a diferir como en una RPC.
set constraints all deferred;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s25$
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
  -- Segundo miembro de la org 374 (el que valida como Contador: nunca quien registró la regla).
  insert into public.organization_members (organization_id, user_id, role_id, is_active)
  select 374, o.owner_user_id, 2, true from public.organizations o
   where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba 25-G', '900000251', 'company', 'comun', array['O-48']) returning id into v_g;
  insert into public.reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, norma, vigente_desde)
  values (374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Servicios (prueba 25)', 9.66, 'Acuerdo municipal de ReteICA (prueba 25)', date '2025-01-01')
  returning id into v_ica;
  perform set_config('d25.g', v_g::text, true);
  perform set_config('d25.ica', v_ica::text, true);
  perform set_config('d25.r4', (select ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
                                 where ot.organization_id = 374 and tt.code = 'RETE_4'), true);
  perform set_config('d25.u', json_build_object('sub', (select owner_user_id from public.organizations where id = 374), 'role', 'authenticated')::text, true);
  perform set_config('d25.u2', json_build_object('sub', (select owner_user_id from public.organizations where id = 137), 'role', 'authenticated')::text, true);
  perform set_config('d25.je0', (select coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374), true);
end $s25$;
-- El acumulado AIU del contrato es interno (sin EXECUTE para authenticated): la prueba lo lee como administrador.
create function pg_temp.aiu_acum(c uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$ select public.fn_aiu_contrato_acumulado(c) $$;
grant execute on function pg_temp.aiu_acum(uuid) to authenticated;

-- ── P · Período de descuento por impuesto (ronda 5, respuesta 9 y primera cita que corrige) ─────────────────────────
do $p25$
declare r jsonb;
begin
  r := public.fn_retencion_periodo_descuento('retefuente', 'hecho', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P1 renta, anulación: DUR 1.2.4.8, período del hecho y el saldo en los siguientes, sin límite', 'DUR 1.2.4.8 · 2026-10 · siguientes_sin_limite',
    split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo'));
  r := public.fn_retencion_periodo_descuento('retefuente', 'exceso', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P2 renta, exceso: DUR 1.2.4.16, período del reintegro', 'DUR 1.2.4.16 · 2026-11', split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo'));
  r := public.fn_retencion_periodo_descuento('reteiva', 'hecho', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P3 reteIVA, anulación: DUR 1.3.2.3.1, el período de la anulación y el saldo en los DOS siguientes',
    'DUR 1.3.2.3.1 · 2026-10 · dos_siguientes · ["2026-11", "2026-12"]',
    split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo') || ' · ' || (r -> 'periodos_saldo')::text);
  r := public.fn_retencion_periodo_descuento('reteiva', 'hecho', date '2026-12-05', date '2026-12-10');
  perform pg_temp.chk('P4 reteIVA anulada en diciembre: los dos períodos siguientes cruzan de año', '2026-12 · ["2027-01", "2027-02"]',
    (r ->> 'periodo') || ' · ' || (r -> 'periodos_saldo')::text);
  r := public.fn_retencion_periodo_descuento('reteiva', 'exceso', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P5 reteIVA en exceso: período del reintegro; el saldo queda por confirmar con el Contador', 'DUR 1.3.2.3.1 · 2026-11 · por_confirmar',
    split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo'));
  r := public.fn_retencion_periodo_descuento('reteica', 'hecho', date '2026-10-20', date '2026-11-09', 'periodo_siguiente_al_reintegro');
  perform pg_temp.chk('P6 ReteICA: la regla del procedimiento municipal; el saldo en los siguientes, sin límite de períodos',
    'periodo_siguiente_al_reintegro · 2026-12 · siguientes_sin_limite', (r ->> 'regla') || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo'));
  perform pg_temp.err('P7 una clase desconocida no recibe período', 'clase_retencion_invalida',
    'select public.fn_retencion_periodo_descuento(''reteinc'', ''hecho'', current_date, current_date)');
  -- La cita retirada se arma por partes para que esta prueba no la contenga.
  perform pg_temp.chk('P8 ninguna función cargada cita el artículo que la ronda 4 usaba para las devoluciones', '0',
    (select count(*)::text from pg_proc where prosrc like '%1.2.4.' || '17%'));
end $p25$;
-- Las reglas del período son internas (sin EXECUTE para authenticated): P corre como administrador; lo demás, como el usuario.
select set_config('request.jwt.claims', current_setting('d25.u'), true);
set local role authenticated;

-- ── E · reteIVA en exceso: solicitud escrita y manifestación escrita de no imputación (dos soportes obligatorios) ──
do $e25$
declare
  g int := current_setting('d25.g')::int; r4 uuid := current_setting('d25.r4')::uuid; ica uuid := current_setting('d25.ica')::uuid;
  x uuid; res jsonb; det text;
  sop jsonb := jsonb_build_object('calculo', 'La tarifa de reteIVA aplicable era 10 % del IVA', 'certificado', 'Certificado corregido 25-1',
                                  'solicitud', 'Solicitud escrita del proveedor 25-1', 'pruebas', 'Factura y RUT del proveedor');
begin
  res := public.fn_anticipo_proveedor_registrar(g, 585, 1190000, 'transfer', 'pago_anticipado_precio', 'p25-X1', 374, 19, r4, ica, null, 'TRF-25-X1', null, null, true);
  x := (res ->> 'anticipo_id')::uuid;
  perform set_config('d25.x1', x::text, true);
  perform pg_temp.chk('E0 anticipo con reteIVA practicada al girar (15 % del IVA de 190.000)', '28500',
    (select round(w.valor)::text from public.supplier_advance_withholdings w where w.advance_id = x and w.clase = 'reteiva'));
  begin
    perform public.fn_anticipo_retencion_exceso_reintegrar(x, 'reteiva', 190000, 10, 'transfer', 'p25-E1', sop, null, false, 'Tarifa de reteIVA equivocada', 374);
    perform pg_temp.chk('E1 reteIVA en exceso sin la manifestación escrita de no imputación: bloqueado', 'soporte_procedimiento_obligatorio · manifestacion_no_imputacion', 'sin error');
  exception when others then
    get stacked diagnostics det = pg_exception_detail;
    perform pg_temp.chk('E1 reteIVA en exceso sin la manifestación escrita de no imputación: bloqueado', 'soporte_procedimiento_obligatorio · manifestacion_no_imputacion',
      sqlerrm || ' · ' || coalesce(det, ''));
  end;
  res := public.fn_anticipo_retencion_exceso_reintegrar(x, 'reteiva', 190000, 10, 'transfer', 'p25-E2',
           sop || jsonb_build_object('manifestacion_no_imputacion', 'Manifestación escrita del proveedor: no imputó la retención en su declaración de IVA'),
           null, false, 'Tarifa de reteIVA equivocada', 374);
  perform pg_temp.chk('E2 con los dos soportes: reintegro 28.500 − 19.000 = 9.500 en el período del reintegro (DUR 1.3.2.3.1)',
    '9500.00 · ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM') || ' · DUR 1.3.2.3.1',
    (res ->> 'reintegro') || ' · ' || (res ->> 'periodo_descuento') || ' · ' || split_part(res ->> 'regla_periodo', ':', 1));
  perform pg_temp.chk('E3 el ajuste guarda la solicitud y la manifestación como soportes', 'true',
    (select (a.soportes ? 'solicitud' and a.soportes ? 'manifestacion_no_imputacion')::text from public.supplier_advance_withholding_ajustes a
      where a.advance_id = x and a.tipo = 'retencion_excesiva'));
  perform pg_temp.err('E4 renta en exceso sin solicitud ni pruebas: bloqueado (DUR 1.2.4.16)', 'soporte_procedimiento_obligatorio',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 1000000, 2.5, %L, %L, %L::jsonb, null, false, %L, 374)', x, 'retefuente', 'transfer', 'p25-E4',
           '{"calculo":"Cálculo","certificado":"Certificado"}', 'Tarifa equivocada'));
end $e25$;

-- ── D · Anulación de un hecho de un período sin retenciones: el saldo de cada impuesto, con su regla ───────────────
do $d25a$
declare res jsonb;
begin
  res := public.fn_anticipo_proveedor_registrar(current_setting('d25.g')::int, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p25-X2', 374, 19,
           current_setting('d25.r4')::uuid, current_setting('d25.ica')::uuid, null, 'TRF-25-X2', null, null, true);
  perform set_config('d25.x2', res ->> 'anticipo_id', true);
end $d25a$;
reset role;
-- El anticipo era de octubre de 2025 (se simula fechándolo como administrador); la resciliación es de noviembre de 2025.
update public.supplier_advances set created_at = timestamptz '2025-10-15 10:00-05' where id = current_setting('d25.x2')::uuid;
update public.supplier_advance_withholdings set fecha = timestamptz '2025-10-15 10:00-05' where advance_id = current_setting('d25.x2')::uuid;
select set_config('request.jwt.claims', current_setting('d25.u'), true);
set local role authenticated;
do $d25b$
declare
  x2 uuid := current_setting('d25.x2')::uuid; pb uuid; res jsonb;
  sop jsonb := jsonb_build_object('calculo', 'Retenciones practicadas al girar', 'certificado', 'Certificado anulado 25-2',
                                  'ica', jsonb_build_object('solicitud', 'Radicado 25-2', 'certificado', 'Certificado ICA 25-2', 'prueba_pago', 'Comprobante 25-2',
                                                            'liquidacion_corregida', 'Liquidación 25-2'));
begin
  -- Procedimiento de ReteICA del municipio, validado por otro usuario (si la prueba 21 ya lo dejó en esta transacción, se usa ese).
  if not exists (select 1 from public.reteica_procedimientos p where p.organization_id = 374 and p.municipality_id = '6c5bba87-87af-4e41-9b2d-5381d7a3b04f'
                    and p.estado = 'validado') then
    pb := public.fn_reteica_procedimiento_registrar(374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Acuerdo municipal de ReteICA (prueba 25)',
            'Solicitud escrita del afectado ante el agente retenedor', array['prueba_pago', 'liquidacion_corregida'], 'Reintegro por transferencia al proveedor',
            'Certificado de ReteICA corregido del bimestre', 'periodo_siguiente_al_reintegro', 'Lo que no alcance se descuenta en los períodos siguientes', date '2026-01-01');
    perform set_config('request.jwt.claims', current_setting('d25.u2'), true);
    perform public.fn_tributario_regla_validar('reteica_procedimiento', pb, 'validado', 'Procedimiento del municipio revisado contra el acuerdo municipal', 'Concepto ICA-25', 374);
    perform set_config('request.jwt.claims', current_setting('d25.u'), true);
  end if;
  res := public.fn_anticipo_proveedor_devolver(x2, 111184, 'transfer', 'Se rescindió por mutuo acuerdo el contrato de octubre de 2025', 'p25-D1', 374, null, 'Consignación 25-2',
           jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', true, 'soportes', sop,
                              'hecho', jsonb_build_object('tipo', 'resciliacion', 'documento', 'Acta de resciliación 25-2', 'fecha', date '2025-11-20')));
  perform pg_temp.chk('D1 períodos: renta e IVA en el de la resciliación; ReteICA según su procedimiento',
    'reteiva 2025-11 · reteica ' || to_char(date_trunc('month', now() at time zone 'America/Bogota') + interval '1 month', 'YYYY-MM') || ' · retefuente 2025-11',
    (select string_agg(a.clase || ' ' || a.periodo_descuento, ' · ' order by a.clase desc) from public.supplier_advance_withholding_ajustes a where a.advance_id = x2));
  perform pg_temp.chk('D2 la regla del período queda escrita con su artículo', 'retefuente:DUR 1.2.4.8 · reteiva:DUR 1.3.2.3.1',
    (select string_agg(a.clase || ':' || split_part(a.regla_periodo, ':', 1), ' · ' order by a.clase) from public.supplier_advance_withholding_ajustes a
      where a.advance_id = x2 and a.clase in ('retefuente', 'reteiva')));
  perform pg_temp.chk('D3 reteIVA: el saldo solo en los DOS períodos siguientes', 'dos_siguientes · ["2025-12", "2026-01"] · 2 · 2850',
    (select (p.detalle ->> 'saldo') || ' · ' || (p.detalle -> 'periodos_saldo')::text || ' · ' || (p.detalle ->> 'limite_periodos') || ' · ' || round((p.detalle ->> 'por_descontar')::numeric)
       from public.anticipo_pendientes p where p.advance_id = x2 and p.tipo = 'descuento_retencion_siguientes_periodos' and p.detalle ->> 'clase' = 'reteiva'));
  perform pg_temp.chk('D4 renta: el saldo en los períodos siguientes, sin límite', 'siguientes_sin_limite · sin límite · 4000',
    (select (p.detalle ->> 'saldo') || ' · ' || coalesce(p.detalle ->> 'limite_periodos', 'sin límite') || ' · ' || round((p.detalle ->> 'por_descontar')::numeric)
       from public.anticipo_pendientes p where p.advance_id = x2 and p.tipo = 'descuento_retencion_siguientes_periodos' and p.detalle ->> 'clase' = 'retefuente'));
  perform pg_temp.chk('D5 ReteICA: el excedente pendiente en los siguientes, sin límite, con la solicitud escrita guardada', 'siguientes_sin_limite · sin límite · Radicado 25-2',
    (select (p.detalle ->> 'saldo') || ' · ' || coalesce(p.detalle ->> 'limite_periodos', 'sin límite') || ' · ' || coalesce(p.detalle ->> 'soporte_solicitud', '-')
       from public.anticipo_pendientes p where p.advance_id = x2 and p.tipo = 'descuento_retencion_siguientes_periodos' and p.detalle ->> 'clase' = 'reteica'));
  perform pg_temp.chk('D6 ningún pendiente de ReteICA sin la solicitud escrita', '0',
    (select count(*)::text from public.anticipo_pendientes p where p.organization_id = 374 and p.tipo = 'descuento_retencion_siguientes_periodos'
       and p.detalle ->> 'clase' = 'reteica' and coalesce(p.detalle ->> 'soporte_solicitud', '') = '' and p.creado_en = now()));
end $d25b$;

-- ── A · Piso del 10 % del AIU (art. 462-1) por operación y acumulado del contrato (respuesta 13) ────────────────────
do $a25$
declare
  g int := current_setting('d25.g')::int; r4 uuid := current_setting('d25.r4')::uuid; ica uuid := current_setting('d25.ica')::uuid;
  ct jsonb := '{"numero":"A-25","fecha":"2026-01-05","archivo":"contratos/a-25.pdf","valor":2000000}';
  c462 jsonb := '{"aiu_discriminado":true,"requisitos_prestador":"Empresa de aseo con el AIU discriminado en el contrato"}';
  c1 uuid; e jsonb; res jsonb; a1 uuid; q text;
  ica_sop jsonb := jsonb_build_object('solicitud', 'Radicado 25-3', 'certificado', 'Certificado ICA 25-3', 'prueba_pago', 'Comprobante 25-3', 'liquidacion_corregida', 'Liquidación 25-3');
begin
  c1 := public.fn_aiu_contrato_registrar(374, g, 'servicios_462_1', 'Servicio de aseo de la sede (prueba 25)', 'aseo', ct, 'Estatuto Tributario, art. 462-1', c462,
                                         'base_especial', 'valor_total', date '2026-01-01');
  perform set_config('request.jwt.claims', current_setting('d25.u2'), true);
  perform public.fn_tributario_regla_validar('aiu_contrato', c1, 'validado', 'Servicio de aseo comprendido en el art. 462-1; AIU discriminado; prestador habilitado', 'Concepto C-25-1', 374);
  perform set_config('request.jwt.claims', current_setting('d25.u'), true);
  -- Operación 1: A + I + U = 200.000 (20 % de 1.000.000).
  res := public.fn_anticipo_proveedor_registrar(g, 585, 1038000, 'transfer', 'pago_anticipado_precio', 'p25-A1', 374, 19, r4, ica, null, 'TRF-25-A1', null,
           '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]',
           true, c1);
  a1 := (res ->> 'anticipo_id')::uuid;
  e := (select retenciones_evaluacion from public.supplier_advances where id = a1);
  perform pg_temp.chk('A1 operación 1: base del IVA = A + I + U (20 %), sin piso; acumulado previo del contrato en cero',
    '200000.00 · false · false · 0', (e -> 'aiu' ->> 'base_iva') || ' · ' || (e -> 'aiu' ->> 'minimo_10_aplicado') || ' · ' || (e -> 'aiu' ->> 'minimo_10_contrato_aplicado')
      || ' · ' || (e -> 'aiu' -> 'acumulado_previo' ->> 'valor'));
  -- Operación 2 (evaluada): A + I + U = 90.000 (9 %): el piso de la operación sube la base a 100.000; el acumulado ya cumple.
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":910000},{"tratamiento":"aiu_administracion","base":30000},{"tratamiento":"aiu_imprevistos","base":30000},{"tratamiento":"aiu_utilidad","base":30000}]', true, c1);
  perform pg_temp.chk('A2 operación 2: piso del 10 % de la operación (90.000 → 100.000); el acumulado (1.000.000 · 200.000) ya cumple',
    '100000.00 · true · false · 90000 · 1000000 · 200000',
    (e -> 'aiu' ->> 'base_iva') || ' · ' || (e -> 'aiu' ->> 'minimo_10_aplicado') || ' · ' || (e -> 'aiu' ->> 'minimo_10_contrato_aplicado') || ' · '
      || round((e -> 'aiu' ->> 'aiu_declarado')::numeric) || ' · ' || round((e -> 'aiu' -> 'acumulado_previo' ->> 'valor')::numeric) || ' · '
      || round((e -> 'aiu' -> 'acumulado_previo' ->> 'base_iva')::numeric));
  -- Devolver SOLO las líneas de A, I y U de la operación 1 la dejaría con base del IVA 0 sobre 800.000: se rechaza.
  q := 'select public.fn_anticipo_proveedor_devolver(%L, %s, %L, %L, %L, 374, null, %L, %L::jsonb)';
  perform pg_temp.err('A3 una devolución que rompe el piso del 10 % de la operación se rechaza', 'aiu_minimo_10_operacion',
    format(q, a1, 222368, 'transfer', 'Resolución parcial del AIU', 'p25-A3', 'Consignación 25-3',
           jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
             'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 25-3', 'fecha', (now() at time zone 'America/Bogota')::date),
             'lineas', '[{"componente":"1","base":100000,"iva":19000},{"componente":"2","base":50000,"iva":9500},{"componente":"3","base":50000,"iva":9500}]'::jsonb,
             'soportes', jsonb_build_object('calculo', 'Líneas de AIU resueltas', 'certificado', 'Certificado corregido 25-3', 'ica', ica_sop))));
  -- Devolver la mitad del costo directo mantiene la proporción (600.000 con base 200.000): procede.
  res := public.fn_anticipo_proveedor_devolver(a1, 396136, 'transfer', 'Resolución parcial del costo directo', 'p25-A4', 374, null, 'Consignación 25-4',
           jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
             'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 25-4', 'fecha', (now() at time zone 'America/Bogota')::date),
             'lineas', '[{"componente":"0","base":400000,"iva":0}]'::jsonb,
             'soportes', jsonb_build_object('calculo', 'Mitad del costo directo resuelta', 'certificado', 'Certificado corregido 25-4', 'ica', ica_sop)));
  perform pg_temp.chk('A4 devolución del costo directo que mantiene el piso (por operación y acumulado): procede; acumulado 600.000 · 200.000',
    '3864.00 · 600000 · 200000', (res ->> 'retencion_revertida') || ' · ' || round((pg_temp.aiu_acum(c1) ->> 'valor')::numeric) || ' · '
      || round((pg_temp.aiu_acum(c1) ->> 'base_iva')::numeric));
  -- Una operación que lleva el acumulado por encima del valor del contrato (600.000 + 1.500.000 > 2.000.000) queda pendiente.
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1538000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":1300000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', true, c1);
  perform pg_temp.chk('A5 operación que supera el valor del contrato: las retenciones quedan pendientes (no se presume)', 'true · aiu_excede_valor_contrato',
    (e ->> 'pendiente') || ' · ' || (e -> 'clases' -> 0 ->> 'motivo'));
end $a25$;
reset role;
do $z25$
begin
  perform pg_temp.chk('Z1 asientos de la prueba 25: todos cuadran; ninguno en 1330', 'true · 0',
    (select bool_and(t.d = t.c)::text || ' · ' || sum(t.en_1330)::text from public.journal_entries je
       join (select journal_entry_id, sum(debit) d, sum(credit) c, count(*) filter (where account_code = '1330') en_1330 from public.journal_lines group by 1) t
         on t.journal_entry_id = je.id
      where je.organization_id = 374 and je.id > current_setting('d25.je0')::int));
end $z25$;

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
