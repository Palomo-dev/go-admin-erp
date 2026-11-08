-- Vínculo genérico entre organizaciones de GO Admin (decisión del dueño 2026-11-07,
-- docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md, «Decisiones del dueño»).
-- Figma «07 Finanzas» 2406:147546 (vincular) y 2406:147790 (invitación recibida).
--
-- PROPUESTA, SIN APLICAR. Va antes de 20261108121000_consignaciones.sql, que la usa.
--
-- Qué es: dos organizaciones se vinculan con una invitación de UN SOLO USO. El token en claro solo viaja
-- en el enlace; aquí se guarda su sha-256. Lo acepta, con sesión, un administrador de la otra
-- organización, y cada lado amarra el vínculo a un tercero PROPIO (proveedor o cliente). Desde entonces
-- se pueden enviar documentos entre las dos.
--
-- Hoy lo usa la consignación (propósito 'consignacion'). Queda listo, sin construir, para órdenes de
-- compra ('orden_compra') y facturas ('factura'): un propósito más en `purposes` y un `kind` más en
-- `organization_shared_documents`, con su función de publicar y su función de aceptar en el receptor.
--
-- Aislamiento:
--   - Lo que cruza es una COPIA inmutable (`payload`) que arma la RPC del emisor, filtrada al documento.
--     El receptor nunca lee tablas de la otra organización ni tiene FKs hacia sus filas.
--   - Aceptar un documento lo hace el receptor con SUS funciones y crea SUS filas; rechazar solo cambia
--     el estado del documento compartido.
--   - `organization_links` y `organization_shared_documents`: lectura para miembros de cualquiera de las
--     dos organizaciones del registro (el hash del token NO se puede leer: privilegio por columna).
--   - `organization_link_parties` y `organization_link_product_map`: solo la organización dueña de la fila.
--   - Nada para anon; ninguna escritura directa: todo por las RPC (SECURITY DEFINER, guarda de
--     organización y de permiso). No hay buscador de organizaciones (no se revela quién usa GO Admin).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.organization_links (
  id uuid primary key default gen_random_uuid(),
  inviter_org_id integer not null references public.organizations(id) on delete cascade,
  invitee_org_id integer references public.organizations(id) on delete cascade,
  purposes text[] not null default array['consignacion']::text[],
  status text not null default 'pendiente'
    check (status in ('pendiente', 'activo', 'rechazado', 'revocado', 'suspendido')),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  invited_email text check (invited_email is null or length(invited_email) <= 254),
  -- Lo que cada parte decide mostrar de sí misma (copia; nunca se lee la otra organización).
  inviter_display jsonb not null default '{}'::jsonb,
  invitee_display jsonb,
  reason text check (reason is null or length(reason) <= 500),
  created_by uuid,
  accepted_by uuid,
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_links_propositos check (
    cardinality(purposes) > 0 and purposes <@ array['consignacion', 'orden_compra', 'factura']::text[]
  ),
  constraint organization_links_distintas check (invitee_org_id is null or invitee_org_id <> inviter_org_id),
  constraint organization_links_token unique (token_hash)
);

comment on table public.organization_links is
  'Vínculo entre dos organizaciones de GO Admin (consignación hoy; órdenes de compra y facturas después). Invitación de un solo uso: solo se guarda el sha-256 del token. Escritura solo por fn_vinculo_*.';

-- Un solo vínculo vigente por pareja de organizaciones.
create unique index if not exists organization_links_pareja_vigente
  on public.organization_links (least(inviter_org_id, invitee_org_id), greatest(inviter_org_id, invitee_org_id))
  where status in ('activo', 'suspendido') and invitee_org_id is not null;
create index if not exists idx_organization_links_inviter on public.organization_links (inviter_org_id);
create index if not exists idx_organization_links_invitee on public.organization_links (invitee_org_id);

