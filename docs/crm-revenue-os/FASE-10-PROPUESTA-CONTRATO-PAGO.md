# FASE 10 — Demo, propuesta, contrato y pago

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipeline, gates), F7 (email), F9 (ficha 360°)
> Bloquea: F11 (onboarding se crea al ganar)

---

## 0. Objetivo y alcance

**Qué resuelve:** cierra el ciclo comercial: demo guiada por vertical, propuesta narrativa con ROI el mismo día, contrato con firma electrónica, y pago via Stripe. Al ganar: factura + onboarding + renovación + referido automáticos.

**Puntos del método que cubre:** 8 (demo 25–40 min), 9 (biblioteca de demos), 10 (propuesta el mismo día), 11 (narrativa de valor + ROI), 18 (handoff onboarding).

### 0.1 Integración con finanzas (cero migraciones — reusa tablas existentes)

El cierre comercial **no crea tablas financieras nuevas**. Reusa las que ya existen y están conectadas al CRM:

| Acción al cerrar | Tabla existente | Cómo se vincula |
|---|---|---|
| Generar factura | `invoice_sales` | `opportunity_id` (FK ya existe), `customer_id`, `salesperson_id`, `commission_rate`, `commission_amount` |
| Registrar pago | `payments` | `source='invoice_sales'`, `source_id`=invoice_sales.id |
| Crear cartera (cuentas por cobrar) | `accounts_receivable` | `invoice_id` → `invoice_sales.id`, `customer_id`, `due_date`, `balance` |
| Devengar comisión | `commissions` | `source_type='opportunity'` o `'invoice_sale'`, `source_id`, `payee_id`=users.id (miembro de la org) |
| Asiento contable automático | `journal_entries` + `journal_lines` | El motor contable existente ya procesa `source='invoice_sales'`, `'payments'`, `'commissions'` con reglas en `accounting_rules` |
| Nota crédito | `credit_notes` | `customer_id` (FK ya existe) |

**El motor contable ya tiene reglas para:**
- `source_type='commission'`, `event_type='accrued'` (81 reglas)
- `source_type='commission'`, `event_type='paid'` (81 reglas)
- `source_type='invoice_sales'` (procesado al facturar)
- `source_type='sale_payment'`, `event_type='paid'` (81 reglas)

**Lo que falta no es crear reglas contables nuevas**, sino que el CRM **dispare los eventos existentes** al ganar/facturar/pagar.

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `quotations` con `sections_json` | ✅ | BD |
| `ProposalBuilderDialog.tsx` | ✅ | `src/components/crm/` |
| `proposalService.ts` | ✅ | `src/lib/services/crm/proposalService.ts` |
| `pdfService.ts` | ✅ | `src/lib/services/pdfService.ts` |
| `cotizacionesService.ts` | ✅ | `src/lib/services/cotizacionesService.ts` |
| Stripe integrado | ✅ | `package.json` + `src/lib/services/` |
| `invoice_sales` con `opportunity_id` (FK → opportunities) | ✅ ya existe | BD |
| `invoice_sales.salesperson_id`, `commission_rate`, `commission_amount` | ✅ ya existe | BD |
| `payments.source` + `source_id` (polimórfico) | ✅ ya existe | BD |
| `accounts_receivable.invoice_id` (FK → invoice_sales) | ✅ ya existe | BD |
| `commissions.source_type` + `source_id` + `payee_id` | ✅ ya existe | BD |
| `accounting_rules` para `commission/accrued`, `commission/paid`, `sale_payment/paid` | ✅ ya existe (81+81+81 reglas) | BD |
| `WonCloseModal.tsx` ya vincula `invoice_sales.opportunity_id` | ✅ ya existe | `src/components/crm/pipeline/WonCloseModal.tsx:202` |
| `commissionService.ts` ya devenga en `commissions` con `source_type='opportunity'` | ✅ ya existe | `src/lib/services/crm/commissionService.ts:187` |
| `opportunity_products` / `opportunity_custom_lines` | ✅ | BD |
| `templates.kind='demo_script'` | ✅ (F0 añade `metadata`) | BD |
| `roi_calculators` | ❌ | — |
| `contract_signatures` | ❌ | — |
| `demo_sessions` | ❌ | — |
| Cal.com / Daily.co / Documenso | ❌ | — |

---

## 2. Base de datos

### 2.1 Migraciones

