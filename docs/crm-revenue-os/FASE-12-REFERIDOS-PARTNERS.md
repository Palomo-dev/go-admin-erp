# FASE 12 — Referidos y partners

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipelines), F11 (clientes satisfechos)
> Bloquea: — (F13 no depende de F12)

---

## 0. Objetivo y alcance

**Qué resuelve:** programa de referidos (clientes que refieren a otros clientes) y programa de partners (consultores/integradores que venden el producto). Comisiones de partner, tracking de deals, y co-selling.

**Puntos del método que cubre:** 23 (referidos), 24 (partners).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `referralsService.ts` | ✅ existe | `src/lib/services/crm/referralsService.ts` |
| `referrals` tabla | verificar | BD |
| `partners` / `partner_tiers` / `partner_deals` | ❌ | — |
| `referral_programs` | ❌ | — |

---

## 2. Base de datos

### 2.1 Migraciones

```sql
CREATE TABLE referral_programs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('credit','discount','cash','free_months')),
  reward_amount numeric(10,2) NOT NULL,
  reward_currency text NOT NULL DEFAULT 'USD',
  reward_to text NOT NULL CHECK (reward_to IN ('referrer','referred','both')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_ref_programs_org ON referral_programs (organization_id, is_active);
ALTER TABLE referral_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY rp_select ON referral_programs FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY rp_insert ON referral_programs FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY rp_update ON referral_programs FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY rp_delete ON referral_programs FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE referrals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  program_id bigint REFERENCES referral_programs(id) ON DELETE SET NULL,
  referrer_customer_id integer NOT NULL,
  referred_customer_id integer,
  referred_name text NOT NULL,
  referred_email text,
  referred_phone text,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','qualified','converted','rejected')),
  reward_paid boolean NOT NULL DEFAULT false,
  reward_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referrals_org ON referrals (organization_id, status);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ref_select ON referrals FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ref_insert ON referrals FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ref_update ON referrals FOR UPDATE USING (organization_id = current_org_id());

CREATE TABLE partners (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  email text NOT NULL,
  phone text,
  tier_id bigint,
  commission_rate numeric(5,2) NOT NULL DEFAULT 10.00,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partners_org ON partners (organization_id, is_active);
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_select ON partners FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY p_insert ON partners FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY p_update ON partners FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY p_delete ON partners FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE partner_tiers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_deals integer NOT NULL DEFAULT 0,
  min_revenue numeric(14,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,2) NOT NULL DEFAULT 10.00,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_partner_tiers_org ON partner_tiers (organization_id);
ALTER TABLE partner_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY pt_select ON partner_tiers FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY pt_insert ON partner_tiers FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY pt_update ON partner_tiers FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY pt_delete ON partner_tiers FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE partner_deals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_id bigint NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  deal_type text NOT NULL CHECK (deal_type IN ('referral','co_sell','reseller')),
  commission_amount numeric(14,2),
  commission_status text NOT NULL DEFAULT 'pending' CHECK (commission_status IN ('pending','approved','paid','rejected')),
  commission_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_deals_org ON partner_deals (organization_id, partner_id);
ALTER TABLE partner_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY pd_select ON partner_deals FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY pd_insert ON partner_deals FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY pd_update ON partner_deals FOR UPDATE USING (organization_id = current_org_id());
```

---

## 3. Backend

### 3.1 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/referralsService.ts` | modificar | CRUD + reward |
| `src/lib/services/crm/partnerService.ts` | crear | CRUD partners + deals + comisiones |

### 3.2 Endpoints

| Endpoint | Archivo | Acción |
|---|---|---|
| `/api/crm/referrals` | crear | crear |
| `/api/crm/referrals/[id]` | crear | crear |
| `/api/crm/partners` | crear | crear |
| `/api/crm/partners/[id]` | crear | crear |
| `/api/crm/partners/[id]/deals` | crear | crear |
| `/api/crm/partners/tiers` | crear | crear |

---

## 4. UI

### 4.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/referidos` | `src/app/app/crm/referidos/page.tsx` | crear | Programa de referidos |
| `/app/crm/partners` | `src/app/app/crm/partners/page.tsx` | crear | Partners + deals |

### 4.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/referidos/ReferralProgramEditor.tsx` | crear | `program?` | Editor de programa |
| `src/components/crm/referidos/ReferralList.tsx` | crear | — | Lista de referidos |
| `src/components/crm/partners/PartnerList.tsx` | crear | — | Lista de partners |
| `src/components/crm/partners/PartnerEditor.tsx` | crear | `partner?` | Editor de partner |
| `src/components/crm/partners/PartnerDealList.tsx` | crear | `partnerId` | Deals del partner |
| `src/components/crm/partners/TierEditor.tsx` | crear | `tier?` | Editor de tier |

### 4.3 Wireframes

```
┌─ Partner Editor ────────────────────────────────────────────┐
│  Nombre: [Carlos Consultor]                                  │
│  Empresa: [Consultoría S.A.]                                 │
│  Email: [carlos@consultoria.com]                             │
│  Teléfono: [+57 300 123 4567]                               │
│  Tier: [Gold ▼] (comisión: 15%)                              │
│  Comisión personalizada: [10.00 %]                           │
│  [Guardar]                                                    │
└────────────────────────────────────────────────────────────────┘

┌─ Partner Deal List ─────────────────────────────────────────┐
│  Deal              Cliente          Tipo        Comisión     │
│  #001              Rest. Corral     Co-sell     $750 pendiente│
│  #002              Hotel Bogotá     Referral    $500 aprobada│
│  Total comisiones pendientes: $750                           │
│  [Aprobar]  [Pagar]                                          │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. Multi-tenant y seguridad

- Partners y referidos son por organización.
- Comisiones se calculan con la rate del tier o la personalizada.
- `partner_deals` vincula a `opportunities` de la misma org.

---

## 6. Pruebas

- Crear referido → crea opportunity con `deal_type='referral'`.
- Referido convertido → marca `status='converted'` + calcula reward.
- Partner deal creado al ganar oportunidad con partner asignado.
- Comisión se calcula con rate del tier o personalizada.
- Partner de otra org → 403.

---

## 7. Definition of Done

- [ ] `referral_programs`, `referrals`, `partners`, `partner_tiers`, `partner_deals` existen con RLS.
- [ ] `referralsService` crea referidos + rewards.
- [ ] `partnerService` gestiona partners + deals + comisiones.
- [ ] `/app/crm/referidos` funciona.
- [ ] `/app/crm/partners` funciona.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/referralsService.ts` | modificar | CRUD + reward |
| `src/lib/services/crm/partnerService.ts` | crear | Partners + deals |
| `src/app/api/crm/referrals/route.ts` + `[id]` | crear | CRUD |
| `src/app/api/crm/partners/route.ts` + `[id]` + `[id]/deals` + `tiers` | crear | CRUD |
| `src/app/app/crm/referidos/page.tsx` | crear | UI |
| `src/app/app/crm/partners/page.tsx` | crear | UI |
| `src/components/crm/referidos/ReferralProgramEditor.tsx` | crear | Editor |
| `src/components/crm/referidos/ReferralList.tsx` | crear | Lista |
| `src/components/crm/partners/PartnerList.tsx` | crear | Lista |
| `src/components/crm/partners/PartnerEditor.tsx` | crear | Editor |
| `src/components/crm/partners/PartnerDealList.tsx` | crear | Deals |
| `src/components/crm/partners/TierEditor.tsx` | crear | Tier |
