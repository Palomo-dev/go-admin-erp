/**
 * Guardarraíles automatizados — FASE 0 (Fundaciones).
 *
 * Tests que impiden regresiones en los bugs corregidos en F0.
 * Se ejecutan con `npm test` y deben pasar antes de cualquier PR.
 *
 * Casos cubiertos:
 * 1. Sin `organizationId: 1` / `organization_id: 1` hardcodeados en src/.
 * 2. Sin lecturas de tablas de plataforma desde el CRM.
 * 3. Sin `display_order` en el módulo CRM.
 * 4. `callService.ts` (muerto) no existe.
 * 5. Ningún `route.ts` bajo src/app/api toma `organizationId`/`organization_id`/`orgId`
 *    del body sin `getServerOrgContext`/`withOrg` (allow-list explícita de deuda legacy).
 * 6. Ningún archivo de servidor (src/app/api/**, src/lib/services/integrations/**,
 *    src/lib/services/crm/**, notificationService, ws-server) importa el cliente
 *    browser `@/lib/supabase/config` (allow-list explícita de deuda legacy).
 * 7. Todo `route.ts` bajo rutas webhook (/api/voice, /api/integrations/twilio,
 *    /api/integrations/whatsapp/webhook, /api/email/webhook, /api/webhooks) importa
 *    un verify* de `@/lib/security/webhookSignatures` (o `getServerOrgContext` si es
 *    ruta de sesión; allow-list para facebook/instagram y email/webhook).
 * 8. Ningún `.from('comm_settings')` encadena `.limit(1)` + `.single()` fuera de orgContext.
 * 9. `src/lib/crm/enums.ts` coincide con el snapshot de CHECKs `db-checks.json`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DB_CHECK_ENUMS } from '@/lib/crm/enums';

const SRC_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

/**
 * Recorre recursivamente un directorio y devuelve todos los archivos
 * .ts/.tsx que coincen con un predicado.
 */
function walkDir(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      walkDir(fullPath, files);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function rel(filePath: string): string {
  return path.relative(SRC_ROOT, filePath).replace(/\\/g, '/');
}

/**
 * Filtra archivos que no deben revisarse (tests, mocks, este archivo).
 */
function isExcluded(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('__tests__') ||
    normalized.includes('.test.') ||
    normalized.includes('.spec.') ||
    normalized.includes('guardrails.test') ||
    normalized.includes('/mocks/') ||
    normalized.includes('node_modules')
  );
}

function stripCommentsAndStrings(line: string): string {
  let result = line;
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const inlineCommentIdx = result.indexOf('//');
  if (inlineCommentIdx >= 0) {
    result = result.substring(0, inlineCommentIdx);
  }
  return result;
}

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/')
  );
}

/** Quita comentarios de bloque y de línea de un archivo completo. */
function stripAllComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => (isCommentLine(l.trim()) ? '' : l.replace(/\/\/.*$/, '')))
    .join('\n');
}

