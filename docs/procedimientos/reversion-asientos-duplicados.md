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
