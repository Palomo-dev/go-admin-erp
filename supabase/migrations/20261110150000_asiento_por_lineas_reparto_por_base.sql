-- Asiento por líneas: la base del documento se reparte entre las cuentas por la BASE ANTES DE IVA de cada línea.
-- Contador, ronda 6 (2026-11-10, docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md, «Hallazgo que hay que corregir
-- antes de usar el módulo»). Explicación: docs/contador/IVA-Y-PERFIL-RONDA-6-2026-11-10.md (sección 1).
-- ESCRITA, NO APLICADA. Se aplica por el MCP cuando el dueño lo ordene. No depende de las migraciones de IVA sin aplicar
-- (20261108140000 a 20261108165000): funciona igual con ellas o sin ellas, porque el texto que cambia no lo tocan.
-- Reversión: supabase/rollbacks/20261110150000_asiento_por_lineas_reparto_por_base_rollback.sql
--
-- El hallazgo. fn_armar_asiento_documento (APLICADA desde 20261022020351 y 20261023043016, anterior a las rondas del
-- Contador) arma el asiento por líneas de compras, documentos soporte, ventas y notas con cuenta propia por línea. Reparte
-- la parte del documento que no es impuesto (v_neto = total − impuesto) entre las cuentas de las líneas en proporción al
-- TOTAL CON IVA de cada línea (invoice_items.total_line). Con tarifas distintas la base de cada cuenta se desvía, aunque el
-- total cuadre: en la prueba 23, fila 103 (bases 100.000 al 19 %, 200.000 al 19 % y 100.000 al 5 %), la línea del 5 %
-- recibe 90.909 y no 100.000. El reparto correcto es 100.000, 215.200 (200.000 + 15.200 de IVA no descontable) y
-- 119.000 (100.000 + 19.000).
--
-- La corrección. Una sola línea de la función cambia: el peso de cada línea deja de ser su total con IVA y pasa a ser
-- fn_asiento_peso_reparto_linea(línea, …), que devuelve:
--   · la BASE ANTES DE IVA de la línea, con la misma fórmula que el recálculo de totales y que fn_iva_base_linea:
--       cantidad × precio − descuento; si el precio incluye el impuesto, ÷ (1 + tarifa);
--   · más el impuesto de la línea SOLO cuando ese impuesto se queda en el neto del asiento:
--       – el documento no separa impuesto (v_neto >= v_total: regla sin «usar el impuesto del documento», documento sin
--         IVA, o compra con solo INC): el peso es base × (1 + tarifa), como antes;
--       – compras y documento soporte: el INC de la línea (tarifa del 8 % o código INC…) va al costo, así que pesa con su
--         INC; el IVA nunca pesa (va a la 2408 o, con 20261108152000, se suma aparte a la cuenta de SU línea).
--   · si la línea no trae cantidad ni precio (base 0) pero sí total, el total de la línea (lo de antes), para no dejar
--     sin peso una línea que sí tiene valor.
-- Redondeo: el algoritmo no cambia. Cada línea, salvo la última, recibe round(v_neto × peso / Σ pesos, 2); la ÚLTIMA
-- línea del documento en el orden del asiento (created_at, id) recibe v_neto − lo ya asignado. Así la suma de las bases
-- por cuenta es EXACTAMENTE la base del documento: los centavos de ajuste van a esa última línea. Al publicar,
-- fn_asiento_documento_por_lineas lleva cada línea a pesos y pone la diferencia en su propia línea de redondeo
-- (fn_linea_redondeo), como ya lo hacía; nunca la carga a otra cuenta.
--
-- Lo que NO hace: no reclasifica ni recontabiliza asientos históricos (ni UPDATE ni DELETE sobre journal_entries /
-- journal_lines). Conteo del 2026-11-10 en la base: 0 asientos de compras o documentos soporte (no hay ninguno) y 0
-- asientos de ventas armados por líneas con más de una cuenta (los 72 de invoice_sales son de cabecera): ningún asiento
-- quedó con el reparto viejo. El camino de la nota crédito con líneas explícitas (p_lineas, JSON con total_line) no
-- cambia: esas líneas no traen cantidad ni precio.
-- Prueba en seco (org 374, begin … rollback): docs/contador/pruebas/27_iva_ronda6_contador.sql (filas del reparto).

