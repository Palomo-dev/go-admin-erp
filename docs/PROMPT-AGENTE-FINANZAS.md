# Encargo: corrección del módulo Finanzas de Go Admin ERP

Eres un agente de código trabajando sobre el repositorio **go-admin-erp** (Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui + Supabase Postgres 15). El proyecto es un ERP multi-tenant y multi-sucursal para pymes colombianas, con 83 organizaciones en producción. Todo el código, comentarios, commits y UI van en **español de Colombia**.

Antes de escribir una línea, lee `CLAUDE.md` en la raíz y respétalo íntegro. Lo que sigue no lo reemplaza: lo aplica a un módulo concreto.

---

## 0. Contexto: de dónde sale este encargo

Se hizo una auditoría del módulo Finanzas (`src/app/app/finanzas/`, `src/components/finanzas/`, servicios en `src/lib/services/`) y del esquema Supabase del proyecto `jgmgphmzusbluqhuqihj`, cruzando el código con datos reales de producción. Salieron 27 hallazgos. Este documento contiene los que hay que corregir, con la evidencia que los sustenta y el arreglo propuesto.

**No tomes ningún hallazgo como verdad revelada.** Cada uno trae la consulta o el archivo que lo produjo. Verifícalo con el MCP de Supabase o leyendo el archivo antes de tocar nada — las cifras se midieron el 10 de septiembre de 2026 y pueden haber cambiado. Si un hallazgo no se reproduce, dilo y sáltalo; no fuerces un arreglo para un problema que ya no existe.

---

## 1. Reglas duras de este encargo

1. **La base de datos se toca SOLO por el MCP de Supabase** (`apply_migration`, `execute_sql`, `list_tables`, `get_advisors`). Proyecto `jgmgphmzusbluqhuqihj`. Cada migración deja su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`, en el mismo commit. Nunca credenciales dentro de un `.sql`: el repositorio es público.

2. **Migraciones aditivas y reversibles.** Prohibido en este encargo: `DROP COLUMN`, `DROP TABLE`, cambios de tipo, y `DELETE` sobre datos de clientes. Todo constraint nuevo entra `NOT VALID` y se valida en un paso posterior. Todo índice nuevo entra con `CREATE INDEX CONCURRENTLY`. Los triggers se `DISABLE` antes de considerar borrarlos, nunca al revés.

3. **Verifica el esquema antes de escribir cualquier query.** No asumas que una tabla o columna existe porque el código actual la usa. Hay precedentes de tablas referenciadas en código que nunca existieron.

4. **La organización sale de la sesión, nunca del body.** Todo route handler empieza por `getServerOrgContext()` o `withOrg`. Si el body trae una organización distinta: 403 y se registra.

5. **Nada de lógica de negocio duplicada.** Si ya existe un servicio que sabe hacer algo (`posService` crea ventas con impuestos y caja), se llama a ese servicio. Una segunda implementación diverge en semanas.

6. **Clientes Supabase:** `@/lib/supabase/config` solo navegador; `getServerUserClient()` (sesión con RLS) es el default en servidor; `getServiceClient()` (service role) solo donde esté justificado y con la organización ya validada.

7. **`git push` y abrir PRs requieren autorización explícita.** `git commit` local solo si se pide.

8. **Una fase por PR.** No mezcles fases. Cada PR debe poder revertirse solo.

---

## 2. Cómo quiero que trabajes

Trabaja **fase por fase, en orden**, y **detente al final de cada fase** para que yo revise antes de seguir. No arranques la Fase 1 hasta que apruebe la 0.

Para cada fase:

1. **Verifica** los hallazgos de la fase contra la base de datos y el código reales. Reporta qué se confirmó y qué no.
2. **Propón** el plan concreto (migraciones, archivos a tocar) y espera luz verde si el plan se desvía de lo escrito aquí.
3. **Implementa.**
4. **Verifica de nuevo** con las consultas de control de la sección 9.
5. **Reporta**: qué cambió, qué consultas corriste, qué números dieron antes y después, y qué quedó pendiente.

Usa las skills del proyecto: `nextjs-supabase-postgres` siempre; `database-migrations` al tocar el esquema; `security-review` en todo lo que toque autenticación, permisos, dinero o datos de otros tenants; `code-review-checklist` antes de cerrar cada fase.

Actualiza `PROGRESS.md` al final de cada fase **añadiendo, nunca reescribiendo**. Nunca escribas markdown con backticks desde una cadena entre comillas dobles de PowerShell (el backtick es carácter de escape y corrompe el archivo).

---

## FASE 0 — Detener la duplicación contable

**Es lo único urgente. Nada más empieza hasta que esto esté cerrado.**

### F-01 · Cada factura de venta se contabiliza dos veces (CRÍTICO)

**Mecanismo.** Al emitir una factura se disparan dos cadenas independientes que publican el mismo hecho económico:

- `trg_auto_journal_sale` sobre `invoice_sales` → `fn_auto_journal_sale` publica el asiento.
- `tr_create_account_receivable` sobre `invoice_sales` → crea la fila en `accounts_receivable` → `trg_auto_journal_ar` → `fn_auto_journal_ar` busca **la misma regla contable** (`source_type='sale'`, `event_type='created'`) y publica el mismo débito y el mismo crédito.

Resultado típico, la misma factura, dos asientos idénticos:

```
Asiento A · source='invoice_sales'        Asiento B · source='accounts_receivable'
  1305 Clientes    D 61.140,00              1305 Clientes    D 61.140,00
  4105 Ingresos    C 61.140,00              4105 Ingresos    C 61.140,00
