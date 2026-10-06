/**
 * Dominios del sitio web (SOLO servidor; Figma B/07-01…07-28). Es lo que hay
 * detrás de `/api/sitio-web/dominios/**`: un solo lugar que lee la lista, el
 * detalle y los avisos, y que conecta, verifica, hace principal, quita y
 * cambia el subdominio. La lista, el detalle, los diálogos, el Resumen, el
 * asistente y Sedes en la web llegan aquí por `useDominiosSitio`.
 *
 * - Organización: SIEMPRE la de la sesión (`ctx.organizationId`).
 * - Lecturas: cliente de la sesión (RLS de miembros).
 * - Escrituras: service role (`deps.servicio`), solo después de comprobar
 *   `website.domains` en el servidor y filtrando por la organización. Con la
 *   migración P0-8 aplicada, `authenticated` ya no puede escribir el estado.
 * - Vercel: `vercelDominios.ts`. Sin configuración, el flujo sigue con la
 *   verificación de propiedad y lo dice (`conexionAutomatica: false`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { promises as dnsPromises } from 'node:dns';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { direccionSitio } from '@/lib/website/resumenSitio';
import { DOMINIO_SITIOS } from '@/lib/website/hostSitio';
import {
  aDominioSitio,
  alertasDominios,
  ordenarDominios,
  puedeSerPrincipal,
  transferenciaDisponible,
  type CompraDominio,
  type FilaDominioBd,
} from '@/components/sitio-web/dominios/estadoDominio';
import { esApex, esHostValido, normalizarHost, SUBDOMINIO_RE, zonaDe } from '@/components/sitio-web/dominios/nombreDns';
import type {
  CodigoErrorDominio,
  DominioSitio,
  PermisosDominios,
  RespuestaConectar,
  RespuestaDetalleDominio,
  RespuestaDominios,
  SedeDominio,
  RespuestaVerificacion,
  TitularDominio,
} from '@/components/sitio-web/dominios/tiposDominios';
import { detectarProveedor, type ResolverNs } from './proveedores';
import { raizYAlias, registrosEsperados, verificarDominioSitio, ErrorVerificacion, type ResolverPublico } from './verificacion';
import {
  configuracionRegistrador,
  configuracionVercel,
  crearClienteRegistrador,
  crearClienteVercel,
  type ClienteRegistrador,
  type ClienteVercel,
} from './vercelDominios';

/** Permiso de gestionar dominios (se siembra con la migración pendiente `sitio_web_dominios`). */
export const PERMISO_DOMINIOS = 'website.domains';
/** Permiso de comprar (genera un cobro). Hoy `/api/domains/purchase` exige administrador; ver nota en `permisosDominios`. */
export const PERMISO_COMPRAR_DOMINIOS = 'website.domains.buy';

export type CtxDominios = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'userEmail' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

export class ErrorDominios extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: CodigoErrorDominio,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDominios';
  }
}

export interface CorreoCodigo {
  para: string;
  host: string;
  codigo: string;
}

export interface DependenciasDominios {
  servicio: SupabaseClient;
  vercel: ClienteVercel | null;
  registrador: ClienteRegistrador | null;
  resolverNs: ResolverNs;
  resolutores?: readonly ResolverPublico[];
  /** Envía el código de transferencia; `false` si el correo no está configurado. */
  enviarCodigo: (c: CorreoCodigo) => Promise<boolean>;
  ahora: () => Date;
}

/** Dependencias reales (entorno, Vercel, DNS de Node y Resend). */
export async function dependenciasDominios(): Promise<DependenciasDominios> {
  const { getServiceClient } = await import('@/lib/supabase/server-service');
  const cfg = configuracionVercel();
  const reg = configuracionRegistrador();
  return {
    servicio: getServiceClient(),
    vercel: cfg ? crearClienteVercel(cfg) : null,
    registrador: reg ? crearClienteRegistrador(reg) : null,
    resolverNs: (zona) => dnsPromises.resolveNs(zona),
    enviarCodigo: enviarCodigoTransferencia,
    ahora: () => new Date(),
  };
}

// ─── Permisos ────────────────────────────────────────────────────────────────

/**
 * `gestionar`: administrador o `website.domains`. `comprar`: además, lo que
 * exige HOY `/api/domains/purchase` (administrador o `admin.full_access`); el
 * día que esa ruta pase a `website.domains.buy`, se cambia aquí y solo aquí.
 */
