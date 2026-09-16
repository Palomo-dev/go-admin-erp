-- F0-SEC r2 (sub-parte D) — límite de tasa persistente y atómico.
--
-- ESTADO: PENDIENTE DE APLICAR (no se ejecutó por el MCP en la ronda que la
-- escribió). Orden de despliegue: aplicar esta migración → poner
-- RATE_LIMIT_STORE=db en Vercel → desplegar. Sin la migración, el código sigue
-- en modo memoria (por instancia) y lo avisa una vez por proceso.
--
-- Qué resuelve: `twilio/verify/{send,check}` e `invite/resend` limitaban solo en
-- memoria por instancia (Vercel: límite efectivo = limit × instancias). Ahora
-- `src/lib/security/rateLimit.ts` puede delegar en `fn_rate_limit_hit`, que
-- evalúa TODAS las claves de una petición (ip, usuario, destino) en una sola
-- transacción y registra el hit únicamente si todas caben. Si la RPC falla, el
-- código BLOQUEA (fail-closed).
--
-- Seguridad: la tabla no la lee nadie salvo la RPC; RLS activado sin políticas;
-- EXECUTE solo para service_role (REVOKE de public/anon/authenticated en la
-- misma migración, política de docs/POLITICA-MIGRACIONES.md). Sin credenciales.
-- Las claves son técnicas (`verify:send:ip:1.2.3.4`, `invite:resend:email:…`):
-- contienen IP y correo del solicitante, por eso la tabla queda cerrada y las
-- filas caducan solas (barrido oportunista + fn_rate_limit_sweep).

create table if not exists public.rate_limit_buckets (
  key          text primary key,
  window_start timestamptz not null default now(),
  window_ms    integer not null,
  count        integer not null default 0,
  updated_at   timestamptz not null default now()
);

comment on table public.rate_limit_buckets is
  'Cubos de ventana fija del rate limit (F0-SEC r2). Solo la RPC fn_rate_limit_hit escribe/lee; filas caducas se barren.';

alter table public.rate_limit_buckets enable row level security;
-- Sin políticas a propósito: ningún rol de PostgREST puede tocarla directamente.
revoke all on table public.rate_limit_buckets from public, anon, authenticated;

create index if not exists rate_limit_buckets_updated_at_idx
  on public.rate_limit_buckets (updated_at);

-- Barrido: borra cubos cuya ventana terminó hace más de 1 día.
create or replace function public.fn_rate_limit_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_buckets
   where updated_at < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Evalúa y (si todas caben) registra el hit de varias claves de forma atómica.
-- p_entries: [{ "key": text, "limit": int, "window_ms": int }, ...]
-- Devuelve: { "allowed": bool, "entries": [{ "key", "count", "reset_at", "allowed" }] }
--   count  = hits en la ventana INCLUIDO el actual (registrado si allowed, proyectado si no)
create or replace function public.fn_rate_limit_hit(p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := clock_timestamp();
  v_entry      jsonb;
  v_key        text;
  v_limit      integer;
  v_window_ms  integer;
  v_row        public.rate_limit_buckets%rowtype;
  v_count      integer;
  v_start      timestamptz;
  v_blocked    boolean := false;
  v_results    jsonb := '[]'::jsonb;
  v_keys       text[] := '{}';
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'fn_rate_limit_hit: p_entries debe ser un array no vacío' using errcode = '22023';
  end if;

  -- Fase 1: bloquear las filas (orden estable por clave para evitar interbloqueos) y proyectar.
  for v_entry in
    select e from jsonb_array_elements(p_entries) as e order by e->>'key'
  loop
    v_key       := v_entry->>'key';
    v_limit     := (v_entry->>'limit')::integer;
    v_window_ms := (v_entry->>'window_ms')::integer;

    if v_key is null or v_key = '' or v_limit is null or v_limit <= 0 or v_window_ms is null or v_window_ms <= 0 then
      -- Configuración inválida = bloqueado (fail-closed), igual que en rateLimit.ts.
      v_blocked := true;
      v_results := v_results || jsonb_build_object('key', coalesce(v_key, ''), 'count', coalesce(v_limit, 0), 'reset_at', v_now, 'allowed', false);
      continue;
    end if;

    insert into public.rate_limit_buckets (key, window_start, window_ms, count, updated_at)
    values (v_key, v_now, v_window_ms, 0, v_now)
    on conflict (key) do nothing;

    select * into v_row from public.rate_limit_buckets where key = v_key for update;

    if v_now - v_row.window_start >= make_interval(secs => v_window_ms / 1000.0) then
      -- Ventana vencida: empieza otra.
      v_start := v_now;
      v_count := 0;
      update public.rate_limit_buckets
         set window_start = v_now, window_ms = v_window_ms, count = 0, updated_at = v_now
       where key = v_key;
    else
      v_start := v_row.window_start;
      v_count := v_row.count;
    end if;

    if v_count + 1 > v_limit then
      v_blocked := true;
    end if;

    v_keys    := v_keys || v_key;
    v_results := v_results || jsonb_build_object(
      'key', v_key,
      'count', v_count + 1,
      'reset_at', v_start + make_interval(secs => v_window_ms / 1000.0),
      'allowed', (v_count + 1 <= v_limit)
    );
  end loop;

  -- Fase 2: registrar solo si TODAS caben.
  if not v_blocked then
    update public.rate_limit_buckets
       set count = count + 1, updated_at = v_now
     where key = any (v_keys);
  end if;

  -- Barrido oportunista (~1 % de las llamadas) para que la tabla no crezca.
  if random() < 0.01 then
    perform public.fn_rate_limit_sweep();
  end if;

  return jsonb_build_object('allowed', not v_blocked, 'entries', v_results);
end;
$$;

comment on function public.fn_rate_limit_hit(jsonb) is
  'F0-SEC r2: rate limit atómico multi-clave. Registra el hit solo si todas las claves caben. Solo service_role.';

revoke all on function public.fn_rate_limit_hit(jsonb) from public, anon, authenticated;
grant execute on function public.fn_rate_limit_hit(jsonb) to service_role;
revoke all on function public.fn_rate_limit_sweep() from public, anon, authenticated;
grant execute on function public.fn_rate_limit_sweep() to service_role;

-- Verificación (§3.3), solo SELECT:
--   select has_function_privilege('anon', 'public.fn_rate_limit_hit(jsonb)', 'EXECUTE');            -- false
--   select has_function_privilege('authenticated', 'public.fn_rate_limit_hit(jsonb)', 'EXECUTE');   -- false
--   select has_function_privilege('service_role', 'public.fn_rate_limit_hit(jsonb)', 'EXECUTE');    -- true
--   select relrowsecurity from pg_class where relname = 'rate_limit_buckets';                        -- true
--   select count(*) from pg_policies where tablename = 'rate_limit_buckets';                          -- 0
-- Prueba funcional (dentro de begin; … rollback;):
--   select public.fn_rate_limit_hit('[{"key":"t:a","limit":2,"window_ms":60000},{"key":"t:b","limit":1,"window_ms":60000}]');
--   -- 1ª: allowed true (a=1, b=1); 2ª: allowed false (b=2 > 1) y a NO sube a 2.