```

El índice único `idx_journal_entries_unique_source` sobre `(source, source_id)` no lo impide porque los pares son distintos: uno apunta a la factura, el otro a la cuenta por cobrar. Ambos asientos quedan cuadrados y `posted = true`, así que ningún chequeo de partida doble los delata.

**Impacto medido (10-sep-2026).** De 1.393 facturas no borrador: **1.207 con los dos asientos**, 161 solo con el de cuenta por cobrar, 11 solo con el de factura, 14 sin ninguno. En las 12 organizaciones más afectadas suma **~$213.800.000 COP** de ingreso y cartera duplicados. El Estado de Resultados y el Balance General que ven los clientes muestran cerca del doble.

**Consulta para reproducirlo:**

```sql
WITH inv AS (
  SELECT i.id, i.organization_id, i.total,
    (SELECT je.id FROM journal_entries je
      WHERE je.source='invoice_sales' AND je.source_id=i.id::text) je_inv,
    (SELECT je.id FROM journal_entries je
      JOIN accounts_receivable ar ON ar.id::text=je.source_id
      WHERE je.source='accounts_receivable' AND ar.invoice_id=i.id LIMIT 1) je_ar
  FROM invoice_sales i WHERE i.status <> 'draft'
)
SELECT
  count(*) FILTER (WHERE je_inv IS NOT NULL AND je_ar IS NOT NULL) AS duplicadas,
  count(*) FILTER (WHERE je_inv IS NOT NULL AND je_ar IS NULL)     AS solo_factura,
  count(*) FILTER (WHERE je_inv IS NULL AND je_ar IS NOT NULL)     AS solo_cxc,
  count(*) FILTER (WHERE je_inv IS NULL AND je_ar IS NULL)         AS sin_asiento
FROM inv;
```

**Qué hacer, en este orden:**

1. **Detener la sangría** — un comando, reversible, sin migración de datos:
   ```sql
   ALTER TABLE accounts_receivable DISABLE TRIGGER trg_auto_journal_ar;
   ```
   La decisión de fondo: **la factura es la única fuente de verdad contable**. La cuenta por cobrar es el detalle de cartera, no un segundo hecho económico. Si al leer `fn_auto_journal_sale` concluyes que el trigger correcto a desactivar es el otro, argumenta por qué antes de cambiar de criterio.

2. **Backfill de las 175 facturas sin asiento de factura** (161 solo-CxC + 14 sin ninguno): publicar el asiento con `source='invoice_sales'` reusando la lógica de `fn_auto_journal_sale`. Hazlo en un script idempotente que verifique antes de insertar.

3. **Reversión de los 1.207 asientos sobrantes — NO los borres.** Genera contraasientos con `source='ajuste_dedup_ar'`, `source_id` = id del asiento revertido, memo trazable del estilo `'Reversión asiento duplicado #<id> - dedup CxC'`, fechados **hoy**, no en la fecha original. Razones: borrar asientos publicados rompe la trazabilidad, y hay 1.077 períodos fiscales definidos — reescribir el pasado puede descuadrar cierres.

   **Este paso NO lo ejecutes todavía.** Entrega el script y un reporte por organización (`organization_id`, nº de asientos, monto por cuenta) para que el contador valide el criterio. Solo entonces se corre.

### F-02 · Reglas contables ambiguas y con cuentas inexistentes (CRÍTICO)

La restricción actual es `accounting_rules_unique (organization_id, source_type, event_type, priority)`. Al incluir `priority` en la llave, **dos reglas activas para el mismo evento conviven legalmente**. Hay casos reales: la organización 2 tiene a la vez `D1305/C4105` y `D1105/C4105` para `sale/created` — una debita Clientes y la otra Caja. `fn_auto_journal_ar` desempata con `ORDER BY priority LIMIT 1`, sin criterio estable.

Además hay **8 reglas activas cuyo `debit_account_code` o `credit_account_code` no existe** en el `chart_of_accounts` de esa organización. Como `journal_lines` tiene FK `ON DELETE RESTRICT` contra `chart_of_accounts`, cuando esas reglas se disparan el asiento falla y **arrastra la transacción que lo originó** (la venta o el pago).

```sql
-- Reglas ambiguas
SELECT organization_id, source_type, event_type, count(*)
FROM accounting_rules WHERE is_active GROUP BY 1,2,3 HAVING count(*) > 1;

-- Reglas apuntando a cuentas inexistentes
SELECT r.* FROM accounting_rules r WHERE r.is_active AND (
  NOT EXISTS (SELECT 1 FROM chart_of_accounts c
    WHERE c.organization_id=r.organization_id AND c.account_code=r.debit_account_code)
  OR NOT EXISTS (SELECT 1 FROM chart_of_accounts c
    WHERE c.organization_id=r.organization_id AND c.account_code=r.credit_account_code));