```sql
CREATE TABLE roi_calculators (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  vertical_id uuid,
  inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_roi_org ON roi_calculators (organization_id, is_active);
ALTER TABLE roi_calculators ENABLE ROW LEVEL SECURITY;
CREATE POLICY roi_select ON roi_calculators FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY roi_insert ON roi_calculators FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY roi_update ON roi_calculators FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY roi_delete ON roi_calculators FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE contract_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'documenso',
  provider_document_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','viewed','signed','declined','expired')),
  signers jsonb NOT NULL DEFAULT '[]'::jsonb,
  signed_pdf_path text,
  sent_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_org_opp ON contract_signatures (organization_id, opportunity_id);
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_select ON contract_signatures FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY cs_insert ON contract_signatures FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY cs_update ON contract_signatures FOR UPDATE USING (organization_id = current_org_id());

CREATE TABLE demo_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  template_id uuid REFERENCES templates(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_provider text,
  video_url text,
  recording_url text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','canceled','no_show')),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_demos_org_opp ON demo_sessions (organization_id, opportunity_id);
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ds_select ON demo_sessions FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ds_insert ON demo_sessions FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ds_update ON demo_sessions FOR UPDATE USING (organization_id = current_org_id());

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS payment_link_url text,
  ADD COLUMN IF NOT EXISTS signature_id uuid REFERENCES contract_signatures(id) ON DELETE SET NULL;
```

---

## 3. Backend

### 3.1 Endpoints

| Endpoint | Archivo | Acción | Método |
|---|---|---|---|
| `/api/crm/demos` | crear | crear | GET, POST |
| `/api/crm/demos/[id]` | crear | crear | PATCH |
| `/api/crm/roi` | crear | crear | POST (calcular) |
| `/api/crm/roi/templates` | crear | crear | GET, POST |
| `/api/crm/contracts/sign` | crear | crear | POST |
| `/api/crm/contracts/webhook` | crear | crear | POST |
| `/api/crm/proposals/generate` | crear | crear | POST |

### 3.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/demoService.ts` | crear | CRUD demos + checklist |
| `src/lib/services/crm/roiService.ts` | crear | Calculadora ROI |
| `src/lib/services/crm/contractService.ts` | crear | Firma electrónica |
| `src/lib/services/crm/proposalService.ts` | modificar | Generar narrativa desde opportunity |

#### Propuesta narrativa — secciones de `quotations.sections_json`

```json
{
  "sections": [
    { "type": "current_situation", "title": "Situación actual", "content": "..." },
    { "type": "problems", "title": "Problemas identificados", "content": "..." },
    { "type": "solution", "title": "Nuestra solución", "content": "..." },
    { "type": "roi", "title": "ROI estimado", "content": "...", "roi_data": {...} },
    { "type": "next_step", "title": "Próximos pasos", "content": "..." },
    { "type": "pricing", "title": "Inversión", "lines": [...] }
  ]
}
```

#### Al ganar (Won) — acciones automáticas (sobre tablas existentes)

