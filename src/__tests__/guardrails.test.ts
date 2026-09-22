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
 * 18. `vercel.json` ↔ `src/lib/jobs/schedule.ts`: los crons de `/api/crm/jobs/run`
 *     son exactamente el drenaje total (`*\/DRAIN_INTERVAL_MIN`) y las claves de
 *     `VERCEL_SCHEDULE_KINDS`; ningún otro archivo cablea la cadencia.
 * 20. Ningún archivo de src/ filtra `integration_connections` por
 *     `status = 'active'`: el CHECK real es draft|connected|paused|error|revoked.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DB_CHECK_ENUMS } from '@/lib/crm/enums';
import { DRAIN_INTERVAL_MIN, DRAIN_SCHEDULE, JOBS_RUN_PATH, JOBS_RUN_SCHEDULES, VERCEL_SCHEDULE_KINDS } from '@/lib/jobs/schedule';

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
  describe('5. Rutas de escritura: la organización sale de la sesión y un body ajeno responde 403', () => {
    /**
     * F0-SEC r2 (sub-parte C): el guardarraíl pasó de comparar a NIVEL DE
     * ARCHIVO («aparece org en body» vs «aparece getServerOrgContext») a
     * comprobar cada HANDLER EXPORTADO (`export async function POST` /
     * `export const POST = withOrg(`…). Antes, un `POST` que leyera la
     * organización del body pasaba solo porque el `GET` del mismo archivo
     * tenía sesión (tester F0-SEC r1, fallo 6: `crm/renewals/sync`).
     *
     * Dos ámbitos:
     *
     * (A) ESTRICTO — `crm/**` y `ai-assistant/**`. Todo handler POST/PUT/PATCH/
     *     DELETE debe cumplir las dos mitades de la regla dura 5:
     *       (a) resolver la organización por sesión en el propio handler
     *           (`withOrg(`, `getServerOrgContext(`, `getServerOrgContextFor(`,
     *           `withWhatsAppRoute(`), y
     *       (b) llamar al punto único que convierte una organización ajena en
     *           403 + registro: `readOrgBody(` (`@/lib/security/organizationBody`)
     *           o sus envoltorios `rejectForeignOrganization(` (F12/F13),
     *           `foreignOrgResponse(` (F10) o `foreignOrganizationInBody(`.
     *     La llamada puede vivir en un helper LOCAL del archivo que el handler
     *     invoque. Y si es la sobrecarga síncrona (`readOrgBody(ctx, body)`,
     *     porque la ruta parseó el JSON/FormData para su propio 400), debe
     *     llevar `{ request }` para que la query string también se compruebe
     *     (deuda C de F0-SEC); basta con que el mismo handler tenga además
     *     `readOrgBody(ctx, request)`. Quedan fuera automáticamente los handlers de cron
     *     (`withCron(` / `verifyCronSecret(`) y los webhooks firmados
     *     (`verify*` de `webhookSignatures`, `constructEvent`, documenso): ahí
     *     no hay sesión y la organización sale de la firma o de la fila.
     *     `STRICT_ALLOWLIST`: rutas que todavía no cumplen (b), con motivo.
     *     Prohibido añadir entradas nuevas sin motivo; quitar cuando se migren.
     *
     * (B) LEGACY — resto de `src/app/api`: si un handler lee la organización
     *     del body/query, ese MISMO handler debe tener el contexto de sesión.
     *     `ALLOWLIST` = deuda anterior a F0 (Bearer + getUser, Stripe, cron,
     *     webhooks propios). Cada fase que las toque debe migrarlas y quitarlas.
     */
    const STRICT_ALLOWLIST = new Map<string, string>([
      // Propiedad de la sesión F10–F13 (2026-09-15): handlers que aún no llaman al
      // punto único. Cambio exacto por archivo en
      // docs/crm-revenue-os/rondas/F0-SEC-CD-builder-r2.md §(b). Sus POST/PATCH con
      // body ya usan `rejectForeignOrganization`; faltan los DELETE/POST sin body.
    ]);

    const ALLOWLIST = new Set<string>([
      'app/api/categorias/reglas/route.ts',
      'app/api/dian/lookup/route.ts',
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
    const SESSION_RE = /\b(withOrg|getServerOrgContext|getServerOrgContextFor|withWhatsAppRoute)\s*\(/;
    const CRON_RE = /\b(withCron|verifyCronSecret)\s*\(/;
    // Solo verificaciones de FIRMA. `isPlaceholderCredential` no lo es: mencionarla
    // eximía al handler del contrato (tester r2, mutación M17).
    const WEBHOOK_RE = /\b(verifyTwilioWebhook|verifyTwilioRequest|verifyMetaSignature|verifyResendWebhook|constructEvent|verifyDocumensoWebhook|verifyElevenLabsWebhook)\s*\(|webhooks\.constructEvent/;
    const FOREIGN_RE = /\b(readOrgBody|rejectForeignOrganization|foreignOrgResponse|foreignOrganizationInBody)(?:<[^>]*>)?\s*\(/;
    // Deuda C de F0-SEC (cerrada 2026-09-16): la sobrecarga síncrona
    // `readOrgBody(ctx, bodyYaParseado)` solo mira la query string si recibe
    // `{ request }` en las opciones. Un handler estricto que la use sin esa
    // opción deja pasar `?organization_id=999` (37 rutas lo hacían), salvo que
    // en el mismo handler ya haya `readOrgBody(ctx, request)`, que sí la mira.
    const REQUEST_ARG_RE = /^_?(?:req|request|nextReq|nextRequest)$/;
    const READ_ORG_BODY_CALL_RE = /\breadOrgBody(?:<[^>]*>)?\s*\(/g;
    const OPTS_REQUEST_RE = /[{,]\s*request\s*[:,}]/;
    const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const HANDLER_RE = /^export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/;
    // Reexportaciones `export { POST } from '…'` / `export { handler as POST } from '…'`:
    // el cuerpo vive en otro archivo y este guardarraíl no lo ve (tester C+D r3,
    // mutante G7b; QA r3 «A»). En ámbito estricto se prohíben salvo hacia `crm/webhooks/`.
    const REEXPORT_RE = /^export\s*\{[^}]*\b(GET|POST|PUT|PATCH|DELETE)\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/gm;
    function reexportsHandlers(content: string): string[] {
      const targets: string[] = [];
      let rx: RegExpExecArray | null;
      REEXPORT_RE.lastIndex = 0;
      while ((rx = REEXPORT_RE.exec(content))) if (!/crm\/webhooks\//.test(rx[2])) targets.push(rx[2]);
      return targets;
    }
    const TOP_LEVEL_RE = /^(export\s|async function |function |const |let |type |interface )/;

    type Handler = { method: string; text: string };

    /** Divide un route.ts (sin comentarios) en sus handlers exportados. */
    function splitHandlers(content: string): Handler[] {
      const lines = content.split(/\r?\n/);
      const starts: Array<{ line: number; method: string }> = [];
      lines.forEach((l, i) => {
        const m = HANDLER_RE.exec(l);
        if (m) starts.push({ line: i, method: m[1] });
      });
      return starts.map(({ line, method }, k) => {
        let end = k + 1 < starts.length ? starts[k + 1].line : lines.length;
        for (let t = line + 1; t < end; t++) {
          if (TOP_LEVEL_RE.test(lines[t])) {
            end = t;
            break;
          }
        }
        return { method, text: lines.slice(line, end).join('\n') };
      });
    }

    /**
     * Nombres de funciones/constantes locales cuyo cuerpo contiene `re`.
     *
     * El cuerpo de un helper acaba en la SIGUIENTE LÍNEA DE NIVEL SUPERIOR
     * (`TOP_LEVEL_RE`, la misma técnica que `splitHandlers`), no en la siguiente
     * declaración que case con `declRe`. Antes, como `export async function
     * POST` no casa con `declRe`, un `function fail()` declarado antes de los
     * handlers «contenía» el `readOrgBody` de todos ellos y cualquier handler
     * que llamara a `fail(` pasaba sin `readOrgBody` propio: 15 handlers ciegos
     * (tester r2 fallo 2, QA r2 §2, mutación M18).
     */
    function localHelperBodies(content: string): Array<{ name: string; text: string }> {
      const bodies: Array<{ name: string; text: string }> = [];
      const declRe = /^(?:async\s+)?function\s+(\w+)\s*\(|^const\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function)/gm;
      const nextTopLevel = new RegExp(TOP_LEVEL_RE.source.replace('^', '\\n'));
      const decls: Array<{ name: string; start: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = declRe.exec(content))) decls.push({ name: m[1] ?? m[2], start: m.index });
      decls.forEach((d, i) => {
        let end = i + 1 < decls.length ? decls[i + 1].start : content.length;
        const next = content.slice(d.start + 1, end).search(nextTopLevel);
        if (next >= 0) end = d.start + 1 + next;
        bodies.push({ name: d.name, text: content.slice(d.start, end) });
      });
      return bodies;
    }

    function localHelpersMatching(content: string, re: RegExp): string[] {
      return localHelperBodies(content).filter((h) => re.test(h.text)).map((h) => h.name);
    }

    function usesHelper(handler: Handler, helpers: string[]): boolean {
      return helpers.some((h) => new RegExp(`\\b${h}\\s*\\(|\\b${h}\\b\\s*[;,)]`).test(handler.text));
    }

    /** Argumentos de nivel superior de la llamada que empieza en `open` (índice del `(`). */
    function callArgs(text: string, open: number): string[] {
      let depth = 0;
      let cur = '';
      const args: string[] = [];
      for (let i = open; i < text.length; i++) {
        const c = text[i];
        if ('({['.includes(c)) depth++;
        if (')}]'.includes(c)) depth--;
        if (i === open) continue;
        if (depth === 0) {
          if (cur.trim()) args.push(cur.trim());
          return args;
        }
        if (c === ',' && depth === 1) {
          args.push(cur.trim());
          cur = '';
        } else cur += c;
      }
      return args;
    }

    /**
     * Llamadas a la sobrecarga síncrona `readOrgBody(ctx, bodyYaParseado)` que
     * NO pasan `{ request }` y, por tanto, no ven la query string. Devuelve las
     * llamadas ofensoras salvo que el mismo texto ya tenga una llamada con la
     * `Request` (`readOrgBody(ctx, request)`), que sí la comprueba.
     */
    function syncReadsWithoutQuery(text: string): string[] {
      const offending: string[] = [];
      let sawRequestOverload = false;
      let m: RegExpExecArray | null;
      READ_ORG_BODY_CALL_RE.lastIndex = 0;
      while ((m = READ_ORG_BODY_CALL_RE.exec(text))) {
        const open = m.index + m[0].length - 1;
        const args = callArgs(text, open);
        if (args.length < 2) continue;
        if (REQUEST_ARG_RE.test(args[1])) {
          sawRequestOverload = true;
          continue;
        }
        if (args.length >= 3 && OPTS_REQUEST_RE.test(args[2])) continue;
        offending.push(text.slice(m.index, open + 1) + args.join(', ') + ')');
      }
      return sawRequestOverload ? [] : offending;
    }

    /** Reconoce `export const POST = handle;` / `withCron(handle)` / `withOrg(handler)`: el cuerpo real es el helper. */
    function inlineAliases(handler: Handler, content: string): string {
      const alias = /=\s*(?:\w+\()?\s*(\w+)\s*\)?\s*;?\s*$/.exec(handler.text.split('\n')[0]);
      if (!alias) return handler.text;
      const helperRe = new RegExp(`^(?:async\\s+)?function\\s+${alias[1]}\\s*\\(|^const\\s+${alias[1]}\\s*=`, 'm');
      const start = content.search(helperRe);
      if (start < 0) return handler.text;
      const rest = content.slice(start + 1);
      const next = rest.search(TOP_LEVEL_RE.source.replace('^', '\\n'));
      return handler.text + '\n' + (next >= 0 ? rest.slice(0, next) : rest);
    }

    /**
     * Métodos de escritura del archivo que incumplen: en ámbito estricto, los que
     * no tienen sesión O no llaman al punto único (salvo cron/webhook) O llaman a
     * la sobrecarga síncrona sin `{ request }` (la query quedaría sin mirar); en
     * legacy, los que leen la organización del body sin sesión en ese mismo handler.
     */
    function offendingHandlers(content: string, strict: boolean): string[] {
      const handlers = splitHandlers(content).map((h) => ({ ...h, text: inlineAliases(h, content) }));
      const helperBodies = localHelperBodies(content);
      const sessionHelpers = localHelpersMatching(content, SESSION_RE);
      const foreignHelpers = localHelpersMatching(content, FOREIGN_RE);
      const cronHelpers = localHelpersMatching(content, CRON_RE);
      const webhookHelpers = localHelpersMatching(content, WEBHOOK_RE);
      const offenders: string[] = [];

      for (const h of handlers) {
        if (!WRITE_METHODS.has(h.method)) continue;
        const hasSession = SESSION_RE.test(h.text) || usesHelper(h, sessionHelpers);
        const isCron = CRON_RE.test(h.text) || usesHelper(h, cronHelpers);
        const isWebhook = WEBHOOK_RE.test(h.text) || usesHelper(h, webhookHelpers);
        const hasForeign = FOREIGN_RE.test(h.text) || usesHelper(h, foreignHelpers);

        if (strict) {
          if (isCron || isWebhook) continue;
          // El handler más los helpers locales con `readOrgBody` que invoca:
          // la sobrecarga síncrona sin `{ request }` puede vivir en cualquiera.
          const usedHelpers = helperBodies.filter((b) => foreignHelpers.includes(b.name) && usesHelper(h, [b.name]));
          const effective = [h.text, ...usedHelpers.map((b) => b.text)].join('\n');
          const syncWithoutQuery = syncReadsWithoutQuery(effective).length > 0;
          if (!hasSession || !hasForeign || syncWithoutQuery) offenders.push(h.method);
          continue;
        }
        const usesBodyOrg = BODY_ORG_PATTERNS.some((p) => p.test(h.text));
        if (usesBodyOrg && !hasSession) offenders.push(h.method);
      }
      return offenders;
    }

    const strictViolations: string[] = [];
    const strictStale: string[] = [];
    const legacyViolations: string[] = [];
    const legacyStale: string[] = [];

    beforeAll(() => {
      const apiRoot = path.join(SRC_ROOT, 'app', 'api');
      const routes = walkDir(apiRoot).filter((f) => !isExcluded(f) && /route\.ts$/.test(f));
      const strictOffenders = new Set<string>();
      const legacyOffenders = new Set<string>();

      for (const file of routes) {
        const relPath = rel(file);
        let content: string;
        try {
          content = stripAllComments(readFile(file));
        } catch (err) {
          // Archivos transitorios de otros agentes (tester r1, fallo 14): saltar, no caer.
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw err;
        }
        const strict = /^app\/api\/(crm|ai-assistant)\//.test(relPath);
        // `crm/webhooks/**` no tiene sesión por diseño: la organización sale de la
        // firma (Stripe `constructEvent`, Documenso, ElevenLabs) o de la fila.
        // Que verifiquen firma lo vigila el guardarraíl 7 y la sub-parte A.
        if (/^app\/api\/crm\/webhooks\//.test(relPath)) continue;
        if (strict && reexportsHandlers(content).length > 0) strictOffenders.add(relPath);
        if (offendingHandlers(content, strict).length === 0) continue;
        (strict ? strictOffenders : legacyOffenders).add(relPath);
      }

      for (const f of strictOffenders) if (!STRICT_ALLOWLIST.has(f)) strictViolations.push(f);
      for (const f of STRICT_ALLOWLIST.keys()) if (!strictOffenders.has(f)) strictStale.push(f);
      for (const f of legacyOffenders) if (!ALLOWLIST.has(f)) legacyViolations.push(f);
      for (const f of ALLOWLIST) if (!legacyOffenders.has(f)) legacyStale.push(f);
    });

    test('todo handler de escritura de crm/** y ai-assistant/** resuelve la org por sesión Y llama a readOrgBody (403 ante org ajena, también en la query)', () => {
      if (strictViolations.length > 0) {
        console.error('handlers POST/PUT/PATCH/DELETE sin sesión, sin readOrgBody o con la sobrecarga síncrona sin { request }:\n' + strictViolations.sort().join('\n'));
      }
      expect(strictViolations.sort()).toEqual([]);
    });

    /**
     * Rutas de la pantalla del cliente remota (F3): NO tienen sesión —una
     * tableta emparejada no es un usuario— y por eso están excluidas del
     * middleware. Lo que las sostiene es que la organización sale de la FILA
     * de la terminal a la que apunta el token, nunca de la petición. Este
     * caso vigila las dos mitades: que la exclusión siga escrita en el
     * middleware y que ninguna de esas rutas lea la organización de lo que
     * llega. Si alguien retira la exclusión, la ruta deja de responder; si
     * alguien mete un organizationId del body, salta aquí.
     */
    test('las rutas sin sesión de /api/pos/display/** están excluidas del middleware y resuelven la organización desde la terminal', () => {
      const middleware = fs.readFileSync(path.join(SRC_ROOT, 'middleware.ts'), 'utf8');
      expect(middleware).toMatch(/\/api\/pos\/display\//);

      const dir = path.join(SRC_ROOT, 'app', 'api', 'pos', 'display');
      const rutas = walkDir(dir).filter((f) => f.endsWith('route.ts'));
      expect(rutas.length).toBeGreaterThanOrEqual(4); // pair, bootstrap, heartbeat, revoke

      const ofensores: string[] = [];
      for (const file of rutas) {
        const rel = path.relative(SRC_ROOT, file).split(path.sep).join('/');
        const content = fs.readFileSync(file, 'utf8');
        // /revoke sí tiene sesión (admin que desempareja): se rige por el
        // contrato normal. Las demás autentican por token.
        const conSesion = SESSION_RE.test(content);
        const tomaOrgDeLaPeticion = BODY_ORG_PATTERNS.some((re) => re.test(content));
        if (tomaOrgDeLaPeticion && !conSesion) ofensores.push(rel);
        // Sin sesión solo hay dos credenciales posibles: el token de la
        // pantalla (bootstrap, heartbeat) o el código de emparejamiento de un
        // solo uso con rate limit (pair). Cualquier otra cosa es una ruta
        // abierta detrás de la exclusión del middleware.
        // `resolveDisplayActor` (F4, `lib/pos/display/server/displayActor.ts`) es
        // la TERCERA credencial válida y no un agujero: con cabecera Bearer
        // delega en `authenticateDisplayRequest` (el mismo token de F3) y, sin
        // ella, exige `getServerOrgContext` y comprueba la terminal contra la
        // organización de la SESIÓN. En los dos caminos la organización y la
        // sucursal salen de la fila de `pos_terminals`, nunca de la petición,
        // que es justo lo que vigila este caso. Se exige el import para que el
        // nombre no pueda venir de un comentario.
        const conActor = /from '@\/lib\/pos\/display\/server\/displayActor'/.test(content) && /resolveDisplayActor\s*\(/.test(content);
        const conToken = conActor || /authenticateDisplayRequest|requireDisplayToken|displayAuth/.test(content);
        const esCanje = /\bcheckRateLimit\s*\(/.test(content) && /PAIR_RATE_LIMIT|pairing_code/.test(content);
        if (!conSesion && !conToken && !esCanje) ofensores.push(`${rel} (sin sesión, sin token y sin canje con límite)`);
      }
      expect(ofensores.sort()).toEqual([]);
    });

    test('la allow-list estricta no contiene entradas obsoletas (ya adoptaron readOrgBody)', () => {
      if (strictStale.length > 0) {
        console.error('Quitar de STRICT_ALLOWLIST (ya cumplen):\n' + strictStale.join('\n'));
      }
      expect(strictStale).toEqual([]);
    });

    test('fuera del CRM, ningún handler toma la organización del body sin sesión en ese mismo handler', () => {
      if (legacyViolations.length > 0) {
        console.error('handlers con org del body sin getServerOrgContext:\n' + legacyViolations.join('\n'));
      }
      expect(legacyViolations).toEqual([]);
    });

    test('la allow-list legacy no contiene entradas obsoletas (ya migradas)', () => {
      if (legacyStale.length > 0) {
        console.error('Quitar de ALLOWLIST (ya no usan org del body):\n' + legacyStale.join('\n'));
      }
      expect(legacyStale).toEqual([]);
    });

    test('el divisor por handler distingue un POST cron de un GET con sesión en el mismo archivo (fallo 6 del tester r1)', () => {
      const sample = [
        "export async function POST(request: Request) {",
        "  verifyCronSecret(request);",
        "  const body = await request.json();",
        "  const org = body.organization_id;",
        "  return Response.json({ org });",
        "}",
        "",
        "export async function GET() {",
        "  const ctx = await getServerOrgContext();",
        "  return Response.json({ ctx });",
        "}",
      ].join('\n');
      const handlers = splitHandlers(sample);
      expect(handlers.map((h) => h.method)).toEqual(['POST', 'GET']);
      expect(SESSION_RE.test(handlers[0].text)).toBe(false);
      expect(CRON_RE.test(handlers[0].text)).toBe(true);
      expect(SESSION_RE.test(handlers[1].text)).toBe(true);
    });

    test('un helper local declarado antes de los handlers no «presta» su readOrgBody: el DELETE sin llamada propia es ofensor (tester r2 fallo 2, M18)', () => {
      const sample = [
        "function fail(msg: string) {",
        "  return Response.json({ error: msg }, { status: 400 });",
        "}",
        "",
        "export async function POST(request: Request) {",
        "  const ctx = await getServerOrgContext(request);",
        "  const body = await readOrgBody(ctx, request);",
        "  if (!body.name) return fail('name');",
        "  return Response.json({ ok: true });",
        "}",
        "",
        "export async function DELETE(request: Request) {",
        "  const ctx = await getServerOrgContext(request);",
        "  if (!ctx) return fail('ctx');",
        "  return Response.json({ ok: true });",
        "}",
      ].join('\n');
      // `fail` termina en la siguiente línea de nivel superior: NO contiene el readOrgBody del POST.
      expect(localHelpersMatching(sample, FOREIGN_RE)).toEqual([]);
      expect(offendingHandlers(sample, true)).toEqual(['DELETE']);
      // Y un helper que SÍ llama al punto único sigue cubriendo a quien lo invoca
      // (con `{ request }`: desde la deuda C, la síncrona sin la opción es ofensora).
      const viaHelper = sample.replace("function fail(msg: string) {", "function fail(msg: string) {\n  readOrgBody(ctx, msg, { request });");
      expect(localHelpersMatching(viaHelper, FOREIGN_RE)).toEqual(['fail']);
      expect(offendingHandlers(viaHelper, true)).toEqual([]);
    });

    test('mencionar isPlaceholderCredential( no exime del contrato: no es una verificación de firma (tester r2, M17)', () => {
      const sample = [
        "export async function POST(request: Request) {",
        "  const ctx = await getServerOrgContext(request);",
        "  if (isPlaceholderCredential('x')) return Response.json({}, { status: 500 });",
        "  return Response.json({ ok: true });",
        "}",
      ].join('\n');
      expect(offendingHandlers(sample, true)).toEqual(['POST']);
      expect(offendingHandlers(sample.replace("getServerOrgContext(request);", "getServerOrgContext(request);\n  await readOrgBody(ctx, request);"), true)).toEqual([]);
    });

    test('la sobrecarga síncrona readOrgBody(ctx, body) sin { request } no ve la query: ofensor en ámbito estricto (deuda C de F0-SEC)', () => {
      const sample = [
        "export async function POST(request: NextRequest) {",
        "  const ctx = await getServerOrgContext(request);",
        "  const body = await request.json().catch(() => null);",
        "  readOrgBody(ctx, body);",
        "  return Response.json({ ok: true });",
        "}",
        "",
        "export async function PATCH(request: NextRequest) {",
        "  const ctx = await getServerOrgContext(request);",
        "  const parsed = schema.safeParse(readOrgBody(ctx, await request.json().catch(() => null), { request }));",
        "  return Response.json({ ok: parsed.success });",
        "}",
        "",
        "export async function PUT(request: NextRequest) {",
        "  const ctx = await getServerOrgContext(request);",
        "  const form = readOrgBody(ctx, await request.formData(), { route: 'x', request: request });",
        "  return Response.json({ ok: !!form });",
        "}",
        "",
        "export async function DELETE(request: NextRequest) {",
        "  const ctx = await getServerOrgContext(request);",
        "  await readOrgBody(ctx, request);",
        "  readOrgBody(ctx, { a: 1 });",
        "  return Response.json({ ok: true });",
        "}",
      ].join('\n');
      // POST: sin `{ request }` → ofensor. PATCH y PUT: con la opción (sola o tras
      // `route`) → cumplen. DELETE: la síncrona sin opción queda cubierta por la
      // llamada con la Request del mismo handler.
      expect(syncReadsWithoutQuery(sample.split('\n\n')[0])).toEqual(['readOrgBody(ctx, body)']);
      expect(offendingHandlers(sample, true)).toEqual(['POST']);
      expect(offendingHandlers(sample.replace('readOrgBody(ctx, body);', 'readOrgBody(ctx, body, { request });'), true)).toEqual([]);
      // Fuera del ámbito estricto no aplica (legacy solo mira org-del-body sin sesión).
      expect(offendingHandlers(sample, false)).toEqual([]);
      // Un helper local que llama a la síncrona sin `{ request }` contagia al handler que lo usa.
      const viaHelper = [
        "function guard(ctx: OrgBodyContext, raw: unknown) {",
        "  return readOrgBody(ctx, raw);",
        "}",
        "",
        "export async function POST(request: NextRequest) {",
        "  const ctx = await getServerOrgContext(request);",
        "  const body = guard(ctx, await request.json().catch(() => null));",
        "  return Response.json({ ok: !!body });",
        "}",
      ].join('\n');
      expect(offendingHandlers(viaHelper, true)).toEqual(['POST']);
      expect(offendingHandlers(viaHelper.replace('readOrgBody(ctx, raw)', 'readOrgBody(ctx, raw, { request })'), true)).toEqual([]);
      // La genérica y el alias `req` también se reconocen.
      expect(syncReadsWithoutQuery("readOrgBody<Body>(ctx, parsed)")).toEqual(['readOrgBody<Body>(ctx, parsed)']);
      expect(syncReadsWithoutQuery("await readOrgBody(ctx, req); readOrgBody(ctx, parsed)")).toEqual([]);
      expect(syncReadsWithoutQuery("readOrgBody(ctx, parsed, { request: req })")).toEqual([]);
    });

    test('una reexportación de handler oculta el cuerpo al guardarraíl: prohibida en ámbito estricto salvo hacia crm/webhooks/ (tester r3, G7b)', () => {
      expect(reexportsHandlers("export { POST } from '../otra/route';")).toEqual(['../otra/route']);
      expect(reexportsHandlers("export { handler as DELETE, GET } from '@/app/api/crm/x/route';")).toEqual(['@/app/api/crm/x/route']);
      expect(reexportsHandlers("export { POST } from '@/app/api/crm/webhooks/stripe/route';")).toEqual([]);
      expect(reexportsHandlers("export { dynamic } from './config';")).toEqual([]);
      expect(reexportsHandlers("export async function POST(request: Request) { return Response.json({}); }")).toEqual([]);
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
      ['app/api/email/webhook/route.ts', 'verifyResendWebhook se llama dentro de crm/email/webhookService.ts (F7), no en la ruta; la ruta solo importa webhookErrorResponse/WebhookError'],
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ALL_ACTION_TYPES, FORBIDDEN_ACTIONS } = require('@/lib/ai/assistant/actionCatalog');
      const forbidden = new Set<string>(FORBIDDEN_ACTIONS);
      const offenders = (ALL_ACTION_TYPES as string[]).filter((t) => forbidden.has(t));
      expect(offenders).toEqual([]);
    });

    test('la lista negra cubre organización, roles, plan y credenciales', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // === Caso 15: app_branch_access — propiedades de seguridad (F-08) ===
  //
  // app_branch_access se ejecuta en una política RESTRICTIVE sobre 19 tablas.
  // Tres versiones se aplicaron en dos días; la v1 tenia un bug de fuga
  // entre organizaciones. Estos tests verifican que la migración SQL contiene
  // las cuatro propiedades de seguridad que la función debe tener:
  //
  // 1. (2) acotada por organización (ser admin de la org A no abre la org B)
  // 2. (3) filtra por is_active (miembro desactivado sin acceso)
  // 3. (4) acotada por organización + membresía verificada
  // 4. STABLE (para que Postgres pueda cachear por sentencia)
  describe('15. app_branch_access: propiedades de seguridad de la migración', () => {
    const migrationPath = path.join(
      REPO_ROOT, 'supabase', 'migrations',
      '20260910160100_f08_fix_app_branch_access.sql'
    );
    let sql = '';

    beforeAll(() => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      sql = readFile(migrationPath);
    });

    test('la migración existe', () => {
      expect(sql.length).toBeGreaterThan(0);
    });

    test('(2) está acotada por organización dueña del branch', () => {
      // La cláusula (2) debe verificar om.organization_id contra la org del branch
      expect(sql).toMatch(/om\.organization_id\s*=\s*\(\s*SELECT\s+b\.organization_id\s+FROM\s+branches\s+b\s+WHERE\s+b\.id\s*=\s*p_branch_id\s*\)/);
    });

    test('(2) filtra por is_active', () => {
      // Debe haber un om.is_active = true antes de la cláusula (3)
      expect(sql).toMatch(/om\.is_active\s*=\s*true/);
    });

    test('(3) filtra por is_active', () => {
      // La cláusula (3) debe tener om.is_active = true
      // Buscar el segundo occurrence de is_active = true (en la cláusula 3)
      const matches = sql.match(/om\.is_active\s*=\s*true/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(3); // (2), (3) y (4)
    });

    test('(4) verifica membresía en la org antes de aplicar sin restricción', () => {
      // (4) debe tener EXISTS en organization_members para la org del branch
      // Y NOT EXISTS en member_branches para esa misma org
      expect(sql).toMatch(/--\s*\(4\)[\s\S]*OR\s*\(\s*EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+organization_members\s+om/);
      expect(sql).toMatch(/AND\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+member_branches\s+mb/);
    });

    test('(4) acota NOT EXISTS por organización', () => {
      // El NOT EXISTS de (4) debe filtrar por b.organization_id = org del branch
      expect(sql).toMatch(/b\.organization_id\s*=\s*\(\s*SELECT\s+b2\.organization_id\s+FROM\s+branches\s+b2/);
    });

    test('la función es STABLE', () => {
      expect(sql).toMatch(/STABLE/);
    });

    test('la función es SECURITY DEFINER', () => {
      expect(sql).toMatch(/SECURITY\s+DEFINER/);
    });

    test('no falta is_active en ninguna cláusula con EXISTS', () => {
      // Cada EXISTS que toca organization_members debe filtrar is_active
      const omBlocks = sql.split('FROM organization_members');
      // El primer elemento es el prefijo; los demás son bloques que siguen a FROM organization_members
      for (let i = 1; i < omBlocks.length; i++) {
        const block = omBlocks[i].substring(0, 200);
        expect(block).toMatch(/is_active\s*=\s*true/);
      }
    });
  });

  describe('Carga de páginas tolerante a solicitudes bloqueadas', () => {
    const supabaseConfig = readFile(path.join(SRC_ROOT, 'lib', 'supabase', 'config.ts'));
    const subscriptionGuard = readFile(path.join(SRC_ROOT, 'lib', 'hooks', 'useSubscriptionGuard.ts'));
    const inicio = readFile(path.join(SRC_ROOT, 'app', 'app', 'inicio', 'page.tsx'));
    const kpis = readFile(path.join(SRC_ROOT, 'components', 'inicio', 'DashboardKPIs.tsx'));

    test('datos y refresh tienen timeout sin cancelar el resto de auth', () => {
      expect(supabaseConfig).toContain('const DATA_REQUEST_TIMEOUT_MS = 15_000;');
      expect(supabaseConfig).toContain('const DATA_WRITE_TIMEOUT_MS = 45_000;');
      expect(supabaseConfig).toContain('const TOKEN_REFRESH_TIMEOUT_MS = 12_000;');
      expect(supabaseConfig).toContain("const isDataRequest = urlString.includes('/rest/v1/');");
      expect(supabaseConfig).toContain("const isTokenRefreshRequest = isAuthRequest && urlString.includes('grant_type=refresh_token');");
      expect(supabaseConfig).toContain('const controller = (useOfflineLogic || isDataRequest || isTokenRefreshRequest) ? new AbortController() : null;');
      expect(supabaseConfig).toContain('isWriteRequest');
      expect(supabaseConfig).toContain('isWriteRequest ? DATA_WRITE_TIMEOUT_MS : DATA_REQUEST_TIMEOUT_MS');
    });

    test('el timeout de suscripción habilita la página sin lanzar un error', () => {
      expect(subscriptionGuard).not.toContain('SUBSCRIPTION_CHECK_TIMEOUT');
      expect(subscriptionGuard).toContain('new Promise<null>((resolve)');
      expect(subscriptionGuard).toContain('if (!results)');
    });

    test('el inicio espera sucursal y permisos antes de consultar el dashboard', () => {
      expect(inicio).toContain('const { branchFilter, isLoading: branchLoading } = useBranch();');
      expect(inicio).toContain('const { context: permContext, resolvedOrganizationId } = usePermissionContext(organization?.id);');
      // La espera de permisos pasa por `rolResuelto` y no por `permissionsLoading`
      // directo: usePermissionContext recarga el contexto en SIGNED_IN /
      // TOKEN_REFRESHED y ese flip true→false volvía a disparar loadData con
      // skeleton (2026-09-14: "el skeleton se dispara dos veces"). Y se resuelve
      // solo cuando el contexto cargado es de ESTA organización
      // (resolvedOrganizationId), no con `!loading` a secas.
      expect(inicio).toContain('const rolResuelto = !!organization && resolvedOrganizationId === organization.id;');
      expect(inicio).toContain('if (!organization?.id || branchLoading || !rolResuelto) return;');
    });

    test('el inicio no elige panel (empleado/financiero) hasta resolver el rol', () => {
      // Con permContext aún null, canSeeFinancialDashboard es false y a un
      // administrador se le pintaba primero el panel de empleado.
      expect(inicio).toContain('{!rolResuelto ? (');
      expect(inicio).toContain(') : canSeeFinancialDashboard ? (');
    });

    test('el inicio limita la carga inicial a cuatro skeletons', () => {
      expect(inicio).not.toContain('Array.from({ length: 10 })');
      expect(inicio).not.toContain('Array.from({ length: 8 })');
      expect(kpis).toContain('Array.from({ length: 4 })');
    });
  });

  // === Automatizaciones (rediseño UX, rondas 3-4): lo que el tester vio romperse ===
  // Regla (ronda 4): un guardarraíl que se rompe con un reformateo es peor que
  // ninguno. La conducta se prueba EJECUTADA en ruleMutations.test.ts y
  // ruleEditorModel.test.ts; aquí solo queda el cableado, con regex que
  // toleran espacios, paréntesis, llaves y constantes intermedias.
  describe('Automatizaciones: estado tras una mutación y foco tras cerrar', () => {
    const dir = path.join(SRC_ROOT, 'components', 'crm', 'automatizaciones');
    const hook = readFile(path.join(dir, 'useAutomationRules.ts'));
    const page = readFile(path.join(dir, 'AutomatizacionesPage.tsx'));
    const sheet = readFile(path.join(dir, 'RuleEditorSheet.tsx'));

    // R-1: la hoja devuelve el foco al botón «Nueva regla» si el estado vacío se desmontó.
    const RETURN_FOCUS = /useReturnFocus\s*\(\s*open\s*,\s*returnFocusFallback\s*\)/;
    const FALLBACK_PROP = /returnFocusFallback\s*=\s*\{[^}]+\}/;
    // R-5: el bloque del disparador avisa del evento mudo sobre el formulario cargado.
    const MUTED = /mutedEvent\s*\(\s*form\s*\)/;
    // R-2 / M26: el hook no hace red ni estado por su cuenta; todo pasa por
    // ruleMutations (PATCH OK + GET 500, esqueleto solo en la primera carga…).
    const DIRECT_FETCH = /\bfetch\s*\(/;
    const OWN_STATE = /\b(useState|useRef)\s*\(/;
    const REDUCER = /useReducer\s*\(\s*applyMutation\b/;

    test('R-2/M26: el hook delega en ruleMutations (probado ejecutado) y no reimplementa red ni estado', () => {
      expect(hook).toMatch(REDUCER);
      expect(hook).not.toMatch(DIRECT_FETCH);
      expect(hook).not.toMatch(OWN_STATE);
      expect(hook.match(/\brunMutation\s*\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(hook).not.toMatch(/\bviewOf\b|\bupsertRule\b|\bwithoutRule\b/);
    });

    test('R-2: el Alert de recarga fallida dice que se muestra la última lista conocida', () => {
      expect(page).toContain('Se muestra la última lista conocida');
    });

    test('R-1: la hoja del editor tiene fallback de foco («Nueva regla») para cuando el estado vacío se desmontó', () => {
      expect(sheet).toMatch(RETURN_FOCUS);
      expect(page).toMatch(FALLBACK_PROP);
      expect(page).toMatch(/newButtonRef\s*\.\s*current/);
    });

    test('R-3: el estado vacío describe lo que el ejemplo hace de verdad (no promete una etapa que no lleva)', () => {
      const empty = readFile(path.join(dir, 'RulesEmptyState.tsx'));
      expect(empty).toMatch(/describeRule\s*\(\s*\{\s*\.\.\.EXAMPLE_FORM/);
      expect(empty).not.toContain('entra en «Propuesta enviada»');
    });

    test('R-5: el bloque del disparador avisa del evento mudo sobre el formulario cargado (mutedEvent)', () => {
      expect(readFile(path.join(dir, 'TriggerBlock.tsx'))).toMatch(MUTED);
    });

    test('R-4: sin requestAnimationFrame para mover el foco (con la ventana ocluida no dispara)', () => {
      for (const f of ['RuleEditorSheet.tsx', 'ActionsBlock.tsx', 'ConditionsBlock.tsx']) {
        expect({ f, raf: /requestAnimationFrame\s*\(/.test(readFile(path.join(dir, f))) }).toEqual({ f, raf: false });
      }
    });

    test('los guardarraíles de cadena toleran un reformateo (prettier): los cuatro rojos falsos de la ronda 3 son verdes', () => {
      // Los dos primeros ya no tienen guardarraíl de texto: el hook no contiene
      // esas líneas y su conducta se prueba ejecutada. Ningún regex de arriba
      // los mira, y ningún regex de arriba se rompe con ellos.
      const reformatted = [
        'setRules(prev => upsertRule(prev, row))',
        'if (!loadedOnce.current) {\n  setLoading(true);\n}',
        'const focusFallback = () => newButtonRef.current;\n<RuleEditorSheet returnFocusFallback={focusFallback} />',
        'const muted = mutedEvent( form );',
        'const onCloseAutoFocus = useReturnFocus( open , returnFocusFallback )',
      ];
      expect(reformatted.filter((s) => DIRECT_FETCH.test(s) || OWN_STATE.test(s))).toEqual([]);
      expect(reformatted[2]).toMatch(FALLBACK_PROP);
      expect(reformatted[3]).toMatch(MUTED);
      expect(reformatted[4]).toMatch(RETURN_FOCUS);
    });
  });

  // === Pantalla del cliente: los totales llevan el id del carrito ===
  // Bug visto en el escritorio 0.2.1 (2026-09-16): al completar una venta el
  // POS elimina el carrito cobrado y activa el siguiente. `handleTotalsChange`
  // de CartView cambia de identidad (depende de cart.id) y el efecto de
  // TaxSummary reenvía sus totales VIEJOS con el id NUEVO; el emisor confía en
  // el id y la pantalla mostraba «TOTAL $ 12.750» sobre un carrito de $ 0.
  // Corrección: TaxSummary etiqueta cada cálculo con el carrito que lo
  // produjo y cancela los cálculos asíncronos superados; CartView ignora
  // totales de otro carrito y retira el override con subtotal 0.
  describe('Pantalla del cliente: TaxSummary etiqueta los totales con su carrito y CartView los filtra', () => {
    const taxSummary = readFile(path.join(SRC_ROOT, 'components', 'pos', 'TaxSummary.tsx'));
    const cartView = readFile(path.join(SRC_ROOT, 'components', 'pos', 'CartView.tsx'));

    test('TaxSummary: onTotalsChange lleva cartId y el cálculo asíncrono se cancela al cambiar de carrito', () => {
      expect(taxSummary).toMatch(/onTotalsChange\?\s*:\s*\(totals:\s*\{[^}]*cartId:\s*string[^}]*\}\)\s*=>\s*void/);
      expect(taxSummary).toMatch(/let\s+cancelled\s*=\s*false/);
      expect(taxSummary).toMatch(/if\s*\(\s*cancelled\s*\)\s*return/);
      // El id se captura al empezar el efecto y viaja en cada setCalculatedTotals.
      expect(taxSummary.match(/setCalculatedTotals\s*\(\s*\{[^}]*cartId[^}]*\}\s*\)/gs)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    test('CartView: ignora totales de otro carrito y retira el override con subtotal 0', () => {
      expect(cartView).toMatch(/if\s*\(\s*totals\.cartId\s*!==\s*cartId\s*\)\s*return/);
      expect(cartView).toMatch(/setTotals\s*\(\s*cartId\s*,\s*null\s*\)/);
    });
  });

  // === Caso 16: callbacks de onAuthStateChange nunca son async ===
  // auth-js 2.69 hace `await` de los callbacks de onAuthStateChange DENTRO
  // del lock global de sesión (_notifyAllSubscribers corre con lockAcquired =
  // true). Si un callback es async y hace await de algo que vuelve a pedir la
  // sesión (getSession/getUser o cualquier query REST con jwt), la promesa se
  // encadena sobre sí misma: deadlock permanente. Ninguna query de Supabase
  // volvía a salir de la pestaña y todas las páginas quedaban en skeleton
  // hasta recargar (bug de navegación client-side de sep-2026; origen:
  // usePermissionContext con `await loadContext()`).
  describe('16. Ningún callback de onAuthStateChange es async', () => {
    const allFiles = walkDir(SRC_ROOT).filter((f) => !isExcluded(f));
    const violations: string[] = [];

    beforeAll(() => {
      for (const file of allFiles) {
        const content = stripAllComments(readFile(file));
        if (/onAuthStateChange\s*\(\s*async\b/.test(content)) {
          violations.push(rel(file));
        }
      }
    });

    test('los callbacks se ejecutan fire-and-forget (sin async/await)', () => {
      expect(violations).toEqual([]);
    });
  });

  // === Caso 17 (F11 r2): la vista materializada de salud no existe para la app ===
  // Era una vista sin RLS (31 205 filas de 15 organizaciones, SELECT para anon
  // y authenticated) con un cálculo distinto al de `fn_customer_health` + config.
  // r1 le cableó «Medir ahora»; r2 borró todos los lectores. El orquestador
  // retira el GRANT a `authenticated` y la vista cuando este caso esté verde.
  describe('17. Ningún archivo de src/ nombra la vista materializada de salud', () => {
    const MV_NAME = ['mv_customer', 'health'].join('_');
    const violations: string[] = [];
    beforeAll(() => {
      // Incluye tests y fixtures: un doble que la modele vuelve a invitar a leerla.
      for (const file of walkDir(SRC_ROOT).filter((f) => !f.includes('node_modules'))) {
        if (path.resolve(file) === path.resolve(__filename)) continue;
        if (readFile(file).includes(MV_NAME)) violations.push(rel(file));
      }
    });
    test('ni código ni comentarios ni tests nombran la vista', () => {
      expect(violations).toEqual([]);
    });
  });

  // === Caso 18 (F0-JOBS r3, QA r2 N-3): un solo contrato de scheduling ===
  // `9c0288a7` bajó el drenaje de Vercel a `*/2` sin tocar la ruta, la UI ni
  // FASE-00, que siguieron prometiendo «cada minuto». Desde r3 la cadencia y
  // los kinds por schedule viven en `src/lib/jobs/schedule.ts`; este caso
  // impide que `vercel.json` y ese módulo vuelvan a divergir.
  describe('18. vercel.json coincide con src/lib/jobs/schedule.ts', () => {
    const vercel = JSON.parse(readFile(path.join(REPO_ROOT, 'vercel.json'))) as { crons?: { path: string; schedule: string }[] };
    const jobsCrons = (vercel.crons ?? []).filter((c) => c.path === JOBS_RUN_PATH).map((c) => c.schedule);

    test('el drenaje total es */DRAIN_INTERVAL_MIN y DRAIN_INTERVAL_MIN es un entero de 1 a 59', () => {
      expect(Number.isInteger(DRAIN_INTERVAL_MIN)).toBe(true);
      expect(DRAIN_INTERVAL_MIN).toBeGreaterThanOrEqual(1);
      expect(DRAIN_INTERVAL_MIN).toBeLessThan(60);
      expect(DRAIN_SCHEDULE).toBe(`*/${DRAIN_INTERVAL_MIN} * * * *`);
      expect(VERCEL_SCHEDULE_KINDS[DRAIN_SCHEDULE]).toBeUndefined();
    });

    test('cada cron de /api/crm/jobs/run en vercel.json es el drenaje total o una clave de VERCEL_SCHEDULE_KINDS', () => {
      expect(jobsCrons.length).toBeGreaterThan(0);
      const unknown = jobsCrons.filter((s) => !JOBS_RUN_SCHEDULES.includes(s));
      expect(unknown).toEqual([]);
    });

    test('todo schedule declarado en schedule.ts existe en vercel.json exactamente una vez', () => {
      for (const schedule of JOBS_RUN_SCHEDULES) {
        expect(jobsCrons.filter((s) => s === schedule)).toHaveLength(1);
      }
    });

    test('el código de JOBS (runner, ruta, UI) no cablea cron strings ni promete «cada minuto»', () => {
      const scopes = [path.join(SRC_ROOT, 'lib', 'jobs'), path.join(SRC_ROOT, 'app', 'api', 'crm', 'jobs'), path.join(SRC_ROOT, 'components', 'crm', 'config')];
      const offenders: string[] = [];
      for (const file of scopes.flatMap((d) => walkDir(d)).filter((f) => !isExcluded(f))) {
        if (rel(file) === 'lib/jobs/schedule.ts') continue;
        const content = stripAllComments(readFile(file));
        if (/(['"`])(\*\/\d+|\d+ \d+|\*) \* \* \* \*\1/.test(content) || /cada minuto|≤1 min|cada 2 minutos/.test(content)) {
          offenders.push(rel(file));
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  // === Caso 19: un solo punto de cobro de créditos de IA (F0-REG r2) ===
  //
  // CLAUDE.md: el cobro de créditos de IA tiene un punto único,
  // `chargeAiCredits`/`refundAiCredits` (`withAiCharge`) en
  // `src/lib/services/crm/aiCostService.ts`: RPC atómico ANTES del proveedor,
  // reembolso si el proveedor falla, 402 tipado. `consumeAICredits`
  // (`aiCreditsService.ts`) cobra DESPUÉS y sin costo en USD: el QA de F0-REG
  // r1 (alto 6) la encontró viva en 12 llamadores V3. Se mantiene solo para
  // ellos (allow-list cerrada, uno por línea para que el diff cante). Ningún
  // archivo nuevo puede importarla: usar `withAiCharge`. Cuando un llamador
  // migre, se quita de la lista; la lista solo puede encoger.
  describe('19. Ningún archivo nuevo importa consumeAICredits (punto único de cobro)', () => {
    const LEGACY_CALLERS = new Set([
      'app/api/ai-assistant/generate-image/route.ts',
      'app/api/ai-assistant/improve-text/route.ts',
      'app/api/ai-assistant/pm-assist/route.ts',
      'app/api/ai-assistant/pm-planner/route.ts',
      'app/api/ai-assistant/seo-keywords/route.ts',
      'app/api/chat/ai/auto-response/route.ts',
      'app/api/chat/ai/classify-intent/route.ts',
      'app/api/chat/ai/generate-response/route.ts',
      'app/api/chat/ai/generate-summary/route.ts',
      'app/api/chat/ai/lab-test/route.ts',
      'lib/services/reportes/reportAgentService.ts',
    ]);

    test('solo los llamadores V3 de la allow-list importan consumeAICredits', () => {
      const offenders = walkDir(SRC_ROOT)
        .filter((f) => !isExcluded(f))
        .filter((f) => !rel(f).endsWith('lib/services/aiCreditsService.ts')) // define la función
        .filter((f) => /\bconsumeAICredits\b/.test(stripAllComments(readFile(f))))
        .map(rel)
        .filter((r) => !LEGACY_CALLERS.has(r));
      expect(offenders).toEqual([]);
    });

    test('withAICreditsCheck delega en withAiCharge (no cobra después del proveedor)', () => {
      const src = stripAllComments(readFile(path.join(SRC_ROOT, 'lib/services/aiCreditsService.ts')));
      const body = src.slice(src.indexOf('export async function withAICreditsCheck'));
      expect(body).toMatch(/return withAiCharge\(/);
      expect(body).not.toMatch(/consumeAICredits\(/);
    });
  });
  // === Caso 20: integration_connections nunca se filtra por 'active' ===
  //
  // Seis webhooks (mercadopago, meta ×2, paypal, payu, stripe) buscaban su
  // conexión con `.eq('status', 'active')`. Verificado por MCP el 2026-09-15:
  // el CHECK `integration_connections_status_check` admite solo
  // draft|connected|paused|error|revoked, y las conexiones reales están en
  // `connected`. Ninguna de esas rutas encontraba jamás la conexión: el
  // proveedor recibía `verified: false` y nadie se enteraba.
  //
  // El único estado utilizable vive en `INTEGRATION_CONNECTION_USABLE_STATUS`
  // (`src/lib/integrations/connectionStatus.ts`). F10 definió antes
  // `STRIPE_CONNECTION_USABLE_STATUS` en el CRM; las dos deben seguir iguales.
  //
  // OJO: `integration_credentials.status` SÍ admite 'active'
  // (active|expired|revoked|rotating). Esta guarda es solo para
  // `integration_connections`, dentro de una misma sentencia (sin `;` en medio).
  describe('20. Ningún archivo filtra integration_connections por status = active', () => {
    const pattern = /\.from\(\s*['"]integration_connections['"]\s*\)[^;]*?\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/;

    test('ningún archivo de src/ (ni ws-server.ts) usa el estado inexistente', () => {
      const offenders = walkDir(SRC_ROOT)
        .filter((f) => !isExcluded(f))
        .filter((f) => pattern.test(stripAllComments(readFile(f))))
        .map(rel);
      const ws = path.join(REPO_ROOT, 'ws-server.ts');
      if (fs.existsSync(ws) && pattern.test(stripAllComments(readFile(ws)))) offenders.push('ws-server.ts');
      expect(offenders).toEqual([]);
    });

    test('la constante compartida es connected y coincide con la del CRM (F10)', () => {
      const shared = stripAllComments(readFile(path.join(SRC_ROOT, 'lib/integrations/connectionStatus.ts')));
      expect(shared).toMatch(/INTEGRATION_CONNECTION_USABLE_STATUS(?::\s*IntegrationConnectionStatus)?\s*=\s*'connected'/);
      const crm = stripAllComments(readFile(path.join(SRC_ROOT, 'lib/services/crm/stripePaymentLinkService.ts')));
      expect(crm).toMatch(/STRIPE_CONNECTION_USABLE_STATUS\s*=\s*'connected'/);
    });

    test('los seis handlers corregidos usan la constante compartida', () => {
      const routes = [
        'app/api/integrations/mercadopago/webhook/route.ts',
        'app/api/integrations/meta/product-sync/route.ts',
        'app/api/integrations/meta/webhook/route.ts',
        'app/api/integrations/paypal/webhook/route.ts',
        'app/api/integrations/payu/webhook/route.ts',
        'app/api/integrations/stripe/webhook/route.ts',
      ];
      for (const r of routes) {
        const src = stripAllComments(readFile(path.join(SRC_ROOT, r)));
        expect(src).toMatch(/\.from\(\s*['"]integration_connections['"]\s*\)[^;]*?\.eq\(\s*['"]status['"]\s*,\s*INTEGRATION_CONNECTION_USABLE_STATUS\s*\)/);
      }
    });
  });
});

// === Caso 21: ningún fuente .ts/.tsx bajo src/ lleva bytes de control ===
//
// F0-SEC r4 (qa r3 §6). Un test del tester r3 llevaba un NUL (0x00) literal
// dentro de una cadena en vez de `\u0000`: `file` lo reportaba como `data`,
// `grep` como «Binary file … matches» y `git diff` como «Binary files differ».
// Es la misma clase de problema que dejó `PROGRESS.md` inutilizable el
// 2026-09-10 (CLAUDE.md §Ciclo /loop: backticks dentro de una cadena entre
// comillas dobles de PowerShell se convierten en NUL, VT o BEL). Este mismo
// archivo llevaba un 0x01 en un regex del caso JOBS (donde tenía que ir `\1`),
// lo que dejaba muerta la guarda de cron strings: se corrigió en la misma ronda.
//
// Se revisa TODO `src/` (tests incluidos: el ofensor era un test) y se leen los
// bytes crudos, no el texto decodificado. Cualquier carácter que un fuente
// necesite se escribe como secuencia de escape (`\u0000`, `\x1b`), nunca en
// crudo. Sin allow-list: no hay ningún motivo legítimo para un byte de control.
describe('21. Ningún .ts/.tsx bajo src/ contiene bytes de control (< 0x20 salvo \\t, \\n, \\r)', () => {
  jest.setTimeout(60000);
  const CONTROL_BYTE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

  test('el detector reconoce NUL, SOH, BEL, VT y ESC y tolera \\t, \\n, \\r', () => {
    for (const bad of ['\x00', '\x01', '\x07', '\x0B', '\x1B']) expect(CONTROL_BYTE.test(`a${bad}b`)).toBe(true);
    expect(CONTROL_BYTE.test('a\tb\nc\r\n')).toBe(false);
    expect(CONTROL_BYTE.test('\\u0000 como secuencia de escape')).toBe(false);
  });

  test('ningún archivo fuente (tests incluidos) lleva bytes de control en crudo', () => {
    const offenders: string[] = [];
    for (const file of walkDir(SRC_ROOT)) {
      // latin1: un byte → un carácter, sin decodificar UTF-8 (no interesa el texto, sino los bytes).
      const raw = fs.readFileSync(file).toString('latin1');
      const m = CONTROL_BYTE.exec(raw);
      if (m) {
        const line = raw.slice(0, m.index).split('\n').length;
        offenders.push(`${rel(file)}:${line} (0x${raw.charCodeAt(m.index).toString(16).padStart(2, '0')})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// === Caso 22: F-52 — las ventas POS escogen la regla contable según saldo ===
describe('22. F-52: fn_auto_journal_sale_pos discrimina contado y crédito', () => {
  const migrationPath = path.join(
    REPO_ROOT,
    'supabase',
    'migrations',
    '20260919235511_f52_sale_pos_is_credit.sql'
  );
  const rollbackPath = path.join(
    REPO_ROOT,
    'supabase',
    'rollbacks',
    '20260919235511_f52_sale_pos_is_credit_rollback.sql'
  );
  let sql = '';

  beforeAll(() => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    sql = readFile(migrationPath);
  });

  test('deriva is_credit del saldo y no de payment_status', () => {
    expect(sql).toMatch(/v_is_credit\s*:=\s*COALESCE\(NEW\.balance,\s*0\)\s*>\s*0/);
    expect(sql).not.toMatch(/v_is_credit\s*:=\s*\(?NEW\.payment_status/);
  });

  test('las tres búsquedas de reglas filtran por is_credit', () => {
    const filters = sql.match(/\(conditions->>'is_credit'\)::boolean\s*=\s*v_is_credit/g) ?? [];
    expect(filters).toHaveLength(3);
  });

  test('la idempotencia queda acotada por organización', () => {
    const idempotencyBlock = sql.match(
      /SELECT\s+id\s+INTO\s+v_existing_id[\s\S]*?LIMIT\s+1;/
    )?.[0];
    expect(idempotencyBlock).toBeDefined();
    expect(idempotencyBlock).toMatch(/FROM\s+(?:public\.)?journal_entries/);
    expect(idempotencyBlock).toMatch(/organization_id\s*=\s*NEW\.organization_id/);
    expect(idempotencyBlock).toMatch(/source\s*=\s*'sales'/);
    expect(idempotencyBlock).toMatch(/source_id\s*=\s*NEW\.id::text/);
  });

  test('la función SECURITY DEFINER fija search_path y no queda ejecutable directamente por roles cliente', () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER[\s\S]*?SET\s+search_path\s+TO\s+'public',\s*'pg_temp'/);
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.fn_auto_journal_sale_pos\(\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/
    );
  });
});
