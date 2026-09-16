/// <reference types="jest" />
/**
 * F12-misc — tester adversarial (2026-09-16).
 *
 * 1. `postgrestFilters`: ningún carácter del usuario puede salir del valor
 *    entrecomillado (inyección `,or(...)`). Se comprueba con un analizador
 *    mínimo de la gramática de `or=` de PostgREST (valor entre comillas con
 *    `\"` y `\\` como únicos escapes) y con 300 cadenas aleatorias. Contra
 *    PostgREST REAL (tabla de catálogo `countries`, clave anon, solo lectura)
 *    se verificó ese mismo día: `"%\\"` → 22025 «LIKE pattern must not end with
 *    escape character» (PostgREST desescapa `\\` → `\`), `"%Chi\\%%"` → 0 filas
 *    (el `%` llega literal), `"%C*a%"` → 2 filas (`*` es comodín aunque vaya
 *    entrecomillado) y `zz",code.eq.COL,name.ilike."` → 0 filas (no escapa).
 * 2. Rol: `requirePartnerManager` cierra ante `roleId` ausente/NaN/string y
 *    `isSuperAdmin` no booleano; DELETE de tier y PATCH de programa exigen el
 *    mismo rol que sus hermanos PATCH/DELETE.
 * 3. `formatMoney`: «-0» no se muestra con signo; negativos sí; 1e21 sin ruido.
 * 4. `GET /api/crm/customers/search` (CallLinkPanel) usa el helper único.
 */
import { NextRequest } from 'next/server';
import { ilikeAnyOf, likePattern, quoteFilterValue } from '@/lib/utils/postgrestFilters';
import { formatMoney } from '@/lib/services/crm/partnerModel';
import { canManagePartners, requirePartnerManager } from '@/lib/services/crm/f12RouteSupport';
import { getCalls } from '@/lib/services/crm/callManagementService';
import { listCommissions } from '@/lib/services/crm/commissionAdminService';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from '@/app/api/crm/referrals/__tests__/f12Fake';
import type { SupabaseClient } from '@supabase/supabase-js';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
let db: FakeDb;
const session: { roleId: unknown; isSuperAdmin: unknown; supabase?: unknown } = { roleId: 4, isSuperAdmin: false };
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: 'u-1', roleId: session.roleId, roleName: 'Empleado', isSuperAdmin: session.isSuperAdmin, supabase: session.supabase ?? fakeSupabase(db) })),
}));

import { DELETE as tierDelete } from '@/app/api/crm/partners/tiers/[id]/route';
import { PATCH as programPatch } from '@/app/api/crm/referrals/programs/[id]/route';
import { GET as customersSearch } from '@/app/api/crm/customers/search/route';

/* ───────── analizador mínimo de `or=(a.op.v,b.op."v",and(...))` ───────── */
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

