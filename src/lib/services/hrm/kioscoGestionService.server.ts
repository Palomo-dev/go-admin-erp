/**
 * Gestión del kiosco desde GO Admin (plan de Marcación, M1): vincular una tablet o
 * un computador con el código que muestra, revocar su clave, PIN y carnés de las
 * personas, desbloqueo de un PIN, autorizaciones de la propia persona (Figma 20.32),
 * ver la foto de evidencia (con registro) y la tarea diaria que borra las vencidas.
 *
 * Todo con la sesión de `withOrg` (organización y actor de getServerOrgContext) y
 * RPC SECURITY DEFINER que comprueban el permiso en la base (hr.attendance.view /
 * hr.attendance.manage). La service role solo llama a esas RPC y al Storage
 * privado, con la organización ya resuelta por la sesión.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { normalizarCodigo, leerCarne } from '@/lib/hrm/kiosco/kiosco';
import { BUCKET_FOTOS } from '@/lib/hrm/kiosco/foto';
import { HrmError, errorDeRpc, esUuid, type ContextoPeticion } from './tipos';

export type ContextoKiosco = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

/** Versión del texto de autorización (Figma 20.32; «Política de tratamiento de datos, versión 2026-11»). */
export const VERSION_AUTORIZACION = '2026-11';
export const TIPOS_AUTORIZACION = ['foto_evidencia', 'huella', 'rostro'] as const;
export type TipoAutorizacion = (typeof TIPOS_AUTORIZACION)[number];

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getServiceClient().rpc(nombre, args);
  if (error) throw errorDeRpc(error);
  return data as T;
}

function base(ctx: ContextoKiosco) {
  return { p_actor: ctx.userId, p_org: ctx.organizationId };
}

// ─── Vincular y revocar ──────────────────────────────────────────────────────

/** Agregar dispositivo › Kiosco en una tablet / Lector en un computador (20.28.3), o vincular de nuevo. */
export function vincularEquipo(ctx: ContextoKiosco, datos: unknown) {
  const d = (datos ?? {}) as Record<string, unknown>;
  const codigo = normalizarCodigo(d.codigo);
  if (!codigo) throw new HrmError(422, 'codigo_invalido');
  if (d.reloj_id !== undefined && d.reloj_id !== null) {
    if (!esUuid(d.reloj_id)) throw new HrmError(400, 'reloj_invalido');
    return rpc<{ id: string; tipo: string; nombre: string }>('fn_hr_kiosco_vincular', { ...base(ctx), p_datos: { codigo, reloj_id: d.reloj_id } });
  }
  if (d.tipo !== 'kiosco' && d.tipo !== 'lector_escritorio') throw new HrmError(422, 'tipo_no_disponible');
  const nombre = typeof d.nombre === 'string' ? d.nombre.trim() : '';
  if (nombre.length < 2 || nombre.length > 80) throw new HrmError(422, 'nombre_invalido');
  const sede = Number(d.sede_id);
  if (!Number.isInteger(sede) || sede <= 0) throw new HrmError(422, 'sede_invalida');
  const descripcion = typeof d.descripcion === 'string' ? d.descripcion.trim().slice(0, 200) : '';
  return rpc<{ id: string; tipo: string; nombre: string }>('fn_hr_kiosco_vincular', {
    ...base(ctx),
    p_datos: { codigo, tipo: d.tipo, nombre, sede_id: sede, ...(descripcion ? { descripcion } : {}) },
  });
}

export function revocarEquipo(ctx: ContextoKiosco, id: string) {
  if (!esUuid(id)) throw new HrmError(400, 'reloj_invalido');
  return rpc<{ id: string; revocada: boolean }>('fn_hr_kiosco_revocar', { ...base(ctx), p_reloj: id });
}

// ─── PIN y carnés ────────────────────────────────────────────────────────────

export function credenciales(ctx: ContextoKiosco, sede: number | null) {
  return rpc<Record<string, unknown>>('fn_hr_credenciales', { ...base(ctx), p_branch: sede });
}

/**
 * POST de `/api/hrm/marcacion/credenciales`:
 * - `{ accion: 'pin', vinculo_id }` → PIN nuevo (se devuelve UNA vez).
 * - `{ accion: 'carne', vinculo_id, tipo: 'carne_nfc', valor }` → carné NFC (UID del lector).
 * - `{ accion: 'carne', vinculo_id, tipo: 'carne_qr' }` → GO Admin genera el código para imprimir.
 * - `{ accion: 'revocar', id }` · `{ accion: 'desbloquear', vinculo_id }`.
 */
