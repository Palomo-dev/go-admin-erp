-- Revierte 20261107143000. Los presupuestos ya aprobados conservan su estado.
drop function if exists public.fn_presupuesto_aprobar(integer, uuid);
