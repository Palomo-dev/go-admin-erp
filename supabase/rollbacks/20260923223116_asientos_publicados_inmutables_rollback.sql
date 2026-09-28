-- Rollback de 20260923223116_asientos_publicados_inmutables.sql
--
-- Devuelve a authenticated la escritura directa de asientos (la política ALL
-- por pertenencia) y retira la inmutabilidad y las funciones del asiento
-- manual. Los contra-asientos manuales ya publicados se conservan: son hechos
-- contables. Las columnas motivo/created_by de journal_reversals se conservan
-- (aditivas, con datos).

drop trigger if exists trg_journal_entries_inmutable on public.journal_entries;
drop trigger if exists trg_journal_lines_inmutable on public.journal_lines;
drop function if exists public.fn_asiento_publicado_inmutable();

create policy journal_entries_insert_update_delete_policy on public.journal_entries
  for all to authenticated
  using (organization_id in (select organization_members.organization_id from organization_members
                              where organization_members.user_id = auth.uid()));
create policy journal_lines_insert_update_delete_policy on public.journal_lines
  for all to authenticated
  using (exists (select 1 from journal_entries je join organization_members om on je.organization_id = om.organization_id
                  where je.id = journal_lines.journal_entry_id and om.user_id = auth.uid()));
grant insert, update, delete on public.journal_entries, public.journal_lines to authenticated;

drop function if exists public.fn_revertir_asiento_manual(integer, text);
drop function if exists public.fn_asiento_manual_descartar(integer);
drop function if exists public.fn_asiento_manual_publicar(integer);
drop function if exists public.fn_asiento_manual_crear(integer, integer, timestamptz, text, jsonb, boolean, text, numeric, text);
drop function if exists public.fn_revertir_asiento_en_fecha(integer, text, text, timestamptz, uuid);

drop trigger if exists trg_job_positions_permisos_por_defecto on public.job_positions;
drop function if exists public.fn_job_positions_permisos_por_defecto();
drop function if exists public.fn_conceder_permisos_contador(uuid);
drop function if exists public.fn_tiene_permiso(integer, text);

delete from public.job_position_permissions
 where permission_id = (select id from public.permissions where code = 'accounting.reverse');
delete from public.role_permissions
 where permission_id = (select id from public.permissions where code = 'accounting.reverse');
delete from public.permissions where code = 'accounting.reverse';
-- finance.create concedido al cargo CONTADOR se conserva: revisar a mano si se quiere retirar.

-- fn_is_period_open vuelve a mirar solo el periodo mensual.
create or replace function public.fn_is_period_open(p_organization_id integer, p_date date)
returns boolean
language plpgsql
security definer
as $$
declare
    v_status text;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);
    select status into v_status
    from fiscal_periods
    where organization_id = p_organization_id
      and p_date between start_date and end_date
      and period_type = 'monthly'
    limit 1;
    if v_status is null then
        return true;
    end if;
    return v_status = 'open';
end;
$$;

-- assistant_void_purchase_invoice vuelve a SECURITY INVOKER (con la política
-- de escritura restaurada arriba vuelve a poder escribir asientos).
alter function public.assistant_void_purchase_invoice(integer, uuid, uuid) security invoker;
