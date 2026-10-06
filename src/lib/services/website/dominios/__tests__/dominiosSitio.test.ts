/**
 * Servicio de dominios del sitio (Figma B/07): permisos en el servidor,
 * organización SIEMPRE de la sesión, escrituras con service role filtradas por
 * organización y verificación en un solo punto. Organización ficticia 120;
 * hosts ficticios.
 */
// `orgContext` arrastra `svix` (ESM puro) y rompe Jest: se dobla con la MISMA regla
// (administrador por rol, si no `check_user_permission` vía la RPC de la sesión).
jest.mock('@/lib/utils/orgContext', () => {
  const { isOrgAdminLike } = jest.requireActual('@/lib/utils/orgAdmin');
  return {
    hasOrgAdminOrPermission: async (ctx: { supabase: { rpc: (n: string, a: unknown) => Promise<{ data: unknown }> } }, code = 'admin.full_access') => {
      if (isOrgAdminLike(ctx as never)) return true;
      const { data } = await ctx.supabase.rpc('check_user_permission', { p_permission_code: code });
      return data === true;
    },
  };
});

import {
  cambiarAutoRenovar,
  cambiarSubdominio,
  conectarDominio,
  ErrorDominios,
  hacerPrincipal,
  leerDominios,
  quitarDominio,
  solicitarCodigoTransferencia,
  type CtxDominios,
  type DependenciasDominios,
} from '../dominiosSitioService';
import { decidirResultado, verificarDominioSitio } from '../verificacion';
import { supabaseFalso } from './supabaseFalso';

const AHORA = new Date('2026-10-06T15:00:00Z');

function base() {
  return {
    organizations: [
      { id: 120, name: 'Mi empresa S.A.S.', legal_name: null, email: 'admin@tumarca.com', phone: '+57 300 000 0000', address: 'Calle 00', city: 'Ciudad', state: 'Dpto', postal_code: '000000', country_code: 'co', subdomain: 'tu-marca' },
      { id: 999, name: 'Otra', subdomain: 'ocupado' },
    ],
    organization_domains: [
      { id: 's1', organization_id: 120, host: 'tu-marca.goadmin.io', domain_type: 'system_subdomain', status: 'verified', is_primary: false, is_active: true, verified_at: null, last_verification_at: null, redirect_to_domain_id: null, redirect_status_code: null, vercel_state: {}, metadata: {} },
      { id: 'r1', organization_id: 120, host: 'tumarca.com', domain_type: 'custom_domain', status: 'verified', is_primary: true, is_active: true, verified_at: '2026-01-01T00:00:00Z', last_verification_at: null, redirect_to_domain_id: null, redirect_status_code: null, vercel_state: {}, metadata: {} },
      { id: 'w1', organization_id: 120, host: 'www.tumarca.com', domain_type: 'www_alias', status: 'verified', is_primary: false, is_active: true, verified_at: null, last_verification_at: null, redirect_to_domain_id: 'r1', redirect_status_code: 308, vercel_state: {}, metadata: {} },
      { id: 'c1', organization_id: 120, host: 'tumarca.co', domain_type: 'custom_domain', status: 'verified', is_primary: false, is_active: true, verified_at: null, last_verification_at: null, redirect_to_domain_id: null, redirect_status_code: null, vercel_state: {}, metadata: { auto_renew: false, expires_at: '2026-10-27T15:00:00Z' } },
      { id: 'p1', organization_id: 120, host: 'pendiente.shop', domain_type: 'custom_domain', status: 'pending', is_primary: false, is_active: true, verified_at: null, last_verification_at: null, redirect_to_domain_id: null, redirect_status_code: null, vercel_state: {}, metadata: {}, verification_value: 'token-x', verification_token: 'token-x', verification_record: '_go-admin-verify.pendiente' },
      { id: 'x1', organization_id: 999, host: 'ajeno.com', domain_type: 'custom_domain', status: 'verified', is_primary: false, is_active: true, metadata: {} },
    ],
    website_site_states: [{ id: 'st', organization_id: 120, branch_id: null, primary_domain_id: 'r1' }],
    domain_purchases: [
      { organization_id: 120, domain: 'tumarca.co', created_at: '2026-01-02T00:00:00Z', amount: 30, currency: 'USD', status: 'completed' },
      { organization_id: 120, domain: 'tumarca.com', created_at: '2026-09-20T00:00:00Z', amount: 30, currency: 'USD', status: 'completed' },
    ],
    branches: [
      { id: 7, organization_id: 120, name: 'Sede Centro' },
      { id: 8, organization_id: 999, name: 'Sede ajena' },
    ],
  };
}