create table if not exists public.organization_link_parties (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.organization_links(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  supplier_id integer references public.suppliers(id),
  customer_id uuid references public.customers(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint organization_link_parties_tercero check (supplier_id is not null or customer_id is not null),
  constraint organization_link_parties_unico unique (link_id, organization_id)
);

comment on table public.organization_link_parties is
  'El tercero PROPIO con el que cada organización amarra un vínculo. Cada organización ve solo su fila.';

create index if not exists idx_organization_link_parties_org on public.organization_link_parties (organization_id);

create table if not exists public.organization_shared_documents (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.organization_links(id),
  from_org_id integer not null references public.organizations(id) on delete cascade,
  to_org_id integer not null references public.organizations(id) on delete cascade,
  -- 'orden_compra' y 'factura' quedan reservados para la siguiente fase (sin funciones todavía).
  kind text not null check (kind in ('consignacion_nota', 'consignacion_liquidacion', 'consignacion_devolucion', 'orden_compra', 'factura')),
  version integer not null default 1 check (version > 0),
  payload jsonb not null,
  status text not null default 'enviado' check (status in ('enviado', 'aceptado', 'rechazado', 'anulado')),
  reply_reason text check (reply_reason is null or length(reply_reason) <= 500),
  -- Id local en el emisor y, tras aceptar, id local en el receptor (texto: no son FKs cruzadas).
  source_id text not null,
  target_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint organization_shared_documents_distintas check (from_org_id <> to_org_id),
  constraint organization_shared_documents_unico unique (link_id, kind, source_id, version)
);

comment on table public.organization_shared_documents is
  'Lo único que cruza entre organizaciones vinculadas: una COPIA inmutable del documento (payload) armada por la RPC del emisor. El receptor la acepta con sus propias funciones. Escritura solo por RPC.';

create index if not exists idx_organization_shared_documents_to on public.organization_shared_documents (to_org_id, status);
create index if not exists idx_organization_shared_documents_from on public.organization_shared_documents (from_org_id, status);

create table if not exists public.organization_link_product_map (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  link_id uuid not null references public.organization_links(id) on delete cascade,
  -- Referencia del producto en la OTRA organización, tal como llegó en el payload (texto).
  external_ref text not null check (length(external_ref) between 1 and 120),
  external_display jsonb not null default '{}'::jsonb,
  product_id integer not null references public.products(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_link_product_map_unico unique (organization_id, link_id, external_ref)
);

comment on table public.organization_link_product_map is
  'Producto de la otra organización enlazado con uno propio (lo decide quien recibe). La segunda nota llega ya vinculada.';

-- El payload, el emisor, el receptor y el tipo no cambian nunca: solo el estado y la respuesta.
create or replace function public.fn_documento_compartido_inmutable()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.payload is distinct from old.payload or new.kind is distinct from old.kind
     or new.from_org_id is distinct from old.from_org_id or new.to_org_id is distinct from old.to_org_id
     or new.link_id is distinct from old.link_id or new.source_id is distinct from old.source_id
     or new.version is distinct from old.version then
    raise exception 'documento_compartido_inmutable' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_documento_compartido_inmutable on public.organization_shared_documents;
create trigger trg_documento_compartido_inmutable
  before update on public.organization_shared_documents
  for each row execute function public.fn_documento_compartido_inmutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS y privilegios
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.organization_links enable row level security;
alter table public.organization_link_parties enable row level security;
alter table public.organization_shared_documents enable row level security;
alter table public.organization_link_product_map enable row level security;

drop policy if exists organization_links_select_partes on public.organization_links;
create policy organization_links_select_partes on public.organization_links
  for select to authenticated
  using (
    inviter_org_id in (select om.organization_id from public.organization_members om
                        where om.user_id = (select auth.uid()) and om.is_active)
    or invitee_org_id in (select om.organization_id from public.organization_members om
                           where om.user_id = (select auth.uid()) and om.is_active)
  );

drop policy if exists organization_shared_documents_select_partes on public.organization_shared_documents;
create policy organization_shared_documents_select_partes on public.organization_shared_documents
  for select to authenticated
  using (
    from_org_id in (select om.organization_id from public.organization_members om
                     where om.user_id = (select auth.uid()) and om.is_active)
    or to_org_id in (select om.organization_id from public.organization_members om
                      where om.user_id = (select auth.uid()) and om.is_active)
  );

drop policy if exists organization_link_parties_select_miembros on public.organization_link_parties;
create policy organization_link_parties_select_miembros on public.organization_link_parties
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

drop policy if exists organization_link_product_map_select_miembros on public.organization_link_product_map;
create policy organization_link_product_map_select_miembros on public.organization_link_product_map
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

revoke all on public.organization_links from anon, authenticated;
revoke all on public.organization_link_parties from anon;
revoke all on public.organization_shared_documents from anon;
revoke all on public.organization_link_product_map from anon;
revoke insert, update, delete, truncate, references, trigger on public.organization_link_parties from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.organization_shared_documents from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.organization_link_product_map from authenticated;
-- El hash del token no se lee nunca desde el cliente: privilegio por columna, sin token_hash.
grant select (id, inviter_org_id, invitee_org_id, purposes, status, expires_at, used_at, invited_email,
              inviter_display, invitee_display, reason, created_by, accepted_by, decided_by, created_at, updated_at)
  on public.organization_links to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Guardas
-- ─────────────────────────────────────────────────────────────────────────────

-- Administrador de la organización (dueña, super admin o rol 1/2), igual que fn_finanzas_exigir_permiso.
create or replace function public.fn_vinculo_es_admin(p_org integer)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select auth.uid() is not null and (
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = auth.uid())
    or exists (select 1 from public.organization_members om
                where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active
                  and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2)))
  );
