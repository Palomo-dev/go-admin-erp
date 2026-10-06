/**
 * Verificación REAL de un dominio propio, en el servidor (auditoría de
 * Organización 2026-10, P0-8).
 *
 * Antes `domainService.verifyDomain` lo simulaba en el navegador: al tercer
 * clic escribía `status = 'verified'` con la clave anónima, así que cualquier
 * organización podía «verificar» el dominio de otra. Ahora:
 *
 * - Se consulta el DNS público desde el servidor (resolver de Node): el
 *   registro TXT (o CNAME) que la fila pide en `verification_record` /
 *   `verification_value`. Solo si existe y coincide queda `verified`.
 * - Se escribe con service role, filtrando SIEMPRE por la organización de la
 *   sesión. La migración 20261006150200 impide además que `authenticated`
 *   toque `status`/`verified_at` y que reclame un host de otra organización.
 * - Un host que otra organización ya tiene verificado no se verifica aquí.
 */
import { promises as dnsPromises } from 'node:dns';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Resolver inyectable (en tests se sustituye; en producción, `node:dns`). */
export interface ResolverDns {
  resolveTxt(nombre: string): Promise<string[][]>;
  resolveCname(nombre: string): Promise<string[]>;
}

export const resolverNode: ResolverDns = {
  resolveTxt: (n) => dnsPromises.resolveTxt(n),
  resolveCname: (n) => dnsPromises.resolveCname(n),
};

export interface DominioAVerificar {
  host: string;
  domain_type: string;
  verification_type: string | null;
  verification_record: string | null;
  verification_value: string | null;
  verification_token: string | null;
}

/** Quita espacios, punto final y mayúsculas: así se comparan nombres DNS. */
export function normalizarNombreDns(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\.+$/, '');
}

/**
 * Nombres donde puede estar el registro. `verification_record` se guardó de
 * dos formas: completo (`_go-admin-challenge.tienda.com`, lo crea la app) o
 * relativo a la zona (`_go-admin-verify.tienda`, lo genera la base). En un
 * proveedor DNS el nombre relativo se escribe dentro de la zona del dominio,
 * así que se prueba también colgado del host y de su zona.
 */
export function nombresCandidatos(dominio: Pick<DominioAVerificar, 'host' | 'verification_record'>): string[] {
  const host = normalizarNombreDns(dominio.host);
  const registro = dominio.verification_record ? normalizarNombreDns(dominio.verification_record) : '';
  const etiquetas = host.split('.');
  const zona = etiquetas.length > 2 ? etiquetas.slice(-2).join('.') : host;
  const nombres: string[] = [];
  const agregar = (n: string) => {
    if (n && !nombres.includes(n)) nombres.push(n);
  };
  if (registro) {
    if (registro === host || registro.endsWith(`.${host}`) || registro.endsWith(`.${zona}`)) agregar(registro);
    else {
      agregar(`${registro}.${host}`);
      agregar(`${registro}.${zona}`);
    }
  }
  agregar(`_go-admin-challenge.${host}`);
  agregar(`_go-admin-verify.${host}`);
  return nombres;
}

/** Valor esperado: `verification_value` o, si falta, el token. */
export function valorEsperado(dominio: Pick<DominioAVerificar, 'verification_value' | 'verification_token'>): string | null {
  const v = (dominio.verification_value ?? dominio.verification_token ?? '').trim();
  return v ? v : null;
}

export type ResultadoDns =
  | { encontrado: true; nombre: string }
  | { encontrado: false; motivo: 'sin_valor' | 'no_encontrado' | 'no_coincide' };

const ERRORES_DNS_AUSENCIA = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME', 'NXDOMAIN', 'ESERVFAIL', 'EREFUSED', 'ETIMEOUT', 'ECONNREFUSED']);

async function consultar<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code && ERRORES_DNS_AUSENCIA.has(code)) return null;
    throw err;
  }
}