function preparar(opts: { admin?: boolean; permiso?: boolean; errorInsert?: { code: string; message: string } } = {}) {
  const db = supabaseFalso(base(), { errorInsert: opts.errorInsert });
  const ctx: CtxDominios = {
    organizationId: 120,
    userId: 'u-1',
    userEmail: 'admin@tumarca.com',
    roleId: opts.admin === false ? 5 : 2,
    isSuperAdmin: false,
    supabase: { ...(db.cliente as object), rpc: async () => ({ data: opts.permiso ?? false, error: null }) } as never,
  };
  const enviarCodigo = jest.fn(async () => true);
  const autoRenovar = jest.fn(async () => undefined);
  const codigoAutorizacion = jest.fn(async () => 'CODIGO-SECRETO');
  const deps: DependenciasDominios = {
    servicio: db.cliente,
    vercel: null,
    registrador: { autoRenovar, codigoAutorizacion },
    resolverNs: async () => ['ns1.domaincontrol.com'],
    enviarCodigo,
    ahora: () => AHORA,
  };
  return { db, ctx, deps, enviarCodigo, autoRenovar, codigoAutorizacion };
}

async function codigoDe(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErrorDominios) return [e.estado, e.codigo];
    throw e;
  }
  throw new Error('no lanzó');
}

describe('permisos (regla 6)', () => {
  test('sin website.domains ni administrador: 403 sin_permiso y no se lee nada', async () => {
    const { ctx, deps } = preparar({ admin: false, permiso: false });
    expect(await codigoDe(leerDominios(ctx, deps))).toEqual([403, 'sin_permiso']);
  });

  test('con website.domains (sin ser administrador) se gestiona, pero no se compra', async () => {
    const { ctx, deps } = preparar({ admin: false, permiso: true });
    const r = await leerDominios(ctx, deps);
    expect(r.permisos.gestionar).toBe(true);
  });
});

describe('lista (B/07-01)', () => {
  test('dirección pública, orden, avisos y titular precargado', async () => {
    const { ctx, deps } = preparar();
    const r = await leerDominios(ctx, deps);
    expect(r.hostSubdominio).toBe('tu-marca.goadmin.io');
    expect(r.hostPublico).toBe('tumarca.com');
    expect(r.dominios.map((d) => d.host)).toEqual(['tumarca.com', 'www.tumarca.com', 'pendiente.shop', 'tumarca.co', 'tu-marca.goadmin.io']);
    expect(r.dominios.find((d) => d.host === 'ajeno.com')).toBeUndefined();
    expect(r.dominios.find((d) => d.host === 'tumarca.co')?.tipo).toBe('comprado');
    expect(r.alertas).toEqual([expect.objectContaining({ host: 'tumarca.co', tipo: 'vence_sin_renovar', dias: 21 })]);
    expect(r.titular).toMatchObject({ nombre: 'Mi empresa S.A.S.', pais: 'CO' });
    expect(r.conexionAutomatica).toBe(false);
  });

  test('?sede= se resuelve en el servidor: propia con su nombre, ajena o inexistente en null', async () => {
    const { ctx, deps } = preparar();
    expect((await leerDominios(ctx, deps)).sede).toBeNull();
    expect((await leerDominios(ctx, deps, { sede: '7' })).sede).toEqual({ id: 7, nombre: 'Sede Centro' });
    expect((await leerDominios(ctx, deps, { sede: '8' })).sede).toBeNull();
    expect((await leerDominios(ctx, deps, { sede: 'x' })).sede).toBeNull();
  });
});

