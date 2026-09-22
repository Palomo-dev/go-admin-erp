/// <reference types="jest" />
/**
 * F12 — casos únicos consolidados de las rondas (2026-09-21): parte pura y
 * llamadores de servidor. Vienen de `f12MiscTester` (tester F12-misc,
 * 2026-09-16) y de `f12.tester` (tester r1). Cubre:
 *  1. `postgrestFilters`: ningún carácter del usuario sale del valor
 *     entrecomillado (inyección `,or(...)`), comprobado con un analizador
 *     mínimo de la gramática `or=` de PostgREST y 300 cadenas aleatorias.
 *     Contra PostgREST REAL (catálogo `countries`, anon, solo lectura) se vio
 *     el 2026-09-16: `"%\\"` → 22025, `"%Chi\\%%"` → 0 filas, `"%C*a%"` → 2
 *     filas (`*` es comodín aunque vaya entrecomillado), `zz",code.eq…` → 0.
 *  2. Los llamadores de servidor (`getCalls`, `listCommissions`) usan el helper.
 *  3. `requirePartnerManager` cierra ante `roleId`/`isSuperAdmin` malformados.
 *  4. `formatMoney`: «-0» sin signo, negativos, 1e21, NaN/Infinity.
 *  5. Guardarraíles estáticos de la UI de referidos y partners.
 */
import { ilikeAnyOf, likePattern, quoteFilterValue } from '@/lib/utils/postgrestFilters';
import { formatMoney } from '@/lib/services/crm/partnerModel';
import { summarizeCommissions } from '@/lib/services/crm/partnerCommission';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(),
}));
import { canManagePartners, requirePartnerManager } from '@/lib/services/crm/f12RouteSupport';
import { getCalls } from '@/lib/services/crm/callManagementService';
import { listCommissions } from '@/lib/services/crm/commissionAdminService';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const ORG = 120;

/* ───────── analizador mínimo de `or=(a.op.v,b.op."v",and(...))` (tester F12-misc) ───────── */
interface Cond { col: string; op: string; value: string; quoted: boolean }
/** Devuelve las condiciones de primer nivel; lanza si la cadena no es un `or` bien formado. */
function parseOrBody(body: string): Cond[] {
  const out: Cond[] = [];
  let i = 0;
  const fail = (why: string): never => { throw new Error(`PGRST100 simulado: ${why} en ${i}`); };
  while (i < body.length) {
    const m = /^([A-Za-z_][\w>-]*)\.(not\.)?([a-z]+)\./.exec(body.slice(i));
    if (!m) fail('se esperaba col.op.');
    const [head, col, , op] = m as RegExpExecArray;
    i += head.length;
    let value = '';
    let quoted = false;
    if (body[i] === '"') {
      quoted = true;
      i += 1;
      let closed = false;
      while (i < body.length) {
        const ch = body[i];
        if (ch === '\\') { if (i + 1 >= body.length) fail('escape colgante'); value += body[i + 1]; i += 2; continue; }
        if (ch === '"') { closed = true; i += 1; break; }
        value += ch; i += 1;
      }
      if (!closed) fail('comillas sin cerrar');
    } else {
      while (i < body.length && body[i] !== ',' && body[i] !== ')' && body[i] !== '(') { value += body[i]; i += 1; }
      if (body[i] === '(' || body[i] === ')') fail('paréntesis fuera de comillas');
    }
    out.push({ col, op, value, quoted });
    if (i < body.length) {
      if (body[i] !== ',') fail(`se esperaba coma, hay «${body[i]}»`);
      i += 1;
      if (i >= body.length) fail('coma final');
    }
  }
  return out;
}
/** Lo que Postgres recibe para un término, según el contrato del helper. */
function expectedPattern(term: string): string {
  return `%${term.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/[%_\\]/g, (m) => `\\${m}`).replace(/\*/g, '_')}%`;
}
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
const ALPHABET = [',', '(', ')', '"', '\\', '%', '_', '*', '.', 'a', 'Z', ' ', '\n', '\u0000', 'ñ', '🇨🇴', 'or', 'and(', '.eq.', '\\"', '\\\\'];
function randomTerm(rnd: () => number): string {
  const n = 1 + Math.floor(rnd() * 12);
  let s = '';
  for (let k = 0; k < n; k++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return s;
}

describe('postgrestFilters — nada escapa del valor entrecomillado (tester F12-misc §1)', () => {
  const vectors = [
    'zz",code.eq.COL,name.ilike."', 'zz%",code.eq.COL,name.ilike."%', 'zz),code.eq.COL,and(name.ilike.', 'zz\\",code.eq.COL,name.ilike."',
    'zz\\\\",code.eq.COL,name.ilike."', 'zz",organization_id.eq.121,name.ilike."', 'zz",not.is.null,x.ilike."',
    '"', '\\', '\\"', '"\\', ',', ')', '(', 'a"b\\c,d(e)f', '%_\\*',
    '\u0000",code.eq.COL,name.ilike."\u0000', 'x'.repeat(2000) + '",code.eq.COL,x.ilike."',
  ];
  it.each(vectors)('vector %#: una condición por columna, todas ilike, valor = patrón literal del término', (term) => {
    const conds = parseOrBody(ilikeAnyOf(['a', 'b', 'c'], term));
    expect(conds.map((c) => c.col)).toEqual(['a', 'b', 'c']);
    for (const c of conds) {
      expect(c.op).toBe('ilike');
      expect(c.quoted).toBe(true);
      expect(c.value).toBe(expectedPattern(term));
    }
  });
  it('300 términos aleatorios (semilla fija): siempre N condiciones ilike con el valor exacto, o cadena vacía si el término queda en blanco', () => {
    const rnd = lcg(20260916);
    for (let k = 0; k < 300; k++) {
      const term = randomTerm(rnd);
      const filter = ilikeAnyOf(['full_name', 'email'], term);
      if (term.trim() === '') { expect(filter).toBe(''); continue; }
      const conds = parseOrBody(filter);
      expect(conds).toHaveLength(2);
      expect(conds.every((c) => c.op === 'ilike' && c.quoted && c.value === expectedPattern(term))).toBe(true);
    }
  });
  it('el patrón nunca termina en barra invertida (22025 en Postgres) ni contiene comodines sin escapar del usuario', () => {
    for (const term of ['\\', 'a\\', '\\\\', '%', '_', '*', 'a%b_c*d\\e']) {
      const p = likePattern(term);
      expect((/(\\*)%$/.exec(p)?.[1].length ?? 0) % 2).toBe(0); // el `%` final no puede quedar escapado
      expect(p.startsWith('%') && p.endsWith('%')).toBe(true);
      const inner = p.slice(1, -1);
      expect(inner.replace(/\\[%_\\]/g, '')).not.toMatch(/[%\\]/);
      expect(inner).not.toContain('*');
    }
  });
  it('`*` se convierte en `_` DESPUÉS de escapar (no queda como `\\_`)', () => {
    expect(likePattern('C*a')).toBe('%C_a%');
    expect(likePattern('*')).toBe('%_%');
    expect(ilikeAnyOf(['n'], 'C*a')).toBe('n.ilike."%C_a%"');
  });
  it('bytes de control (incluido DEL 0x7f) se retiran; el unicode y los espacios internos se conservan; 2000 caracteres pasan íntegros (sin tope)', () => {
    expect(quoteFilterValue('a\u007fb\tc\rd')).toBe('"abcd"');
    expect(ilikeAnyOf(['n'], ' Pérez  Juan 🇨🇴 ')).toBe('n.ilike."%Pérez  Juan 🇨🇴%"');
    const term = 'ñ'.repeat(2000);
    expect(ilikeAnyOf(['n'], term)).toBe(`n.ilike."%${term}%"`);
  });
});

/* ───────── llamadores del servidor ───────── */
interface Call { m: string; args: unknown[] }
function recorder(result: { data: unknown; error: unknown; count?: number }) {
  const calls: Call[] = [];
  const self: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'in', 'gte', 'lte', 'lt', 'order', 'range', 'limit', 'or']) {
    self[m] = (...args: unknown[]) => { calls.push({ m, args }); return self; };
  }
  self.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
  return { client: self as unknown as SupabaseClient, calls };
}

