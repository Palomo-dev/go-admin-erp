-- Categorías de tesorería.
--
-- Depende de lo ya aplicado en la base: plan con es_movimiento,
-- fn_primera_cuenta_detalle y fn_es_cuenta_de_titulo. No reescribe
-- fn_create_journal_entry. No inserta categorías en las organizaciones
-- que ya existen: el disparador solo siembra las nuevas, y la pantalla
-- llama a fn_sembrar_categorias_tesoreria para la organización de la sesión.
-- La propuesta de sembrar el resto está en supabase/propuestas y no se ejecuta.
--
-- Con cuenta_contable vacía, el asiento de caja y el de banco quedan como
-- estaban. La cuenta elegida solo entra cuando el movimiento la trae.

do $dep$
begin
  if to_regprocedure('public.fn_primera_cuenta_detalle(integer,text[])') is null
     or to_regprocedure('public.fn_es_cuenta_de_titulo(integer,text)') is null
     or not exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'chart_of_accounts'
          and column_name = 'es_movimiento'
     ) then
    raise exception 'Faltan el plan jerarquico o las funciones de cuenta de detalle';
  end if;
end
$dep$;

create table if not exists public.categorias_tesoreria (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations (id) on delete cascade,
  tipo text not null,
  nombre text not null,
  icono text not null default 'circle',
  cuenta_sugerida text,
  padre_id bigint references public.categorias_tesoreria (id) on delete restrict,
  activa boolean not null default true,
  es_predefinida boolean not null default false,
  clave text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categorias_tesoreria_tipo_chk check (tipo in ('ingreso', 'egreso')),
  constraint categorias_tesoreria_nombre_chk check (char_length(btrim(nombre)) between 1 and 80),
  constraint categorias_tesoreria_icono_chk check (char_length(icono) between 1 and 40)
);

comment on table public.categorias_tesoreria is
  'Categorías de ingreso y egreso de tesorería. La predefinida se edita y se desactiva; no se borra.';

create unique index if not exists categorias_tesoreria_org_clave
  on public.categorias_tesoreria (organization_id, clave)
  where clave is not null;

create unique index if not exists categorias_tesoreria_org_tipo_nombre
  on public.categorias_tesoreria (organization_id, tipo, lower(nombre));

create index if not exists categorias_tesoreria_org_tipo
  on public.categorias_tesoreria (organization_id, tipo, activa);

alter table public.categorias_tesoreria enable row level security;

revoke all on table public.categorias_tesoreria from public, anon, authenticated;
grant select, insert, update, delete on table public.categorias_tesoreria to authenticated;
grant all on table public.categorias_tesoreria to service_role;
revoke truncate, references, trigger on table public.categorias_tesoreria from authenticated;

grant usage, select on sequence public.categorias_tesoreria_id_seq to authenticated, service_role;

drop policy if exists "Miembros gestionan categorias de tesoreria" on public.categorias_tesoreria;
create policy "Miembros gestionan categorias de tesoreria"
  on public.categorias_tesoreria
  for all
  to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active
    )
  )
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active
    )
  );

create or replace function public.fn_categorias_tesoreria_guardar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_org integer;
  v_tipo text;
  v_siguiente bigint;
  v_visto integer := 0;