```

**Qué hacer:** sanear primero (desactivar duplicadas conservando la de menor `priority`; corregir o desactivar las 8 huérfanas), después blindar:

```sql
CREATE UNIQUE INDEX CONCURRENTLY uk_accounting_rules_evento_activo
  ON accounting_rules (organization_id, source_type, event_type) WHERE is_active;

ALTER TABLE accounting_rules ADD CONSTRAINT fk_ar_debito
  FOREIGN KEY (organization_id, debit_account_code)
  REFERENCES chart_of_accounts (organization_id, account_code) NOT VALID;
-- ídem para credit_account_code
```

### F-10 · `credit_note_applications` tiene RLS sin políticas (ALTO)

`get_advisors(type='security')` la reporta como `rls_enabled_no_policy`. Con RLS activo y cero políticas, PostgreSQL niega todo al cliente: cualquier intento de aplicar una nota crédito o un saldo a favor desde el navegador falla en silencio. La tabla tiene 0 filas, lo que sugiere que el flujo de "saldos a favor" nunca ha funcionado en producción.

**Qué hacer:** añadir la política de organización estándar del proyecto, y hacer una prueba de humo del flujo completo: crear nota crédito → aplicarla a una factura → verificar que el saldo de la factura se recalcula. Reporta si el flujo funciona de punta a punta o si hay más piezas rotas detrás.

### F-03 · Los asientos de cartera se imputan a una sucursal arbitraria (ALTO)

`fn_auto_journal_ar` resuelve la sucursal así:

```sql
SELECT MIN(id) INTO v_default_branch FROM branches WHERE organization_id = NEW.organization_id;
```

Ignora el `branch_id` que la propia fila de `accounts_receivable` ya trae. En una organización multi-sucursal toda la contabilidad de cartera aterriza en la sucursal de menor `id`. Si se aplica F-01 esta función deja de publicar, pero **revisa el mismo patrón en las demás `fn_auto_journal_*`** (hay ~40) y reporta cuáles lo repiten. El arreglo es `COALESCE(NEW.branch_id, (SELECT branch_id FROM invoice_sales WHERE id = NEW.invoice_id), v_default_branch)`.

---

## FASE 1 — Seguridad

### F-08 · Aislamiento por sucursal aplicado a medias (CRÍTICO)

La política RESTRICTIVE `branch_access_restrictive` usando `app_branch_access(branch_id)` está bien construida, pero solo existe en **7** tablas de finanzas. Faltan **12 que sí tienen `branch_id`**:

| Con la política | Sin la política (tienen `branch_id`) |
|---|---|
| `accounts_receivable`, `accounts_payable`, `bank_transactions`, `bank_transfers`, `cash_movements`, `cash_counts`, `credit_notes` | `invoice_sales`, `invoice_purchase`, `payments`, `journal_entries`, `cash_sessions`, `bank_accounts`, `invoice_sequences`, `quotations`, `support_documents`, `commissions`, `payment_qr_sessions`, `branch_account_mappings` |

Un usuario limitado a la sucursal A ve y puede modificar facturas, pagos, asientos, cajas y cuentas bancarias de la sucursal B. Es además incoherente: la cartera está filtrada por sucursal pero la factura que la origina no.

```sql
CREATE POLICY branch_access_restrictive ON invoice_sales
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));
```

**Cuidado al desplegar.** Lee primero `app_branch_access` y determina qué devuelve para un usuario sin sucursal asignada o con acceso a todas. Si devuelve falso, esto deja gente fuera. Prueba tabla por tabla con `execute_sql` usando `as_level: 'interact'` contra una organización real antes de aplicar a las 12. Si alguna requiere criterio distinto (`invoice_sequences` es configuración, no transacción), argumenta y decide caso por caso.

### F-09 · Credenciales DIAN guardadas en claro (CRÍTICO)

`electronic_invoicing_config` tiene `client_secret text`, `password text` y `username text` sin cifrar, y su única política es `FOR ALL` a cualquier miembro de la organización. Cualquier empleado con acceso al ERP puede leer las credenciales de Factus/Carvajal de su empresa y emitir facturas electrónicas por fuera del sistema.

El patrón correcto ya existe en el proyecto: `integration_credentials`, cuyo comentario dice literalmente *"referencias a vault, nunca tokens en claro"*.

**Qué hacer:** columna `vault_secret_id` nueva → doble escritura durante una versión → migrar los valores existentes a Supabase Vault → vaciar (no dropear) las columnas en claro. Restringir además la política de escritura a rol administrador. Toca `src/lib/services/electronicInvoicingConfigService.ts` y `factusService.ts`.

### F-11 · Funciones `SECURITY DEFINER` ejecutables por `anon` (ALTO)

`get_advisors(type='security')` reporta **326 funciones invocables por `anon`** vía `/rest/v1/rpc/`; **127 son del dominio financiero**. La mayoría son funciones de trigger que fallarían sin contexto `TG_*`, pero hay un grupo con parámetros que sí es explotable:

- `fn_apply_customer_credit(p_credit_id, p_invoice_id, p_amount, p_created_by)`
- `create_account_receivable(p_organization_id, p_customer_id, p_invoice_id, p_amount, ...)`
- `fn_create_default_chart_of_accounts(org_id, country_code)`
- `confirm_purchase_invoice(invoice_id_param)`
- `delete_organization_tax(p_tax_id, p_organization_id)`
- `daily_update_overdue_accounts()`

Al ser `SECURITY DEFINER` se ejecutan con privilegios del propietario **saltándose RLS**, y reciben el `organization_id` como parámetro sin validarlo contra la sesión. Es la regla dura 4 rota a nivel de base de datos.

**Qué hacer, por lotes:**

1. Funciones de trigger (sin riesgo de regresión, nadie las llama como RPC):
   ```sql
   REVOKE EXECUTE ON FUNCTION public.fn_auto_journal_ar() FROM anon, authenticated;
   ```
   Antes de cada `REVOKE`, confirma con `grep -r "rpc('<nombre>'" src/` que nadie la invoca desde el cliente.

2. Las que sí se llaman como RPC: añadir validación interna antes de tocar `EXECUTE`:
   ```sql
   IF p_organization_id <> (SELECT organization_id FROM organization_members
                            WHERE user_id = auth.uid() AND is_active LIMIT 1)
   THEN RAISE EXCEPTION 'organización no autorizada'; END IF;
   ```

3. Relacionado: **433 funciones tienen `search_path` mutable**. Añadir `SET search_path = public, pg_temp` es una línea por función y cierra un vector clásico de escalada en `SECURITY DEFINER`. Empieza por las del dominio financiero.

### F-12 · Políticas declaradas `TO public` en vez de `TO authenticated` (MEDIO)

Todas las políticas de finanzas aplican al rol `public`, que incluye `anon`. Hoy no filtran datos porque `auth.uid()` es `NULL` y la subconsulta no devuelve nada, pero basta una política futura que no dependa de `auth.uid()` para abrir la puerta. Acotarlas a `TO authenticated` no tiene impacto funcional.

---

## FASE 2 — Integridad de datos

### F-04 · El número de factura no es único, y ya hay repetidos (CRÍTICO)

No existe restricción sobre `(organization_id, number)`. En producción:

| Organización | Número | Repeticiones |
|---|---|---|
| 134 | `FACT-0039` | **4** |
| 134 | `FACT-0041` | 2 |
| 134 | `FACT-0042` | 2 |
| 134 | `FACT-0043` | 2 |
| 115 | `FACT-25357` | 2 |
| 2 | `NC-0001` | 2 |

**Causa raíz en el código:** la numeración se genera con `SELECT number ... ORDER BY created_at DESC LIMIT 1` + `parseInt + 1` **desde el navegador**. Está en `src/lib/services/cotizacionesService.ts:66-90` (`generateQuotationNumber`, prefijo `COT-`) y **copiada en línea otra vez** en `:349-362` dentro de `convertToInvoice` (prefijo `FACT-`). Dos usuarios facturando a la vez leen el mismo último número. Para facturación electrónica DIAN, un consecutivo repetido es rechazo garantizado.

**Nota importante:** la tabla `invoice_sequences` **ya existe** con `prefix`, `range_start`, `range_end`, `current_number`, `resolution_number` y unique `(organization_id, branch_id, document_type, prefix)`. La numeración correcta ya está modelada; simplemente no se usa en este camino.

**Qué hacer:**
1. Resolver los 6 duplicados existentes (renumerar las copias, no borrar facturas).
2. RPC `fn_next_invoice_number(p_org, p_branch, p_document_type)` que consuma `invoice_sequences` con `UPDATE ... SET current_number = current_number + 1 RETURNING` — atómico — y valide que no exceda `range_end`.
3. Usarla desde POS, facturas de venta y conversión de cotización. Una sola implementación (regla dura 6).
4. Blindar:
   ```sql
   CREATE UNIQUE INDEX CONCURRENTLY uk_invoice_sales_org_numero
     ON invoice_sales (organization_id, number) WHERE status <> 'void';
   ```

### F-05 · Estado y saldo de la factura se contradicen (ALTO)

Sin máquina de estados en base de datos, el estado lo escribe quien toque la fila:

| Inconsistencia | Filas | Significado |
|---|---|---|
| `status='paid'` con `balance > 0` | 20 | Cartera cobrada que sigue debiendo |
| `status` en (`issued`,`partial`) con `balance = 0` | 46 | Cobrada pero visible como pendiente |
| `balance > total` | 24 | Saldo imposible |
| Pagos con `source='invoice_sales'` apuntando a facturas inexistentes | 7 | `source_id` polimórfico sin FK |

**Qué hacer:** sanear las 90 filas, luego:

```sql
ALTER TABLE invoice_sales ADD CONSTRAINT chk_saldo_coherente
  CHECK (balance >= 0 AND balance <= total) NOT VALID;
