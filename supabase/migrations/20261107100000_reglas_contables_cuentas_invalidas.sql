-- Hallazgo 1 de la auditoría del Contador (2026-11-06): reglas con cuentas inexistentes o de título.
--
-- Medido antes de aplicar: 1.632 reglas activas en 33 empresas; 377 apuntan a una cuenta que no está en el plan
-- (todas 14350101, en 29 empresas) y 72 a una cuenta de título (4155, 4135, 414015).
--
-- Esta migración NO toca ninguna regla existente:
--   1. fn_regla_fallo_cuenta: dice si un código sirve en una regla de esa empresa.
--   2. trg_accounting_rules_validar_cuentas: bloquea lo NUEVO. Solo mira la columna que cambia, así que una fila
--      que ya venía mal se puede renombrar o desactivar sin corregirla.
--   3. fn_reglas_contables_diagnostico: inventario de una empresa con propuesta y evidencia, para la pantalla.
--   4. trg_zzzzz_reglas_saneadas: en una empresa NUEVA, ya con su plan, corrige la regla semilla cuando hay evidencia.
--
-- Por qué el disparador solo valida a los roles cliente (authenticated, anon, service_role):
--   - tr_auto_create_accounting_rules corre ANTES que tr_auto_create_chart_of_accounts (orden alfabético). Las reglas
--     semilla nacen sin plan: validarlas tumbaría el alta de toda empresa.
--   - fn_puc_migracion_revertir restaura códigos anteriores, que pueden ser de título.
--   Esas funciones son SECURITY DEFINER y corren como su dueño, no como el rol del cliente.
--
-- Por qué el disparador es SECURITY INVOKER: necesita ver el rol real. fn_es_cuenta_de_titulo no tiene grant para
-- authenticated, por eso la consulta del plan va en fn_regla_fallo_cuenta, que sí es SECURITY DEFINER y exige acceso.
--
-- Rollback: supabase/rollbacks/20261107100000_reglas_contables_cuentas_invalidas_rollback.sql

-- Núcleo sin guarda: solo para funciones internas. Mismo criterio que fn_tax_account_mapping_validar.
create or replace function public.fn_cuenta_fallo_en_regla(p_org integer, p_codigo text)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_codigo text := nullif(btrim(p_codigo), '');
  v_activa boolean;
  v_movimiento boolean;
begin
  if v_codigo is null then
    return 'cuenta_no_existe';
  end if;
  select c.is_active, c.es_movimiento
    into v_activa, v_movimiento
    from public.chart_of_accounts c
   where c.organization_id = p_org
     and c.account_code = v_codigo;
  if not found then
    return 'cuenta_no_existe';
  end if;
  if v_activa is false then
    return 'cuenta_inactiva';
  end if;
  if v_movimiento is false or public.fn_es_cuenta_de_titulo(p_org, v_codigo) then
    return 'cuenta_de_titulo';
  end if;
  return null;
end;
$function$;