describe('postgrestFilters — nada escapa del valor entrecomillado', () => {
  const vectors = [
    'zz",code.eq.COL,name.ilike."',
    'zz%",code.eq.COL,name.ilike."%',
    'zz),code.eq.COL,and(name.ilike.',
    'zz\\",code.eq.COL,name.ilike."',
    'zz\\\\",code.eq.COL,name.ilike."',
    'zz",organization_id.eq.121,name.ilike."',
    'zz",not.is.null,x.ilike."',
    '"',
    '\\',
    '\\"',
    '"\\',
    ',',
    ')',
    '(',
    'a"b\\c,d(e)f',
    '%_\\*',
    '\u0000",code.eq.COL,name.ilike."\u0000',
    'x'.repeat(2000) + '",code.eq.COL,x.ilike."',
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
      // El `%` final no puede quedar escapado: el número de barras justo antes debe ser par.
      expect((/(\\*)%$/.exec(p)?.[1].length ?? 0) % 2).toBe(0);
      expect(p.startsWith('%') && p.endsWith('%')).toBe(true);
      const inner = p.slice(1, -1);
      // Quitando cada pareja `\%`, `\_`, `\\`, no queda ningún `%` ni `\` suelto; `*` pasa a `_` (comodín de UN carácter).
      expect(inner.replace(/\\[%_\\]/g, '')).not.toMatch(/[%\\]/);
      expect(inner).not.toContain('*');
    }
  });

  it('`*` se convierte en `_` DESPUÉS de escapar (no queda como `\\_`)', () => {
    expect(likePattern('C*a')).toBe('%C_a%');
    expect(likePattern('*')).toBe('%_%');
    expect(ilikeAnyOf(['n'], 'C*a')).toBe('n.ilike."%C_a%"');
  });

  it('bytes de control (incluido DEL 0x7f) se retiran; el unicode y los espacios internos se conservan', () => {
    expect(quoteFilterValue('a\u007fb\tc\rd')).toBe('"abcd"');
    expect(ilikeAnyOf(['n'], ' Pérez  Juan 🇨🇴 ')).toBe('n.ilike."%Pérez  Juan 🇨🇴%"');
  });

  it('cadena de 2000 caracteres: pasa íntegra (sin tope); NO VERIFICADO en la UI un límite de longitud', () => {
    const term = 'ñ'.repeat(2000);
    const f = ilikeAnyOf(['n'], term);
    expect(f).toBe(`n.ilike."%${term}%"`);
    expect(f.length).toBe(2000 + 'n.ilike."%%"'.length);
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

describe('llamadores de servidor: el `.or` lleva el término entrecomillado y no se aplica con término en blanco', () => {
  it('getCalls (números de teléfono): «+57 (1) 234, ext» viaja íntegro', async () => {
    const { client, calls } = recorder({ data: [], error: null, count: 0 });
    await getCalls(ORG, client, { q: '+57 (1) 234, ext' });
    const or = calls.find((c) => c.m === 'or');
    expect(or?.args[0]).toBe('to_number.ilike."%+57 (1) 234, ext%",from_number.ilike."%+57 (1) 234, ext%"');
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

describe('GET /api/crm/customers/search — ruta del CallLinkPanel (quedaba sin sanear)', () => {
  it('q con coma y paréntesis: el `.or` va entrecomillado y acotado a la organización de la sesión', async () => {
    const { client, calls } = recorder({ data: [{ id: 'c1' }], error: null });
    session.supabase = client;
    try {
      const res = await customersSearch(new NextRequest('http://localhost/api/crm/customers/search?q=' + encodeURIComponent('Pérez, Juan (hijo)')));
      expect(res.status).toBe(200);
      expect(calls.find((c) => c.m === 'or')?.args[0]).toBe('first_name.ilike."%Pérez, Juan (hijo)%",last_name.ilike."%Pérez, Juan (hijo)%",phone.ilike."%Pérez, Juan (hijo)%"');
      expect(calls.find((c) => c.m === 'eq')?.args).toEqual(['organization_id', ORG]);
    } finally {
      session.supabase = undefined;
    }
  });
});

/* ───────── rol ───────── */
describe('requirePartnerManager — cierra ante contextos malformados (regla dura 6)', () => {
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());
  const denied: Array<[string, unknown, unknown]> = [
    ['roleId ausente', undefined, false],
    ['roleId null', null, false],
    ['roleId NaN', Number.NaN, false],
    ['roleId string "2"', '2', false],
    ['roleId 0', 0, false],
    ['roleId -2', -2, false],
    ['roleId 4 Empleado', 4, false],
    ['roleId 3 Cliente', 3, false],
    ['isSuperAdmin string "true"', 4, 'true'],
    ['isSuperAdmin 1', 4, 1],
    ['isSuperAdmin objeto', 4, {}],
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

describe('hermanos que quedaban sin rol: DELETE tiers/[id] y PATCH programs/[id]', () => {
  const req = (url: string, method: string, body?: unknown) =>
    new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  beforeEach(() => {
    db = makeDb(seed());
    session.roleId = 4; session.isSuperAdmin = false;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('DELETE tier libre como Empleado -> 403 y el tier sigue; como manager -> 200', async () => {
    const r = await tierDelete(req(`/api/crm/partners/tiers/${U(62)}`, 'DELETE'), params(U(62)));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('MANAGER_REQUIRED');
    expect(db.tables.partner_tiers.some((t) => t.id === U(62))).toBe(true);
    expect(db.writes).toHaveLength(0);
    session.roleId = 5;
    expect((await tierDelete(req(`/api/crm/partners/tiers/${U(62)}`, 'DELETE'), params(U(62)))).status).toBe(200);
  });
  it('DELETE tier: organización ajena en la query se comprueba ANTES que el rol (Empleado -> FOREIGN_ORGANIZATION)', async () => {
    const r = await tierDelete(req(`/api/crm/partners/tiers/${U(62)}?organization_id=${OTHER}`, 'DELETE'), params(U(62)));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('FOREIGN_ORGANIZATION');
  });
  it('PATCH programa (recompensa) como Empleado -> 403 sin escribir; manager -> 200 acotado a la organización', async () => {
    const r = await programPatch(req(`/api/crm/referrals/programs/${U(11)}`, 'PATCH', { reward_amount: 99 }), params(U(11)));
    expect(r.status).toBe(403);
    expect(db.writes).toHaveLength(0);
    session.roleId = 5;
    const ok = await programPatch(req(`/api/crm/referrals/programs/${U(11)}`, 'PATCH', { reward_amount: 99 }), params(U(11)));
    expect(ok.status).toBe(200);
    expect(db.writes[0].filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
  });
  it('PATCH programa: organización ajena en el body gana al rol', async () => {
    const r = await programPatch(req(`/api/crm/referrals/programs/${U(11)}`, 'PATCH', { organization_id: OTHER, reward_amount: 1 }), params(U(11)));
    expect((await r.json()).code).toBe('FOREIGN_ORGANIZATION');
  });
});

/* ───────── formatMoney ───────── */
/** Intl separa símbolo y cifra con NBSP (U+00A0): se normaliza a espacio para comparar. */
const money = (v: number | string | null | undefined, c: string | null) => formatMoney(v, c).replace(/\u00a0/g, ' ');

describe('formatMoney — bordes', () => {
  it('«-0» y «-0.001» no muestran signo', () => {
    expect(money(-0, 'COP')).toBe('$ 0');
    expect(money(-0.001, 'COP')).toBe('$ 0');
    expect(money(-0.004, null)).toBe('0');
  });
  it('negativos reales conservan el signo y los dos decimales', () => {
    expect(money(-1234.5, 'COP')).toBe('-$ 1.234,50');
    expect(money(-1234, 'COP')).toBe('-$ 1.234');
  });
  it('NaN, Infinity, cadena vacía y undefined -> 0 con la moneda', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, '', undefined, 'abc']) expect(money(v, 'USD')).toBe('US$ 0');
  });
  it('1e21 no se degrada a 999.999…', () => {
    expect(money(1e21, null)).toBe('1.000.000.000.000.000.000.000');
  });
  it('0.005 -> 0,01; 0.1+0.2 -> 0,30; COP y USD reciben el mismo tratamiento de decimales', () => {
    expect(money(0.005, 'COP')).toBe('$ 0,01');
    expect(money(0.1 + 0.2, 'USD')).toBe('US$ 0,30');
    expect(money(250000.5, 'USD')).toBe('US$ 250.000,50');
    expect(money(250000, 'USD')).toBe('US$ 250.000');
  });
});
