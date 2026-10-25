-- Rollback de 134060. Correr ANTES de los rollbacks de 134020 y 134010.
-- 1) Padres vuelven a movimiento (se desactiva trg_puc_validar_cuenta: si no, al tener hijos los fuerza a título).
alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
update public.chart_of_accounts c set es_movimiento = true, updated_at = now()
  from public.p1_puc_bitacora b
 where b.migracion = '134060' and b.objeto = 'titulo'
   and c.organization_id = b.organization_id and c.account_code = b.clave;
alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;

-- 2) Borradores vuelven al padre.
update public.journal_lines l set account_code = b.valor_anterior, updated_at = now()
  from public.p1_puc_bitacora b
 where b.migracion = '134060' and b.objeto in ('linea_borrador', 'linea_borrador_revision_iva') and l.id = b.clave::integer;

-- 3) Asientos de reclasificación: contra-asiento (no se borra contabilidad publicada).
select x.asiento, public.fn_revertir_asiento(x.asiento, 'p1_rollback_130700', 'rollback reclasificación a auxiliar')
  from (select distinct b.organization_id, b.clave::integer as asiento from public.p1_puc_bitacora b
         where b.migracion = '134060' and b.objeto = 'asiento_reclasif') x
 where not exists (select 1 from public.journal_entries r
                    where r.organization_id = x.organization_id and r.fact_key = 'reversal:' || x.asiento);

delete from public.p1_puc_bitacora where migracion = '134060' and objeto not in ('asiento_reclasif', 'revision_iva');
