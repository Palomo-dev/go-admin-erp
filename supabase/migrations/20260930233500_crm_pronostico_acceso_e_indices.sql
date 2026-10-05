-- Esquema y ACL verificados por MCP. La lectura nueva aplica organización y permisos.
revoke select on public.mv_crm_forecast from anon, authenticated;
create index if not exists forecast_adjustments_user_idx on public.forecast_adjustments (user_id);
create index if not exists forecast_adjustments_actor_idx on public.forecast_adjustments (adjusted_by);
create index if not exists forecast_adjustments_reverses_idx on public.forecast_adjustments (reverses_id);