begin
  if tg_op = 'DELETE' then
    if old.es_predefinida then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
    return old;
  end if;

  new.nombre := btrim(new.nombre);
  new.icono := coalesce(nullif(btrim(new.icono), ''), 'circle');
  new.cuenta_sugerida := nullif(btrim(new.cuenta_sugerida), '');
  new.clave := nullif(btrim(new.clave), '');

  if new.nombre is null or new.nombre = '' or new.tipo not in ('ingreso', 'egreso') then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;

  if tg_op = 'INSERT'
     and new.es_predefinida
     and current_setting('app.sembrar_categorias', true) is distinct from '1' then
    new.es_predefinida := false;
    new.clave := null;
  end if;

  if tg_op = 'UPDATE' and old.es_predefinida then
    new.tipo := old.tipo;
    new.clave := old.clave;
    new.es_predefinida := true;
    new.organization_id := old.organization_id;
  end if;

  if not new.es_predefinida then
    new.clave := null;
  end if;

  if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo then
    if exists (select 1 from public.categorias_tesoreria where padre_id = new.id) then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
  end if;

  if new.padre_id is not null then
    if new.padre_id = new.id then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
    select organization_id, tipo, padre_id
      into v_org, v_tipo, v_siguiente
      from public.categorias_tesoreria
     where id = new.padre_id;
    if not found or v_org is distinct from new.organization_id or v_tipo is distinct from new.tipo then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
    while v_siguiente is not null and v_visto < 20 loop
      if v_siguiente = new.id then
        raise exception 'categoria_invalida' using errcode = '22023';
      end if;
      select padre_id into v_siguiente
        from public.categorias_tesoreria
       where id = v_siguiente;
      v_visto := v_visto + 1;
    end loop;
  end if;

  if new.cuenta_sugerida is not null and not exists (
    select 1
      from public.chart_of_accounts c
     where c.organization_id = new.organization_id
       and c.account_code = new.cuenta_sugerida
       and c.is_active is distinct from false
       and c.es_movimiento is distinct from false
  ) then
    raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_categorias_tesoreria_guardar on public.categorias_tesoreria;
create trigger trg_categorias_tesoreria_guardar
  before insert or update or delete on public.categorias_tesoreria
  for each row execute function public.fn_categorias_tesoreria_guardar();

revoke all on function public.fn_categorias_tesoreria_guardar() from public, anon, authenticated;