-- ── 1. Peso de una línea en el reparto de la base ───────────────────────────────
create or replace function public.fn_asiento_peso_reparto_linea(p_item public.invoice_items, p_con_impuesto boolean, p_inc_al_costo boolean)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case
           when x.base = 0 and coalesce(p_item.total_line, 0) <> 0 then abs(p_item.total_line)
           when coalesce(p_con_impuesto, false) or (coalesce(p_inc_al_costo, false) and x.es_inc)
             then abs(round(x.base * (1 + x.r), 2))
           else abs(x.base)
         end
    from (
      select t.r, t.es_inc,
             round(case when coalesce(p_item.tax_included, false) and t.r > 0
                        then (coalesce(p_item.qty, 0) * coalesce(p_item.unit_price, 0) - coalesce(p_item.discount_amount, 0)) / (1 + t.r)
                        else coalesce(p_item.qty, 0) * coalesce(p_item.unit_price, 0) - coalesce(p_item.discount_amount, 0) end, 2) as base
        from (select case when coalesce(p_item.tax_rate, 0) > 1 then p_item.tax_rate / 100
                          else greatest(coalesce(p_item.tax_rate, 0), 0) end as r,
                     (upper(coalesce(p_item.tax_code, '')) like 'INC%'
                      or abs((case when coalesce(p_item.tax_rate, 0) > 1 then p_item.tax_rate / 100
                                   else coalesce(p_item.tax_rate, 0) end) - 0.08) < 0.0005) as es_inc) t
    ) x;
$function$;

comment on function public.fn_asiento_peso_reparto_linea(public.invoice_items, boolean, boolean) is
  'Ronda 6 del Contador: peso de una línea al repartir la base del documento entre las cuentas del asiento por líneas. Base antes de IVA (cantidad × precio − descuento, ÷ (1 + tarifa) si el precio incluye el impuesto); con el impuesto de la línea solo si se queda en el neto (documento sin impuesto separado, o INC de compras que va al costo).';
revoke all on function public.fn_asiento_peso_reparto_linea(public.invoice_items, boolean, boolean) from public, anon;
grant execute on function public.fn_asiento_peso_reparto_linea(public.invoice_items, boolean, boolean) to authenticated, service_role;

-- ── 2. fn_armar_asiento_documento: el peso de cada línea ────────────────────────
create or replace function pg_temp.fn_reemplazo_verificado(p_def text, p_viejo text, p_nuevo text, p_etiqueta text)
returns text
language plpgsql
as $function$
declare
  v_veces integer := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
begin
  if v_veces <> 1 then
    raise exception '%: se esperaba 1 aparición del texto a reemplazar y hay %', p_etiqueta, v_veces;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$function$;

do $do$
declare
  v_firma constant regprocedure := 'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('reparto_base_antes_de_iva_20261110' in v_def) > 0 then
    raise notice 'fn_armar_asiento_documento ya reparte la base por la base antes de IVA';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$               abs(coalesce(ii.total_line, 0)) as monto,$v$,
$v$               -- reparto_base_antes_de_iva_20261110 (ronda 6 del Contador): pesa la base antes de IVA de la línea.
               public.fn_asiento_peso_reparto_linea(ii, v_neto >= v_total, p_tipo in ('compra', 'documento_soporte')) as monto,$v$,
    'fn_armar_asiento_documento/peso');

  execute v_def;
end;
$do$;

drop function if exists pg_temp.fn_reemplazo_verificado(text, text, text, text);