describe('llamadores de servidor: el `.or` lleva el término entrecomillado y no se aplica con término en blanco (tester F12-misc §1)', () => {
  it('getCalls (números de teléfono): «+57 (1) 234, ext» viaja íntegro y acotado a la organización', async () => {
    const { client, calls } = recorder({ data: [], error: null, count: 0 });
    await getCalls(ORG, client, { q: '+57 (1) 234, ext' });
    expect(calls.find((c) => c.m === 'or')?.args[0]).toBe('to_number.ilike."%+57 (1) 234, ext%",from_number.ilike."%+57 (1) 234, ext%"');
    expect(calls.find((c) => c.m === 'eq')?.args).toEqual(['organization_id', ORG]);
  });
  it('getCalls con q solo espacios: sin `.or`', async () => {
    const { client, calls } = recorder({ data: [], error: null, count: 0 });
    await getCalls(ORG, client, { q: '   ' });
    expect(calls.some((c) => c.m === 'or')).toBe(false);
  });
  it('listCommissions (payee_name/notes): comillas del usuario escapadas', async () => {
    const { client, calls } = recorder({ data: [], error: null, count: 0 });
    await listCommissions(ORG, client, { search: 'Juan "el flaco", (hijo)' });
    expect(calls.find((c) => c.m === 'or')?.args[0]).toBe('payee_name.ilike."%Juan \\"el flaco\\", (hijo)%",notes.ilike."%Juan \\"el flaco\\", (hijo)%"');
  });
});

