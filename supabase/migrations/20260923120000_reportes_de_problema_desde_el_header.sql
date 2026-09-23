-- Reportes de problema, sugerencia o pregunta enviados desde el header
-- (Figma `02 Componentes` › FeedbackButton 67:3014 y FeedbackDialog 68:3208).
--
-- Hasta ahora no había dónde reportar un fallo desde la app: se hacía por
-- WhatsApp, sin la página, la organización ni la versión. El reporte llega con
-- ese contexto adjunto de forma automática.
--
-- Escritura: SOLO por `POST /api/feedback`, con la organización validada en el
-- servidor (`withOrg`) y el cliente de servicio. Por eso no hay política de
-- INSERT: nadie inserta directamente desde el navegador.
-- Lectura: cada persona ve los suyos (para un futuro «mis reportes»); el equipo
-- de soporte los lee desde el panel de superadministración con service_role.

create table if not exists public.problem_reports (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer references public.branches(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('error', 'sugerencia', 'pregunta')),
  descripcion text not null check (char_length(descripcion) between 1 and 4000),
  ruta text,
  contexto jsonb not null default '{}'::jsonb,
  adjuntos text[] not null default '{}',
  correo_respuesta text,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'en_revision', 'resuelto', 'descartado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.problem_reports is
  'Reportes de problema, sugerencia o pregunta enviados desde el header. Se escriben solo por POST /api/feedback.';
comment on column public.problem_reports.contexto is
  'Contexto adjunto automáticamente: título de la página, versión web/desktop, navegador, sistema y tamaño de ventana.';
comment on column public.problem_reports.adjuntos is
  'Rutas dentro del bucket privado problem-reports (<organization_id>/<id>/<archivo>).';

create index if not exists problem_reports_org_created_idx
  on public.problem_reports (organization_id, created_at desc);
create index if not exists problem_reports_estado_idx
  on public.problem_reports (estado, created_at desc) where estado in ('nuevo', 'en_revision');

alter table public.problem_reports enable row level security;

drop policy if exists problem_reports_select_propios on public.problem_reports;
create policy problem_reports_select_propios on public.problem_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.problem_reports from anon;
revoke insert, update, delete on public.problem_reports from authenticated;
grant select on public.problem_reports to authenticated;

-- Bucket privado para las fotos y capturas (máx. 5 por reporte, 5 MB cada una).
-- Sin políticas en storage.objects: sube y firma URLs solo el servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('problem-reports', 'problem-reports', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
