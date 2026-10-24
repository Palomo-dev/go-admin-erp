-- Esta migración borró cabeceras sin líneas y cerró fallos.
-- No restaura esos datos: los asientos vacíos no vuelven, ni se reabren
-- los fallos marcados importe_cero ni los resueltos por el reintento.
-- Revertir el esquema es el resto de los rollbacks de esta serie,
-- del más nuevo al más viejo.

select 1;
