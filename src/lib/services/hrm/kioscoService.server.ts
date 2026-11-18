/**
 * Kiosco de Marcación y lector de carnés de GO Admin Escritorio (plan
 * `docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md`, fase M1). SOLO servidor.
 *
 * Las rutas `/api/hrm/kiosco/**` NO tienen sesión de usuario: una tablet
 * vinculada no es una persona. Autentican con la clave del equipo
 * (`Authorization: Bearer <clave>`): se busca por su SHA-256 con la service role
 * (`fn_hr_kiosco_equipo`) y **la organización, la sede y el tipo salen del equipo
 * registrado**, nunca de la petición (regla 5 para equipos, riesgo R4 del plan).
 *
 * Fail-closed: clave ausente, con forma inválida, revocada o de un equipo
 * desactivado → el mismo 401. Cada 401 cuenta en un cubo por IP (300 por minuto);
 * con el cubo agotado se responde 429 sin tocar la base (protege el coste de la
 * consulta, no la fuerza bruta: la clave tiene 256 bits). Mismo esquema que la
 * pantalla del cliente del POS (`lib/pos/display/server/displayAuth.ts`).
 */
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimit, getClientIp, isRateLimitExhausted } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { esLlave, llaveDeCabecera } from '@/lib/hrm/kiosco/llave';
import { esPin, leerCarne, type TipoCredencial } from '@/lib/hrm/kiosco/kiosco';
import { esIdLocal, MAX_LOTE } from '@/lib/hrm/kiosco/cola';
import { BUCKET_FOTOS, esRutaFoto, leerFotoDataUrl } from '@/lib/hrm/kiosco/foto';
import { HrmError, errorDeRpc } from './tipos';

export interface EquipoKiosco {
  relojId: string;
  organizationId: number;
  sedeId: number | null;
  tipo: 'kiosco' | 'lector_escritorio';
}

export const KIOSCO_SIN_AUTORIZACION = 'KIOSCO_NO_AUTORIZADO';
export const KIOSCO_FALLOS_LIMITE = { limit: 300, windowMs: 60 * 1000, unknownClientLimit: 10 } as const;
const KIOSCO_FALLOS_PREFIJO = 'hrm-kiosco:auth:ip:';
/** Códigos de vinculación por IP: 30 cada 10 min (la base pone además 20 por IP). */
export const KIOSCO_VINCULO_LIMITE = { limit: 30, windowMs: 10 * 60 * 1000, unknownClientLimit: 5 } as const;

const SIN_CACHE = { 'Cache-Control': 'no-store' } as const;

export function kioscoNoAutorizado(): NextResponse {
  return NextResponse.json(
    { error: 'Equipo no autorizado: vincúlalo de nuevo con un código', code: KIOSCO_SIN_AUTORIZACION },
    { status: 401, headers: { ...SIN_CACHE, 'WWW-Authenticate': 'Bearer realm="hrm-kiosco"' } }
  );
}

function demasiados(resetAt: Date): NextResponse {
  const s = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json({ error: 'Demasiados intentos', code: 'RATE_LIMITED' }, { status: 429, headers: { ...SIN_CACHE, 'Retry-After': String(s) } });
}

function cliente() {
  return getServiceClient();
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().rpc(nombre, args);
  if (error) throw errorDeRpc(error);
  return data as T;
}

export function hashLlaveServidor(llave: string): string {
  return createHash('sha256').update(llave, 'utf8').digest('hex');
}

/**
 * Puerta de las rutas del equipo. Devuelve el equipo (con su organización) o la
 * respuesta 401/429/503 que la ruta debe devolver tal cual. Nunca lanza.
 */
