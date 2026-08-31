# FASE 10 — Demo, propuesta, contrato y pago

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipeline, gates), F7 (email), F9 (ficha 360°)
> Bloquea: F11 (onboarding se crea al ganar)

---

## 0. Objetivo y alcance

**Qué resuelve:** cierra el ciclo comercial: demo guiada por vertical, propuesta narrativa con ROI el mismo día, contrato con firma electrónica, y pago via Stripe. Al ganar: factura + onboarding + renovación + referido automáticos.

**Puntos del método que cubre:** 8 (demo 25–40 min), 9 (biblioteca de demos), 10 (propuesta el mismo día), 11 (narrativa de valor + ROI), 18 (handoff onboarding).

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
| `invoice_sales` con `opportunity_id` | verificar | BD |
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
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  quotation_id bigint REFERENCES quotations(id) ON DELETE SET NULL,
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
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  template_id bigint REFERENCES templates(id) ON DELETE SET NULL,
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
  ADD COLUMN IF NOT EXISTS signature_id bigint REFERENCES contract_signatures(id) ON DELETE SET NULL;
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

#### Al ganar (Won) — acciones automáticas

```typescript
// Hook en stage change a is_won=true
async function onOpportunityWon(supabase, orgId, opportunityId) {
  // 1. Generar factura desde la última cotización
  const invoice = await generateInvoiceFromQuotation(supabase, orgId, opportunityId);

  // 2. Crear onboarding child opportunity (F11)
  await createOnboardingOpportunity(supabase, orgId, opportunityId);

  // 3. Schedule renewal si billing_cycle_months existe
  const opp = await getOpportunity(supabase, opportunityId);
  if (opp.billing_cycle_months) {
    await scheduleRenewal(supabase, orgId, opportunityId, opp.billing_cycle_months);
  }

  // 4. Crear task de pedir referido (F12)
  await supabase.from('tasks').insert({
    organization_id: orgId,
    title: 'Pedir referido al cliente',
    due_date: addDays(now, 7),
    related_type: 'opportunity',
    related_id: opportunityId,
  });
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
- [ ] Al ganar: factura + onboarding + renovación + task referido automáticos.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/demoService.ts` | crear | CRUD demos |
| `src/lib/services/crm/roiService.ts` | crear | Calculadora ROI |
| `src/lib/services/crm/contractService.ts` | crear | Firma electrónica |
| `src/lib/services/crm/proposalService.ts` | modificar | Narrativa automática |
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
