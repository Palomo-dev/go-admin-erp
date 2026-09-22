-- Reversión de 20260916010000_pos_terminals.sql
-- Elimina las dos tablas y todo lo que cuelga de ellas (políticas, índices,
-- triggers). Segura: son nuevas y ninguna otra tabla las referencia.

drop table if exists public.pos_terminal_secrets cascade;
drop table if exists public.pos_terminals cascade;
