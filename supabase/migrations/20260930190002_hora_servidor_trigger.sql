-- Hora oficial del servidor · M2 — el navegador no fija la hora de un hecho de dinero.
-- Análisis: docs/design/HORA-SERVIDOR-ANALISIS.md §4.1
--
-- Cuando quien escribe es `anon` o `authenticated` DIRECTAMENTE (un insert/update
-- de PostgREST: current_user es ese rol), las marcas de tiempo del hecho se
-- sustituyen por now() al insertar y no se pueden cambiar al actualizar. Un cierre
-- (columna con «?») que pasa de NULL a un valor toma now().
--
-- No se tocan:
--   · las RPC SECURITY DEFINER (current_user = su dueño): ya validan la hora
--     (pos_checkout_v1, pos_caja_cerrar, pos_caja_registrar_movimiento…);
--   · service_role: importaciones y cargas con fechas históricas legítimas.
-- Verificado el 2026-09-30: ninguna función SECURITY INVOKER inserta fechas
-- explícitas en estas tablas.
--
-- Las fechas que el usuario ELIGE (issue_date, due_date, payment_date, expiry_date)
-- son datos, no reloj: no están en la lista.
--
-- La función del trigger es SECURITY INVOKER a propósito: con DEFINER, current_user
-- sería siempre su dueño y el trigger no distinguiría al navegador.
-- Rollback: supabase/rollbacks/20260930190002_hora_servidor_trigger_rollback.sql

create or replace function public.fn_trg_hora_oficial()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_arg text;
  v_col text;
  v_dev text;
  v_cierre boolean;
  v_valor timestamptz;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  v_new := to_jsonb(new);
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;

  -- Argumentos: 'col' (marca del alta), '?col' (marca de un cierre, puede ser NULL),
  -- 'col>col_equipo' (además guarda en col_equipo la hora que mandó el navegador).
  foreach v_arg in array tg_argv loop
    v_cierre := left(v_arg, 1) = '?';
    v_col := split_part(ltrim(v_arg, '?'), '>', 1);
    v_dev := nullif(split_part(v_arg, '>', 2), '');

    if tg_op = 'INSERT' then
      if v_cierre and (v_new->>v_col) is null then
        continue;
      end if;
      if v_dev is not null and (v_new->>v_col) is not null and (v_new->>v_dev) is null then
        v_valor := (v_new->>v_col)::timestamptz;
        if abs(extract(epoch from (v_valor - now()))) > 120 then
          v_new := jsonb_set(v_new, array[v_dev], to_jsonb(v_valor));
        end if;
      end if;
      v_new := jsonb_set(v_new, array[v_col], to_jsonb(now()));
    elsif (v_new->v_col) is distinct from (v_old->v_col) then
      if (v_old->>v_col) is null then
        v_new := jsonb_set(v_new, array[v_col], to_jsonb(now()));
      elsif (v_new->>v_col) is not null or not v_cierre then
        -- Una marca ya puesta no se reescribe (un cierre sí se puede anular a NULL).
        v_new := jsonb_set(v_new, array[v_col], v_old->v_col);
      end if;
    end if;
  end loop;

  new := jsonb_populate_record(new, v_new);
  return new;
end;
$$;

comment on function public.fn_trg_hora_oficial() is
  'BEFORE INSERT/UPDATE: si escribe anon/authenticated directamente, las marcas de tiempo del hecho (TG_ARGV) las pone el servidor. RPC SECURITY DEFINER y service_role quedan fuera.';

revoke all on function public.fn_trg_hora_oficial() from public, anon, authenticated;