ALTER TABLE invoice_sales ADD CONSTRAINT chk_pagada_sin_saldo
  CHECK (status <> 'paid' OR balance = 0) NOT VALID;
```

Y **derivar `status` dentro de `fn_recalc_invoice_balance_from_payments`**, no escribirlo desde el cliente. Validar los constraints en un paso posterior con `VALIDATE CONSTRAINT`.

### F-06 · Vocabulario polimórfico sin normalizar (ALTO)

```
payments.source        : invoice_sales(850) · web_order(517) · sale(64) ·
                         account_receivable(32) · pms(15) · account_payable(5) ·
                         invoice_purchase(4) · folio(2) · parking_session(1)
journal_entries.source : accounts_receivable(1437) · stock_movements(1351) ·
                         invoice_sales(1295) · sales(906) · payments(774) · ... · sale(1)
```

Conviven `sale` y `sales`, `account_payable` y `accounts_payable`. Pagar una factura puede quedar como `source='invoice_sales'` o como `source='account_receivable'`. Cualquier reporte que agrupe por origen cuenta mal según el camino que usó el usuario.

**Qué hacer:** tabla catálogo `source_types(code, entity_table, descripcion)` con FK desde ambas columnas. Migración aditiva: primero el catálogo **con todos los valores actuales incluidos** (para que el FK no falle), luego el `UPDATE` de normalización, luego retirar los alias del catálogo.

### F-07 · Tablas sin FK y columnas heredadas vivas (MEDIO)

- **`support_documents` no tiene ni una sola FK** — solo la PK. Ni a `organizations`, ni a `suppliers`, ni a `branches`, ni a `invoice_purchase`. Es la tabla del Documento Soporte DIAN.
- **`invoice_items.invoice_id`** (heredada, sin FK) está poblada en 2.482 filas conviviendo con `invoice_sales_id`/`invoice_purchase_id`. Hoy nunca divergen — verificado — pero nada lo impide. Márcala obsoleta con `COMMENT ON COLUMN` y deja de escribirla. **No la dropees**: espera a que no quede código que la lea.
- **Doble identidad**: `bank_transactions`, `cash_sessions` y `cash_movements` tienen `id integer` como PK más una columna `uuid` con índice único. Decide cuál es la llave pública y documéntalo.
- Sin unicidad en `(bank_account_id, import_id)`: reimportar un extracto bancario duplica movimientos.

---

## FASE 3 — Mover el dinero al servidor

Aquí se aplica la convención del proyecto que hoy se incumple: *"Servicios en `src/lib/services/`, uno por dominio. Los que tocan varias tablas lo hacen en una RPC transaccional, no en N llamadas desde Node."*

### F-16 · Registrar un pago son tres escrituras sueltas (CRÍTICO)

`src/components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx:183-248`:

```ts
// 183  await supabase.from('payments').insert({...})
// 204  const nuevoSaldo = factura.balance - montoNumerico;   // ← del estado React
// 213  await supabase.from('invoice_sales').update({ balance: nuevoSaldo, status: nuevoEstado })
//        .eq('id', facturaIdString);                          // ← sin organization_id
// 233  await supabase.rpc('create_account_receivable', {...})
// 238  if (createARError) { console.error(...); /* No interrumpimos el flujo principal */ }
```

Tres problemas encadenados: **sin transacción** (si falla el paso 2 queda un pago cobrado que la factura no refleja), **sin bloqueo optimista** (el `UPDATE` no lleva `.eq('balance', factura.balance)`, así que dos cajeros simultáneos producen un *lost update* y la cartera se descuadra), y **sin filtro de organización**.

**Qué hacer:** RPC `register_invoice_payment(p_invoice_id, p_amount, p_method, p_reference, p_payment_date)` que en una sola transacción:
- valide organización y sucursal contra `auth.uid()`
- inserte el pago
- haga `UPDATE invoice_sales SET balance = balance - p_amount WHERE id = ... AND organization_id = ...` — **atómico, sin lectura previa**
- valide que el resultado no quede negativo
- derive `status`
- sincronice `accounts_receivable`

El diálogo pasa a ser una llamada. Aritmética en `numeric`, nunca en JS.

### F-17 · El mismo patrón en tres flujos más (CRÍTICO)

- **`src/lib/services/transferenciasService.ts:171-234`** — el `insert` de la transferencia y la actualización de los dos saldos son pasos separados. El *fallback* hace `select` del saldo y luego `update` con el valor calculado en JS (condición de carrera), y sus errores mueren dentro de un `.then()` anidado sin propagarse. → RPC `execute_bank_transfer`.
- **`src/lib/services/cotizacionesService.ts:337-428`** — cinco escrituras secuenciales. Si falla `invoice_items` queda una factura sin ítems; si falla `changeStatus`, la cotización sigue convertible y se puede facturar dos veces. → RPC `convert_quotation_to_invoice` (integra F-04).
- **`src/lib/services/notasCreditoService.ts:269-317`** — se anula la nota, luego se lee el saldo de la factura original, se suma en JS y se reescribe. **El resultado de ese último `update` ni siquiera se comprueba.** → RPC `void_credit_note`.

En las tres, sustituir el patrón leer-sumar-escribir por `UPDATE ... SET x = x ± :monto` dentro de la transacción.

### F-18 · Consultas sin filtro de organización (ALTO)

Se apoyan solo en RLS, sin segunda línea de defensa:

- `src/components/finanzas/contabilidad/ContabilidadService.ts` — `obtenerAsiento` (:219-224), `publicarAsiento` (:341-345), `eliminarAsiento` (:353-358) filtran solo por `.eq('id', id)`. Como `journal_entries.id` es entero secuencial, es trivialmente enumerable.
- `src/lib/services/cotizacionesService.ts` — `getQuotationById` (:144-163), `updateQuotation` (:226-259), `changeStatus` (:261-275), `deleteQuotation` (:430-438).
- `src/lib/services/electronicInvoicingService.ts` — `getInvoiceEInvoiceStatus` (:98-114), `retryJob` (:186-224), `cancelJob` (:229-266), `validateInvoiceForEInvoicing`. Inconsistente incluso dentro del archivo: `getStats` (:359-371) **sí** recibe y aplica `organizationId`.

**Qué hacer:** encadenar `.eq('organization_id', ...)` en todas, y extraer el `getOrganizationId()` que hoy se reimplementa como método privado en cada clase (`ContabilidadService.ts:52-59`, `ReportesContablesService.ts:65-68`, `cuentas-por-cobrar/service.ts:27-30`) a **una única utilidad compartida** — así un servicio nuevo no puede olvidarse de tenerla. Nota que `cotizacionesService.ts` no la tiene en absoluto.

### F-19 · Los reportes contables se calculan en el navegador (ALTO)

`src/components/finanzas/contabilidad/ReportesContablesService.ts` (:126-139, :150-162, :221-234, :316-328, :415-427, :438-453) trae **todas** las `journal_lines` del período sin `.range()` y las agrega con un `Map` y `parseFloat` en el cliente. Lo mismo en los seis métodos de `src/lib/services/reportesFinancierosService.ts`.

Dos consecuencias: no escala (dos años de contabilidad son cientos de miles de filas por la red), y **el dinero se suma en punto flotante** — `parseFloat(line.debit)` acumulado sobre miles de líneas produce descuadres de centavos visibles en un balance de comprobación.

**Qué hacer:** funciones SQL con `GROUP BY account_code` y `SUM(debit), SUM(credit)` sobre `numeric`, devolviendo solo los totales por cuenta. Cubre balance de comprobación, balance general, estado de resultados, mayor contable, P&G, flujo de caja, cartera, impuestos y bancos. **Despliega antes los índices de F-13.**

### Tests de regresión

Añade a `src/__tests__/guardrails.test.ts` (el archivo que impide reincidir en bugs ya corregidos):

- exactamente un asiento contable por factura emitida
- `balance` nunca mayor que `total`, nunca negativo
- número de factura único por organización
- registrar dos pagos concurrentes sobre la misma factura no descuadra el saldo

---

## FASE 4 — Rendimiento y consistencia de UI

### F-13 · 62 FK de finanzas sin índice de cobertura (ALTO)

Reportado por `get_advisors(type='performance')`. Las que están en el camino crítico:

| Índice ausente | Pantalla que lo sufre |
|---|---|
| `journal_lines (organization_id, account_code)` | Mayor contable, balance de comprobación, balance general |
| `journal_entries (organization_id, entry_date)` | Todos los reportes contables por período |
| `invoice_purchase (organization_id)`, `(supplier_id)`, `(branch_id)` | Listado de facturas de compra — **la tabla solo tiene la PK** |
| `bank_transactions (bank_account_id)`, `(organization_id)`, `(trans_date)` | Conciliación bancaria |
| `bank_accounts (organization_id)`, `(branch_id)` | Tesorería — **la tabla solo tiene la PK** |
| `payments (source, source_id)`, `(payment_date)` | Historial de pagos de una factura |
| `cash_movements (cash_session_id)`, `(organization_id)` | Cierre de caja del POS |
| `accounts_payable (invoice_id)`, `(due_date, status)` | Cuentas por pagar y aging |

Todos con `CREATE INDEX CONCURRENTLY` (no bloquea escrituras).

### F-14 · 86 políticas re-evalúan `auth.uid()` por fila (MEDIO)

`organization_id IN (SELECT ... WHERE user_id = auth.uid())` llama a `auth.uid()` una vez por fila examinada. Envolverlo en `(select auth.uid())` lo convierte en un *InitPlan* evaluado una sola vez. Cambio puramente sintáctico, orden de magnitud en listados grandes.

Además: **194 avisos de `multiple_permissive_policies`** en finanzas. El patrón `*_select_policy` + `*_insert_update_delete_policy FOR ALL` hace que en cada `SELECT` se evalúen dos políticas con la misma condición. Consolidar en una sola `FOR ALL` por tabla.

### F-15 · Índices idénticos duplicados (MEDIO)

- `accounts_receivable`: `idx_accounts_receivable_customer` y `idx_accounts_receivable_customer_id`
- `electronic_invoicing_jobs`: `idx_ei_jobs_org` / `idx_electronic_invoicing_jobs_org`, y el par equivalente para `status`

Tres `DROP INDEX CONCURRENTLY` sin riesgo. (Hay 90 índices de finanzas marcados como no usados, pero con el volumen actual ese dato aún no es concluyente — no los toques.)

### F-23 · Las tablas descargan todo el histórico y paginan en memoria (ALTO)

`FacturasTable.tsx:274-306` trae todas las facturas de la organización sin `.range()` y recorta el arreglo en el cliente (`getCurrentPageItems`, :179-260). `AsientosPage.tsx:60-74` hace lo mismo y además busca y filtra en memoria (:187-195). **Ninguna de las tres tablas principales permite ordenar por columna** — en un listado financiero eso significa que no se puede ver la factura de mayor saldo ni la más vencida.

El patrón correcto ya existe: `CuentasPorCobrarService.obtenerCuentasPorCobrarPaginadas` pagina en servidor.

**Qué hacer:** hook `useTablaFinanzas` que encapsule paginación por `.range()`, ordenamiento por columna y filtros en servidor, compartido por las tres tablas.

### F-25 · Inconsistencias visuales dentro del mismo módulo (ALTO)

- **La misma factura, dos colores de estado.** `FacturasTable.tsx:76-88` pinta `'partial'` en morado e `'issued'` en azul; `DetalleFactura.tsx:288-297` mapea `'partial'` a `variant="warning"` e `'issued'` a `variant="outline"`.
- **Dos sistemas de toast.** `use-toast` en facturas (`NuevaFacturaForm.tsx:12`, `RegistrarPagoDialog.tsx:25`) y `sonner` en cuentas por cobrar y asientos (`CuentasPorCobrarPage.tsx:16`, `AsientosPage.tsx:6`).
- **Cuatro copias locales de `formatCurrency`** en `BalanceGeneralPage.tsx:13-16`, `BalanceComprobacionPage.tsx:21-24`, `EstadoResultadosPage.tsx:13-16`, `MayorContablePage.tsx:15-18` — todas sin símbolo de moneda, mientras el resto del módulo usa el util compartido con símbolo. En un Balance General no queda claro si la cifra es COP.
- **Confirmaciones desiguales.** `AsientosPage.tsx:179` borra un asiento contable con `confirm()` nativo sin decir cuál; emitir una factura usa `AlertDialog` con título y descripción (`DetalleFactura.tsx:729-757`).

**Qué hacer:** crear `src/components/finanzas/shared/` con `EstadoBadge`, `MontoMoneda`, un wrapper único de toast y `ConfirmarAccion`. Refactor mecánico, sin cambio de comportamiento.

### F-24 · Los reportes contables no tienen estado de error (ALTO)

`BalanceGeneralPage.tsx:51-52`, `BalanceComprobacionPage.tsx:44-45`, `EstadoResultadosPage.tsx:54-55`: el `catch` de `loadData` es solo `console.error`. Si la consulta falla, el esqueleto desaparece y queda una página vacía — que en un Balance General se lee como *"la empresa no tiene movimientos"*. Combinado con F-20, el usuario recibe un estado financiero en ceros presentado como dato válido.

Reutiliza el patrón de error con reintento de `FacturasTable.tsx:414-439`, pero llamando a `cargarDatos()` en vez de `window.location.reload()` (:432), como hace hoy.

---

## FASE 5 — Deuda de arquitectura (continuo, sin prisa)

- **F-22** · `NuevaFacturaForm.tsx` tiene **1.526 líneas y 32 `useState`**, y su `handleSaveInvoice` (:547-999) son ~450 líneas que contienen creación de `sale`, creación de `invoice_sales`, evaluación de promociones (:604), cálculo de comisión (~:910-946), verificación de stock por RPC (:951-964) y envío a DIAN/Factus (:968-985). Sin servicio intermedio — reimplementa lo que `posService` ya sabe hacer (regla dura 6). Extraer a `facturasVentaService` + RPC transaccional.
- **F-21** · Tres convenciones de ubicación para servicios del mismo módulo: `src/lib/services/cotizacionesService.ts` (la documentada), `src/components/finanzas/contabilidad/ContabilidadService.ts` (colocado, PascalCase), `src/components/finanzas/cuentas-por-cobrar/service.ts` (colocado, minúscula). Y submódulos sin servicio: facturas de venta, bancos, conciliación bancaria consultan Supabase directo desde los componentes. Unificar.
- **F-21b** · Dos definiciones de "cartera vencida": `reportesFinancierosService.ts:218-220` compara contra `new Date()` con hora exacta; `cuentas-por-cobrar/service.ts:181-210` usa `parseLocalDate` con tramos de 30/60/90. El mismo día dan cifras distintas en dos pantallas.
- **F-20** · Errores convertidos en ceros: los seis métodos de `reportesFinancierosService.ts` hacen `catch → console.error → return this.getEmptyPnL()` (:126-129, :179-182, :233-236, :282-285, :344-347, :398-401). En un dashboard financiero, cero es un valor legítimo — nadie distingue "no hubo ventas" de "falló la consulta". Propagar el error.
- **F-26** · Formularios: **no hay `react-hook-form` ni `zod` en todo el módulo**. Toda la validación son cadenas de `if` con `useState`. En `NuevaFacturaForm` las seis validaciones (:548-591) solo lanzan un toast global: ningún campo se marca, no hay foco automático. Además:
  - Cinco `<Label htmlFor>` apuntan a ids inexistentes: `issue-date` (:1059), `due-date` (:1077), `currency` (:1087), `payment-terms` (:1219), `salesperson` (:1385).
  - Los cuatro filtros de fecha de los reportes contables no tienen `htmlFor` ni `id`.
  - `RegistrarPagoDialog.tsx:415` — el botón no incluye `fechaError` en `disabled`, solo `montoExcedido`, aunque el campo ya esté en rojo (:386-388).
  - `NuevaFacturaForm.tsx:995` — `JSON.stringify(error)` muestra `{}` para un `Error` normal: el usuario ve un error vacío tras perder una factura.
  - Sin borrador ni autoguardado: un formulario con ítems, seriales, impuestos y comisión se pierde entero ante una navegación accidental.
- **F-27** · `DetalleFactura.tsx:147-286` dispara cinco consultas independientes al montar sin `Promise.all` ni estado de carga combinado: el contenido salta. Y en móvil, cuentas por cobrar tiene vista de tarjetas (`CuentasPorCobrarTable.tsx:207`) pero facturas solo scroll horizontal (`FacturasTable.tsx:491`).
- **F-04b** · **Requiere criterio contable, no técnico.** Las reglas sembradas usan `tax_account_code = '2405'` y hay 384 líneas del mayor contra esa cuenta, pero **cero líneas contra `2408`**. En el PUC colombiano `2408` es "Impuesto sobre las ventas por pagar" y `2405` corresponde a impuesto de renta. Puede ser una decisión deliberada de plan simplificado. **No lo cambies por tu cuenta**: documenta el hallazgo, prepara el remapeo, y espera confirmación del contador.
- Accesibilidad: `scope="col"` en el `TableHead` del design system (0 coincidencias hoy en las tres tablas, con 12-27 `TableHead` por archivo), foco en modales, navegación por teclado.

---

## 9. Verificación

Al cerrar cada fase, además de:

```bash
npx jest
npx tsc --noEmit -p tsconfig.json
npx next build
```

corre estas tres consultas de control y reporta los números **antes y después**:

```sql
-- 1) Asientos por factura: debe ser exactamente 1
WITH inv AS (
  SELECT i.id,
    (SELECT count(*) FROM journal_entries je
      WHERE je.source='invoice_sales' AND je.source_id=i.id::text) a,
    (SELECT count(*) FROM journal_entries je
      JOIN accounts_receivable ar ON ar.id::text=je.source_id
      WHERE je.source='accounts_receivable' AND ar.invoice_id=i.id) b
  FROM invoice_sales i WHERE i.status <> 'draft')