export function accionCredencial(ctx: ContextoKiosco, datos: unknown) {
  const d = (datos ?? {}) as Record<string, unknown>;
  switch (d.accion) {
    case 'pin':
      if (!esUuid(d.vinculo_id)) throw new HrmError(400, 'vinculo_invalido');
      return rpc<{ pin: string }>('fn_hr_pin_asignar', { ...base(ctx), p_employment: d.vinculo_id });
    case 'desbloquear':
      if (!esUuid(d.vinculo_id)) throw new HrmError(400, 'vinculo_invalido');
      return rpc<{ ok: boolean }>('fn_hr_pin_desbloquear', { ...base(ctx), p_employment: d.vinculo_id });
    case 'revocar':
      if (!esUuid(d.id)) throw new HrmError(400, 'credencial_invalida');
      return rpc<{ id: string }>('fn_hr_credencial_revocar', { ...base(ctx), p_id: d.id });
    case 'carne': {
      if (!esUuid(d.vinculo_id)) throw new HrmError(400, 'vinculo_invalido');
      if (d.tipo === 'carne_qr') {
        return rpc<{ id: string; codigo: string | null; etiqueta: string }>('fn_hr_carne_registrar', {
          ...base(ctx),
          p_employment: d.vinculo_id,
          p_tipo: 'carne_qr',
          p_valor: null,
        });
      }
      if (d.tipo !== 'carne_nfc') throw new HrmError(422, 'tipo_invalido');
      const leido = leerCarne(d.valor, 'nfc');
      if (!leido || leido.tipo !== 'carne_nfc') throw new HrmError(422, 'carne_invalido');
      return rpc<{ id: string; codigo: string | null; etiqueta: string }>('fn_hr_carne_registrar', {
        ...base(ctx),
        p_employment: d.vinculo_id,
        p_tipo: 'carne_nfc',
        p_valor: leido.valor,
      });
    }
    default:
      throw new HrmError(422, 'accion_invalida');
  }
}

// ─── Autorizaciones de la persona (20.32) ────────────────────────────────────

export function misAutorizaciones(ctx: ContextoKiosco) {
  return rpc<Record<string, unknown>>('fn_hr_mis_autorizaciones', base(ctx));
}

/** `{ tipos: ['foto_evidencia', …], autorizo: true|false }`: una decisión, solo inserción. */
export function decidirAutorizacion(ctx: ContextoKiosco, datos: unknown, peticion: ContextoPeticion) {
  const d = (datos ?? {}) as { tipos?: unknown; autorizo?: unknown };
  const tipos = Array.isArray(d.tipos) ? [...new Set(d.tipos)] : [];
  if (tipos.length === 0 || !tipos.every((t) => (TIPOS_AUTORIZACION as readonly unknown[]).includes(t))) {
    throw new HrmError(422, 'autorizacion_invalida');
  }
  if (typeof d.autorizo !== 'boolean') throw new HrmError(422, 'autorizacion_invalida');
  return rpc<Record<string, unknown>>('fn_hr_marcacion_autorizar', {
    ...base(ctx),
    p_kinds: tipos,
    p_otorgar: d.autorizo,
    p_version: VERSION_AUTORIZACION,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
  });
}

// ─── Foto de evidencia ───────────────────────────────────────────────────────

/** Ver la foto de una marca: la base comprueba el permiso y registra la vista (§5.2). */
export async function verFoto(ctx: ContextoKiosco, eventoId: string, peticion: ContextoPeticion) {
  if (!esUuid(eventoId)) throw new HrmError(400, 'marca_invalida');
  const r = await rpc<{ ruta: string | null; vence?: string; retenida?: boolean; hora?: string; motivo?: string }>('fn_hr_foto_evidencia', {
    ...base(ctx),
    p_evento: eventoId,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
  });
  if (!r.ruta) return { url: null, motivo: r.motivo ?? 'sin_foto' };
  const { data, error } = await getServiceClient().storage.from(BUCKET_FOTOS).createSignedUrl(r.ruta, 60);
  if (error || !data?.signedUrl) throw new HrmError(404, 'no_existe');
  return { url: data.signedUrl, vence: r.vence ?? null, retenida: r.retenida === true, hora: r.hora ?? null };
}

/**
 * Tarea diaria `hrm-fotos-evidencia` (pg_cron → /api/cron/hrm-fotos-evidencia):
 * borra del bucket las fotos vencidas sin retención por caso y deja la marca sin
 * foto. El borrado va por la API de Storage (la base no puede borrar objetos).
 */
export async function borrarFotosVencidas(maxRondas = 5): Promise<{ borradas: number }> {
  let borradas = 0;
  for (let i = 0; i < maxRondas; i++) {
    const lista = await rpc<Array<{ evento_id: string; ruta: string }>>('fn_hr_fotos_evidencia_vencidas', { p_limite: 200 });
    if (!lista?.length) break;
    const { error } = await getServiceClient().storage.from(BUCKET_FOTOS).remove(lista.map((x) => x.ruta));
    if (error) throw new HrmError(500, 'error_hrm', error.message);
    borradas += await rpc<number>('fn_hr_fotos_evidencia_borradas', { p_eventos: lista.map((x) => x.evento_id) });
    if (lista.length < 200) break;
  }
  return { borradas };
}