/** ¿Existe el registro que pide la fila? Solo lectura del DNS; no escribe nada. */
export async function comprobarRegistroDns(dominio: DominioAVerificar, resolver: ResolverDns = resolverNode): Promise<ResultadoDns> {
  const esperado = valorEsperado(dominio);
  if (!esperado) return { encontrado: false, motivo: 'sin_valor' };
  const tipo = (dominio.verification_type ?? 'TXT').toUpperCase();
  let vioAlgo = false;

  for (const nombre of nombresCandidatos(dominio)) {
    if (tipo === 'CNAME') {
      const destinos = await consultar(() => resolver.resolveCname(nombre));
      if (!destinos || destinos.length === 0) continue;
      vioAlgo = true;
      if (destinos.some((d) => normalizarNombreDns(d) === normalizarNombreDns(esperado))) return { encontrado: true, nombre };
    } else {
      const registros = await consultar(() => resolver.resolveTxt(nombre));
      if (!registros || registros.length === 0) continue;
      vioAlgo = true;
      // Un TXT largo llega partido en trozos de 255: se unen.
      if (registros.some((partes) => partes.join('').trim() === esperado)) return { encontrado: true, nombre };
    }
  }
  return { encontrado: false, motivo: vioAlgo ? 'no_coincide' : 'no_encontrado' };
}

export type ResultadoVerificacion =
  | { ok: true; estado: 'verified'; mensaje: string }
  | {
      ok: false;
      estado: 'pending';
      codigo: 'NO_ENCONTRADO' | 'NO_COINCIDE' | 'SIN_VALOR' | 'DOMINIO_DE_OTRA' | 'NO_EXISTE';
      mensaje: string;
    };

const MENSAJES: Record<'no_encontrado' | 'no_coincide' | 'sin_valor', string> = {
  no_encontrado: 'Todavía no encontramos el registro DNS. Revisa que lo hayas creado; los cambios pueden tardar hasta 48 horas en propagarse.',
  no_coincide: 'Encontramos el registro DNS, pero su valor no coincide con el de la verificación. Cópialo de nuevo tal cual.',
  sin_valor: 'Este dominio no tiene valor de verificación. Elimínalo y vuelve a agregarlo.',
};

/**
 * Verifica el dominio `domainId` de la organización `organizationId` (ya
 * validada en la sesión). Escribe con `servicio` (service role) y siempre
 * filtra por la organización: un id de otra organización responde NO_EXISTE.
 */
export async function verificarDominio(
  servicio: SupabaseClient,
  organizationId: number,
  domainId: string,
  resolver: ResolverDns = resolverNode
): Promise<ResultadoVerificacion> {
  const { data: dominio, error } = await servicio
    .from('organization_domains')
    .select('id, host, domain_type, status, verification_type, verification_record, verification_value, verification_token, verification_attempts')
    .eq('id', domainId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`organization_domains: ${error.message}`);
  if (!dominio) return { ok: false, estado: 'pending', codigo: 'NO_EXISTE', mensaje: 'Dominio no encontrado' };

  // Los subdominios del sistema (*.goadmin.io) los crea la plataforma ya verificados.
  if (dominio.domain_type === 'system_subdomain' || dominio.status === 'verified') {
    return { ok: true, estado: 'verified', mensaje: 'El dominio ya está verificado' };
  }

  const { data: otra, error: errOtra } = await servicio
    .from('organization_domains')
    .select('id')
    .eq('host', dominio.host)
    .eq('status', 'verified')
    .neq('organization_id', organizationId)
    .limit(1);
  if (errOtra) throw new Error(`organization_domains: ${errOtra.message}`);
  if (otra && otra.length > 0) {
    return { ok: false, estado: 'pending', codigo: 'DOMINIO_DE_OTRA', mensaje: 'Este dominio ya está verificado por otra organización.' };
  }

  const dns = await comprobarRegistroDns(dominio as DominioAVerificar, resolver);
  const ahora = new Date().toISOString();
  const intentos = (Number(dominio.verification_attempts) || 0) + 1;
  const cambios = dns.encontrado
    ? { status: 'verified', verified_at: ahora, verification_attempts: intentos, last_verification_at: ahora }
    : { verification_attempts: intentos, last_verification_at: ahora };

  const { error: errUpd } = await servicio
    .from('organization_domains')
    .update(cambios)
    .eq('id', domainId)
    .eq('organization_id', organizationId);
  if (errUpd) throw new Error(`organization_domains: ${errUpd.message}`);

  if (dns.encontrado) return { ok: true, estado: 'verified', mensaje: 'Dominio verificado' };
  const codigo = dns.motivo === 'no_coincide' ? 'NO_COINCIDE' : dns.motivo === 'sin_valor' ? 'SIN_VALOR' : 'NO_ENCONTRADO';
  return { ok: false, estado: 'pending', codigo, mensaje: MENSAJES[dns.motivo] };
}