SELECT count(*) FILTER (WHERE a+b > 1) AS duplicadas,
       count(*) FILTER (WHERE a+b = 0) AS sin_asiento FROM inv;

-- 2) Coherencia de saldos: debe ser 0 en las tres columnas
SELECT count(*) FILTER (WHERE status='paid' AND coalesce(balance,0) > 0)      AS pagada_con_saldo,
       count(*) FILTER (WHERE coalesce(balance,0) > coalesce(total,0))        AS saldo_mayor_total,
       (SELECT count(*) FROM (SELECT organization_id, number FROM invoice_sales
         GROUP BY 1,2 HAVING count(*)>1) d)                                   AS numeros_duplicados
FROM invoice_sales;

-- 3) Asientos descuadrados: debe ser 0
SELECT count(*) FROM (
  SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id
  GROUP BY je.id HAVING round(sum(coalesce(jl.debit,0)),2) <> round(sum(coalesce(jl.credit,0)),2)) x;
```

Y `get_advisors(type='security')` filtrado a tablas de finanzas: al terminar la Fase 1, las 127 funciones financieras expuestas a `anon` deben ser 0.

### Estado conocido — no lo cuentes como regresión tuya

- `npm run lint` no está verde: miles de `@typescript-eslint/no-explicit-any` preexistentes. Deja limpios solo los archivos que toques.
- `tsc` reporta ~190 errores preexistentes en archivos no relacionados.
- `src/lib/services/website/__tests__/sectionContract.test.ts` falla en 2 tests (fase F2.6 pendiente del editor web).

---

## 10. Qué NO hacer

- No borrar asientos contables publicados. Reversión siempre por contraasiento.
- No ejecutar el paso 3 de F-01 (contraasientos masivos) sin validación del contador.
- No cambiar la cuenta de IVA (F-04b) sin validación del contador.
- No dropear `invoice_items.invoice_id` ni ninguna otra columna en este encargo.
- No aplicar las 12 políticas de sucursal (F-08) de golpe sin probar `app_branch_access` contra una organización real primero.
- No `REVOKE EXECUTE` sobre una función sin antes verificar con `grep` que ningún cliente la invoque.
- No mezclar fases en un mismo PR.
- No hacer `git push` ni abrir PR sin autorización explícita.

---

## 11. Primer paso

Empieza por la **Fase 0**. Antes de tocar nada:

1. Reproduce la consulta de F-01 y reporta los cuatro números que devuelve.
2. Lee `fn_auto_journal_sale`, `fn_auto_journal_ar`, `create_account_receivable_on_invoice` y `fn_create_journal_entry` completas, y confirma o refuta el mecanismo descrito.
3. Dime si estás de acuerdo con que el trigger a desactivar es `trg_auto_journal_ar` y no el otro, y por qué.

Luego para y espera mi confirmación antes de aplicar cualquier migración.