$function$;

-- Hash del token tal como se guarda.
create or replace function public.fn_vinculo_hash(p_token text)
 returns text
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$function$;

-- Datos que la organización muestra de sí misma en el vínculo (nombre y NIT; nada más).
create or replace function public.fn_vinculo_presentacion(p_org integer)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'nombre', coalesce(nullif(btrim(o.legal_name), ''), o.name),
    'nit', coalesce(nullif(btrim(o.nit), ''), nullif(btrim(o.tax_id), '')))
  from public.organizations o where o.id = p_org;
$function$;

-- Vínculo activo de la organización con el propósito pedido, y la otra parte.
create or replace function public.fn_vinculo_activo(p_link uuid, p_org integer, p_proposito text)
 returns public.organization_links
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_link public.organization_links%rowtype;
begin
  select * into v_link from public.organization_links where id = p_link;
  if not found or p_org not in (v_link.inviter_org_id, coalesce(v_link.invitee_org_id, -1)) then
    raise exception 'vinculo_no_encontrado' using errcode = 'P0002';
  end if;
  if v_link.status <> 'activo' then
    raise exception 'vinculo_inactivo' using errcode = '22023', detail = v_link.status;
  end if;
  if not (p_proposito = any (v_link.purposes)) then
    raise exception 'vinculo_sin_proposito' using errcode = '22023', detail = p_proposito;
  end if;
  return v_link;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Invitar, ver, aceptar, rechazar, suspender
-- ─────────────────────────────────────────────────────────────────────────────

