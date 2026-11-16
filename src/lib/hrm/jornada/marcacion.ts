/**
 * Lectura del cuerpo de una marcación (ADR-002 §2). Puro: lo usan la ruta
 * `POST /api/hrm/marcacion`, el servicio de `/marcar` y las pruebas.
 *
 * Lo que NO viaja nunca desde el cliente: la hora (la pone el servidor), el
 * vínculo de otra persona y la organización (sale de la sesión). El QR solo
 * aporta el punto de marcación y su token, que se comparan en la base.
 */

export type MetodoMarcacion = 'qr' | 'app';
export type TipoEvento = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export interface QrMarcacion {
  relojId: string;
  token: string;
  /** Organización que dice el QR: debe ser la de la sesión. */
  org: number | null;
}

export interface DatosMarcacion {
  metodo: MetodoMarcacion;
  reloj_id?: string;
  token?: string;
  tipo?: TipoEvento;
  remoto?: boolean;
  ubicacion?: { lat: number; lng: number; precision?: number };
  dispositivo?: { plataforma?: string; app?: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9._~-]{8,200}$/;
const TIPOS: readonly TipoEvento[] = ['check_in', 'check_out', 'break_start', 'break_end'];

export class MarcacionInvalida extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MarcacionInvalida';
  }
}

/**
 * Contenido del QR que muestra la pantalla de la sede:
 * `{"type":"attendance","device_id":"<uuid>","token":"…","org":135}`.
 */
export function leerQr(contenido: unknown): QrMarcacion {
  let datos: unknown = contenido;
  if (typeof contenido === 'string') {
    if (contenido.length > 2000) throw new MarcacionInvalida('qr_invalido');
    try {
      datos = JSON.parse(contenido);
    } catch {
      throw new MarcacionInvalida('qr_invalido');
    }
  }
  if (!datos || typeof datos !== 'object') throw new MarcacionInvalida('qr_invalido');
  const d = datos as Record<string, unknown>;
  if (d.type !== 'attendance') throw new MarcacionInvalida('qr_no_es_de_marcacion');
  const relojId = typeof d.device_id === 'string' ? d.device_id : '';
  const token = typeof d.token === 'string' ? d.token : '';
  if (!UUID_RE.test(relojId) || !TOKEN_RE.test(token)) throw new MarcacionInvalida('qr_invalido');
  const org = typeof d.org === 'number' && Number.isInteger(d.org) ? d.org : typeof d.org === 'string' && /^\d+$/.test(d.org) ? Number(d.org) : null;
  return { relojId, token, org };
}

function ubicacionDe(v: unknown): DatosMarcacion['ubicacion'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const u = v as Record<string, unknown>;
  const lat = Number(u.lat);
  const lng = Number(u.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const precision = Number(u.precision ?? u.accuracy);
  return Number.isFinite(precision) && precision >= 0 ? { lat, lng, precision } : { lat, lng };
}

/**
 * Normaliza el cuerpo que manda el cliente. Descarta cualquier hora, vínculo u
 * organización: no son del cliente.
 */
export function datosDeMarcacion(body: unknown, orgSesion: number): DatosMarcacion {
  if (!body || typeof body !== 'object') throw new MarcacionInvalida('datos_invalidos');
  const b = body as Record<string, unknown>;
  const tipo = typeof b.tipo === 'string' && (TIPOS as readonly string[]).includes(b.tipo) ? (b.tipo as TipoEvento) : undefined;
  const ubicacion = ubicacionDe(b.ubicacion);
  const dispositivo =
    b.dispositivo && typeof b.dispositivo === 'object'
      ? {
          plataforma: typeof (b.dispositivo as Record<string, unknown>).plataforma === 'string'
            ? String((b.dispositivo as Record<string, unknown>).plataforma).slice(0, 40)
            : undefined,
          app: typeof (b.dispositivo as Record<string, unknown>).app === 'string'
            ? String((b.dispositivo as Record<string, unknown>).app).slice(0, 40)
            : undefined,
        }
      : undefined;

  if (b.qr !== undefined && b.qr !== null) {
    const qr = leerQr(b.qr);
    if (qr.org !== null && qr.org !== orgSesion) throw new MarcacionInvalida('qr_de_otra_organizacion');
    return { metodo: 'qr', reloj_id: qr.relojId, token: qr.token, tipo, ubicacion, dispositivo };
  }
  if (b.metodo === 'app') {
    return { metodo: 'app', tipo, remoto: b.remoto === true, ubicacion, dispositivo };
  }
  throw new MarcacionInvalida('metodo_invalido');
}
