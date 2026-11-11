-- Reversión de 20261111100000_puc_plantilla_alineada_decreto.sql.
--
-- Devuelve public.puc_plantilla y fn_puc_asegurar_cuenta a como estaban el 2026-11-10 antes de la migración
-- (filas generadas desde los datos de ese momento; md5 de prosrc de fn_puc_asegurar_cuenta: 6621a61d…).
-- Efecto: las organizaciones nuevas vuelven a nacer con los grupos corridos 84/86/88 y 94/96/98 y con los
-- nombres anteriores. No toca el plan de ninguna organización ya creada: una organización creada mientras la
-- migración estuvo vigente conserva 85/86 y 95/96 (fn_puc_asegurar_cuenta sigue reconociéndolas solo como
-- prefijos 8 y 9 genéricos, que dan débito en 85 y crédito en 95 para una cuenta nueva que no esté en la plantilla).

delete from public.puc_plantilla
 where codigo in ('8505', '8605', '9505', '9605');
delete from public.puc_plantilla
 where codigo in ('85', '86', '95', '96');

insert into public.puc_plantilla (
  codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif
) values
  ('86',   'Deudoras fiscales por contra (cr)',     'order', '8',  null, 'credito', false, false, false, 'no_aplica', null),
  ('88',   'Deudoras de control por contra (cr)',   'order', '8',  null, 'credito', false, false, false, 'no_aplica', null),
  ('96',   'Acreedoras fiscales por contra (db)',   'order', '9',  null, 'debito',  false, false, false, 'no_aplica', null),
  ('98',   'Acreedoras de control por contra (db)', 'order', '9',  null, 'debito',  false, false, false, 'no_aplica', null),
  ('8605', 'Deudoras fiscales por contra',          'order', '86', null, 'credito', true,  false, false, 'no_aplica', null),
  ('8805', 'Deudoras de control por contra',        'order', '88', null, 'credito', true,  false, false, 'no_aplica', null),
  ('9605', 'Acreedoras fiscales por contra',        'order', '96', null, 'debito',  true,  false, false, 'no_aplica', null),
  ('9805', 'Acreedoras de control por contra',      'order', '98', null, 'debito',  true,  false, false, 'no_aplica', null);

update public.puc_plantilla p
   set nombre = v.nombre
  from (values
    ('84',       'Derechos contingentes por contra (cr)'),
    ('94',       'Responsabilidades contingentes por contra (db)'),
    ('1598',     'Deterioro de propiedad, planta y equipo'),
    ('1599',     'Provisiones'),
    ('8305',     'Cuentas deudoras de control'),
    ('9305',     'Cuentas acreedoras de control'),
    ('539595',   'Ajuste al peso'),
    ('53959501', 'Ajuste al peso en contra'),
    ('4175',     'Devoluciones en ventas'),
    ('6225',     'Devoluciones en compras'),
    ('5160',     'Depreciación'),
    ('5165',     'Amortización'),
    ('523550',   'Transportes, fletes y acarreos')
  ) as v(codigo, nombre)
 where p.codigo = v.codigo;

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
      v_nat := coalesce(v_nat, case
        when left(v_prefijo, 2) in ('84', '86', '88') then 'credito'
        when left(v_prefijo, 2) in ('94', '96', '98') then 'debito'
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
