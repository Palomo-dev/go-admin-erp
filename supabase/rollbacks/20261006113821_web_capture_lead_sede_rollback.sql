-- Rollback de 20261007100500_web_capture_lead_sede.
-- Quita solo la sobrecarga con sede; la firma de 8 argumentos no se tocó.
-- Las capturas ya guardadas en customers.metadata.lead.capturas se conservan.
-- Antes: el sitio debe dejar de llamar con p_branch_id/p_details (o confiar en su
-- reintento PGRST202 → firma de 8, que ya hace).

drop function if exists public.web_capture_lead(integer, text, text, text, integer, jsonb, text, text, text, text);
