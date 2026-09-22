# Procedimiento: Reversión de asientos duplicados

**Estado:** Aprobado (opción b — resetear contabilidad de desarrollo)
**Alcance:** Organizaciones de desarrollo cuyos libros contables tienen
asientos duplicados por el bug F-01 (trigger CxC + trigger factura
publicando el mismo hecho dos veces).

## Contexto

El bug F-01 causó que cada factura de venta generara dos asientos
contables: uno desde `trg_auto_journal_sale_pos` (al cambiar
`sales.status` a `paid`) y otro desde `trg_create_account_receivable`
(al insertar la `invoice_sales`). El trigger de CxC fue deshabilitado
en Fase 0, pero los asientos duplicados ya publicados siguen en los
libros.

Las organizaciones afectadas no están operando en producción. Los
datos son de desarrollo. Por eso se optó por la opción (b): resetear
la contabilidad y re-derivarla desde las facturas.

## Cifras del conjunto duplicado

- 1.363 facturas con asientos duplicados.
- COP 239.217.909,65 en monto total duplicado.
- 13 organizaciones afectadas.
- F-29: 612 facturas y COP 42.991.275,03 mal clasificadas en cuenta
  1305 en vez de 1105.
- F-32: 70 facturas excluidas (asientos divergentes por race
  condition). El conjunto limpio es 1.293 facturas, COP 229.961.073,43.

## Paso 0 — Snapshot (antes de borrar)

Exportar `journal_entries` y `journal_lines` de las organizaciones
afectadas a un archivo fuera del repo:

```sql
COPY (
  SELECT je.*, json_agg(jl.*) as lines
  FROM journal_entries je
  LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
  WHERE je.organization_id IN (
    SELECT DISTINCT organization_id FROM journal_entries
    WHERE source IN ('sale','sales','invoice_sales')
  )
  GROUP BY je.id
) TO STDOUT WITH CSV HEADER;
```

Guardar el archivo en una ruta fuera del repo (ej. `~/audit-snapshots/`).

## Paso 1 — Identificar organizaciones a resetear

```sql
SELECT organization_id, count(*) as asientos_duplicados
FROM journal_entries
WHERE source IN ('sale','sales','invoice_sales','account_receivable')
GROUP BY organization_id
ORDER BY asientos_duplicados DESC;
```

Las organizaciones listadas son las de desarrollo. Si una organización
operativa aparece en esta lista, NO se resetea — se le aplica el
procedimiento de contraasientos del paquete del contador.

## Paso 2 — Borrar journal_entries y journal_lines

```sql
BEGIN;

-- Borrar líneas primero (FK)
DELETE FROM journal_lines
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries
  WHERE organization_id IN (<lista de orgs de desarrollo>)
);

-- Borrar asientos
DELETE FROM journal_entries
WHERE organization_id IN (<lista de orgs de desarrollo>);

COMMIT;
```

## Paso 3 — Re-derivar asientos desde facturas

Los triggers de la base de datos (`trg_auto_journal_sale_pos`,
`trg_auto_journal_invoice_sale`, `trg_auto_journal_payment`) generan
los asientos automáticamente. Para re-derivar:

1. Para cada `invoice_sales` con `status IN ('paid','partial')`:
   - Re-insertar un `sales` con `status='paid'` que dispare el
     trigger de POS, O
   - Llamar a la función de trigger directamente.

2. Para cada `payments` con `source='invoice_sales'`:
   - El trigger `trg_auto_journal_payment` se dispara en INSERT.
   - Re-insertar el pago (o llamar a la función directamente).

**Importante:** NO re-insertar las facturas — solo los asientos. Las
facturas, pagos y cuentas por cobrar ya existen. Solo los asientos
se borraron.

## Paso 4 — Verificar

