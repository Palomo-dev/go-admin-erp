/**
 * Punto ÚNICO de verificación de un dominio del sitio (SOLO servidor; Figma
 * B/07-08…07-12). Lo llaman `POST /api/sitio-web/dominios/[id]/verificar` y
 * el detalle del dominio; si mañana hay un cron, llama a esta misma función.
 *
 * Dos modos, según haya conexión con el proyecto de sitios en Vercel:
 *
 * 1. Con Vercel (`VERCEL_SITIOS_PROJECT_ID`): el dominio (y su www) se añade
 *    al proyecto si no estaba, se pide a Vercel que lo verifique, se leen los
 *    registros recomendados (A de la raíz, CNAME de www) y se consulta el DNS
 *    público en varios resolutores para distinguir «mal configurado» (apunta a
 *    otro servidor) de «propagando» (unos ya lo ven y otros no).
 * 2. Sin Vercel: se DELEGA en la verificación de propiedad de la auditoría
 *    P0-8 (`dominioVerificacionService.verificarDominio`, TXT en el DNS). No
 *    hay una segunda implementación.
 *
 * Escribe SOLO con service role y SIEMPRE filtrando por la organización de la
 * sesión (la migración P0-8 impide a `authenticated` escribir el estado).
 */
import { Resolver } from 'node:dns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarDominio as verificarPropiedad } from '@/lib/services/dominioVerificacionService';
import { nombreRelativo, zonaDe } from '@/components/sitio-web/dominios/nombreDns';
import type { RegistroDns, ResultadoVerificacion } from '@/components/sitio-web/dominios/tiposDominios';
import type { ClienteVercel, ConfigDns, DominioProyecto } from './vercelDominios';

/** Resolutores públicos para medir la propagación (B/07-12: «Visto correcto en 6 de 10 servidores»). */
export const RESOLUTORES_PUBLICOS: readonly string[] = [
  '1.1.1.1',
  '1.0.0.1',
  '8.8.8.8',
  '8.8.4.4',
  '9.9.9.9',
  '149.112.112.112',
  '208.67.222.222',
  '208.67.220.220',
];

export interface ResolverPublico {
  resolve4(host: string): Promise<string[]>;
  resolveCname(host: string): Promise<string[]>;
}

/** Resolver de Node apuntado a un servidor concreto, con tiempo de espera corto. */
export function resolverEn(servidor: string): ResolverPublico {
  const r = new Resolver({ timeout: 2500, tries: 1 });
  r.setServers([servidor]);
  const promesa =
    <T>(fn: (h: string, cb: (e: NodeJS.ErrnoException | null, v: T) => void) => void) =>
    (h: string) =>
      new Promise<T>((ok, mal) => fn.call(r, h, (e, v) => (e ? mal(e) : ok(v))));
  return {
    resolve4: promesa<string[]>((h, cb) => r.resolve4(h, cb)),
    resolveCname: promesa<string[]>((h, cb) => r.resolveCname(h, cb)),
  };
}

async function sinError<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

const normalizar = (v: string) => v.trim().toLowerCase().replace(/\.+$/, '');

/** Lo que cada resolutor respondió para la raíz (A) y para www (CNAME). */
export interface LecturaDns {
  a: string[] | null;
  cname: string[] | null;
}

/**
 * Decide el resultado a partir de lo que dijeron Vercel y los resolutores.
 * Puro: es el corazón de B/07-08…07-12 y se prueba sin red.
 */
