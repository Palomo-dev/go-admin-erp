-- Índice simple de product_costs por producto.
--
-- El único índice con product_id era parcial (idx_product_costs_active,
-- WHERE effective_to IS NULL). Los embebidos de PostgREST
-- (`products(..., product_costs(cost, effective_from, effective_to))`) piden
-- todas las vigencias de un producto, sin filtrar effective_to, así que el
-- planificador recorría la tabla completa una vez por fila.
--
-- Medido con EXPLAIN ANALYZE como usuario autenticado de la org 137 (la de
-- más existencias), sobre la consulta del reporte «Stock crítico» (KPI del
-- inicio de reportes): Seq Scan on product_costs, loops=1000, 1 991 ms; con
-- el índice, Index Scan, 942 ms. pg_stat_statements: esa consulta promedia
-- 2,6 s (máx. 4,4 s).
--
-- Aditiva: solo crea un índice (la tabla tiene ~9,5 mil filas; el bloqueo de
-- CREATE INDEX es de milisegundos).
create index if not exists idx_product_costs_product_id
  on public.product_costs using btree (product_id);
