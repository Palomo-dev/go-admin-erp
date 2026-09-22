-- Pantalla del cliente POS, Fase 3 parte A (ronda 3, qa bajo 6): la política
-- del canal Realtime de la CAJA exige que la terminal esté activa y acepta el
-- UUID del topic en mayúsculas o minúsculas.
-- Plan: docs/pos-doble-pantalla/PLAN.md §7 y §11; decisiones en
-- docs/pos-doble-pantalla/F3-A-decisiones-realtime.md («Ronda 3»).
--
-- Cambios sobre 20260922130000_pos_display_realtime_privado.sql, solo en
-- pos_display_caja_recibe / pos_display_caja_envia (las de la pantalla no
-- cambian: su claim `pos_terminal_id` lo emite el servidor ya en minúsculas):
-- 1. `and t.is_active`: una terminal desactivada dejaba abierto su canal a los
--    miembros de la organización (la RLS de pos_terminals no filtra por
--    is_active). Ahora, desactivar la terminal cierra el canal para la caja
--    en la siguiente suscripción/renovación, igual que /bootstrap y /heartbeat
--    ya rechazan a la pantalla (displayAuth exige is_active).
-- 2. La expresión regular acepta [0-9a-fA-F]: `isTerminalId` (cliente) acepta
--    UUID en mayúsculas y el cast ::uuid también; antes un topic en mayúsculas
--    no casaba y la caja quedaba fuera sin señal. Verificado: basura, sufijo o
--    vacío → substring NULL → cast NULL → EXISTS false (nunca 22P02).
-- Nota sobre `sub`: el JWT de la pantalla lleva `sub = 'pos-display:<uuid>'`,
-- que NO es uuid a propósito: `auth.uid()` no puede tomarlo por un usuario.
-- Una política que llame auth.uid() con ese JWT falla con 22P02 en vez de
-- evaluar a true; inocuo, y documentado en F3-A.
-- Aditiva: solo recrea dos políticas; sin datos que migrar.

drop policy if exists pos_display_caja_recibe on realtime.messages;
create policy pos_display_caja_recibe on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.is_active
        and t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
    )
  );

drop policy if exists pos_display_caja_envia on realtime.messages;
create policy pos_display_caja_envia on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.is_active
        and t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
    )
  );
