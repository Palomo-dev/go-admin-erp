-- Reversión de 20260914150000_voz_r6_retirar_actas_llamadas_no_contestadas.
-- Reinserta las 4 actas tal como estaban (exportadas por MCP el 2026-09-14,
-- solo lectura, antes de preparar la migración). Idempotente por PK.
begin;

insert into public.call_consents (id, organization_id, call_id, consent_type, announced_at, method, locale, recorded_announcement_text)
values
  ('09021571-ff8d-432a-b218-684a8ecec316', 125, 'fed4839e-32eb-4041-8369-05cc78c117ae', 'recording', '2026-09-12 01:21:27.016383+00', 'voice_announcement', 'es-MX', 'Esta llamada será grabada y monitoreada para fines de calidad y servicio.'),
  ('ca87dc50-f0a7-4ad6-9ca1-9badb1543cb5', 125, 'ca383c64-b431-4082-a7a8-3e68546c8630', 'recording', '2026-09-12 01:27:44.80965+00',  'voice_announcement', 'es-MX', 'Esta llamada será grabada y monitoreada para fines de calidad y servicio.'),
  ('59ce0fd0-44ce-4052-9f95-4e73e96d60a0', 125, '8df65283-0d65-435c-87c0-b9f707bf24b8', 'recording', '2026-09-13 03:10:00.324888+00', 'voice_announcement', 'es-MX', 'Esta llamada será grabada y monitoreada para fines de calidad y servicio.'),
  ('066c64b7-c1e6-4838-820a-25a1391e8964', 125, '894c0cf8-9607-4cf9-ab36-e769fa1a9edf', 'recording', '2026-09-13 17:42:59.14522+00',  'voice_announcement', 'es-MX', 'Esta llamada será grabada y monitoreada para fines de calidad y servicio.')
on conflict (id) do nothing;

commit;
