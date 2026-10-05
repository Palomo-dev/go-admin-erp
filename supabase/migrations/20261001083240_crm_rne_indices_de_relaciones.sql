-- Índices de las relaciones existentes de la constancia RNE de voz.
-- Tabla verificada: una constancia, 49.152 bytes; creación acotada sin backfill.
create index if not exists idx_voice_rne_campaign_fk on public.voice_campaign_rne_checks(campaign_id);
create index if not exists idx_voice_rne_actor_fk on public.voice_campaign_rne_checks(checked_by);
