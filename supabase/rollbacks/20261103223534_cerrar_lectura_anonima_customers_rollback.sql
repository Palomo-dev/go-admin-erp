-- Rollback de 20261103223534: devuelve las tres políticas a TO public.
-- OJO: reabre la lectura, modificación y creación de clientes de cualquier
-- organización con la anon key. Úsese solo si algo legítimo dejó de funcionar,
-- y mientras tanto muévase ese acceso a un route handler con service role.
alter policy "Allow anon select customers by email" on public.customers to public;
alter policy "Allow anon update customers" on public.customers to public;
alter policy "Allow anon insert customers" on public.customers to public;

comment on policy "Allow anon select customers by email" on public.customers is null;
comment on policy "Allow anon update customers" on public.customers is null;
comment on policy "Allow anon insert customers" on public.customers is null;
