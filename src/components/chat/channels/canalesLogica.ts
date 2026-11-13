/**
 * Reglas puras de la pantalla de Canales (Figma 91-chat-20/21). Sin React:
 * `__tests__/canalesLogica.test.ts`.
 */
import type { AIMode, ChannelType, ChatChannel } from '@/lib/services/chatChannelsService';

/** Tipos que hoy se pueden crear (CHECK de `channels.type`). */
export const TIPOS_DISPONIBLES = ['whatsapp', 'instagram', 'facebook', 'website'] as const;
export type TipoDisponible = (typeof TIPOS_DISPONIBLES)[number];
/** Se muestran como «Próximamente». */
export const TIPOS_PROXIMAMENTE = ['telegram', 'email'] as const;

export const MODOS_IA: readonly AIMode[] = ['manual', 'hybrid', 'auto'];

/** Forma de conectar un número de WhatsApp (`channel_credentials.connection_method`). */
export type FormaConexion = 'cloud_api' | 'coexistence' | 'qr_scan';
export const FORMAS_CONEXION: readonly FormaConexion[] = ['cloud_api', 'coexistence', 'qr_scan'];

/**
 * Estado de conexión de un canal, con los datos que existen en la BD:
 *  - `suspendido`: `channels.status = 'suspended'`;
 *  - `inactivo`: `channels.status = 'inactive'`;
 *  - `tokenVencido`: canal de Meta con credenciales y `is_valid = false`;
 *  - `sinConectar`: canal de Meta sin credenciales guardadas;
 *  - `conectado`: lo demás (el widget web está conectado si tiene llave pública).
 */
export type EstadoConexion = 'conectado' | 'tokenVencido' | 'sinConectar' | 'suspendido' | 'inactivo';

export function esCanalMeta(tipo: ChannelType): boolean {
  return tipo === 'whatsapp' || tipo === 'instagram' || tipo === 'facebook';
}

export function estadoConexion(canal: Pick<ChatChannel, 'type' | 'status' | 'public_key' | 'credentials'>): EstadoConexion {
  if (canal.status === 'suspended') return 'suspendido';
  if (canal.status === 'inactive') return 'inactivo';
  if (canal.type === 'website') return canal.public_key ? 'conectado' : 'sinConectar';
  if (!canal.credentials) return 'sinConectar';
  return canal.credentials.is_valid === false ? 'tokenVencido' : 'conectado';
}

/** Canales que piden atención: token vencido o suspendidos (aviso con «Reconectar»). */
export function canalesConError<T extends Pick<ChatChannel, 'type' | 'status' | 'public_key' | 'credentials'>>(canales: readonly T[]): T[] {
  return canales.filter((c) => {
    const e = estadoConexion(c);
    return e === 'tokenVencido' || e === 'suspendido';
  });
}

/** Página de detalle de cada tipo. `null` si el tipo no tiene página (no debería pasar). */
export function rutaDetalleCanal(canal: Pick<ChatChannel, 'id' | 'type'>, conexion?: FormaConexion): string | null {
  const segmento: Partial<Record<ChannelType, string>> = {
    whatsapp: 'whatsapp',
    instagram: 'instagram',
    facebook: 'facebook',
    website: 'sitio-web',
  };
  const s = segmento[canal.type];
  if (!s) return null;
  const base = `/app/chat/canales/${s}/${canal.id}`;
  return conexion && canal.type === 'whatsapp' ? `${base}?conexion=${conexion}` : base;
}

/**
 * Línea secundaria bajo el nombre del canal en la tabla: dominios del widget o
 * forma de conexión del número. Las credenciales de Meta no guardan el número
 * visible ni el nombre de la página, así que no se inventan.
 */
export function detalleCanal(
  canal: Pick<ChatChannel, 'type' | 'credentials' | 'website_settings'>,
): { clave: 'dominios' | 'sinDominios' | 'conexion' | 'cuentaVinculada' | 'sinCredenciales'; valor?: string; n?: number } {
  if (canal.type === 'website') {
    const dominios = canal.website_settings?.allowed_domains ?? [];
    return dominios.length ? { clave: 'dominios', valor: dominios[0], n: dominios.length } : { clave: 'sinDominios' };
  }
  if (!canal.credentials) return { clave: 'sinCredenciales' };
  if (canal.type === 'whatsapp') return { clave: 'conexion', valor: canal.credentials.connection_method ?? 'cloud_api' };
  return { clave: 'cuentaVinculada' };
}

/**
 * Tarjetas de «Conectar otro canal»: los disponibles y luego los próximos. Si
 * ya hay uno del tipo, la tarjeta ofrece «otro» (otro número, otra cuenta).
 */
export function tarjetasConectar(canales: readonly Pick<ChatChannel, 'type'>[]): { tipo: ChannelType; yaTiene: boolean; proximamente: boolean }[] {
  const tiene = new Set(canales.map((c) => c.type));
  return [
    ...TIPOS_DISPONIBLES.map((tipo) => ({ tipo, yaTiene: tiene.has(tipo), proximamente: false })),
    ...TIPOS_PROXIMAMENTE.map((tipo) => ({ tipo, yaTiene: false, proximamente: true })),
  ];
}

/** «hace 3 min», «hace 2 h», «hace 4 días» con la API del navegador; `null` si no hay fecha. */
export function tiempoRelativo(fecha: string | null | undefined, ahora: Date, locale: string): string | null {
  if (!fecha) return null;
  const t = Date.parse(fecha);
  if (Number.isNaN(t)) return null;
  const seg = Math.round((t - ahora.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seg);
  if (abs < 60) return rtf.format(0, 'minute');
  if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(seg / 86400), 'day');
  return rtf.format(Math.round(seg / (86400 * 30)), 'month');
}

/** Segundos → «45 s», «3 min», «1 h 20 min». */
export function duracionCorta(seg: number | null | undefined): string | null {
  if (seg == null || !Number.isFinite(seg)) return null;
  if (seg < 60) return `${Math.round(seg)} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}
