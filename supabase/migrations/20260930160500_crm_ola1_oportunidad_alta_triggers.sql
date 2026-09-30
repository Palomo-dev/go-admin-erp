-- CRM ola 1 · M5 — lo que pasa al CREAR una oportunidad (plan §4.1 y §7.3).
--
-- 1. Ciclo de vida: `trg_sync_customer_lifecycle` solo corría en UPDATE OF
--    status, record_type. Una oportunidad (record_type 'deal') que NACE sobre
--    un cliente en 'lead' —«Calificar» un lead, D2— no lo subía a
--    'opportunity'. Nuevo trigger AFTER INSERT con la misma escalera
--    monotónica y las mismas guardas de pertenencia que fn_sync_customer_lifecycle
--    (nunca degrada 'customer' ni resucita 'churned').
-- 2. Historial de etapas: `fn_log_stage_change` solo escribe al CAMBIAR de
--    etapa, así que «días en etapa» no tenía punto de partida (1 fila de
--    historial para 70 oportunidades). Se registra la etapa inicial
--    (from_stage_id NULL) en cada alta.
--
-- Aditiva: dos funciones y dos triggers nuevos; los existentes no se tocan.
-- Rollback: supabase/rollbacks/20260930160500_crm_ola1_oportunidad_alta_triggers_rollback.sql

create or replace function public.fn_sync_customer_lifecycle_on_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if new.customer_id is null or new.organization_id is null then
    return new;
  end if;
  if coalesce(new.record_type, 'deal') <> 'deal' then
    return new;  -- D2: los leads viven en customers; un record_type 'lead' no sube nada
  end if;
  -- Guarda de pertenencia: con sesión, el usuario debe ser miembro activo.
  if v_uid is not null and not exists (
    select 1 from public.organization_members om
     where om.user_id = v_uid and om.organization_id = new.organization_id and coalesce(om.is_active, true)
  ) then
    return new;
  end if;
  -- Escalera monotónica: solo 'lead' → 'opportunity'.
  update public.customers
     set lifecycle_stage = 'opportunity',
         updated_at = now()
   where id = new.customer_id
     and organization_id = new.organization_id
     and lifecycle_stage = 'lead';
  return new;
end;
$$;

revoke all on function public.fn_sync_customer_lifecycle_on_insert() from public, anon, authenticated;

drop trigger if exists trg_sync_customer_lifecycle_on_insert on public.opportunities;
create trigger trg_sync_customer_lifecycle_on_insert
  after insert on public.opportunities
  for each row execute function public.fn_sync_customer_lifecycle_on_insert();

create or replace function public.fn_log_stage_initial()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- SECURITY INVOKER, igual que fn_log_stage_change: la RLS de
  -- opportunity_stage_history (miembro activo) aplica también aquí.
  if new.stage_id is not null then
    insert into opportunity_stage_history
      (opportunity_id, organization_id, from_stage_id, to_stage_id, changed_by, changed_at)
    values (new.id, new.organization_id, null, new.stage_id, coalesce(auth.uid(), new.created_by), coalesce(new.created_at, now()));
  end if;
  return new;
end;
$$;

revoke all on function public.fn_log_stage_initial() from public, anon;

drop trigger if exists trg_opp_stage_history_insert on public.opportunities;
create trigger trg_opp_stage_history_insert
  after insert on public.opportunities
  for each row execute function public.fn_log_stage_initial();
