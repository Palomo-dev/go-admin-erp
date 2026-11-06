-- Conciliación bancaria: cierre validado en el servidor y partidas conciliatorias.
--
-- Decisión del Contador (auditoría 2026-11-06): se puede cerrar con diferencia,
-- con motivo obligatorio. La diferencia queda como partida conciliatoria
-- pendiente que pasa a la conciliación siguiente. NUNCA genera ajuste automático
-- a resultados: nada en esta migración escribe en journal_entries ni en
-- journal_lines.
--
-- Convención única del signo: diferencia = saldo en libros - saldo del extracto.
-- Es la misma expresión de la columna generada bank_reconciliations.difference.
--
-- Qué se corrige:
--  * El cierre era un UPDATE desde el navegador, sin motivo y sin closed_by.
--    Ahora solo cierra fn_conciliacion_cerrar; un UPDATE directo es rechazado.
--  * closing_balance venía calculado en el cliente, con los importes de los items
--    tal cual. Los items del extracto guardan abs(valor), así que un retiro
--    sumaba como entrada. Ahora lo calcula la base con el signo del movimiento.
--  * Una conciliación cerrada se podía editar y borrar.
--
-- Rollback: supabase/rollbacks/20261107110000_conciliacion_cierre_con_partidas_rollback.sql

alter table public.bank_reconciliations
  add column if not exists close_reason text;

comment on column public.bank_reconciliations.close_reason is
  'Motivo del cierre. Obligatorio cuando se cierra con diferencia.';

create table if not exists public.conciliacion_partidas (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  bank_account_id integer not null references public.bank_accounts(id) on delete cascade,
  -- Conciliación en la que nació la partida.
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  fecha date not null,
  descripcion text not null,
  -- Con el signo de la diferencia: saldo en libros - saldo del extracto.
  valor numeric not null,
  estado text not null default 'pendiente',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolved_reconciliation_id uuid references public.bank_reconciliations(id) on delete set null,
  bank_transaction_id integer references public.bank_transactions(id) on delete set null,
  constraint conciliacion_partidas_valor_chk check (valor <> 0),
  constraint conciliacion_partidas_estado_chk check (estado in ('pendiente', 'resuelta')),
  constraint conciliacion_partidas_resuelta_chk check ((estado = 'resuelta') = (resolved_at is not null))
);

comment on table public.conciliacion_partidas is
  'Partidas conciliatorias: la diferencia con la que se cerró una conciliación. Pasan a la conciliación siguiente de la misma cuenta hasta resolverse. No generan asiento.';

-- Una conciliación deja como mucho una partida: cerrar dos veces no la duplica.
create unique index if not exists conciliacion_partidas_origen_uq
  on public.conciliacion_partidas (reconciliation_id);
create index if not exists conciliacion_partidas_cuenta_idx
  on public.conciliacion_partidas (organization_id, bank_account_id, estado);
create index if not exists conciliacion_partidas_resuelta_en_idx
  on public.conciliacion_partidas (resolved_reconciliation_id)
  where resolved_reconciliation_id is not null;
create index if not exists conciliacion_partidas_movimiento_idx
  on public.conciliacion_partidas (bank_transaction_id)
  where bank_transaction_id is not null;

alter table public.conciliacion_partidas enable row level security;

drop policy if exists conciliacion_partidas_miembros_leen on public.conciliacion_partidas;
create policy conciliacion_partidas_miembros_leen
  on public.conciliacion_partidas
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active = true
    )
  );

-- Sin políticas de escritura: las partidas solo se tocan por las RPC de abajo.
revoke all on table public.conciliacion_partidas from public, anon, authenticated;
grant select on table public.conciliacion_partidas to authenticated;
grant all on table public.conciliacion_partidas to service_role;

-- Suma con signo de lo conciliado. amount > 0 entra a la cuenta, amount < 0 sale
-- (la regla de src/lib/finanzas/movimientoBancario.ts). El importe del item solo
-- cuenta si no hay movimiento: los del extracto guardan abs(valor).
create or replace function public.fn_conciliacion_conciliado(p_reconciliation_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(coalesce(bt.amount, i.amount)), 0)
    from public.bank_reconciliation_items i
    left join public.bank_transactions bt on bt.id = i.bank_transaction_id
   where i.reconciliation_id = p_reconciliation_id
     and i.is_matched;