export function decidirResultado(entrada: {
  proyecto: DominioProyecto;
  config: ConfigDns;
  configWww: ConfigDns | null;
  lecturas: readonly LecturaDns[];
  conWww: boolean;
}): { resultado: ResultadoVerificacion; registros: Omit<RegistroDns, 'nombre'>[]; propagacion: { vistos: number; total: number } } {
  const { proyecto, config, configWww, lecturas, conWww } = entrada;
  const ip = config.ipv4 ? normalizar(config.ipv4) : null;
  const cname = configWww?.cname ? normalizar(configWww.cname) : null;

  const aOk = (l: LecturaDns) => !!ip && !!l.a?.some((v) => normalizar(v) === ip);
  const cnameOk = (l: LecturaDns) => !conWww || !cname || !!l.cname?.some((v) => normalizar(v) === cname);
  const vistos = lecturas.filter((l) => aOk(l) && cnameOk(l)).length;
  const total = lecturas.length;

  const otrosA = [...new Set(lecturas.flatMap((l) => l.a ?? []).map(normalizar).filter((v) => v !== ip))];
  const algunA = lecturas.some(aOk);
  const otrosCname = [...new Set(lecturas.flatMap((l) => l.cname ?? []).map(normalizar).filter((v) => v !== cname))];
  const algunCname = lecturas.some((l) => !!cname && !!l.cname?.some((v) => normalizar(v) === cname));

  const estadoDe = (correcto: boolean, otros: string[], bien: boolean): Pick<RegistroDns, 'estado' | 'encontrado'> => {
    if (bien || correcto) return { estado: 'correcto', encontrado: null };
    if (otros.length > 0) return { estado: 'otro_valor', encontrado: otros[0] };
    return { estado: 'no_aparece', encontrado: null };
  };

  const registros: Omit<RegistroDns, 'nombre'>[] = [];
  if (config.ipv4) {
    registros.push({ tipo: 'A', valor: config.ipv4, ...estadoDe(algunA, otrosA, !config.misconfigured) });
  }
  if (conWww && configWww?.cname) {
    registros.push({ tipo: 'CNAME', valor: configWww.cname, ...estadoDe(algunCname, otrosCname, !configWww.misconfigured) });
  }
  const desafios = (proyecto.verification ?? []).filter((d) => d.type?.toUpperCase() === 'TXT');
  const enUso = !proyecto.verified && desafios.length > 0;
  for (const d of desafios) registros.push({ tipo: 'TXT', valor: d.value, estado: enUso ? 'pendiente' : 'opcional', encontrado: null });

  let resultado: ResultadoVerificacion;
  if (enUso) resultado = 'en_uso';
  else if (proyecto.verified && !config.misconfigured && (!conWww || !configWww?.misconfigured)) resultado = 'activo';
  else if (vistos > 0 && vistos < total) resultado = 'propagando';
  else if (registros.some((r) => r.estado === 'otro_valor')) resultado = 'mal_configurado';
  else resultado = 'verificando';

  return { resultado, registros, propagacion: { vistos, total } };
}

/** Fila mínima que necesita la verificación (columnas verificadas por MCP). */
interface FilaVerificacion {
  id: string;
  host: string;
  domain_type: string;
  status: string;
  verified_at: string | null;
  verification_attempts: number | null;
  verification_record: string | null;
  verification_value: string | null;
  verification_token: string | null;
  redirect_to_domain_id: string | null;
  vercel_state: unknown;
}

const COLUMNAS =
  'id, host, domain_type, status, verified_at, verification_attempts, verification_record, verification_value, verification_token, redirect_to_domain_id, vercel_state';

export interface DependenciasVerificacion {
  servicio: SupabaseClient;
  vercel: ClienteVercel | null;
  resolutores?: readonly ResolverPublico[];
  ahora?: () => Date;
  /** Verificación de propiedad P0-8 (inyectable en tests). */
  propiedad?: typeof verificarPropiedad;
}

export interface SalidaVerificacion {
  /** Id del dominio raíz verificado (si se pidió el alias www, el de su raíz). */
  dominioId: string;
  resultado: ResultadoVerificacion;
  registros: RegistroDns[];
  propagacion: { vistos: number; total: number } | null;
  revisadoEn: string;
  mensaje: string | null;
}

export class ErrorVerificacion extends Error {
  constructor(public readonly codigo: 'no_existe') {
    super(codigo);
    this.name = 'ErrorVerificacion';
  }
}

async function leerFila(servicio: SupabaseClient, org: number, filtro: { id?: string; redireccionA?: string }): Promise<FilaVerificacion | null> {
  let q = servicio.from('organization_domains').select(COLUMNAS).eq('organization_id', org);
  if (filtro.id) q = q.eq('id', filtro.id);
  if (filtro.redireccionA) q = q.eq('redirect_to_domain_id', filtro.redireccionA).eq('domain_type', 'www_alias');
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(`organization_domains: ${error.message}`);
  return (data as FilaVerificacion | null) ?? null;
}

/** Raíz y alias www de un dominio de la organización (pedir el www verifica su raíz). */
export async function raizYAlias(servicio: SupabaseClient, org: number, id: string): Promise<{ raiz: FilaVerificacion; www: FilaVerificacion | null } | null> {
  const fila = await leerFila(servicio, org, { id });
  if (!fila) return null;
  const raiz = fila.domain_type === 'www_alias' && fila.redirect_to_domain_id ? (await leerFila(servicio, org, { id: fila.redirect_to_domain_id })) ?? fila : fila;
  const www = raiz.id === fila.id ? await leerFila(servicio, org, { redireccionA: raiz.id }) : fila;
  return { raiz, www: www && www.id !== raiz.id ? www : null };
}