describe('conectar (B/07-06, 07-11)', () => {
  test('host inválido o del sistema: 400', async () => {
    const { ctx, deps } = preparar();
    expect(await codigoDe(conectarDominio(ctx, { host: 'no es un dominio' }, deps))).toEqual([400, 'host_invalido']);
    expect(await codigoDe(conectarDominio(ctx, { host: 'otra.goadmin.io' }, deps))).toEqual([400, 'host_invalido']);
  });

  test('host de otra organización: 409 sin revelar cuál y sin escribir', async () => {
    const { ctx, deps, db } = preparar();
    expect(await codigoDe(conectarDominio(ctx, { host: 'https://www.AJENO.com/' }, deps))).toEqual([409, 'en_otra_organizacion']);
    expect(db.escrituras).toEqual([]);
  });

  test('crea la raíz y su www (308) en la organización de la sesión; la sede ajena se ignora', async () => {
    const { ctx, deps, db } = preparar();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await conectarDominio(ctx, { host: 'nuevo.com.co', sedeId: 8 }, deps);
    const inserts = db.escrituras.filter((e) => e.op === 'insert');
    expect(inserts.map((e) => [e.valores?.host, e.valores?.domain_type, e.valores?.organization_id])).toEqual([
      ['nuevo.com.co', 'custom_domain', 120],
      ['www.nuevo.com.co', 'www_alias', 120],
    ]);
    expect(inserts[1].valores).toMatchObject({ redirect_status_code: 308, redirect_to_domain_id: inserts[0].valores?.id });
    expect(inserts[0].valores?.metadata).toEqual({ source: 'sitio_web' });
    expect(r.proveedor).toBe('godaddy');
    expect(r.dominio.host).toBe('nuevo.com.co');
  });

  test('sede propia: se guarda', async () => {
    const { ctx, deps, db } = preparar();
    await conectarDominio(ctx, { host: 'sede.com', sedeId: '7' }, deps);
    expect(db.escrituras[0].valores?.metadata).toEqual({ source: 'sitio_web', branch_id: 7 });
  });

  test('carrera con el UNIQUE global (23505): 409', async () => {
    const { ctx, deps } = preparar({ errorInsert: { code: '23505', message: 'duplicate' } });
    expect(await codigoDe(conectarDominio(ctx, { host: 'carrera.com' }, deps))).toEqual([409, 'en_otra_organizacion']);
  });
});

describe('principal, quitar y subdominio', () => {
  test('un dominio sin verificar no puede ser principal', async () => {
    const { ctx, deps } = preparar();
    expect(await codigoDe(hacerPrincipal(ctx, 'p1', deps))).toEqual([422, 'no_verificado']);
  });

  test('hacer principal: desmarca el anterior, marca este y fija primary_domain_id', async () => {
    const { ctx, deps, db } = preparar();
    const d = await hacerPrincipal(ctx, 'c1', deps);
    expect(d.principal).toBe(true);
    expect(db.tablas.organization_domains.filter((f) => f.is_primary).map((f) => f.id)).toEqual(['c1']);
    expect(db.tablas.website_site_states[0].primary_domain_id).toBe('c1');
    for (const e of db.escrituras) expect(e.filtros).toContainEqual(['organization_id', 'eq', 120]);
  });

  test('el subdominio del sistema no se quita (nota-ux 1)', async () => {
    const { ctx, deps } = preparar();
    expect(await codigoDe(quitarDominio(ctx, 's1', deps))).toEqual([422, 'subdominio_sistema']);
  });

  test('quitar el principal: se va con su www y el subdominio pasa a ser el principal', async () => {
    const { ctx, deps, db } = preparar();
    await quitarDominio(ctx, 'r1', deps);
    const hosts = db.tablas.organization_domains.map((f) => f.host);
    expect(hosts).not.toContain('tumarca.com');
    expect(hosts).not.toContain('www.tumarca.com');
    expect(hosts).toContain('ajeno.com');
    expect(db.tablas.organization_domains.find((f) => f.id === 's1')?.is_primary).toBe(true);
  });

  test('un id de otra organización es 404', async () => {
    const { ctx, deps } = preparar();
    expect(await codigoDe(quitarDominio(ctx, 'x1', deps))).toEqual([404, 'no_existe']);
  });

  test('subdominio: forma, reservados, unicidad y escritura', async () => {
    const { ctx, deps, db } = preparar();
    expect(await codigoDe(cambiarSubdominio(ctx, '-mal', deps))).toEqual([400, 'subdominio_invalido']);
    expect(await codigoDe(cambiarSubdominio(ctx, 'admin', deps))).toEqual([400, 'subdominio_invalido']);
    expect(await codigoDe(cambiarSubdominio(ctx, 'ocupado', deps))).toEqual([409, 'subdominio_en_uso']);
    expect(await cambiarSubdominio(ctx, 'Mi-Tienda', deps)).toEqual({ subdominio: 'mi-tienda', host: 'mi-tienda.goadmin.io' });
    expect(db.tablas.organizations.find((o) => o.id === 120)?.subdomain).toBe('mi-tienda');
    expect(db.tablas.organization_domains.find((f) => f.id === 's1')?.host).toBe('mi-tienda.goadmin.io');
  });
});