$function$;

revoke all on function public.fn_conciliacion_conciliado(uuid) from public, anon, authenticated;
grant execute on function public.fn_conciliacion_conciliado(uuid) to service_role;

-- closing_balance lo escribe la base, una conciliación cerrada no cambia y el
-- paso a cerrada solo entra por fn_conciliacion_cerrar.
create or replace function public.fn_conciliacion_guarda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE' then
    -- Profundidad > 1: borrado en cascada de la cuenta o de la organización.
    if old.status = 'closed' and pg_trigger_depth() <= 1 then
      raise exception 'conciliacion_cerrada' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'closed' then
    raise exception 'conciliacion_cerrada' using errcode = '23514';
  end if;

  if new.status = 'closed'
     and coalesce(current_setting('app.conciliacion_cierre', true), '') <> 'on' then
    raise exception 'cierre_solo_por_rpc' using errcode = '42501';
  end if;

  new.closing_balance := new.opening_balance + public.fn_conciliacion_conciliado(new.id);
  return new;
end;
$function$;

revoke all on function public.fn_conciliacion_guarda() from public, anon, authenticated;

drop trigger if exists trg_conciliacion_guarda on public.bank_reconciliations;
create trigger trg_conciliacion_guarda
  before insert or update or delete on public.bank_reconciliations
  for each row execute function public.fn_conciliacion_guarda();

-- Los items de una conciliación cerrada tampoco cambian.
create or replace function public.fn_conciliacion_items_guarda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.reconciliation_id else new.reconciliation_id end;
  if pg_trigger_depth() <= 1 and exists (
    select 1 from public.bank_reconciliations r
     where r.id = v_id and r.status = 'closed'
  ) then
    raise exception 'conciliacion_cerrada' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_conciliacion_items_guarda() from public, anon, authenticated;

drop trigger if exists trg_conciliacion_items_guarda on public.bank_reconciliation_items;
create trigger trg_conciliacion_items_guarda
  before insert or update or delete on public.bank_reconciliation_items
  for each row execute function public.fn_conciliacion_items_guarda();

-- Cada cambio en los items recalcula closing_balance (fn_conciliacion_guarda).
create or replace function public.fn_conciliacion_items_saldo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.bank_reconciliations r
     set updated_at = now()
   where r.status <> 'closed'
     and r.id in (
       case when tg_op <> 'DELETE' then new.reconciliation_id end,
       case when tg_op <> 'INSERT' then old.reconciliation_id end
     );
  return null;
end;
$function$;

revoke all on function public.fn_conciliacion_items_saldo() from public, anon, authenticated;

drop trigger if exists trg_conciliacion_items_saldo on public.bank_reconciliation_items;
create trigger trg_conciliacion_items_saldo
  after insert or update or delete on public.bank_reconciliation_items
  for each row execute function public.fn_conciliacion_items_saldo();

-- Pendientes de conciliaciones anteriores de la misma cuenta.
create or replace function public.fn_conciliacion_traidas(p_reconciliation_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(p.valor), 0)
    from public.bank_reconciliations r
    join public.conciliacion_partidas p
      on p.organization_id = r.organization_id
     and p.bank_account_id = r.bank_account_id
     and p.reconciliation_id <> r.id
     and p.estado = 'pendiente'
    join public.bank_reconciliations origen on origen.id = p.reconciliation_id
   where r.id = p_reconciliation_id
     and origen.period_end < r.period_end;
$function$;

revoke all on function public.fn_conciliacion_traidas(uuid) from public, anon, authenticated;
grant execute on function public.fn_conciliacion_traidas(uuid) to service_role;

