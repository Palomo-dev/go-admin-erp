-- Reversión histórica: se restauran los devengos que quedaron sin reemplazo.
--
-- La corrida `cierre-contable-2026-09-23` neutralizó 37 devengos F-45/CC-001
-- para los que no pudo generar el devengo corregido, porque el documento no da
-- un importe:
--   · 26 de facturas que ya no existen (org 2: 1, org 132: 24, org 144: 1):
--     huérfanos, del mismo tipo que los 36 de `sales` que el procedimiento
--     excluye;
--   · 11 de la org 130 cuya factura existe con total 0,00: el viejo defecto de
--     factura sin líneas; el asiento era el único registro del ingreso.
-- Dejarlos neutralizados borraría en saldos un ingreso que sí ocurrió. Se
-- restauran con un contra-asiento del contra-asiento (fn_revertir_asiento) y
-- pasan a auditoría manual. Nada se borra.
--
-- ADR: docs/decisiones/ADR-CC-007-reversion-historica.md (§ restauración)

alter table public.journal_reversals
  add column if not exists restored_entry_id integer,
  add column if not exists restore_reason text;

comment on column public.journal_reversals.restored_entry_id is
  'Contra-asiento del contra-asiento: el original vuelve a quedar vivo en saldos. Ver restore_reason.';

do $$
declare
  r record;
  v_id integer;
begin
  for r in
    select jr.id, jr.organization_id, jr.categoria, jr.reversal_entry_id, jr.original_entry_id,
           case when i.id is null then 'factura inexistente (huérfano)' else 'factura con total 0: documento roto' end as motivo
    from journal_reversals jr
    join journal_entries je on je.id = jr.original_entry_id
    left join invoice_sales i on je.source = 'invoice_sales' and i.id::text = je.source_id
    where jr.lote = 'cierre-contable-2026-09-23'
      and jr.categoria in ('F-45', 'CC-001')
      and jr.repost_entry_id is null
      and jr.restored_entry_id is null
    order by jr.id
  loop
    v_id := fn_revertir_asiento(r.reversal_entry_id, r.categoria, 'restauracion-2026-09-23');
    update journal_reversals set restored_entry_id = v_id, restore_reason = r.motivo where id = r.id;
  end loop;
end $$;
