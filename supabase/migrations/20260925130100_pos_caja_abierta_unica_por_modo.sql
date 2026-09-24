-- K-2 (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md §5, hallazgo B2): no
-- había índice único de caja abierta; la apertura solo se validaba en el
-- navegador (`CajasService.openSession`), con carrera entre dos pestañas o dos
-- cajeros.
--
-- La unicidad depende del modo de la organización
-- (`organization_settings`, key `pos_cash_session_mode`, `settings.mode`):
--   - branch (default): una caja abierta por sucursal (y una global, branch_id NULL).
--   - user: una caja abierta por cajero y sucursal.
-- Un índice parcial no puede leer otra tabla, así que un disparador BEFORE
-- INSERT calcula `open_scope_key` con el modo vigente al abrir y el índice
-- único parcial `(organization_id, open_scope_key) WHERE status = 'open'` lo
-- hace cumplir, también ante inserciones concurrentes.
--
--   branch → 'b:<branch_id|g>'          user → 'u:<branch_id|g>:<opened_by>'
--
-- Además, en modo branch el disparador rechaza abrir si ya hay CUALQUIER caja
-- abierta en esa sucursal (cubre cajas abiertas en modo user antes de que la
-- organización cambiara a branch, cuya clave es 'u:…').
--
-- Verificado el 2026-09-23 antes de aplicar: 14 cajas abiertas, 0 duplicados
-- en ninguno de los dos modos (2 organizaciones en modo user, 12 en branch),
-- 0 cajas globales abiertas. El índice se crea sin conflicto.
--
-- Errores: 23505 (unique_violation) con el nombre del índice o con el mensaje
-- 'caja_ya_abierta'. `CajasService.openSession` y `cashSync.replayOpen` ya
-- tratan 23505.

alter table public.cash_sessions add column if not exists open_scope_key text;

comment on column public.cash_sessions.open_scope_key is
  'Alcance de la caja abierta según el modo de la organización al abrir: b:<sucursal|g> (una por sucursal) o u:<sucursal|g>:<cajero> (una por cajero y sucursal). Lo calcula fn_cash_session_open_scope_key; lo usa ux_cash_sessions_abierta_por_alcance.';

create or replace function public.fn_cash_session_open_scope_key()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modo text;
begin
  if new.status is distinct from 'open' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'open' and new.open_scope_key is not null
     and new.branch_id is not distinct from old.branch_id
     and new.opened_by is not distinct from old.opened_by then
    return new;
  end if;

  v_modo := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = new.organization_id and os.key = 'pos_cash_session_mode'),
    'branch');

  if v_modo = 'user' then
    new.open_scope_key := 'u:' || coalesce(new.branch_id::text, 'g') || ':' || new.opened_by::text;
  else
    new.open_scope_key := 'b:' || coalesce(new.branch_id::text, 'g');
    if exists (
      select 1 from public.cash_sessions cs
       where cs.organization_id = new.organization_id
         and cs.status = 'open'
         and cs.branch_id is not distinct from new.branch_id
         and cs.id is distinct from new.id
    ) then
      raise exception 'caja_ya_abierta' using errcode = '23505',
        detail = 'Ya hay una caja abierta en esta sucursal (modo una caja por sucursal).';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_cash_session_open_scope_key() from public, anon, authenticated;

drop trigger if exists trg_cash_session_open_scope_key on public.cash_sessions;
create trigger trg_cash_session_open_scope_key
  before insert or update of status, branch_id, opened_by on public.cash_sessions
  for each row execute function public.fn_cash_session_open_scope_key();

-- Relleno de las cajas abiertas hoy (las cerradas no participan del índice).
update public.cash_sessions cs
   set open_scope_key = case
         when coalesce((select os.settings->>'mode' from public.organization_settings os
                         where os.organization_id = cs.organization_id and os.key = 'pos_cash_session_mode'), 'branch') = 'user'
           then 'u:' || coalesce(cs.branch_id::text, 'g') || ':' || cs.opened_by::text
         else 'b:' || coalesce(cs.branch_id::text, 'g')
       end
 where cs.status = 'open' and cs.open_scope_key is null;

create unique index if not exists ux_cash_sessions_abierta_por_alcance
  on public.cash_sessions (organization_id, open_scope_key)
  where status = 'open';