/* ───────── rol ───────── */
describe('requirePartnerManager — cierra ante contextos malformados (regla dura 6; tester F12-misc §2)', () => {
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());
  const denied: Array<[string, unknown, unknown]> = [
    ['roleId ausente', undefined, false], ['roleId null', null, false], ['roleId NaN', Number.NaN, false], ['roleId string "2"', '2', false],
    ['roleId 0', 0, false], ['roleId -2', -2, false], ['roleId 4 Empleado', 4, false], ['roleId 3 Cliente', 3, false],
    ['isSuperAdmin string "true"', 4, 'true'], ['isSuperAdmin 1', 4, 1], ['isSuperAdmin objeto', 4, {}],
  ];
  it.each(denied)('%s -> 403 MANAGER_REQUIRED y registro solo del roleId', (_n, roleId, isSuperAdmin) => {
    const ctx = { roleId, isSuperAdmin } as unknown as { roleId: number; isSuperAdmin: boolean };
    expect(canManagePartners(ctx)).toBe(false);
    let err: unknown;
    try { requirePartnerManager(ctx); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(RealOrgContextError);
    expect((err as { statusCode: number; code: string }).statusCode).toBe(403);
    expect((err as { code: string }).code).toBe('MANAGER_REQUIRED');
    const warn = (console.warn as jest.Mock).mock.calls.at(-1);
    expect(JSON.stringify(warn)).not.toMatch(/u-1|@|userId|email|roleName/);
    expect(warn?.[1]).toEqual({ roleId });
  });
  it.each([[1, false], [2, false], [5, false], [4, true], [99, true]])('roleId %s / isSuperAdmin %s -> permitido sin registro', (roleId, isSuperAdmin) => {
    expect(() => requirePartnerManager({ roleId, isSuperAdmin })).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

/* ───────── dinero ───────── */
/** Intl separa símbolo y cifra con NBSP (U+00A0): se normaliza a espacio para comparar. */
const money = (v: number | string | null | undefined, c: string | null) => formatMoney(v, c).replace(/ /g, ' ');

describe('formatMoney — bordes (tester F12-misc §3) y resumen de comisiones (tester r1 T2.7)', () => {
  it('«-0» y «-0.001» no muestran signo; negativos reales conservan el signo y los dos decimales', () => {
    expect(money(-0, 'COP')).toBe('$ 0');
    expect(money(-0.001, 'COP')).toBe('$ 0');
    expect(money(-0.004, null)).toBe('0');
    expect(money(-1234.5, 'COP')).toBe('-$ 1.234,50');
    expect(money(-1234, 'COP')).toBe('-$ 1.234');
  });
  it('NaN, Infinity, cadena vacía y undefined -> 0 con la moneda; 1e21 no se degrada a 999.999…', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, '', undefined, 'abc']) expect(money(v, 'USD')).toBe('US$ 0');
    expect(money(1e21, null)).toBe('1.000.000.000.000.000.000.000');
  });
  it('0.005 -> 0,01; 0.1+0.2 -> 0,30; COP y USD reciben el mismo tratamiento de decimales', () => {
    expect(money(0.005, 'COP')).toBe('$ 0,01');
    expect(money(0.1 + 0.2, 'USD')).toBe('US$ 0,30');
    expect(money(250000.5, 'USD')).toBe('US$ 250.000,50');
    expect(money(250000, 'USD')).toBe('US$ 250.000');
  });
  it('summarizeCommissions: rechazadas no entran en outstanding; los centavos se redondean (0.1 + 0.2 = 0.3)', () => {
    const s = summarizeCommissions([
      { commission_status: 'pending', commission_amount: 0.1 }, { commission_status: 'approved', commission_amount: 0.2 },
      { commission_status: 'rejected', commission_amount: 999 }, { commission_status: 'paid', commission_amount: '5' },
    ]);
    expect(s.outstanding).toBe(0.3);
    expect(s.rejected).toBe(999);
    expect(s.paid).toBe(5);
  });
});

/* ───────── guardarraíles estáticos de la interfaz (contratos sobre el fuente; tester r1 §5) ───────── */
describe('guardarraíles estáticos F12 (UI)', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const root = process.cwd();
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
  const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  it('EntitySearchList: los resultados son <button type="button" aria-pressed>, sin div onClick', () => {
    const src = read('src/components/crm/shared/EntitySearchList.tsx');
    expect(src).toMatch(/<button type="button" aria-pressed=\{selectedId === h\.id\}/);
    expect(src).not.toMatch(/<div[^>]*onClick/);
    expect(src).not.toMatch(/role="button"/);
  });
  it("la UI de referidos y partners nunca deriva un día con split('T') ni toISOString().split", () => {
    const files = [...walk('src/components/crm/referidos'), ...walk('src/components/crm/partners'), 'src/components/configuracion/panels/crm/sections/ReferralsProgramCard.tsx'];
    for (const f of files) {
      const src = read(f);
      expect({ f, hit: /split\('T'\)|split\("T"\)/.test(src) }).toEqual({ f, hit: false });
      expect({ f, hit: /toISOString\(\)\.split/.test(src) }).toEqual({ f, hit: false });
    }
  });
  it('las fechas de referidos y deals pasan por useFormatDate (timezone de la organización)', () => {
    expect(read('src/components/crm/referidos/ReferralCard.tsx')).toContain('useFormatDate()');
    expect(read('src/components/crm/partners/PartnerDealTable.tsx')).toContain('useFormatDate()');
  });
});
