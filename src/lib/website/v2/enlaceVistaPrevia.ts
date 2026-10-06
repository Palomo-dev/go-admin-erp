/**
 * Enlace privado de la vista previa del borrador V2 (Figma «05 Editor»: 1895:920555,
 * 1895:920686, componente «BarraVistaPrevia» 1886:919747).
 *
 * El ERP firma con HMAC-SHA256 un token que dice qué organización y qué sitio
 * se quieren ver y hasta cuándo; goadmin-websites lo verifica y, solo con
 * firma válida, sin caducar y para la organización del host, pinta el
 * borrador (`website_site_drafts`) en lugar de la revisión publicada.
 *
 * Formato: `<carga>.<firma>`, ambas en base64url.
 *   carga = JSON { v: 1, o: organización, s: site_state_id, e: caduca (epoch s), r: URL del editor }
 *   firma = HMAC-SHA256(WEBSITE_PREVIEW_SECRET, "vista-previa-sitio:v1." + carga)
 *
 * El prefijo separa el uso de la clave: aunque se reutilizara el secreto en otro
 * lugar, una firma de aquí no sirve allí ni al revés.
 *
 * Secreto: `WEBSITE_PREVIEW_SECRET`, el MISMO valor en el ERP y en
 * goadmin-websites. No se reutiliza `CRON_SECRET` (es un bearer de cron: rotarlo
 * rompería las vistas previas y mezclaría propósitos). Sin secreto, falla
 * cerrado: no se emite ningún enlace.
 *
 * ORIGEN de la verificación en goadmin-websites: `lib/website/v2/enlaceVistaPrevia.ts`
 * es una copia de `verificarTokenVistaPrevia`; si el formato cambia, se cambia en los dos.
 *
 * Solo servidor.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { isRealSecret } from '@/lib/security/secrets';

export const PREFIJO_FIRMA = 'vista-previa-sitio:v1.';
/** Duración del enlace: «Enlace privado · caduca en 24 h». */
export const DURACION_ENLACE_SEGUNDOS = 24 * 60 * 60;
/** Longitud mínima del secreto (como WS_SESSION_SECRET). */
const LONGITUD_MINIMA_SECRETO = 32;

export interface CargaVistaPrevia {
  v: 1;
  /** organization_id */
  o: number;
  /** website_site_states.id del sitio que se abre primero. */
  s: string;
  /** Caduca, en segundos desde epoch. */
  e: number;
  /** URL del editor para «Volver al editor» y «Publicar». */
  r: string;
}

/** El secreto, o `null` si falta, es un relleno de ejemplo o es corto (falla cerrado). */
export function secretoVistaPrevia(entorno: Record<string, string | undefined> = process.env): string | null {
  const s = entorno.WEBSITE_PREVIEW_SECRET?.trim();
  return isRealSecret(s, LONGITUD_MINIMA_SECRETO) ? s : null;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function desdeBase64url(texto: string): Buffer {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64');
}

function firmar(carga: string, secreto: string): string {
  return base64url(createHmac('sha256', secreto).update(PREFIJO_FIRMA + carga).digest());
}

export function firmarTokenVistaPrevia(carga: CargaVistaPrevia, secreto: string): string {
  const cuerpo = base64url(Buffer.from(JSON.stringify(carga), 'utf8'));
  return `${cuerpo}.${firmar(cuerpo, secreto)}`;
}

export type ResultadoVerificacion =
  | { ok: true; carga: CargaVistaPrevia }
  | { ok: false; motivo: 'formato' | 'firma' | 'caducado' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verifica firma (en tiempo constante), forma y caducidad. */
export function verificarTokenVistaPrevia(token: string, secreto: string, ahoraSeg = Math.floor(Date.now() / 1000)): ResultadoVerificacion {
  if (typeof token !== 'string' || token.length > 2048) return { ok: false, motivo: 'formato' };
  const partes = token.split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'formato' };
  const [cuerpo, firma] = partes;
  const esperada = Buffer.from(firmar(cuerpo, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return { ok: false, motivo: 'firma' };
  let carga: unknown;
  try {
    carga = JSON.parse(desdeBase64url(cuerpo).toString('utf8'));
  } catch {
    return { ok: false, motivo: 'formato' };
  }
  const c = carga as Partial<CargaVistaPrevia>;
  if (
    c?.v !== 1 ||
    typeof c.o !== 'number' || !Number.isInteger(c.o) || c.o <= 0 ||
    typeof c.s !== 'string' || !UUID.test(c.s) ||
    typeof c.e !== 'number' || !Number.isInteger(c.e) ||
    typeof c.r !== 'string' || c.r.length > 512
  ) {
    return { ok: false, motivo: 'formato' };
  }
  if (c.e <= ahoraSeg) return { ok: false, motivo: 'caducado' };
  return { ok: true, carga: c as CargaVistaPrevia };
}
