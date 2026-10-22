-- Fase 6. Extracto bancario: importar líneas, emparejarlas con movimientos
-- de la misma cuenta y crear el movimiento que el extracto trae y el libro no
-- (GMF, comisión, intereses). La categoría contable se busca por clave; si la
-- organización no la tiene, el movimiento se crea igual, sin inventar la fila.
--
-- Un periodo cerrado rechaza el movimiento: el disparador llama a
-- fn_is_period_open. No se reemplaza fn_create_journal_entry ni el asiento
-- automático de bancos.

create table if not exists public.extractos_bancarios (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  bank_account_id integer not null references public.bank_accounts(id) on delete restrict,
  reconciliation_id uuid references public.bank_reconciliations(id) on delete set null,
  nombre_archivo text,
  formato text not null default 'generico',
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_extractos_bancarios_cuenta
  on public.extractos_bancarios (organization_id, bank_account_id);

create table if not exists public.extracto_lineas (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  extracto_id uuid not null references public.extractos_bancarios(id) on delete cascade,
  reconciliation_id uuid references public.bank_reconciliations(id) on delete set null,
  numero integer not null,
  fecha date not null,
  descripcion text,
  referencia text,
  valor numeric not null,
  categoria text,
  estado text not null default 'pendiente',
  empareje text,
  bank_transaction_id integer references public.bank_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint extracto_lineas_estado_chk check (estado in ('pendiente', 'emparejada', 'creada')),
  constraint extracto_lineas_empareje_chk check (empareje is null or empareje in ('auto', 'manual')),
  constraint extracto_lineas_categoria_chk check (categoria is null or categoria in ('gmf', 'comision', 'interes')),
  constraint extracto_lineas_numero_key unique (extracto_id, numero)
);

create index if not exists idx_extracto_lineas_org
  on public.extracto_lineas (organization_id, estado);

create index if not exists idx_extracto_lineas_tx
  on public.extracto_lineas (bank_transaction_id)
  where bank_transaction_id is not null;

alter table public.extractos_bancarios enable row level security;
alter table public.extracto_lineas enable row level security;

drop policy if exists extractos_bancarios_lectura on public.extractos_bancarios;
create policy extractos_bancarios_lectura on public.extractos_bancarios
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

drop policy if exists extracto_lineas_lectura on public.extracto_lineas;
create policy extracto_lineas_lectura on public.extracto_lineas
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

revoke insert, update, delete, truncate on public.extractos_bancarios from anon, authenticated;
revoke insert, update, delete, truncate on public.extracto_lineas from anon, authenticated;
revoke all on public.extractos_bancarios from public, anon;
revoke all on public.extracto_lineas from public, anon;
grant select on public.extractos_bancarios to authenticated;
grant select on public.extracto_lineas to authenticated;

create or replace function public.fn_fase6_norm_ref(p_texto text)
returns text
language sql
immutable
as $fn$
  select nullif(regexp_replace(upper(coalesce(p_texto, '')), '[^A-Z0-9]', '', 'g'), '');
$fn$;

create or replace function public.fn_fase6_referencias_ok(p_a text, p_b text)
returns boolean
language sql
immutable
as $fn$
  select public.fn_fase6_norm_ref(p_a) is null
      or public.fn_fase6_norm_ref(p_b) is null
      or public.fn_fase6_norm_ref(p_a) = public.fn_fase6_norm_ref(p_b)
      or position(public.fn_fase6_norm_ref(p_a) in public.fn_fase6_norm_ref(p_b)) > 0
      or position(public.fn_fase6_norm_ref(p_b) in public.fn_fase6_norm_ref(p_a)) > 0;
$fn$;

-- Antes de insertar un movimiento de banco, una transferencia o un asiento,
-- el día tiene que caer en un periodo abierto. Sin periodo, sigue abierto.
create or replace function public.fn_fase6_exigir_periodo_abierto()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_dia date;
begin
  if tg_table_name = 'bank_transactions' then
    v_dia := coalesce(new.trans_date, now())::date;
  elsif tg_table_name = 'bank_transfers' then
    v_dia := coalesce(new.transfer_date, now())::date;
  else
    v_dia := coalesce(new.entry_date, now())::date;
  end if;
  if not public.fn_is_period_open(new.organization_id, v_dia) then
    raise exception 'periodo_cerrado' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_fase6_periodo_bank_tx on public.bank_transactions;
create trigger trg_fase6_periodo_bank_tx
  before insert on public.bank_transactions
  for each row execute function public.fn_fase6_exigir_periodo_abierto();

drop trigger if exists trg_fase6_periodo_bank_tr on public.bank_transfers;
create trigger trg_fase6_periodo_bank_tr
  before insert on public.bank_transfers
  for each row execute function public.fn_fase6_exigir_periodo_abierto();

drop trigger if exists trg_fase6_periodo_journal on public.journal_entries;
create trigger trg_fase6_periodo_journal
  before insert on public.journal_entries
  for each row execute function public.fn_fase6_exigir_periodo_abierto();

create or replace function public.fn_extracto_importar(
  p_organization_id integer,
  p_bank_account_id integer,
  p_reconciliation_id uuid,
  p_nombre text,
  p_formato text,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_cuenta integer;
  v_tz text;
  v_branch integer;
  v_extracto uuid;
  v_elem jsonb;
  v_n integer := 0;
  v_emp integer := 0;
  v_fecha date;
  v_valor numeric;
  v_ref text;
  v_desc text;
  v_cat text;
  v_linea uuid;
  v_tx integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'extracto_vacio' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lineas) > 2000 then
    raise exception 'extracto_demasiado_grande' using errcode = '22023';
  end if;

  v_branch := null;
  select ba.id, ba.branch_id into v_cuenta, v_branch
    from public.bank_accounts ba
   where ba.id = p_bank_account_id
     and ba.organization_id = p_organization_id;
  if v_cuenta is null then
    raise exception 'cuenta_ajena' using errcode = '42501';
  end if;

  if p_reconciliation_id is not null and not exists (
    select 1 from public.bank_reconciliations r
     where r.id = p_reconciliation_id
       and r.organization_id = p_organization_id
       and r.bank_account_id = p_bank_account_id
  ) then
    raise exception 'conciliacion_ajena' using errcode = '42501';
  end if;

  v_tz := public.fn_timezone_for(p_organization_id, v_branch);

  insert into public.extractos_bancarios (
    organization_id, bank_account_id, reconciliation_id, nombre_archivo, formato, created_by
  ) values (
    p_organization_id, p_bank_account_id, p_reconciliation_id,
    nullif(left(coalesce(p_nombre, ''), 180), ''),
    coalesce(nullif(left(coalesce(p_formato, ''), 40), ''), 'generico'),
    auth.uid()
  ) returning id into v_extracto;

  for v_elem in select value from jsonb_array_elements(p_lineas)
  loop
    v_n := v_n + 1;
    begin
      v_fecha := (v_elem ->> 'fecha')::date;
    exception when others then
      raise exception 'fecha_invalida' using errcode = '22007';
    end;
    v_valor := (v_elem ->> 'valor')::numeric;
    if v_fecha is null or v_valor is null then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    v_ref := nullif(left(coalesce(v_elem ->> 'referencia', ''), 80), '');
    v_desc := nullif(left(coalesce(v_elem ->> 'descripcion', ''), 240), '');
    v_cat := nullif(v_elem ->> 'categoria', '');
    if v_cat is not null and v_cat not in ('gmf', 'comision', 'interes') then
      v_cat := null;
    end if;

    insert into public.extracto_lineas (
      organization_id, extracto_id, reconciliation_id, numero, fecha,
      descripcion, referencia, valor, categoria
    ) values (
      p_organization_id, v_extracto, p_reconciliation_id, v_n, v_fecha,
      v_desc, v_ref, v_valor, v_cat
    ) returning id into v_linea;

    v_tx := null;
    select bt.id into v_tx
      from public.bank_transactions bt
     where bt.organization_id = p_organization_id
       and bt.bank_account_id = p_bank_account_id
       and coalesce(bt.status, 'unmatched') = 'unmatched'
       and abs(bt.amount - v_valor) < 0.005
       and abs((bt.trans_date at time zone v_tz)::date - v_fecha) <= 3
       and public.fn_fase6_referencias_ok(bt.reference, v_ref)
       and not exists (
         select 1 from public.extracto_lineas ya
          where ya.bank_transaction_id = bt.id
            and ya.estado in ('emparejada', 'creada')
       )
     order by
       case
         when public.fn_fase6_norm_ref(bt.reference) is not null
          and public.fn_fase6_norm_ref(bt.reference) = public.fn_fase6_norm_ref(v_ref)
         then 0 else 1
       end,
       abs((bt.trans_date at time zone v_tz)::date - v_fecha),
       bt.id
     limit 1;

    if v_tx is not null then
      update public.extracto_lineas
         set estado = 'emparejada', empareje = 'auto', bank_transaction_id = v_tx
       where id = v_linea;
      update public.bank_transactions
         set status = 'matched', updated_at = now()
       where id = v_tx and organization_id = p_organization_id;
      if p_reconciliation_id is not null then
        insert into public.bank_reconciliation_items (
          reconciliation_id, bank_transaction_id, match_type, amount, is_matched, match_date, notes
        )
        select p_reconciliation_id, v_tx, 'manual', abs(v_valor), true, now(), 'Empareje automatico del extracto'
        where not exists (
          select 1 from public.bank_reconciliation_items bri
           where bri.reconciliation_id = p_reconciliation_id
             and bri.bank_transaction_id = v_tx
        );
      end if;
      v_emp := v_emp + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'extracto_id', v_extracto,
    'lineas', v_n,
    'emparejadas', v_emp
  );
