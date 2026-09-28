-- Pantalla del cliente POS, Fase 3 parte A (ronda 2): canal Realtime privado
-- por terminal, índice del token y latido sin bumpear updated_at.
-- Plan: docs/pos-doble-pantalla/PLAN.md §7 y §11; decisiones en
-- docs/pos-doble-pantalla/F3-A-decisiones-realtime.md.
--
-- 1. Políticas sobre realtime.messages (Realtime Authorization). Solo aplican a
--    canales suscritos con `config: { private: true }`; los canales públicos
--    que ya usa la app (actividad) no cambian. Aditiva: hasta hoy la tabla
--    tenía RLS activa y CERO políticas, es decir, ningún canal privado era
--    accesible.
--    - Pantalla: el JWT que emite /api/pos/display/bootstrap lleva el claim
--      `pos_terminal_id`; solo puede recibir y emitir en `pos-display:<ese id>`.
--      No toca tablas, así que vale para `anon` (rol del JWT) sin GRANT alguno.
--    - Caja: sesión de usuario (`authenticated`); puede recibir y emitir en
--      `pos-display:<id>` si VE esa terminal, y verla ya lo decide la RLS de
--      pos_terminals (miembro activo de la organización). El id se extrae del
--      topic con una expresión regular estricta (UUID) para que el cast nunca
--      falle con un topic malformado.
--    Solo `extension = 'broadcast'`: ni presence ni postgres_changes.
-- 2. Índice parcial por display_token_hash: /bootstrap y /heartbeat buscan por él.
-- 3. El trigger de updated_at ignora el latido (display_last_seen_at cada 60 s):
--    «última edición» de la terminal sigue significando eso. Limitación:
--    un UPDATE que cambie a la vez el latido y otra columna no bumpea
--    updated_at; hoy el único escritor del latido es /heartbeat y solo escribe
--    esa columna.
-- Verificado en begin/rollback antes de aplicar (expresiones de las políticas
-- con set_config de realtime.topic y request.jwt.claims como anon y como
-- authenticated; trigger con una terminal de prueba).

drop policy if exists pos_display_pantalla_recibe on realtime.messages;
create policy pos_display_pantalla_recibe on realtime.messages
  for select to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'pos-display:' || ((select auth.jwt()) ->> 'pos_terminal_id')
  );

drop policy if exists pos_display_pantalla_envia on realtime.messages;
create policy pos_display_pantalla_envia on realtime.messages
  for insert to anon, authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'pos-display:' || ((select auth.jwt()) ->> 'pos_terminal_id')
  );

drop policy if exists pos_display_caja_recibe on realtime.messages;
create policy pos_display_caja_recibe on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')::uuid
    )
  );

drop policy if exists pos_display_caja_envia on realtime.messages;
create policy pos_display_caja_envia on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')::uuid
    )
  );

create index if not exists pos_terminal_secrets_display_token_hash_idx
  on public.pos_terminal_secrets (display_token_hash)
  where display_token_hash is not null;

drop trigger if exists pos_terminals_set_updated_at on public.pos_terminals;
create trigger pos_terminals_set_updated_at
  before update on public.pos_terminals
  for each row
  when (old.display_last_seen_at is not distinct from new.display_last_seen_at)
  execute function public.update_updated_at_column();

comment on trigger pos_terminals_set_updated_at on public.pos_terminals is
  'updated_at = now() en cada UPDATE salvo el latido de la pantalla remota (display_last_seen_at), que no cuenta como edición.';