export async function permisosDominios(ctx: CtxDominios): Promise<PermisosDominios> {
  const gestionar = await hasOrgAdminOrPermission(ctx, PERMISO_DOMINIOS);
  const comprar = gestionar && (await hasOrgAdminOrPermission(ctx));
  return { gestionar, comprar };
}

async function exigirGestionar(ctx: CtxDominios): Promise<PermisosDominios> {
  const p = await permisosDominios(ctx);
  if (!p.gestionar) throw new ErrorDominios(403, 'sin_permiso', 'No tienes permiso para gestionar dominios.');
  return p;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

const COLUMNAS_DOMINIO =
  'id, host, domain_type, status, is_primary, is_active, verified_at, last_verification_at, redirect_to_domain_id, redirect_status_code, vercel_state, metadata, created_at';

interface Organizacion {
  name: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_code: string | null;
  subdomain: string | null;
}

interface Todo {
  org: Organizacion | null;
  filas: FilaDominioBd[];
  compras: Map<string, CompraDominio>;
  primaryDomainId: string | null;
}

async function leerTodo(ctx: CtxDominios): Promise<Todo> {
  const db = ctx.supabase;
  const org = ctx.organizationId;
  const [orgRes, domRes, estRes, compRes] = await Promise.all([
    db.from('organizations').select('name, legal_name, email, phone, address, city, state, postal_code, country_code, subdomain').eq('id', org).maybeSingle(),
    db.from('organization_domains').select(COLUMNAS_DOMINIO).eq('organization_id', org),
    db.from('website_site_states').select('primary_domain_id').eq('organization_id', org).is('branch_id', null).maybeSingle(),
    db.from('domain_purchases').select('domain, created_at, amount, currency').eq('organization_id', org).eq('status', 'completed'),
  ]);
  for (const r of [orgRes, domRes, estRes, compRes]) if (r.error) throw r.error;
  const compras = new Map<string, CompraDominio>();
  for (const c of (compRes.data ?? []) as CompraDominio[]) {
    const previa = compras.get(c.domain);
    if (!previa || previa.created_at > c.created_at) compras.set(c.domain, c);
  }
  return {
    org: (orgRes.data as Organizacion | null) ?? null,
    filas: (domRes.data ?? []) as unknown as FilaDominioBd[],
    compras,
    primaryDomainId: (estRes.data as { primary_domain_id: string | null } | null)?.primary_domain_id ?? null,
  };
}

function aDtos(todo: Todo, ahora: Date): DominioSitio[] {
  const porId = new Map(todo.filas.map((f) => [f.id, f]));
  return ordenarDominios(todo.filas.map((f) => aDominioSitio(f, ahora, porId, todo.compras.get(f.host))));
}

function titularDe(org: Organizacion | null, correoSesion: string | null): TitularDominio {
  return {
    nombre: org?.legal_name || org?.name || '',
    correo: org?.email || correoSesion || '',
    telefono: org?.phone || '',
    direccion: org?.address || '',
    ciudad: org?.city || '',
    departamento: org?.state || '',
    codigoPostal: org?.postal_code || '',
    pais: (org?.country_code || '').toUpperCase().slice(0, 2),
  };
}

function hostDelSubdominio(subdominio: string | null | undefined): string | null {
  return subdominio ? `${subdominio}.${DOMINIO_SITIOS}` : null;
}

/** GET /api/sitio-web/dominios (B/07-01…07-05). */
export async function leerDominios(
  ctx: CtxDominios,
  deps: Pick<DependenciasDominios, 'vercel' | 'ahora'>,
  opciones: { sede?: unknown } = {},
): Promise<RespuestaDominios> {
  const permisos = await exigirGestionar(ctx);
  const [todo, sede] = await Promise.all([leerTodo(ctx), sedeValida(ctx, opciones.sede)]);
  const ahora = deps.ahora();
  const dominios = aDtos(todo, ahora);
  const subdominio = todo.org?.subdomain || null;
  return {
    subdominio,
    hostSubdominio: hostDelSubdominio(subdominio),
    hostPublico: direccionSitio(todo.filas, subdominio, todo.primaryDomainId).host,
    dominios,
    alertas: alertasDominios(dominios),
    permisos,
    conexionAutomatica: !!deps.vercel,
    titular: permisos.comprar ? titularDe(todo.org, ctx.userEmail) : null,
    sede,
  };
}

function buscar(todo: Todo, id: string): FilaDominioBd {
  const fila = todo.filas.find((f) => f.id === id);
  if (!fila) throw new ErrorDominios(404, 'no_existe', 'No encontramos ese dominio.');
  return fila;
}

function dtoDe(todo: Todo, id: string, ahora: Date): DominioSitio {
  const d = aDtos(todo, ahora).find((x) => x.id === id);
  if (!d) throw new ErrorDominios(404, 'no_existe', 'No encontramos ese dominio.');
  return d;
}

/** GET /api/sitio-web/dominios/[id] (B/07-21). Un id de otra organización es 404. */
export async function leerDetalle(ctx: CtxDominios, id: string, deps: DependenciasDominios): Promise<RespuestaDetalleDominio> {
  const permisos = await exigirGestionar(ctx);
  const todo = await leerTodo(ctx);
  buscar(todo, id);
  const ahora = deps.ahora();
  const dominios = aDtos(todo, ahora);
  const dominio = dominios.find((d) => d.id === id)!;
  const hostSubdominio = hostDelSubdominio(todo.org?.subdomain);

  let registros: RespuestaDetalleDominio['registros'] = [];
  if (dominio.tipo !== 'subdominio') {
    const pares = await raizYAlias(ctx.supabase, ctx.organizationId, id);
    if (pares) {
      try {
        registros = await registrosEsperados({ vercel: deps.vercel }, pares.raiz as never, pares.www as never);
      } catch (e) {
        console.warn('[sitio-web/dominios] no se pudieron leer los registros esperados', { organizationId: ctx.organizationId, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  const redirecciones = dominios.filter((d) => d.redirigeA === dominio.host).map((d) => ({ host: d.host, hacia: dominio.host }));
  if (dominio.principal && dominio.tipo !== 'subdominio' && hostSubdominio) redirecciones.push({ host: hostSubdominio, hacia: dominio.host });

  return {
    dominio,
    registros,
    proveedor: dominio.tipo === 'subdominio' ? 'otro' : await detectarProveedor(zonaDe(dominio.host), deps.resolverNs),
    redirecciones,
    transferencia: dominio.tipo === 'comprado' ? transferenciaDisponible(dominio.compradoEn, ahora) : null,
    hostSubdominio,
    permisos,
    conexionAutomatica: !!deps.vercel,
  };
}

// ─── Conectar ────────────────────────────────────────────────────────────────

/**
 * Valida la sede contra la organización de la sesión y devuelve su nombre
 * (para «Conectar para la sede …», B/07-26). Una sede ajena se ignora y se
 * registra: nunca se revela si existe en otra organización.
 */
async function sedeValida(ctx: CtxDominios, sedeId: unknown): Promise<SedeDominio | null> {
  const n = typeof sedeId === 'number' ? sedeId : typeof sedeId === 'string' && /^\d+$/.test(sedeId) ? Number(sedeId) : null;
  if (!n) return null;
  const { data, error } = await ctx.supabase.from('branches').select('id, name').eq('id', n).eq('organization_id', ctx.organizationId).maybeSingle();
  if (error || !data) {
    console.warn('[sitio-web/dominios] sede ajena o inexistente ignorada', { organizationId: ctx.organizationId, sedeId: n });
    return null;
  }
  const fila = data as { id: number; name: string | null };
  return { id: fila.id, nombre: fila.name ?? '' };
}

/**
 * POST /api/sitio-web/dominios (B/07-06): crea la raíz (`custom_domain`) y su
 * www (`www_alias`, 308 a la raíz), los añade al proyecto de sitios y devuelve
 * los registros que hay que crear. Un host de otra organización es 409 sin
 * decir cuál (misma regla que `fn_dominio_en_otra_organizacion`, P0-8).
 */
export async function conectarDominio(ctx: CtxDominios, entrada: { host: unknown; sedeId?: unknown }, deps: DependenciasDominios): Promise<RespuestaConectar> {
  await exigirGestionar(ctx);
  const host = normalizarHost(typeof entrada.host === 'string' ? entrada.host : '');
  if (!esHostValido(host) || host === DOMINIO_SITIOS || host.endsWith(`.${DOMINIO_SITIOS}`)) {
    throw new ErrorDominios(400, 'host_invalido', 'Escribe un dominio válido, por ejemplo tumarca.com.');
  }
  const org = ctx.organizationId;
  const sedeId = (await sedeValida(ctx, entrada.sedeId))?.id ?? null;
  const wwwHost = esApex(host) ? `www.${host}` : null;

  const { data: existentes, error: errEx } = await deps.servicio
    .from('organization_domains')
    .select('id, host, organization_id')
    .in('host', wwwHost ? [host, wwwHost] : [host]);
  if (errEx) throw new Error(`organization_domains: ${errEx.message}`);
  const filasEx = (existentes ?? []) as { id: string; host: string; organization_id: number }[];
  const raizEx = filasEx.find((f) => f.host === host);
  if (raizEx && raizEx.organization_id !== org) {
    throw new ErrorDominios(409, 'en_otra_organizacion', 'Este dominio ya está conectado a otro sitio. Si es tuyo, escríbenos a soporte.');
  }

  let raizId = raizEx?.id ?? null;
  if (!raizId) {
    const { data, error } = await deps.servicio
      .from('organization_domains')
      .insert({
        organization_id: org,
        host,
        domain_type: 'custom_domain',
        is_primary: false,
        is_active: true,
        created_by: ctx.userId,
        metadata: { source: 'sitio_web', ...(sedeId ? { branch_id: sedeId } : {}) },
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') throw new ErrorDominios(409, 'en_otra_organizacion', 'Este dominio ya está conectado a otro sitio. Si es tuyo, escríbenos a soporte.');
      throw new Error(`organization_domains: ${error.message}`);
    }
    raizId = (data as { id: string }).id;
  }

  const wwwEx = wwwHost ? filasEx.find((f) => f.host === wwwHost) : undefined;
  if (wwwHost && !wwwEx) {
    const { error } = await deps.servicio.from('organization_domains').insert({
      organization_id: org,
      host: wwwHost,
      domain_type: 'www_alias',
      is_primary: false,
      is_active: true,
      redirect_to_domain_id: raizId,
      redirect_status_code: 308,
      created_by: ctx.userId,
      metadata: { source: 'sitio_web' },
    });
    // El www de otra organización no impide conectar la raíz: solo se omite.
    if (error && error.code !== '23505') throw new Error(`organization_domains: ${error.message}`);
  }

  if (deps.vercel) {
    try {
      await deps.vercel.agregar(host);
      if (wwwHost) await deps.vercel.agregar(wwwHost, { hacia: host, codigo: 308 });
    } catch (e) {
      console.error('[sitio-web/dominios] Vercel no añadió el dominio', { organizationId: org, message: e instanceof Error ? e.message : String(e) });
    }
  }

  const todo = await leerTodo(ctx);
  const pares = await raizYAlias(deps.servicio, org, raizId);
  let registros: RespuestaConectar['registros'] = [];
  if (pares) {
    try {
      registros = await registrosEsperados({ vercel: deps.vercel }, pares.raiz as never, pares.www as never);
    } catch (e) {
      console.error('[sitio-web/dominios] no se leyeron los registros recomendados', { organizationId: org, message: e instanceof Error ? e.message : String(e) });
      registros = await registrosEsperados({ vercel: null }, pares.raiz as never, null);
    }
  }
  return {
    dominio: dtoDe(todo, raizId, deps.ahora()),
    registros,
    proveedor: await detectarProveedor(zonaDe(host), deps.resolverNs),
    conexionAutomatica: !!deps.vercel,
  };
}

// ─── Verificar ───────────────────────────────────────────────────────────────

/** POST /api/sitio-web/dominios/[id]/verificar (B/07-08…07-12). */
export async function verificar(ctx: CtxDominios, id: string, deps: DependenciasDominios): Promise<RespuestaVerificacion> {
  await exigirGestionar(ctx);
  try {
    const s = await verificarDominioSitio(ctx.organizationId, id, {
      servicio: deps.servicio,
      vercel: deps.vercel,
      resolutores: deps.resolutores,
      ahora: deps.ahora,
    });
    const todo = await leerTodo(ctx);
    return {
      dominio: dtoDe(todo, s.dominioId, deps.ahora()),
      resultado: s.resultado,
      registros: s.registros,
      revisadoEn: s.revisadoEn,
      propagacion: s.propagacion,
      mensaje: s.mensaje,
    };
  } catch (e) {
    if (e instanceof ErrorVerificacion) throw new ErrorDominios(404, 'no_existe', 'No encontramos ese dominio.');
    throw e;
  }
}

// ─── Principal ───────────────────────────────────────────────────────────────

/**
 * PATCH {principal:true} (B/07-09, 07-21): desmarca el principal anterior,
 * marca este y fija `website_site_states.primary_domain_id` del sitio
 * principal. El UNIQUE parcial `idx_organization_domains_primary_active`
 * obliga a desmarcar primero. No es una transacción (la RPC está propuesta en
 * la migración pendiente); si el segundo paso falla, el sitio abre en el
 * subdominio, que es el respaldo seguro.
 */
export async function hacerPrincipal(ctx: CtxDominios, id: string, deps: DependenciasDominios): Promise<DominioSitio> {
  await exigirGestionar(ctx);
  const org = ctx.organizationId;
  const todo = await leerTodo(ctx);
  const fila = buscar(todo, id);
  const dto = dtoDe(todo, id, deps.ahora());
  if (dto.principal) return dto;
  if (!puedeSerPrincipal(dto)) throw new ErrorDominios(422, 'no_verificado', 'Solo un dominio activo y verificado puede ser el principal.');

  const s = deps.servicio;
  const r1 = await s.from('organization_domains').update({ is_primary: false }).eq('organization_id', org).eq('is_primary', true).neq('id', id);
  if (r1.error) throw new Error(`organization_domains: ${r1.error.message}`);
  const r2 = await s.from('organization_domains').update({ is_primary: true }).eq('organization_id', org).eq('id', id);
  if (r2.error) throw new Error(`organization_domains: ${r2.error.message}`);
  const esSub = fila.domain_type === 'system_subdomain';
  const r3 = await s
    .from('website_site_states')
    .update({ primary_domain_id: esSub ? null : id })
    .eq('organization_id', org)
    .is('branch_id', null);
  if (r3.error) throw new Error(`website_site_states: ${r3.error.message}`);

  // Los demás dominios propios redirigen al principal con 308 (nota-ux 2), en Vercel y en la fila.
  if (deps.vercel) {
    const otros = todo.filas.filter((f) => f.id !== id && f.is_active && f.domain_type === 'custom_domain' && f.status === 'verified');
    for (const o of otros) {
      try {
        await deps.vercel.redirigir(o.host, esSub ? null : fila.host, 308);
        await s
          .from('organization_domains')
          .update(esSub ? { redirect_to_domain_id: null, redirect_status_code: null } : { redirect_to_domain_id: id, redirect_status_code: 308 })
          .eq('organization_id', org)
          .eq('id', o.id);
      } catch (e) {
        console.error('[sitio-web/dominios] no se configuró la redirección al principal', { organizationId: org, message: e instanceof Error ? e.message : String(e) });
      }
    }
    if (!esSub && fila.redirect_to_domain_id) {
      try {
        await deps.vercel.redirigir(fila.host, null);
        await s.from('organization_domains').update({ redirect_to_domain_id: null, redirect_status_code: null }).eq('organization_id', org).eq('id', id);
      } catch (e) {
        console.error('[sitio-web/dominios] no se quitó la redirección del nuevo principal', { organizationId: org, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return dtoDe(await leerTodo(ctx), id, deps.ahora());
}

// ─── Quitar ──────────────────────────────────────────────────────────────────

/**
 * DELETE (B/07-22): quita la raíz y su www de Vercel y de la base. Si era el
 * principal, el subdominio pasa a serlo. El subdominio del sistema no se
 * quita nunca (nota-ux 1): 422.
 */
export async function quitarDominio(ctx: CtxDominios, id: string, deps: DependenciasDominios): Promise<void> {
  await exigirGestionar(ctx);
  const org = ctx.organizationId;
  const todo = await leerTodo(ctx);
  const fila = buscar(todo, id);
  if (fila.domain_type === 'system_subdomain') {
    throw new ErrorDominios(422, 'subdominio_sistema', 'El subdominio de GO Admin no se puede quitar: es el respaldo de tu sitio.');
  }
  const aQuitar = [fila, ...todo.filas.filter((f) => f.domain_type === 'www_alias' && f.redirect_to_domain_id === fila.id)];
  const ids = aQuitar.map((f) => f.id);
  const eraPrincipal = aQuitar.some((f) => f.is_primary);
  const s = deps.servicio;

  // Quien redirigía a lo que se quita deja de hacerlo (FK sin ON DELETE).
  const rRed = await s.from('organization_domains').update({ redirect_to_domain_id: null, redirect_status_code: null }).eq('organization_id', org).in('redirect_to_domain_id', ids).not('id', 'in', `(${ids.join(',')})`);
  if (rRed.error) throw new Error(`organization_domains: ${rRed.error.message}`);

  if (deps.vercel) {
    for (const f of aQuitar) {
      try {
        await deps.vercel.quitar(f.host);
      } catch (e) {
        console.error('[sitio-web/dominios] Vercel no quitó el dominio', { organizationId: org, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  const rDel = await s.from('organization_domains').delete().eq('organization_id', org).in('id', ids);
  if (rDel.error) throw new Error(`organization_domains: ${rDel.error.message}`);

  if (eraPrincipal) {
    const sub = todo.filas.find((f) => f.domain_type === 'system_subdomain' && f.is_active);
    if (sub) {
      const r = await s.from('organization_domains').update({ is_primary: true }).eq('organization_id', org).eq('id', sub.id);
      if (r.error) console.error('[sitio-web/dominios] el subdominio no quedó como principal', { organizationId: org, message: r.error.message });
    }
  }
}

// ─── Subdominio ──────────────────────────────────────────────────────────────

/** Nombres que no se entregan como subdominio (rutas de la plataforma). */
const SUBDOMINIOS_RESERVADOS = new Set(['www', 'app', 'admin', 'api', 'mail', 'smtp', 'ftp', 'soporte', 'support', 'status', 'docs', 'blog', 'goadmin', 'dashboard']);

export function validarSubdominio(valor: unknown): string {
  const v = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (v.length < 3 || v.length > 63 || !SUBDOMINIO_RE.test(v) || v.includes('--') || SUBDOMINIOS_RESERVADOS.has(v)) {
    throw new ErrorDominios(400, 'subdominio_invalido', 'Usa de 3 a 63 letras, números o guiones, sin guion al inicio ni al final.');
  }
  return v;
}

/**
 * PUT /api/sitio-web/dominios/subdominio (B/07-03): valida forma y unicidad y
 * actualiza `organizations.subdomain` y la fila `system_subdomain`. La URL
 * vieja deja de abrir (lo avisa el diálogo).
 */
export async function cambiarSubdominio(ctx: CtxDominios, valor: unknown, deps: DependenciasDominios): Promise<{ subdominio: string; host: string }> {
  await exigirGestionar(ctx);
  const nuevo = validarSubdominio(valor);
  const org = ctx.organizationId;
  const host = `${nuevo}.${DOMINIO_SITIOS}`;
  const s = deps.servicio;

  const [orgEnUso, hostEnUso] = await Promise.all([
    s.from('organizations').select('id').eq('subdomain', nuevo).neq('id', org).limit(1),
    s.from('organization_domains').select('id').eq('host', host).neq('organization_id', org).limit(1),
  ]);
  if (orgEnUso.error) throw new Error(`organizations: ${orgEnUso.error.message}`);
  if (hostEnUso.error) throw new Error(`organization_domains: ${hostEnUso.error.message}`);
  if ((orgEnUso.data ?? []).length > 0 || (hostEnUso.data ?? []).length > 0) {
    throw new ErrorDominios(409, 'subdominio_en_uso', 'Ese subdominio ya lo usa otro sitio. Prueba con otro.');
  }

  const rOrg = await s.from('organizations').update({ subdomain: nuevo }).eq('id', org);
  if (rOrg.error) {
    if (rOrg.error.code === '23505') throw new ErrorDominios(409, 'subdominio_en_uso', 'Ese subdominio ya lo usa otro sitio. Prueba con otro.');
    throw new Error(`organizations: ${rOrg.error.message}`);
  }
  const { data: sistema, error: errSis } = await s.from('organization_domains').select('id').eq('organization_id', org).eq('domain_type', 'system_subdomain').limit(1).maybeSingle();
  if (errSis) throw new Error(`organization_domains: ${errSis.message}`);
  const r = sistema
    ? await s.from('organization_domains').update({ host }).eq('organization_id', org).eq('id', (sistema as { id: string }).id)
    : await s.from('organization_domains').insert({ organization_id: org, host, domain_type: 'system_subdomain', is_active: true, is_primary: false, created_by: ctx.userId });
  if (r.error) throw new Error(`organization_domains: ${r.error.message}`);
  return { subdominio: nuevo, host };
}

// ─── Renovación y transferencia (solo comprados aquí) ───────────────────────

function exigirComprado(dto: DominioSitio): void {
  if (dto.tipo !== 'comprado') throw new ErrorDominios(422, 'no_comprado', 'Esta acción es solo para dominios comprados con GO Admin.');
}

/** PATCH {autoRenovar} (B/07-21, alerta B/07-24): registrador de Vercel + dato local. */
export async function cambiarAutoRenovar(ctx: CtxDominios, id: string, encender: boolean, deps: DependenciasDominios): Promise<DominioSitio> {
  await exigirGestionar(ctx);
  const org = ctx.organizationId;
  const todo = await leerTodo(ctx);
  const fila = buscar(todo, id);
  exigirComprado(dtoDe(todo, id, deps.ahora()));
  if (!deps.registrador) throw new ErrorDominios(503, 'no_disponible', 'La renovación no está disponible por ahora.');
  await deps.registrador.autoRenovar(fila.host, encender);
  const metadata = { ...((fila.metadata as Record<string, unknown> | null) ?? {}), auto_renew: encender };
  const r = await deps.servicio.from('organization_domains').update({ metadata }).eq('organization_id', org).eq('id', id);
  if (r.error) throw new Error(`organization_domains: ${r.error.message}`);
  return dtoDe(await leerTodo(ctx), id, deps.ahora());
}

/**
 * POST /[id]/codigo-transferencia (B/07-23): pide el código al registrador y
 * lo ENVÍA al correo de quien lo pidió; nunca viaja al navegador.
 */
export async function solicitarCodigoTransferencia(ctx: CtxDominios, id: string, deps: DependenciasDominios): Promise<{ correo: string }> {
  await exigirGestionar(ctx);
  const todo = await leerTodo(ctx);
  const fila = buscar(todo, id);
  const dto = dtoDe(todo, id, deps.ahora());
  exigirComprado(dto);
  if (!transferenciaDisponible(dto.compradoEn, deps.ahora()).puede) {
    throw new ErrorDominios(422, 'muy_reciente', 'Un dominio recién comprado no se puede transferir en sus primeros 60 días.');
  }
  if (!deps.registrador || !ctx.userEmail) throw new ErrorDominios(503, 'no_disponible', 'El código de transferencia no está disponible por ahora.');
  const codigo = await deps.registrador.codigoAutorizacion(fila.host);
  const enviado = await deps.enviarCodigo({ para: ctx.userEmail, host: fila.host, codigo });
  if (!enviado) throw new ErrorDominios(503, 'no_disponible', 'No pudimos enviar el correo. Inténtalo más tarde.');
  return { correo: ctx.userEmail };
}

/** Correo con el código de autorización (Resend, remitente de la plataforma). */
export async function enviarCodigoTransferencia(c: CorreoCodigo): Promise<boolean> {
  const { getMasterResend, getMasterResendKey } = await import('@/lib/services/crm/email/resendClient');
  if (!getMasterResendKey()) return false;
  const remitente = `${process.env.EMAIL_FROM_NAME || 'GO Admin'} <${process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}>`;
  const escapar = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const asunto = `Código para transferir ${c.host}`;
  const texto = `Este es el código de autorización para llevar ${c.host} a otro proveedor:\n\n${c.codigo}\n\nPégalo en tu nuevo proveedor y acepta la transferencia. Tu sitio sigue funcionando hasta que termine.\nSi no lo pediste tú, ignora este correo.`;
  const html = `<p>Este es el código de autorización para llevar <strong>${escapar(c.host)}</strong> a otro proveedor:</p><p style="font-family:monospace;font-size:18px">${escapar(c.codigo)}</p><p>Pégalo en tu nuevo proveedor y acepta la transferencia. Tu sitio sigue funcionando hasta que termine.</p><p style="color:#475569">Si no lo pediste tú, ignora este correo.</p>`;
  try {
    const { error } = await getMasterResend().emails.send({ from: remitente, to: c.para, subject: asunto, html, text: texto });
    return !error;
  } catch (e) {
    console.warn('[sitio-web/dominios] no se envió el código de transferencia', e instanceof Error ? e.message : e);
    return false;
  }
}