-- Único camino para cerrar. Después del cierre se cumple:
--   suma de partidas pendientes de la cuenta = saldo en libros - saldo del extracto
-- No escribe en journal_entries ni en journal_lines.
create or replace function public.fn_conciliacion_cerrar(
  p_organization_id integer,
  p_reconciliation_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_rec public.bank_reconciliations%rowtype;
  v_motivo text := nullif(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), '');
  v_extracto numeric;
  v_libros numeric;
  v_diferencia numeric;
  v_traidas numeric;
  v_nueva numeric;
  v_partida uuid;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select * into v_rec
    from public.bank_reconciliations
   where id = p_reconciliation_id
     and organization_id = p_organization_id
   for update;
  if v_rec.id is null then
    raise exception 'conciliacion_no_encontrada' using errcode = 'P0002';
  end if;
  if v_rec.status = 'closed' then
    raise exception 'conciliacion_ya_cerrada' using errcode = '23514';
  end if;

  -- Las partidas pasan en orden: la anterior de la cuenta debe estar cerrada.
  if exists (
    select 1 from public.bank_reconciliations a
     where a.organization_id = p_organization_id
       and a.bank_account_id = v_rec.bank_account_id
       and a.id <> v_rec.id
       and a.status <> 'closed'
       and a.period_end < v_rec.period_end
  ) then
    raise exception 'conciliacion_anterior_abierta' using errcode = '23514';
  end if;

  v_extracto := v_rec.statement_balance;
  if v_extracto is null then
    raise exception 'falta_saldo_extracto' using errcode = '23514';
  end if;

  v_libros := v_rec.opening_balance + public.fn_conciliacion_conciliado(v_rec.id);
  v_diferencia := v_libros - v_extracto;
  v_traidas := public.fn_conciliacion_traidas(v_rec.id);
  v_nueva := v_diferencia - v_traidas;

  if abs(v_diferencia) >= 0.005 or abs(v_nueva) >= 0.005 then
    if v_motivo is null or char_length(v_motivo) < 5 then
      raise exception 'motivo_obligatorio' using errcode = '22023';
    end if;
  end if;
  if char_length(coalesce(v_motivo, '')) > 500 then
    raise exception 'motivo_largo' using errcode = '22023';
  end if;

  perform set_config('app.conciliacion_cierre', 'on', true);
  update public.bank_reconciliations
     set status = 'closed',
         closed_at = now(),
         closed_by = v_uid,
         close_reason = v_motivo
   where id = v_rec.id;
  perform set_config('app.conciliacion_cierre', '', true);

  if abs(v_nueva) >= 0.005 then
    insert into public.conciliacion_partidas (
      organization_id, bank_account_id, reconciliation_id, fecha,
      descripcion, valor, created_by
    ) values (
      p_organization_id, v_rec.bank_account_id, v_rec.id, v_rec.period_end,
      v_motivo, v_nueva, v_uid
    ) returning id into v_partida;
  end if;

  return jsonb_build_object(
    'saldo_libros', v_libros,
    'saldo_extracto', v_extracto,
    'diferencia', v_diferencia,
    'traidas', v_traidas,
    'partida_nueva', v_nueva,
    'partida_id', v_partida
  );
end;
$function$;

revoke all on function public.fn_conciliacion_cerrar(integer, uuid, text) from public, anon;
grant execute on function public.fn_conciliacion_cerrar(integer, uuid, text) to authenticated, service_role;

