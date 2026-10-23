-- Revierte 20261023080217_centros_costo_defecto.
-- Restaura requiere_centro_costo desde centro_costo_modo_respaldo y
-- puc_centro_costo_respaldo, y quita las columnas agregadas en esa migración.
-- Las cuentas creadas después del respaldo conservan el booleano que ya
-- tenía sincronizado el disparador; no están en la tabla de respaldo.
-- Los centros sembrados que no se pudieron borrar (tenían movimientos o un
-- hijo creado a mano) siguen como filas, ya sin template_key ni is_default.
-- Este archivo no restaura cuerpos de funciones.
-- Orden: primero los rollbacks más nuevos (reportes, reparto, distribución,
-- parches, herencia, disparadores y siembra). El de la siembra tiene que ir
-- antes que este, para que el disparador de sincronización no reescriba el
-- booleano al restaurarlo.

do $orden$
begin
  if to_regprocedure('public.fn_journal_linea_heredar_centro()') is not null then
    raise exception 'Revierte primero las migraciones posteriores, de la más nueva a la más vieja';
  end if;
  if to_regprocedure('public.fn_sync_centro_costo_modo()') is not null then
    raise exception 'Revierte primero 20261023084931_centros_costo_siembra';
  end if;
end
$orden$;

drop trigger if exists trg_sync_centro_costo_modo on public.chart_of_accounts;
drop trigger if exists trg_sync_centro_costo_modo on public.puc_plantilla;

do $datos$
begin
  if to_regclass('public.centro_costo_modo_respaldo') is not null then
    update public.chart_of_accounts a
       set requiere_centro_costo = r.requiere_centro_costo
      from public.centro_costo_modo_respaldo r
     where a.organization_id = r.organization_id
       and a.account_code = r.account_code
       and a.requiere_centro_costo is distinct from r.requiere_centro_costo;
  end if;
  if to_regclass('public.puc_centro_costo_respaldo') is not null then
    update public.puc_plantilla p
       set requiere_centro_costo = r.requiere_centro_costo
      from public.puc_centro_costo_respaldo r
     where p.codigo = r.codigo
       and p.requiere_centro_costo is distinct from r.requiere_centro_costo;
  end if;
end
$datos$;

alter table public.chart_of_accounts drop constraint if exists chart_of_accounts_centro_costo_modo_check;
alter table public.puc_plantilla drop constraint if exists puc_plantilla_centro_costo_modo_check;
alter table public.chart_of_accounts drop column if exists centro_costo_modo;
alter table public.puc_plantilla drop column if exists centro_costo_modo;

alter table public.invoice_purchase drop constraint if exists invoice_purchase_cost_center_id_fkey;
alter table public.invoice_purchase drop constraint if exists invoice_purchase_distribucion_id_fkey;
alter table public.invoice_items drop constraint if exists invoice_items_cost_center_id_fkey;
alter table public.employments drop constraint if exists employments_cost_center_id_fkey;
alter table public.cash_movements drop constraint if exists cash_movements_distribucion_id_fkey;
alter table public.bank_transactions drop constraint if exists bank_transactions_distribucion_id_fkey;

alter table public.invoice_purchase drop column if exists cost_center_id;
alter table public.invoice_purchase drop column if exists distribucion_id;
alter table public.invoice_items drop column if exists cost_center_id;
alter table public.employments drop column if exists cost_center_id;
alter table public.cash_movements drop column if exists distribucion_id;
alter table public.bank_transactions drop column if exists distribucion_id;

alter table public.branches drop constraint if exists branches_default_cost_center_id_fkey;
alter table public.branches drop column if exists default_cost_center_id;

drop index if exists public.uq_cost_centers_un_defecto;
drop index if exists public.idx_cost_centers_branch;
alter table public.cost_centers drop constraint if exists cost_centers_branch_id_fkey;
alter table public.cost_centers drop column if exists branch_id;
alter table public.cost_centers drop column if exists level;
alter table public.cost_centers drop column if exists type;
alter table public.cost_centers drop column if exists template_key;
alter table public.cost_centers drop column if exists is_default;

drop table if exists public.centro_costo_modo_respaldo;
drop table if exists public.puc_centro_costo_respaldo;
