-- Plantilla del PUC de las organizaciones NUEVAS alineada al Decreto 2650 de 1993 (respuesta del Contador, 2026-11-10).
--
-- ESTADO: APLICADA el 2026-11-10 (registro 20261111032008) por el MCP. md5 de prosrc de fn_puc_asegurar_cuenta
-- tras aplicar: db4d94ab… (antes: 6621a61d…); firma, SECURITY DEFINER, search_path y GRANT sin cambios.
-- puc_plantilla: 260 filas antes y después (8 salen, 8 entran); hash de filas antes 76db4a85…, después 31a05ffd….
-- Prueba en seco (org de prueba insertada y revertida): 301 cuentas sembradas, 0 de la plantilla sin sembrar,
-- 0 cuentas 88/98, grupos 84/85/86/94/95/96 idénticos a puc_catalogo, 8510 nace crédito y 9510 débito por
-- fn_puc_asegurar_cuenta, 0 configuraciones a cuenta inexistente o de título, redondeo_en_contra = 53959501.
-- Regla a cuenta de título preexistente y ajena a este cambio: folio_item/created → 4155 (también sin la migración).
-- Sentencias aplicadas idénticas a las de este archivo; el comentario de cabecera se aplicó abreviado.
-- Reversión: supabase/rollbacks/20261111100000_puc_plantilla_alineada_decreto_rollback.sql.
-- Fecha: 2026-11-10.
--
-- Alcance. Solo public.puc_plantilla (semilla de fn_create_default_chart_of_accounts) y el cuerpo de
-- public.fn_puc_asegurar_cuenta. No toca el plan, los asientos ni la configuración de ninguna organización
-- existente: eso va aparte, en 20261111100200 (escrita, no aplicada).
--
-- 1. Grupos de contrapartida de cuentas de orden. La plantilla los tenía corridos: 84, 86, 88 y 94, 96, 98,
--    con el nombre del grupo anterior (su 86 decía «Deudoras fiscales por contra», que en el Decreto es la 85;
--    la 88 y la 98 no existen). Queda como el Decreto (nombres tomados de public.puc_catalogo):
--      84 Derechos contingentes por contra (CR)        8405 Derechos contingentes por contra          (sin cambio de código)
--      85 Deudoras fiscales por contra (CR)            8505 Deudoras fiscales por contra              (antes 86 / 8605)
--      86 Deudoras de control por contra (CR)          8605 Deudoras de control por contra            (antes 88 / 8805)
--      94 Responsabilidades contingentes por contra (DB)  9405 Responsabilidades contingentes por contra (sin cambio de código)
--      95 Acreedoras fiscales por contra (DB)          9505 Acreedoras fiscales por contra            (antes 96 / 9605)
--      96 Acreedoras de control por contra (DB)        9605 Acreedoras de control por contra          (antes 98 / 9805)
--    El Decreto no fija cuentas dentro de 84, 85, 86, 94, 95 y 96 (rango libre NN01 a NN99). Cada cuenta hija
--    conserva el «05» que ya usaba la plantilla y se cuelga del grupo correcto; ninguna queda sin equivalente.
--    88, 8805, 98 y 9805 salen de la plantilla. Mismas propiedades que tenían (tipo order, naturaleza crédito
--    en la 8 y débito en la 9, la de 4 dígitos de movimiento, sin tercero ni centro de costo).
--    La consignación recibida (911520 contra 9405) no cambia: 94 y 9405 conservan su código.
--
-- 2. Nombres al Decreto.
--    Por decisión del Contador:
--      1598     Deterioro de propiedad, planta y equipo → Agotamiento acumulado
--      1599     Provisiones → Deterioro (bajo NIIF; ya existía con las mismas propiedades que 1598)
--      8305     Cuentas deudoras de control → Bienes recibidos en arrendamiento financiero
--      9305     Cuentas acreedoras de control → Contratos de arrendamiento financiero
--      539595   Ajuste al peso → Otros
--      53959501 Ajuste al peso en contra → Ajuste al peso (el del ingreso sigue en 429581 / 42958101)
--    De forma (mayúsculas, plural/singular, sufijos DB/CR):
--      84 (cr) → (CR), 94 (db) → (DB), 4175 → «Devoluciones en ventas (DB)», 6225 → «Devoluciones en compras (CR)»,
--      5160 Depreciación → Depreciaciones, 5165 Amortización → Amortizaciones,
--      523550 Transportes, fletes y acarreos → Transporte, fletes y acarreos.
--    Se dejan como están, para que el Contador decida (pueden ser intencionales): 1698, 2205, 2210, 2355, 3705,
--    414095, 4155, 429595, 513595, 519595, 523560, 6155.
--
-- 3. Procesos que usan estos códigos (revisados en pg_proc y en src/**):
--    · fn_puc_asegurar_cuenta: cuando crea un prefijo que no está en la plantilla, deduce la naturaleza;
--      los grupos de contrapartida estaban cableados como 84/86/88 y 94/96/98. Con 85/95 en la lista una
--      cuenta nueva bajo 85 o 95 (p. ej. 8510) nace crédito o débito como corresponde; 88 y 98 se conservan en
--      la lista porque los planes existentes las siguen teniendo. Única función reemplazada aquí.
--    · Redondeo en contra: configuracion_contable.redondeo_en_contra = 53959501 (fn_sembrar_configuracion_contable)
--      y fn_cuenta_auxiliar_de_titulo (5395 → 53959501). El código no cambia, solo el nombre: no se rompe nada.
--    · fn_ef_flujo_lineas trata 1598 como partida que no mueve caja (junto a 1592/1597/1698) y 1599 como
--      deterioro: con 1598 = agotamiento acumulado y 1599 = deterioro la clasificación sigue siendo correcta.
--    · Ningún proceso automático asienta en 1598, 1599, 539595 ni en las cuentas de orden 84 a 98.
--
-- Seguridad: cambia filas de una tabla de referencia y el cuerpo de una función SECURITY DEFINER; misma firma,
-- mismo search_path, mismos GRANT (postgres y service_role).

do $$
begin
  if exists (select 1 from public.puc_plantilla where codigo in ('85', '95'))
     or not exists (select 1 from public.puc_plantilla where codigo = '88') then
    raise exception 'puc_plantilla no está en el estado esperado (¿migración ya aplicada?)';
  end if;
end $$;

-- 1. Grupos de contrapartida de cuentas de orden.
delete from public.puc_plantilla
 where codigo in ('8605', '8805', '9605', '9805');
delete from public.puc_plantilla
 where codigo in ('86', '88', '96', '98');

insert into public.puc_plantilla (
  codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif
) values
  ('85',   'Deudoras fiscales por contra (CR)',     'order', '8',  null, 'credito', false, false, false, 'no_aplica', null),
  ('86',   'Deudoras de control por contra (CR)',   'order', '8',  null, 'credito', false, false, false, 'no_aplica', null),
  ('95',   'Acreedoras fiscales por contra (DB)',   'order', '9',  null, 'debito',  false, false, false, 'no_aplica', null),
  ('96',   'Acreedoras de control por contra (DB)', 'order', '9',  null, 'debito',  false, false, false, 'no_aplica', null),
  ('8505', 'Deudoras fiscales por contra',          'order', '85', null, 'credito', true,  false, false, 'no_aplica', null),
  ('8605', 'Deudoras de control por contra',        'order', '86', null, 'credito', true,  false, false, 'no_aplica', null),
  ('9505', 'Acreedoras fiscales por contra',        'order', '95', null, 'debito',  true,  false, false, 'no_aplica', null),
  ('9605', 'Acreedoras de control por contra',      'order', '96', null, 'debito',  true,  false, false, 'no_aplica', null);

-- 2. Nombres al Decreto.
update public.puc_plantilla p
   set nombre = v.nombre
  from (values
    ('84',       'Derechos contingentes por contra (CR)'),
    ('94',       'Responsabilidades contingentes por contra (DB)'),
    ('1598',     'Agotamiento acumulado'),
    ('1599',     'Deterioro'),
    ('8305',     'Bienes recibidos en arrendamiento financiero'),
    ('9305',     'Contratos de arrendamiento financiero'),
    ('539595',   'Otros'),
    ('53959501', 'Ajuste al peso'),
    ('4175',     'Devoluciones en ventas (DB)'),
    ('6225',     'Devoluciones en compras (CR)'),
    ('5160',     'Depreciaciones'),
    ('5165',     'Amortizaciones'),
    ('523550',   'Transporte, fletes y acarreos')
  ) as v(codigo, nombre)
 where p.codigo = v.codigo;

-- 3. fn_puc_asegurar_cuenta: la naturaleza deducida reconoce 85 y 95 como contrapartida.
create or replace function public.fn_puc_asegurar_cuenta(p_organization_id integer, p_codigo text, p_nombre text, p_movimiento boolean)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_codigo text := public.fn_puc_codigo_normalizado(p_codigo);
  v_largo integer;
  v_paso integer;
  v_prefijo text;
  v_padre text;
  v_nombre text;
  v_tipo text;
  v_nat text;
  v_modo text;
  v_pres text;
  v_desc text;
  v_tercero boolean;
  v_mov boolean;
  v_padre_mov boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_codigo !~ '^[1-9][0-9]*$' then
    return null;
  end if;
  v_largo := length(v_codigo);
  if v_largo not in (1, 2, 4, 6, 8) and not (v_largo >= 10 and v_largo % 2 = 0) then
    return null;
  end if;

  v_paso := 1;
  while v_paso <= v_largo loop
    v_prefijo := left(v_codigo, v_paso);
    if not exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = v_prefijo
    ) then
      v_padre := case
        when v_paso = 1 then null
        when v_paso = 2 then left(v_prefijo, 1)
        when v_paso = 4 then left(v_prefijo, 2)
        when v_paso = 6 then left(v_prefijo, 4)
        when v_paso = 8 then left(v_prefijo, 6)
        else left(v_prefijo, v_paso - 2)
      end;
      if v_padre is not null and not exists (
        select 1 from public.chart_of_accounts
        where organization_id = p_organization_id and account_code = v_padre
      ) then
        return null;
      end if;

      select p.nombre, p.tipo, p.naturaleza, p.requiere_tercero, p.centro_costo_modo,
             p.presentacion_niif, p.descripcion
        into v_nombre, v_tipo, v_nat, v_tercero, v_modo, v_pres, v_desc
      from public.puc_plantilla p
      where p.codigo = v_prefijo;

      v_mov := case when v_paso = v_largo then p_movimiento else false end;
      if v_paso in (1, 2) then
        v_mov := false;
      end if;
      v_nombre := coalesce(
        v_nombre,
        case when v_prefijo = v_codigo then nullif(btrim(p_nombre), '') end,
        'Cuenta ' || v_prefijo
      );
      v_tipo := coalesce(v_tipo, (
        select c.type from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_padre
      ), case left(v_prefijo, 1)
        when '1' then 'asset'
        when '2' then 'liability'
        when '3' then 'equity'
        when '4' then 'income'
        when '5' then 'expense'
        when '6' then 'expense'
        when '7' then 'expense'
        else 'order'
      end);
      -- Contrapartidas de orden del Decreto 2650: 84, 85, 86 (CR) y 94, 95, 96 (DB).
      -- 88 y 98 no son del Decreto, pero los planes creados antes de 20261111100000 las tienen.
      v_nat := coalesce(v_nat, case
        when left(v_prefijo, 2) in ('84', '85', '86', '88') then 'credito'
        when left(v_prefijo, 2) in ('94', '95', '96', '98') then 'debito'
        when left(v_prefijo, 1) in ('1', '5', '6', '7', '8') then 'debito'
        else 'credito'
      end);
      v_modo := coalesce(v_modo, case
        when v_mov and left(v_prefijo, 1) in ('5', '6', '7') then 'obligatorio'
        when left(v_prefijo, 1) in ('4', '5', '6', '7') then 'opcional'
        else 'no_aplica'
      end);
      v_padre_mov := v_padre is not null and exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = v_padre
          and c.es_movimiento is true
      );

      -- Un grupo que ya es de movimiento sigue recibiendo asientos.
      -- El auxiliar convive: los reportes suman por prefijo.
      if v_padre_mov then
        execute 'alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta';
      end if;
      begin
        insert into public.chart_of_accounts (
          organization_id, account_code, name, type, parent_code, is_active, description,
          naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo,
          centro_costo_modo, presentacion_niif
        ) values (
          p_organization_id, v_prefijo, v_nombre, v_tipo, v_padre, true, v_desc,
          v_nat, v_mov, coalesce(v_tercero, false), v_modo = 'obligatorio',
          v_modo, coalesce(v_pres, public.fn_puc_presentacion_defecto(v_prefijo))
        )
        on conflict (organization_id, account_code) do nothing;
        if v_padre_mov then
          execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
        end if;
      exception when others then
        if v_padre_mov then
          execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
        end if;
        raise;
      end;
    end if;

    if v_paso = 1 then
      v_paso := 2;
    elsif v_paso = 2 then
      v_paso := 4;
    elsif v_paso = 4 then
      v_paso := 6;
    elsif v_paso = 6 then
      v_paso := 8;
    else
      v_paso := v_paso + 2;
    end if;
  end loop;
  return v_codigo;
end;
$function$;
