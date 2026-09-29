-- Rastro de los lotes exportados a banca online desde cuentas por pagar.
--
-- `CuentasPorPagarService.exportarParaBancaOnline` insertaba en `public.bank_files`
-- desde el 1er dia, pero la tabla NUNCA existio (`to_regclass` = NULL, verificado
-- por MCP el 2026-09-24). El insert fallaba siempre, el metodo lanzaba, y el modal
-- lo llamaba ANTES de generar el blob: el usuario no descargaba nada y solo veia
-- «Error al exportar». No hay tabla equivalente: `bank_accounts`,
-- `bank_transactions`, `bank_transfers`, `bank_reconciliations` y
-- `bank_reconciliation_items` son otra cosa (conciliacion de extractos, no lotes
-- de pago exportados).
--
-- Columnas: exactamente las que el codigo ya escribia (`BankFileRecord` en
-- `src/components/finanzas/cuentas-por-pagar/types.ts`), ni una mas.
--
-- SIN `branch_id` a proposito. El lote agrupa cuentas por pagar de CUALQUIER
-- sucursal (el modal las carga sin filtro de sucursal, y su propio comentario ya
-- lo dice), asi que no hay una sucursal dueña del lote. Ademas, las tablas con
-- `branch_id` de este esquema llevan una politica RESTRICTIVE
-- `app_branch_access(branch_id)`: inventar una sucursal para el lote escondería
-- parte del rastro a quien no tenga acceso a esa sucursal, que es justo lo
-- contrario de lo que sirve una auditoria.
--
-- Escritura desde el NAVEGADOR con la sesion del usuario (el servicio usa
-- `@/lib/supabase/config`), asi que la unica barrera real es RLS: pertenencia
-- activa a la organizacion, y `created_by` obligado a ser quien firma la sesion.
-- Sin politica de DELETE: un rastro de auditoria no se borra desde la interfaz.

create table if not exists public.bank_files (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_type text not null check (file_type in ('csv', 'excel', 'txt', 'xml')),
  records_count integer not null default 0 check (records_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  upload_date timestamptz not null default now(),
  processed_date timestamptz,
  -- Igual que `payments.created_by`: FK a auth.users SIN accion en borrado, para
  -- que el rastro sobreviva a la baja de la persona que lo genero.
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.bank_files is
  'Lotes de cuentas por pagar exportados a banca online: que archivo se genero, cuantos registros llevaba y quien lo genero. Es rastro de auditoria, no una cola de proceso.';
comment on column public.bank_files.file_type is
  'Tipo del archivo realmente descargado. Refleja la union de TypeScript BankFileRecord.file_type.';
comment on column public.bank_files.records_count is
  'Cuentas por pagar incluidas en el lote.';
comment on column public.bank_files.processed_count is
  'Cuentas del lote ya conciliadas contra el banco. Hoy siempre 0: la conciliacion real todavia no existe (ver docs/hallazgos/F-69.md).';
comment on column public.bank_files.upload_date is
  'Instante en que se genero el lote. El DIA que va dentro de file_name sale de la zona horaria de la organizacion, no de UTC.';

create index if not exists bank_files_org_upload_idx
  on public.bank_files (organization_id, upload_date desc);

alter table public.bank_files enable row level security;

drop policy if exists bank_files_select_por_pertenencia on public.bank_files;
create policy bank_files_select_por_pertenencia on public.bank_files
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active is true
    )
  );

drop policy if exists bank_files_insert_por_pertenencia on public.bank_files;
create policy bank_files_insert_por_pertenencia on public.bank_files
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active is true
    )
  );

drop policy if exists bank_files_update_por_pertenencia on public.bank_files;
create policy bank_files_update_por_pertenencia on public.bank_files
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active is true
    )
  )
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active is true
    )
  );

-- Los privilegios por defecto de Supabase conceden ALL sobre cada tabla nueva a
-- `anon`, `authenticated` y `service_role` en el momento del CREATE TABLE. Un
-- `grant` posterior no quita nada, asi que hay que REVOCAR primero y volver a
-- conceder lo justo. Importa mas de lo que parece: TRUNCATE **no pasa por RLS**,
-- de modo que dejar el ALL de serie a `authenticated` permitiria a cualquier
-- sesion vaciar el rastro de todos los inquilinos de una sola sentencia.
revoke all on public.bank_files from anon;
revoke all on public.bank_files from authenticated;
revoke all on public.bank_files from public;
grant select, insert, update on public.bank_files to authenticated;
grant all on public.bank_files to service_role;