/** Registro de propiedad (P0-8) tal como se escribe en el proveedor: TXT `_go-admin-verify` en la raíz. */
export function registroPropiedad(fila: Pick<FilaVerificacion, 'host' | 'verification_value' | 'verification_token'>): RegistroDns | null {
  const valor = (fila.verification_value ?? fila.verification_token ?? '').trim();
  if (!valor) return null;
  return { tipo: 'TXT', nombre: nombreRelativo(`_go-admin-verify.${fila.host}`, zonaDe(fila.host)), valor, estado: 'pendiente', encontrado: null };
}

/** Pone el nombre relativo a la zona a cada registro («@», «www», «_vercel»). */
function conNombres(registros: Omit<RegistroDns, 'nombre'>[], host: string, wwwHost: string | null, desafios: readonly { domain: string }[]): RegistroDns[] {
  const zona = zonaDe(host);
  let iTxt = 0;
  return registros.map((r) => {
    if (r.tipo === 'A') return { ...r, nombre: nombreRelativo(host, zona) };
    if (r.tipo === 'CNAME') return { ...r, nombre: nombreRelativo(wwwHost ?? `www.${host}`, zona) };
    const d = desafios[iTxt++];
    return { ...r, nombre: nombreRelativo(d?.domain ?? `_vercel.${zona}`, zona) };
  });
}

/** Estado guardado de la última verificación (para pintar el detalle sin volver a consultar el DNS). */
export function registrosGuardados(vercelState: unknown): RegistroDns[] | null {
  const s = vercelState && typeof vercelState === 'object' ? (vercelState as Record<string, unknown>) : {};
  if (!Array.isArray(s.registros)) return null;
  const out: RegistroDns[] = [];
  for (const r of s.registros) {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
    if ((o.tipo === 'A' || o.tipo === 'CNAME' || o.tipo === 'TXT') && typeof o.valor === 'string' && typeof o.nombre === 'string') {
      out.push({
        tipo: o.tipo,
        nombre: o.nombre,
        valor: o.valor,
        estado: typeof o.estado === 'string' ? (o.estado as RegistroDns['estado']) : 'pendiente',
        encontrado: typeof o.encontrado === 'string' ? o.encontrado : null,
      });
    }
  }
  return out;
}

/**
 * Registros que el dominio necesita, SIN consultar el DNS ni escribir: los de
 * la última verificación si los hay; si no, los que recomienda Vercel (o el
 * TXT de propiedad sin Vercel). Lo usan «Conectar» (paso 2) y el detalle.
 */
export async function registrosEsperados(deps: Pick<DependenciasVerificacion, 'vercel'>, raiz: FilaVerificacion, www: FilaVerificacion | null): Promise<RegistroDns[]> {
  const guardados = registrosGuardados(raiz.vercel_state);
  if (guardados && guardados.length > 0) return guardados;
  if (!deps.vercel) {
    const r = registroPropiedad(raiz);
    return r ? [{ ...r, estado: raiz.status === 'verified' ? 'correcto' : 'pendiente' }] : [];
  }
  const [proyecto, config, configWww] = await Promise.all([
    deps.vercel.leer(raiz.host),
    deps.vercel.configuracion(raiz.host),
    www ? deps.vercel.configuracion(www.host) : Promise.resolve(null),
  ]);
  const base: Omit<RegistroDns, 'nombre'>[] = [];
  const verificado = raiz.status === 'verified';
  if (config.ipv4) base.push({ tipo: 'A', valor: config.ipv4, estado: verificado && !config.misconfigured ? 'correcto' : 'pendiente', encontrado: null });
  if (www && configWww?.cname) base.push({ tipo: 'CNAME', valor: configWww.cname, estado: verificado && !configWww.misconfigured ? 'correcto' : 'pendiente', encontrado: null });
  const desafios = (proyecto?.verification ?? []).filter((d) => d.type?.toUpperCase() === 'TXT');
  for (const d of desafios) base.push({ tipo: 'TXT', valor: d.value, estado: 'opcional', encontrado: null });
  return conNombres(base, raiz.host, www?.host ?? null, desafios);
}