-- ── Apertura de caja: la regla de sin conexión ───────────────────────────────
-- En línea el POS no manda opened_at (default now()). Si llega una hora que
-- difiere más de 2 min de now(), es una apertura hecha sin red que se sincroniza:
-- se guarda en device_opened_at y la hora oficial la decide fn_hora_oficial_resolver
-- con el desfase que el equipo midió antes de quedarse sin red.
create or replace function public.fn_trg_caja_hora_oficial()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_equipo timestamptz;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.server_received_at := now();
    v_equipo := new.opened_at;
    if v_equipo is null or abs(extract(epoch from (v_equipo - now()))) <= 120 then
      new.opened_at := now();
      new.device_opened_at := null;
      new.time_review_reason := null;
    else
      new.device_opened_at := v_equipo;
      select r.instante, r.motivo_revision into new.opened_at, new.time_review_reason
        from public.fn_hora_oficial_resolver(v_equipo, new.device_clock_offset_ms, true) r;
    end if;
    if new.closed_at is not null then
      new.closed_at := greatest(now(), new.opened_at);
    end if;
    return new;
  end if;

  -- UPDATE directo: la apertura y su auditoría no cambian; un cierre toma now().
  new.opened_at := old.opened_at;
  new.created_at := old.created_at;
  new.device_opened_at := old.device_opened_at;
  new.device_clock_offset_ms := old.device_clock_offset_ms;
  new.server_received_at := old.server_received_at;
  new.time_review_reason := old.time_review_reason;
  if new.closed_at is distinct from old.closed_at then
    if old.closed_at is null and new.closed_at is not null then
      new.closed_at := greatest(now(), new.opened_at);
    elsif new.closed_at is not null then
      new.closed_at := old.closed_at;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.fn_trg_caja_hora_oficial() is
  'BEFORE INSERT/UPDATE en cash_sessions: apertura en línea = now(); apertura sin conexión = fn_hora_oficial_resolver con el desfase medido. Solo para escrituras directas de anon/authenticated.';

revoke all on function public.fn_trg_caja_hora_oficial() from public, anon, authenticated;

-- ── Tablas ───────────────────────────────────────────────────────────────────
drop trigger if exists trg_00_hora_oficial on public.sales;
create trigger trg_00_hora_oficial before insert or update on public.sales
  for each row execute function public.fn_trg_hora_oficial('created_at', 'sale_date>device_created_at');

drop trigger if exists trg_00_hora_oficial on public.sale_items;
create trigger trg_00_hora_oficial before insert or update on public.sale_items
  for each row execute function public.fn_trg_hora_oficial('created_at', '?paid_at');

drop trigger if exists trg_00_hora_oficial on public.payments;
create trigger trg_00_hora_oficial before insert or update on public.payments
  for each row execute function public.fn_trg_hora_oficial('created_at');

drop trigger if exists trg_00_hora_oficial on public.cash_movements;
create trigger trg_00_hora_oficial before insert or update on public.cash_movements
  for each row execute function public.fn_trg_hora_oficial('created_at');

drop trigger if exists trg_00_hora_oficial on public.table_sessions;
create trigger trg_00_hora_oficial before insert or update on public.table_sessions
  for each row execute function public.fn_trg_hora_oficial('created_at', 'opened_at', '?closed_at');

drop trigger if exists trg_00_hora_oficial on public.returns;
create trigger trg_00_hora_oficial before insert or update on public.returns
  for each row execute function public.fn_trg_hora_oficial('created_at', 'return_date');

drop trigger if exists trg_00_hora_oficial on public.stock_movements;
create trigger trg_00_hora_oficial before insert or update on public.stock_movements
  for each row execute function public.fn_trg_hora_oficial('created_at');

drop trigger if exists trg_00_hora_oficial on public.invoice_sales;
create trigger trg_00_hora_oficial before insert or update on public.invoice_sales
  for each row execute function public.fn_trg_hora_oficial('created_at');

drop trigger if exists trg_00_hora_oficial on public.invoice_purchase;
create trigger trg_00_hora_oficial before insert or update on public.invoice_purchase
  for each row execute function public.fn_trg_hora_oficial('created_at');

drop trigger if exists trg_00_hora_oficial on public.credit_notes;
create trigger trg_00_hora_oficial before insert or update on public.credit_notes
  for each row execute function public.fn_trg_hora_oficial('created_at');

drop trigger if exists trg_00_hora_oficial on public.cash_sessions;
create trigger trg_00_hora_oficial before insert or update on public.cash_sessions
  for each row execute function public.fn_trg_caja_hora_oficial();
