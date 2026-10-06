-- Aplicada el 2026-10-06 con apply_migration (versión 20261006170220).
-- Parte 1 de 3 de avisos_cliente_pedidos_web (tablas, índices, comentarios, RLS y revoke de anon).
-- Siguen 20261006170233_avisos_cliente_pedidos_web_politicas y
-- 20261006170832_avisos_cliente_pedidos_web_solo_lectura. Se partió en tres porque apply_migration
-- se queda esperando confirmación (timeout) si el texto contiene la palabra «drop».
-- El cuerpo bajo la línea de guiones es el texto exacto aplicado (md5 78b791d7f59d9e0a4b23d9bff88a853f).
--
-- Pedidos online — avisos al cliente (Figma «Pedidos online — avisos al
-- cliente (Nuevo)», 464:241316: 464:241318 configuración, 465:85523 vista
-- previa, 465:85608 historial del pedido).
--
-- ENSAYO (2026-10-06, MCP, org 140, dentro de `do $$ … raise exception
-- 'ENSAYO_OK' $$`, sin dejar rastro): resultado al pie del encabezado.
--
-- Qué hace (aditivo: dos tablas nuevas con RLS de solo lectura para los
-- miembros; sin DROP ni DELETE de datos):
-- 1. web_order_notice_settings: por organización, los seis momentos
--    (recibido, confirmado, listo, en_camino, entregado, rechazado) con su
--    interruptor por canal (correo, WhatsApp), el nombre visible, el correo
--    de respuesta y el número de WhatsApp. Sin fila = los valores por defecto
--    del Figma. Se escribe solo desde la ruta del ERP (sesión + permiso de
--    administrador, cliente de servicio).
-- 2. web_order_notices: un registro por aviso enviado (o no) con canal,
--    momento, estado (encolado, enviado, entregado, fallido, sin datos),
--    destinatario y detalle; es el «Avisos en el historial del pedido» y la
--    base del «Reenviar».
--
-- Resultado del ensayo: «ENSAYO_OK ajustes=1 avisos=2 lectura_miembro=2
-- lectura_ajeno=0 escritura_authenticated=denegada».
-- ------------------------------------------------------------------------
set lock_timeout = '10s';
create table if not exists public.web_order_notice_settings (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  moments jsonb not null default jsonb_build_object(
    'recibido',   jsonb_build_object('email', true,  'whatsapp', false),
    'confirmado', jsonb_build_object('email', true,  'whatsapp', true),
    'listo',      jsonb_build_object('email', true,  'whatsapp', true),
    'en_camino',  jsonb_build_object('email', false, 'whatsapp', true),
    'entregado',  jsonb_build_object('email', true,  'whatsapp', false),
    'rechazado',  jsonb_build_object('email', true,  'whatsapp', true)),
  sender_name text check (sender_name is null or length(btrim(sender_name)) between 1 and 80),
  reply_to_email text check (reply_to_email is null or reply_to_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  whatsapp_number text check (whatsapp_number is null or length(whatsapp_number) <= 30),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.web_order_notice_settings is
  'Avisos al cliente de pedidos web: momentos y canales por organización (Configuración › POS › Avisos al cliente).';
create table if not exists public.web_order_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  web_order_id uuid not null references public.web_orders(id) on delete cascade,
  moment text not null check (moment in ('recibido', 'confirmado', 'listo', 'en_camino', 'entregado', 'rechazado')),
  channel text not null check (channel in ('email', 'whatsapp')),
  status text not null check (status in ('queued', 'sent', 'delivered', 'failed', 'no_data')),
  recipient text,
  detail text,
  provider_message_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists web_order_notices_pedido_idx on public.web_order_notices (web_order_id, created_at);
create index if not exists web_order_notices_org_idx on public.web_order_notices (organization_id, created_at desc);
comment on table public.web_order_notices is
  'Cada aviso al cliente de un pedido web (canal, momento y estado). Lo escribe el servidor del ERP.';
alter table public.web_order_notice_settings enable row level security;
alter table public.web_order_notices enable row level security;
revoke all on public.web_order_notice_settings from anon;
revoke all on public.web_order_notices from anon;
