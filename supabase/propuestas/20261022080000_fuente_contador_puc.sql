-- Superada por la migración aplicada 20261022033041_fuente_contador_backfill.
-- No correr este archivo: la única sentencia de abajo aborta a propósito.
-- Propuesta del catálogo PUC del contador. No aplicada.
-- La única sentencia ejecutable es el RAISE. El resto son comentarios,
-- para que un runner que parta el archivo no altere producción.
-- No hay INSERT, UPDATE ni CREATE OR REPLACE. No se tocan asientos,
-- chart_of_accounts, categorías de tesorería ni fn_cierre_ejercicio.
-- La plantilla y las 41 reglas viven en src/lib/finanzas/contador/.
-- 6155 contra 6170 y la contribución parafiscal del turismo siguen sin código.

do $propuesta$
begin
  raise exception 'propuesta_no_aplicada';
end
$propuesta$;

-- Campo que la hoja pide y chart_of_accounts todavía no tiene.
-- Alter table public.chart_of_accounts add column if not exists concepto_exogena text;
-- Comment on column public.chart_of_accounts.concepto_exogena is
--   'Concepto de información exógena DIAN. Lo asigna el contador. Opcional.';

-- Reclasificación histórica: comprobante tipo RC, en período abierto,
-- referenciando el asiento original. No se actualizan journal_lines
-- y no se tocan períodos ya declarados.
-- 4105 (agricultura) no se renombra: el comercio de la plantilla pasa a 4135.
-- 6105 conserva el nombre Agricultura, ganadería, caza y silvicultura.
-- El costo de ese comercio es 6135. 2105 no es proveedores: proveedores es 2205.
-- 2405 no existe: el IVA por pagar es 2408. 2404 es renta.
-- 1405 sigue siendo materias primas. La mercancía es 1435.
-- 1405-01 no es un código: el auxiliar es 14350501 y la sede es centro de costo.

-- Cierre que pide la hoja, distinto del que ya está en producción:
-- cancelar solo las clases 4, 5 y 6 contra 5905; la clase 7 no entra;
-- utilidad al crédito de 3605; pérdida al débito de 3610.
-- No se reemplaza fn_cierre_ejercicio en este archivo.
-- El grupo 36, padre de 3610, sigue en la propuesta de la fase 6 y tampoco se inserta aquí.

-- No se siembran filas en categorias_tesoreria.
-- Seguridad social: causación en una subcuenta de 5105 que Juan confirme, y pago por separado al débito de 2370.
-- Nómina: causación al débito de 5105 y crédito de 2505; el pago, débito de 2505, va aparte.
