-- Índices de las FK privadas sin alterar eventos ni saldos.
set lock_timeout='2s';
create index if not exists crm_provider_receipt_channel_fk on public.crm_provider_message_receipts(channel_id,organization_id);
create index if not exists crm_provider_receipt_message_fk on public.crm_provider_message_receipts(message_id,organization_id) where message_id is not null;