end;
$fn$;

create or replace function public.fn_extracto_emparejar(
  p_organization_id integer,
  p_linea_id uuid,
  p_transaction_id integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_linea public.extracto_lineas;
  v_tx public.bank_transactions;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select * into v_linea
    from public.extracto_lineas
   where id = p_linea_id and organization_id = p_organization_id
   for update;
  if v_linea.id is null or v_linea.estado <> 'pendiente' then
    raise exception 'linea_no_pendiente' using errcode = '23514';
  end if;
  select * into v_tx
    from public.bank_transactions
   where id = p_transaction_id and organization_id = p_organization_id
   for update;
  if v_tx.id is null then
    raise exception 'movimiento_ajeno' using errcode = '42501';
  end if;
  if v_tx.bank_account_id <> (
    select e.bank_account_id from public.extractos_bancarios e where e.id = v_linea.extracto_id
  ) then
    raise exception 'cuenta_distinta' using errcode = '23514';
  end if;
  if abs(v_tx.amount - v_linea.valor) >= 0.005 then
    raise exception 'valor_distinto' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.extracto_lineas ya
     where ya.bank_transaction_id = v_tx.id and ya.estado in ('emparejada', 'creada')
  ) then
    raise exception 'movimiento_ya_emparejado' using errcode = '23505';
  end if;

  update public.extracto_lineas
     set estado = 'emparejada', empareje = 'manual', bank_transaction_id = v_tx.id
   where id = v_linea.id;
  update public.bank_transactions
     set status = 'matched', updated_at = now()
   where id = v_tx.id;
  if v_linea.reconciliation_id is not null then
    insert into public.bank_reconciliation_items (
      reconciliation_id, bank_transaction_id, match_type, amount, is_matched, match_date, notes
    )
    select v_linea.reconciliation_id, v_tx.id, 'manual', abs(v_linea.valor), true, now(), 'Empareje manual del extracto'
    where not exists (
      select 1 from public.bank_reconciliation_items bri
       where bri.reconciliation_id = v_linea.reconciliation_id
         and bri.bank_transaction_id = v_tx.id
    );
  end if;