create or replace function public.fn_sembrar_categorias_tesoreria(p_org integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_insertadas integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform set_config('app.sembrar_categorias', '1', true);

  insert into public.categorias_tesoreria (
    organization_id, clave, tipo, nombre, icono, cuenta_sugerida, orden, activa, es_predefinida
  )
  select
    p_org,
    v.clave,
    v.tipo,
    v.nombre,
    v.icono,
    case
      when c.account_code is not null
       and c.is_active is distinct from false
       and c.es_movimiento is distinct from false
      then v.cuenta
      else null
    end,
    v.orden,
    true,
    true
  from (
    values
      ('ventas_productos', 'ingreso', 'Ventas de productos', 'shopping-bag', '4135', 10),
      ('servicios', 'ingreso', 'Servicios', 'wrench', '4155', 20),
      ('arriendos_recibidos', 'ingreso', 'Arriendos recibidos', 'home', '4220', 30),
      ('intereses_recibidos', 'ingreso', 'Intereses', 'percent', '421005', 40),
      ('comisiones_recibidas', 'ingreso', 'Comisiones recibidas', 'badge-percent', '4235', 50),
      ('reintegros', 'ingreso', 'Reintegros y recuperaciones', 'rotate-ccw', '4250', 60),
      ('aportes_socios', 'ingreso', 'Aportes de socios', 'users', '3105', 70),
      ('prestamos_recibidos', 'ingreso', 'Préstamos recibidos', 'landmark', '2105', 80),
      ('anticipos_clientes', 'ingreso', 'Anticipos de clientes', 'wallet', '2805', 90),
      ('cobro_cartera', 'ingreso', 'Cobro de cartera', 'receipt', '1305', 100),
      ('devolucion_proveedores', 'ingreso', 'Devolución de proveedores', 'undo-2', '2205', 110),
      ('otros_ingresos', 'ingreso', 'Otros ingresos', 'circle-plus', '4295', 120),
      ('proveedores', 'egreso', 'Proveedores y compras', 'truck', '2205', 10),
      ('nomina', 'egreso', 'Nómina', 'users', '5105', 20),
      ('seguridad_social', 'egreso', 'Seguridad social y parafiscales', 'shield', '5105', 30),
      ('arriendo', 'egreso', 'Arriendo', 'home', '5120', 40),
      ('energia', 'egreso', 'Energía', 'zap', '513530', 50),
      ('agua', 'egreso', 'Agua', 'droplet', '513525', 60),
      ('internet', 'egreso', 'Internet y telefonía', 'wifi', '513535', 70),
      ('transporte', 'egreso', 'Transporte y fletes', 'truck', '5135', 80),
      ('publicidad', 'egreso', 'Publicidad', 'megaphone', '523560', 90),
      ('mantenimiento', 'egreso', 'Mantenimiento', 'wrench', '5145', 100),
      ('papeleria', 'egreso', 'Papelería', 'file-text', '5195', 110),
      ('aseo', 'egreso', 'Aseo y cafetería', 'coffee', '5195', 120),
      ('honorarios', 'egreso', 'Honorarios', 'briefcase', '5110', 130),
      ('seguros', 'egreso', 'Seguros', 'shield-check', '5130', 140),
      ('impuestos', 'egreso', 'Impuestos', 'landmark', '5115', 150),
      ('comisiones_bancarias', 'egreso', 'Comisiones bancarias', 'landmark', '530515', 160),
      ('gmf', 'egreso', 'GMF 4x1000', 'banknote', '511595', 170),
      ('intereses_pagados', 'egreso', 'Intereses', 'percent', '530520', 180),
      ('software', 'egreso', 'Software y suscripciones', 'monitor', '5165', 190),
      ('combustible', 'egreso', 'Combustible', 'fuel', '5195', 200),
      ('viaticos', 'egreso', 'Viáticos', 'plane', '5155', 210),
      ('domicilios', 'egreso', 'Domicilios', 'bike', '5135', 220),
      ('pago_prestamos', 'egreso', 'Pago de préstamos', 'landmark', '2105', 230),
      ('retiros_socios', 'egreso', 'Retiros de socios', 'log-out', '3105', 240),
      ('devoluciones_clientes', 'egreso', 'Devoluciones a clientes', 'undo-2', '4175', 250),
      ('otros_gastos', 'egreso', 'Otros gastos', 'circle-minus', '5195', 260)
  ) as v(clave, tipo, nombre, icono, cuenta, orden)
  left join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = v.cuenta
  where not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org and ya.clave = v.clave
  )
  and not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org
       and ya.tipo = v.tipo
       and lower(ya.nombre) = lower(v.nombre)
  )
  on conflict (organization_id, clave) where clave is not null do nothing;

  get diagnostics v_insertadas = row_count;
  perform set_config('app.sembrar_categorias', '', true);
  return v_insertadas;
end;
$fn$;

revoke all on function public.fn_sembrar_categorias_tesoreria(integer) from public, anon;
grant execute on function public.fn_sembrar_categorias_tesoreria(integer) to authenticated, service_role;

create or replace function public.trg_fn_sembrar_categorias_tesoreria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.fn_sembrar_categorias_tesoreria(new.id);
  return new;
end;
$fn$;

drop trigger if exists tr_zzz_categorias_tesoreria on public.organizations;
create trigger tr_zzz_categorias_tesoreria
  after insert on public.organizations
  for each row execute function public.trg_fn_sembrar_categorias_tesoreria();

revoke all on function public.trg_fn_sembrar_categorias_tesoreria() from public, anon, authenticated;

alter table public.cash_movements
  add column if not exists categoria_id bigint references public.categorias_tesoreria (id) on delete set null,
  add column if not exists cuenta_contable text,
  add column if not exists centro_costo_id uuid references public.cost_centers (id) on delete set null,
  add column if not exists tercero_nit text,
  add column if not exists tercero_nombre text,
  add column if not exists soporte_path text;

