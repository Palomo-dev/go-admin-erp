/**
 * Reglas puras de la lista de dominios (Figma B/07-01, 07-24, 07-25): de una
 * fila de `organization_domains` a lo que se pinta (insignia, tipo, SSL,
 * renovación, línea secundaria) y a los avisos en pantalla.
 *
 * Sin React ni Supabase: lo usa el servidor (`dominiosSitioService`) para
 * armar la respuesta y lo prueban los tests con `TZ=UTC` y `TZ=America/Bogota`.
 * La insignia reutiliza `resolverEstadoDominio` (ui/estadoDominio.ts) y los
 * días para vencer, `diasParaVencer` del Resumen: un solo umbral y una sola
 * lectura del vencimiento en todo el módulo.
 */
import { DIAS_AVISO_VENCIMIENTO, resolverEstadoDominio, type EstadoDominio } from '../ui/estadoDominio';
import { diasParaVencer } from '@/lib/website/resumenSitio';
import type { AlertaDominio, DominioSitio, EstadoSsl, MotivoError, Renovacion, TipoDominio } from './tiposDominios';

/** Fila de `organization_domains` tal como la lee el servidor (columnas verificadas por MCP 2026-10-06). */
export interface FilaDominioBd {
  id: string;
  host: string;
  domain_type: string;
  status: string;
  is_primary: boolean;
  is_active: boolean;
  verified_at: string | null;
  last_verification_at: string | null;
  redirect_to_domain_id: string | null;
  redirect_status_code: number | null;
  vercel_state: unknown;
  metadata: unknown;
  created_at?: string | null;
  /** Columnas de la migración pendiente `sitio_web_dominios`; hoy llegan `undefined`. */
  expires_at?: string | null;
  auto_renew?: boolean | null;
  renewal_price?: number | string | null;
  renewal_currency?: string | null;
  ssl_status?: string | null;
  misconfigured?: boolean | null;
  registrar?: string | null;
}