describe('renovación y transferencia (B/07-21, 07-23)', () => {
  test('auto-renovación: solo comprados; registrador + dato local', async () => {
    const { ctx, deps, autoRenovar, db } = preparar();
    expect(await codigoDe(cambiarAutoRenovar(ctx, 'p1', true, deps))).toEqual([422, 'no_comprado']);
    const d = await cambiarAutoRenovar(ctx, 'c1', true, deps);
    expect(autoRenovar).toHaveBeenCalledWith('tumarca.co', true);
    expect(d.renovacion.tipo).toBe('automatica');
    expect((db.tablas.organization_domains.find((f) => f.id === 'c1')?.metadata as Record<string, unknown>).expires_at).toBe('2026-10-27T15:00:00Z');
  });

  test('sin registrador configurado: 503 honesto', async () => {
    const { ctx, deps } = preparar();
    expect(await codigoDe(cambiarAutoRenovar(ctx, 'c1', true, { ...deps, registrador: null }))).toEqual([503, 'no_disponible']);
  });

  test('código de transferencia: 60 días, y el código va por correo, no en la respuesta', async () => {
    const { ctx, deps, enviarCodigo } = preparar();
    expect(await codigoDe(solicitarCodigoTransferencia(ctx, 'r1', deps))).toEqual([422, 'muy_reciente']);
    const r = await solicitarCodigoTransferencia(ctx, 'c1', deps);
    expect(r).toEqual({ correo: 'admin@tumarca.com' });
    expect(JSON.stringify(r)).not.toContain('CODIGO-SECRETO');
    expect(enviarCodigo).toHaveBeenCalledWith({ para: 'admin@tumarca.com', host: 'tumarca.co', codigo: 'CODIGO-SECRETO' });
  });
});