alter table public.bank_transactions
  add column if not exists categoria_id bigint references public.categorias_tesoreria (id) on delete set null,
  add column if not exists cuenta_contable text,
  add column if not exists centro_costo_id uuid references public.cost_centers (id) on delete set null,
  add column if not exists tercero_nit text,
  add column if not exists tercero_nombre text,
  add column if not exists soporte_path text;

create index if not exists cash_movements_categoria_idx
  on public.cash_movements (organization_id, categoria_id, created_at)
  where categoria_id is not null;

create index if not exists bank_transactions_categoria_idx
  on public.bank_transactions (organization_id, categoria_id, trans_date)
  where categoria_id is not null;

create or replace function public.fn_validar_datos_tesoreria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tipo text;
  v_cat_org integer;
  v_cat_tipo text;
  v_cat_activa boolean;
  v_exige_centro boolean;
  v_exige_tercero boolean;
begin
  new.cuenta_contable := nullif(btrim(new.cuenta_contable), '');
  new.tercero_nit := nullif(btrim(new.tercero_nit), '');
  new.tercero_nombre := nullif(btrim(new.tercero_nombre), '');
  new.soporte_path := nullif(btrim(new.soporte_path), '');

  if new.categoria_id is null
     and new.cuenta_contable is null
     and new.centro_costo_id is null
     and new.tercero_nit is null
     and new.tercero_nombre is null
     and new.soporte_path is null then
    return new;
  end if;

  if tg_table_name = 'cash_movements' then
    v_tipo := case
      when new.type in ('in', 'deposit', 'income') then 'ingreso'
      when new.type in ('out', 'withdrawal', 'expense') then 'egreso'
      else null
    end;
  else
    v_tipo := case
      when new.transaction_type in ('deposit', 'interest') then 'ingreso'
      when new.transaction_type in ('withdrawal', 'fee') then 'egreso'
      when coalesce(new.amount, 0) < 0 then 'egreso'
      else 'ingreso'
    end;
  end if;

  if new.categoria_id is not null then
    select organization_id, tipo, activa
      into v_cat_org, v_cat_tipo, v_cat_activa
      from public.categorias_tesoreria
     where id = new.categoria_id;
    if not found
       or v_cat_org is distinct from new.organization_id
       or v_cat_activa is distinct from true
       or v_cat_tipo is distinct from v_tipo then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
  end if;

  if new.cuenta_contable is not null then
    if not exists (
      select 1
        from public.chart_of_accounts c
       where c.organization_id = new.organization_id
         and c.account_code = new.cuenta_contable
         and c.is_active is distinct from false
         and c.es_movimiento is distinct from false
    ) or public.fn_es_cuenta_de_titulo(new.organization_id, new.cuenta_contable) then
      raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023';
    end if;

    select coalesce(c.requiere_centro_costo, false), coalesce(c.requiere_tercero, false)
      into v_exige_centro, v_exige_tercero
      from public.chart_of_accounts c
     where c.organization_id = new.organization_id
       and c.account_code = new.cuenta_contable;

    if v_exige_centro and new.centro_costo_id is null then
      raise exception 'centro_costo_invalido' using errcode = '22023';
    end if;
    if v_exige_tercero and new.tercero_nit is null then
      raise exception 'tercero_requerido' using errcode = '22023';
    end if;
  end if;

  if new.centro_costo_id is not null and not exists (
    select 1
      from public.cost_centers cc
     where cc.id = new.centro_costo_id
       and cc.organization_id = new.organization_id
       and cc.is_active is distinct from false
  ) then
    raise exception 'centro_costo_invalido' using errcode = '22023';
  end if;

  if new.soporte_path is not null and new.soporte_path !~ (
    '^' || new.organization_id::text || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(pdf|jpe?g|png|webp)$'
  ) then
    raise exception 'soporte_invalido' using errcode = '22023';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_validar_datos_tesoreria_caja on public.cash_movements;
