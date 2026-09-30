-- Reportes v2: envíos programados (Figma, página 14 Reportes, pestaña
-- Programados y diálogo «Programar envío»).
--
-- scheduled_reports existía sin uso (0 filas al aplicar). Gana lo que pide el
-- diálogo:
--   report_id     reporte del catálogo (reportesCatalogo.ts);
--   filtros       periodo relativo (ayer, semana-anterior, mes-anterior…),
--                 comparativo y franja;
--   branch_id     sucursal; NULL es el consolidado y solo lo recibe quien
--                 tiene acceso a todas;
--   formato       pdf, excel o csv;
--   hora, dia     hora local de envío y día (1–7 de la semana en semanal y
--                 quincenal; 1–28 del mes en mensual);
--   zona_horaria  la de la organización al programarlo;
--   last_run_at, last_status, last_error: resultado del último envío.
-- recipients (ya existía) guarda un objeto por destinatario:
--   { "tipo": "miembro", "user_id", "email", "nombre",
--     "estado": "activo" | "pausado", "motivo" }
--   { "tipo": "externo", "email",
--     "estado": "pendiente" | "activo" | "pausado", "aprobado_por" }
-- El cron (/api/cron/reportes-programados) ejecuta el reporte con la sesión
-- de cada miembro, así que cada uno recibe solo lo que su alcance le deja ver;
-- si ya no cubre la sucursal del envío, lo pausa para esa persona. Los
-- externos salen con el alcance de quien lo programó y solo aprobados por un
-- administrador.
--
-- La política propia (auth.uid() = user_id) y la de pertenencia activa
-- (20260930234000) no cambian: cada quien ve y edita los suyos; la ruta del
-- servidor lista los de toda la organización a los administradores.

alter table public.scheduled_reports
  add column if not exists report_id text,
  add column if not exists filtros jsonb not null default '{}'::jsonb,
  add column if not exists branch_id integer references public.branches(id) on delete set null,
  add column if not exists formato text not null default 'pdf',
  add column if not exists hora time not null default '07:00',
  add column if not exists dia smallint,
  add column if not exists zona_horaria text,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_status text,
  add column if not exists last_error text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'scheduled_reports_formato_check'
                   and conrelid = 'public.scheduled_reports'::regclass) then
    alter table public.scheduled_reports
      add constraint scheduled_reports_formato_check
      check (formato in ('pdf', 'excel', 'csv'));
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'scheduled_reports_frequency_check'
                   and conrelid = 'public.scheduled_reports'::regclass) then
    alter table public.scheduled_reports
      add constraint scheduled_reports_frequency_check
      check (frequency in ('daily', 'weekly', 'biweekly', 'monthly'));
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'scheduled_reports_dia_check'
                   and conrelid = 'public.scheduled_reports'::regclass) then
    alter table public.scheduled_reports
      add constraint scheduled_reports_dia_check
      check (dia is null or dia between 1 and 28);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'scheduled_reports_last_status_check'
                   and conrelid = 'public.scheduled_reports'::regclass) then
    alter table public.scheduled_reports
      add constraint scheduled_reports_last_status_check
      check (last_status is null or last_status in ('enviado', 'parcial', 'fallido', 'omitido'));
  end if;
end $$;

create index if not exists idx_scheduled_reports_vencidos
  on public.scheduled_reports (next_run_at)
  where is_active = true;
create index if not exists idx_scheduled_reports_branch
  on public.scheduled_reports (branch_id)
  where branch_id is not null;
create index if not exists idx_scheduled_reports_user
  on public.scheduled_reports (user_id);