describe('verificación (B/07-08…07-12)', () => {
  const proyecto = (verified: boolean, verification: { type: string; domain: string; value: string }[] = []) => ({ name: 'tumarca.com', apexName: 'tumarca.com', verified, verification });
  const config = (misconfigured: boolean) => ({ misconfigured, ipv4: '192.0.2.21', cname: null });
  const configWww = (misconfigured: boolean) => ({ misconfigured, ipv4: null, cname: 'destino.example.net' });

  test('activo: Vercel verificado y bien configurado', () => {
    const r = decidirResultado({ proyecto: proyecto(true), config: config(false), configWww: configWww(false), lecturas: [{ a: ['192.0.2.21'], cname: ['destino.example.net.'] }], conWww: true });
    expect(r.resultado).toBe('activo');
    expect(r.registros.map((x) => [x.tipo, x.estado])).toEqual([
      ['A', 'correcto'],
      ['CNAME', 'correcto'],
    ]);
  });

  test('mal configurado: el A apunta a otro servidor en todos los resolutores', () => {
    const r = decidirResultado({ proyecto: proyecto(true), config: config(true), configWww: configWww(false), lecturas: [{ a: ['192.0.2.10'], cname: null }, { a: ['192.0.2.10'], cname: null }], conWww: true });
    expect(r.resultado).toBe('mal_configurado');
    expect(r.registros[0]).toMatchObject({ tipo: 'A', estado: 'otro_valor', encontrado: '192.0.2.10' });
  });

  test('propagando: unos resolutores ya lo ven y otros no', () => {
    const r = decidirResultado({
      proyecto: proyecto(true),
      config: config(true),
      configWww: null,
      lecturas: [{ a: ['192.0.2.21'], cname: null }, { a: ['192.0.2.10'], cname: null }, { a: null, cname: null }],
      conWww: false,
    });
    expect(r.resultado).toBe('propagando');
    expect(r.propagacion).toEqual({ vistos: 1, total: 3 });
  });

  test('en uso en otra cuenta: Vercel pide el TXT de propiedad', () => {
    const r = decidirResultado({ proyecto: proyecto(false, [{ type: 'TXT', domain: '_vercel.tumarca.com', value: 'vc-domain-verify=x' }]), config: config(true), configWww: null, lecturas: [], conWww: false });
    expect(r.resultado).toBe('en_uso');
    expect(r.registros).toContainEqual({ tipo: 'TXT', valor: 'vc-domain-verify=x', estado: 'pendiente', encontrado: null });
  });

  test('verificando: nada aparece todavía', () => {
    const r = decidirResultado({ proyecto: proyecto(true), config: config(true), configWww: null, lecturas: [{ a: null, cname: null }], conWww: false });
    expect(r.resultado).toBe('verificando');
    expect(r.registros[0].estado).toBe('no_aparece');
  });

  test('sin Vercel delega en la verificación de propiedad P0-8 (una sola implementación)', async () => {
    const { db } = preparar();
    const propiedad = jest.fn(async () => ({ ok: false as const, estado: 'pending' as const, codigo: 'NO_ENCONTRADO' as const, mensaje: 'Todavía no encontramos el registro DNS.' }));
    const r = await verificarDominioSitio(120, 'p1', { servicio: db.cliente, vercel: null, propiedad, ahora: () => AHORA });
    expect(propiedad).toHaveBeenCalledWith(db.cliente, 120, 'p1');
    expect(r.resultado).toBe('verificando');
    expect(r.registros).toEqual([{ tipo: 'TXT', nombre: '_go-admin-verify', valor: 'token-x', estado: 'no_aparece', encontrado: null }]);
  });

  test('con Vercel: añade al proyecto si falta, consulta los resolutores y guarda el estado en la organización', async () => {
    const { db } = preparar();
    const vercel = {
      leer: jest.fn(async () => null),
      agregar: jest.fn(async () => proyecto(true)),
      verificar: jest.fn(),
      configuracion: jest.fn(async () => config(false)),
      redirigir: jest.fn(),
      quitar: jest.fn(),
    };
    const resolutor = { resolve4: async () => ['192.0.2.21'], resolveCname: async () => [] };
    const r = await verificarDominioSitio(120, 'p1', { servicio: db.cliente, vercel: vercel as never, resolutores: [resolutor, resolutor], ahora: () => AHORA });
    expect(vercel.agregar).toHaveBeenCalledWith('pendiente.shop');
    expect(r.resultado).toBe('activo');
    expect(r.propagacion).toEqual({ vistos: 2, total: 2 });
    const fila = db.tablas.organization_domains.find((f) => f.id === 'p1')!;
    expect(fila.status).toBe('verified');
    expect((fila.vercel_state as { registros: unknown[] }).registros).toEqual([{ tipo: 'A', nombre: '@', valor: '192.0.2.21', estado: 'correcto', encontrado: null }]);
    const upd = db.escrituras.find((e) => e.op === 'update')!;
    expect(upd.filtros).toContainEqual(['organization_id', 'eq', 120]);
  });

  test('un id de otra organización no se verifica', async () => {
    const { db } = preparar();
    await expect(verificarDominioSitio(120, 'x1', { servicio: db.cliente, vercel: null })).rejects.toThrow('no_existe');
  });
});