end;
$fn$;

create or replace function public.fn_extracto_crear_movimiento(
  p_organization_id integer,
  p_linea_id uuid,
  p_categoria text
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_linea public.extracto_lineas;
  v_cuenta integer;
  v_branch integer;
  v_tz text;
  v_tipo text;
  v_clave text;
  v_cat bigint;
  v_cuenta_contable text;
  v_tx integer;
  v_cuando timestamptz;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_categoria not in ('gmf', 'comision', 'interes') then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  select * into v_linea
    from public.extracto_lineas
   where id = p_linea_id and organization_id = p_organization_id
   for update;
  if v_linea.id is null or v_linea.estado <> 'pendiente' then
    raise exception 'linea_no_pendiente' using errcode = '23514';
  end if;

  select e.bank_account_id, ba.branch_id into v_cuenta, v_branch
    from public.extractos_bancarios e
    join public.bank_accounts ba on ba.id = e.bank_account_id
   where e.id = v_linea.extracto_id
     and e.organization_id = p_organization_id;
  v_tz := public.fn_timezone_for(p_organization_id, v_branch);
  v_cuando := make_timestamptz(
    extract(year from v_linea.fecha)::int,
    extract(month from v_linea.fecha)::int,
    extract(day from v_linea.fecha)::int,
    12, 0, 0, v_tz
  );

  -- Interés cobrado entra al banco. GMF, comisión e interés pagado salen.
  -- El tipo decide el lado del asiento cuando hay cuenta sugerida.
  v_tipo := case
    when p_categoria = 'interes' and v_linea.valor >= 0 then 'interest'
    else 'fee'
  end;
  v_clave := case
    when p_categoria = 'gmf' then 'gmf'
    when p_categoria = 'comision' then 'comisiones_bancarias'
    when v_linea.valor >= 0 then 'intereses_recibidos'
    else 'intereses_pagados'
  end;
  v_cat := null;
  v_cuenta_contable := null;
  select c.id, nullif(btrim(c.cuenta_sugerida), '')
    into v_cat, v_cuenta_contable
    from public.categorias_tesoreria c
   where c.organization_id = p_organization_id
     and c.clave = v_clave
     and c.activa
   limit 1;

  insert into public.bank_transactions (
    organization_id, bank_account_id, branch_id, trans_date, description,
    amount, reference, transaction_type, status, import_source, import_id,
    categoria_id, cuenta_contable, uuid, created_at, updated_at
  ) values (
    p_organization_id, v_cuenta, v_branch, v_cuando,
    left(
      case p_categoria
        when 'gmf' then 'GMF'
        when 'comision' then 'Comision bancaria'
        else 'Intereses'
      end || coalesce(' - ' || v_linea.descripcion, ''),
      240
    ),
    v_linea.valor, v_linea.referencia, v_tipo, 'matched', 'extracto', v_linea.id::text,
    v_cat, v_cuenta_contable, gen_random_uuid(), now(), now()
  ) returning id into v_tx;

  update public.extracto_lineas
     set estado = 'creada', categoria = p_categoria, bank_transaction_id = v_tx
   where id = v_linea.id;

  if v_linea.reconciliation_id is not null then
    insert into public.bank_reconciliation_items (
      reconciliation_id, bank_transaction_id, match_type, amount, is_matched, match_date, notes
    )
    select v_linea.reconciliation_id, v_tx, 'manual', abs(v_linea.valor), true, now(),
           'Movimiento creado desde el extracto'
    where not exists (
      select 1 from public.bank_reconciliation_items bri
       where bri.reconciliation_id = v_linea.reconciliation_id
         and bri.bank_transaction_id = v_tx
    );
  end if;

  return v_tx;
end;
$fn$;

revoke all on function public.fn_fase6_norm_ref(text) from public, anon, authenticated;
revoke all on function public.fn_fase6_referencias_ok(text, text) from public, anon, authenticated;
revoke all on function public.fn_fase6_exigir_periodo_abierto() from public, anon, authenticated;
revoke all on function public.fn_extracto_importar(integer, integer, uuid, text, text, jsonb) from public, anon;
revoke all on function public.fn_extracto_emparejar(integer, uuid, integer) from public, anon;
revoke all on function public.fn_extracto_crear_movimiento(integer, uuid, text) from public, anon;
grant execute on function public.fn_extracto_importar(integer, integer, uuid, text, text, jsonb) to authenticated;
grant execute on function public.fn_extracto_emparejar(integer, uuid, integer) to authenticated;
grant execute on function public.fn_extracto_crear_movimiento(integer, uuid, text) to authenticated;
