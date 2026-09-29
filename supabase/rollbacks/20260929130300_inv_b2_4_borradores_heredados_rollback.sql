-- Reversión de 20260929130300_inv_b2_4_borradores_heredados.sql
-- Vacía la estimación de los borradores que siguen en borrador y nacieron antes
-- de B2 (sin apply_key ni cambios posteriores). Solo datos derivados: no mueve
-- stock ni toca ajustes aplicados. Si ya se revirtió 1/3, no hay nada que hacer.

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'adjustment_items' and column_name = 'difference') then
    update public.adjustment_items ai
       set system_qty = null, difference = null, applied_cost = null
      from public.inventory_adjustments ia
     where ia.id = ai.inventory_adjustment_id
       and ia.status = 'draft'
       and ia.created_at < timestamptz '2026-09-29 13:00:00-05';
  end if;
end $$;
