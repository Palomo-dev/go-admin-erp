-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_25_campaign_contacts_state_check`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 f35a87f63e1875f50cba170217275f3c). No reformatear.
-- P16 (F16): ampliar campaign_contacts.state con los estados que el código ya
-- maneja. Verificado en el código antes de decidir:
--   src/lib/services/crm/whatsapp/types.ts:255
--     type ContactState = 'pending'|'queued'|'sent'|'delivered'|'read'|'opened'
--                        |'clicked'|'replied'|'bounced'|'failed'|'skipped'
--   types.ts:317 contactState() lee metadata.state y usa la columna como respaldo.
--   campaignEvents.ts:60,68 escribe hoy solo 'sent' o NULL en la columna porque
--   el CHECK no admitía el resto.
-- NO se añade 'sending': no pertenece a ContactState, es un valor de
-- campaigns.status (campaigns_status_check: draft|scheduled|sending|sent).
-- Se conservan los 5 valores actuales. Datos actuales: 10 'sent' + 16 NULL,
-- así que ninguna fila viola el CHECK nuevo (NULL sigue permitido).

ALTER TABLE public.campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_state_check;
ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_state_check
  CHECK (state = ANY (ARRAY[
    'pending'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'read'::text,
    'opened'::text, 'clicked'::text, 'replied'::text, 'bounced'::text,
    'failed'::text, 'skipped'::text
  ]));
