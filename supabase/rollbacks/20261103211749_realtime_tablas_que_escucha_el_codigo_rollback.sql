-- Rollback de 20261103211749_realtime_tablas_que_escucha_el_codigo.
alter publication supabase_realtime drop table
  public.campaigns, public.cash_movements, public.cash_sessions, public.message_events,
  public.opportunities, public.parking_sessions, public.parking_spaces, public.pipelines,
  public.print_jobs, public.product_costs, public.product_prices, public.stages,
  public.stock_levels, public.templates;