```typescript
// Hook en stage change a is_won=true
// No crea tablas nuevas: reusa invoice_sales, payments, accounts_receivable,
// commissions y el motor contable existente (accounting_rules + journal_entries)
async function onOpportunityWon(supabase, orgId, opportunityId) {
  // 1. Generar factura desde la última cotización
  //    INSERT en invoice_sales con opportunity_id (FK ya existe),
  //    customer_id, salesperson_id, commission_rate, commission_amount
  const invoice = await generateInvoiceFromQuotation(supabase, orgId, opportunityId);
  // invoice_sales.opportunity_id = opportunityId (ya soportado por FK)

  // 2. Crear cuenta por cobrar
  //    INSERT en accounts_receivable con invoice_id, customer_id, due_date, balance
  await supabase.from('accounts_receivable').insert({
    organization_id: orgId,
    customer_id: invoice.customer_id,
    invoice_id: invoice.id,
    amount: invoice.total,
    balance: invoice.total,
    due_date: addDays(now, invoice.payment_terms || 30),
    status: 'pending',
  });

  // 3. Devengar comisión del vendedor (miembro de la org)
  //    INSERT en commissions con source_type='opportunity', source_id=opportunityId,
  //    payee_id=opp.salesperson_id (users.id), payee_type='employee'
  //    commissionService.accrueCommission() ya hace esto (línea 187)
  await commissionService.accrueCommission(opportunityId, opp.salesperson_id, opp.amount);

  // 4. El motor contable existente genera el asiento automáticamente:
  //    - accounting_rules con source_type='commission', event_type='accrued'
  //    - accounting_rules con source_type='invoice_sales'
  //    No hay que crear reglas nuevas — ya existen (81 reglas commission/accrued)

  // 5. Crear onboarding child opportunity (F11)
  await createOnboardingOpportunity(supabase, orgId, opportunityId);

  // 6. Schedule renewal si billing_cycle_months existe
  if (opp.billing_cycle_months) {
    await scheduleRenewal(supabase, orgId, opportunityId, opp.billing_cycle_months);
  }

  // 7. Crear task de pedir referido (F12)
  await supabase.from('tasks').insert({
    organization_id: orgId,
    title: 'Pedir referido al cliente',
    due_date: addDays(now, 7),
    related_type: 'opportunity',
    related_id: opportunityId,
  });
}

#### Registrar pago — función SQL atómica (NO tres updates sueltos)

Un pago toca `payments`, `invoice_sales` y `accounts_receivable`. Hacerlo con tres
`await` separados desde el cliente deja el sistema **inconsistente si falla el
segundo o el tercero** (factura cobrada sin cartera actualizada). Por eso va en una
**única función Postgres** = una sola transacción.

Errores que esta versión corrige respecto al borrador anterior:

| Bug | Por qué fallaba |
|---|---|
| `source: 'invoice_sale'` | El valor real es **`'invoice_sales'`** (plural). Singular → el pago no se vincula |
| `balance: supabase.rpc('sub', …)` | No se puede usar un RPC como valor de columna, y no existe un RPC `sub`. Guardaba un objeto |
| `status: 'paid'` incondicional | Ignoraba **pagos parciales**. Marcaba pagada una factura con saldo |
| `accounts_receivable.balance = 0` fijo | Igual: rompía la cartera en pagos parciales |
| `WHERE source_id = opportunityId` | Las comisiones de venta usan `source_id` = **id de la factura**, no de la oportunidad |
| Sin idempotencia | Un reintento de webhook de Stripe duplicaba el pago |
| Sin transacción | Fallo parcial → datos inconsistentes |

> **`payments` NO tiene columna `metadata`.** Verificado: sus columnas son
> `id, organization_id, branch_id, source, source_id, method, amount, currency,
> reference, processor_response, status, created_by, created_at, updated_at,
> payment_date, discount_amount, change_amount`.
> La clave de idempotencia va en **`reference` (text)** y el payload del proveedor
> en **`processor_response` (jsonb)**. Ambas ya existen; no se añade ninguna columna.

Índices previos (la tabla hoy **solo tiene el índice de la PK**, con 1 050 pagos):

```sql
-- Idempotencia real a nivel de BD: dos webhooks concurrentes no pueden duplicar
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_org_reference
  ON payments (organization_id, reference)
  WHERE reference IS NOT NULL;

-- Necesario para el JOIN polimórfico de fn_revenue_metrics (F14)
CREATE INDEX IF NOT EXISTS idx_payments_org_source
  ON payments (organization_id, source, source_id);

CREATE INDEX IF NOT EXISTS idx_payments_org_date
  ON payments (organization_id, payment_date DESC)
  WHERE status = 'completed';
