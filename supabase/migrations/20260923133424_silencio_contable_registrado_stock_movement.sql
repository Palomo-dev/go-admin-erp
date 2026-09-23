-- Reaplica el registro sin regla sobre fn_auto_journal_stock_movement.
--
-- 20260923133338 (silencio_contable_registrado) transformó 18 disparadores. Tres
-- segundos después, 20260923133341 (un_solo_asiento_por_hecho_de_compra, otra
-- sesión, ADR-CC-009) reescribió fn_auto_journal_stock_movement desde una
-- lectura anterior y devolvió el `IF v_rule IS NULL THEN RETURN NEW;`. Se
-- conserva su cuerpo —amplía los orígenes excluidos— y solo se reaplica la
-- misma transformación, sobre la definición vigente leída de la base.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.fn_auto_journal_stock_movement'::regproc) into v_def;
  if v_def !~* 'IF\s+v_rule\s+IS\s+NULL\s+THEN\s+RETURN\s+NEW\s*;' then
    raise notice 'fn_auto_journal_stock_movement ya registra: nada que hacer';
    return;
  end if;
  v_def := regexp_replace(v_def,
    'IF\s+v_rule\s+IS\s+NULL\s+THEN\s+RETURN\s+NEW\s*;',
    'IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>''organization_id'')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>''id'', NULL, NULL, NULL, NULL, ''no_rule'', ''Sin regla contable activa para '' || TG_TABLE_NAME || '' ('' || TG_OP || '')''); RETURN NEW;',
    'gi');
  execute v_def;
end $$;