export async function autenticarKiosco(req: Pick<Request, 'headers'>): Promise<{ ok: true; equipo: EquipoKiosco } | { ok: false; respuesta: NextResponse }> {
  const ip = getClientIp(req);
  const clave = `${KIOSCO_FALLOS_PREFIJO}${ip}`;
  if (isRateLimitExhausted(clave, KIOSCO_FALLOS_LIMITE)) {
    return { ok: false, respuesta: demasiados(new Date(Date.now() + KIOSCO_FALLOS_LIMITE.windowMs)) };
  }
  const fallo = async (): Promise<{ ok: false; respuesta: NextResponse }> => {
    const rl = await checkRateLimit(clave, KIOSCO_FALLOS_LIMITE, { store: getRateLimitStore() });
    return { ok: false, respuesta: rl.allowed ? kioscoNoAutorizado() : demasiados(rl.resetAt) };
  };
  const llave = llaveDeCabecera(req.headers.get('authorization'));
  if (!llave) return fallo();
  try {
    const hash = hashLlaveServidor(llave);
    const { data, error } = await cliente().rpc('fn_hr_kiosco_equipo', { p_key_hash: hash, p_ip: ip === 'unknown' ? null : ip });
    if (error) {
      console.error('[hrm/kiosco] autenticación:', error.message);
      return { ok: false, respuesta: NextResponse.json({ error: 'No se pudo validar el equipo', code: 'KIOSCO_NO_DISPONIBLE' }, { status: 503, headers: SIN_CACHE }) };
    }
    const d = data as { reloj_id?: string; org?: number; sede_id?: number | null; tipo?: string } | null;
    if (!d?.reloj_id || typeof d.org !== 'number' || (d.tipo !== 'kiosco' && d.tipo !== 'lector_escritorio')) return fallo();
    return { ok: true, equipo: { relojId: d.reloj_id, organizationId: d.org, sedeId: d.sede_id ?? null, tipo: d.tipo } };
  } catch (err) {
    console.error('[hrm/kiosco] autenticación:', err instanceof Error ? err.message : err);
    return { ok: false, respuesta: NextResponse.json({ error: 'No se pudo validar el equipo', code: 'KIOSCO_NO_DISPONIBLE' }, { status: 503, headers: SIN_CACHE }) };
  }
}

// ─── Vinculación (20.29.7) ───────────────────────────────────────────────────

/**
 * La tablet sin vincular pide (o vuelve a pedir) su código con el SHA-256 de la
 * clave que generó. Límite por IP antes de tocar la base.
 */
export async function codigoDeVinculo(req: Request, cuerpo: unknown): Promise<Response> {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`hrm-kiosco:vinculo:ip:${ip}`, KIOSCO_VINCULO_LIMITE, { store: getRateLimitStore() });
  if (!rl.allowed) return demasiados(rl.resetAt);
  const llaveHash = (cuerpo as { llave_hash?: unknown } | null)?.llave_hash;
  if (!esLlave(llaveHash)) throw new HrmError(422, 'llave_invalida');
  const r = await rpc<Record<string, unknown>>('fn_hr_kiosco_codigo', { p_key_hash: llaveHash, p_ip: ip === 'unknown' ? null : ip });
  return NextResponse.json(r, { headers: SIN_CACHE });
}

// ─── Lo que hace el equipo ────────────────────────────────────────────────────

export function configKiosco(e: EquipoKiosco) {
  return rpc<Record<string, unknown>>('fn_hr_kiosco_config', { p_reloj: e.relojId });
}

export function usosQrKiosco(e: EquipoKiosco, paso: unknown) {
  const p = Number(paso);
  if (!Number.isSafeInteger(p) || p <= 0) throw new HrmError(400, 'paso_invalido');
  return rpc<{ paso: number; usado_hasta: number | null; ahora: string }>('fn_hr_kiosco_qr_usos', { p_reloj: e.relojId, p_paso: p });
}

/** Credencial que manda la tablet, validada en forma (la base decide si es de alguien). */
export function credencialDe(v: unknown): { tipo: TipoCredencial; valor: string } {
  const c = (v ?? {}) as { tipo?: unknown; valor?: unknown };
  if (c.tipo === 'pin' && esPin(c.valor)) return { tipo: 'pin', valor: c.valor };
  if (c.tipo === 'carne_nfc' || c.tipo === 'carne_qr') {
    const leido = leerCarne(c.valor, c.tipo === 'carne_qr' ? 'qr' : 'nfc');
    if (leido && leido.tipo === c.tipo) return leido;
    if (c.tipo === 'carne_nfc' && leido) return { tipo: 'carne_nfc', valor: leido.valor };
  }
  throw new HrmError(422, 'credencial_invalida');
}

export function identificar(e: EquipoKiosco, cuerpo: unknown) {
  const b = (cuerpo ?? {}) as { id_local?: unknown; credencial?: unknown };
  if (!esIdLocal(b.id_local)) throw new HrmError(422, 'id_local_invalido');
  return rpc<Record<string, unknown>>('fn_hr_kiosco_identificar', { p_reloj: e.relojId, p_local: b.id_local, p_cred: credencialDe(b.credencial) });
}

