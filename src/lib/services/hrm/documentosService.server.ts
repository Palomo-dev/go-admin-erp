/**
 * Documentos del empleado en el bucket privado `hr-documentos`. ADR-001 §10.
 *
 * - Subir: el servidor comprueba `hr.data.<grupo>.edit` (fn_hr_actor_puede_grupo)
 *   y entrega una URL firmada de subida a una ruta que él mismo arma
 *   (`{org}/{grupo}/{persona}/{uuid}.{ext}`). Después, `registrarDocumento`
 *   guarda los metadatos y deja el registro de acceso.
 * - Descargar: `fn_hr_documento_autorizar_descarga` comprueba el permiso, deja
 *   el registro y devuelve la ruta; la URL firmada dura 60 s.
 * Ningún rol de cliente puede leer el bucket directamente.
 *
 * Usa la service role porque el permiso se resuelve en la base con el actor de
 * la sesión y la organización de `getServerOrgContext()`.
 */
import { randomUUID } from 'crypto';
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ContextoHrm } from './datosSensiblesService.server';
import {
  HrmError,
  TAMANO_MAXIMO_DOCUMENTO,
  TIPOS_DOCUMENTO_PERMITIDOS,
  errorDeRpc,
  esCategoriaDocumento,
  esFechaPlana,
  esGrupoDatos,
  esUuid,
  rutaDocumento,
  type ContextoPeticion,
  type GrupoDatos,
} from './tipos';

export const BUCKET_DOCUMENTOS = 'hr-documentos';
export const SEGUNDOS_URL_DESCARGA = 60;

function validarArchivo(mime: string, tamano: number) {
  if (!(TIPOS_DOCUMENTO_PERMITIDOS as readonly string[]).includes(mime)) throw new HrmError(422, 'tipo_no_permitido');
  if (!Number.isInteger(tamano) || tamano <= 0 || tamano > TAMANO_MAXIMO_DOCUMENTO) throw new HrmError(422, 'tamano_no_permitido');
}

export async function crearUrlSubida(
  ctx: ContextoHrm,
  args: { personaId: string; grupo: GrupoDatos; mime: string; tamano: number }
): Promise<{ ruta: string; urlFirmada: string; token: string }> {
  if (!esUuid(args.personaId)) throw new HrmError(400, 'persona_invalida');
  if (!esGrupoDatos(args.grupo)) throw new HrmError(400, 'grupo_invalido');
  validarArchivo(args.mime, args.tamano);
  const db = getServiceClient();
  const { data: puede, error } = await db.rpc('fn_hr_actor_puede_grupo', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: args.personaId,
    p_grupo: args.grupo,
    p_accion: 'editar',
  });
  if (error) throw errorDeRpc(error);
  if (puede !== true) throw new HrmError(403, 'sin_permiso');
  const ruta = rutaDocumento(ctx.organizationId, args.grupo, args.personaId, randomUUID(), args.mime);
  const firmado = await db.storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(ruta);
  if (firmado.error || !firmado.data) throw new HrmError(500, 'error_almacenamiento');
  return { ruta, urlFirmada: firmado.data.signedUrl, token: firmado.data.token };
}

export async function registrarDocumento(
  ctx: ContextoHrm,
  args: {
    personaId: string;
    grupo: GrupoDatos;
    categoria: string;
    ruta: string;
    nombre: string;
    mime: string;
    tamano: number;
    sha256?: string | null;
    venceEl?: string | null;
    vinculoId?: string | null;
  },
  peticion: ContextoPeticion
): Promise<{ id: string }> {
  if (!esUuid(args.personaId)) throw new HrmError(400, 'persona_invalida');
  if (!esGrupoDatos(args.grupo)) throw new HrmError(400, 'grupo_invalido');
  if (!esCategoriaDocumento(args.categoria)) throw new HrmError(422, 'categoria_invalida');
  if (args.venceEl != null && !esFechaPlana(args.venceEl)) throw new HrmError(422, 'fecha_invalida');
  if (args.vinculoId != null && !esUuid(args.vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  validarArchivo(args.mime, args.tamano);
  const { data, error } = await getServiceClient().rpc('fn_hr_documento_registrar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: args.personaId,
    p_grupo: args.grupo,
    p_categoria: args.categoria,
    p_path: args.ruta,
    p_nombre: String(args.nombre ?? '').slice(0, 200) || 'documento',
    p_mime: args.mime,
    p_size: args.tamano,
    p_sha256: args.sha256 ?? null,
    p_valid_until: args.venceEl ?? null,
    p_employment: args.vinculoId ?? null,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
  });
  if (error) throw errorDeRpc(error);
  return data as { id: string };
}

export async function urlDescarga(ctx: ContextoHrm, documentoId: string, peticion: ContextoPeticion): Promise<{ url: string; expiraEnSegundos: number }> {
  if (!esUuid(documentoId)) throw new HrmError(400, 'documento_invalido');
  const db = getServiceClient();
  const { data: ruta, error } = await db.rpc('fn_hr_documento_autorizar_descarga', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_documento: documentoId,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
  });
  if (error) throw errorDeRpc(error);
  if (typeof ruta !== 'string' || !ruta.startsWith(`${ctx.organizationId}/`)) throw new HrmError(404, 'no_existe');
  const firmado = await db.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(ruta, SEGUNDOS_URL_DESCARGA);
  if (firmado.error || !firmado.data) throw new HrmError(500, 'error_almacenamiento');
  return { url: firmado.data.signedUrl, expiraEnSegundos: SEGUNDOS_URL_DESCARGA };
}