create trigger trg_validar_datos_tesoreria_caja
  before insert or update on public.cash_movements
  for each row execute function public.fn_validar_datos_tesoreria();

drop trigger if exists trg_validar_datos_tesoreria_banco on public.bank_transactions;
create trigger trg_validar_datos_tesoreria_banco
  before insert or update on public.bank_transactions
  for each row execute function public.fn_validar_datos_tesoreria();

revoke all on function public.fn_validar_datos_tesoreria() from public, anon, authenticated;

create or replace function public.fn_tesoreria_fallo_cuenta(p_org integer, p_codigo text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_activa boolean;
  v_mov boolean;
begin
  select is_active, es_movimiento
    into v_activa, v_mov
    from public.chart_of_accounts
   where organization_id = p_org
     and account_code = p_codigo;

  if not found or v_activa is false then
    return format('La cuenta %s no está en el plan contable', p_codigo);
  end if;
  if v_mov is false or public.fn_es_cuenta_de_titulo(p_org, p_codigo) then
    return format('La cuenta %s no es de movimiento', p_codigo);
  end if;
  return null;
end;
$fn$;

create or replace function public.fn_asiento_tesoreria_elegido(
  p_organization_id integer,
  p_tipo text,
  p_cuenta_movimiento text,
  p_cuenta_tesoreria text
)
returns table (debito text, credito text, fallo text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_mov text := nullif(btrim(p_cuenta_movimiento), '');
  v_tes text := nullif(btrim(p_cuenta_tesoreria), '');
  v_fallo text;
begin
  if v_mov is null then
    return query select null::text, null::text, 'Elige una cuenta de movimiento'::text;
    return;
  end if;
  if v_tes is null then
    return query select null::text, null::text, 'No hay cuenta de caja o banco para este movimiento'::text;
    return;
  end if;

  v_fallo := public.fn_tesoreria_fallo_cuenta(p_organization_id, v_mov);
  if v_fallo is not null then
    return query select null::text, null::text, v_fallo;
    return;
  end if;
  v_fallo := public.fn_tesoreria_fallo_cuenta(p_organization_id, v_tes);
  if v_fallo is not null then
    return query select null::text, null::text, v_fallo;
    return;
  end if;

  if v_mov = v_tes then
    return query select null::text, null::text, format('Las cuentas de débito y crédito quedaron iguales (%s)', v_mov);
    return;
  end if;

  if p_tipo = 'out' then
    if left(v_mov, 1) = '4' and left(v_mov, 4) is distinct from '4175' then
      return query select null::text, null::text, format('Un egreso no se debita contra una cuenta de ingreso (%s)', v_mov);
      return;
    end if;
    return query select v_mov, v_tes, null::text;
    return;
  end if;

  if p_tipo = 'in' then
    if left(v_mov, 1) = '5' then
      return query select null::text, null::text, format('Un ingreso no se acredita contra una cuenta de gasto (%s)', v_mov);
      return;
    end if;
    return query select v_tes, v_mov, null::text;
    return;
  end if;

  return query select null::text, null::text, 'Elige una cuenta de movimiento'::text;
end;
$fn$;

create or replace function public.fn_vista_previa_asiento_tesoreria(
  p_organization_id integer,
  p_tipo text,
  p_fuente text,
  p_bank_account_id integer,
  p_cuenta text
)
returns table (debito text, credito text, fallo text, cuenta_tesoreria text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tesoreria text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_fuente = 'bank' then
    select nullif(btrim(account_code), '')
      into v_tesoreria
      from public.bank_accounts
     where id = p_bank_account_id
       and organization_id = p_organization_id;
    if v_tesoreria is null or public.fn_es_cuenta_de_titulo(p_organization_id, v_tesoreria) then
      v_tesoreria := public.fn_primera_cuenta_detalle(p_organization_id, array['1110', '1105']);
    end if;
  else
    v_tesoreria := public.fn_primera_cuenta_detalle(p_organization_id, array['1105']);
  end if;

  return query
  select a.debito, a.credito, a.fallo, v_tesoreria
    from public.fn_asiento_tesoreria_elegido(
      p_organization_id, p_tipo, p_cuenta, v_tesoreria
    ) a;
end;
$fn$;

revoke all on function public.fn_tesoreria_fallo_cuenta(integer, text) from public, anon;
revoke all on function public.fn_asiento_tesoreria_elegido(integer, text, text, text) from public, anon;
revoke all on function public.fn_vista_previa_asiento_tesoreria(integer, text, text, integer, text) from public, anon;
grant execute on function public.fn_tesoreria_fallo_cuenta(integer, text) to service_role;
grant execute on function public.fn_asiento_tesoreria_elegido(integer, text, text, text) to service_role;
grant execute on function public.fn_vista_previa_asiento_tesoreria(integer, text, text, integer, text) to authenticated, service_role;

create or replace function public.fn_auto_journal_cash_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry_id integer;
  v_session record;
  v_es_entrada boolean;
  v_importe numeric;
  v_asiento record;
  v_tesoreria text;
  v_debito text;
  v_credito text;
  v_fallo text;
begin
  if new.return_id is not null then
    return new;
  end if;

  select cs.organization_id, cs.branch_id
    into v_session
    from public.cash_sessions cs
   where cs.id = new.cash_session_id;

  if v_session is null then
    return new;
  end if;

  v_es_entrada := coalesce(new.type, 'in') in ('in', 'deposit', 'income');
  v_importe := abs(coalesce(new.amount, 0));
  if coalesce(new.amount, 0) < 0 then
    v_es_entrada := not v_es_entrada;
  end if;
  if v_importe <= 0 then
    return new;
  end if;

  if nullif(btrim(new.cuenta_contable), '') is not null then
    v_tesoreria := public.fn_primera_cuenta_detalle(v_session.organization_id, array['1105']);
    select a.debito, a.credito, a.fallo
      into v_debito, v_credito, v_fallo
      from public.fn_asiento_tesoreria_elegido(
        v_session.organization_id,
        case when v_es_entrada then 'in' else 'out' end,
        new.cuenta_contable,
        v_tesoreria
      ) a;

    if v_fallo is not null or v_debito is null or v_credito is null then
      perform public.fn_log_journal_failure(
        v_session.organization_id, v_session.branch_id, new.created_at,
        'cash_movements', new.id::text, 'cash_move:' || new.id::text,
        v_debito, v_credito, v_importe,
        'sin_cuenta', coalesce(v_fallo, 'Elige una cuenta de movimiento'));
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := v_session.organization_id,
      p_branch_id := v_session.branch_id,
      p_entry_date := new.created_at,
      p_memo := 'Mov. Caja: ' || coalesce(new.type, '') || ' - ' || coalesce(new.concept, ''),
      p_source := 'cash_movements',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := v_importe,
      p_fact_key := 'cash_move:' || new.id::text
    );

    if v_entry_id is not null and new.centro_costo_id is not null then
      update public.journal_lines
         set cost_center_id = new.centro_costo_id
       where journal_entry_id = v_entry_id
         and account_code is distinct from v_tesoreria;
    end if;
    return new;
  end if;

  select a.accion, a.debito, a.credito
    into v_asiento
    from public.fn_asiento_movimiento_caja(
      v_session.organization_id,
      case when v_es_entrada then 'in' else 'out' end,
      new.concept_code
    ) a;

  if v_asiento.accion = 'omitir' then
    return new;
  end if;

  if v_asiento.accion is distinct from 'asiento' or v_asiento.debito is null or v_asiento.credito is null then
    perform public.fn_log_journal_failure(
      v_session.organization_id, v_session.branch_id, new.created_at,
      'cash_movements', new.id::text, 'cash_move:' || new.id::text,
      v_asiento.debito, v_asiento.credito, v_importe,
      'sin_cuenta', 'El egreso no tiene cuenta de gasto (clase 5) ni la del concepto; no se debita 4105');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := v_session.organization_id,
    p_branch_id := v_session.branch_id,
    p_entry_date := new.created_at,
    p_memo := 'Mov. Caja: ' || coalesce(new.type, '') || ' - ' || coalesce(new.concept, ''),
    p_source := 'cash_movements',
    p_source_id := new.id::text,
    p_debit_account := v_asiento.debito,
    p_credit_account := v_asiento.credito,
    p_amount := v_importe,
    p_fact_key := 'cash_move:' || new.id::text
  );

  return new;
end;
$fn$;

create or replace function public.fn_auto_journal_bank()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_default_branch integer;
  v_banco text;
  v_debito text;
  v_credito text;
  v_fallo text;
  v_importe numeric := abs(coalesce(new.amount, 0));
  v_es_entrada boolean;
begin
  if v_importe <= 0 then
    return new;
  end if;

  select branch_id, nullif(btrim(account_code), '')
    into v_branch_id, v_banco
    from public.bank_accounts
   where id = new.bank_account_id
     and organization_id = new.organization_id;

  select min(id) into v_default_branch from public.branches where organization_id = new.organization_id;
  v_branch_id := coalesce(v_branch_id, v_default_branch);

  if v_banco is null or public.fn_es_cuenta_de_titulo(new.organization_id, v_banco) then
    v_banco := public.fn_primera_cuenta_detalle(new.organization_id, array['1110', '1105']);
  end if;

  if nullif(btrim(new.cuenta_contable), '') is not null then
    v_es_entrada := case
      when new.transaction_type in ('deposit', 'interest') then true
      when new.transaction_type in ('withdrawal', 'fee') then false
      else coalesce(new.amount, 0) >= 0
    end;
    select a.debito, a.credito, a.fallo
      into v_debito, v_credito, v_fallo
      from public.fn_asiento_tesoreria_elegido(
        new.organization_id,
        case when v_es_entrada then 'in' else 'out' end,
        new.cuenta_contable,
        v_banco
      ) a;

    if v_fallo is not null or v_debito is null or v_credito is null then
      perform public.fn_log_journal_failure(
        new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
        'bank_transactions', new.id::text, 'bank:' || new.id::text,
        v_debito, v_credito, v_importe,
        'sin_cuenta', coalesce(v_fallo, 'Elige una cuenta de movimiento'));
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := v_branch_id,
      p_entry_date := coalesce(new.trans_date, new.created_at, now()),
      p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
      p_source := 'bank_transactions',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := v_importe,
      p_fact_key := 'bank:' || new.id::text
    );

    if v_entry_id is not null and new.centro_costo_id is not null then
      update public.journal_lines
         set cost_center_id = new.centro_costo_id
       where journal_entry_id = v_entry_id
         and account_code is distinct from v_banco;
    end if;
    return new;
  end if;

  if new.amount < 0 then
    v_debito := public.fn_primera_cuenta_detalle(new.organization_id, array['5305', '5195', '5135']);
    v_credito := v_banco;
  else
    v_debito := v_banco;
    v_credito := public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']);
  end if;

  if v_debito is null or v_credito is null
     or left(v_debito, 1) = '4'
     or left(v_credito, 1) = '5' then
    perform public.fn_log_journal_failure(
      new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
      'bank_transactions', new.id::text, 'bank:' || new.id::text,
      v_debito, v_credito, v_importe,
      'sin_cuenta', 'El ajuste de banco no usa 5105 ni 4105 y no encontró cuenta de detalle');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := v_branch_id,
    p_entry_date := coalesce(new.trans_date, new.created_at, now()),
    p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
    p_source := 'bank_transactions',
    p_source_id := new.id::text,
    p_debit_account := v_debito,
    p_credit_account := v_credito,
    p_amount := v_importe,
    p_fact_key := 'bank:' || new.id::text
  );

  return new;
