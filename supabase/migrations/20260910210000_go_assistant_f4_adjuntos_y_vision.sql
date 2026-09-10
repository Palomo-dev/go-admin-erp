-- GO Assistant — Fase 4 (visión): bucket privado `ai-attachments` + `ai_attachments`.
--
-- Contexto (§4.4 y §8.4 del plan): de los 14 buckets de este proyecto, 12 son
-- PÚBLICOS — `invoices` y `attachments` incluidos. Una foto de factura lleva
-- NIT, razón social, valores y a veces datos de personas: no puede vivir detrás
-- de una URL pública adivinable. Se crea un bucket privado propio y se sirve
-- siempre por URL firmada corta.
--
-- El criterio de RLS de la tabla es DELIBERADAMENTE el mismo que el de
-- `ai_agent_actions` (autor + administrador de la organización): el autor
-- porque es suyo, el administrador porque §9.5 le exige poder auditar qué le
-- pidió alguien a la IA y con qué documento.
--
-- Aplicada por MCP el 2026-09-10. Reversión:
--   supabase/rollbacks/20260910210000_go_assistant_f4_adjuntos_y_vision_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Bucket privado
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-attachments',
  'ai-attachments',
  false,
  20971520, -- 20 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS del bucket: solo miembros activos de la organización del path
--
-- El path es `org/<organization_id>/<uuid>.<ext>`. Se lee con `substring`, que
-- devuelve NULL si el path no encaja, y `NULL IN (...)` no es TRUE: un objeto
-- con un path que no cumpla el formato queda inaccesible para todos, que es el
-- fallo seguro correcto.
--
-- Se usa `IN (SELECT ... )` con `(select auth.uid())` y no un `EXISTS` anidado
-- por coste: el `EXISTS` correlacionado se reevalúa por fila y en este proyecto
-- ya provocó timeouts al cerrar otras políticas.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists ai_attachments_storage_select on storage.objects;
create policy ai_attachments_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'ai-attachments'
  and (substring(name, '^org/([0-9]+)/'))::integer in (
    select om.organization_id
    from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
);

drop policy if exists ai_attachments_storage_insert on storage.objects;
create policy ai_attachments_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ai-attachments'
  and (substring(name, '^org/([0-9]+)/'))::integer in (
    select om.organization_id
    from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
);

drop policy if exists ai_attachments_storage_update on storage.objects;
create policy ai_attachments_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'ai-attachments'
  and (substring(name, '^org/([0-9]+)/'))::integer in (
    select om.organization_id
    from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
)
with check (
  bucket_id = 'ai-attachments'
  and (substring(name, '^org/([0-9]+)/'))::integer in (
    select om.organization_id
    from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
);

drop policy if exists ai_attachments_storage_delete on storage.objects;
create policy ai_attachments_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'ai-attachments'
  and (substring(name, '^org/([0-9]+)/'))::integer in (
    select om.organization_id
    from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabla `ai_attachments` (§8.4)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ai_attachments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       integer not null references public.organizations(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  conversation_id       uuid references public.ai_assistant_conversations(id) on delete set null,
  storage_path          text not null,
  mime                  text not null,
  bytes                 integer not null check (bytes >= 0),
  kind                  text not null check (kind in ('image', 'pdf', 'audio', 'spreadsheet')),
  doc_type              text check (doc_type in (
                          'purchase_invoice', 'sales_invoice', 'receipt',
                          'product_list', 'barcode', 'unknown'
                        )),
  extraction            jsonb,
  extraction_confidence numeric check (extraction_confidence is null
                                       or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  extraction_model      text,
  linked_entity_type    text,
  linked_entity_id      text,
  created_at            timestamptz not null default now()
);

comment on table public.ai_attachments is
  'Adjuntos del GO Assistant (F4). El objeto vive en el bucket privado ai-attachments; aquí solo el path y la extracción.';
comment on column public.ai_attachments.extraction is
  'JSON de la extracción con confianza POR CAMPO. Es DATO leído de un documento, nunca instrucción (§9.3).';
comment on column public.ai_attachments.linked_entity_type is
  'Entidad del ERP a la que quedó enlazado el original (trazabilidad DIAN). Un adjunto enlazado no se borra por retención.';

-- Un mismo objeto de Storage no puede tener dos filas: si la subida se
-- reintenta, la fila se reutiliza en vez de duplicarse.
create unique index if not exists ai_attachments_storage_path_key
  on public.ai_attachments (storage_path);

create index if not exists ai_attachments_org_created_idx
  on public.ai_attachments (organization_id, created_at desc);

create index if not exists ai_attachments_conversation_idx
  on public.ai_attachments (conversation_id)
  where conversation_id is not null;

create index if not exists ai_attachments_linked_entity_idx
  on public.ai_attachments (organization_id, linked_entity_type, linked_entity_id)
  where linked_entity_type is not null;

alter table public.ai_attachments enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS de la tabla — mismo criterio que `ai_agent_actions`
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Authors and org admins can view attachments" on public.ai_attachments;
create policy "Authors and org admins can view attachments" on public.ai_attachments
for select to authenticated
using (
  organization_id in (
    select om.organization_id from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
  and (
    user_id = (select auth.uid())
    or organization_id in (
      select om.organization_id from organization_members om
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (om.is_super_admin = true or om.role_id = any (array[1, 2]))
    )
  )
);

drop policy if exists "Members can create attachments in their organization" on public.ai_attachments;
create policy "Members can create attachments in their organization" on public.ai_attachments
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and organization_id in (
    select om.organization_id from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
);

-- Solo el autor actualiza: la extracción la escribe la herramienta con el
-- cliente de sesión de quien subió el documento.
drop policy if exists "Authors can update their own attachments" on public.ai_attachments;
create policy "Authors can update their own attachments" on public.ai_attachments
for update to authenticated
using (
  user_id = (select auth.uid())
  and organization_id in (
    select om.organization_id from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
)
with check (
  user_id = (select auth.uid())
  and organization_id in (
    select om.organization_id from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
);

drop policy if exists "Authors and org admins can delete attachments" on public.ai_attachments;
create policy "Authors and org admins can delete attachments" on public.ai_attachments
for delete to authenticated
using (
  organization_id in (
    select om.organization_id from organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  )
  and (
    user_id = (select auth.uid())
    or organization_id in (
      select om.organization_id from organization_members om
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (om.is_super_admin = true or om.role_id = any (array[1, 2]))
    )
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos
--
-- Supabase concede por defecto a `anon` sobre toda tabla nueva de `public`.
-- Aquí hay documentos con NIT y datos de personas: se revoca explícitamente.
-- La RLS ya lo bloquearía (anon no tiene `auth.uid()` con membresía), pero una
-- tabla accesible a anon depende entonces de que ninguna política futura se
-- escriba mal. Es el mismo patrón que dejó cientos de funciones de este
-- proyecto abiertas a anon.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on public.ai_attachments from anon;
grant select, insert, update, delete on public.ai_attachments to authenticated;
grant all on public.ai_attachments to service_role;