-- Devuelve el token EN CLARO una sola vez (para armar el enlace); se guarda solo su hash.
create or replace function public.fn_vinculo_invitar(
  p_organization_id integer,
  p_propositos text[],
  p_proveedor integer,
  p_cliente uuid,
  p_correo text,
  p_dias integer default 7
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_token text;
  v_link public.organization_links%rowtype;
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
  v_dias integer := coalesce(p_dias, 7);
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'organizacion_no_permitida' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if p_propositos is null or cardinality(p_propositos) = 0
     or not (p_propositos <@ array['consignacion', 'orden_compra', 'factura']::text[]) then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if v_dias < 1 or v_dias > 7 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if v_correo is not null and (length(v_correo) > 254 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'correo_invalido' using errcode = '22023';
  end if;
  if (p_proveedor is null) = (p_cliente is null) then
    raise exception 'tercero_obligatorio' using errcode = '22023';
  end if;
  if p_proveedor is not null and not exists (select 1 from public.suppliers s where s.id = p_proveedor and s.organization_id = v_org) then
    raise exception 'tercero_no_encontrado' using errcode = 'P0002';
  end if;
  if p_cliente is not null and not exists (select 1 from public.customers c where c.id = p_cliente and c.organization_id = v_org) then
    raise exception 'tercero_no_encontrado' using errcode = 'P0002';
  end if;
  -- Freno: no más de 20 invitaciones pendientes por organización.
  if (select count(*) from public.organization_links l
       where l.inviter_org_id = v_org and l.status = 'pendiente' and l.expires_at > now()) >= 20 then
    raise exception 'demasiadas_invitaciones' using errcode = '22023';
  end if;

  -- 2 × uuid v4 = 244 bits aleatorios; en hexadecimal, sin guiones.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.organization_links (
    inviter_org_id, purposes, status, token_hash, expires_at, invited_email, inviter_display, created_by
  ) values (
    v_org, p_propositos, 'pendiente', public.fn_vinculo_hash(v_token), now() + make_interval(days => v_dias),
    v_correo, public.fn_vinculo_presentacion(v_org), v_uid
  ) returning * into v_link;

  insert into public.organization_link_parties (link_id, organization_id, supplier_id, customer_id, created_by)
  values (v_link.id, v_org, p_proveedor, p_cliente, v_uid);

  return jsonb_build_object('vinculo_id', v_link.id, 'token', v_token, 'vence', v_link.expires_at);
end;
$function$;

-- Lo que ve quien abre el enlace (con sesión). Un token inválido, usado o vencido no revela nada más.
create or replace function public.fn_vinculo_invitacion_ver(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_link public.organization_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('estado', 'invalida');
  end if;
  select * into v_link from public.organization_links where token_hash = public.fn_vinculo_hash(p_token);
  if not found or v_link.status <> 'pendiente' or v_link.used_at is not null then
    return jsonb_build_object('estado', 'invalida');
  end if;
  if v_link.expires_at <= now() then
    return jsonb_build_object('estado', 'vencida');
  end if;
  return jsonb_build_object(
    'estado', 'pendiente',
    'invita', v_link.inviter_display,
    'propositos', to_jsonb(v_link.purposes),
    'creada', v_link.created_at,
    'vence', v_link.expires_at,
    -- Solo las organizaciones donde quien abre es administrador (y que no son la que invita).
    'organizaciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.name) order by o.name)
        from public.organizations o
       where o.id <> v_link.inviter_org_id and public.fn_vinculo_es_admin(o.id)
         and exists (select 1 from public.organization_members om where om.organization_id = o.id and om.user_id = auth.uid() and om.is_active)
    ), '[]'::jsonb));
end;
$function$;

create or replace function public.fn_vinculo_aceptar(
  p_token text,
  p_organization_id integer,
  p_proveedor integer,
  p_cliente uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_link public.organization_links%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  if not public.fn_vinculo_es_admin(v_org) then
    raise exception 'sin_permiso' using errcode = '42501', detail = 'Aceptar un vínculo exige ser administrador.';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invitacion_invalida' using errcode = '22023';
  end if;
  select * into v_link from public.organization_links where token_hash = public.fn_vinculo_hash(p_token) for update;
  if not found or v_link.status <> 'pendiente' or v_link.used_at is not null then
    raise exception 'invitacion_invalida' using errcode = '22023';
  end if;
  if v_link.expires_at <= now() then
    raise exception 'invitacion_vencida' using errcode = '22023';
  end if;
  if v_link.inviter_org_id = v_org then
    raise exception 'misma_organizacion' using errcode = '22023';
  end if;
  if (p_proveedor is null) = (p_cliente is null) then
    raise exception 'tercero_obligatorio' using errcode = '22023';
  end if;
  if p_proveedor is not null and not exists (select 1 from public.suppliers s where s.id = p_proveedor and s.organization_id = v_org) then
    raise exception 'tercero_no_encontrado' using errcode = 'P0002';
  end if;
  if p_cliente is not null and not exists (select 1 from public.customers c where c.id = p_cliente and c.organization_id = v_org) then
    raise exception 'tercero_no_encontrado' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.organization_links l
     where l.status in ('activo', 'suspendido') and l.id <> v_link.id
       and least(l.inviter_org_id, l.invitee_org_id) = least(v_link.inviter_org_id, v_org)
       and greatest(l.inviter_org_id, l.invitee_org_id) = greatest(v_link.inviter_org_id, v_org)
  ) then
    raise exception 'vinculo_existente' using errcode = '23505';
  end if;

  update public.organization_links
     set invitee_org_id = v_org, status = 'activo', used_at = now(), accepted_by = v_uid, decided_by = v_uid,
         invitee_display = public.fn_vinculo_presentacion(v_org), updated_at = now()
   where id = v_link.id;
  insert into public.organization_link_parties (link_id, organization_id, supplier_id, customer_id, created_by)
  values (v_link.id, v_org, p_proveedor, p_cliente, v_uid);

  return jsonb_build_object('vinculo_id', v_link.id, 'estado', 'activo');
end;
$function$;

create or replace function public.fn_vinculo_rechazar(p_token text, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_link public.organization_links%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invitacion_invalida' using errcode = '22023';
  end if;
  select * into v_link from public.organization_links where token_hash = public.fn_vinculo_hash(p_token) for update;
  if not found or v_link.status <> 'pendiente' or v_link.used_at is not null or v_link.expires_at <= now() then
    raise exception 'invitacion_invalida' using errcode = '22023';
  end if;
  -- Rechaza un administrador de alguna organización que no sea la que invita.
  if not exists (
    select 1 from public.organization_members om
     where om.user_id = v_uid and om.is_active and om.organization_id <> v_link.inviter_org_id
       and public.fn_vinculo_es_admin(om.organization_id)
  ) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  update public.organization_links
     set status = 'rechazado', used_at = now(), decided_by = v_uid,
         reason = nullif(left(btrim(coalesce(p_motivo, '')), 500), ''), updated_at = now()
   where id = v_link.id;
  return jsonb_build_object('vinculo_id', v_link.id, 'estado', 'rechazado');
end;
$function$;

-- Pendiente → revocado. Activo → suspendido (detiene envíos nuevos; lo compartido queda como historia).
-- Suspendido → activo (reactivar), solo quien lo suspendió o un admin de cualquiera de las dos.
create or replace function public.fn_vinculo_cambiar_estado(
  p_link uuid,
  p_organization_id integer,
  p_accion text,
  p_motivo text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_link public.organization_links%rowtype;
  v_nuevo text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  if not public.fn_vinculo_es_admin(v_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into v_link from public.organization_links where id = p_link for update;
  if not found or v_org not in (v_link.inviter_org_id, coalesce(v_link.invitee_org_id, -1)) then
    raise exception 'vinculo_no_encontrado' using errcode = 'P0002';
  end if;
  v_nuevo := case
    when p_accion = 'revocar' and v_link.status = 'pendiente' and v_org = v_link.inviter_org_id then 'revocado'
    when p_accion = 'suspender' and v_link.status = 'activo' then 'suspendido'
    when p_accion = 'reactivar' and v_link.status = 'suspendido' then 'activo'
  end;
  if v_nuevo is null then
    raise exception 'transicion_invalida' using errcode = '22023';
  end if;
  update public.organization_links
     set status = v_nuevo, decided_by = v_uid,
         reason = coalesce(nullif(left(btrim(coalesce(p_motivo, '')), 500), ''), reason), updated_at = now()
   where id = v_link.id;
  return jsonb_build_object('vinculo_id', v_link.id, 'estado', v_nuevo);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Documentos compartidos (núcleo genérico; cada propósito pone su payload y su «aceptar»)
-- ─────────────────────────────────────────────────────────────────────────────

-- INTERNA (sin EXECUTE para authenticated): la llama la función del emisor después de validar su
-- documento. Idempotente por (vínculo, tipo, id de origen, versión).
create or replace function public.fn_documento_compartido_publicar(
  p_link uuid,
  p_from_org integer,
  p_kind text,
  p_source_id text,
  p_payload jsonb,
  p_version integer default 1
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_link public.organization_links%rowtype;
  v_para integer;
  v_id uuid;
  v_proposito text := case when p_kind like 'consignacion_%' then 'consignacion' when p_kind = 'orden_compra' then 'orden_compra' else 'factura' end;
begin
  v_link := public.fn_vinculo_activo(p_link, p_from_org, v_proposito);
  v_para := case when v_link.inviter_org_id = p_from_org then v_link.invitee_org_id else v_link.inviter_org_id end;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 200000 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  insert into public.organization_shared_documents (link_id, from_org_id, to_org_id, kind, version, payload, source_id, created_by)
  values (p_link, p_from_org, v_para, p_kind, coalesce(p_version, 1), p_payload, p_source_id, auth.uid())
  on conflict (link_id, kind, source_id, version) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.organization_shared_documents
     where link_id = p_link and kind = p_kind and source_id = p_source_id and version = coalesce(p_version, 1);
  end if;
  return v_id;
end;
$function$;

-- INTERNA: el receptor marca un documento como aceptado al crear SUS filas.
create or replace function public.fn_documento_compartido_aceptado(p_doc uuid, p_org integer, p_target text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.organization_shared_documents
     set status = 'aceptado', target_id = p_target, decided_at = now(), decided_by = auth.uid()
   where id = p_doc and to_org_id = p_org and status = 'enviado';
  if not found then
    raise exception 'documento_no_disponible' using errcode = '22023';
  end if;
end;
$function$;

-- Rechazar (receptor, con motivo) o anular (emisor, mientras siga «enviado»).
create or replace function public.fn_documento_compartido_responder(
  p_doc uuid,
  p_organization_id integer,
  p_accion text,
  p_motivo text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_doc public.organization_shared_documents%rowtype;
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  select * into v_doc from public.organization_shared_documents where id = p_doc for update;
  if not found or v_org not in (v_doc.from_org_id, v_doc.to_org_id) then
    raise exception 'documento_no_encontrado' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'enviado' then
    raise exception 'documento_no_disponible' using errcode = '22023', detail = v_doc.status;
  end if;
  if p_accion = 'rechazar' and v_org = v_doc.to_org_id then
    update public.organization_shared_documents
       set status = 'rechazado', reply_reason = v_motivo, decided_at = now(), decided_by = v_uid
     where id = v_doc.id;
    return jsonb_build_object('documento_id', v_doc.id, 'estado', 'rechazado');
  elsif p_accion = 'anular' and v_org = v_doc.from_org_id then
    update public.organization_shared_documents
       set status = 'anulado', reply_reason = v_motivo, decided_at = now(), decided_by = v_uid
     where id = v_doc.id;
    return jsonb_build_object('documento_id', v_doc.id, 'estado', 'anulado');
  end if;
  raise exception 'transicion_invalida' using errcode = '22023';
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Permisos de ejecución
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.fn_documento_compartido_inmutable() from public, anon, authenticated;
revoke all on function public.fn_vinculo_es_admin(integer) from public, anon;
revoke all on function public.fn_vinculo_hash(text) from public, anon;
revoke all on function public.fn_vinculo_presentacion(integer) from public, anon, authenticated;
revoke all on function public.fn_vinculo_activo(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.fn_vinculo_invitar(integer, text[], integer, uuid, text, integer) from public, anon;
revoke all on function public.fn_vinculo_invitacion_ver(text) from public, anon;
revoke all on function public.fn_vinculo_aceptar(text, integer, integer, uuid) from public, anon;
revoke all on function public.fn_vinculo_rechazar(text, text) from public, anon;
revoke all on function public.fn_vinculo_cambiar_estado(uuid, integer, text, text) from public, anon;
revoke all on function public.fn_documento_compartido_publicar(uuid, integer, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.fn_documento_compartido_aceptado(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.fn_documento_compartido_responder(uuid, integer, text, text) from public, anon;

grant execute on function public.fn_vinculo_es_admin(integer) to authenticated;
grant execute on function public.fn_vinculo_invitar(integer, text[], integer, uuid, text, integer) to authenticated;
grant execute on function public.fn_vinculo_invitacion_ver(text) to authenticated;
grant execute on function public.fn_vinculo_aceptar(text, integer, integer, uuid) to authenticated;
grant execute on function public.fn_vinculo_rechazar(text, text) to authenticated;
grant execute on function public.fn_vinculo_cambiar_estado(uuid, integer, text, text) to authenticated;
grant execute on function public.fn_documento_compartido_responder(uuid, integer, text, text) to authenticated;