/** Compra registrada en `domain_purchases` (por host). */
export interface CompraDominio {
  domain: string;
  created_at: string;
  amount: number | string;
  currency: string;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function numero(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** ¿Se compró con GO Admin? Columna `registrar` (pendiente), una fila de `domain_purchases` o la marca de la compra en `metadata`. */
export function esComprado(fila: FilaDominioBd, compra: CompraDominio | null | undefined): boolean {
  if (fila.registrar) return true;
  if (compra) return true;
  const m = objeto(fila.metadata);
  const via = String(m.purchased_via ?? m.source ?? '');
  return /vercel/.test(via) && /purchase|registrar|vercel$/.test(via);
}

export function tipoDominio(fila: FilaDominioBd, compra?: CompraDominio | null): TipoDominio {
  if (fila.domain_type === 'system_subdomain') return 'subdominio';
  if (fila.domain_type === 'www_alias') return 'alias_www';
  return esComprado(fila, compra) ? 'comprado' : 'propio';
}

/** ¿La configuración DNS está mal? Columna `misconfigured` (pendiente) o lo que guardó la verificación en `vercel_state`. */
export function estaMalConfigurado(fila: FilaDominioBd): boolean {
  if (fila.misconfigured === true) return true;
  return objeto(fila.vercel_state).misconfigured === true && fila.status !== 'verified';
}

/** Insignia de la fila (B/02). */
export function estadoInsignia(fila: FilaDominioBd, ahora: Date): { estado: EstadoDominio; dias: number | null } {
  if (!fila.is_active) return { estado: 'pendiente', dias: null };
  if (fila.domain_type === 'system_subdomain') return { estado: 'activo', dias: null };
  const dias = diasParaVencer(fila as never, ahora);
  if (estaMalConfigurado(fila)) return { estado: 'mal_configurado', dias };
  const status = fila.status === 'pending' && fila.last_verification_at ? 'verifying' : fila.status;
  return { estado: resolverEstadoDominio(status, dias), dias };
}

/** Columna «SSL»: Vercel emite el certificado solo cuando el dominio está verificado y bien apuntado. */
export function estadoSsl(fila: FilaDominioBd): EstadoSsl {
  if (fila.ssl_status === 'issued') return 'emitido';
  if (fila.ssl_status === 'pending') return 'pendiente';
  if (fila.ssl_status === 'failed') return 'no_aplica';
  if (!fila.is_active) return 'no_aplica';
  if (fila.domain_type === 'system_subdomain') return 'emitido';
  if (estaMalConfigurado(fila) || fila.status === 'failed' || fila.status === 'expired' || fila.status === 'disabled') return 'no_aplica';
  return fila.status === 'verified' ? 'emitido' : 'pendiente';
}

/** Columna «Renovación». Sin fecha o sin precio, `null` (no se inventan). */
export function renovacionDe(fila: FilaDominioBd, tipo: TipoDominio, hostRedireccion: string | null): Renovacion {
  if (tipo === 'subdominio') return { tipo: 'no_vence' };
  if (tipo === 'alias_www') return { tipo: 'incluida', con: hostRedireccion ?? fila.host.replace(/^www\./, '') };
  if (tipo === 'propio') return { tipo: 'proveedor' };
  const m = objeto(fila.metadata);
  const auto = typeof fila.auto_renew === 'boolean' ? fila.auto_renew : m.auto_renew === true;
  const crudo = fila.expires_at ?? m.expires_at;
  const venceEn = typeof crudo === 'string' && Number.isFinite(Date.parse(crudo)) ? crudo : null;
  const precio = numero(fila.renewal_price);
  const moneda = precio !== null ? (fila.renewal_currency ?? null) : null;
  return { tipo: auto ? 'automatica' : 'apagada', venceEn, precio, moneda };
}

/** Motivo para la línea «El registro A apunta a otro servidor» (lo guarda la verificación en `vercel_state.registros`). */
export function motivoError(fila: FilaDominioBd): MotivoError {
  if (!estaMalConfigurado(fila) && fila.status !== 'failed') return null;
  const registros = objeto(fila.vercel_state).registros;
  if (Array.isArray(registros) && registros.some((r) => objeto(r).tipo === 'A' && objeto(r).estado === 'otro_valor')) {
    return 'a_otro_servidor';
  }
  return 'registros_incorrectos';
}

/** De la fila a lo que viaja al navegador. `porId` resuelve el host de una redirección. */
export function aDominioSitio(
  fila: FilaDominioBd,
  ahora: Date,
  porId: ReadonlyMap<string, FilaDominioBd>,
  compra?: CompraDominio | null,
): DominioSitio {
  const tipo = tipoDominio(fila, compra);
  const { estado, dias } = estadoInsignia(fila, ahora);
  const redirigeA = fila.redirect_to_domain_id ? porId.get(fila.redirect_to_domain_id)?.host ?? null : null;
  const m = objeto(fila.metadata);
  const fechaCompra = compra?.created_at ?? (typeof m.purchase_date === 'string' ? m.purchase_date : typeof m.purchased_at === 'string' ? m.purchased_at : null);
  return {
    id: fila.id,
    host: fila.host,
    tipo,
    estado,
    diasParaVencer: dias,
    principal: fila.is_primary && fila.is_active,
    activo: fila.is_active,
    redirigeA,
    codigoRedireccion: redirigeA ? fila.redirect_status_code ?? 308 : null,
    ssl: estadoSsl(fila),
    renovacion: renovacionDe(fila, tipo, redirigeA),
    revisadoEn: fila.last_verification_at,
    verificadoEn: fila.verified_at,
    compradoEn: tipo === 'comprado' ? fechaCompra : null,
    motivoError: motivoError(fila),
  };
}

const ORDEN_TIPO: Record<TipoDominio, number> = { comprado: 1, propio: 1, alias_www: 2, subdominio: 3 };

/**
 * Orden de la lista (B/07-01): el principal primero; luego cada dominio propio
 * seguido de su alias www; el subdominio GO Admin al final.
 */
export function ordenarDominios(dominios: readonly DominioSitio[]): DominioSitio[] {
  const raiz = (d: DominioSitio) => (d.tipo === 'alias_www' ? d.redirigeA ?? d.host.replace(/^www\./, '') : d.host);
  const raizPrincipal = dominios.find((d) => d.principal && d.tipo !== 'subdominio');
  const hostPrincipal = raizPrincipal ? raiz(raizPrincipal) : null;
  const grupo = (d: DominioSitio) => (d.tipo === 'subdominio' ? 2 : raiz(d) === hostPrincipal ? 0 : 1);
  return [...dominios].sort(
    (a, b) => grupo(a) - grupo(b) || raiz(a).localeCompare(raiz(b)) || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo],
  );
}

/**
 * Avisos en pantalla (B/07-24): dominio comprado que vence en 30 días o menos
 * con la renovación apagada (advertencia) o ya vencido (peligro). Sin fecha de
 * vencimiento conocida no hay aviso: no se inventa.
 */
export function alertasDominios(dominios: readonly DominioSitio[]): AlertaDominio[] {
  const alertas: AlertaDominio[] = [];
  for (const d of dominios) {
    if (d.tipo !== 'comprado' || !d.activo) continue;
    const auto = d.renovacion.tipo === 'automatica';
    if (d.diasParaVencer === null) continue;
    if (d.diasParaVencer < 0) {
      alertas.push({ id: `vencido-${d.id}`, dominioId: d.id, host: d.host, tipo: 'vencido', tono: 'peligro', dias: d.diasParaVencer, puedeActivarRenovacion: false });
    } else if (d.diasParaVencer <= DIAS_AVISO_VENCIMIENTO && !auto) {
      alertas.push({ id: `vence-${d.id}`, dominioId: d.id, host: d.host, tipo: 'vence_sin_renovar', tono: 'advertencia', dias: d.diasParaVencer, puedeActivarRenovacion: true });
    }
  }
  return alertas.sort((a, b) => (a.tono === b.tono ? (a.dias ?? 0) - (b.dias ?? 0) : a.tono === 'peligro' ? -1 : 1));
}

/** ¿Es un dominio propio (no el subdominio del sistema)? Las vistas lo usan para «vacío: solo el subdominio» (B/07-03). */
export function hayDominiosPropios(dominios: readonly DominioSitio[]): boolean {
  return dominios.some((d) => d.tipo !== 'subdominio');
}

/** Acción contextual de la fila (B/07-01): Renovar, Registros o Revisar. */
export type AccionContextual = 'renovar' | 'registros' | 'revisar' | null;

export function accionContextual(d: DominioSitio): AccionContextual {
  if (d.tipo === 'subdominio' || d.tipo === 'alias_www') return null;
  if (d.estado === 'vence_pronto' || d.estado === 'vencido') return d.tipo === 'comprado' ? 'renovar' : null;
  if (d.estado === 'verificando' || d.estado === 'pendiente') return 'registros';
  if (d.estado === 'mal_configurado') return 'revisar';
  return null;
}

/** «Usar como principal»: solo un dominio propio verificado y activo que aún no lo es. */
export function puedeSerPrincipal(d: DominioSitio): boolean {
  return (d.tipo === 'comprado' || d.tipo === 'propio' || d.tipo === 'subdominio') && !d.principal && d.activo && (d.estado === 'activo' || d.estado === 'vence_pronto');
}

/** Línea secundaria bajo el host (B/07-01) como clave de texto + valores. */
export type LineaSecundaria =
  | { clave: 'principal' }
  | { clave: 'redirige'; host: string; codigo: number }
  | { clave: 'revisado'; en: string }
  | { clave: 'sinRevisar' }
  | { clave: 'aOtroServidor' }
  | { clave: 'registrosIncorrectos' }
  | { clave: 'subdominioRedirige' }
  | { clave: 'subdominio' }
  | { clave: 'tambienAbre' };

export function lineaSecundaria(d: DominioSitio, hayPrincipalPropio: boolean): LineaSecundaria {
  if (d.tipo === 'subdominio') return d.principal || !hayPrincipalPropio ? { clave: 'subdominio' } : { clave: 'subdominioRedirige' };
  if (d.principal) return { clave: 'principal' };
  if (d.estado === 'mal_configurado') return d.motivoError === 'a_otro_servidor' ? { clave: 'aOtroServidor' } : { clave: 'registrosIncorrectos' };
  if (d.estado === 'verificando' || d.estado === 'pendiente') return d.revisadoEn ? { clave: 'revisado', en: d.revisadoEn } : { clave: 'sinRevisar' };
  if (d.redirigeA) return { clave: 'redirige', host: d.redirigeA, codigo: d.codigoRedireccion ?? 308 };
  return { clave: 'tambienAbre' };
}

/** Regla de ICANN: un dominio no se transfiere en sus primeros 60 días. */
export const DIAS_BLOQUEO_TRANSFERENCIA = 60;
const MS_DIA = 86_400_000;

export function transferenciaDisponible(compradoEn: string | null, ahora: Date): { puede: boolean; disponibleEn: string | null } {
  if (!compradoEn) return { puede: false, disponibleEn: null };
  const t = Date.parse(compradoEn);
  if (!Number.isFinite(t)) return { puede: false, disponibleEn: null };
  const desde = t + DIAS_BLOQUEO_TRANSFERENCIA * MS_DIA;
  return { puede: ahora.getTime() >= desde, disponibleEn: new Date(desde).toISOString() };
}
