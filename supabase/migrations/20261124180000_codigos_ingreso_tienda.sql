-- Códigos de 6 dígitos de la tienda web (goadmin-websites) para sus compradores.
--
-- Regla del dueño (2026-11-24): los compradores de las tiendas NUNCA reciben correos de
-- Supabase Auth (marca y dirección de la plataforma). Entrar con código, confirmar el correo al
-- registrarse y cambiar la contraseña usan un código propio que la tienda envía con Resend y con
-- su marca. Las plantillas de Supabase Auth quedan solo para los usuarios del ERP.
--
-- 1. web_customer_login_codes: un código por envío. Solo el hash (HMAC-SHA256 con un pepper del
--    servidor), nunca el código. RLS activa y SIN políticas: solo service_role la lee y escribe.
-- 2. fn_tienda_usuario_auth_por_correo: id y confirmación del usuario de Auth con ese correo, para
--    crear la sesión sin correo (admin.generateLink + verifyOtp). Solo service_role.
--
-- Aditiva e idempotente. Sin credenciales.

create table if not exists public.web_customer_login_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  email text not null,
  code_hash text not null,
  purpose text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  used_at timestamptz,
  ip text,
  created_at timestamptz not null default now(),
  constraint web_customer_login_codes_email_normalizado check (email = lower(btrim(email)) and length(email) between 3 and 254),
  constraint web_customer_login_codes_purpose_check check (purpose in ('login', 'reset', 'verify')),
  constraint web_customer_login_codes_attempts_check check (attempts between 0 and 50)
);

comment on table public.web_customer_login_codes is
  'Códigos de 6 dígitos que la tienda web envía a sus compradores (entrar, confirmar correo, cambiar contraseña). Solo el hash HMAC; vencen a los 10 minutos, máximo 5 intentos y un solo uso. Solo service_role.';
comment on column public.web_customer_login_codes.code_hash is 'HMAC-SHA256 (pepper del servidor) de organización, correo, propósito y código. Nunca el código.';
comment on column public.web_customer_login_codes.purpose is 'login = entrar con código; verify = confirmar el correo al registrarse; reset = cambiar la contraseña.';
comment on column public.web_customer_login_codes.used_at is 'Cuándo se usó o se invalidó (llegó un código más nuevo del mismo propósito).';

create index if not exists idx_web_customer_login_codes_org_email_created
  on public.web_customer_login_codes (organization_id, email, created_at desc);

alter table public.web_customer_login_codes enable row level security;
revoke all on table public.web_customer_login_codes from anon, authenticated, public;
grant select, insert, update, delete on table public.web_customer_login_codes to service_role;

create or replace function public.fn_tienda_usuario_auth_por_correo(p_email text)
returns table (id uuid, email_confirmed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email_confirmed_at
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and coalesce(u.is_sso_user, false) = false
    and u.deleted_at is null
  order by u.created_at asc
  limit 1
$$;

comment on function public.fn_tienda_usuario_auth_por_correo(text) is
  'Tienda web: usuario de Auth con ese correo (id y confirmación) para abrir la sesión con el código propio, sin correo de Supabase. Solo service_role.';

revoke all on function public.fn_tienda_usuario_auth_por_correo(text) from public, anon, authenticated;
grant execute on function public.fn_tienda_usuario_auth_por_correo(text) to service_role;