-- La partida apareció en el extracto. No genera asiento.
create or replace function public.fn_conciliacion_partida_resolver(
  p_organization_id integer,
  p_partida_id uuid,
  p_reconciliation_id uuid,
  p_bank_transaction_id integer default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_partida public.conciliacion_partidas%rowtype;
  v_rec public.bank_reconciliations%rowtype;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select * into v_partida
    from public.conciliacion_partidas
   where id = p_partida_id
     and organization_id = p_organization_id
   for update;
  if v_partida.id is null then
    raise exception 'partida_no_encontrada' using errcode = 'P0002';
  end if;
  if v_partida.estado <> 'pendiente' then
    raise exception 'partida_ya_resuelta' using errcode = '23514';
  end if;

  select * into v_rec
    from public.bank_reconciliations
   where id = p_reconciliation_id
     and organization_id = p_organization_id
   for update;
  if v_rec.id is null then
    raise exception 'conciliacion_no_encontrada' using errcode = 'P0002';
  end if;
  if v_rec.status = 'closed' then
    raise exception 'conciliacion_cerrada' using errcode = '23514';
  end if;
  if v_rec.bank_account_id <> v_partida.bank_account_id
     or v_rec.id = v_partida.reconciliation_id
     or not exists (
       select 1 from public.bank_reconciliations origen
        where origen.id = v_partida.reconciliation_id
          and origen.period_end < v_rec.period_end
     ) then
    raise exception 'partida_de_otra_conciliacion' using errcode = '23514';
  end if;

  if p_bank_transaction_id is not null and not exists (
    select 1 from public.bank_transactions bt
     where bt.id = p_bank_transaction_id
       and bt.organization_id = p_organization_id
       and bt.bank_account_id = v_partida.bank_account_id
  ) then
    raise exception 'movimiento_ajeno' using errcode = '42501';
  end if;

  update public.conciliacion_partidas
     set estado = 'resuelta',
         resolved_at = now(),
         resolved_by = auth.uid(),
         resolved_reconciliation_id = v_rec.id,
         bank_transaction_id = p_bank_transaction_id
   where id = v_partida.id;
end;
$function$;

revoke all on function public.fn_conciliacion_partida_resolver(integer, uuid, uuid, integer) from public, anon;
grant execute on function public.fn_conciliacion_partida_resolver(integer, uuid, uuid, integer) to authenticated, service_role;

-- Nombre para «Cerrada por» y «Registrada por». profiles no se abre al navegador.
create or replace function public.fn_conciliacion_nombre(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email)
    from public.profiles p
   where p.id = p_user_id;
$function$;

revoke all on function public.fn_conciliacion_nombre(uuid) from public, anon, authenticated;
grant execute on function public.fn_conciliacion_nombre(uuid) to service_role;

-- Lo que la pantalla necesita: el cierre, las partidas propias y las traídas.
create or replace function public.fn_conciliacion_partidas(
  p_organization_id integer,
  p_reconciliation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rec public.bank_reconciliations%rowtype;
  v_propias jsonb;
  v_traidas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select * into v_rec
    from public.bank_reconciliations
   where id = p_reconciliation_id
     and organization_id = p_organization_id;
  if v_rec.id is null then
    raise exception 'conciliacion_no_encontrada' using errcode = 'P0002';
  end if;

  with filas as (
    select p.*,
           origen.period_end as origen_fin,
           (p.reconciliation_id = v_rec.id) as propia
      from public.conciliacion_partidas p
      join public.bank_reconciliations origen on origen.id = p.reconciliation_id
     where p.organization_id = p_organization_id
       and p.bank_account_id = v_rec.bank_account_id
       and (
         p.reconciliation_id = v_rec.id
         or (
           origen.period_end < v_rec.period_end
           and (
             p.estado = 'pendiente'
             or p.resolved_reconciliation_id = v_rec.id
             or (v_rec.closed_at is not null and p.resolved_at > v_rec.closed_at)
           )
         )
       )
  ), con_json as (
    select f.propia, f.fecha, f.id, jsonb_build_object(
      'id', f.id,
      'fecha', f.fecha,
      'descripcion', f.descripcion,
      'valor', f.valor,
      'estado', f.estado,
      'registrada_por', public.fn_conciliacion_nombre(f.created_by),
      'resuelta_en', f.resolved_at,
      'resuelta_aqui', f.resolved_reconciliation_id = v_rec.id,
      'bank_transaction_id', f.bank_transaction_id,
      'origen_fin', f.origen_fin
    ) as fila
      from filas f
  )
  select coalesce(jsonb_agg(c.fila order by c.fecha, c.id) filter (where c.propia), '[]'::jsonb),
         coalesce(jsonb_agg(c.fila order by c.fecha, c.id) filter (where not c.propia), '[]'::jsonb)
    into v_propias, v_traidas
    from con_json c;

  return jsonb_build_object(
    'cierre', case when v_rec.status = 'closed' then jsonb_build_object(
      'cerrada_por', public.fn_conciliacion_nombre(v_rec.closed_by),
      'cerrada_en', v_rec.closed_at,
      'motivo', v_rec.close_reason
    ) end,
    'traidas_pendientes', public.fn_conciliacion_traidas(v_rec.id),
    'propias', v_propias,
    'traidas', v_traidas
  );
end;
$function$;

revoke all on function public.fn_conciliacion_partidas(integer, uuid) from public, anon;
grant execute on function public.fn_conciliacion_partidas(integer, uuid) to authenticated, service_role;
