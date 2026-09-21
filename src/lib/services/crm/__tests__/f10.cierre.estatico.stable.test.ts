/// <reference types="jest" />
/**
 * F10 — contratos de fuente del cierre «al ganar»: el grafo de imports que
 * `WonCloseModal` (cliente) arrastra al navegador vía `wonCloseSteps` (H1 del
 * tester D1/D2: `renewalService` hacía `import('sequenceService')` y la cadena
 * llegaba a twilio/net/tls y a `supabase/server-service`), los llamadores de
 * servidor que inyectan `enrollInSequence`, `useStageFlow` que no abre el
 * modal si el PATCH de etapa falla, fechas sin `.split('T')[0]` en la zona y
 * el render honesto del error del paso. Consolidado el 2026-09-21 desde
 * `f10D1D2Tester` (§4, 5.4 y guardas estáticas). Sin BD, sin mocks.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve as pathResolve, relative } from 'path';

const ROOT = process.cwd();
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = pathResolve(dirname(from), spec);
  else return null;
  for (const e of ['', ...EXTS, ...EXTS.map((x) => `/index${x}`)]) { const p = base + e; if (existsSync(p) && statSync(p).isFile()) return p; }
  return null;
}
/** Módulos alcanzados desde `entry` (imports estáticos; `withDynamic` añade `import()`/`require()`), con sus especificadores externos. */
function graph(entry: string, withDynamic: boolean): { files: string[]; externals: string[] } {
  const seen = new Set<string>(); const externals = new Set<string>();
  const walk = (f: string) => {
    if (seen.has(f)) return; seen.add(f);
    const code = readFileSync(f, 'utf8');
    for (const line of code.split('\n')) {
      const t = line.trim();
      if (!/^(import|export)\b/.test(t) || /^(import|export)\s+type\s/.test(t)) continue;
      const m = t.match(/from\s+['"]([^'"]+)['"]/) ?? t.match(/^import\s+['"]([^'"]+)['"]/);
      if (!m) continue;
      const r = resolveSpec(f, m[1]); if (r) walk(r); else externals.add(m[1]);
    }
    if (withDynamic) {
      for (const d of code.matchAll(/(?:\bimport|\brequire)\(\s*['"]([^'"]+)['"]\s*\)/g)) { const r = resolveSpec(f, d[1]); if (r) walk(r); else externals.add(d[1]); }
    }
  };
  walk(entry);
  return { files: [...seen].map((f) => relative(ROOT, f).replace(/\\/g, '/')), externals: [...externals] };
}
const SERVER_ONLY = /server-service|server-only|twilio|svix|standardwebhooks|nodemailer|next\/headers|sequenceService|emailService|webhookSignatures/;
const NODE_BUILTINS_SIN_POLYFILL = new Set(['net', 'tls', 'fs', 'dns', 'child_process', 'node:net', 'node:tls', 'node:fs']);

describe('navegador: lo que WonCloseModal (cliente) arrastra vía wonCloseSteps (§4)', () => {
  const entry = join(ROOT, 'src/lib/services/crm/wonCloseSteps.ts');

  it('4.1 WonCloseModal es cliente e importa wonCloseSteps estáticamente', () => {
    const modal = read('src/components/crm/pipeline/WonCloseModal.tsx');
    expect(modal.startsWith("'use client'")).toBe(true);
    expect(modal).toMatch(/from '@\/lib\/services\/crm\/wonCloseSteps'/);
  });

  it('4.2/4.3 ni por import estático ni incluyendo import()/require() se alcanza un módulo solo-servidor (sequenceService, webhookSignatures, twilio, server-service) ni net/fs/tls', () => {
    const g = graph(entry, false);
    expect(g.files).toEqual(expect.arrayContaining(['src/lib/services/crm/onboardingService.ts', 'src/lib/services/crm/renewalService.ts']));
    for (const withDynamic of [false, true]) {
      const d = graph(entry, withDynamic);
      expect(d.files.filter((f) => SERVER_ONLY.test(f))).toEqual([]);
      expect(d.externals.filter((e) => SERVER_ONLY.test(e) || NODE_BUILTINS_SIN_POLYFILL.has(e))).toEqual([]);
    }
  });

  it('4.4 control del propio test: el recorrido detecta un módulo de servidor real (renewals/sync/route importa sequenceService)', () => {
    const g = graph(join(ROOT, 'src/app/api/crm/renewals/sync/route.ts'), true);
    expect(g.files.filter((f) => /sequenceService/.test(f))).toEqual(['src/lib/services/crm/sequenceService.ts']);
  });

  it('4.5/4.6 renewalService no menciona sequenceService de ninguna forma; los llamadores de servidor (renewals_sync y la ruta POST) inyectan enrollInSequence', () => {
    const src = read('src/lib/services/crm/renewalService.ts');
    expect(src).not.toMatch(/sequenceService/);
    expect(src).not.toMatch(/import\(/);
    expect(src).not.toMatch(/require\(/);
    for (const f of ['src/lib/jobs/scheduled/renewalsSync.ts', 'src/app/api/crm/renewals/sync/route.ts']) {
      const caller = read(f);
      expect({ f, hit: /import \{[^}]*\benrollInSequence\b[^}]*\} from '@\/lib\/services\/crm\/sequenceService'/.test(caller) }).toEqual({ f, hit: true });
      expect({ f, hit: /enroll: enrollInSequence/.test(caller) }).toEqual({ f, hit: true });
    }
  });
});

describe('guardas estáticas de la zona', () => {
  it("G1 toISOString().split('T')[0] y .split('T')[0] sobre valores de BD están prohibidos en wonCloseSteps/onboardingService/renewalService/renewalMilestones", () => {
    for (const f of ['src/lib/services/crm/wonCloseSteps.ts', 'src/lib/services/crm/onboardingService.ts', 'src/lib/services/crm/renewalService.ts', 'src/lib/services/crm/renewalMilestones.ts']) {
      const src = read(f);
      expect({ f, hit: /toISOString\(\)\.split\('T'\)\[0\]/.test(src) }).toEqual({ f, hit: false });
      expect({ f, hit: /\.split\('T'\)\[0\]/.test(src) }).toEqual({ f, hit: false });
    }
  });

  // Observación del tester D1/D2 (r2): `useStageFlow.onWonConfirmed` abría WonCloseModal aunque el PATCH de etapa
  // (`change()`) devolviera false y el modal ejecutaba los pasos sobre una oportunidad NO ganada. Sin DOM en jest: contrato de fuente.
  it('G2 useStageFlow: onWonConfirmed no abre WonCloseModal si change() devuelve false', () => {
    const src = read('src/components/crm/oportunidades/detail/useStageFlow.tsx');
    const body = src.slice(src.indexOf('const onWonConfirmed'), src.indexOf('const dialogs'));
    expect(body).toMatch(/if \(!\(await change\(wonStage,/);
    const guard = body.indexOf('if (!(await change(wonStage,');
    const open = body.indexOf('setWonClose(true)');
    expect(guard).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(guard);
    expect(body.slice(guard, open)).toMatch(/return;/);
    // el cambio de etapa nunca se hace «a ciegas» (await change(...) sin mirar el resultado)
    expect(body).not.toMatch(/\{\s*await change\(wonStage/);
  });

  it('5.4 el modal pinta el error del paso de forma honesta (status error + err.message)', () => {
    const src = read('src/components/crm/pipeline/WonCloseModal.tsx');
    expect(src).toMatch(/updateStep\(step\.id, \{ status: 'error', result: err instanceof Error \? err\.message/);
    expect(src).toMatch(/step\.status === 'error' \? 'text-red-600'/);
  });
});