```sql
-- Balance de comprobación cuadra
SELECT account_code, sum(debit) as debito, sum(credit) as credito
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.organization_id IN (<lista>)
GROUP BY account_code
ORDER BY account_code;
-- Verificar que débito = crédito por cuenta y en total.

-- No hay asientos duplicados
SELECT je.organization_id, je.source, je.source_id, count(*) as duplicados
FROM journal_entries je
WHERE je.organization_id IN (<lista>)
GROUP BY je.organization_id, je.source, je.source_id
HAVING count(*) > 1;
-- Debe retornar 0 filas.
```

## Paso 5 — Guardrails

Agregar a `src/__tests__/guardrails.test.ts`:
- Un asiento por (source, source_id) por organización.
- Balance de comprobación cuadra (suma de débitos = suma de créditos).
- `document_type` no es NULL en facturas.

## Cuándo usar este procedimiento

- **Hoy:** organizaciones de desarrollo con datos de prueba.
- **Futuro:** si un cliente operativo tiene el bug F-01, NO se
  resetea. Se le aplican contraasientos manuales (reversión del
  asiento duplicado) usando el paquete del contador como plantilla.
  El procedimiento de contraasientos es distinto a este: no borra,
  sino que inserta asientos de reversión con `source='reversal'`
  que anulan los duplicados.

## Anexo F-48 — contraasientos para POS + factura

**Estado:** documentado, no aprobado para ejecución.
**Bloque:** C. Requiere aprobación explícita antes de escribir o aplicar el SQL
de corrección.

F-48 no usa el reset descrito arriba. Afecta libros operativos y se corrige con
contraasientos publicados, sin borrar ni modificar los asientos originales.

### Conjunto medido

- 2.042 filas de `invoice_sales` con `sale_id` y asiento por las dos fuentes:
  `sales` e `invoice_sales`.
- 2.041 ventas distintas; una venta tiene más de una factura vinculada.
- 16 organizaciones.
- COP 85.763.018,29 de bruto duplicado.
- Se conservan los asientos `invoice_sales` y se contrarregistran los asientos
  `sales` correspondientes.
- Los 36 asientos `sales` huérfanos quedan fuera: pertenecen a ventas eliminadas
  y requieren auditoría separada.

### Regla obligatoria: invertir el asiento original, no recalcularlo

El contraasiento se construye exclusivamente desde las líneas persistidas del
asiento original:

- por cada débito original, insertar el mismo importe al crédito;
- por cada crédito original, insertar el mismo importe al débito;
- conservar cuenta, moneda, tasa, sucursal y organización del original;
- enlazar el contraasiento con el asiento revertido mediante una referencia
  auditable e idempotente;
- no invocar la fórmula contable vigente para reconstruir importes.

Esta regla es crítica porque 160 de los 2.042 asientos `sales` son anteriores a
F-45 y dejaron el IVA 2405 al **débito**. Su contraasiento debe poner exactamente
ese mismo importe al **crédito**. Si se genera desde la fórmula nueva —que pone
el IVA de ventas al crédito—, ambas líneas quedarían al crédito y se conservaría
un residuo en 2405.

En otras palabras, el procedimiento neutraliza lo que realmente se publicó,
incluidos sus errores históricos; no intenta generar hoy el asiento que habría
sido correcto en aquel momento.

### Guardas exigidas al futuro SQL

1. Seleccionar el asiento `sales` por `organization_id`, `source='sales'` y el
   `sale_id` vinculado desde `invoice_sales`.
2. Exigir que exista también el asiento canónico `invoice_sales` de esa misma
   factura y organización.
3. Excluir cualquier asiento ya revertido mediante una clave idempotente estable.
4. Copiar e invertir todas las filas de `journal_lines`; no asumir que siempre
   existen exactamente dos o tres líneas.
5. Validar por asiento que débito total = crédito total antes y después.
6. Validar por cuenta que original + contraasiento = cero, incluida 2405.
7. Ejecutar primero una simulación de solo lectura y entregar el paquete al
   contador.
8. No incluir los 36 huérfanos ni las filas que no pertenezcan al conjunto exacto
   de 2.042 facturas medido.

No se añade todavía SQL de mutación a este procedimiento. Ese artefacto pertenece
al Bloque C y solo se escribirá después de la aprobación explícita.
