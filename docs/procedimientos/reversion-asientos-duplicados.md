# Procedimiento: reversión histórica de asientos de venta

**Estado:** vigente desde el 2026-09-23 (lote `cierre-contable-2026-09-23`).
**Reemplaza** el reset con `DELETE` de 2026-09 y el anexo F-48 «no aprobado»
(ver *Antecedentes* al final). Un asiento publicado **no se borra ni se
modifica**: se neutraliza con un contra-asiento.

- Infraestructura: migración `20260923083206_reversion_historica_infraestructura`.
- Decisión: `docs/decisiones/ADR-CC-007-reversion-historica.md`.
- Bitácoras: `journal_reversals` (un registro por asiento revertido) y
  `journal_reversal_runs` (un registro por organización y corrida, con el cuadre
  antes y después).

## 1. Qué se corrige

Sobre los **devengos de venta** vivos de cada organización —asientos
`source='invoice_sales'` con memo `Venta…` y `source='sales'` con memo
`Venta POS…`, que no tengan ya un `reversal:{id}`—:

| Categoría | Criterio | Acción |
|---|---|---|
| **F-48** | devengo `sales` cuya factura tiene su propio devengo `invoice_sales` | contra-asiento; se conserva el de la factura |
| **F-49** | devengo de una factura que sigue en `draft` | contra-asiento; al emitirse, `fn_auto_journal_sale` la contabiliza con `…:reemision:n` |
| **F-45** | devengo canónico con la cuenta de impuesto al **débito** | contra-asiento + devengo corregido |
| **CC-001** | devengo canónico contra Caja (débito ≠ cuenta por cobrar) cuyo hecho además tiene cobro contabilizado | contra-asiento + devengo corregido |

**Excluidos**, auditados aparte:

- **huérfanos**: devengos `sales` cuya venta ya no existe (36);
- **anulados**: devengos de facturas o ventas en `void`. Su anulación ya generó
  un asiento propio; revertir uno solo de los dos rompería el par.
- **compras**: las líneas de `2405` al débito de `invoice_purchase` son correctas.

## 2. Reglas del contra-asiento

1. Copia **las líneas persistidas** del original, todas, con débito y crédito
   intercambiados (`fn_revertir_asiento`). Nunca la fórmula vigente: los 160
   devengos `sales` anteriores a F-45 tienen el IVA al débito, y su
   contra-asiento lo pone al crédito por el mismo importe. Si se regenerara con
   la fórmula nueva, quedaría residuo en 2405.
2. Misma organización, sucursal, fecha contable (`entry_date` del original: los
   periodos están todos abiertos), moneda y centro de costo.
3. Rastreable: `source='reversal'`, `source_id` = id del original, memo
   `REVERSION <categoría> | <lote> | asiento <id> | <memo original>`,
   `fact_key = 'reversal:{id}'` (único por organización: no se puede revertir
   dos veces).
4. Validado en el acto: original + contra-asiento = 0 por cuenta, y el
   contra-asiento cuadra (D = C). Si no, la función lanza una excepción.
5. El **devengo corregido** (F-45, CC-001) usa `fn_regla_devengo_venta` y los
   importes **del documento** (factura; si no hay, la venta), con la fecha del
   original y `fact_key = accrual:{sale|invoice}:{id}:correccion:<lote>`.

## 3. SQL

### Simulación (no escribe asientos)

```sql
SELECT o AS org, r->'conteos' AS conteos, r->'antes' AS antes
FROM (SELECT DISTINCT organization_id o FROM journal_entries
      WHERE source IN ('sales','invoice_sales')) orgs,
LATERAL fn_reversion_historica_org(o, 'simulacion-<fecha>', false) r
ORDER BY o;
```

### Ejecución, una organización por llamada

```sql
SELECT fn_reversion_historica_org(<org>, 'cierre-contable-<fecha>', true);
```

Cada llamada es **una transacción**: todos los contra-asientos y devengos
corregidos de esa organización entran juntos o no entra ninguno. Al final
comprueba que el balance de prueba de la organización cuadre (D = C); si no,
lanza una excepción y la organización queda exactamente como estaba.

### Verificación posterior

```sql
-- Balance de prueba por organización: debe cuadrar.
SELECT je.organization_id, sum(jl.debit) d, sum(jl.credit) c
FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id
GROUP BY 1 HAVING sum(jl.debit) <> sum(jl.credit);          -- 0 filas

-- Cada contra-asiento neutraliza su original, cuenta por cuenta.
SELECT r.original_entry_id, jl.account_code
FROM journal_reversals r
JOIN journal_lines jl ON jl.journal_entry_id IN (r.original_entry_id, r.reversal_entry_id)
GROUP BY 1, 2 HAVING sum(jl.debit) <> sum(jl.credit);       -- 0 filas

-- Ningún hecho de venta con más de un devengo vivo.
WITH vivos AS (
  SELECT je.organization_id, coalesce(i.sale_id::text, je.source_id) hecho
  FROM journal_entries je
  LEFT JOIN invoice_sales i ON je.source = 'invoice_sales' AND i.id::text = je.source_id
  WHERE (je.memo ILIKE 'Venta%' OR je.memo ILIKE 'CORRECCION%')
    AND je.source IN ('sales', 'invoice_sales')
    AND NOT EXISTS (SELECT 1 FROM journal_entries r
                    WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id))
SELECT organization_id, hecho, count(*) FROM vivos GROUP BY 1, 2 HAVING count(*) > 1;

-- Cuadre libro ↔ documentos por organización (cxc, IVA, ingreso).
SELECT organization_id, resultado->'antes', resultado->'despues'
FROM journal_reversal_runs WHERE lote = 'cierre-contable-<fecha>' AND ejecutado;
```

## 4. Rollback

**Durante** la corrida: automático, por organización (la transacción se deshace
si el balance no cuadra o si cualquier contra-asiento no neutraliza su original).

**Después** de una corrida confirmada: no se borra nada. Se revierten, con la
misma función, el contra-asiento y el devengo corregido de cada fila de la
bitácora:

```sql
SELECT fn_revertir_asiento(r.reversal_entry_id, r.categoria, 'rollback-<lote>'),
       CASE WHEN r.repost_entry_id IS NOT NULL
            THEN fn_revertir_asiento(r.repost_entry_id, r.categoria, 'rollback-<lote>') END
FROM journal_reversals r
WHERE r.lote = '<lote>' AND r.organization_id = <org>;
```

El original vuelve a quedar vivo en saldos. Los disparadores que miran
`reversal:{id}` (emisión de borradores, anulación) lo seguirán viendo revertido:
si se hace este rollback, revisar esas facturas a mano.

## Antecedentes

- **2026-09 (opción b, reset de desarrollo):** se aprobó borrar `journal_lines`
  y `journal_entries` de organizaciones de desarrollo y re-derivarlos. Queda sin
  efecto: viola la regla de que un asiento publicado no se borra, y las
  organizaciones afectadas tienen hoy datos operativos.
- **Anexo F-48 (2026-09-21):** fijó las guardas que este procedimiento cumple
  (invertir líneas persistidas, no recalcular, excluir los 36 huérfanos,
  validar por cuenta, simulación previa). Medía 2.042 facturas; al 23-sep son
  2.310 asientos `sales` duplicados en 16 organizaciones.
