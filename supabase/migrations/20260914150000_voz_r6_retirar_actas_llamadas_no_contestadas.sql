-- Zona de voz · F3 ronda 6 / F5 ronda 4 — corrección de datos (NO aplicada).
--
-- Contexto: hasta la ronda 4, `twiml/outbound` escribía el acta de grabación
-- AL MARCAR, con `announced_at` = momento de marcar. Cuatro llamadas salientes
-- por navegador de la org 125 que NUNCA fueron contestadas (3 siguen en
-- `dialing`, 1 en `no_answer`; `consent_given=false`, `answered_at IS NULL`,
-- sin fila en `call_recordings`) quedaron con un acta que certifica un aviso
-- que jamás sonó. Un acta así no vale como evidencia (Ley 1581) y contradice
-- el invariante «nunca acta sin grabación».
--
-- Validado en solo lectura por el tester de la ronda 5 y preparado aquí por
-- decisión del dueño. Se aplica SOLO con `apply_migration` del MCP cuando el
-- dueño lo autorice. Reversión: el rollback reinserta las 4 filas exportadas.
--
-- Cinturones:
--   · `cc.organization_id = c.organization_id` (nunca cruzar organizaciones),
--   · ids explícitos de las 4 actas (no se borra "todo lo que cumpla"),
--   · condiciones de negocio repetidas (no contestada, sin grabación).
-- La quinta acta (`e0dbe139…`, llamada `1e0e5989…` contestada, 4 s, sin
-- grabación) NO entra aquí: va aparte, la cubre la reconciliación diaria.

begin;

-- Verificación previa: deben ser exactamente 4.
do $$
declare n int;
begin
  select count(*) into n
  from public.call_consents cc
  join public.calls c on c.id = cc.call_id and c.organization_id = cc.organization_id
  where cc.id in (
    '09021571-ff8d-432a-b218-684a8ecec316',
    'ca87dc50-f0a7-4ad6-9ca1-9badb1543cb5',
    '59ce0fd0-44ce-4052-9f95-4e73e96d60a0',
    '066c64b7-c1e6-4838-820a-25a1391e8964'
  )
    and cc.organization_id = 125
    and cc.consent_type = 'recording'
    and c.consent_given = false
    and c.answered_at is null
    and not exists (select 1 from public.call_recordings r where r.call_id = c.id);
  if n <> 4 then
    raise exception 'voz_r6: se esperaban 4 actas candidatas y hay %', n;
  end if;
end $$;

delete from public.call_consents cc
using public.calls c
where c.id = cc.call_id
  and cc.organization_id = c.organization_id
  and cc.organization_id = 125
  and cc.id in (
    '09021571-ff8d-432a-b218-684a8ecec316',
    'ca87dc50-f0a7-4ad6-9ca1-9badb1543cb5',
    '59ce0fd0-44ce-4052-9f95-4e73e96d60a0',
    '066c64b7-c1e6-4838-820a-25a1391e8964'
  )
  and cc.consent_type = 'recording'
  and c.consent_given = false
  and c.answered_at is null
  and not exists (select 1 from public.call_recordings r where r.call_id = c.id);

-- Verificación posterior: 0 de las 4; la quinta (e0dbe139…) sigue.
do $$
declare n int; q int;
begin
  select count(*) into n from public.call_consents where id in (
    '09021571-ff8d-432a-b218-684a8ecec316',
    'ca87dc50-f0a7-4ad6-9ca1-9badb1543cb5',
    '59ce0fd0-44ce-4052-9f95-4e73e96d60a0',
    '066c64b7-c1e6-4838-820a-25a1391e8964'
  );
  select count(*) into q from public.call_consents where id = 'e0dbe139-7aaf-4482-9244-7ad33ee12900';
  if n <> 0 or q <> 1 then
    raise exception 'voz_r6: verificación posterior fallida (quedan % de 4; quinta acta % de 1)', n, q;
  end if;
end $$;

commit;
