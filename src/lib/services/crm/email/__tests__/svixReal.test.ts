/// <reference types="jest" />
/**
 * F7 · Ronda 2 — cobertura jest del arreglo de `verifyResendWebhook` CON EL
 * PAQUETE `svix` REAL (tester r1 #4).
 *
 * `svix@2.2.0` es ESM puro (`"type":"module"`, `exports: ./dist/index.mjs`) y
 * jest corre en CommonJS: `require('svix')` falla con "Cannot use import
 * statement outside a module" y `createRequire` tampoco sirve porque jest
 * intercepta el registro de módulos. Por eso `webhookSignatures.test.ts` lo
 * mockea — y su mock reproducía svix **1.x** (verify devolvía el payload), que
 * es justo lo que ocultó el bug: con svix ≥2 `verify()` devuelve `void` y todo
 * webhook con firma VÁLIDA reventaba con 500.
 *
 * Solución: este test ejecuta `svixReal.harness.mts` con `tsx` en un proceso
 * aparte (Node sí carga ESM) y comprueba cada caso. Nada de red ni de BD: el
 * secreto es de pruebas y solo vive en memoria del proceso hijo.
 *
 * Ver "Integración pendiente" del informe F7-r2: el mock 1.x de
 * `src/lib/security/__tests__/webhookSignatures.test.ts` (zona de SEC) debería
 * actualizarse o delegar en este archivo.
 */

import { execFileSync } from 'child_process';
import path from 'path';

interface HarnessCase { name: string; ok: boolean; detail: unknown }

const HARNESS = path.join(__dirname, 'svixReal.harness.mts');
const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const TSX = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

let cases: HarnessCase[] = [];
let harnessError = '';

beforeAll(() => {
  try {
    const out = execFileSync(TSX, [HARNESS], { cwd: ROOT, encoding: 'utf8', timeout: 120_000, shell: process.platform === 'win32' });
    const m = /__SVIX_RESULT__([\s\S]*?)__END__/.exec(out);
    if (!m) throw new Error(`salida inesperada del harness: ${out.slice(-500)}`);
    cases = JSON.parse(m[1]) as HarnessCase[];
  } catch (err) {
    harnessError = err instanceof Error ? err.message : String(err);
  }
}, 130_000);

function caseOk(name: string): void {
  expect(harnessError).toBe('');
  const c = cases.find((x) => x.name === name);
  expect(c ? `${c.name}:${c.ok}` : `${name}:AUSENTE`).toBe(`${name}:true`);
}

describe('verifyResendWebhook con svix REAL (2.x, proceso aparte)', () => {
  it('el harness se ejecuta y devuelve los 7 casos', () => {
    expect(harnessError).toBe('');
    expect(cases).toHaveLength(7);
  });

  it('svix >= 2: Webhook.verify() devuelve void con firma válida (premisa del bug)', () => {
    caseOk('svix_verify_devuelve_void');
  });

  it('firma válida → el helper devuelve el payload PARSEADO, no undefined', () => {
    caseOk('firma_valida_devuelve_payload');
  });

  it('firma válida + JSON inválido → 400 invalid_json', () => {
    caseOk('json_invalido_400');
  });

  it('firma inválida → 401 resend_signature_invalid', () => {
    caseOk('firma_invalida_401');
  });

  it('cuerpo alterado después de firmar → 401', () => {
    caseOk('cuerpo_alterado_401');
  });

  it('sin RESEND_WEBHOOK_SECRET → 401 fail-closed', () => {
    caseOk('sin_secreto_401');
  });

  it('replay con timestamp de hace 20 minutos → 401', () => {
    caseOk('replay_antiguo_401');
  });
});