export function desbloquear(e: EquipoKiosco, cuerpo: unknown) {
  const b = (cuerpo ?? {}) as { pin?: unknown; credencial_id?: unknown };
  if (!esPin(b.pin)) throw new HrmError(422, 'credencial_invalida');
  const cred = typeof b.credencial_id === 'string' && esIdLocal(b.credencial_id) ? b.credencial_id : null;
  return rpc<Record<string, unknown>>('fn_hr_kiosco_desbloquear', { p_reloj: e.relojId, p_pin: b.pin, p_credencial: cred });
}

interface ResultadoBase {
  id_local: string;
  estado: string;
  evento_id?: string | null;
  foto_ruta?: string | null;
  foto_vence?: string | null;
  [k: string]: unknown;
}

/**
 * Lote de marcas (D7). Las de sin conexión traen la credencial y su hora; las del
 * kiosco en vivo, solo el `id_local` identificado y, si la persona autorizó la
 * foto, la imagen. La base registra; aquí se sube la foto que la base pidió (ruta
 * armada por ella) y se enlaza. Si la foto falla, la marca queda «Sin foto».
 */
export async function marcar(e: EquipoKiosco, cuerpo: unknown): Promise<{ resultados: Array<ResultadoBase & { foto_guardada?: boolean }> }> {
  const lista = (cuerpo as { marcas?: unknown } | null)?.marcas;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAX_LOTE) throw new HrmError(422, 'lote_invalido');
  const fotos = new Map<string, ReturnType<typeof leerFotoDataUrl>>();
  const lote = lista.map((x) => {
    const m = (x ?? {}) as Record<string, unknown>;
    if (!esIdLocal(m.id_local)) throw new HrmError(422, 'id_local_invalido');
    const fueraDeLinea = m.fuera_de_linea === true;
    if (!fueraDeLinea && m.foto !== undefined) fotos.set(m.id_local, leerFotoDataUrl(m.foto));
    return {
      id_local: m.id_local,
      fuera_de_linea: fueraDeLinea,
      ...(fueraDeLinea ? { credencial: credencialDe(m.credencial) } : {}),
      ...(typeof m.hora === 'string' && Number.isFinite(Date.parse(m.hora)) ? { hora: m.hora } : {}),
      ...(typeof m.hora_equipo === 'string' && Number.isFinite(Date.parse(m.hora_equipo)) ? { hora_equipo: m.hora_equipo } : {}),
    };
  });

  const r = await rpc<{ resultados: ResultadoBase[] }>('fn_hr_marcar_kiosco', { p_reloj: e.relojId, p_lote: lote });
  const resultados: Array<ResultadoBase & { foto_guardada?: boolean }> = [];
  for (const x of r.resultados ?? []) {
    const foto = fotos.get(x.id_local);
    if (!x.foto_ruta || !x.evento_id) {
      resultados.push(x);
      continue;
    }
    resultados.push({ ...x, foto_guardada: foto ? await guardarFoto(e, x.evento_id, x.foto_ruta, foto) : false });
  }
  return { resultados };
}

async function guardarFoto(e: EquipoKiosco, eventoId: string, ruta: string, foto: NonNullable<ReturnType<typeof leerFotoDataUrl>>): Promise<boolean> {
  if (!esRutaFoto(ruta, e.organizationId)) return false;
  try {
    const { error } = await cliente()
      .storage.from(BUCKET_FOTOS)
      .upload(ruta, Buffer.from(foto.base64, 'base64'), { contentType: 'image/jpeg', upsert: false });
    if (error) {
      console.error('[hrm/kiosco] foto:', error.message);
      return false;
    }
    await rpc('fn_hr_kiosco_foto_guardada', { p_reloj: e.relojId, p_evento: eventoId, p_ruta: ruta });
    return true;
  } catch (err) {
    console.error('[hrm/kiosco] foto:', err instanceof Error ? err.message : err);
    // La marca ya cuenta; si el archivo subió pero no se enlazó, la tarea no lo verá: se quita.
    await cliente().storage.from(BUCKET_FOTOS).remove([ruta]).catch(() => undefined);
    return false;
  }
}

