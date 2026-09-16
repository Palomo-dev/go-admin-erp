/// <reference types="jest" />
/**
 * F10 — guardarraíles de cadena (tolerantes al formato) para no reincidir:
 * evaluador sin Function/eval, webhooks verificados antes de escribir,
 * organización en cada consulta a quotations, sin `.split('T')[0]`,
 * componentes ≤ 300 líneas y el diálogo huérfano borrado.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const lines = (p: string) => read(p).split(/\r?\n/).length;

describe('F10 guardarraíles', () => {
  it('roiService no ejecuta texto: sin Function( ni eval(', () => {
    const src = read('src/lib/services/crm/roiService.ts');
    expect(src).not.toMatch(/\bFunction\s*\(/);
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).toMatch(/evaluateFormula/);
    expect(read('src/lib/services/crm/roiEvaluator.ts')).not.toMatch(/\bnew Function|\beval\s*\(/);
  });

  it('el webhook de Documenso verifica la firma antes de cualquier escritura y resuelve la organización desde la fila', () => {
    const svc = read('src/lib/services/crm/contractService.ts');
    const fn = svc.slice(svc.indexOf('export async function processDocumensoWebhook'));
    const verifyAt = fn.indexOf('verifyDocumensoSignature(');
    const updateAt = fn.indexOf('.update(');
    expect(verifyAt).toBeGreaterThan(0);
    expect(updateAt).toBeGreaterThan(verifyAt);
    expect(fn).toMatch(/getEsignReadiness\(contract\.organization_id/);
    expect(fn).not.toMatch(/body\.organization_id|payload\.organization_id/);
    // la ruta histórica ya no tiene implementación propia sin firma
    expect(read('src/app/api/crm/contracts/webhook/route.ts')).toMatch(/export \{ POST, runtime \} from '@\/app\/api\/crm\/webhooks\/documenso\/route'/);
    expect(read('src/app/api/crm/webhooks/documenso/route.ts')).toMatch(/processDocumensoWebhook/);
  });

  it('el webhook de Stripe usa constructEvent y registra por paymentService con reference stripe:<event.id>', () => {
    const svc = read('src/lib/services/crm/stripePaymentLinkService.ts');
    const fn = svc.slice(svc.indexOf('export async function processStripeWebhook'));
    expect(fn.indexOf('constructEvent(')).toBeGreaterThan(0);
    expect(fn.indexOf('registerCrmPayment(')).toBeGreaterThan(fn.indexOf('constructEvent('));
    expect(fn).not.toMatch(/\.from\('payments'\)/); // nunca escribe payments directamente
    expect(read('src/lib/services/crm/paymentEvents.ts')).toMatch(/idempotencyKey: `stripe:\$\{eventId\}`/);
    expect(read('src/app/api/crm/webhooks/stripe/route.ts')).toMatch(/processStripeWebhook/);
  });

  it('toda consulta a quotations/opportunities/contract_signatures/demo_sessions en los servicios F10 lleva organization_id', () => {
    for (const file of ['src/lib/services/crm/proposalServerService.ts', 'src/lib/services/crm/stripePaymentLinkService.ts', 'src/lib/services/crm/contractService.ts', 'src/lib/services/crm/demoService.ts']) {
      const src = read(file).replace(/\s+/g, ' ');
      const re = /\.from\('(quotations|opportunities|contract_signatures|demo_sessions|roi_calculators)'\)([^;]*?);/g;
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = re.exec(src))) {
        count += 1;
        expect(m[0]).toMatch(/organization_id/);
      }
      expect(count).toBeGreaterThan(0);
    }
  });

  it('sin `.split(\'T\')[0]` ni toISOString para días calendario en los archivos F10', () => {
    for (const file of ['src/lib/services/crm/proposalServerService.ts', 'src/lib/services/crm/demoInput.ts', 'src/components/crm/demo/DemoScheduler.tsx', 'src/components/crm/propuestas/ProposalGenerator.tsx']) {
      expect(read(file)).not.toMatch(/split\('T'\)\[0\]/);
    }
    expect(read('src/lib/services/crm/proposalServerService.ts')).toMatch(/todayInTz\(/);
  });

  it('componentes de F10 ≤ 300 líneas y el diálogo huérfano ya no existe', () => {
    for (const file of [
      'src/components/crm/propuestas/ProposalGenerator.tsx', 'src/components/crm/propuestas/ProposalSectionCard.tsx', 'src/components/crm/propuestas/RoiCalculator.tsx', 'src/components/crm/propuestas/ProposalPrintView.tsx',
      'src/components/crm/contratos/ContractSignDialog.tsx', 'src/components/crm/contratos/PaymentLinkButton.tsx', 'src/components/crm/demo/DemoScheduler.tsx', 'src/components/crm/oportunidades/detail/ClosingTab.tsx',
    ]) {
      expect(lines(file)).toBeLessThanOrEqual(300);
    }
    expect(existsSync(join(root, 'src/components/crm/propuestas/ProposalBuilderDialog.tsx'))).toBe(false);
    expect(existsSync(join(root, 'src/app/auth/ux-harness-f10'))).toBe(false);
  });

  it('las rutas F10 resuelven la organización con getServerOrgContext y rechazan otra en el body', () => {
    for (const file of ['src/app/api/crm/proposals/route.ts', 'src/app/api/crm/proposals/[id]/route.ts', 'src/app/api/crm/proposals/[id]/sent/route.ts', 'src/app/api/crm/roi/route.ts', 'src/app/api/crm/contracts/route.ts', 'src/app/api/crm/payments/link/route.ts', 'src/app/api/crm/demos/route.ts', 'src/app/api/crm/demos/[id]/route.ts']) {
      const src = read(file);
      expect(src).toMatch(/getServerOrgContext\(\)/);
      if (/export async function (POST|PATCH)/.test(src)) expect(src).toMatch(/foreignOrgResponse\(/);
    }
  });

  // ─── Ronda 2 ───────────────────────────────────────────────────────────────

  it('M19: safeEqual compara con timingSafeEqual (nunca === entre firma y esperado)', () => {
    const src = read('src/lib/services/crm/contractStateMachine.ts');
    const fn = src.slice(src.indexOf('function safeEqual'), src.indexOf('export interface VerifyDocumensoInput'));
    expect(fn).toMatch(/return timingSafeEqual\(ba, bb\)/);
    expect(fn).not.toMatch(/a\s*===?\s*b|provided\s*===?\s*expected/);
    expect(src).toMatch(/import \{ createHmac, timingSafeEqual \} from 'crypto'/);
  });

  // Hallazgo r2 (fuera de zona, no tocado): 6 rutas de src/app/api/integrations/{mercadopago,meta,paypal,payu,stripe}
  // filtran integration_connections por status='active' y nunca encuentran la conexión. Aquí se acota a CRM/F10.
  it("integration_connections.status: CHECK real draft|connected|paused|error|revoked — ningún archivo de CRM filtra 'active'", () => {
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (name === 'node_modules' || name === '__tests__' || name === '.next') continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(join(root, 'src', 'lib', 'services', 'crm'));
    walk(join(root, 'src', 'app', 'api', 'crm'));
    walk(join(root, 'src', 'components', 'crm'));
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!src.includes("from('integration_connections')")) continue;
      const flat = src.replace(/\s+/g, ' ');
      const re = /\.from\('integration_connections'\)[^;]*?\.eq\('status',\s*'active'\)/g;
      if (re.test(flat)) offenders.push(f.slice(root.length + 1));
    }
    expect(offenders).toEqual([]);
    expect(read('src/lib/services/crm/stripePaymentLinkService.ts')).toMatch(/STRIPE_CONNECTION_USABLE_STATUS = 'connected'/);
  });

  it('valid_until es columna date: nunca pasa por formatDate/formatDateInTz en los componentes de propuesta', () => {
    for (const f of ['src/components/crm/propuestas/ProposalGenerator.tsx', 'src/components/crm/propuestas/ProposalPrintView.tsx', 'src/components/crm/oportunidades/detail/ClosingTab.tsx']) {
      const src = read(f);
      expect(src).not.toMatch(/formatDate(?:InTz)?\([^)]*valid_until/);
      expect(src).not.toMatch(/new Date\([^)]*valid_until/);
    }
  });

  it('el cierre «al ganar» no lee la tabla inventory (no existe) y el modal no creció', () => {
    expect(read('src/lib/services/crm/wonCloseSteps.ts')).not.toMatch(/from\('inventory'\)|'stock'/);
    expect(read('src/components/crm/pipeline/WonCloseModal.tsx')).not.toMatch(/from\('inventory'\)|executeStock/);
    expect(lines('src/components/crm/pipeline/WonCloseModal.tsx')).toBeLessThanOrEqual(300);
    // r3: el modal cablea cada paso por su id, tal cual, y le pasa (opp, deps); sin RTL esto es lo que impide un cruce de ejecutores.
    const modal = read('src/components/crm/pipeline/WonCloseModal.tsx');
    expect(modal).toMatch(/const executor = WON_STEP_EXECUTORS\[step\.id\];/);
    expect(modal).toMatch(/await executor\(opp, deps\)/);
    expect(modal).toMatch(/useState<CloseStep\[\]>\(buildInitialSteps\)/);
    expect(modal).toMatch(/setSteps\(buildInitialSteps\(\)\)/);
    expect(lines('src/lib/services/crm/wonCloseSteps.ts')).toBeLessThanOrEqual(300);
  });

  it('el webhook de Stripe: 23505 tratado como duplicado, moneda contrastada con la factura, actividad en los rechazos, enlace de un solo uso y desactivado', () => {
    expect(read('src/lib/services/crm/paymentService.ts')).toMatch(/isStripeReferenceDuplicate\(payError, data\.reference\)/);
    const svc = read('src/lib/services/crm/stripePaymentLinkService.ts');
    const fn = svc.slice(svc.indexOf('export async function processStripeWebhook'));
    expect(fn).toMatch(/invoiceCurrency !== p\.currency/);
    expect(fn).toMatch(/reason: 'duplicate'/);
    expect(fn.indexOf('recordRejection(')).toBeGreaterThan(0);
    // Deuda B1 (2026-09-16): la desactivación usa el id PERSISTIDO al crear el
    // enlace (`quotations.payment_link_id`); `session.payment_link` queda solo
    // como respaldo de enlaces heredados. Al quedar pagada se limpian las columnas.
    expect(fn).toMatch(/const linkId = q\?\.payment_link_id \?\? p\.paymentLinkId;/);
    expect(fn).toMatch(/deactivateLinkBestEffort\(adapter, verifyingKey, linkId,/);
    expect(fn).toMatch(/\.update\(\{ \.\.\.PAYMENT_LINK_CLEARED,/);
    expect(svc).toMatch(/PAYMENT_LINK_CLEARED = \{ payment_link_url: null, payment_link_amount: null, payment_link_id: null \}/);
    expect(svc).toMatch(/restrictions: \{ completed_sessions: \{ limit: 1 \} \}/);
    expect(svc).toMatch(/active: false/);
    expect(read('src/lib/services/crm/paymentEvents.ts')).toMatch(/'checkout\.session\.async_payment_succeeded'/);
  });

  it('contracts/[id] pasa por f10RouteHelpers y decide «signed» a mano por id de rol', () => {
    const src = read('src/app/api/crm/contracts/[id]/route.ts');
    expect(src).toMatch(/foreignOrgResponse\(/);
    // La decisión por id de rol vive en f10RouteHelpers.canManualSign (la ruta no puede
    // exportar nada que no sea handler: lo exige el chequeo de tipos de `next build`).
    expect(src).toMatch(/canManualSign\(/);
    expect(read('src/lib/services/crm/f10RouteHelpers.ts')).toMatch(/STAGE_MANAGER_ROLE_IDS/);
    expect(src).not.toMatch(/roleName/);
  });
});
