-- ============================================================
-- ROLLBACK de 20260909042544_crm_v4_f00_21_comm_credits_fail_closed_y_seed_por_plan
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita el trigger y la sembradora, devuelve deduct_comm_credits a una versión
-- sin fail-closed y quita los DEFAULT 0. La versión anterior exacta de
-- deduct_comm_credits (con EXECUTE dinámico y NULL = ilimitado) no quedó
-- registrada: se restaura la semántica descrita en la migración. Si ya se aplicó
-- f00_22, revertirla antes (redefine esta misma función).
--
-- SOBRE LOS DATOS: este rollback restaura la estructura, no los datos: NO borra las 52 filas
-- de comm_settings sembradas por plan (desde entonces son saldo vivo que las
-- organizaciones consumen; borrarlas dejaría a esas orgs otra vez en "ilimitado").
-- OJO: reabre el agujero "sin fila = ilimitado".
-- ============================================================

begin;
drop trigger if exists trg_seed_comm_settings_on_org on public.organizations;
drop function if exists public.fn_seed_comm_settings_on_org();
drop function if exists public.fn_seed_comm_settings(integer);

-- Semántica anterior (reconstruida): sin fila => NULL => ilimitado; sin FOR UPDATE.
create or replace function public.deduct_comm_credits(p_org_id integer, p_channel text, p_amount integer default 1)
returns boolean language plpgsql security definer as $function$
DECLARE v_remaining integer; v_col text;
BEGIN
  v_col := CASE p_channel WHEN 'sms' THEN 'sms_remaining' WHEN 'whatsapp' THEN 'whatsapp_remaining' WHEN 'voice' THEN 'voice_minutes_remaining' END;
  IF v_col IS NULL THEN RETURN false; END IF;
  EXECUTE format('SELECT %I FROM public.comm_settings WHERE organization_id = $1 AND is_active = true', v_col) INTO v_remaining USING p_org_id;
  IF v_remaining IS NULL THEN RETURN true; END IF;
  IF v_remaining < p_amount THEN RETURN false; END IF;
  EXECUTE format('UPDATE public.comm_settings SET %I = %I - $1, updated_at = now() WHERE organization_id = $2', v_col, v_col) USING p_amount, p_org_id;
  RETURN true;
END $function$;
comment on function public.deduct_comm_credits(integer, text, integer) is null;

alter table public.comm_settings alter column sms_remaining           drop default;
alter table public.comm_settings alter column whatsapp_remaining      drop default;
alter table public.comm_settings alter column voice_minutes_remaining drop default;
comment on column public.comm_settings.sms_remaining           is null;
comment on column public.comm_settings.whatsapp_remaining      is null;
comment on column public.comm_settings.voice_minutes_remaining is null;
commit;