revoke all on function public.fn_cuenta_fallo_en_regla(integer, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_fallo_en_regla(integer, text) to service_role;

create or replace function public.fn_regla_fallo_cuenta(p_org integer, p_codigo text)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_assert_acceso_org(p_org);
  return public.fn_cuenta_fallo_en_regla(p_org, p_codigo);
end;
$function$;

revoke all on function public.fn_regla_fallo_cuenta(integer, text) from public, anon;
grant execute on function public.fn_regla_fallo_cuenta(integer, text) to authenticated, service_role;

create or replace function public.fn_accounting_rules_validar_cuentas()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lado record;
  v_fallo text;
begin
  new.debit_account_code := btrim(new.debit_account_code);
  new.credit_account_code := btrim(new.credit_account_code);
  new.tax_account_code := nullif(btrim(new.tax_account_code), '');
  new.discount_account_code := nullif(btrim(new.discount_account_code), '');

  -- Semillas y funciones internas (SECURITY DEFINER) corren como su dueño: ver la cabecera.
  if current_user not in ('authenticated', 'anon', 'service_role') then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'regla_otra_organizacion: una regla no cambia de empresa' using errcode = '22023';
  end if;

  for v_lado in
    select *
      from (values
        ('debito', new.debit_account_code, case when tg_op = 'UPDATE' then old.debit_account_code end),
        ('credito', new.credit_account_code, case when tg_op = 'UPDATE' then old.credit_account_code end),
        ('impuesto', new.tax_account_code, case when tg_op = 'UPDATE' then old.tax_account_code end),
        ('descuento', new.discount_account_code, case when tg_op = 'UPDATE' then old.discount_account_code end)
      ) as l(lado, nuevo, anterior)
  loop
    -- Impuesto y descuento son opcionales. Débito y crédito son NOT NULL: si llegan vacíos, se rechazan abajo.
    continue when v_lado.nuevo is null;
    -- Solo lo que cambia: una fila existente que no toca esta columna sigue pasando.
    continue when tg_op = 'UPDATE' and v_lado.nuevo is not distinct from nullif(btrim(v_lado.anterior), '');

    v_fallo := public.fn_regla_fallo_cuenta(new.organization_id, v_lado.nuevo);
    if v_fallo is not null then
      raise exception '%: la cuenta % no se puede usar en la regla', v_fallo, v_lado.nuevo
        using errcode = '22023',
              detail = 'lado=' || v_lado.lado || ';cuenta=' || v_lado.nuevo;
    end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists trg_accounting_rules_validar_cuentas on public.accounting_rules;
create trigger trg_accounting_rules_validar_cuentas
  before insert or update of debit_account_code, credit_account_code, tax_account_code, discount_account_code, organization_id
  on public.accounting_rules
  for each row execute function public.fn_accounting_rules_validar_cuentas();

-- Inventario de una empresa. Propone solo con evidencia de ESA empresa:
--   configuracion: lo que configuracion_contable fija para ese concepto (la misma clave que usa el asiento).
--   plan: la cuenta de título tiene un único auxiliar de movimiento activo. Nunca en 24xx: no se adivina.
--   uso: una sola cuenta de movimiento con ese prefijo de 4 dígitos en asientos publicados.
-- Si configuración y plan dicen cosas distintas, o no hay ninguna evidencia, la propuesta queda en null: es del Contador.
create or replace function public.fn_reglas_cuentas_invalidas(p_org integer)
returns table (
  regla_id uuid,
  lado text,
  cuenta text,
  estado text,
  propuesta text,
  propuesta_nombre text,
  evidencia text,
  usos_propuesta integer,
  candidata_configuracion text,
  candidata_plan text,
  candidata_uso text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v record;
  v_clave text;
begin
  for v in
    select r.id, r.source_type, x.lado, btrim(x.codigo) as codigo,
           public.fn_cuenta_fallo_en_regla(p_org, x.codigo) as fallo
      from public.accounting_rules r
     cross join lateral (values
       ('debito', r.debit_account_code),
       ('credito', r.credit_account_code),
       ('impuesto', r.tax_account_code),
       ('descuento', r.discount_account_code)
     ) as x(lado, codigo)
     where r.organization_id = p_org
       and nullif(btrim(x.codigo), '') is not null
  loop
    continue when v.fallo is null;

    regla_id := v.id;
    lado := v.lado;
    cuenta := v.codigo;
    estado := case v.fallo
      when 'cuenta_no_existe' then 'inexistente'
      when 'cuenta_inactiva' then 'inactiva'
      else 'titulo'
    end;
    candidata_configuracion := null;
    candidata_plan := null;
    candidata_uso := null;

    -- 14350101 y sus pares no tienen clave propia: el inventario se configura con la clave «inventario».
    v_clave := coalesce(
      public.fn_clave_cuenta_configurable(v.source_type, v.lado, v.codigo),
      case when left(v.codigo, 4) in ('1405', '1435') then 'inventario' end
    );
    if v_clave is not null then
      select c.account_code into candidata_configuracion
        from public.configuracion_contable c
       where c.organization_id = p_org
         and c.clave = v_clave
         and public.fn_cuenta_fallo_en_regla(p_org, c.account_code) is null
       order by c.branch_id nulls first
       limit 1;
    end if;

    if v.codigo not like '24%' then
      select case when count(*) = 1 then min(c.account_code) end into candidata_plan
        from public.chart_of_accounts c
       where c.organization_id = p_org
         and c.account_code like v.codigo || '_%'
         and c.es_movimiento is true
         and coalesce(c.is_active, true);
    end if;

    if left(v.codigo, 2) <> '24' then
      select case when count(distinct l.account_code) = 1 then min(l.account_code) end into candidata_uso
        from public.journal_lines l
        join public.journal_entries e on e.id = l.journal_entry_id
       where e.organization_id = p_org
         and e.posted
         and l.account_code like left(v.codigo, 4) || '%'
         and public.fn_cuenta_fallo_en_regla(p_org, l.account_code) is null;
    end if;

    if candidata_configuracion is not null
       and candidata_plan is not null
       and candidata_configuracion is distinct from candidata_plan then
      propuesta := null;
      evidencia := 'conflicto';
    else
      propuesta := coalesce(candidata_configuracion, candidata_plan, candidata_uso);
      evidencia := case
        when candidata_configuracion is not null then 'configuracion'
        when candidata_plan is not null then 'plan'
        when candidata_uso is not null then 'uso'
        else 'ninguna'
      end;
    end if;

    propuesta_nombre := null;
    usos_propuesta := 0;
    if propuesta is not null then
      select c.name into propuesta_nombre
        from public.chart_of_accounts c
       where c.organization_id = p_org and c.account_code = propuesta;
      select count(*)::integer into usos_propuesta
        from public.journal_lines l
        join public.journal_entries e on e.id = l.journal_entry_id
       where e.organization_id = p_org and e.posted and l.account_code = propuesta;
    end if;

    return next;
  end loop;
end;
$function$;

revoke all on function public.fn_reglas_cuentas_invalidas(integer) from public, anon, authenticated;
grant execute on function public.fn_reglas_cuentas_invalidas(integer) to service_role;

create or replace function public.fn_reglas_contables_diagnostico(p_organization_id integer)
returns table (
  regla_id uuid,
  lado text,
  cuenta text,
  estado text,
  propuesta text,
  propuesta_nombre text,
  evidencia text,
  usos_propuesta integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'SIN_PERMISO: ver el diagnóstico requiere el permiso finance.view' using errcode = '42501';
  end if;
  return query
  select d.regla_id, d.lado, d.cuenta, d.estado, d.propuesta, d.propuesta_nombre, d.evidencia, d.usos_propuesta
    from public.fn_reglas_cuentas_invalidas(p_organization_id) d;
end;
$function$;

revoke all on function public.fn_reglas_contables_diagnostico(integer) from public, anon;
grant execute on function public.fn_reglas_contables_diagnostico(integer) to authenticated, service_role;

-- Empresa nueva: la semilla escribe 14350101 antes de que exista el plan y se queda en 4135 o 4155 si el auxiliar
-- aún no nació. Aquí ya hay plan y configuración. Solo actúa si la empresa no tiene asientos y hay propuesta con
-- evidencia. Las empresas existentes nunca pasan por aquí: el disparador es AFTER INSERT en organizations.
create or replace function public.fn_reglas_sanear_org_nueva(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v record;
  v_n integer := 0;
begin
  if exists (select 1 from public.journal_entries e where e.organization_id = p_org) then
    return 0;
  end if;
  for v in
    select d.regla_id, d.lado, d.cuenta, d.propuesta
      from public.fn_reglas_cuentas_invalidas(p_org) d
     where d.propuesta is not null
  loop
    update public.accounting_rules r
       set debit_account_code = case when v.lado = 'debito' then v.propuesta else r.debit_account_code end,
           credit_account_code = case when v.lado = 'credito' then v.propuesta else r.credit_account_code end,
           tax_account_code = case when v.lado = 'impuesto' then v.propuesta else r.tax_account_code end,
           discount_account_code = case when v.lado = 'descuento' then v.propuesta else r.discount_account_code end,
           updated_at = now()
     where r.id = v.regla_id
       and r.organization_id = p_org;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.fn_reglas_sanear_org_nueva(integer) from public, anon, authenticated;
grant execute on function public.fn_reglas_sanear_org_nueva(integer) to service_role;

create or replace function public.trg_fn_reglas_sanear_org_nueva()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Nunca tumba el alta: si falla, la regla queda como salió de la semilla y aparece en el diagnóstico.
  begin
    perform public.fn_reglas_sanear_org_nueva(new.id);
  exception when others then
    raise warning 'fn_reglas_sanear_org_nueva(%) falló: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function public.trg_fn_reglas_sanear_org_nueva() from public, anon, authenticated;

-- trg_zzzzz ordena después de trg_zzzz_configuracion_contable y de trg_zzzz_sembrar_centros_org.
drop trigger if exists trg_zzzzz_reglas_saneadas on public.organizations;
create trigger trg_zzzzz_reglas_saneadas
  after insert on public.organizations
  for each row execute function public.trg_fn_reglas_sanear_org_nueva();
