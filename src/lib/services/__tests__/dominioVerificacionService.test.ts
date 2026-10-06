import type { SupabaseClient } from '@supabase/supabase-js';
import {
  comprobarRegistroDns,
  nombresCandidatos,
  verificarDominio,
  type DominioAVerificar,
  type ResolverDns,
} from '../dominioVerificacionService';

const NO_EXISTE = Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' });

function resolver(txt: Record<string, string[][]> = {}, cname: Record<string, string[]> = {}): ResolverDns & {
  consultados: string[];
} {
  const consultados: string[] = [];
  return {
    consultados,
    resolveTxt: async (n) => {
      consultados.push(n);
      if (txt[n]) return txt[n];
      throw NO_EXISTE;
    },
    resolveCname: async (n) => {
      consultados.push(n);
      if (cname[n]) return cname[n];
      throw NO_EXISTE;
    },
  };
}

const base: DominioAVerificar = {
  host: 'tienda.com',
  domain_type: 'custom_domain',
  verification_type: 'TXT',
  verification_record: '_go-admin-challenge.tienda.com',
  verification_value: 'go-admin-verify-abc123',
  verification_token: 'go-admin-verify-abc123',
};

describe('nombresCandidatos', () => {
  it('usa el registro completo tal cual cuando ya cuelga del host', () => {
    expect(nombresCandidatos(base)[0]).toBe('_go-admin-challenge.tienda.com');
  });

  it('un registro relativo se prueba colgado del host y de su zona', () => {
    const n = nombresCandidatos({ host: 'www.tienda.com', verification_record: '_go-admin-verify.www' });
    expect(n).toContain('_go-admin-verify.www.www.tienda.com');
    expect(n).toContain('_go-admin-verify.www.tienda.com');
  });

  it('normaliza mayúsculas y punto final, sin duplicados', () => {
    const n = nombresCandidatos({ host: 'Tienda.COM.', verification_record: '_GO-ADMIN-CHALLENGE.tienda.com.' });
    expect(new Set(n).size).toBe(n.length);
    expect(n[0]).toBe('_go-admin-challenge.tienda.com');
  });
});

describe('comprobarRegistroDns', () => {
  it('encuentra el TXT con el valor exacto', async () => {
    const r = await comprobarRegistroDns(base, resolver({ '_go-admin-challenge.tienda.com': [['go-admin-verify-abc123']] }));
    expect(r).toEqual({ encontrado: true, nombre: '_go-admin-challenge.tienda.com' });
  });

  it('une los trozos de un TXT largo', async () => {
    const r = await comprobarRegistroDns(base, resolver({ '_go-admin-challenge.tienda.com': [['go-admin-', 'verify-abc123']] }));
    expect(r.encontrado).toBe(true);
  });

  it('un TXT con otro valor no verifica', async () => {
    const r = await comprobarRegistroDns(base, resolver({ '_go-admin-challenge.tienda.com': [['otro-valor']] }));
    expect(r).toEqual({ encontrado: false, motivo: 'no_coincide' });
  });

  it('sin registro no verifica (nunca «al tercer intento»)', async () => {
    const dns = resolver();
    for (let i = 0; i < 3; i++) {
      expect(await comprobarRegistroDns(base, dns)).toEqual({ encontrado: false, motivo: 'no_encontrado' });
    }
  });

  it('CNAME: compara el destino', async () => {
    const d = { ...base, verification_type: 'CNAME', verification_value: 'sitios.goadmin.io' };
    const ok = await comprobarRegistroDns(d, resolver({}, { '_go-admin-challenge.tienda.com': ['Sitios.GoAdmin.io.'] }));
    expect(ok.encontrado).toBe(true);
  });

  it('sin valor esperado no consulta y no verifica', async () => {
    const dns = resolver();
    const r = await comprobarRegistroDns({ ...base, verification_value: null, verification_token: null }, dns);
    expect(r).toEqual({ encontrado: false, motivo: 'sin_valor' });
    expect(dns.consultados).toHaveLength(0);
  });

  it('un error inesperado del resolver se lanza (no se toma por verificado)', async () => {
    const dns: ResolverDns = { resolveTxt: async () => { throw new Error('boom'); }, resolveCname: async () => [] };
    await expect(comprobarRegistroDns(base, dns)).rejects.toThrow('boom');
  });
});

// ─── verificarDominio con un cliente falso ──────────────────────────────────

interface Llamada { tabla: string; op: string; filtros: Array<[string, string, unknown]>; valores?: unknown }

function clienteFalso(opts: { dominio: Record<string, unknown> | null; verificadoPorOtra?: boolean }) {
  const llamadas: Llamada[] = [];
  const from = (tabla: string) => {
    const ll: Llamada = { tabla, op: 'select', filtros: [] };
    llamadas.push(ll);
    const q: Record<string, unknown> = {};
    const filtro = (nombre: string) => (col: string, v: unknown) => { ll.filtros.push([nombre, col, v]); return q; };
    Object.assign(q, {
      select: () => q,
      update: (valores: unknown) => { ll.op = 'update'; ll.valores = valores; return q; },
      eq: filtro('eq'),
      neq: filtro('neq'),
      limit: () => Promise.resolve({ data: opts.verificadoPorOtra ? [{ id: 'x' }] : [], error: null }),
      maybeSingle: () => Promise.resolve({ data: opts.dominio, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
    });
    return q;
  };
  return { cliente: { from } as unknown as SupabaseClient, llamadas };
}

const fila = { id: '6f1c3c1e-0000-4000-8000-000000000001', status: 'pending', verification_attempts: 2, ...base };

describe('verificarDominio', () => {
  it('busca el dominio DENTRO de la organización de la sesión', async () => {
    const { cliente, llamadas } = clienteFalso({ dominio: null });
    const r = await verificarDominio(cliente, 120, fila.id, resolver());
    expect(r).toMatchObject({ ok: false, codigo: 'NO_EXISTE' });
    expect(llamadas[0].filtros).toContainEqual(['eq', 'organization_id', 120]);
  });

  it('con el registro presente lo marca verified, filtrando por organización', async () => {
    const { cliente, llamadas } = clienteFalso({ dominio: fila });
    const r = await verificarDominio(cliente, 120, fila.id, resolver({ '_go-admin-challenge.tienda.com': [['go-admin-verify-abc123']] }));
    expect(r).toMatchObject({ ok: true, estado: 'verified' });
    const upd = llamadas.find((l) => l.op === 'update');
    expect(upd?.valores).toMatchObject({ status: 'verified', verification_attempts: 3 });
    expect(upd?.filtros).toContainEqual(['eq', 'organization_id', 120]);
  });

  it('sin registro solo suma el intento: nunca escribe verified', async () => {
    const { cliente, llamadas } = clienteFalso({ dominio: fila });
    const r = await verificarDominio(cliente, 120, fila.id, resolver());
    expect(r).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO' });
    const upd = llamadas.find((l) => l.op === 'update');
    expect(upd?.valores).not.toHaveProperty('status');
  });

  it('un host ya verificado por otra organización no se verifica', async () => {
    const { cliente, llamadas } = clienteFalso({ dominio: fila, verificadoPorOtra: true });
    const r = await verificarDominio(cliente, 120, fila.id, resolver({ '_go-admin-challenge.tienda.com': [['go-admin-verify-abc123']] }));
    expect(r).toMatchObject({ ok: false, codigo: 'DOMINIO_DE_OTRA' });
    expect(llamadas.some((l) => l.op === 'update')).toBe(false);
  });
});