```

```sql
CREATE OR REPLACE FUNCTION fn_register_crm_payment(
  p_org_id          integer,
  p_invoice_id      uuid,
  p_amount          numeric,
  p_method          text,
  p_idempotency_key text,
  p_payment_date    timestamptz DEFAULT now()
) RETURNS TABLE (
  payment_id      uuid,
  invoice_status  text,
  invoice_balance numeric,
  already_applied boolean
) AS $$
DECLARE
  v_invoice   invoice_sales;
  v_payment_id uuid;
  v_new_balance numeric;
  v_new_status  text;
  v_ar_id      uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'monto invalido: %', p_amount USING ERRCODE = '22023';
  END IF;

  -- 1) IDEMPOTENCIA: la clave es estable (sin timestamps) y se guarda en
  --    payments.reference (payments NO tiene columna metadata). El índice
  --    único uq_payments_org_reference la respalda a nivel de BD.
  SELECT id INTO v_payment_id
    FROM payments
   WHERE organization_id = p_org_id
     AND reference = p_idempotency_key
   LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    SELECT i.status, i.balance INTO v_new_status, v_new_balance
      FROM invoice_sales i WHERE i.id = p_invoice_id;
    RETURN QUERY SELECT v_payment_id, v_new_status, v_new_balance, true;
    RETURN;
  END IF;

  -- 2) Bloquear la factura para evitar carrera entre dos pagos simultáneos
  SELECT * INTO v_invoice
    FROM invoice_sales
   WHERE id = p_invoice_id AND organization_id = p_org_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura % no existe en la organizacion %', p_invoice_id, p_org_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'no se puede pagar una factura anulada' USING ERRCODE = '22023';
  END IF;

  IF p_amount > v_invoice.balance THEN
    RAISE EXCEPTION 'el pago (%) excede el saldo (%)', p_amount, v_invoice.balance
      USING ERRCODE = '22023';
  END IF;

  -- 3) Saldo y estado REALES: soporta pago parcial
  v_new_balance := v_invoice.balance - p_amount;
  v_new_status  := CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END;

  -- 4) Insertar el pago (source PLURAL, source_id es text)
  INSERT INTO payments (
    organization_id, branch_id, source, source_id, method, amount,
    currency, status, payment_date, reference
  ) VALUES (
    p_org_id, v_invoice.branch_id,
    'invoice_sales',                       -- PLURAL: valor real en producción
    p_invoice_id::text,                    -- source_id es text → cast obligatorio
    p_method, p_amount,
    v_invoice.currency,                    -- moneda de la factura, no 'COP' fijo
    'completed',                           -- valor real para pagos de factura
    p_payment_date,
    p_idempotency_key                      -- idempotencia (uq_payments_org_reference)
  ) RETURNING id INTO v_payment_id;

  -- 5) Actualizar la factura
  UPDATE invoice_sales
     SET balance = v_new_balance, status = v_new_status, updated_at = now()
   WHERE id = p_invoice_id;

  -- 6) Actualizar cartera; si no existe, crearla (caso de factura sin AR)
  SELECT id INTO v_ar_id FROM accounts_receivable
   WHERE invoice_id = p_invoice_id AND organization_id = p_org_id FOR UPDATE;

  IF v_ar_id IS NULL THEN
    INSERT INTO accounts_receivable (
      organization_id, invoice_id, customer_id, amount, balance, due_date, status
    ) VALUES (
      p_org_id, p_invoice_id, v_invoice.customer_id, v_invoice.total, v_new_balance,
      COALESCE(v_invoice.due_date, v_invoice.issue_date + INTERVAL '30 days'),
      CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END
    );
  ELSE
    UPDATE accounts_receivable
       SET balance = v_new_balance,
           status  = CASE
                       WHEN v_new_balance <= 0 THEN 'paid'
                       WHEN due_date < now()   THEN 'overdue'
                       ELSE 'partial'
                     END
     WHERE id = v_ar_id;
  END IF;

  -- 7) Comisión: se paga SOLO cuando la factura queda totalmente cobrada
  --    (regla de negocio: "comisión por venta cobrada, no por cita" — punto 26).
  --    source_id de la comisión es el id de la FACTURA, en text.
  IF v_new_status = 'paid' THEN
    UPDATE commissions
       SET status = 'paid', paid_at = now(), updated_at = now()
     WHERE organization_id = p_org_id
       AND source_type = 'invoice_sale'
       AND source_id   = p_invoice_id::text
       AND status      = 'accrued';
  END IF;

  RETURN QUERY SELECT v_payment_id, v_new_status, v_new_balance, false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION fn_register_crm_payment(integer,uuid,numeric,text,text,timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION fn_register_crm_payment(integer,uuid,numeric,text,text,timestamptz) TO authenticated;
```

> **`SECURITY DEFINER` + validación de org.** La función recibe `p_org_id` y filtra
> por él en cada sentencia, pero al ser `SECURITY DEFINER` **salta RLS**: el route
> handler que la invoca **debe** verificar que el usuario pertenece a `p_org_id`
> antes de llamarla (ver `getServerOrgContext()` de F0). Nunca exponerla a `anon`.

El motor contable existente dispara `sale_payment/paid` y `commission/paid`
(reglas ya presentes en `accounting_rules`), así que **no se escriben asientos a mano**.

Wrapper TypeScript (delgado, sin lógica de negocio):

```typescript
// src/lib/services/crm/crmPaymentService.ts
export async function registerCrmPayment(params: {
  organizationId: number;   // organizations.id es integer
  invoiceId: string;
  amount: number;
  method: string;
  idempotencyKey: string;   // estable: p.ej. `stripe:${event.id}` o `manual:${invoiceId}:${amount}:${isoDay}`
}) {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('fn_register_crm_payment', {
    p_org_id: params.organizationId,
    p_invoice_id: params.invoiceId,
    p_amount: params.amount,
    p_method: params.method,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new Error(`registerCrmPayment: ${error.message}`);
  return data?.[0];
}
```

---

## 4. UI

### 4.1 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/demo/DemoScheduler.tsx` | crear | `opportunityId` | Agendar demo + checklist |
| `src/components/crm/demo/DemoChecklist.tsx` | crear | `demoId` | Checklist guiada por vertical |
| `src/components/crm/propuestas/ProposalGenerator.tsx` | crear | `opportunityId` | Generar narrativa desde datos |
| `src/components/crm/propuestas/RoiCalculator.tsx` | crear | `calculatorId` | Calculadora interactiva |
| `src/components/crm/contratos/ContractSignDialog.tsx` | crear | `opportunityId` | Enviar a firma |
| `src/components/crm/contratos/PaymentLinkButton.tsx` | crear | `opportunityId` | Stripe Payment Link |

### 4.2 Wireframes

```
┌─ ProposalGenerator ─────────────────────────────────────────┐
│  Generar propuesta para: Rest. El Corral                    │
│  Plantilla: [Restaurante ▼]                                  │
│                                                                │
│  ┌─ Situación actual ──────────────────┐ [Editar]           │
│  │ Actualmente manejan inventario en... │                    │
│  └──────────────────────────────────────┘                    │
│  ┌─ Problemas ─────────────────────────┐ [Editar]           │
│  │ Mermas del 15%, sin control de...   │                    │
│  └──────────────────────────────────────┘                    │
│  ┌─ Solución ──────────────────────────┐ [Editar]           │
│  │ Implementación de módulo de POS...   │                    │
│  └──────────────────────────────────────┘                    │
│  ┌─ ROI ───────────────────────────────┐ [Calcular]         │
│  │ Inversión: $5M | Ahorro: $1.8M/año  │                    │
│  │ ROI: 36% | Payback: 2.8 meses       │                    │
│  └──────────────────────────────────────┘                    │
│  ┌─ Pricing ───────────────────────────┐                    │
│  │ Plan Pro: $500k/mes × 12 = $6M     │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
│  [Generar PDF]  [Enviar por email]  [Payment Link]           │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. Multi-tenant y seguridad

- ROI calculators por organización.
- Contratos visibles solo para la org.
- Payment Links de Stripe con API key de la org (o plataforma con metadata de org).

---

## 6. Pruebas

- Generar propuesta → crea cotización con secciones narrativas + PDF.
- Enviar propuesta por email → crea actividad "propuesta enviada" + set next_contact +24h.
- Firmar contrato → webhook actualiza `contract_signatures.status`.
- Payment Link → redirige a Stripe Checkout.
- Ganar oportunidad → factura + onboarding + renovación + task referido.

---

## 7. Definition of Done

- [ ] `roi_calculators`, `contract_signatures`, `demo_sessions` existen con RLS.
- [ ] `quotations.payment_link_url`/`signature_id` existen.
- [ ] `ProposalGenerator` genera narrativa desde datos de la oportunidad.
- [ ] `RoiCalculator` funciona con inputs/formula/outputs configurables.
- [ ] `ContractSignDialog` envía a Documenso.
- [ ] `PaymentLinkButton` crea Stripe Payment Link.
- [ ] Al ganar: factura en `invoice_sales` (con `opportunity_id`), cartera en `accounts_receivable`, comisión devengada en `commissions`, onboarding, renovación + task referido automáticos.
- [ ] Al pagar: `payments` con `source='invoice_sales'`, `accounts_receivable` actualizada, `commissions` pagada, asiento contable generado por motor existente.
- [ ] Cero tablas financieras nuevas creadas — todo reusa `invoice_sales`, `payments`, `accounts_receivable`, `commissions`, `journal_entries`.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/demoService.ts` | crear | CRUD demos |
| `src/lib/services/crm/roiService.ts` | crear | Calculadora ROI |
| `src/lib/services/crm/contractService.ts` | crear | Firma electrónica |
| `src/lib/services/crm/proposalService.ts` | modificar | Narrativa automática |
| `src/lib/services/crm/crmFinanceService.ts` | modificar | Registrar pago en `payments` existente, actualizar `accounts_receivable`, pagar comisiones en `commissions` existente |
| `src/app/api/crm/demos/route.ts` + `[id]` | crear | CRUD demos |
| `src/app/api/crm/roi/route.ts` + `templates` | crear | ROI |
| `src/app/api/crm/contracts/sign/route.ts` + `webhook` | crear | Contratos |
| `src/app/api/crm/proposals/generate/route.ts` | crear | Generar propuesta |
| `src/components/crm/demo/DemoScheduler.tsx` | crear | Agendar demo |
| `src/components/crm/demo/DemoChecklist.tsx` | crear | Checklist |
| `src/components/crm/propuestas/ProposalGenerator.tsx` | crear | Generar propuesta |
| `src/components/crm/propuestas/RoiCalculator.tsx` | crear | ROI |
| `src/components/crm/contratos/ContractSignDialog.tsx` | crear | Firma |
| `src/components/crm/contratos/PaymentLinkButton.tsx` | crear | Payment Link |
