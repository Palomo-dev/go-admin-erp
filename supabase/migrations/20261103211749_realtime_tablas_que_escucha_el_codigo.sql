-- Tablas que el código escucha con postgres_changes y que no estaban en la
-- publicación supabase_realtime del proyecto nuevo (recreado el 2026-11-03).
-- Realtime sigue aplicando el RLS de cada tabla a cada suscriptor.
alter publication supabase_realtime add table
  public.campaigns, public.cash_movements, public.cash_sessions, public.message_events,
  public.opportunities, public.parking_sessions, public.parking_spaces, public.pipelines,
  public.print_jobs, public.product_costs, public.product_prices, public.stages,
  public.stock_levels, public.templates;