/** Verifica el dominio `id` de la organización `org` (ya validada en la sesión) y guarda el resultado. */
export async function verificarDominioSitio(org: number, id: string, deps: DependenciasVerificacion): Promise<SalidaVerificacion> {
  const ahora = (deps.ahora ?? (() => new Date()))();
  const revisadoEn = ahora.toISOString();
  const pares = await raizYAlias(deps.servicio, org, id);
  if (!pares) throw new ErrorVerificacion('no_existe');
  const { raiz, www } = pares;

  if (raiz.domain_type === 'system_subdomain') {
    return { dominioId: raiz.id, resultado: 'activo', registros: [], propagacion: null, revisadoEn, mensaje: null };
  }

  // Sin Vercel: verificación de propiedad P0-8 (una sola implementación).
  if (!deps.vercel) {
    const r = await (deps.propiedad ?? verificarPropiedad)(deps.servicio, org, raiz.id);
    const base = registroPropiedad(raiz);
    const estado: RegistroDns['estado'] = r.ok ? 'correcto' : r.codigo === 'NO_COINCIDE' ? 'otro_valor' : 'no_aparece';
    const registros = base ? [{ ...base, estado }] : [];
    if (r.ok && www && www.status !== 'verified') {
      await escribir(deps.servicio, org, www, { status: 'verified', verified_at: revisadoEn, last_verification_at: revisadoEn });
    }
    const resultado: ResultadoVerificacion = r.ok ? 'activo' : r.codigo === 'DOMINIO_DE_OTRA' ? 'en_uso' : r.codigo === 'NO_COINCIDE' ? 'mal_configurado' : 'verificando';
    return { dominioId: raiz.id, resultado, registros, propagacion: null, revisadoEn, mensaje: r.ok ? null : r.mensaje };
  }

  const vercel = deps.vercel;
  let proyecto = (await vercel.leer(raiz.host)) ?? (await vercel.agregar(raiz.host));
  if (www && !(await vercel.leer(www.host))) await vercel.agregar(www.host, { hacia: raiz.host, codigo: 308 });
  if (!proyecto.verified) proyecto = (await vercel.verificar(raiz.host)) ?? proyecto;

  const [config, configWww] = await Promise.all([vercel.configuracion(raiz.host), www ? vercel.configuracion(www.host) : Promise.resolve(null)]);
  const resolutores = deps.resolutores ?? RESOLUTORES_PUBLICOS.map(resolverEn);
  const lecturas: LecturaDns[] = await Promise.all(
    resolutores.map(async (r) => ({
      a: await sinError(r.resolve4(raiz.host)),
      cname: www ? await sinError(r.resolveCname(www.host)) : null,
    })),
  );

  const d = decidirResultado({ proyecto, config, configWww, lecturas, conWww: !!www });
  const desafios = (proyecto.verification ?? []).filter((x) => x.type?.toUpperCase() === 'TXT');
  const registros = conNombres(d.registros, raiz.host, www?.host ?? null, desafios);

  const status = d.resultado === 'activo' ? 'verified' : d.resultado === 'mal_configurado' ? 'failed' : 'verifying';
  const estadoGuardado = {
    verified: proyecto.verified,
    misconfigured: d.resultado !== 'activo' && config.misconfigured,
    registros,
    propagacion: d.propagacion,
    revisadoEn,
  };
  const cambios = {
    status,
    verified_at: status === 'verified' ? raiz.verified_at ?? revisadoEn : null,
    last_verification_at: revisadoEn,
    verification_attempts: (Number(raiz.verification_attempts) || 0) + 1,
    vercel_state: estadoGuardado,
    last_vercel_sync_at: revisadoEn,
  };
  await escribir(deps.servicio, org, raiz, cambios);
  if (www) await escribir(deps.servicio, org, www, { ...cambios, verified_at: status === 'verified' ? www.verified_at ?? revisadoEn : null });

  return { dominioId: raiz.id, resultado: d.resultado, registros, propagacion: d.propagacion, revisadoEn, mensaje: null };
}

async function escribir(servicio: SupabaseClient, org: number, fila: Pick<FilaVerificacion, 'id'>, cambios: Record<string, unknown>): Promise<void> {
  const { error } = await servicio.from('organization_domains').update(cambios).eq('id', fila.id).eq('organization_id', org);
  if (error) throw new Error(`organization_domains: ${error.message}`);
}