describe('F0 Guardarraíles', () => {
  jest.setTimeout(60000); // Escaneo de src/ puede tardar

  // === Caso 1: Sin organizationId: 1 / organization_id: 1 hardcodeados ===
  describe('1. Sin organizationId hardcodeado a 1', () => {
    const allFiles = walkDir(SRC_ROOT).filter((f) => !isExcluded(f));
    const violations: string[] = [];

    beforeAll(() => {
      for (const file of allFiles) {
        const content = readFile(file);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (isCommentLine(trimmed)) return;
          const cleaned = stripCommentsAndStrings(line);
          if (/organizationId\s*:\s*1\b/.test(cleaned) || /organization_id\s*:\s*1\b/.test(cleaned)) {
            violations.push(`${rel(file)}:${idx + 1}: ${trimmed}`);
          }
        });
      }
    });

    test('no hay organizationId: 1 en código de producción', () => {
      if (violations.length > 0) {
        console.error('Violaciones encontradas:\n' + violations.join('\n'));
      }
      expect(violations).toHaveLength(0);
    });
  });

  // === Caso 2: Sin lecturas de tablas de plataforma ===
  describe('2. Sin lecturas de tablas de plataforma desde el CRM', () => {
    const platformTables = ['subscriptions', 'plans', 'sellers', 'payout'];
    const crmPaths = [
      path.join(SRC_ROOT, 'components', 'crm'),
      path.join(SRC_ROOT, 'app', 'api', 'crm'),
      path.join(SRC_ROOT, 'app', 'app', 'crm'),
      path.join(SRC_ROOT, 'lib', 'services', 'crm'),
    ];
    const violations: string[] = [];

    beforeAll(() => {
      for (const crmPath of crmPaths) {
        const files = walkDir(crmPath).filter((f) => !isExcluded(f));
        for (const file of files) {
          const content = readFile(file);
          for (const table of platformTables) {
            const pattern = new RegExp(`\\.from\\(['"]${table}`, 'g');
            if (pattern.test(content)) {
              violations.push(`${rel(file)}: referencia a tabla de plataforma '${table}'`);
            }
          }
        }
      }
    });

    test('el CRM no lee tablas de plataforma', () => {
      if (violations.length > 0) {
        console.error('Violaciones encontradas:\n' + violations.join('\n'));
      }
      expect(violations).toHaveLength(0);
    });
  });

  // === Caso 3: Sin display_order en el módulo CRM ===
  describe('3. Sin display_order en el módulo CRM', () => {
    const crmPaths = [
      path.join(SRC_ROOT, 'components', 'crm'),
      path.join(SRC_ROOT, 'app', 'api', 'crm'),
      path.join(SRC_ROOT, 'app', 'app', 'crm'),
      path.join(SRC_ROOT, 'lib', 'services', 'crm'),
    ];
    const violations: string[] = [];

    beforeAll(() => {
      for (const crmPath of crmPaths) {
        const files = walkDir(crmPath).filter((f) => !isExcluded(f));
        for (const file of files) {
          const content = readFile(file);
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (isCommentLine(trimmed)) return;
            const cleaned = stripCommentsAndStrings(line);
            if (/display_order/.test(cleaned)) {
              violations.push(`${rel(file)}:${idx + 1}: ${trimmed}`);
            }
          });
        }
      }
    });

    test('el CRM no usa display_order (debe usar position)', () => {
      if (violations.length > 0) {
        console.error('Violaciones encontradas:\n' + violations.join('\n'));
      }
      expect(violations).toHaveLength(0);
    });
  });

  // === Caso 4: callService.ts (muerto, G1/G2) fue eliminado en F0 ===
  describe('4. callService.ts eliminado', () => {
    test('src/lib/services/callService.ts no existe (código muerto eliminado en F0)', () => {
      const callServicePath = path.join(SRC_ROOT, 'lib', 'services', 'callService.ts');
      expect(fs.existsSync(callServicePath)).toBe(false);
    });

    test('nadie importa @/lib/services/callService', () => {
      const offenders = walkDir(SRC_ROOT)
        .filter((f) => !isExcluded(f))
        .filter((f) => /['"]@\/lib\/services\/callService['"]/.test(readFile(f)))
        .map(rel);
      expect(offenders).toEqual([]);
    });
  });

  // === Caso 5: organizationId del body sin getServerOrgContext ===
  describe('5. Ningún route.ts toma organizationId del body sin getServerOrgContext', () => {
    /**
     * Deuda legacy conocida (NO CRM): rutas anteriores a F0 que aún leen el org
     * del body/query con otra autenticación (Bearer + getUser, Stripe, cron,
     * webhooks firmados propios). Cada fase que las toque debe migrarlas y
     * quitarlas de esta lista. Prohibido añadir rutas nuevas.
     */
    const ALLOWLIST = new Set<string>([
      'app/api/auth/invite/route.ts', // flujo de invitación (org viene de la invitación)
      'app/api/categorias/reglas/route.ts',
      'app/api/crm/health/recalculate/route.ts', // cron/sesión propia (F9 lo migra)
      'app/api/crm/renewals/sync/route.ts', // cron (F8 lo migra)
      'app/api/crm/voice-agents/campaigns/run/route.ts', // cron fail-closed (F6 lo migra a withCron)
      'app/api/dian/lookup/route.ts',
      'app/api/domains/purchase/route.ts',
      'app/api/integrations/meta/setup/route.ts',
      'app/api/integrations/payfac/commission/route.ts', // verifyPlatformAdmin
      'app/api/integrations/payfac/payouts/route.ts', // verifyPlatformAdmin
      'app/api/integrations/tiktok/product-sync/route.ts',
      'app/api/integrations/tiktok/setup/route.ts',
      'app/api/integrations/whatsapp/oauth/callback/route.ts', // OAuth callback (org en `state` firmado por Meta)
      'app/api/stripe/create-checkout-session/route.ts',
      'app/api/facebook-feed/token/route.ts',
      'app/api/factus/credit-note/route.ts',
      'app/api/factus/debit-note/route.ts',
      'app/api/factus/invoice/route.ts',
      'app/api/factus/support-document/route.ts',
      'app/api/integrations/bancolombia/create-qr/route.ts',
      'app/api/integrations/bancolombia/wompi/create-qr/route.ts',
      'app/api/integrations/bold/create-link/route.ts',
      'app/api/integrations/bold/create-pos-payment/route.ts',
      'app/api/integrations/booking/create-connection/route.ts',
      'app/api/integrations/booking/push-availability/route.ts',
      'app/api/integrations/breb/create-qr/route.ts',
      'app/api/integrations/expedia/create-connection/route.ts',
      'app/api/integrations/expedia/push-availability/route.ts',
      'app/api/integrations/google-ads/oauth/authorize/route.ts',
      'app/api/integrations/meta/catalog-sync/route.ts',
      'app/api/integrations/meta/oauth/authorize/route.ts',
      'app/api/integrations/meta/product-sync/route.ts',
      'app/api/integrations/open-finance/consents/route.ts',
      'app/api/integrations/open-finance/consents/stats/route.ts',
      'app/api/integrations/open-finance/links/route.ts',
      'app/api/integrations/open-finance/refresh-balances/route.ts',
      'app/api/integrations/open-finance/sync/route.ts',
      'app/api/integrations/payfac/payout-accounts/route.ts',
      'app/api/integrations/qr/auto-match/route.ts',
      'app/api/integrations/redeban/create-qr/route.ts',
      'app/api/integrations/tiktok/catalog-sync/route.ts',
      'app/api/integrations/tiktok/oauth/authorize/route.ts',
      'app/api/modules/audit/route.ts',
      'app/api/modules/pages/route.ts',
      'app/api/modules/route.ts',
      'app/api/organization/enterprise/route.ts',
      'app/api/organization/members/route.ts',
      'app/api/pms/ical/sync/route.ts',
      'app/api/stripe/confirm-plan-change/route.ts',
      'app/api/stripe/create-addon-subscription/route.ts',
      'app/api/stripe/create-payment-intent/route.ts',
      'app/api/stripe/create-subscription/route.ts',
      'app/api/stripe/purchase-ai-credits/route.ts',
      'app/api/subscriptions/billing-portal/route.ts',
      'app/api/subscriptions/cancel/route.ts',
      'app/api/subscriptions/change-billing/route.ts',
      'app/api/subscriptions/change-plan/route.ts',
      'app/api/subscriptions/payment-methods/route.ts',
      'app/api/web-orders/route.ts', // x-webhook-secret propio
    ]);

    const BODY_ORG_PATTERNS = [
      /\b(body|req|request|json|data|payload)\??\.(organizationId|organization_id|orgId)\b/,
      /\{[^}]*\b(organizationId|organization_id|orgId)\b[^}]*\}\s*=\s*(await\s+)?(request|req)\.json\(\)/,
      /\{[^}]*\b(organizationId|organization_id|orgId)\b[^}]*\}\s*=\s*body\b/,
    ];

    const violations: string[] = [];
    const staleAllowlist: string[] = [];

    beforeAll(() => {
      const routes = walkDir(path.join(SRC_ROOT, 'app', 'api'))
        .filter((f) => !isExcluded(f) && /route\.ts$/.test(f));
      const offenders = new Set<string>();
      for (const file of routes) {
        const content = stripAllComments(readFile(file));
        const usesBodyOrg = BODY_ORG_PATTERNS.some((p) => p.test(content));
        if (!usesBodyOrg) continue;
        const hasCtx = /getServerOrgContext|withOrg\(/.test(content);
        if (!hasCtx) offenders.add(rel(file));
      }
      for (const f of offenders) if (!ALLOWLIST.has(f)) violations.push(f);
      for (const f of ALLOWLIST) if (!offenders.has(f)) staleAllowlist.push(f);
    });

    test('rutas CRM/IA/mensajería resuelven la org por sesión', () => {
      if (violations.length > 0) {
        console.error('route.ts con org del body sin getServerOrgContext:\n' + violations.join('\n'));
      }
      expect(violations).toEqual([]);
    });

    test('la allow-list no contiene entradas obsoletas (ya migradas)', () => {
      if (staleAllowlist.length > 0) {
        console.error('Quitar de ALLOWLIST (ya no usan org del body):\n' + staleAllowlist.join('\n'));
      }
      expect(staleAllowlist).toEqual([]);
    });
  });

  // === Caso 6: cliente browser en código de servidor ===
  describe('6. Código server no importa @/lib/supabase/config', () => {
    /**
     * Deuda legacy conocida (servicios que hoy se usan desde cliente Y servidor
     * con el cliente browser). Cada fase que los toque debe migrarlos a
     * `getServiceClient()` o inyección de cliente y quitarlos de aquí.
     */
    const ALLOWLIST = new Set<string>([
      'app/api/dian/lookup/route.ts',
      'app/api/factus/credit-note/route.ts',
      'app/api/factus/debit-note/route.ts',
      'app/api/factus/process-pending/route.ts',
      'app/api/factus/webhook/route.ts',
      'app/api/integrations/meta/oauth/authorize/route.ts',
      'app/api/integrations/tiktok/oauth/authorize/route.ts',
      'lib/services/crm/commercialMetricsService.ts',
      'lib/services/crm/commissionService.ts',
      'lib/services/crm/crmIntegrations.ts',
      'lib/services/crm/discoveryTemplateService.ts',
      'lib/services/crm/expansionService.ts',
      'lib/services/crm/followupService.ts',
      'lib/services/crm/healthScoreService.ts',
      'lib/services/crm/inventoryCrmLink.ts',
      'lib/services/crm/leadCaptureService.ts',
      'lib/services/crm/lossReasonsService.ts',
      'lib/services/crm/onboardingService.ts',
      'lib/services/crm/pipelineSeedService.ts',
      'lib/services/crm/pmsCrmLink.ts',
      'lib/services/crm/posCrmLink.ts',
      'lib/services/crm/proposalService.ts',
      'lib/services/crm/renewalService.ts',
      'lib/services/crm/scoringService.ts',
      'lib/services/crm/stageGateService.ts',
      'lib/services/crm/verticalsService.ts',
      'lib/services/integrations/booking/bookingAuthService.ts',
      'lib/services/integrations/booking/bookingAvailabilityService.ts',
      'lib/services/integrations/booking/bookingConnectionService.ts',
      'lib/services/integrations/booking/bookingContentService.ts',
      'lib/services/integrations/booking/bookingReservationService.ts',
      'lib/services/integrations/expedia/expediaAuthService.ts',
      'lib/services/integrations/expedia/expediaAvailabilityService.ts',
      'lib/services/integrations/expedia/expediaConnectionService.ts',
      'lib/services/integrations/expedia/expediaProductService.ts',
      'lib/services/integrations/expedia/expediaReservationService.ts',
      'lib/services/integrations/mercadopago/mercadopagoService.ts',
      'lib/services/integrations/meta/metaMarketingService.ts',
      'lib/services/integrations/paypal/paypalService.ts',
      'lib/services/integrations/payu/payuService.ts',
      'lib/services/integrations/sendgrid/sendgridService.ts',
      'lib/services/integrations/stripe/stripeClientService.ts',
      'lib/services/integrations/tiktok/tiktokMarketingService.ts',
      'lib/services/integrations/tripadvisor/tripadvisorLinkService.ts',
      'lib/services/integrations/whatsapp/whatsappClientService.ts',
      'lib/services/integrations/whatsapp/whatsappSyncService.ts',
      'lib/services/integrations/wompi/wompiService.ts',
      'lib/services/notificationService.ts', // cliente inyectable; default browser para UI
    ]);

    const SERVER_SCOPES = [
      path.join(SRC_ROOT, 'app', 'api'),
      path.join(SRC_ROOT, 'lib', 'services', 'integrations'),
      path.join(SRC_ROOT, 'lib', 'services', 'crm'),
      path.join(SRC_ROOT, 'lib', 'jobs'),
      path.join(SRC_ROOT, 'lib', 'security'),
    ];
    const SINGLE_FILES = [
      path.join(SRC_ROOT, 'lib', 'services', 'notificationService.ts'),
      path.join(SRC_ROOT, 'lib', 'utils', 'orgContext.ts'),
      // GO Assistant F0 (C4): `aiActionsService` importaba el cliente browser y
      // se ejecutaba dentro de un route handler, sin sesión y con la clave
      // anónima. Ahora recibe el cliente de sesión por parámetro.
      path.join(SRC_ROOT, 'lib', 'services', 'aiActionsService.ts'),
      path.join(SRC_ROOT, 'lib', 'services', 'aiAssistantService.ts'),
      path.join(REPO_ROOT, 'ws-server.ts'),
    ];

    const violations: string[] = [];
    const staleAllowlist: string[] = [];

    beforeAll(() => {
      const files = [...SERVER_SCOPES.flatMap((d) => walkDir(d)), ...SINGLE_FILES.filter((f) => fs.existsSync(f))]
        .filter((f) => !isExcluded(f));
      const offenders = new Set<string>();
      for (const file of files) {
        const content = stripAllComments(readFile(file));
        if (/from\s+['"]@\/lib\/supabase\/config['"]/.test(content)) {
          offenders.add(rel(file));
        }
      }
      for (const f of offenders) if (!ALLOWLIST.has(f)) violations.push(f);
      for (const f of ALLOWLIST) if (!offenders.has(f)) staleAllowlist.push(f);
    });

    test('ningún archivo de servidor (fuera de la allow-list) importa el cliente browser', () => {
      if (violations.length > 0) {
        console.error('Imports de @/lib/supabase/config en código server:\n' + violations.join('\n'));
      }
      expect(violations).toEqual([]);
    });

    test('la allow-list no contiene entradas obsoletas', () => {
      if (staleAllowlist.length > 0) {
        console.error('Quitar de ALLOWLIST (ya migrados):\n' + staleAllowlist.join('\n'));
      }
      expect(staleAllowlist).toEqual([]);
    });
  });

  // === Caso 7: webhooks verifican firma ===
  describe('7. Rutas webhook importan verify* de webhookSignatures', () => {
    const WEBHOOK_SCOPES = [
      path.join(SRC_ROOT, 'app', 'api', 'voice'),
      path.join(SRC_ROOT, 'app', 'api', 'integrations', 'twilio'),
      path.join(SRC_ROOT, 'app', 'api', 'integrations', 'whatsapp', 'webhook'),
      path.join(SRC_ROOT, 'app', 'api', 'email', 'webhook'),
      path.join(SRC_ROOT, 'app', 'api', 'webhooks'),
    ];
    /** Verifican firma con otro helper (documentado). */
    const ALLOWLIST = new Map<string, string>([
      ['app/api/webhooks/facebook/[channelId]/route.ts', 'metaMessagingService.verifySignature (X-Hub-Signature-256)'],
      ['app/api/webhooks/instagram/[channelId]/route.ts', 'metaMessagingService.verifySignature (X-Hub-Signature-256)'],
      ['app/api/email/webhook/route.ts', 'svix inline en emailService.handleEmailWebhook (F7 lo migra a verifyResendWebhook)'],
    ]);

    const violations: string[] = [];

    beforeAll(() => {
      const routes = WEBHOOK_SCOPES.flatMap((d) => walkDir(d)).filter((f) => !isExcluded(f) && /route\.ts$/.test(f));
      for (const file of routes) {
        const r = rel(file);
        if (ALLOWLIST.has(r)) continue;
        const content = stripAllComments(readFile(file));
        const importsVerify = /from\s+['"]@\/lib\/security\/webhookSignatures['"]/.test(content) &&
          /\b(verifyTwilioWebhook|verifyTwilioRequest|verifyMetaSignature|verifyResendWebhook|verifyCronSecret)\b/.test(content);
        const isSessionRoute = /getServerOrgContext|withOrg\(/.test(content);
        if (!importsVerify && !isSessionRoute) violations.push(r);
      }
    });

    test('todo webhook verifica firma (fail-closed) o es ruta de sesión', () => {
      if (violations.length > 0) {
        console.error('Rutas webhook sin verify*:\n' + violations.join('\n'));
      }
      expect(violations).toEqual([]);
    });
  });

  // === Caso 8: comm_settings .limit(1).single() fuera de orgContext ===
  describe('8. Sin .from(comm_settings).limit(1).single() (fallback "primera org")', () => {
    const violations: string[] = [];

    beforeAll(() => {
      const files = walkDir(SRC_ROOT).filter((f) => !isExcluded(f));
      // Sin flag `s`: el target del proyecto es es2017 (TS1501). `[\s\S]` cubre saltos de línea.
      //
      // FALSO POSITIVO CORREGIDO (2026-09-09): con `[\s\S]*?` el patrón saltaba de
      // una consulta a otra y marcaba un archivo por tener un `.from('comm_settings')`
      // correcto (filtrado por organización) y, cientos de líneas más abajo, un
      // `.limit(1)` y un `.single()` de consultas distintas. Le ocurrió a
      // `voiceAgentService.ts`, cuya consulta sí filtra por `organization_id`.
      // El encadenamiento que se persigue vive en UNA sola sentencia, así que el
      // comodín se acota a "sin punto y coma en medio".
      const pattern = /\.from\(\s*['"]comm_settings['"]\s*\)[^;]*?\.limit\(\s*1\s*\)[^;]*?\.single\(\)/;
      for (const file of files) {
        if (rel(file) === 'lib/utils/orgContext.ts') continue;
        const content = stripAllComments(readFile(file));
        if (pattern.test(content)) violations.push(rel(file));
      }
      const ws = path.join(REPO_ROOT, 'ws-server.ts');
      if (fs.existsSync(ws) && pattern.test(stripAllComments(readFile(ws)))) violations.push('ws-server.ts');
    });

    test('ningún archivo elige una comm_settings arbitraria', () => {
      if (violations.length > 0) {
        console.error('Fallback "primera org activa" detectado:\n' + violations.join('\n'));
      }
      expect(violations).toEqual([]);
    });
  });

  // === Caso 9: enums.ts sincronizado con los CHECK de BD ===
  describe('9. enums.ts coincide con el snapshot de CHECKs de BD', () => {
    const fixturePath = path.join(SRC_ROOT, 'lib', 'crm', '__fixtures__', 'db-checks.json');
    const fixture = JSON.parse(readFile(fixturePath)) as {
      checks: Record<string, string[]>;
      planned_extras?: Record<string, string[] | string>;
    };

    test('el fixture existe y tiene checks', () => {
      expect(Object.keys(fixture.checks).length).toBeGreaterThan(10);
    });

    for (const [key, dbValues] of Object.entries(fixture.checks)) {
      test(`${key}: enums.ts contiene exactamente los valores del CHECK`, () => {
        const enumValues = DB_CHECK_ENUMS[key];
        expect(enumValues).toBeDefined();
        const planned = Array.isArray(fixture.planned_extras?.[key]) ? (fixture.planned_extras![key] as string[]) : [];
        const missingInEnums = dbValues.filter((v) => !enumValues.includes(v));
        const extraInEnums = enumValues.filter((v) => !dbValues.includes(v) && !planned.includes(v));
        expect({ missingInEnums, extraInEnums }).toEqual({ missingInEnums: [], extraInEnums: [] });
      });
    }

    test('todo enum de DB_CHECK_ENUMS tiene su CHECK en el fixture', () => {
      const missing = Object.keys(DB_CHECK_ENUMS).filter((k) => !fixture.checks[k]);
      expect(missing).toEqual([]);
    });
  });
  // === Caso 11: GO Assistant — todo endpoint exige sesión + org ===
  //
  // `execute-action/route.ts` era el ÚNICO endpoint de `ai-assistant/` sin
  // `getServerOrgContext()`: tomaba del body la organización a la que escribir
  // (`action.organizationId`), el rol con el que autorizarse (`action.userRole`)
  // y si la acción ya estaba confirmada (`action.status`). Un POST sin sesión
  // escribía en la base de cualquier tenant.
  //
  // El caso 5 no lo cazaba: sus patrones buscan `body.organizationId` y
  // desestructuraciones de `request.json()`, y aquí el org venía anidado dentro
  // de `action`. Esta guarda es por ruta, no por patrón de acceso: si el archivo
  // existe bajo `ai-assistant/`, tiene que autenticar. Sin allow-list.
  describe('11. GO Assistant: todo route.ts de ai-assistant autentica', () => {
    const violations: string[] = [];

    beforeAll(() => {
      const routes = walkDir(path.join(SRC_ROOT, 'app', 'api', 'ai-assistant')).filter(
        (f) => !isExcluded(f) && /route\.ts$/.test(f)
      );
      for (const file of routes) {
        const content = stripAllComments(readFile(file));
        if (!/getServerOrgContext|withOrg\(/.test(content)) violations.push(rel(file));
      }
    });

    test('ningún endpoint del asistente responde sin sesión ni organización', () => {
      if (violations.length > 0) {
        console.error('Endpoints de ai-assistant sin getServerOrgContext:\n' + violations.join('\n'));
      }
      expect(violations).toEqual([]);
    });
  });

  // === Caso 12: GO Assistant — el rol no viaja del cliente al servidor ===
  //
  // C2: el rol efectivo se calculaba en el navegador con
  // `context.userRole.toLowerCase().includes('admin')` — un rol llamado
  // "Auxiliar administrativo" era admin — y viajaba en el body hasta el
  // ejecutor. Los permisos se resuelven ahora en el servidor
  // (`getAssistantCapabilities` + `evaluateAction`).
  describe('12. GO Assistant: el rol no se deriva del nombre en el cliente', () => {
    const violations: string[] = [];

    beforeAll(() => {
      const scopes = [
        path.join(SRC_ROOT, 'app', 'api', 'ai-assistant'),
        path.join(SRC_ROOT, 'lib', 'ai'),
        path.join(SRC_ROOT, 'components', 'app-layout', 'Header'),
      ];
      const files = scopes.flatMap((d) => walkDir(d)).filter((f) => !isExcluded(f));
      // "el rol contiene la subcadena admin" en cualquiera de sus formas.
      const pattern = /userRole[^\n;]*\.(includes|indexOf|match|startsWith)\s*\(/;
      for (const file of files) {
        const content = stripAllComments(readFile(file));
        if (pattern.test(content)) violations.push(rel(file));
      }
    });

    test('nadie infiere permisos del NOMBRE del rol', () => {
      if (violations.length > 0) {
        console.error('Rol inferido por subcadena:\n' + violations.join('\n'));
      }
      expect(violations).toEqual([]);
    });
  });

  // === Caso 13: GO Assistant — lista negra de acciones (§9.4) ===
  describe('13. GO Assistant: el catálogo no registra acciones prohibidas', () => {
    test('ninguna acción del catálogo está en la lista negra', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ALL_ACTION_TYPES, FORBIDDEN_ACTIONS } = require('@/lib/ai/assistant/actionCatalog');
      const forbidden = new Set<string>(FORBIDDEN_ACTIONS);
      const offenders = (ALL_ACTION_TYPES as string[]).filter((t) => forbidden.has(t));
      expect(offenders).toEqual([]);
    });

    test('la lista negra cubre organización, roles, plan y credenciales', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FORBIDDEN_ACTIONS } = require('@/lib/ai/assistant/actionCatalog');
      const list = FORBIDDEN_ACTIONS as string[];
      for (const must of [
        'delete_organization',
        'change_user_role',
        'update_subscription',
        'read_provider_credentials',
        'execute_sql',
      ]) {
        expect(list).toContain(must);
      }
    });
  });

  // === Caso 14: GO Assistant — nada escribe en tablas inexistentes (C3) ===
  //
  // El ejecutor escribía en `inventory`, `orders` y `order_items`, que no
  // existen en esta base (el stock vive en `stock_levels`, las ventas en
  // `sales`/`sale_items`), y en `products.price` / `products.cost` /
  // `products.is_active`, columnas que tampoco existen.
  describe('14. GO Assistant: sin tablas ni columnas fantasma', () => {
    const violations: string[] = [];

    beforeAll(() => {
      const scopes = [
        path.join(SRC_ROOT, 'app', 'api', 'ai-assistant'),
        path.join(SRC_ROOT, 'lib', 'ai'),
      ];
      const files = [
        ...scopes.flatMap((d) => walkDir(d)),
        path.join(SRC_ROOT, 'lib', 'services', 'aiActionsService.ts'),
      ].filter((f) => fs.existsSync(f) && !isExcluded(f));

      const ghostTables = ['inventory', 'orders', 'order_items'];
      for (const file of files) {
        const content = stripAllComments(readFile(file));
        for (const table of ghostTables) {
          if (new RegExp(`\\.from\\(\\s*['"]${table}['"]`).test(content)) {
            violations.push(`${rel(file)}: .from('${table}') — esa tabla no existe`);
          }
        }
      }
    });

    test('el asistente no consulta tablas que no existen', () => {
      if (violations.length > 0) {
        console.error('Tablas fantasma en el asistente:\n' + violations.join('\n'));
      }
      expect(violations).toEqual([]);
    });
  });

  describe('10. Ningún reembolso de créditos ignora su resultado', () => {
    // `refundAiCredits` devuelve `false` cuando la RPC rechaza, y NO lanza: lanzar
    // dentro del catch que atiende un fallo del proveedor enmascararía el error
    // original, que es lo que el llamador necesita. El precio de esa decisión es
    // que el booleano se puede ignorar, y en F4 se olvidó mirar DOS veces
    // (tester r3 fallo N1, tester r4 §2): la organización pagaba, el proveedor
    // fallaba, el reembolso se rechazaba y no quedaba rastro de la deuda.
    // Esta guarda cierra la reincidencia: en producción, toda llamada debe
    // asignar el resultado (`const ok = await …` / `x = await …`) para poder
    // comprobarlo. Sugerida por el tester de F4 en la ronda 4.
    test('toda llamada en producción asigna el valor devuelto', () => {
      const offenders = walkDir(SRC_ROOT)
        .filter((f) => !isExcluded(f) && /\.tsx?$/.test(f))
        .filter((f) => !f.includes('aiCostService')) // define la función
        .flatMap((file) => {
          const rel = path.relative(SRC_ROOT, file).split(path.sep).join('/');
          return readFile(file)
            .split(/\r?\n/)
            .map((line, i) => ({ line: line.trim(), n: i + 1 }))
            .filter(({ line }) => /(?:await\s+)?refundAiCredits\s*\(/.test(line))
            // Se exige que la línea de la llamada guarde el resultado.
            .filter(({ line }) => !/(?:const|let|var|return)\s|^\w[\w.]*\s*=|=\s*(?:await\s+)?refundAiCredits/.test(line))
            .map(({ n }) => `${rel}:${n}`);
        });
      expect(offenders).toEqual([]);
    });
  });
});