end;
$fn$;

revoke all on function public.fn_auto_journal_cash_movement() from public, anon;
revoke all on function public.fn_auto_journal_bank() from public, anon;

drop function if exists public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz);

create or replace function public.pos_caja_registrar_movimiento(
  p_session_id integer,
  p_tipo text,
  p_monto numeric,
  p_concepto text,
  p_concept_code text default null,
  p_referencia text default null,
  p_notas text default null,
  p_uuid uuid default null,
  p_creado_en timestamptz default null,
  p_categoria_id bigint default null,
  p_cuenta_contable text default null,
  p_centro_costo_id uuid default null,
  p_tercero_nit text default null,
  p_tercero_nombre text default null,
  p_soporte_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  s record;
  m public.cash_movements;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  select id, organization_id, branch_id, status, opened_at
    into s
    from public.cash_sessions
   where id = p_session_id
   for share;
  if not found then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;

  perform public.fn_assert_acceso_org(s.organization_id);
  if s.branch_id is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  if p_uuid is not null then
    select * into m from public.cash_movements where organization_id = s.organization_id and uuid = p_uuid;
    if found then
      return to_jsonb(m) || jsonb_build_object('ya_registrado', true);
    end if;
  end if;

  if s.status <> 'open' then
    raise exception 'caja_cerrada' using errcode = '55000';
  end if;
  if p_tipo is null or p_tipo not in ('in', 'out') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 1e12 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if coalesce(btrim(p_concepto), '') = '' then
    raise exception 'concepto_requerido' using errcode = '22023';
  end if;

  insert into public.cash_movements (
    uuid, organization_id, cash_session_id, branch_id, type, concept, concept_code,
    reference, amount, user_id, notes, created_at,
    categoria_id, cuenta_contable, centro_costo_id, tercero_nit, tercero_nombre, soporte_path
  ) values (
    coalesce(p_uuid, gen_random_uuid()), s.organization_id, s.id, s.branch_id, p_tipo, btrim(p_concepto),
    nullif(btrim(p_concept_code), ''), nullif(btrim(p_referencia), ''), round(p_monto, 2), v_uid,
    nullif(btrim(p_notas), ''),
    case when p_creado_en is not null and p_creado_en >= s.opened_at and p_creado_en <= now() + interval '5 minutes'
         then p_creado_en else now() end,
    p_categoria_id, nullif(btrim(p_cuenta_contable), ''), p_centro_costo_id,
    nullif(btrim(p_tercero_nit), ''), nullif(btrim(p_tercero_nombre), ''), nullif(btrim(p_soporte_path), '')
  )
  returning * into m;

  return to_jsonb(m) || jsonb_build_object('ya_registrado', false);
end;
$fn$;

revoke all on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text) from public, anon;
grant execute on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text) to authenticated, service_role;

comment on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text) is
  'Registra un ingreso o egreso en una caja abierta. Los argumentos de categoría quedan null en el POS y el asiento sigue el concepto.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'soportes-tesoreria',
  'soportes-tesoreria',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists soportes_tesoreria_miembros_select on storage.objects;
drop policy if exists soportes_tesoreria_miembros_insert on storage.objects;
drop policy if exists soportes_tesoreria_miembros_delete on storage.objects;
create policy soportes_tesoreria_miembros_select on storage.objects
  for select to authenticated
  using (bucket_id = 'soportes-tesoreria' and (storage.foldername(name))[1] in (
    select om.organization_id::text from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));
create policy soportes_tesoreria_miembros_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'soportes-tesoreria' and (storage.foldername(name))[1] in (
    select om.organization_id::text from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));
create policy soportes_tesoreria_miembros_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'soportes-tesoreria' and (storage.foldername(name))[1] in (
    select om.organization_id::text from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

notify pgrst, 'reload schema';
